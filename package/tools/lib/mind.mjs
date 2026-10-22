// 她的内心（2026-10-22 借鉴 yangyu-bot 的 mind.mjs）
//
// 为什么要有它：
//   以前的日记容易写成操作流水账（醒了几次、补了几条、挂了什么）✗ 主人看着"一点头绪没有"。
//   这里给她一点**内在状态**，让"看视频"这件事由她自己的心思带着走：
//     · 每看完一条 → 留一句内心独白 + 打个 1~5 的喜欢分（分数还会影响点不点赞、要不要深挖）
//     · 一轮结束 → 更新心情、最近着迷的东西、兴趣
//     · 每晚 → 反思一次，重写「最近的我」（历史都留着，能回看自己怎么变的）
//
// 数据：~/.dsh/mind.json（人能直接读，纯 JSON）
// 用法：
//   import * as mind from '../lib/mind.mjs'
//   mind.read()                          // 全部状态
//   mind.react({ bv, title, score, thought })   // 记一条独白
//   mind.afterSession({ mood, obsession })      // 一轮收尾
//   mind.reflect('最近的我……')                   // 每晚反思

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const FILE = process.env.BILI_MIND_FILE || path.join(HOME, '.dsh', 'mind.json')
const today = () => new Date().toLocaleDateString('sv-SE')

const EMPTY = {
  mood: '',            // 现在的心情（一句话）
  obsession: '',       // 最近着迷的东西
  thought: '',         // 一个没想完的念头
  goal: '',            // 一个小目标
  interests: [],       // 她自己长出来的兴趣 [{ kw, at }]
  self: '',            // 「最近的我」
  selfHistory: [],     // [{ date, self }]
  thoughts: [],        // 最近 200 条独白 [{ at, bv, title, score, thought }]
  updatedAt: null,
}

export function read() {
  try {
    const v = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { ...EMPTY, ...v }
  } catch { return { ...EMPTY } }
}

function write(m) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ ...m, updatedAt: new Date().toISOString() }, null, 2) + '\n')
  fs.renameSync(tmp, FILE)
  return m
}

/** 记一条「刚看完的独白 + 喜欢分」 */
export function react({ bv, title, score, thought, played = null, skipped = false }) {
  const m = read()
  const s = Math.min(5, Math.max(1, Number(score) || 3))
  const item = {
    at: new Date().toISOString(),
    date: today(),
    bv: bv ? String(bv) : null,
    title: title ? String(title).slice(0, 120) : null,
    score: s,
    thought: String(thought || '').slice(0, 300),
    played: played === null ? null : Number(played),
    skipped: !!skipped,
  }
  m.thoughts = [item, ...(m.thoughts || [])].slice(0, 200)
  // 4~5 分的东西，慢慢长成她的兴趣
  if (s >= 4 && title) {
    const kw = String(title).slice(0, 12)
    if (kw && !(m.interests || []).some((x) => x.kw === kw)) {
      m.interests = [{ kw, at: item.at }, ...(m.interests || [])].slice(0, 30)
    }
  }
  write(m)
  return item
}

/** 一轮收尾：更新心情 / 着迷的东西 / 没想完的念头 */
export function afterSession({ mood, obsession, thought, goal } = {}) {
  const m = read()
  if (mood) m.mood = String(mood).slice(0, 120)
  if (obsession) m.obsession = String(obsession).slice(0, 120)
  if (thought) m.thought = String(thought).slice(0, 200)
  if (goal) m.goal = String(goal).slice(0, 120)
  write(m)
  return m
}

/** 每晚反思：重写「最近的我」，把旧版本留在历史里 */
export function reflect(text) {
  const m = read()
  const next = String(text || '').trim()
  if (!next) return m
  if (m.self && m.self !== next) {
    m.selfHistory = [{ date: today(), self: m.self }, ...(m.selfHistory || [])].slice(0, 60)
  }
  m.self = next.slice(0, 800)
  m.lastReflect = today()
  write(m)
  return read()
}

/** 今天还剩几条独白（面板用：看今天写了多少） */
export function todayThoughts() {
  const m = read()
  const d = today()
  return (m.thoughts || []).filter((x) => x.date === d)
}
