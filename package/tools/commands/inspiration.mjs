// 每日灵感文稿（2026-10-21 加，主人定）——
//
// 她每天下午 14:00 前整理出一篇「灵感文稿」给主人：
//   从 B 站视频 / 评论（别人视频的评论 + 自己视频下的评论）、小红书笔记 / 评论、
//   收藏夹（favorites.json）里收集素材 → 提炼 3-5 个点子（可做视频或文案）。
//   视频制作 / 审核 / 发布是主人的事；鲸只负责「提想法和点子」。
//
// 用法:
//   node inspiration.mjs collect [--hours 24] [--dry]  收集素材并生成点子（默认存文件）
//   node inspiration.mjs list                           看今天/最近的灵感文稿
//   node inspiration.mjs show <日期>                    看某一篇
//
// 产物: ~/.dsh/creations/<日期>-灵感.md（14:00 前由调度器/会话触发）
//
// 设计：
//   · 素材来源：收藏夹（带理由）+ 最近 24h 的 B站/小红书事件（feed/debrief/comment/xhs-*）
//   · 点子格式：每个点子含「来源 / 一句话点子 / 可做视频或文案」
//   · 3-5 个，宁缺毋滥：素材不够就只写够得着的，不硬凑
//   · 落盘 + 可选推送（--push 走 notify.mjs）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { logEvent, readEvents } from '../lib/event-log.mjs'
import { todayMood } from '../lib/mood.mjs'
import { config } from '../lib/config.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const DSH = path.join(HOME, '.dsh')
const BILI = path.join(HOME, '.bili-ai')
const CREATIONS = path.join(DSH, 'creations')

const argv = process.argv.slice(2)
const cmd = argv[0]
const DRY = argv.includes('--dry')
const PUSH = argv.includes('--push')
const HOURS = Number(argv[argv.indexOf('--hours') + 1] ?? 24) || 24

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
const today = () => new Date().toLocaleDateString('sv-SE')

/** 素材：收藏夹（带理由） */
function favMaterials() {
  const favs = readJson(path.join(BILI, 'favorites.json'), null)
  if (!Array.isArray(favs?.items) || !favs.items.length) return []
  return favs.items.map((f) => ({
    source: `B站收藏「${f.kind ?? '其他'}」${f.title ?? f.bv}`,
    link: f.bv ? `https://www.bilibili.com/video/${f.bv}` : null,
    why: f.reason ?? '',
    at: f.at ?? '',
  }))
}

/** 素材：最近 N 小时的 B站 + 小红书事件 */
function eventMaterials(hours) {
  const events = readEvents(400)
  const cutoff = Date.now() - hours * 3600_000
  const out = []
  for (const e of events) {
    try {
      const at = new Date(e.at ?? '').getTime()
      if (!Number.isFinite(at) || at < cutoff) continue
      const k = String(e.kind ?? '')
      // 排除撤销/状态类噪音（取消点赞、查状态不算灵感）
      const meta = e.meta ?? {}
      if (meta.undo === true || String(meta.action ?? '') === 'status') continue
      // B站：读懂/评论/点赞收藏/创作简报
      if (['debrief', 'comment-post', 'share-comment', 'interact', 'create-brief', 'fav'].includes(k)) {
        out.push({
          source: `B站${k}${e.target ? ' ' + e.target : ''}`,
          link: String(e.target ?? '').startsWith('BV')
            ? `https://www.bilibili.com/video/${e.target}`
            : null,
          why: String(e.note ?? ''),
          at: e.at,
          kind: k,
        })
      }
      // 小红书：读/评论/点赞收藏
      if (k.startsWith('xhs-')) {
        out.push({
          source: `小红书${k.replace('xhs-', '')}${e.target ? ' ' + e.target : ''}`,
          link: null,
          why: String(e.note ?? ''),
          at: e.at,
          kind: k,
        })
      }
    } catch { /* 坏行跳过 */ }
  }
  return out
}

/** 素材：抖音热点词（2026-10-21 加，只读接入） */
function douyinHot() {
  const d = readJson(path.join(DSH, 'douyin', 'hot.json'), null)
  if (!Array.isArray(d?.items) || !d.items.length) return []
  const dateOk = String(d.date ?? '') === today() || (Date.now() - new Date(d.at ?? 0).getTime()) < 24 * 3600_000
  if (!dateOk) return []
  return d.items.slice(0, 8).map((it) => ({
    source: `抖音热词#${it.word}`,
    link: it.url,
    why: `全网在聊「${it.word}」（热度 ${it.hot}）${it.sentence ? '· ' + it.sentence.slice(0, 40) : ''}`,
    at: d.at,
    kind: 'douyin-hot',
  }))
}

/** 把素材折叠成候选点子（先挑"有理由/有笔记"的，标题只做点缀） */
function draftIdeas(favs, events) {
  const ideas = []
  // 收藏夹：理由即灵感
  for (const f of favs.slice(0, 4)) {
    if (!f.why) continue
    ideas.push({
      source: f.source,
      link: f.link,
      idea: f.why,
      canDo: '可做视频或文案',
    })
  }
  // 事件：读懂/评论过的内容，整理成"还可以再挖"的角度
  for (const e of events) {
    if (!e.why || ideas.length >= 5) break
    if (ideas.some((i) => i.source === e.source)) continue
    ideas.push({
      source: e.source,
      link: e.link,
      idea: `从「${e.why.slice(0, 40)}」里挖一个还没讲透的角度`,
      canDo: '可做视频或文案',
    })
  }
  return ideas.slice(0, 5)
}

/** 生成 Markdown 文稿 */
function render(ideas, favs, events, dyHot = []) {
  const mood = todayMood()
  const head = [
    `# ${today()} 灵感文稿`,
    '',
    `> 🐳 ${mood.line}`,
    '> 鲸檬今天的想法收集（来源：B站视频/评论、小红书笔记/评论、收藏夹、抖音热点）。',
    '> 视频制作 / 审核 / 发布由主人负责；这里只提供点子。',
    '',
  ]
  const lines = [...head]
  if (!ideas.length) {
    lines.push('（今天素材少，还没有值得提的点子 —— 宁缺毋滥，明天继续。）')
  } else {
    ideas.forEach((it, i) => {
      lines.push(`## 点子 ${i + 1}`)
      lines.push(`- **来源**：${it.source}${it.link ? `（${it.link}）` : ''}`)
      lines.push(`- **一句话点子**：${it.idea}`)
      lines.push(`- **可做**：${it.canDo}`)
      lines.push('')
    })
  }
  if (dyHot.length) {
    lines.push('## 今天全网在聊（抖音热词 · 只读）')
    for (const d of dyHot) {
      lines.push(`- **${d.source}**：${d.why}${d.link ? `（${d.link}）` : ''}`)
    }
    lines.push('')
  }
  lines.push('---')
  lines.push(`（素材：收藏 ${favs.length} 条 · 事件 ${events.length} 条 · 抖音热词 ${dyHot.length} 条）`)
  return lines.join('\n')
}

if (cmd === 'collect') {
  const favs = favMaterials()
  const events = eventMaterials(HOURS)
  const dy = douyinHot()
  // 抖音热词只作为"今天全网在聊什么"的背景，不硬凑进 3-5 个点子，
  // 但可以给它一个专门小节，让主人知道她感知到抖音了。
  const ideas = draftIdeas(favs, events)
  const md = render(ideas, favs, events, dy)
  const dir = CREATIONS
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, `${today()}-灵感.md`)
  if (!DRY) fs.writeFileSync(p, md, 'utf8')
  console.log(md)
  console.log(`\n${DRY ? '[dry] 未写文件。' : `已保存：${p}`}`)
  if (DRY) process.exit(0)

  try {
    logEvent('inspiration', { target: null, note: `灵感文稿 ${ideas.length} 个点子` })
  } catch {}

  if (PUSH) {
    try {
      const notifyMjs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'notify.mjs')
      execFileSync(process.execPath, [notifyMjs, `今日灵感 ${ideas.length} 个点子已整理，详见文件：${p}`, '--title', '鲸檬·灵感文稿'], { stdio: 'inherit' })
      console.log('[推送] 已通知主人')
    } catch (e) {
      console.error(`[推送] 失败：${String(e.message).slice(0, 100)}`)
    }
  }
  process.exit(0)
}

if (cmd === 'list') {
  const files = fs.existsSync(CREATIONS)
    ? fs.readdirSync(CREATIONS).filter((f) => f.includes('灵感')).sort().reverse()
    : []
  if (!files.length) { console.log('（还没有灵感文稿）'); process.exit(0) }
  console.log('最近的灵感文稿:')
  for (const f of files.slice(0, 8)) console.log(`  ${f}  ${path.join(CREATIONS, f)}`)
  process.exit(0)
}

if (cmd === 'show') {
  const day = argv[1] ?? today()
  const p = path.join(CREATIONS, `${day}-灵感.md`)
  if (!fs.existsSync(p)) { console.error(`没有 ${day} 的灵感文稿：${p}`); process.exit(2) }
  console.log(fs.readFileSync(p, 'utf8'))
  process.exit(0)
}

console.log('用法: node inspiration.mjs collect [--hours 24] [--dry] [--push] | list | show <日期>')
process.exit(2)
