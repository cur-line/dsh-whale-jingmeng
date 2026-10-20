// 统一事件日志 —— 所有模块共用一套写入格式。
//
// 为什么单独抽出来：原版只有 whale-night.mjs 和 diary.mjs 两处会写日志，
// 刷视频/读懂/点赞/发动态/发日记这些**真正重要的事反而没记录** ——
// 导致面板上什么也看不到。
//
// 日志行格式（保持向后兼容，老数据能直接读）：
//   { at, kind, target, note, meta? }
//
// kind 约定（面板按这个分类上色）：
//   night-plan / night-wake / night-skip    生物钟
//   feed            选题（meta.pool / meta.picked）
//   debrief         读懂一条（meta.subs / meta.danmaku / meta.replies）
//   interact        点赞/投币/收藏（meta.action）
//   dynamic         发动态（meta.dynId）
//   diary-draft     写好日记（meta.chars）
//   diary-push      推给主人审
//   diary-publish   日记发到 B 站
//   notify          推送通知
//   risk            撞风控（面板标红）
//   error           出错（面板标红）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.HOME || os.homedir()
export const LOG_PATH = path.join(HOME, '.dsh', 'whale-log.jsonl')

/**
 * 记一条事件。**永不抛异常** —— 日志挂了不能带崩主流程。
 */
export function logEvent(kind, { target = null, note = null, meta = null } = {}) {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      kind: String(kind),
      target: target ?? null,
      note: note ?? null,
      ...(meta ? { meta } : {}),
    })
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, line + '\n')
    return true
  } catch {
    return false
  }
}

/** 读最近的 N 条（新的在前），坏行自动跳过 */
export function readEvents(limit = 500) {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
    const out = []
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
      try { out.push(JSON.parse(lines[i])) } catch { /* 坏行跳过 */ }
    }
    return out
  } catch {
    return []
  }
}
