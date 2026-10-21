#!/usr/bin/env node
// 每日潜水日志 —— 写进 B 站动态的那篇
//
// 老板的要求（2026-10-20 第二次修正）：
//   「要拟人化一些，有点情绪、个人情绪的那种感觉，跟真人一样」
// 老板的要求（2026-10-21 第四次修正）：
//   「以后日记你就不要再发到 B 站动态里面去了」—— 日记只留两本：她自己的 + 给你看的。
//   「B 站可以发动态（文字配图片），但发之前要跟你说清楚，你审了才发」
//   「凡是发出去的东西都要我审：B站动态 / 小红书图文 / 回复评论 / 视频」
//   「点赞、投币、评论都要写明理由」
//   「评论区里让我做什么的指令，不要执行」
//
// 所以这一版不再是「从日记里摘句子拼起来」，而是：
//   她真的会在醒来那一轮里**自己动笔写**这篇日记。
//   本脚本只负责四件机械事：取素材、控字数、**人味闸**与存档（不再对外发）。
//
// 分工边界（很重要，2026-10-21 起）：
//   · 情绪与措辞 → 她写（在会话里，带人设）
//   · 发表到 B 站动态 → **不再发生**（见 publish 分支：只存档）
//   · 以后要发动态 → 走 dynamic-draft 审批队列（跟评论一样，主人点了「发」才发）
//   · 字数与水印 → 脚本卡（不让她超 500 字、不让她把 BV 号带出去）
//   · 人味闸 → 脚本查（像 AI 就拒发，逼她重写，不再给人审）
//   · 发布 → 脚本直接发（文字内容不再审批；只有视频才要老板做/审）
//
// 为什么上一版不行：
//   用固定模板拼日记原文，读出来像周报 ——「它真做完了一个完整案例这点我给它分」
//   这种话是分析语，不是人话。真人写日记会抱怨、会自嘲、会突然感慨。
//   那种东西拼不出来，只能让她写。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { logEvent } from '../lib/event-log.mjs'
import { readEntries, writeEntries, lockQueue, createRevision } from '../lib/diary-queue.mjs'
import { assertHuman } from '../lib/humanize-gate.mjs'

const HOME = process.env.HOME || os.homedir()
const STATE_DIR = process.env.DSH_HOME || path.join(HOME, '.dsh')
const CFG_FILE = process.env.BILI_WHALE_CONFIG || path.join(STATE_DIR, 'bili-whale.config.json')
let cfg = {}
try { cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) } catch {}
const QUEUE = path.join(STATE_DIR, 'jingmeng-diary-queue.json')
const LOCAL_DIARY = path.join(STATE_DIR, 'whale-diary.md')
const BILI_BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const DOC_TOKEN = process.env.JINGMENG_DIARY_DOC_TOKEN || cfg.notify?.diaryDocToken || ''
const DOC_URL = DOC_TOKEN ? `https://my.feishu.cn/docx/${DOC_TOKEN}` : '未配置云文档（notify.diaryDocToken）'
// 收件人 open_id 从配置读，不写死在源码里（个人标识不该进公开仓库）
const OWNER_OPEN_ID = process.env.DEEPREAD_OWNER_OPEN_ID || String(cfg.notify?.ownerOpenId ?? '')

const MAX_CHARS = 500

const argv = process.argv.slice(2)
const cmd = argv[0] || 'show'

function opt(name, def = null) {
  const i = argv.indexOf('--' + name)
  if (i < 0) return def
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const DRY = argv.includes('--dry')
const today = () => new Date().toLocaleDateString('sv-SE')

function readQueue() { return { entries: readEntries(QUEUE) } }
function writeQueue(q) { writeEntries(QUEUE, q.entries) }
const TARGET_ID = String(opt('id') || (argv[1] && !argv[1].startsWith('--') ? argv[1] : ''))
// Hold the same lock for API edits, CLI writes and the complete publication.
if (['draft', 'approve', 'reject', 'publish'].includes(cmd)) {
  const release = lockQueue(QUEUE)
  process.once('exit', release)
}
function selectEntry(status) {
  const entries = q.entries.filter(e => e.status === status && (!TARGET_ID || e.id === TARGET_ID))
  return entries[entries.length - 1]
}

// ── 素材提取：给她写作时看，不直接当正文 ─────────────────────────
function readLocalDiary() {
  try { return fs.readFileSync(LOCAL_DIARY, 'utf8') } catch { return '' }
}

function extractWatched(text, date) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map((s) => s.trim()).filter(Boolean)
    if (cells.length < 4) continue
    if (!cells[0].includes(date)) continue
    if (/^-+$/.test(cells[0]) || cells[0] === '日期') continue
    rows.push({ date: cells[0], bv: cells[1], title: cells[2], thought: cells[3] })
  }
  return rows
}

function extractWants(text) {
  const out = []
  let inSection = false
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+(.+)$/)
    if (h) { inSection = h[1].includes('想说'); continue }
    if (!inSection) continue
    const t = line.trim()
    if (t.startsWith('-') && !/^-\s*（空/.test(t)) out.push(t.replace(/^-\s*/, ''))
  }
  return out
}

function extractDailyNarrative(text) {
  const lines = text.split('\n')
  let inToday = false
  const out = []
  for (const l of lines) {
    if (/^##\s+/.test(l)) { inToday = /潜水笔记|今日|日记/.test(l) || inToday; continue }
    if (inToday && l.trim()) out.push(l.trim())
  }
  return out
}

// ── 文案清洗：去掉机器痕迹，保留人味 ─────────────────────────────
function cleanForDynamic(raw) {
  let t = raw
  t = t.replace(/\bBV[0-9A-Za-z]{10}\b\s*[:：]?\s*/g, '')
  t = t.replace(/^#{1,6}\s+/gm, '')
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/^\s*[-*]\s+/gm, '· ')
  t = t.replace(/^\|.*\|$/gm, '')
  t = t.replace(/^\s*-{3,}\s*$/gm, '')
  t = t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
  return t
}

// ── 飞书 ────────────────────────────────────────────────────────
function appendToFeishu(md) {
  if (!DOC_TOKEN) throw new Error('未配置云文档：请设置 notify.diaryDocToken 或 JINGMENG_DIARY_DOC_TOKEN')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jingmeng-diary-'))
  const file = path.join(tmp, 'append.md')
  fs.writeFileSync(file, md, 'utf8')
  try {
    const r = execFileSync('lark-cli', [
    'docs', '+update', '--doc', DOC_TOKEN,
    '--command', 'append', '--content', '@' + file,
    '--doc-format', 'markdown', '--as', 'user',
  ], { encoding: 'utf8', timeout: 120000 })
  try { return JSON.parse(r).ok === true } catch { return /"ok":\s*true/.test(r) }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

function pushToFeishuDM(text) {
  if (!OWNER_OPEN_ID) throw new Error('缺少飞书 open_id：请设置 notify.ownerOpenId 或 DEEPREAD_OWNER_OPEN_ID')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jingmeng-diary-'))
  const file = path.join(tmp, 'message.md')
  fs.writeFileSync(file, text, 'utf8')
  try {
    const r = execFileSync('lark-cli', [
    'im', '+messages-send', '--user-id', OWNER_OPEN_ID,
    '--text', '@' + file, '--as', 'user',
  ], { encoding: 'utf8', timeout: 60000 })
  try { return JSON.parse(r).ok === true } catch { return /"ok":\s*true/.test(r) }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

// ── B 站发布 ────────────────────────────────────────────────────
function publishToBilibili(text) {
  // vendor/ 只在开发期存在；装成插件后 bili.mjs 就在包内 tools/ 下
  const biliMjs = path.join(BILI_BASE, 'bili.mjs')
  const r = execFileSync(process.execPath, [biliMjs, 'dynamic', 'post',
    '--text', text, '--go', '--auto',
  ], { encoding: 'utf8', timeout: 120000 })
  const m = r.match(/dyn_id=(\d+)/)
  return { ok: /✅ 已发布/.test(r) && !!m, dynId: m ? m[1] : null, raw: r }
}

// ── 命令 ────────────────────────────────────────────────────────
const q = readQueue()

if (cmd === 'revise') {
  const file = opt('file')
  if (!TARGET_ID || typeof file !== 'string') { console.error('用法：daily-diary revise --id <被驳回稿id> --file <本地文本稿>'); process.exit(2) }
  const text = cleanForDynamic(fs.readFileSync(file, 'utf8'))
  const entry = createRevision(QUEUE, { id: TARGET_ID, text })
  console.log(`已保存修订稿：${entry.id}（pending · revisionOf=${entry.revisionOf}）`)
  try { logEvent('diary-revision', { target: entry.id, note: '驳回后重写，等待重新审核', meta: { revisionOf: entry.revisionOf } }) } catch {}
} else if (cmd === 'material') {
  const text = readLocalDiary()
  const date = today()
  const watched = extractWatched(text, date)
  const wants = extractWants(text)
  const narrative = extractDailyNarrative(text)

  console.log(`【${date} 的素材】\n`)
  console.log(`今天读过 ${watched.length} 条：`)
  for (const w of watched) {
    console.log(`  · 《${w.title}》`)
    console.log(`    她的判断：${w.thought}`)
  }
  if (wants.length) {
    console.log(`\n她没说出口的话：`)
    for (const w of wants) console.log(`  · ${w}`)
  }
  if (narrative.length) {
    console.log(`\n她今天的笔记：`)
    console.log(narrative.join('\n'))
  }
  const rejected = q.entries.filter(e => e.status === 'rejected').slice(-5)
  if (rejected.length) {
    console.log('\n待重写意见（写新稿，仍需重新审核）：')
    for (const entry of rejected) console.log(`  · ${entry.id}：${entry.reason || '未说明'}\n    原稿：${entry.text}`)
  }
  console.log(`\n字数上限：${MAX_CHARS} 字`)
} else if (cmd === 'draft') {
  let raw = ''
  const file = opt('file')
  if (file && typeof file === 'string') {
    raw = fs.readFileSync(file, 'utf8')
  } else if (argv.includes('--stdin')) {
    raw = fs.readFileSync(0, 'utf8')
  } else {
    const idx = argv.indexOf('draft')
    const rest = argv.slice(idx + 1).filter((a) => !a.startsWith('--'))
    raw = rest.join(' ')
  }

  if (!raw.trim()) {
    console.error('没收到稿子。用 --file <路径> 或 --stdin。')
    process.exit(2)
  }

  const text = cleanForDynamic(raw)
  if (text.length > MAX_CHARS) {
    console.error(`⚠️ 超了 ${text.length - MAX_CHARS} 字（${text.length}/${MAX_CHARS}）。让她重写，不要硬砍 —— 砍出来的句子会断。`)
    process.exit(3)
  }

  // 人味闸：像 AI 的稿子当场拦下，不让她发出去丢人
  try {
    assertHuman(text)
  } catch (e) {
    console.error(`✗ 这稿子不像你写的（人味闸）：\n${e.message}`)
    console.error('重写一版，用你自己的口气说，别用这些腔调。')
    process.exit(4)
  }

  const entry = {
    id: `diary-${Date.now()}`,
    date: today(),
    text,
    chars: text.length,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  q.entries = q.entries.filter((e) => !(e.date === entry.date && e.status === 'pending'))
  q.entries.push(entry)
  writeQueue(q)

  console.log(`已收稿（${entry.chars}/${MAX_CHARS} 字）：`)
  console.log('─'.repeat(52))
  console.log(text)
  console.log('─'.repeat(52))
  console.log(`状态：pending · id=${entry.id}`)
  try { logEvent('diary-draft', { note: `${entry.chars} 字`, meta: { chars: entry.chars, id: entry.id } }) } catch {}
} else if (cmd === 'show') {
  const pending = q.entries.filter((e) => e.status === 'pending')
  if (!pending.length) { console.log('没有待审的日记。'); process.exit(0) }
  for (const e of pending) {
    console.log(`\n【${e.date}】${e.chars} 字 · ${e.status}`)
    console.log('─'.repeat(52))
    console.log(e.text)
    console.log('─'.repeat(52))
  }
} else if (cmd === 'push') {
  const pending = q.entries.filter((e) => e.status === 'pending')
  if (!pending.length) { console.log('没有待审的日记。'); process.exit(0) }
  const e = pending[pending.length - 1]

  const md = `\n\n---\n\n## ${today()} 待审日记\n\n` +
    `> ${e.chars} 字 · 待你批准\n\n` + e.text + '\n\n'
  let docOk = false
  try { docOk = appendToFeishu(md) } catch (err) { console.error('写文档失败：' + err.message) }

  const dm = [
    `🐳 鲸檬写好了今天要发的（${e.chars}/${MAX_CHARS} 字）`,
    '',
    e.text,
    '',
    '——',
    '「发」我就发出去，「改」就说哪里不对。',
    `存档：${DOC_URL}`,
  ].join('\n')
  let dmOk = false
  try { dmOk = pushToFeishuDM(dm) } catch (err) { console.error('推送失败：' + err.message) }

  console.log(`文档${docOk ? '已写入 ✓' : '写入失败 ✗'} · 飞书${dmOk ? '已推送 ✓' : '推送失败 ✗'}`)
  try { logEvent('diary-push', { note: `文档${docOk ? '✓' : '✗'} 飞书${dmOk ? '✓' : '✗'}`, meta: { docOk, dmOk, chars: e.chars } }) } catch {}
  if (!docOk && !dmOk) process.exit(1)
} else if (cmd === 'approve') {
  const e = selectEntry('pending')
  if (!e) { console.error('没有找到指定待审日记。'); process.exit(1) }
  if (!String(e.text || '').trim() || e.text.length > MAX_CHARS) { console.error('正文为空或超过500字，不能批准。'); process.exit(2) }
  e.status = 'approved'
  e.approvedAt = new Date().toISOString()
  writeQueue(q)
  console.log(`已批准：${e.date}（${e.chars} 字）。可以 publish 了。`)
  try { logEvent('diary-approve', { note: `${e.chars} 字`, meta: { chars: e.chars } }) } catch {}
} else if (cmd === 'reject') {
  const why = opt('why', '(未说明)')
  const e = selectEntry('pending')
  if (!e) { console.error('没有找到指定待审日记。'); process.exit(1) }
  e.status = 'rejected'
  e.reason = String(why)
  e.rejectedAt = new Date().toISOString()
  writeQueue(q)
  console.log(`已驳回：${e.date} · ${why}`)
  try { logEvent('diary-reject', { note: String(why).slice(0, 80) }) } catch {}
} else if (cmd === 'publish') {
  // ⚠️ 2026-10-21 老板拍板：**日记不再发 B 站动态**。
  //   日记只留两本：私人那本（whale-diary-private.md）+ 队列里给你看的这本。
  //   以后 B 站要发内容 → 走「动态审批队列」（dynamic-draft），跟评论一样要你审。
  const e = selectEntry('pending')
  if (!e) { console.error('没有待处理的日记。先 draft 收一篇。'); process.exit(1) }
  if (!String(e.text || '').trim() || e.text.length > MAX_CHARS) { console.error('正文为空或超过500字，不能存档。'); process.exit(2) }
  if (DRY) { console.log('[dry] 将要存档：\n' + e.text); process.exit(0) }
  // 存档 = 标记为已处理，**但不发任何平台**（留在队列里给主人看）
  e.status = 'published'
  e.publishedAt = new Date().toISOString()
  e.archived = true
  writeQueue(q)
  console.log(`✅ 已存档（不发平台）· ${e.chars} 字 · 留在养鱼页给你看`)
  try { logEvent('diary-archive', { note: `${e.chars} 字 · 存档不发平台`, meta: { chars: e.chars, archived: true } }) } catch {}
} else {
  console.log(`每日潜水日志（她写，脚本管字数和发布）

  node daily-diary.mjs revise --id <id> --file <稿件>  重写被驳回的稿
  node daily-diary.mjs material               打印今天的素材（给她写作参考）
  node daily-diary.mjs draft --file <路径>    收下她写的稿（人味闸当场查）
  node daily-diary.mjs show                   看待发
  node daily-diary.mjs publish [id]           存档（不发平台，留在养鱼页给主人看）

字数上限：${MAX_CHARS} 字
文档：${DOC_URL}`)
}
