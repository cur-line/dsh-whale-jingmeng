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
import { todayMood } from './lib/mood.mjs'

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

function buildSnapshot() {
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
const shanghaiDate = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    : null
}
const today = shanghaiDate(now)
const todayEvents = events.filter((e) => shanghaiDate(e.at ?? '') === today)
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

// ── 7.5 七日趋势（2026-10-20 加）──────────────────────────────────
// 为什么要它：单日数字看不出"她是在变活跃还是变懒"。
// 按天分桶，给出每天的事件数、读过几条、写了几篇、撞几次风控。
function sevenDayTrend() {
  const days = []
  const now = new Date()
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = d.toLocaleDateString('sv-SE')
    days.push({
      date: key,
      label: String(d.getMonth() + 1) + '/' + String(d.getDate()),
      events: 0, reads: 0, diaries: 0, risks: 0, interacts: 0,
    })
  }
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]))
  for (const e of events) {
    const k = String(e.at ?? '').slice(0, 10)
    const d = byDate[k]
    if (!d) continue
    d.events += 1
    if (e.kind === 'debrief') d.reads += 1
    if (e.kind === 'diary-draft') d.diaries += 1
    if (e.kind === 'interact' && e.meta?.action !== 'status') d.interacts += 1
    if (e.kind === 'risk') d.risks += 1
  }
  return days
}
const trend = sevenDayTrend()

// ── 8. 平台状态（B 站 + 小红书）────────────────────────────────────
// 两个平台各自独立：cookie 不共用、数据不混算。
// 小红书的"是否登录"只看 cookies.json 在不在且有内容，不发网络请求
// （面板要秒开，不能因为某个平台掉了就卡住整个页面）。
function platformStatus() {
  const xhsDir = path.join(DSH, 'xhs')
  const xhsCookies = readJson(path.join(xhsDir, 'cookies.json'), null)
  let xhsLogged = false
  try {
    if (xhsCookies) {
      const s = JSON.stringify(xhsCookies)
      // 粗略判断：有非空的 cookie 字段
      xhsLogged = s.length > 20 && /\"?(a1|web_session|webId)\"/.test(s)
    }
  } catch { /* ignore */ }

  const xhsEvents = events.filter((e) => String(e.kind || '').startsWith('xhs-'))
  const xhsToday = xhsEvents.filter((e) => String(e.at || '').slice(0, 10) === today)
  const xhsCommented = readJson(path.join(xhsDir, 'commented.json'), null)

  return {
    bili: {
      name: cfg?.persona?.name ?? '鲸檬',
      mid: cfg?.self?.mid ?? null,
      logged: !!(cred?.sessdata),
      shareOn: !!cfg?.share?.enabled,
      commentOn: !!cfg?.listen?.comment,
      events: events.filter((e) => !String(e.kind || '').startsWith('xhs-')).length,
      todayEvents: todayEvents.filter((e) => !String(e.kind || '').startsWith('xhs-')).length,
    },
    xhs: {
      name: cfg?.xhs?.note ?? '鲸檬',
      logged: xhsLogged,
      events: xhsEvents.length,
      todayEvents: xhsToday.length,
      readCount: xhsEvents.filter((e) => e.kind === 'xhs-read').length,
      feedCount: xhsEvents.filter((e) => e.kind === 'xhs-feed').length,
      commentedCount: Object.keys(xhsCommented?.seen ?? xhsCommented ?? {}).length || 0,
      dataDir: xhsDir,
    },
  }
}
const platforms = platformStatus()

// ── 9. 健康检查 ──────────────────────────────────────────────────
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

  mood: (() => { const m = todayMood(); return { key: m.key, line: m.line } })(),

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

  // ── 潜水箱（2026-10-21 加，主人点名要的展示）────────────────────────
  // 收藏夹里带理由的东西 = 她想留着反复看的宝贝。之前 collect 读了 favs 却从不输出 ✗
  treasure: Array.isArray(favs?.items)
    ? favs.items.map((f) => ({
        bv: f.bv ?? null,
        aid: f.aid ?? null,
        title: f.title ?? '',
        up: f.up ?? '',
        reason: f.reason ?? '',
        kind: f.kind ?? '其他',
        at: f.at ?? '',
        url: f.bv ? `https://www.bilibili.com/video/${f.bv}` : null,
      }))
    : [],

  // ── 评论双卡片（2026-10-21 加）：B站留言 / 小红书留言 ────────────────
  // 从事件流里挑"真发出去"的评论（comment-post / share-comment / xhs-comment），
  // 给面板「最近干了什么」做两张独立卡片，让主人一眼看到具体说了什么。
  comments: (() => {
    const pick = (pred) => events.filter(pred).slice(0, 10)
    return {
      bili: pick((e) => e.kind === 'comment-post' || e.kind === 'share-comment'),
      xhs: pick((e) => e.kind === 'xhs-comment'),
    }
  })(),

  // ── 她发出去的东西（2026-10-21 加，「干得怎么样」数据源）────────────
  // 从事件流挑所有"真发出去"的动作：B站日记/动态、小红书笔记。
  // 互动表现（赞/收藏/评论）由 review.mjs 回读，面板这里先展示"发了什么"。
  published: (() => {
    const kinds = {
      'diary-publish': { platform: 'B站', label: '日记' },
      dynamic: { platform: 'B站', label: '动态' },
      'xhs-note': { platform: '小红书', label: '笔记' },
    }
    return events
      .filter((e) => kinds[e.kind])
      .slice(0, 20)
      .map((e) => ({
        at: e.at,
        kind: e.kind,
        platform: kinds[e.kind].platform,
        label: kinds[e.kind].label,
        target: e.target,
        note: e.note ?? '',
      }))
  })(),

  // ── 给你的视频建议（2026-10-21 加，老板点名要）───────────────────────
  // 鲸檬每天整理"适合技术型老板"的视频：视频 + 为什么适合 + 建议行动 + 提示词方向。
  // 文件由会话（鲸檬自己）写入 ~/.dsh/video-suggestions.json，面板只读展示。
  videoSuggestions: readJson(path.join(DSH, 'video-suggestions.json'), { items: [] }).items ?? [],

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

  // ── 养号进度（2026-10-21 加，借鉴 yangyu-bot）──────────────────
  // · fuse：动作保险丝（哪个写动作被 B站 风控熔断了）
  // · vip：特别关注今天还剩几条配额
  // · task：任务箱待办数
  grow: {
    fuse: (() => {
      const f = readJson(path.join(DSH, 'bili-fuse.json'), {})
      const now = Date.now()
      const out = {}
      for (const [action, v] of Object.entries(f)) {
        out[action] = { blocked: now < v.until, until: new Date(v.until).toISOString(), trips: v.trips }
      }
      return out
    })(),
    vip: (() => {
      const users = Array.isArray(cfg?.vip?.users) ? cfg.vip.users : []
      const st = readJson(path.join(DSH, 'bili-vip.json'), {})
      const max = Number(cfg?.vip?.dailyMax) || 6
      const done = st.done?.[today] || 0
      return { users, dailyMax: max, doneToday: done, left: Math.max(0, max - done) }
    })(),
    taskPending: (() => {
      const lines = readText(path.join(DSH, 'tasks.jsonl')).split('\n').filter(Boolean)
      let pending = 0
      for (const l of lines) { try { if (JSON.parse(l).status === 'pending') pending++ } catch {} }
      return pending
    })(),
  },

  checks,

  platforms,

  trend,

  events: events.slice(0, 300),
}

return snapshot
}

const snapshot = buildSnapshot()
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

function writeSnapshot(snap) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(snap, null, 2), 'utf8')
  const standalone = buildStandalone(snap)
  if (!standalone) return null
  const single = path.join(path.dirname(OUT), '鲸檬面板.html')
  fs.writeFileSync(single, standalone, 'utf8')
  fs.chmodSync(single, 0o644)
  return single
}

// --stdout：只把 JSON 打到 stdout，不写文件、不生成单文件版（给插件路由调用）
if (argv.includes('--stdout')) {
  process.stdout.write(json)
  process.exit(0)
}

const watchSec = Number(opt('watch', 0))
if (argv.includes('--watch') || watchSec > 0) {
  const every = Math.max(5, watchSec || 30) * 1000
  const write = () => {
    try {
      writeSnapshot(buildSnapshot())
      console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] 已刷新 ${OUT}`)
    } catch (e) {
      console.error('刷新失败：' + e.message)
    }
  }
  write()
  setInterval(write, every)
} else if (OUT) {
  const single = writeSnapshot(snapshot)
  console.log(`已写入 ${OUT}（${Buffer.byteLength(json)} bytes · ${snapshot.stats.totalEvents} 条事件）`)

  if (single) console.log(`已生成单文件版 ${single}（双击即可打开）`)
} else {
  console.log(json)
}
