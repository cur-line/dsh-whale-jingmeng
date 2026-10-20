#!/usr/bin/env node
// 面板数据采集器 —— 把散落在各处的状态汇成一份 JSON，喂给 dashboard.html。
//
// 为什么要单独一层：面板是静态 HTML，不能读本地文件（浏览器沙箱）。
// 所以先跑本脚本生成 snapshot.json，HTML 再读它。
//
// 用法：
//   node collect.mjs                  输出到 stdout
//   node collect.mjs --out <路径>      写到文件（默认 ../dashboard/data.json）
//   node collect.mjs --watch 30       每 30 秒刷新（面板自动跟着更新）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readEvents, LOG_PATH } from './lib/event-log.mjs'

const HOME = process.env.HOME || os.homedir()
const DSH = path.join(HOME, '.dsh')
const BILI = path.join(HOME, '.bili-ai')

const argv = process.argv.slice(2)
function opt(name, def = null) {
  const i = argv.indexOf('--' + name)
  return i < 0 ? def : argv[i + 1]
}

const here = path.dirname(new URL(import.meta.url).pathname)
const OUT = opt('out', path.join(here, '..', 'dashboard', 'data.json'))

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}
function readText(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}
function statOf(p) {
  try {
    const s = fs.statSync(p)
    return { exists: true, bytes: s.size, mtime: s.mtime.toISOString() }
  } catch { return { exists: false } }
}

// ── 1. 她的作息与当前状态 ────────────────────────────────────────
const night = readJson(path.join(DSH, 'whale-night.json'), null)
const cfg = readJson(path.join(DSH, 'bili-whale.config.json'), {})

const now = new Date()
let nightView = null
if (night) {
  // at 是当天的分钟数
  const planAt = typeof night.at === 'number'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(night.at / 60), night.at % 60)
    : null
  nightView = {
    date: night.date,
    action: night.action,
    atText: night.atText,
    window: night.window,
    fired: night.fired === true,
    roll: night.roll,
    wakes: night.wakes,
    maxVideos: night.maxVideos,
    planAt: planAt ? planAt.toISOString() : null,
    msUntil: planAt ? planAt.getTime() - now.getTime() : null,
    createdAt: night.createdAt,
  }
}

// ── 2. 日记队列 ──────────────────────────────────────────────────
const queue = readJson(path.join(DSH, 'jingmeng-diary-queue.json'), { entries: [] })
const entries = (queue.entries ?? []).map((e) => ({
  id: e.id,
  date: e.date,
  chars: e.chars,
  status: e.status,
  text: e.text,
  createdAt: e.createdAt,
  approvedAt: e.approvedAt ?? null,
  publishedAt: e.publishedAt ?? null,
  dynId: e.dynId ?? null,
  reason: e.reason ?? null,
}))

const statusCount = {}
for (const e of entries) statusCount[e.status] = (statusCount[e.status] ?? 0) + 1

// ── 3. 本地日记（她自己的那本）────────────────────────────────────
const diaryText = readText(path.join(DSH, 'whale-diary.md'))

// 抽出「看过」表格
const watched = []
for (const line of diaryText.split('\n')) {
  if (!line.trim().startsWith('|')) continue
  const c = line.split('|').map((s) => s.trim()).filter(Boolean)
  if (c.length < 4) continue
  if (/^-+$/.test(c[0]) || c[0] === '日期') continue
  watched.push({ date: c[0], bv: c[1], title: c[2], thought: c[3] })
}

// 抽出「想说但还没说」
const wants = []
let inWants = false
for (const line of diaryText.split('\n')) {
  const h = line.match(/^##\s+(.+)$/)
  if (h) { inWants = h[1].includes('想说'); continue }
  if (!inWants) continue
  const t = line.trim()
  if (t.startsWith('-') && !/^-\s*（空/.test(t)) wants.push(t.replace(/^-\s*/, ''))
}

// ── 4. 事件流 ────────────────────────────────────────────────────
const events = readEvents(800)

// ── 5. 账号与额度 ────────────────────────────────────────────────
const cred = readJson(path.join(BILI, 'credentials.json'), null)
const quota = readJson(path.join(BILI, 'quota.json'), null)
const favs = readJson(path.join(BILI, 'favorites.json'), null)

// ── 6. 今日统计 ──────────────────────────────────────────────────
const today = now.toLocaleDateString('sv-SE')
const todayEvents = events.filter((e) => String(e.at ?? '').slice(0, 10) === today)
const countBy = (arr, key) => {
  const m = {}
  for (const x of arr) m[x[key]] = (m[x[key]] ?? 0) + 1
  return m
}

// ── 7. 最近一次醒来（找 night-wake 事件）──────────────────────────
const lastWake = events.find((e) => e.kind === 'night-wake') ?? null
const lastFeed = events.find((e) => e.kind === 'feed') ?? null
const lastDebrief = events.find((e) => e.kind === 'debrief') ?? null
const lastPublish = events.find((e) => e.kind === 'diary-publish') ?? null

// ── 8. 健康检查 ──────────────────────────────────────────────────
const checks = []
function check(name, ok, detail, hint = '') {
  checks.push({ name, ok, detail, hint })
}
check('配置文件', Object.keys(cfg).length > 0,
  Object.keys(cfg).length ? `${cfg.persona?.name ?? '?'} · ${Object.keys(cfg).length} 段` : '没读到',
  '~/.dsh/bili-whale.config.json')
check('B站凭据', !!(cred?.sessdata && cred?.bili_jct && cred?.buvid3),
  cred ? `sessdata ${String(cred.sessdata).length} 字符` : '缺失',
  '~/.bili-ai/credentials.json')
check('她的 mid', !!cfg?.self?.mid, cfg?.self?.mid ?? '未填', '设置页「她是谁」')
check('主人 mid', !!cfg?.owner?.mid, cfg?.owner?.mid ?? '未填', '设置页「主人是谁」')
check('分享开关', !!cfg?.share?.enabled,
  cfg?.share?.enabled ? '已开' : '关闭（养号期）',
  '养号期结束后打开')
check('评论监听', !!cfg?.listen?.comment,
  cfg?.listen?.comment ? '已开' : '关闭（养号期）', '')
check('推送通道', !!cfg?.notify?.type && cfg.notify.type !== 'none',
  cfg?.notify?.type ?? '?', '')
check('事件日志', events.length > 0, `${events.length} 条`, LOG_PATH)
check('本地日记', diaryText.length > 0, `${watched.length} 条已看过`, '')
check('待审日记', (statusCount.pending ?? 0) >= 0,
  `${statusCount.pending ?? 0} 条待审`, '')

const snapshot = {
  generatedAt: now.toISOString(),
  now: now.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),

  persona: {
    name: cfg?.persona?.name ?? '鲸檬',
    ownerTitle: cfg?.persona?.ownerTitle ?? '鱼片',
    diaryTitle: cfg?.persona?.diaryTitle ?? '今日潜水日志',
    selfMid: cfg?.self?.mid ?? null,
    ownerMid: cfg?.owner?.mid ?? null,
    ownerName: cfg?.owner?.name ?? null,
  },

  schedule: {
    windows: cfg?.night?.windows ?? [],
    skipChance: cfg?.night?.skipChance ?? null,
    maxVideos: cfg?.night?.maxVideos ?? null,
    current: nightView,
  },

  switches: {
    share: !!cfg?.share?.enabled,
    shareVia: cfg?.share?.via ?? null,
    listenComment: !!cfg?.listen?.comment,
    notify: cfg?.notify?.type ?? 'none',
    warmup: !cfg?.share?.enabled && !cfg?.listen?.comment,
  },

  diary: {
    localChars: diaryText.length,
    watched,
    wants,
    queue: entries,
    statusCount,
  },

  stats: {
    totalEvents: events.length,
    todayEvents: todayEvents.length,
    todayByKind: countBy(todayEvents, 'kind'),
    allByKind: countBy(events, 'kind'),
  },

  milestones: {
    lastWake,
    lastFeed,
    lastDebrief,
    lastPublish,
  },

  checks,

  events: events.slice(0, 300),
}

const json = JSON.stringify(snapshot, null, 2)

// ── 生成单文件 HTML（数据内联）──────────────────────────────────
// 为什么要有这个：直接双击 index.html 是 file:// 协议，
// 浏览器禁止 fetch 本地 JSON（CORS）。所以把数据塞进 HTML 里，
// 双击就能看，不用起服务器。
function buildStandalone(snap) {
  const tpl = path.join(here, '..', 'dashboard', 'index.html')
  let html
  try { html = fs.readFileSync(tpl, 'utf8') } catch { return null }

  const payload = JSON.stringify(snap)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

  // 注入到 window.__DASHBOARD_DATA__，并把 boot() 改成优先读它
  html = html.replace(
    '<script>\nconst KIND_GROUP',
    `<script>\nwindow.__DASHBOARD_DATA__ = ${payload};\n</script>\n<script>\nconst KIND_GROUP`
  )

  // 把 boot() 改成：有内联数据就直接用，没有再 fetch
  html = html.replace(
    `async function boot() {
  const bootEl = document.getElementById('boot');
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    render(d);
  } catch (e) {`,
    `async function boot() {
  const bootEl = document.getElementById('boot');
  // 优先用内联数据（单文件双击打开时走这条）
  if (window.__DASHBOARD_DATA__) { render(window.__DASHBOARD_DATA__); return; }
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    render(d);
  } catch (e) {`
  )

  return html
}

const watchSec = Number(opt('watch', 0))
if (argv.includes('--watch') || watchSec > 0) {
  const every = Math.max(5, watchSec || 30) * 1000
  const write = () => {
    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true })
      const fresh = JSON.stringify(buildSnapshot(), null, 2)
      fs.writeFileSync(OUT, fresh, 'utf8')
      console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 已刷新 ${OUT}`)
    } catch (e) {
      console.error('刷新失败：' + e.message)
    }
  }
  write()
  setInterval(write, every)
} else if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, json, 'utf8')
  console.log(`已写入 ${OUT}（${Buffer.byteLength(json)} bytes · ${events.length} 条事件）`)

  // 同时产出一个双击就能开的单文件
  const standalone = buildStandalone(snapshot)
  if (standalone) {
    const single = path.join(path.dirname(OUT), '鲸檬面板.html')
    fs.writeFileSync(single, standalone, 'utf8')
    fs.chmodSync(single, 0o644)
    console.log(`已生成单文件版 ${single}（双击即可打开）`)
  }
} else {
  console.log(json)
}

// --watch 时重新采集（复用同一套逻辑）
function buildSnapshot() {
  return JSON.parse(JSON.stringify(snapshot, null, 2))
}
