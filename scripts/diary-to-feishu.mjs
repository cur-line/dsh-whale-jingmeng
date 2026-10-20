#!/usr/bin/env node
// 把鲸檬的本地日记同步到飞书云文档。
//
// 设计要点：
//   1. 本地 ~/.dsh/whale-diary.md 仍是「真相源」——whale 要读它提偏好、算反馈，
//      所以**只读不写**，绝不反向修改她的机制。
//   2. 飞书文档是给你看的镜像，每轮追加上去。
//   3. 用状态文件记「上次同步到哪里」，避免重复追加 —— 追加是会累积的，
//      重复跑一次就会看到两遍同样的内容。
//
// 用法：
//   node diary-to-feishu.mjs          正常同步（只追加新内容）
//   node diary-to-feishu.mjs --force  忽略状态，强制把今天整篇追一次
//   node diary-to-feishu.mjs --dry    只打印要追加什么，不真发

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const HOME = process.env.HOME || os.homedir()
const DIARY = path.join(HOME, '.dsh', 'whale-diary.md')
const STATE = path.join(HOME, '.dsh', 'whale-diary-sync.json')
const LOG = path.join(HOME, '.dsh', 'whale-log.jsonl')

// 飞书文档坐标 —— 改文档就改这两个常量
const DOC_TOKEN = '__DIARY_DOC_TOKEN__'
const DOC_URL = 'https://my.feishu.cn/docx/' + DOC_TOKEN

const argv = process.argv.slice(2)
const FORCE = argv.includes('--force')
const DRY = argv.includes('--dry')

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

// ── 1. 读出本地日记，切成「日期块」──────────────────────────────────────
// whale 写日记的形态是 Markdown，日期标题形如 ## 2026-10-20 或正文里的日期分隔。
// 不假设固定格式：以「## 」开头的行当作新的块起点，其余归入当前块。
function parseDiaryBlocks(text) {
  if (!text.trim()) return []
  const blocks = []
  let buf = []
  let title = null
  for (const line of text.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      if (buf.length) blocks.push({ title: title ?? '(无标题)', body: buf.join('\n').trim() })
      title = h[1]
      buf = []
    } else {
      buf.push(line)
    }
  }
  if (buf.length) blocks.push({ title: title ?? '(无标题)', body: buf.join('\n').trim() })
  return blocks.filter((b) => b.body)
}

// ── 2. 从结构化日志里补一份「今天发生了什么」──────────────────────────
// 日记是散文，日志是事实。两者拼起来你才看得全。
function todayEvents() {
  const lines = readText(LOG).trim().split('\n').filter(Boolean)
  const today = new Date().toLocaleDateString('sv-SE')
  const out = []
  for (const l of lines) {
    try {
      const e = JSON.parse(l)
      if (String(e.at ?? '').slice(0, 10) !== today) continue
      const t = String(e.at).slice(11, 16)
      const note = e.note ? ' — ' + e.note : ''
      const target = e.target ? ' `' + e.target + '`' : ''
      out.push(`- **${t}** \`${e.kind}\`${target}${note}`)
    } catch { /* 坏行跳过 */ }
  }
  return out
}

// ── 3. 组装本次要追加的内容 ─────────────────────────────────────────
const diaryText = readText(DIARY)
// 去掉文件自己的大标题（# xxx），否则会作为一级标题重复插进文档
const stripped = diaryText.replace(/^#\s+.+$/m, '').trim()
const blocks = parseDiaryBlocks(stripped)

if (!blocks.length) {
  console.log('本地日记还是空的 —— 她还没写过东西，这次不同步。')
  console.log('（日记路径：' + DIARY + '）')
  process.exit(0)
}

// 用「块标题 + 正文长度」做指纹，判断哪些块是新的
const fingerprint = (b) => b.title + '::' + b.body.length
const state = readJson(STATE, { synced: [] })
const syncedSet = new Set(FORCE ? [] : (state.synced ?? []))
const fresh = blocks.filter((b) => !syncedSet.has(fingerprint(b)))

if (!fresh.length) {
  console.log('没有新内容 —— 上次已同步过了。')
  console.log('（要强制重发用 --force）')
  process.exit(0)
}

const stamp = new Date().toLocaleString('zh-CN', {
  hour12: false, timeZone: 'Asia/Shanghai',
})

let md = ''
md += '\n\n---\n\n'
md += `## ${stamp} 同步\n\n`

for (const b of fresh) {
  md += `### ${b.title}\n\n`
  md += b.body + '\n\n'
}

const evs = todayEvents()
if (evs.length) {
  md += `### 今天发生的事（结构化记录）\n\n`
  md += evs.join('\n') + '\n\n'
}

if (DRY) {
  console.log('=== 将要追加的内容 ===')
  console.log(md)
  console.log('=== 结束（--dry，没有真发）===')
  process.exit(0)
}

// ── 4. 追加到飞书文档 ──────────────────────────────────────────────
// ⚠️ lark-cli 的 --content @file 只认「当前工作目录 / /tmp / ~/files」三个根，
//    用 os.tmpdir() 在 macOS 上会落到 /var/folders/... 被拒 —— 必须显式写 /tmp。
const tmp = '/tmp/whale-diary-append.md'
fs.writeFileSync(tmp, md, 'utf8')

console.log(`追加 ${fresh.length} 个新块到飞书文档…`)
try {
  const r = execFileSync('lark-cli', [
    'docs', '+update',
    '--doc', DOC_TOKEN,
    '--command', 'append',
    '--content', '@' + tmp,
    '--doc-format', 'markdown',
    '--as', 'user',
  ], { encoding: 'utf8', timeout: 120000 })
  let ok = false
  try { ok = JSON.parse(r).ok === true } catch { ok = /"ok":\s*true/.test(r) }
  if (!ok) {
    console.error('飞书返回异常：')
    console.error(r.slice(0, 800))
    process.exit(1)
  }
  console.log('✅ 同步成功')
  console.log('   文档：' + DOC_URL)
} catch (e) {
  console.error('❌ 同步失败：' + String(e.message).slice(0, 300))
  if (e.stdout) console.error(String(e.stdout).slice(0, 600))
  if (e.stderr) console.error(String(e.stderr).slice(0, 600))
  process.exit(1)
}

// ── 5. 记下已同步，避免重复 ─────────────────────────────────────────
const nextSynced = [...syncedSet, ...fresh.map(fingerprint)]
fs.writeFileSync(STATE, JSON.stringify({
  synced: nextSynced,
  lastAt: new Date().toISOString(),
  doc: DOC_TOKEN,
}, null, 2), 'utf8')

console.log(`状态已记：${nextSynced.length} 个块已同步`)
