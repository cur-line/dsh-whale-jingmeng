// 特别关注 —— 名单里的人发新视频，鲸檬优先看、优先互动。
//
// 为什么有它（2026-10-21 借鉴 yangyu-bot 云养鱼项目）：
//   对鲸檬来说，主人（以及以后小红书主人号）发的每一条都不能错过——
//   那是"偶像发新货"级别的关注度。这里用一个请求拉关注人动态流，
//   只挑名单里的人 + 最近 72 小时内 + 还没看过的，交给调用方去真正看/互动。
//
// 名单从统一配置读：config.vip.users = [{ uid, name }]（B站）
// 数据缓存在 ~/.dsh/bili-vip.json：{ lastCheckAt, seen: [bvid...], done: {<date>:{n}} }
//
// 用法：
//   import { fetchVipDynamics } from '../lib/vip.mjs'
//   const vids = await fetchVipDynamics(cred, cfg)

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const FILE = path.join(HOME, '.dsh', 'bili-vip.json')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function readState() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} }
}
function writeState(s) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n')
}

/**
 * 捞特别关注的人最近 72h 发的新视频（未看过的）。
 * @param {object} cred 凭据
 * @param {object} cfg  完整配置（取 cfg.vip）
 * @returns {Promise<Array<{bvid, title, uid, name, owner}>>}
 */
export async function fetchVipDynamics(cred, cfg) {
  const vip = cfg?.vip ?? {}
  const users = Array.isArray(vip.users) ? vip.users : []
  if (!users.length) return []
  const uids = new Set(users.map((u) => String(u.uid)))
  const H = {
    'user-agent': UA,
    referer: 'https://t.bilibili.com/',
    cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}${cred.buvid3 ? `; buvid3=${cred.buvid3}` : ''}`,
  }

  // 关注人动态流（分页往下翻，最多翻到找出全部特别关注为止，保险翻 3 页）
  const candidates = []
  for (let pg = 1; pg <= 3; pg++) {
    const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=video&page=${pg}`
    const r = await fetch(url, { headers: H })
    const j = await r.json().catch(() => ({}))
    const items = j.data?.items ?? []
    if (!items.length) break
    for (const it of items) {
      const mod = it.modules?.module_author
      const uid = String(mod?.mid ?? '')
      if (!uids.has(uid)) continue
      const dynamic = it.modules?.module_dynamic?.major?.archive
      if (!dynamic?.bvid) continue
      candidates.push({
        bvid: dynamic.bvid,
        title: dynamic.title || '',
        uid,
        name: mod.name || '',
        owner: mod.name || '',
        pubTs: Number(it.modules?.module_author?.pub_ts || 0),
      })
    }
    // 至少翻到每个特别关注都有候选，或没有更多了
    if (new Set(candidates.map((c) => c.uid)).size >= uids.size) break
  }

  const st = readState()
  const seen = new Set(st.seen || [])
  const now = Date.now()
  const fresh72h = 72 * 60 * 60 * 1000

  const fresh = candidates
    .filter((c) => !seen.has(c.bvid))
    .filter((c) => (now - (c.pubTs || 0) * 1000) < fresh72h)

  // 记下来本次看到的（避免反复捞同一条）
  writeState({ ...st, lastCheckAt: new Date().toISOString(), seen: [...seen, ...fresh.map((c) => c.bvid)] })
  return fresh
}

/** 每天最多追几条（Vip.dailyMax，默认 6） */
export function vipDailyLeft(cfg) {
  const st = readState()
  const today = new Date().toLocaleDateString('sv-SE')
  const max = Number(cfg?.vip?.dailyMax) || 6
  const done = st.done?.[today] || 0
  return Math.max(0, max - done)
}

/** 记一条已处理（今天 +n） */
export function markVipDone(bvid) {
  const st = readState()
  const today = new Date().toLocaleDateString('sv-SE')
  writeState({
    ...st,
    seen: [...(st.seen || []), bvid],
    done: { ...(st.done || {}), [today]: ((st.done?.[today] || 0) + 1) },
  })
}