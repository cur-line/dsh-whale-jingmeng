// 「这会儿话多不多」—— 她有权懒得回（2026-10-22 借鉴 yangyu-bot 的 CHATTY 机制）
//
// 为什么要有它：
//   光靠提示词说「你可以不回」，模型几乎条条都回 ✗。
//   这里把"回不回"变成**代码门槛**：
//     ① 每天随机给她一档「话多程度」（话多 / 一般 / 懒得打字）
//     ② 模型只负责给「想回的程度 1~5」
//     ③ 代码按这一档的门槛判：够得着才回，够不着就不理
//   同一句话，有时想接、有时懒得动 —— 这才是真人 ✓
//
// 数据：~/.dsh/chatty.json  { date, tier, bar, line }
// 用法：
//   import * as chatty from '../lib/chatty.mjs'
//   chatty.today()            // 拿今天那一档（没有就掷一次）
//   chatty.pass(4)            // 想回程度 4 分够不够今天的门槛
//   chatty.note()             // 「你这会儿有点懒得打字」这类台词

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const DSH = path.join(HOME, '.dsh')
const FILE = process.env.BILI_CHATTY_FILE || path.join(DSH, 'chatty.json')
const today = () => new Date().toLocaleDateString('sv-SE')

export const TIERS = [
  { key: 'chatty', p: 0.30, bar: 2, label: '话挺多', line: '你这会儿话挺多，想接的都想接。' },
  { key: 'normal', p: 0.45, bar: 3, label: '状态一般', line: '你这会儿状态一般，太淡的就别接了。' },
  { key: 'lazy',   p: 0.25, bar: 4, label: '懒得打字', line: '你这会儿有点懒得打字，只有特别想回的一条才动。' },
]

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return null }
}
function write(o) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(o, null, 2) + '\n')
}
function roll() {
  let r = Math.random()
  for (const t of TIERS) { if ((r -= t.p) <= 0) return t }
  return TIERS[1]
}

/** 今天这一档；跨天/没有就掷一次并落盘 */
export function todayTier() {
  const cur = read()
  if (cur && cur.date === today() && cur.bar) return cur
  const t = roll()
  const next = { date: today(), tier: t.key, bar: t.bar, label: t.label, line: t.line, at: new Date().toISOString() }
  write(next)
  return next
}

/** 想回程度够不够今天的门槛 */
export function pass(want) {
  const n = Number(want)
  if (!Number.isFinite(n)) return { ok: false, reason: '要带 --want 1~5（你现在有多想回这一条）' }
  const t = todayTier()
  return { ok: n >= t.bar, bar: t.bar, tier: t.tier, label: t.label, line: t.line, want: n }
}

/** 手动改今天的档（面板/命令用；测试也方便） */
export function setTier(key) {
  const t = TIERS.find((x) => x.key === key)
  if (!t) return null
  const next = { date: today(), tier: t.key, bar: t.bar, label: t.label, line: t.line, at: new Date().toISOString(), manual: true }
  write(next)
  return next
}

/** 重新掷一次（今天已经掷过的也覆盖） */
export function reroll() {
  const t = roll()
  const next = { date: today(), tier: t.key, bar: t.bar, label: t.label, line: t.line, at: new Date().toISOString(), rerolled: true }
  write(next)
  return next
}
