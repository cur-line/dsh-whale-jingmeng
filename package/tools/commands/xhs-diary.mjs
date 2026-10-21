// 她在小红书的潜水日志 —— 与 B 站日记共用同一份人格，但内容各自独立。
//
// 为什么必须独立（而不是复用 whale-diary.md）：
//   小红书和 B 站是两种内容形态：B 站是长视频 + 弹幕，小红书是图文 + 短评论。
//   她看这两类东西的感受不一样，混在一份日记里会互相污染，
//   而且 B 站那套的 "BV 号表格" 在小红书根本对不上。
//
// 文件：
//   ~/.dsh/xhs/diary.md        她的潜水日志（人类可读，她自己也读）
//   ~/.dsh/xhs/draft.md        待发草稿（note --from 直接吃这个格式）
//   ~/.dsh/xhs/pending.json    待批准队列
//
// 用法：
//   node xhs.mjs diary material           把最近读过的整理成素材（只读）
//   node xhs.mjs diary draft              用素材生成一篇草稿（写文件，不发）
//   node xhs.mjs diary gen-image          为待批稿生成「配图提示词清单」（2026-10-21 加）
//   node xhs.mjs diary push               发到手机/飞书给人看（可选）
//   node xhs.mjs diary list               看待批准队列
//   node xhs.mjs diary approve <id>       批准某篇
//   node xhs.mjs diary publish <id>       发出去（走 note --go 的同一套闸门）
//
// 配图流程（2026-10-21 加，老板拍板用 Codex 生成）：
//   draft → gen-image（生成提示词清单到 ~/.dsh/xhs/gen-image-prompts.json）
//   → Agent 侧用 codex_image_generate 按清单生成图到 ~/.dsh/xhs/images/<id>/
//   → attach <id> --images …（回填队列，见下）→ approve → publish
//   node xhs.mjs diary attach <id> --images a.jpg,b.jpg   把生成好的图挂到待批稿
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readEvents, logEvent } from '../lib/event-log.mjs'
import { publishNote, clampNote } from '../lib/xhs-client.mjs'
import * as xhsQuota from '../lib/xhs-quota.mjs'
import { readEntries, writeEntries, lockQueue, createRevision } from '../lib/diary-queue.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const DIR = path.join(process.env.DSH_HOME || path.join(HOME, '.dsh'), 'xhs')
const DIARY = path.join(DIR, 'diary.md')
const DRAFT = path.join(DIR, 'draft.md')
const PENDING = path.join(DIR, 'pending.json')
const GEN_IMG = path.join(DIR, 'gen-image-prompts.json')
const IMG_DIR = path.join(DIR, 'images')

const argv = process.argv.slice(2)
const cmd = argv[0]

function ensureDir() { fs.mkdirSync(DIR, { recursive: true }) }
function readJson(file, fb) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fb } }
function writeJson(file, v) { writeEntries(file, v, true) }
if (['approve', 'publish'].includes(cmd)) {
  const release = lockQueue(PENDING)
  process.once('exit', release)
}
function validate(item) {
  const title = String(item.title || '').trim(), content = String(item.content || '').trim()
  if (!title || title.length > 20 || !content || content.length > 1000) throw new Error('标题需1–20字，正文需1–1000字，请修改后重新审核。')
  if (!Array.isArray(item.images) || item.images.length < 1 || item.images.length > 18) throw new Error('小红书图文需要1–18张图片。')
  for (const file of item.images) if (typeof file !== 'string' || !/\.(jpe?g|png|webp)$/i.test(file) || !fs.existsSync(file)) throw new Error('配图不存在或格式不支持，请修改后重新审核。')
}

if (cmd === 'revise') {
  const idAt = argv.indexOf('--id'), fileAt = argv.indexOf('--file')
  const id = idAt >= 0 ? argv[idAt + 1] : null
  const file = fileAt >= 0 ? argv[fileAt + 1] : null
  if (!id || !file || id.startsWith('--') || file.startsWith('--')) { console.error('用法：xhs diary revise --id <被驳回稿id> --file <本地JSON稿>'); process.exit(2) }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const entry = createRevision(PENDING, { array: true, id, payload })
  console.log(`已保存修订稿：${entry.id}（pending · revisionOf=${entry.revisionOf}）`)
  try { logEvent('xhs-diary-revision', { target: entry.id, note: '驳回后重写，等待重新审核', meta: { revisionOf: entry.revisionOf } }) } catch {}
  process.exit(0)
}

if (cmd === 'material') {
  const rejected = readEntries(PENDING, true).filter(e => e.status === 'rejected').slice(-5)
  for (const item of rejected) console.log(`\n待重写 ${item.id}：${item.reason || '未说明'}\n原稿：${item.title}\n${item.content}`)
  // 从事件流里捞出最近的小红书阅读/互动记录，作为写作原料
  const events = readEvents(400).filter((e) => String(e.kind || '').startsWith('xhs-'))
  const reads = events.filter((e) => e.kind === 'xhs-read').slice(-15).reverse()
  if (!reads.length) {
    console.log('还没有阅读记录。先去读点什么：')
    console.log('  node xhs.mjs feed')
    console.log('  node xhs.mjs read <id> --token <token>')
    process.exit(0)
  }
  console.log(`最近读过的 ${reads.length} 条（可作为写作素材）：\n`)
  reads.forEach((e, i) => {
    console.log(`${i + 1}. ${e.note ?? '(无标题)'}`)
    console.log(`   ${e.at}　${e.meta?.author ?? ''}　评论 ${e.meta?.comments ?? '?'} 条`)
  })
  console.log('\n下一步：node xhs.mjs diary draft（重写稿仍需审核）')
  process.exit(0)
}

if (cmd === 'draft') {
  // 生成一个**空骨架**，让人/她往里填 —— 不自动编造内容
  ensureDir()
  const reads = readEvents(400).filter((e) => e.kind === 'xhs-read').slice(-5).reverse()
  const lines = [
    '# （这里写标题，20 字以内）',
    '',
    '（正文。1000 字以内。她的语气：短句、别铺垫、不总结。）',
    '',
  ]
  if (reads.length) {
    lines.push('<!-- 可参考最近读过的：')
    for (const r of reads) lines.push(`     · ${r.note ?? '(无标题)'} — ${r.meta?.author ?? ''}`)
    lines.push('-->', '')
  }
  lines.push('---', '')
  lines.push('# 分隔线之后每行一张图（绝对路径或相对当前目录）')
  lines.push('# /Users/zengzhen/Pictures/xxx.jpg')
  if (fs.existsSync(DRAFT)) {
    console.log(`${DRAFT} 已存在，没覆盖。`)
    console.log('要重来就先删掉它。')
    process.exit(1)
  }
  fs.writeFileSync(DRAFT, lines.join('\n'))
  console.log(`草稿骨架已写：${DRAFT}`)
  console.log('填完用：node xhs.mjs note --from ' + DRAFT + ' --dry')
  process.exit(0)
}

if (cmd === 'gen-image') {
  // 为「待批/已批但缺图」的稿生成配图提示词清单，落盘给 Agent 侧 Codex 用。
  // 角色设定（鲸檬，AI 品牌角色素材库见 ~/Pictures/工作素材/AI品牌角色/DeepSeek_鲸鱼娘_小.png）
  const pending = readEntries(PENDING, true)
  const targets = pending.filter((p) => p.status === 'pending' || p.status === 'approved')
  if (!targets.length) { console.log('待批准队列里没有要配图的稿。'); process.exit(0) }
  const out = targets.map((p) => {
    const title = String(p.title || '').trim()
    const content = String(p.content || '').trim()
    const lines = content.split(/\n/).map((l) => l.trim()).filter(Boolean)
    const firstLine = lines[0] || ''
    return {
      id: p.id,
      title,
      images: (p.images || []).length,
      prompt: [
        `小红书图文配图（方形 1:1），主角是「鲸檬」——一只住在深海、性格傲娇嘴硬心软的幼年鲸鱼娘（参考角色立绘：幼年版三视图，白/蓝鲸尾，圆脸大眼睛）。`,
        `这篇日记的主题：${title}。${firstLine ? '开头是：' + firstLine : ''}`,
        '要求：画面干净、有生活感、像鲸鱼娘随手拍的一天；不写字、不加水印；色调柔和、小红书风格。',
      ].join('\n'),
    }
  })
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(GEN_IMG, JSON.stringify({ generatedAt: new Date().toISOString(), items: out }, null, 2))
  console.log(`✓ 配图提示词清单已生成：${GEN_IMG}`)
  console.log(`  共 ${out.length} 篇待配图。`)
  console.log('下一步（Agent 侧）：用 codex_image_generate 按清单生成图到 ' + IMG_DIR + '/<id>/，然后：')
  console.log('  node xhs.mjs diary attach <id> --images <图路径1,图路径2…>')
  process.exit(0)
}

if (cmd === 'attach') {
  // 把生成好的图挂到待批稿（生成动作在 Agent 侧，这里只登记 + 校验）
  // 支持：attach <id> --images a.jpg,b.jpg 或 attach --id <id> --images …
  const idAt = argv.indexOf('--id')
  let id = idAt >= 0 ? argv[idAt + 1] : null
  if (!id && argv.length >= 2 && !argv[1].startsWith('--')) id = argv[1]
  const imgAt = argv.indexOf('--images')
  const images = imgAt >= 0 ? argv[imgAt + 1] : ''
  if (!id || id.startsWith('--') || !images || images.startsWith('--')) { console.error('用法：node xhs.mjs diary attach <id> --images a.jpg,b.jpg'); process.exit(2) }
  const list = images.split(',').map((s) => s.trim()).filter(Boolean)
  if (!list.length || list.length > 18) { console.error(`配图需 1-18 张，收到 ${list.length} 张`); process.exit(2) }
  const missing = list.filter((p) => !fs.existsSync(p))
  if (missing.length) { console.error(`以下配图不存在：${missing.join(', ')}`); process.exit(2) }
  const badExt = list.filter((p) => !/\.(jpe?g|png|webp)$/i.test(p))
  if (badExt.length) { console.error(`配图格式不支持（需 jpg/png/webp）：${badExt.join(', ')}`); process.exit(2) }
  const release = lockQueue(PENDING)
  try {
    const pending = readEntries(PENDING, true)
    const item = pending.find((p) => String(p.id) === String(id))
    if (!item) { console.error(`队列里没有 ${id}`); process.exit(1) }
    if (!['pending', 'approved'].includes(item.status)) { console.error('仅待审/已批稿可挂图。'); process.exit(2) }
    item.images = [...list]
    writeJson(PENDING, pending)
    console.log(`✓ 已给 ${item.title} 挂上 ${list.length} 张图`)
    console.log(item.status === 'approved' ? '下一步：node xhs.mjs diary publish ' + id : '下一步：node xhs.mjs diary approve ' + id)
    try { logEvent('xhs-diary-images', { target: id, note: `挂配图 ${list.length} 张（Codex 生成）` }) } catch {}
  } finally { release() }
  process.exit(0)
}

if (cmd === 'list') {
  const pending = readEntries(PENDING, true)
  if (!pending.length) { console.log('待批准队列是空的。'); process.exit(0) }
  console.log(`待批准 ${pending.length} 篇：\n`)
  for (const p of pending) {
    console.log(`  ${p.id}　${p.status === 'approved' ? '[已批准]' : '[待批]'}　${p.title}`)
    console.log(`     ${p.createdAt}　${p.chars} 字　图 ${p.images?.length ?? 0} 张`)
  }
  process.exit(0)
}

if (cmd === 'approve') {
  const id = argv[1]
  if (!id) { console.error('用法：node xhs.mjs diary approve <id>'); process.exit(2) }
  const pending = readEntries(PENDING, true)
  const item = pending.find((p) => String(p.id) === String(id))
  if (!item) { console.error(`队列里没有 ${id}`); process.exit(1) }
  if (item.status !== 'pending') { console.error('仅待审稿可批准。'); process.exit(2) }
  validate(item)
  item.status = 'approved'
  item.approvedAt = new Date().toISOString()
  writeJson(PENDING, pending)
  console.log(`✓ 已批准：${item.title}`)
  console.log(`发送：node xhs.mjs diary publish ${id}`)
  process.exit(0)
}

if (cmd === 'publish') {
  const id = argv[1]
  if (!id) { console.error('用法：node xhs.mjs diary publish <id>'); process.exit(2) }
  const pending = readEntries(PENDING, true)
  const item = pending.find((p) => String(p.id) === String(id))
  if (!item) { console.error(`队列里没有 ${id}`); process.exit(1) }
  // 绝不自行越过审批 —— 必须显式 approve 过
  if (item.status !== 'approved') {
    console.error(`✗ ${id} 还没批准。先跑：node xhs.mjs diary approve ${id}`)
    process.exit(2)
  }
  validate(item)
  const q = xhsQuota.check('note')
  if (!q.ok) { console.error(`✗ ${q.reason}`); process.exit(2) }
  const c = clampNote(item.title, item.content)
  try {
    const r = await publishNote(c.title, c.content, item.images ?? [])
    const noteId = r?.note_id ?? r?.id ?? r?.noteId ?? ''
    console.log(`✓ 已发布${noteId ? '：' + noteId : ''}`)
    item.status = noteId ? 'published' : 'publish-unknown'
    item.publishedAt = new Date().toISOString()
    item.noteId = noteId
    writeJson(PENDING, pending)
    if (!noteId) { console.error('服务未返回笔记ID，发布结果待核实。稿件保留，请勿重复发布。'); process.exit(1) }
    try { xhsQuota.record('note', c.title) } catch {}
    try { logEvent('xhs-note', { target: noteId, note: `发布日记「${c.title}」` }) } catch {}
  } catch (e) {
    console.error(`✗ 发布失败：${e.message}`)
    if (e.hint?.()) console.error(`→ ${e.hint()}`)
    process.exit(1)
  }
  process.exit(0)
}

if (cmd === 'push') {
  console.log('push 需要飞书/通知通道，当前未配置小红书专属通道。')
  console.log('现有 B 站那套：node tools/commands/notify.mjs')
  console.log('（先不假装有，等确认走哪条通道再接）')
  process.exit(1)
}

// 默认 / 无参数：打印现状
ensureDir()
console.log('她的潜水日志\n')
if (fs.existsSync(DIARY)) {
  const t = fs.readFileSync(DIARY, 'utf8')
  console.log(`  ${DIARY}（${t.length} 字）`)
} else {
  console.log('  还没有日记。读几条之后：node xhs.mjs diary draft')
}
const pending = readEntries(PENDING, true)
const waiting = pending.filter((p) => p.status !== 'published').length
console.log(`  待批准：${waiting} 篇`)
console.log('\n可用：material / draft / revise --id <id> --file <JSON稿> / list / approve / publish')
