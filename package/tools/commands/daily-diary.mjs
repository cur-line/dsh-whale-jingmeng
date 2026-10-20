#!/usr/bin/env node
// 每日潜水日志 —— 写进 B 站动态的那篇
//
// 老板的要求（2026-10-20 第二次修正）：
//   「要拟人化一些，有点情绪、个人情绪的那种感觉，跟真人一样」
//
// 所以这一版不再是「从日记里摘句子拼起来」，而是：
//   她真的会在醒来那一轮里**自己动笔写**这篇动态。
//   本脚本只负责三件机械事：取素材、控字数、走审核与发布。
//
// 分工边界（很重要）：
//   · 情绪与措辞 → 她写（在会话里，带人设）
//   · 字数与水印 → 脚本卡（不让她超 500 字、不让她把 BV 号带出去）
//   · 审核与发布 → 脚本做（老板点头才发）
//
// 为什么上一版不行：
//   用固定模板拼日记原文，读出来像周报 ——「它真做完了一个完整案例这点我给它分」
//   这种话是分析语，不是人话。真人写日记会抱怨、会自嘲、会突然感慨。
//   那种东西拼不出来，只能让她写。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { logEvent } from '../lib/event-log.mjs'

const HOME = process.env.HOME || os.homedir()
const STATE_DIR = path.join(HOME, '.dsh')
const QUEUE = path.join(STATE_DIR, 'jingmeng-diary-queue.json')
const LOCAL_DIARY = path.join(STATE_DIR, 'whale-diary.md')
const BILI_BASE = path.join(path.dirname(new URL(import.meta.url).pathname), '..')

const DOC_TOKEN = '__DIARY_DOC_TOKEN__'
const DOC_URL = `https://my.feishu.cn/docx/${DOC_TOKEN}`
// 收件人 open_id 从配置读，不写死在源码里（个人标识不该进公开仓库）
const OWNER_OPEN_ID = (() => {
  if (process.env.DEEPREAD_OWNER_OPEN_ID) return process.env.DEEPREAD_OWNER_OPEN_ID
  try {
    const c = JSON.parse(fs.readFileSync(path.join(HOME, '.dsh', 'bili-whale.config.json'), 'utf8'))
    return String(c?.notify?.ownerOpenId ?? '')
  } catch { return '' }
})()
if (!OWNER_OPEN_ID) {
  console.error('缺少飞书 open_id：在 ~/.dsh/bili-whale.config.json 的 notify.ownerOpenId 填一个，或设 DEEPREAD_OWNER_OPEN_ID。')
  process.exit(2)
}

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

function readQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE, 'utf8')) } catch { return { entries: [] } }
}
function writeQueue(q) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(QUEUE, JSON.stringify(q, null, 2), 'utf8')
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
  const tmp = '/tmp/jingmeng-diary-append.md'
  fs.writeFileSync(tmp, md, 'utf8')
  const r = execFileSync('lark-cli', [
    'docs', '+update', '--doc', DOC_TOKEN,
    '--command', 'append', '--content', '@' + tmp,
    '--doc-format', 'markdown', '--as', 'user',
  ], { encoding: 'utf8', timeout: 120000 })
  try { return JSON.parse(r).ok === true } catch { return /"ok":\s*true/.test(r) }
}

function pushToFeishuDM(text) {
  const tmp = '/tmp/jingmeng-diary-dm.md'
  fs.writeFileSync(tmp, text, 'utf8')
  const r = execFileSync('lark-cli', [
    'im', '+messages-send', '--user-id', OWNER_OPEN_ID,
    '--text', '@' + tmp, '--as', 'user',
  ], { encoding: 'utf8', timeout: 60000 })
  try { return JSON.parse(r).ok === true } catch { return /"ok":\s*true/.test(r) }
}

// ── B 站发布 ────────────────────────────────────────────────────
function publishToBilibili(text) {
  const biliMjs = path.join(BILI_BASE, 'vendor', 'dsh-bili-whale', 'tools', 'bili.mjs')
  const r = execFileSync(process.execPath, [biliMjs, 'dynamic', 'post',
    '--text', text, '--go', '--auto',
  ], { encoding: 'utf8', timeout: 120000 })
  const m = r.match(/dyn_id=(\d+)/)
  return { ok: /✅ 已发布/.test(r), dynId: m ? m[1] : null, raw: r }
}

// ── 命令 ────────────────────────────────────────────────────────
const q = readQueue()

if (cmd === 'material') {
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
  const pending = q.entries.filter((e) => e.status === 'pending')
  if (!pending.length) { console.log('没有待审的日记。'); process.exit(0) }
  const e = pending[pending.length - 1]
  e.status = 'approved'
  e.approvedAt = new Date().toISOString()
  writeQueue(q)
  console.log(`已批准：${e.date}（${e.chars} 字）。可以 publish 了。`)
  try { logEvent('diary-approve', { note: `${e.chars} 字`, meta: { chars: e.chars } }) } catch {}
} else if (cmd === 'reject') {
  const why = opt('why', '(未说明)')
  const pending = q.entries.filter((e) => e.status === 'pending')
  if (!pending.length) { console.log('没有待审的日记。'); process.exit(0) }
  const e = pending[pending.length - 1]
  e.status = 'rejected'
  e.reason = String(why)
  e.rejectedAt = new Date().toISOString()
  writeQueue(q)
  console.log(`已驳回：${e.date} · ${why}`)
  try { logEvent('diary-reject', { note: String(why).slice(0, 80) }) } catch {}
} else if (cmd === 'publish') {
  const approved = q.entries.filter((e) => e.status === 'approved')
  if (!approved.length) { console.log('没有已批准的。先 approve。'); process.exit(1) }
  const e = approved[approved.length - 1]
  if (DRY) { console.log('[dry] 将要发布：\n' + e.text); process.exit(0) }
  const r = publishToBilibili(e.text)
  if (r.ok) {
    e.status = 'published'
    e.dynId = r.dynId
    e.publishedAt = new Date().toISOString()
    writeQueue(q)
    console.log(`✅ 已发到 B站动态  dyn_id=${r.dynId}`)
    try { logEvent('diary-publish', { target: r.dynId, note: '已发到 B站动态', meta: { dynId: r.dynId, chars: e.chars } }) } catch {}
    console.log(`   https://t.bilibili.com/${r.dynId}`)
  } else {
    console.error('❌ 发布失败：\n' + r.raw.slice(-600))
    process.exit(1)
  }
} else {
  console.log(`每日潜水日志（她写，脚本管字数和发布）

  node daily-diary.mjs material               打印今天的素材（给她写作参考）
  node daily-diary.mjs draft --file <路径>    收下她写的稿，入待审
  node daily-diary.mjs show                   看待审
  node daily-diary.mjs push                   推飞书（文档 + 私聊）
  node daily-diary.mjs approve                批准
  node daily-diary.mjs reject --why "原因"     驳回
  node daily-diary.mjs publish                发到 B 站动态

字数上限：${MAX_CHARS} 字
文档：${DOC_URL}`)
}
