// 视频互动 —— 点赞 / 投币 / 收藏 / 三连
//
// 为什么有这个文件：dsh-bili-whale 原版明确不做「三连 / 投币 / 点赞」，
// 而本项目（dsh-whale-jingmeng）的目标是"几乎跟真人一样会互动"，
// 所以这是 fork 出来的第一块新能力。
//
// B站 官方端点（已核对）：
//   点赞   POST /x/v2/view/like            thumbs_up=1(赞) / 2(取消) + csrf
//   投币   POST /x/v2/view/coin            multiply=1|2 + select_like + csrf
//   收藏   POST /x/v2/view/fav/resource/deal   rid + add_media_ids + csrf
//   三连   = 点赞 + 投币 + 收藏，逐个调用
//
// 用法：
//   node interact.mjs like   BV1xxx             点赞
//   node interact.mjs like   BV1xxx --undo      取消赞
//   node interact.mjs coin   BV1xxx             投 1 币
//   node interact.mjs coin   BV1xxx --x2        投 2 币
//   node interact.mjs fav    BV1xxx --folder 123   收藏到指定收藏夹
//   node interact.mjs triple BV1xxx             三连（赞 + 币 + 收藏）
//   node interact.mjs status BV1xxx             看当前互动状态
//
// 公共参数：
//   --dry         只预演，不真发
//   --no-gate     跳过限额闸（默认要过闸，防刷）
//
// ⚠️ 风控提醒：B站 对「短时间内大量点赞/投币」非常敏感。
//   默认走限额闸，一旦被风控（code -352 / -412）立刻停手，不做自动重试。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { gate, record } from '../lib/quota-gate.mjs'
import { logEvent } from '../lib/event-log.mjs'
import { config } from '../lib/config.mjs'
import * as fuse from '../lib/fuse.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const CRED = path.join(HOME, '.bili-ai', 'credentials.json')

// 互动参数从统一配置读，免得每次都手写 --folder
const CFG_INTERACT = config().interact ?? {}
const DEFAULT_FOLDER = CFG_INTERACT.favFolderId ?? null

const argv = process.argv.slice(2)
const cmd = argv[0]
const bvid = argv[1]
const DRY = argv.includes('--dry')
const NO_GATE = argv.includes('--no-gate')
const UNDO = argv.includes('--undo')
let recorded = false
function trackSuccess(action, result) {
  if (!result.ok || DRY) return result
  // 三连第一步成功就记账，后续风控/退出也不会漏掉已完成的动作。
  if (!recorded && !NO_GATE) {
    record({ type: cmd, target: bvid, note: `${cmd}: ${action} 已成功`, auto: true })
    recorded = true
  }
  logEvent('interact', { target: bvid, note: `${action}${UNDO ? '（撤销）' : ''}${REASON ? ` · ${REASON.slice(0, 40)}` : ''}`, meta: { action, command: cmd, undo: UNDO, reason: REASON || undefined } })
  return result
}

function opt(name, def) {
  const i = argv.indexOf('--' + name)
  if (i < 0) return def
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function die(msg, code = 2) {
  console.error(msg)
  process.exit(code)
}

if (!cmd || !bvid) {
  console.log(`视频互动命令

用法：
  node interact.mjs like   <BV>              点赞
  node interact.mjs like   <BV> --undo       取消赞
  node interact.mjs coin   <BV>              投 1 币
  node interact.mjs coin   <BV> --x2         投 2 币
  node interact.mjs fav    <BV> --folder ID  收藏到指定收藏夹
  node interact.mjs triple <BV>              三连（赞 + 币 + 收藏）
  node interact.mjs status <BV>              查当前互动状态

公共参数：
  --dry       只预演
  --no-gate   跳过限额闸`)
  process.exit(1)
}

if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) die(`不是合法的 BV 号：${bvid}`)

// ── 凭据 ────────────────────────────────────────────────────────
if (!fs.existsSync(CRED)) die(`缺少凭据：${CRED}\n先跑 node bili.mjs session 完成登录。`, 3)
const cred = JSON.parse(fs.readFileSync(CRED, 'utf8'))
const missing = ['sessdata', 'bili_jct'].filter((k) => !cred[k])
if (missing.length) die(`凭据缺项：${missing.join(', ')}（bili_jct 就是 csrf，投币/点赞必须有）`, 3)

const COOKIE = `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 || ''}`
const CSRF = cred.bili_jct
const REFERER = `https://www.bilibili.com/video/${bvid}/`

// ── HTTP ────────────────────────────────────────────────────────
async function post(apiPath, fields) {
  const body = new URLSearchParams({ ...fields, csrf: CSRF }).toString()
  const res = await fetch('https://api.bilibili.com' + apiPath, {
    method: 'POST',
    headers: {
      'user-agent': UA,
      referer: REFERER,
      origin: 'https://www.bilibili.com',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: COOKIE,
    },
    body,
  })
  // ⚠️ 必须先 text() 再 JSON.parse：res.json() 失败后 body 已被消费，
  //    再调 res.text() 会抛 "Body is unusable"，把真正的错误信息吞掉。
  const raw = await res.text()
  let j
  try {
    j = JSON.parse(raw)
  } catch {
    j = { code: -1, message: raw.slice(0, 300) }
  }
  return { status: res.status, ...j }
}

async function get(apiPath) {
  const res = await fetch('https://api.bilibili.com' + apiPath, {
    headers: { 'user-agent': UA, referer: REFERER, cookie: COOKIE },
  })
  return res.json()
}

// 风控识别：碰到这些码立刻停，不重试
const RISK = new Set([-352, -412, -509, -799])
function checkRisk(j, what, action = null) {
  if (RISK.has(j.code)) {
    console.error(`\n⛔ ${what} 撞到风控（code=${j.code} ${j.message ?? ''}）`)
    console.error('   已停手，按原样不重试。建议等 10 分钟以上再动，或今天到此为止。')
    if (action) {
      const t = fuse.trip(action)
      console.error(`   🔥 已熔断「${action}」到 ${new Date(t.until).toLocaleString('zh-CN')}（连续第 ${t.trips} 次）`)
    }
    process.exit(5)
  }
}

// 保险丝检查：该动作被熔断就停手（interact 是显式手动命令，仍可 --no-gate 绕过？不——保险丝是硬约束，不给绕过）
function fuseCheck(action) {
  if (!fuse.allow(action)) {
    const st = fuse.status()
    console.error(`⛔ 「${action}」被 B站 风控熔断了（暂停到 ${new Date(st[action]?.until).toLocaleString('zh-CN')}，已连续 ${st[action]?.trips} 次）`)
    console.error('   这是保险丝，不是限额——等它自己恢复，或跑 fuse reset <action> 手动解除。')
    process.exit(2)
  }
}

// ── 具体动作 ────────────────────────────────────────────────────
// ⚠️ 2026-10-21 老板要求：点赞 / 投币 / 收藏**必须写明理由**（为什么想点它）。
//   没理由就不放行 ✗ —— 理由进事件流，养鱼页上看得见。
//   撤销（--undo）时理由可选：撤的是之前的动作，理由可以省。
const REASON = String(opt('reason') ?? '').trim()
const requireReason = (what) => {
  if (UNDO || REASON.length >= 8) return
  console.error(`✗ 缺少 --reason "为什么${what}"（≥8 字）`)
  console.error('  老板要求：每次互动都要说清为什么。没理由的不要动。')
  process.exit(2)
}

async function doLike() {
  const action = UNDO ? 2 : 1
  requireReason('点赞')
  fuseCheck('like')
  console.log(`[点赞] ${bvid} → ${UNDO ? '取消赞' : '点赞'}`)
  if (DRY) return { ok: true, dry: true }
  // ⚠️ 端点与参数名实测修正（2026-10-20）：
  //    /x/v2/view/like      → 404（这是老接口，已废）
  //    /x/web-interface/archive/like  → 200 ✓
  //    参数名也不是 thumbs_up，是 like（1=赞 / 2=取消）
  const j = await post('/x/web-interface/archive/like', {
    bvid,
    like: String(action),
  })
  console.log(`  code=${j.code} ${j.message ?? ''}`)
  checkRisk(j, '点赞', 'like')
  if (j.code === -403) { fuse.trip('like'); console.error(`   🔥 已熔断「点赞」24h（-403 账号异常，可能是风控）`) }
  return { ok: j.code === 0, code: j.code }
}

async function doCoin() {
  const n = opt('x2', false) ? 2 : (Number(CFG_INTERACT.coinMultiplier) || 1)
  requireReason('投币')
  fuseCheck('coin')
  console.log(`[投币] ${bvid} → ${n} 币`)
  if (DRY) return { ok: true, dry: true }
  // 投币端点同样是老接口已废：/x/v2/view/coin → 404
  // 正确：/x/web-interface/coin/add（aid 与 bvid 都可，这里给 bvid）
  const j = await post('/x/web-interface/coin/add', {
    bvid,
    multiply: String(n),
    select_like: '0', // 不在投币时顺带点赞，交给 like 单独控制
  })
  console.log(`  code=${j.code} ${j.message ?? ''}`)
  checkRisk(j, '投币', 'coin')
  if (j.code === -403) { fuse.trip('coin'); console.error(`   🔥 已熔断「投币」24h（-403 账号异常）`) }
  return { ok: j.code === 0, code: j.code }
}

async function doFav() {
  requireReason('收藏')
  const folderArg = opt('folder', DEFAULT_FOLDER)
  fuseCheck('fav')
  if (!folderArg) {
    die('收藏需要收藏夹。\n在 ~/.dsh/bili-whale.config.json 的 interact.favFolderId 填一个，或传 --folder <ID>。')
  }
  console.log(`[收藏] ${bvid} → 收藏夹 ${folderArg}`)
  if (DRY) return { ok: true, dry: true }

  // 收藏接口要 aid（rid）+ 收藏夹 id
  const view = await get(`/x/web-interface/view?bvid=${bvid}`)
  if (view.code !== 0) die(`查视频信息失败：code=${view.code} ${view.message}`, 4)
  const aid = view.data.aid
  console.log(`  aid=${aid}`)

  // 收藏端点实测修正：/x/v2/view/fav/resource/deal → 404
  //                   /x/v3/fav/resource/deal → 405（存在，POST 才对）✓
  const j = await post('/x/v3/fav/resource/deal', {
    rid: String(aid),
    type: '2',
    add_media_ids: String(folderArg),
    del_media_ids: '',
  })
  console.log(`  code=${j.code} ${j.message ?? ''}`)
  checkRisk(j, '收藏', 'fav')
  if (j.code === -403) { fuse.trip('fav'); console.error(`   🔥 已熔断「收藏」24h（-403 账号异常）`) }
  return { ok: j.code === 0, code: j.code }
}

async function doStatus() {
  const view = await get(`/x/web-interface/view?bvid=${bvid}`)
  if (view.code !== 0) die(`查视频失败：${view.code} ${view.message}`, 4)
  const s = view.data.stat
  console.log(`[状态] ${bvid}`)
  console.log(`  ${view.data.title}`)
  console.log(`  点赞 ${s.like} · 投币 ${s.coin} · 收藏 ${s.favorite} · 分享 ${s.share}`)
  const has = await get(`/x/web-interface/archive/has/like?bvid=${bvid}`)
  const coined = await get(`/x/web-interface/archive/coins?bvid=${bvid}`)
  const faved = await get(`/x/v2/fav/video/favoured?aid=${view.data.aid}`)
  console.log(`  我：${has.code === 0 && has.data === 1 ? '已点赞' : '未点赞'} · ` +
    `${coined.code === 0 ? '已投 ' + (coined.data?.multiply ?? 0) + ' 币' : '未投币'} · ` +
    `${faved.code === 0 && faved.data?.favoured ? '已收藏' : '未收藏'}`)
  return { ok: true }
}

// ── 主流程 ──────────────────────────────────────────────────────
async function main() {
  if (!['like', 'coin', 'fav', 'triple', 'status'].includes(cmd)) die(`未知命令：${cmd}`)
  if ((cmd === 'fav' || cmd === 'triple') && !opt('folder', DEFAULT_FOLDER)) die('收藏/三连需要收藏夹：配置 interact.favFolderId 或传 --folder ID')
  // 限额闸：互动也算对外动作，默认要过
  if (!NO_GATE && !DRY && cmd !== 'status') {
    const pass = gate({ type: cmd === 'triple' ? 'triple' : cmd, target: bvid, auto: true })
    if (!pass) {
      console.error('⛔ 限额闸没过，这次不动手。')
      process.exit(6)
    }
  }

  let result
  if (cmd === 'like') result = trackSuccess('like', await doLike())
  else if (cmd === 'coin') result = trackSuccess('coin', await doCoin())
  else if (cmd === 'fav') result = trackSuccess('fav', await doFav())
  else if (cmd === 'status') result = await doStatus()
  else if (cmd === 'triple') {
    console.log(`[三连] ${bvid}`)
    const a = trackSuccess('like', await doLike())
    let b = { ok: false, skipped: true }
    let c = { ok: false, skipped: true }
    if (a.ok) {
      if (!DRY) await new Promise(r => setTimeout(r, 1200))
      b = trackSuccess('coin', await doCoin())
    }
    if (b.ok) {
      if (!DRY) await new Promise(r => setTimeout(r, 1200))
      c = trackSuccess('fav', await doFav())
    }
    result = { ok: a.ok && b.ok && c.ok, dry: DRY, parts: { like: a, coin: b, fav: c } }
    console.log(`\n三连结果：赞 ${a.ok ? '✓' : '✗'} · 币 ${b.ok ? '✓' : '✗'} · 藏 ${c.ok ? '✓' : '✗'}`)
  } else {
    die(`未知命令：${cmd}`)
  }

  console.log('')
  if (result?.dry) console.log('（--dry：只预演，没有真发）')
  else if (result?.ok) {
    console.log('✅ 成功')
  } else {
    console.error('❌ 没成功')
    process.exit(1)
  }
}

await main()
