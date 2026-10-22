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
// 独立面板已删除（并入 DSH 养鱼页），默认输出改到 ~/.dsh 下，供手动/定时落盘用
const OUT = opt('out', path.join(process.env.HOME || os.homedir(), '.dsh', 'whale-dashboard.json'))

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

// BV→标题 映射表：给事件流里的 interact（点赞/收藏）补上视频标题。
// B站写动作的事件 note 只记动作名（like/fav），不记标题；
// 这里从「看过」表格 + 事件里的 debrief/feed 里找 BV 对应的标题，
// 让面板能显示「点赞《xxx》」而不是干巴巴的「like BV1Yk...」。
const bvTitle = new Map()
for (const w of watched) if (w.bv && w.title) bvTitle.set(w.bv, w.title)
for (const e of events) {
  if (e.target && e.note && !bvTitle.has(e.target)) bvTitle.set(e.target, String(e.note).slice(0, 60))
}
// 事件 → 原页面地址（2026-10-21 加，老板要求：留言/评论点一下要能跳过去）。
// B站 BV 号 → 视频页；小红书 noteId（24 位 hex）→ 笔记页；其余（diary-xxx / null）没有页面，留空。
const eventUrl = (e) => {
  const t = String(e?.target ?? '')
  if (!t) return ''
  if (/^BV[0-9A-Za-z]{8,}$/.test(t)) return `https://www.bilibili.com/video/${t}`
  if (/^[0-9a-f]{24}$/.test(t)) return `https://www.xiaohongshu.com/explore/${t}`
  return ''
}
// 补 url（每条都给，前端拿它渲染可点链接）+ 补 note：
// interact 类事件，若 note 只是动作名则补上「《标题》」
const enrichedEvents = events.map((e) => {
  const base = { ...e, url: eventUrl(e) }
  if (e.kind === 'interact' && e.target && bvTitle.has(e.target)) {
    const act = { like: '点赞', fav: '收藏', coin: '投币', share: '转发', status: '查状态' }[e.meta?.action] || e.meta?.action || e.note
    if (e.undo) return { ...base, note: `${act}（撤销）《${bvTitle.get(e.target)}》` }
    return { ...base, note: `${act}《${bvTitle.get(e.target)}》` }
  }
  return base
})

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
      // AI 虚拟人标签（2026-10-21 老板确认）：小红书 2026-08-07 新规要求亮明身份，
      // 标签要在 App 里手动设 → 插件只记录"亮没亮"，面板提示
      aiIdentity: Boolean(cfg?.xhs?.aiIdentity),
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
    const pick = (pred) => enrichedEvents.filter(pred).slice(0, 10)
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

  // ── 今日作息（2026-10-22 加）：面板显示「她今天什么时候露面」────────────
  // 数据源是 whale-night.json（调度器每 tick 会刷新），只读不改。
  schedule: (() => {
    try {
      const st = JSON.parse(fs.readFileSync(path.join(DSH, 'whale-night.json'), 'utf8'))
      const slots = Array.isArray(st.slots) ? st.slots : []
      const today = new Date().toLocaleDateString('sv-SE')
      if (st.date !== today || !slots.length) return { date: st.date ?? null, slots: [], wakes: st.wakes ?? 0, total: 0 }
      return {
        date: st.date,
        wakes: Number(st.wakes ?? 0),
        total: slots.length,
        next: slots.filter((x) => x.status === 'pending').sort((a, b) => a.at - b.at)[0] ?? null,
        slots: slots.map((x) => ({ key: x.key, label: x.label, at: x.atText, status: x.status })),
      }
    } catch { return { date: null, slots: [], wakes: 0, total: 0 } }
  })(),

  // ── 待审汇总（2026-10-21 加）：控制台第一眼看到"几件事等你点头" ─────────
  approvals: (() => {
    const readN = (file, array = false) => {
      try {
        const v = JSON.parse(fs.readFileSync(file, 'utf8'))
        const arr = array ? v : (v?.entries ?? v?.items)
        return Array.isArray(arr) ? arr.filter((e) => (e?.status || 'pending') === 'pending').length : 0
      } catch { return 0 }
    }
    const biliReply = readN(path.join(os.homedir(), '.bili-ai', 'pending-replies.json'))
    const xhsComment = readN(path.join(DSH, 'xhs', 'pending-comments.json'))
    const biliDynamic = readN(path.join(DSH, 'bili-whale-dynamic-queue.json'))
    const xhsNote = readN(path.join(DSH, 'xhs', 'pending-notes.json'))
    const biliVideo = readN(path.join(DSH, 'bili-whale-video-queue.json'))
    const diary = readN(path.join(DSH, 'jingmeng-diary-queue.json'))
    const xhsDiary = readN(path.join(DSH, 'xhs', 'pending.json'), true)
    return { biliReply, xhsComment, biliDynamic, xhsNote, biliVideo, diary, xhsDiary,
      pending: biliReply + xhsComment + biliDynamic + xhsNote + biliVideo + diary + xhsDiary }
  })(),

  // ── 给你的视频建议（2026-10-21 加，老板点名要）───────────────────────
  // 鲸檬每天整理"适合技术型老板"的视频：视频 + 为什么适合 + 建议行动 + 提示词方向。
  // 文件由会话（鲸檬自己）写入 ~/.dsh/video-suggestions.json，面板只读展示。
  videoSuggestions: readJson(path.join(DSH, 'video-suggestions.json'), { items: [] }).items ?? [],

  // ── 每天要做的视频（2026-10-21 加，老板：放养鱼页里）─────────────────
  // 鲸檬做视频用的脚本：角色锚点（保证每期长得一样）+ 统一规格 + 每期分镜提示词。
  // 文件由会话（鲸檬自己）写入 ~/.dsh/video-prompts.json，面板只读展示。
  videoPrompts: (() => {
    const vp = readJson(path.join(DSH, 'video-prompts.json'), null)
    if (!vp || typeof vp !== 'object') return { roleAnchor: '', spec: '', items: [] }
    return {
      roleAnchor: vp.roleAnchor ?? '',
      spec: vp.spec ?? '',
      items: Array.isArray(vp.items) ? vp.items : [],
    }
  })(),

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

  events: enrichedEvents.slice(0, 300),
}

return snapshot
}

const snapshot = buildSnapshot()
const json = JSON.stringify(snapshot, null, 2)

// ── 写数据文件 ──────────────────────────────────────────────────
// 面板不再有独立 HTML（已并入 DSH 养鱼页），这里只负责写 JSON。
// DSH 页面通过插件路由调 --stdout 实时取数，本函数供手动/定时落盘用。
function writeSnapshot(snap) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(snap, null, 2), 'utf8')
  return OUT
}

// --stdout：只把 JSON 打到 stdout，不写文件（给插件路由调用）
// ⚠️ 2026-10-21 修的两个真 bug（老板截图 HTTP 500）：
//    ① process.stdout.write 在管道（execFile）下是**异步**的，紧接着 process.exit(0)
//       会丢掉没 flush 的尾部数据 → JSON 被截断（实测丢约 11%）。
//    ② exit 放在异步回调里 → 后面的同步代码**还会继续跑**，又打一遍 JSON/日志。
//    两个一起修：放在 if 分支 + write 回调里 exit ✓
if (argv.includes('--stdout')) {
  process.stdout.write(json + '\n', 'utf8', () => process.exit(0))
} else {
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
    writeSnapshot(snapshot)
    console.log(`已写入 ${OUT}（${Buffer.byteLength(json)} bytes · ${snapshot.stats.totalEvents} 条事件）`)
  } else {
    console.log(json)
  }
}
