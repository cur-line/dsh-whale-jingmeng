// 动作保险丝 —— 每个写动作独立的熔断器。
//
// 为什么有它（2026-10-21 借鉴 yangyu-bot 云养鱼项目）：
//   B站 对"会影响播放量/排行/激励"的互动（点赞、投币、分享）单独做防刷量风控，
//   新号 + 脚本请求最容易中招（-403 账号异常等）。一个动作被拒，不代表所有动作都被拒。
//   这里给每个写动作一根独立保险丝：被拒一次就只暂停这个动作 24 小时，
//   其余动作照常，避免反复重试同一动作被风控盯死。
//
// 用法：
//   import * as fuse from '../lib/fuse.mjs'
//   if (!fuse.allow('coin')) return           // 保险丝断着就不碰
//   const r = await coinVideo(bvid)
//   if (r.code === -403) fuse.trip('coin')    // 被拒就熔断该动作
//
// 动作清单：like / coin / fav / share / comment / dynamic（各写动作）
// 数据：~/.dsh/bili-fuse.json  { <action>: { until: <ts>, trips: <count>, lastAt: <ts> } }

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const FILE = process.env.BILI_FUSE_FILE || path.join(HOME, '.dsh', 'bili-fuse.json')
const DEFAULT_MS = 24 * 60 * 60 * 1000  // 默认熔断 24 小时

function readAll() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) }
  catch { return {} }
}
function writeAll(all) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + '\n')
}

/** 某动作当前是否允许执行（保险丝断着返回 false） */
export function allow(action) {
  const all = readAll()
  const f = all[action]
  if (!f) return true
  if (Date.now() >= f.until) { delete all[action]; writeAll(all); return true }
  return false
}

/** 熔断某动作：被 B站 拒一次暂停 DEFAULT_MS（连续被拒按 1/3/7 天阶梯延长） */
export function trip(action, { ms = DEFAULT_MS } = {}) {
  const all = readAll()
  const f = all[action]
  const trips = (f?.trips || 0) + 1
  const step = [DEFAULT_MS, 3 * DEFAULT_MS, 7 * DEFAULT_MS]
  const len = Math.min(trips - 1, step.length - 1)
  const until = Date.now() + (ms === DEFAULT_MS ? step[len] : ms)
  all[action] = { until, trips, lastAt: new Date().toISOString() }
  writeAll(all)
  return { action, until, trips }
}

/** 手动恢复某动作（面板/命令用） */
export function reset(action) {
  const all = readAll()
  delete all[action]
  writeAll(all)
  return true
}

/** 看所有保险丝状态（面板用） */
export function status() {
  const all = readAll()
  const now = Date.now()
  const out = {}
  for (const [action, f] of Object.entries(all)) {
    out[action] = {
      blocked: now < f.until,
      until: new Date(f.until).toISOString(),
      trips: f.trips,
      lastAt: f.lastAt,
    }
  }
  return out
}

/** 风控码判断：B站 的 -352/-412/-799/-403 都是风控 */
export function isRiskCode(code) {
  const n = Number(code)
  return [-352, -403, -412, -799, -509].includes(n) || (n < 0 && String(code).startsWith('-'))
}
