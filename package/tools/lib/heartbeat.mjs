// 播放心跳 —— 让"看视频"真的留下观看记录、真的算每日观看经验。
//
// 为什么有它（2026-10-21 借鉴 yangyu-bot 云养鱼项目）：
//   只调 /x/web-interface/view 拿详情**不会**留下观看记录，也不算「每日观看视频 +5 经验」。
//   网页播放器的做法是：开播发一次心跳，之后每 15 秒发一次，结束再发一次，
//   心跳里带着已播放秒数。B站 据此写入历史记录、累计播放进度。
//
// 用法：
//   import { reportWatch } from '../lib/heartbeat.mjs'
//   await reportWatch(cred, bvid, { seconds: 60 })   // 真看 60 秒（默认看到底，最多 8 分钟）
//
// 红线：这是"像真人一样看"的最小实现 —— 不伪造、不加速、不循环刷。
//   看多少秒就是多少秒，B站 的观看经验按真实进度给。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 从 credentials.json 读 B站 凭据（与其余命令一致） */
export function loadCred() {
  const file = process.env.BILI_CRED || path.join(HOME, '.bili-ai', 'credentials.json')
  const raw = fs.readFileSync(file, 'utf8')
  const cred = JSON.parse(raw)
  if (!cred.sessdata || !cred.bili_jct) throw new Error(`凭据缺 sessdata/bili_jct（${file}）`)
  return cred
}

/** 可被打断的 sleep；被打断返回 false */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(true) }, ms)
    const onAbort = () => { clearTimeout(t); resolve(false) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 真"看"一个视频：发播放心跳（开播 / 每 interval 秒 / 结束），并上报历史记录兜底。
 *
 * @param {object} cred  凭据 { sessdata, bili_jct, buvid3?, dede_user_id? }
 * @param {string} bvid  BV 号
 * @param {object} opts  { seconds?: 看多少秒（默认看完整视频，最多 8 分钟）, interval?: 心跳间隔, signal?: AbortSignal, onTick?: (playedSec)=>void }
 * @returns {Promise<{ bvid, title, owner, duration, played, aborted }>}
 */
export async function reportWatch(cred, bvid, { seconds, interval = 15, signal, onTick } = {}) {
  const H = {
    'user-agent': UA,
    referer: 'https://www.bilibili.com/',
    cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}${cred.buvid3 ? `; buvid3=${cred.buvid3}` : ''}`,
  }

  // 1. 拿详情（aid / cid / duration / 标题）
  const view = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: H })).json()
  if (view.code !== 0) throw new Error(`view 失败 code=${view.code} ${view.message}`)
  const v = view.data
  const duration = Number(v.duration) || 60
  const target = Math.max(5, Math.min(Math.round(seconds ?? duration), duration, 8 * 60))
  const startTs = Math.floor(Date.now() / 1000)
  const referer = `https://www.bilibili.com/video/${v.bvid}`
  const mid = String(cred.dede_user_id || v.owner?.mid || '')

  // 2. 单次心跳（played 秒处，playType: 1=开播 0=播放中 4=结束）
  const beat = async (played, playType) => {
    const body = {
      aid: String(v.aid), bvid: v.bvid, cid: String(v.cid), mid,
      played_time: String(played), real_played_time: String(played), realtime: String(played),
      start_ts: String(startTs), type: '3', sub_type: '0', dt: '2', play_type: String(playType),
      auto_continued_play: '0', quality: '80', video_duration: String(duration),
      last_play_progress_time: String(played), max_play_progress_time: String(played),
      refer_url: 'https://www.bilibili.com/', outer: '0', spmid: '333.788.0.0',
      from_spmid: '333.1007.tianma.1-1-1.click',
    }
    const r = await fetch('https://api.bilibili.com/x/click-interface/web/heartbeat', {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
    return r.json().catch(() => ({}))
  }

  // 3. 开播心跳 → 每 interval 秒心跳 → 结束心跳
  await beat(0, 1)
  let played = 0
  let aborted = false
  while (played < target) {
    const step = Math.min(interval, target - played)
    const ok = await sleep(step * 1000, signal)
    played += step
    if (!ok) { aborted = true; break }
    await beat(played, played >= target ? 4 : 0)
    onTick?.(played)
  }

  // 4. 历史记录兜底（确保「历史记录」页能看到进度）
  await fetch('https://api.bilibili.com/x/v2/history/report', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ aid: String(v.aid), cid: String(v.cid), progress: String(played) }).toString(),
  }).catch(() => {})

  return { bvid: v.bvid, aid: v.aid, title: v.title, owner: v.owner?.name || '', duration, played, aborted }
}
