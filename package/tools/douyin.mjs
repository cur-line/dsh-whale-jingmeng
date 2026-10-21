// 抖音接入（2026-10-21 主人定：「试着弄进来看看，能不能接入」）
//
// 边界：**只读，不登录、不评论、不发**。
//   · 官方 API 要企业认证（open.douyin.com），个人拿不到 ✗
//   · 网页版搜索要登录 + a_bogus/X-Bogus 签名，对抗成本高、易封号 ✗
//   · 唯一稳定可用的公开入口：热点榜 `/aweme/v1/web/hot/search/list/`（无签名直出 200 ✓）
//
// 用途：热点词 → 灵感池（她每天 14:00 前的灵感文稿里加一节「抖音热词」），
//       让她刷 B站/小红书之外还能感知"今天全网在聊什么"。
//
// 用法：
//   node douyin.mjs fetch [--top 15]     拉最新热点榜，存 ~/.dsh/douyin/hot.json
//   node douyin.mjs status                看上次抓到的热词（只读本地）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { logEvent } from './lib/event-log.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const DIR = path.join(HOME, '.dsh', 'douyin')
const FILE = path.join(DIR, 'hot.json')

const argv = process.argv.slice(2)
const cmd = argv[0]
const TOP = Number(argv[argv.indexOf('--top') + 1] ?? 15) || 15

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HOT_URL = 'https://www.douyin.com/aweme/v1/web/hot/search/list/?' +
  'device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1'

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
const today = () => new Date().toLocaleDateString('sv-SE')

async function fetchHot() {
  const r = await fetch(HOT_URL, {
    headers: {
      'user-agent': UA,
      referer: 'https://www.douyin.com/',
      accept: 'application/json, text/plain, */*',
    },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  if (j.status_code !== 0) throw new Error(`抖音返回 status_code=${j.status_code}（可能需要登录/风控）`)
  const wl = j?.data?.word_list ?? []
  if (!Array.isArray(wl) || !wl.length) throw new Error('热点榜为空')
  const items = wl.slice(0, TOP).map((w, i) => ({
    rank: i + 1,
    word: String(w.word ?? '').trim(),
    hot: w.hot_value ?? 0,
    label: w.label ?? null,
    eventType: w.event_type ?? null,
    url: w.sentence_tag ? `https://www.douyin.com/hot/${encodeURIComponent(w.word)}` : null,
    sentence: Array.isArray(w.sentence_list) && w.sentence_list.length
      ? w.sentence_list.map((s) => String(s.sentence ?? '')).filter(Boolean).join(' / ')
      : '',
  })).filter((x) => x.word)
  if (!items.length) throw new Error('热点词全为空')
  return { at: new Date().toISOString(), date: today(), top: TOP, items }
}

if (cmd === 'fetch') {
  try {
    const data = await fetchHot()
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8')
    console.log(`✓ 抖音热点榜已更新（${data.items.length} 条）→ ${FILE}`)
    for (const it of data.items.slice(0, 5)) {
      console.log(`  ${it.rank}. ${it.word}（热度 ${it.hot}）${it.sentence ? '· ' + it.sentence.slice(0, 24) : ''}`)
    }
    try {
      logEvent('douyin-hot', { target: null, note: `抖音热点榜 ${data.items.length} 条（${data.items[0]?.word ?? ''}…）`, meta: { top: TOP } })
    } catch {}
    process.exit(0)
  } catch (e) {
    console.error(`✗ 抖音热点拉取失败：${String(e.message).slice(0, 200)}`)
    process.exit(2)
  }
}

if (cmd === 'status') {
  const d = readJson(FILE, null)
  if (!d) { console.log('（还没抓过抖音热点。先跑 node douyin.mjs fetch）'); process.exit(0) }
  console.log(`上次抓取：${d.date} ${new Date(d.at).toLocaleTimeString('zh-CN', { hour12: false })} · ${d.items.length} 条`)
  for (const it of d.items.slice(0, 15)) {
    console.log(`  ${it.rank}. ${it.word}（热度 ${it.hot}）`)
  }
  process.exit(0)
}

console.log('用法: node douyin.mjs fetch [--top 15] | status')
process.exit(2)
