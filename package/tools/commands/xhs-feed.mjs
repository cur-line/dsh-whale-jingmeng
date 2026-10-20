// 选题器（只读）—— 小红书版的 feed。
//
// 与 B 站 feed.mjs 的差别（重要）：
//   B 站靠 WBI 签名接口硬算；小红书所有接口都要求 id + xsec_token 成对出现，
//   而 xsec_token 是**每次进入时动态生成**的，过一会儿就失效。
//   所以这里不做长缓存，选出来的每条都带上它自己的 token 一起交出去。
//
// 用法：
//   node xhs.mjs feed                     首页推荐流
//   node xhs.mjs feed --keyword "AI 工具"   关键词搜索
//   node xhs.mjs feed --n 8 --json
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { listFeeds, searchFeeds, normalizeFeed, XhsError } from '../lib/xhs-client.mjs'
import { config } from '../lib/config.mjs'
import { logEvent } from '../lib/event-log.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) continue
  const k = argv[i].slice(2)
  const v = argv[i + 1]
  if (v && !v.startsWith('--')) { opt[k] = v; i += 1 } else { opt[k] = true }
}
const N = Number(opt.n ?? 6)
const KEYWORD = typeof opt.keyword === 'string' ? opt.keyword : ''
const AS_JSON = !!opt.json

// ── 偏好（与 B 站共用同一个配置文件，她只有一副口味）──
const prefs = config().preferences?.like ?? []
const dislike = config().preferences?.dislike ?? []

// ── 看过的（B 站看过的 BV 与本平台无关；这里只排除**本平台**看过的笔记 id）──
const seenFile = path.join(HOME, '.dsh', 'xhs-seen.json')
let seen = new Set()
try { seen = new Set(JSON.parse(fs.readFileSync(seenFile, 'utf8'))) } catch { /* 没有就是第一次 */ }

function score(f) {
  const text = `${f.title} ${f.desc}`.toLowerCase()
  let s = 0
  for (const p of prefs) if (text.includes(String(p).toLowerCase())) s += 3
  for (const d of dislike) if (text.includes(String(d).toLowerCase())) s -= 4
  // 互动量做温和加权（不唯流量论，与 B 站"不看播放量"的口径一致）
  const like = Number(String(f.liked).replace(/[^\d]/g, '')) || 0
  if (like >= 10000) s += 2
  else if (like >= 1000) s += 1
  if (seen.has(f.id)) s -= 100  // 看过的基本不重复推
  return s
}

let raw = []
let source = ''
try {
  if (KEYWORD) {
    source = `关键词「${KEYWORD}」`
    raw = await searchFeeds(KEYWORD)
  } else {
    source = '首页推荐流'
    raw = await listFeeds()
  }
} catch (e) {
  console.error(`取内容失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  process.exit(1)
}

// 返回值可能是数组，也可能包在 {items:[...]} / {feeds:[...]} 里
const list = Array.isArray(raw) ? raw
  : Array.isArray(raw?.items) ? raw.items
  : Array.isArray(raw?.feeds) ? raw.feeds
  : Array.isArray(raw?.data) ? raw.data
  : []

const items = list
  .map(normalizeFeed)
  .filter((f) => f.id && f.xsecToken)          // 缺 token 的后面根本打不开，直接丢
  .map((f) => ({ ...f, score: score(f) }))
  .sort((a, b) => b.score - a.score)
  .slice(0, N)

if (AS_JSON) {
  console.log(JSON.stringify({ source, count: items.length, items }, null, 2))
  process.exit(items.length ? 0 : 1)
}

if (!items.length) {
  console.log(`（${source}没有可用条目）`)
  console.log('可能原因：① 没登录 ② 首页流为空 ③ 关键词没结果')
  process.exit(1)
}

console.log(`选题来源：${source}　偏好命中加权已生效\n`)
items.forEach((f, i) => {
  const tags = []
  if (f.liked) tags.push(`赞 ${f.liked}`)
  if (f.collected) tags.push(`藏 ${f.collected}`)
  if (f.commentCount) tags.push(`评 ${f.commentCount}`)
  if (f.type === 'video') tags.push('视频')
  console.log(`${i + 1}. ${f.title || '(无标题)'}${f.score > 0 ? '  ★' + f.score : ''}`)
  console.log(`   ${f.author || '未知作者'}${tags.length ? ' · ' + tags.join(' · ') : ''}`)
  if (f.desc) console.log(`   ${String(f.desc).replace(/\s+/g, ' ').slice(0, 80)}`)
  console.log(`   id=${f.id}`)
  console.log(`   token=${f.xsecToken}`)
  console.log()
})

try {
  logEvent('xhs-feed', { note: `${source} 选出 ${items.length} 条`, meta: { source, count: items.length } })
} catch { /* 日志失败不影响主流程 */ }

console.log('读懂某条：node xhs.mjs read <id> --token <token>')
