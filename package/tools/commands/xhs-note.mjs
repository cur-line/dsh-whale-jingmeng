// 发图文笔记 —— 会真的发出去，闸门与 interact 同级。
//
// 硬约束（小红书官方口径，超了直接被拒）：
//   · 标题 ≤20 字
//   · 正文 ≤1000 字
//   · 图片 1–18 张，本地路径，格式 jpg/jpeg/png/webp
//
// 用法：
//   node xhs.mjs note --title "…" --content "…" --images a.jpg,b.jpg --dry
//   node xhs.mjs note --title "…" --content "…" --images a.jpg,b.jpg --go
//   node xhs.mjs note --from ~/.dsh/xhs/draft.md --dry     # 从草稿文件读
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { publishNote, clampNote, LIMITS, XhsError } from '../lib/xhs-client.mjs'
import { appendCompliance } from '../lib/compliance.mjs'
import * as xhsQuota from '../lib/xhs-quota.mjs'
import { logEvent } from '../lib/event-log.mjs'
import { config } from '../lib/config.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const k = a.slice(2)
  const v = argv[i + 1]
  if (v && !v.startsWith('--')) { opt[k] = v; i += 1 } else { opt[k] = true }
}

const DRY = !!opt.dry
const GO = !!opt.go
const FROM = typeof opt.from === 'string' ? opt.from : ''

function die(msg, code = 2) {
  console.error(msg)
  process.exit(code)
}

if (!DRY && !GO) {
  die([
    '⚠️  必须显式选择模式 —— 发布是有副作用的，不给默认值。',
    '   node xhs.mjs note --title "…" --content "…" --images a.jpg --dry    # 只打印',
    '   node xhs.mjs note --title "…" --content "…" --images a.jpg --go     # 真的发',
  ].join('\n'))
}
if (DRY && GO) die('--dry 和 --go 不能同时给。')

// ── 取标题/正文：优先 --from 草稿文件 ──
let title = typeof opt.title === 'string' ? opt.title : ''
let content = typeof opt.content === 'string' ? opt.content : ''
let imagesRaw = typeof opt.images === 'string' ? opt.images : ''

if (FROM) {
  let text
  try {
    text = fs.readFileSync(FROM, 'utf8')
  } catch (e) {
    die(`读不到草稿文件 ${FROM}：${e.message}`, 1)
  }
  // 约定：第一行 # 标题，其余为正文；--- 之后可写图片路径，一行一个
  const lines = text.split(/\r?\n/)
  const tIdx = lines.findIndex((l) => /^#\s+/.test(l))
  if (tIdx >= 0) {
    title = title || lines[tIdx].replace(/^#\s+/, '').trim()
    lines.splice(tIdx, 1)
  }
  const sep = lines.findIndex((l) => /^---\s*$/.test(l))
  let bodyLines = lines
  if (sep >= 0) {
    const tail = lines.slice(sep + 1).map((s) => s.trim()).filter(Boolean)
    if (!imagesRaw && tail.length) imagesRaw = tail.join(',')
    bodyLines = lines.slice(0, sep)
  }
  content = content || bodyLines.join('\n').trim()
}

if (!title.trim()) die('缺标题：--title "…" 或草稿里用 "# 标题" 开头')
if (!content.trim()) die('缺正文：--content "…" 或草稿里写正文')

// ── 分享定向主号提及（2026-10-21 加，老板定：发笔记/日记时正文开头带 @提及）──
// 读配置 xhs.mentionOwner：enabled + name 都满足才加；正文里已带过就不重复。
// 放在 clamp 之前加，让提及一起参与字数统计（也避免 clamp 后截断把提及挤掉）。
try {
  const cfg = config()
  const m = cfg.xhs?.mentionOwner
  const who = (m?.name ?? '').trim()
  const at = who && !who.startsWith('@') ? '@' + who : who
  if (m?.enabled && at && !content.includes(at)) {
    content = `${at} ${content}`
    console.log(`[分享定向] ✓ 正文已带 @提及「${at}」（分享给小红书主号）`)
  }
} catch (e) {
  // 配置读不出来就按普通发，不阻塞发布
  console.error(`⚠️ 读分享定向配置失败，按普通笔记发：${e.message}`)
}

// ── 长度：先截断并明确告知，不静默丢字 ──
const clamped = clampNote(title, content)
if (clamped.truncatedTitle) {
  console.error(`⚠️ 标题超 ${LIMITS.title} 字，已截断到：「${clamped.title}」`)
}
if (clamped.truncatedContent) {
  console.error(`⚠️ 正文超 ${LIMITS.content} 字，已截断到 ${LIMITS.content} 字（原 ${content.length} 字）`)
}

// ── 图片：必须真实存在，缺一张就整单不发 ──
const images = imagesRaw.split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
  const abs = p.startsWith('~') ? path.join(HOME, p.slice(1)) : path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
  return abs
})
if (!images.length) die('缺图片：--images a.jpg,b.jpg（小红书图文笔记至少要 1 张图）')
if (images.length > 18) die(`图片 ${images.length} 张，超过小红书上限 18 张`)
const missing = images.filter((p) => !fs.existsSync(p))
if (missing.length) {
  die(`这些图片找不到：\n${missing.map((p) => '  ' + p).join('\n')}\n（不确定文件在不在就不发，避免发出去半截）`, 1)
}
const badExt = images.filter((p) => !/\.(jpe?g|png|webp)$/i.test(p))
if (badExt.length) {
  console.error(`⚠️ 这些不是 jpg/png/webp，平台可能拒收：\n${badExt.map((p) => '  ' + path.basename(p)).join('\n')}`)
}

// ── 限额闸：发布是单独一类额度（配置 xhs.shareDaily，默认 1 篇/天）──
let q = { ok: true, used: 0, limit: 0, reason: '' }
try {
  q = xhsQuota.check('note')
} catch (e) {
  die(`限额闸异常：${e.message}`, 1)
}
if (!q.ok) die(`✗ ${q.reason}\n  今日已发 ${q.used}/${q.limit}。日记可以照写，笔记明天再发。`, 2)
console.log(`[限额闸] ✓ 发布 ${q.used}/${q.limit}（小红书独立账本）`)

// ── 待审（2026-10-21 老板要求：小红书图文也要审批）─────────────────
//   跟评论一个口径：--draft 写草稿进队列 → 主人在养鱼页点「发」才发；
//   --go 必须带 --approved <id>（且草稿真在队列里），否则拒。
const DRAFT = !!opt.draft
const APPROVED = typeof opt.approved === 'string' ? opt.approved : ''
const PENDING_NOTES = path.join(HOME, '.dsh', 'xhs', 'pending-notes.json')
const readNotes = () => { try { return JSON.parse(fs.readFileSync(PENDING_NOTES, 'utf8')).items ?? [] } catch { return [] } }
const writeNotes = (items) => { fs.mkdirSync(path.dirname(PENDING_NOTES), { recursive: true }); fs.writeFileSync(PENDING_NOTES, JSON.stringify({ items }, null, 2) + '\n') }
if (DRAFT) {
  if (GO) die('--draft 不能和 --go 同时给（--draft 就是写草稿、先不发）。')
  const items = readNotes()
  const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  items.push({ id, platform: 'xhs-note', title: clamped.title, content: clamped.content, images: images.map(String), at: new Date().toISOString() })
  writeNotes(items)
  console.log(`✓ 已写进待审队列（id ${id}）—— 等主人在「养鱼 → 待审核」点「发」`)
  process.exit(0)
}
if (GO && !APPROVED) {
  die('✗ 小红书图文必须先过审（老板 2026-10-21 定的硬规矩）\n  正确姿势：加 --draft 写草稿 → 主人在「养鱼 → 待审核」点「发」\n  面板点「发」时插件会自动带上 --approved <id> ✓', 3)
}
if (APPROVED && !readNotes().some((it) => String(it.id) === APPROVED)) {
  die(`✗ --approved ${APPROVED} 不在待审队列里（可能已发或被删）→ 拒绝发送`, 3)
}

// ── 干跑 ──
if (DRY) {
  console.log('[--dry 只打印，什么都没发]\n')
  console.log(`标题（${clamped.title.length}/${LIMITS.title} 字）：${clamped.title}`)
  console.log()
  console.log(`正文（${clamped.content.length}/${LIMITS.content} 字）：`)
  // dry 预览也要展示"最终会发什么"（含合规三句），不然 --dry 与 --go 看到的不一样 ✗
  const preview = process.argv.includes('--no-compliance') ? clamped.content : appendCompliance(clamped.content, { auto: true })
  console.log(preview)
  console.log()
  console.log(`图片 ${images.length} 张：`)
  images.forEach((p, i) => {
    const kb = (fs.statSync(p).size / 1024).toFixed(0)
    console.log(`  ${i + 1}. ${path.basename(p)}  (${kb} KB)`)
  })
  console.log()
  console.log('确认无误就换成 --go。')
  process.exit(0)
}

// ── 真发 ──
// 合规三句（2026-10-21 老板确认）：插件里发布的小红书内容**默认**带上；
// 不想带就加 --no-compliance（比如你当场手动发的那篇）。
const noteContent = process.argv.includes('--no-compliance')
  ? clamped.content
  : appendCompliance(clamped.content, { auto: true })
console.log(`正在发布「${clamped.title}」…`)
let result
try {
  result = await publishNote(clamped.title, noteContent, images)
} catch (e) {
  console.error(`✗ 发布失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  if (/验证|风控|频繁|too many|captcha|risk/i.test(e.message)) {
    console.error('  ⚠️ 撞上风控信号。立即停手：不重试、不换号、不改设备。')
    try { logEvent('risk', { note: `小红书发布被风控: ${e.message}` }) } catch {}
  }
  try { logEvent('error', { note: `小红书发布失败: ${e.message}` }) } catch {}
  process.exit(1)
}

const noteId = result?.note_id ?? result?.id ?? result?.noteId ?? ''
console.log(`✓ 已发布${noteId ? '：' + noteId : ''}`)
if (!noteId) console.log('  （服务没回笔记 id，去 App 里确认一下）')

// 记账 + 日志
try { xhsQuota.record('note', clamped.title) } catch {}
try {
  logEvent('xhs-note', {
    target: noteId,
    note: `发布笔记「${clamped.title}」`,
    meta: { chars: clamped.content.length, images: images.length },
  })
} catch {}
