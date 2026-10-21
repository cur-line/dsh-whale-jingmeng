// 小红书独立的额度账本。
//
// 为什么不能复用 B 站那本（quota.mjs）：
//   那本账按"类型"记账，但 check 时对**不认识的 type** 会走 --auto 分支，
//   统计范围是当天全部 log —— 于是"在 B 站点了 2 个赞"会把小红书的额度也吃掉。
//   两个平台的额度必须各算各的，所以这里单独一本：~/.dsh/xhs/quota.json
//
// 记账结构：
//   { "2026-10-20": { "like": 1, "fav": 0, "comment": 1, "note": 0 } }
//   按天分桶，第二天自然清零；旧数据保留 30 天便于回看。
//
// 限额来源：~/.dsh/bili-whale.config.json 的 xhs 段（使用者可改，代码不写死）
//   xhs.likeDaily / collectDaily / commentDaily / shareDaily(笔记发布) / enabled
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { config } from './config.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const FILE = path.join(HOME, '.dsh', 'xhs', 'quota.json')
const KEEP_DAYS = 30

// 动作 → 配置里的键 + 中文名
const ACTIONS = {
  like: { key: 'likeDaily', label: '点赞', fallback: 5 },
  fav: { key: 'collectDaily', label: '收藏', fallback: 3 },
  comment: { key: 'commentDaily', label: '评论', fallback: 10 },
  note: { key: 'shareDaily', label: '发布笔记', fallback: 1 },
}

function today() {
  // 用本地时区算"今天"，不能用 toISOString（那是 UTC，晚 8 点后会跳到明天）
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    // 文件不存在 = 新账本；文件坏了 = 状态未知 → 由调用方决定（这里返回空，但会标记）
    return {}
  }
}

function save(book) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  // 清理过老的桶，别让文件无限长
  const cutoff = Date.now() - KEEP_DAYS * 86400000
  for (const day of Object.keys(book)) {
    const t = new Date(day + 'T00:00:00').getTime()
    if (Number.isFinite(t) && t < cutoff) delete book[day]
  }
  fs.writeFileSync(FILE, JSON.stringify(book, null, 2))
}

/** 当前限额（从配置读，实时生效；改配置不用重启） */
export function limitFor(action) {
  const meta = ACTIONS[action]
  if (!meta) return 0
  const x = config().xhs ?? {}
  const n = Number(x[meta.key] ?? meta.fallback)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : meta.fallback
}

/** 今天这个动作已经用了几次 */
export function usedToday(action) {
  const book = load()
  return Number(book[today()]?.[action] ?? 0)
}

/**
 * 能不能做。
 * @returns {{ok: boolean, reason?: string, used: number, limit: number}}
 */
export function check(action) {
  const meta = ACTIONS[action]
  if (!meta) return { ok: false, reason: `未知动作 ${action}`, used: 0, limit: 0 }

  const x = config().xhs ?? {}
  if (x.enabled === false) {
    return { ok: false, reason: '小红书整条腿被关掉了（配置 xhs.enabled=false）', used: 0, limit: 0 }
  }

  const limit = limitFor(action)
  const used = usedToday(action)
  if (used >= limit) {
    return {
      ok: false,
      reason: `今天的${meta.label}额度用完了（${used}/${limit}）—— 不是故障，是缰绳`,
      used,
      limit,
    }
  }
  return { ok: true, used, limit }
}

/** 做成功了才记账（失败不记，避免"没发出去却扣额度"） */
export function record(action, note = '') {
  const meta = ACTIONS[action]
  if (!meta) return
  const book = load()
  const day = today()
  book[day] = book[day] || {}
  book[day][action] = Number(book[day][action] ?? 0) + 1
  if (note) book[day].__last = { action, note: String(note).slice(0, 60), at: new Date().toISOString() }
  save(book)
}

/** 给 doctor / 状态页用的一句话汇总 */
export function summary() {
  const parts = Object.keys(ACTIONS).map((a) => {
    const meta = ACTIONS[a]
    return `${meta.label} ${usedToday(a)}/${limitFor(a)}`
  })
  return `今日小红书：${parts.join(' · ')}`
}
