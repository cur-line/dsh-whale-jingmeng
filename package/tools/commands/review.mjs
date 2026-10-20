// 复盘 —— 看她发出去的东西表现如何，以及她自己的行为统计。
//
// 为什么需要这个：完整闭环的最后一步。没有复盘，
// 她就永远不知道哪条日记有人看、哪类视频值得再找，选题会一直瞎猜。
//
// 三个数据源：
//   ① B 站那边：自己账号的粉丝/播放/获赞，以及已发布动态的互动数
//   ② 本地：日记队列（发了什么）、事件日志（做了什么）
//   ③ 反馈：主人对哪些内容有反应（点赞/评论）
//
// 用法：
//   node review.mjs                最近 7 天复盘
//   node review.mjs --days 30      自定义窗口
//   node review.mjs --json         机器读
//
// ⚠️ 只读，不产生任何写入或对外动作。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readEvents } from '../lib/event-log.mjs'
import { config } from '../lib/config.mjs'

const HOME = process.env.HOME || os.homedir()
const DSH = path.join(HOME, '.dsh')
const BILI = path.join(HOME, '.bili-ai')

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
function opt(name, def) {
  const i = argv.indexOf('--' + name)
  return i < 0 ? def : argv[i + 1]
}
const DAYS = Number(opt('days', 7)) || 7

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb }
}

const cred = readJson(path.join(BILI, 'credentials.json'), null)
if (!cred?.sessdata) {
  console.error('缺少 B 站凭据，无法复盘。先跑 node bili.mjs selftest。')
  process.exit(3)
}
const COOKIE = `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 || ''}`

async function api(p) {
  try {
    const r = await fetch('https://api.bilibili.com' + p, {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', cookie: COOKIE },
    })
    return await r.json()
  } catch (e) {
    return { code: -1, message: String(e.message) }
  }
}

// ── ① 我自己（鲸檬号）的数据 ──────────────────────────────────────
const cfg = config()
const selfMid = cfg?.self?.mid
let account = null
if (selfMid) {
  // card 接口拿粉丝/获赞/播放，比 acc/info 稳（后者常被 -403 风控）
  const card = await api(`/x/web-interface/card?mid=${selfMid}`)
  if (card.code === 0) {
    const c = card.data?.card ?? {}
    account = {
      name: c.name,
      fans: c.fans,
      attention: c.attention,
      likes: c.like_num ?? card.data?.like_num,
      archiveCount: card.data?.archive_count,
    }
  }
}

// ── ② 已发布的日记，逐条查互动 ────────────────────────────────────
const queue = readJson(path.join(DSH, 'jingmeng-diary-queue.json'), { entries: [] })
const since = Date.now() - DAYS * 86400000
const published = (queue.entries ?? [])
  .filter((e) => e.status === 'published' && e.dynId)
  .filter((e) => {
    const t = new Date(e.publishedAt ?? e.createdAt ?? 0).getTime()
    return !Number.isFinite(t) || t >= since
  })

const dynStats = []
for (const e of published) {
  // 动态详情能拿到点赞/评论/转发数
  const d = await api(`/x/polymer/web-dynamic/v1/detail?id=${e.dynId}`)
  // ⚠️ 查不到 ≠ 0 互动。以前用 0 兜底，导致"没人看"的错误结论 ——
  //   现在明确区分：ok=true 才计入均值，否则记 unknown
  let s = null
  let statOk = false
  if (d.code === 0) {
    const m = d.data?.item?.modules?.module_stat
    if (m) {
      s = {
        like: m.like?.count ?? 0,
        comment: m.comment?.count ?? 0,
        forward: m.forward?.count ?? 0,
      }
      statOk = true
    }
  }
  dynStats.push({
    date: e.date,
    dynId: e.dynId,
    chars: e.chars,
    url: `https://t.bilibili.com/${e.dynId}`,
    statKnown: statOk,
    ...(s ?? { like: null, comment: null, forward: null }),
  })
  await new Promise((r) => setTimeout(r, 350)) // 别把接口打太密
}

// ── ③ 她自己的行为统计（本地事件）──────────────────────────────────
const events = readEvents(3000)
const inWindow = events.filter((e) => {
  const t = new Date(e.at ?? 0).getTime()
  return Number.isFinite(t) && t >= since
})

const kinds = {}
for (const e of inWindow) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1

// 读过哪些视频（debrief 事件）
const readBVs = new Map()
for (const e of inWindow.filter((x) => x.kind === 'debrief' && x.target)) {
  if (!readBVs.has(e.target)) {
    readBVs.set(e.target, { bv: e.target, title: e.note, at: e.at })
  }
}

// 互动过什么
const interacted = inWindow
  .filter((e) => e.kind === 'interact' && e.target && e.meta?.action !== 'status')
  .map((e) => ({ bv: e.target, action: e.meta?.action, at: e.at }))

// 撞风控次数
const risks = inWindow.filter((e) => e.kind === 'risk').length

// ── ④ 输出 ──────────────────────────────────────────────────────
const report = {
  window: { days: DAYS, since: new Date(since).toISOString() },
  account,
  publishedCount: dynStats.length,
  dynStats,
  activity: {
    totalEvents: inWindow.length,
    byKind: kinds,
    readCount: readBVs.size,
    interactCount: interacted.length,
    riskCount: risks,
  },
  readBVs: [...readBVs.values()],
  interacted,
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

console.log(`\n════════ 复盘 · 最近 ${DAYS} 天 ════════\n`)

if (account) {
  console.log(`【账号】${account.name}`)
  console.log(`  粉丝 ${account.fans ?? '?'} · 关注 ${account.attention ?? '?'} · 获赞 ${account.likes ?? '?'} · 投稿 ${account.archiveCount ?? '?'}`)
} else {
  console.log('【账号】读不到（mid 没配或接口风控）')
}

console.log(`\n【她做的事】共 ${inWindow.length} 条事件`)
const order = ['night-plan', 'night-wake', 'feed', 'debrief', 'interact', 'diary-draft', 'diary-push', 'diary-approve', 'diary-publish', 'notify', 'risk', 'error']
for (const k of order) {
  if (kinds[k]) console.log(`  ${k.padEnd(14)} ${kinds[k]}`)
}
for (const [k, v] of Object.entries(kinds)) {
  if (!order.includes(k)) console.log(`  ${k.padEnd(14)} ${v}`)
}

console.log(`\n【读懂】${readBVs.size} 条`)
for (const b of [...readBVs.values()].slice(0, 10)) {
  console.log(`  ${b.bv}  ${String(b.title ?? '').slice(0, 50)}`)
}

console.log(`\n【互动】${interacted.length} 次`)
const byAction = {}
for (const x of interacted) byAction[x.action] = (byAction[x.action] ?? 0) + 1
for (const [a, n] of Object.entries(byAction)) console.log(`  ${a.padEnd(10)} ${n}`)

console.log(`\n【发出去的日记】${dynStats.length} 条`)
if (!dynStats.length) {
  console.log('  （还没有发布过。先让她写一篇，审核后 publish）')
} else {
  for (const d of dynStats) {
    const s = d.like === null ? '（读不到数据）' : `👍${d.like} 💬${d.comment} 🔁${d.forward}`
    console.log(`  ${d.date}  ${d.chars} 字  ${s}`)
    console.log(`    ${d.url}`)
  }
}

if (risks > 0) {
  console.log(`\n⚠️ 期间撞到风控 ${risks} 次 —— 检查频率是否需要调低`)
}

// ── ⑤ 给她的建议（基于数据，不是编的）────────────────────────────
console.log('\n【下一步建议】')
if (!dynStats.length) {
  console.log('  · 还没有发出过东西 —— 先把「写日记 → 审核 → 发布」这条跑通')
} else {
  // 只统计「数据确实读到了」的那些；读不到的不能当 0
  const known = dynStats.filter((d) => d.statKnown && d.like !== null)
  const unknown = dynStats.length - known.length
  if (known.length === 0) {
    console.log(`  · 已发 ${dynStats.length} 条，但**一条互动数据都没读到** —— 无法判断表现`)
    console.log('  · 常见原因：动态刚发还没统计、或接口需要登录态。过几小时再跑一次')
  } else {
  const totalLike = known.reduce((a, b) => a + (b.like ?? 0), 0)
  const avg = (totalLike / known.length).toFixed(1)
  console.log(`  · 平均每条 ${avg} 个赞（已知样本 ${known.length} 条${unknown ? `，另有 ${unknown} 条读不到` : ''}）`)
  if (Number(avg) < 1) console.log('  · 基本没人看到 —— 正常，新号冷启动需要时间，别改策略')
  else if (Number(avg) < 5) console.log('  · 有一点反应了 —— 可以看看哪条相对好，往那个方向多写')
  else console.log('  · 反馈不错 —— 可以试着加长或提高频率')
  }
}
console.log(`  · 风控 ${risks} 次 ${risks === 0 ? '（安全）' : '（需要降频）'}`)
console.log(`  · 建议：每 ${DAYS} 天跑一次本命令，把结论写进日记的「偏好校准」\n`)
