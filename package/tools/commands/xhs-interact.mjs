// 互动（点赞 / 收藏 / 评论）—— 会真的发出去，所以闸门最严。
//
// 安全设计（沿袭 B 站那套缰绳，不放宽）：
//   1. 必须显式 --dry（只打印将要做什么）或 --go（真的做）—— 两个都不给就退出 2。
//   2. 每次动作前过**小红书自己的**限额账本（~/.dsh/xhs/quota.json）。
//      不共用 B 站那本 —— 否则两边额度会互相吃掉。
//   3. 同一目标 7 天内不重复（与 B 站口径一致，避免刷屏感）。
//   4. 评论正文要落盘留证（~/.dsh/xhs/commented.json），事后可查可删。
//   5. 写完回读验证，不假设成功。
//
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { likeFeed, favoriteFeed, commentFeed, feedDetail, normalizeFeed, splitDetail, XhsError } from '../lib/xhs-client.mjs'
import * as xhsQuota from '../lib/xhs-quota.mjs'
import { logEvent } from '../lib/event-log.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const AUDIT = path.join(HOME, '.dsh', 'xhs', 'commented.json')
const SEVEN_DAYS = 7 * 24 * 3600 * 1000

const argv = process.argv.slice(2)
const opt = {}
const pos = []
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = argv[i + 1]
    if (v && !v.startsWith('--')) { opt[k] = v; i += 1 } else { opt[k] = true }
  } else pos.push(a)
}

const xsecToken = opt.token ?? opt.xsec_token
const DRY = !!opt.dry
const GO = !!opt.go
const UNDO = !!opt.undo
const TEXT = typeof opt.text === 'string' ? opt.text : ''
// 评论待审（2026-10-21 老板要求：评论回复必须过审）：--draft 写草稿、--approved <id> 才允许真发
const DRAFT = !!opt.draft
const APPROVED = typeof opt.approved === 'string' ? opt.approved : ''
const WHO = typeof opt.who === 'string' ? opt.who : ''
const SRC = typeof opt.src === 'string' ? opt.src : ''

// like / fav / comment 三个入口共用本文件，动作由**第一个位置参数**给出。
// 前两个用法：node xhs.mjs like  <feed_id> --token <t>
// 后一个用法：node xhs.mjs like like <feed_id> --token <t>   （xhs.mjs 会同时传动作名，兼容着吃掉）
const ACTIONS = ['like', 'fav', 'comment']
const sub = ACTIONS.includes(pos[0]) ? pos.shift() : null
const actualFeedId = pos[0]
const actualToken = xsecToken

function die(msg, code = 2) {
  console.error(msg)
  process.exit(code)
}

// ── 参数校验 ──
if (!sub) {
  die(`必须指定动作：${ACTIONS.join(' / ')}
例：node xhs.mjs like <feed_id> --token <xsec_token> --dry`)
}
if (!actualFeedId) die(`缺 feed_id。用法：node xhs.mjs ${sub} <feed_id> --token <xsec_token> --dry|--go`)
if (!actualToken) die('缺 --token <xsec_token>。先跑 node xhs.mjs feed 取一个。')
if (!DRY && !GO && !DRAFT) {
  die([
    '⚠️  必须显式选择模式 —— 不给默认值，避免误发。',
    `   node xhs.mjs ${sub} ${actualFeedId} --token ${actualToken} --dry    # 只打印，不动手`,
    `   node xhs.mjs ${sub} ${actualFeedId} --token ${actualToken} --go     # 真的发出去（评论另需 --approved）`,
    sub === 'comment' ? `   node xhs.mjs comment ${actualFeedId} --token ${actualToken} --text "…" --draft   # 写进待审队列等主人批 ✓` : '',
  ].filter(Boolean).join('\n'))
}
if (DRY && GO) die('--dry 和 --go 不能同时给。')
if (sub === 'comment' && !TEXT.trim()) die('评论必须给 --text "…"')
if (sub === 'comment' && TEXT.length > 300) {
  die(`评论太长（${TEXT.length} 字）。小红书评论区建议 ≤300 字，短一点更像人。`)
}

// ── 评论待审闸（2026-10-21 老板要求：评论/回复必须过审）────────────────────
// 小红书这边以前是 `--go` 直接发出去 ✗。现在跟 B 站一个口径：
//   写草稿（--draft）→ 落 ~/.dsh/xhs/pending-comments.json → 主人在「养鱼 → 待审核」点「发」才发。
//   --go 只有在带 `--approved <id>`（且草稿真在队列里）时才放行 —— 代码强制，不靠自觉。
const XHS_PENDING = path.join(HOME, '.dsh', 'xhs', 'pending-comments.json')
const readPending = () => { try { return JSON.parse(fs.readFileSync(XHS_PENDING, 'utf8')).items ?? [] } catch { return [] } }
const writePending = (items) => {
  fs.mkdirSync(path.dirname(XHS_PENDING), { recursive: true })
  fs.writeFileSync(XHS_PENDING, JSON.stringify({ items }, null, 2) + '\n')
}
if (sub === 'comment') {
  if (DRAFT && (DRY || GO)) die('--draft 不能和 --dry/--go 同时给（--draft 就是写草稿、先不发）。')
  if (GO && !APPROVED) {
    die([
      '✗ 小红书评论必须先过审（老板 2026-10-21 定的硬规矩）',
      '  正确姿势：加 --draft 写草稿 → 等主人在「养鱼 → 待审核」点「发」。',
      '  面板点「发」时插件会自动带上 --approved <id> ✓（你自己拼一个 id 也没用，要真在队列里 ✓）',
    ].join('\n'), 3)
  }
  if (APPROVED && !readPending().some((it) => String(it.id) === APPROVED)) {
    die(`✗ --approved ${APPROVED} 不在待审队列里（可能已发或被删）→ 拒绝发送`, 3)
  }
}

// ── 读一遍目标，确认它存在（也顺便拿到标题，留证用）──
// 注意：详情返回是三层嵌套（data.data.note），必须走 splitDetail —— 少拆一层标题会是空的。
let noteTitle = ''
let noteAuthor = ''
try {
  const d = await feedDetail(String(actualFeedId), String(actualToken))
  const { note } = splitDetail(d)
  const card = normalizeFeed({ ...note, id: actualFeedId, xsec_token: actualToken }) ?? {}
  noteTitle = card.title || ''
  noteAuthor = card.author || ''
} catch (e) {
  console.error(`读不到这条笔记：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  die('（不确定目标存在就不动手）', 1)
}

// ── 去重：同一目标 7 天内不重复 ──
let audit = {}
try { audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8')) } catch { audit = {} }
const key = `${sub}:${actualFeedId}`
const lastAt = audit[key]
if (lastAt && Date.now() - new Date(lastAt).getTime() < SEVEN_DAYS && !UNDO) {
  die(`✗ 7 天内已经${sub === 'like' ? '点赞' : sub === 'fav' ? '收藏' : '评论'}过这条了（${lastAt}）\n  要重复的话，显式加 --undo 或换一条。`)
}

// ── 限额闸（--dry 也要过，这样能提前看到"会不会被拦"）──
// 用小红书自己的账本（~/.dsh/xhs/quota.json），不走 B 站那本 ——
// 否则"在 B 站点过赞"会把这里的小红书额度吃掉，两个平台混算。
// 限额值直接读配置 xhs.likeDaily / collectDaily / commentDaily，不写死。
let q = { ok: true, used: 0, limit: 0, reason: '' }
try {
  q = xhsQuota.check(sub)
} catch (e) {
  die(`限额闸异常：${e.message}`, 1)
}
if (!q.ok) {
  die(`✗ ${q.reason}\n  今日已用 ${q.used}/${q.limit}。不是故障，是缰绳。`, 2)
}
console.log(`[限额闸] ✓ ${sub} ${q.used}/${q.limit}（小红书独立账本）`)

// ── 写草稿（--draft）：进待审队列就收工 —— 不发送、不记账、不留证 ✓ ──
if (sub === 'comment' && DRAFT) {
  const queue = readPending()
  const id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  queue.push({
    id, platform: 'xhs', feedId: String(actualFeedId), token: String(actualToken), text: TEXT,
    who: WHO, src: SRC, title: noteTitle, author: noteAuthor, at: new Date().toISOString(),
  })
  writePending(queue)
  console.log(`✓ 已写进待审队列（id ${id}）· ${noteTitle || actualFeedId}`)
  console.log('  等主人在「养鱼 → 待审核」点「发」；他不点，这条就不会出去 ✓')
  process.exit(0)
}

// ── 干跑 ──
const actionLabel = sub === 'like' ? (UNDO ? '取消点赞' : '点赞')
  : sub === 'fav' ? (UNDO ? '取消收藏' : '收藏')
  : '评论'

if (DRY) {
  console.log('[--dry 只打印，什么都没做]\n')
  console.log(`将要${actionLabel}：${noteTitle || '(无标题)'}${noteAuthor ? '　@' + noteAuthor : ''}`)
  console.log(`  feed_id = ${actualFeedId}`)
  console.log(`  token   = ${String(actualToken).slice(0, 12)}…（${String(actualToken).length} 字）`)
  if (sub === 'comment') console.log(`  正文    = ${TEXT}（${TEXT.length} 字）`)
  console.log()
  console.log('确认无误就去掉 --dry 换成 --go。')
  process.exit(0)
}

// ── 真做 ──
console.log(`正在${actionLabel}：${noteTitle || actualFeedId} …`)
try {
  if (sub === 'like') await likeFeed(String(actualFeedId), String(actualToken), UNDO)
  else if (sub === 'fav') await favoriteFeed(String(actualFeedId), String(actualToken), UNDO)
  else await commentFeed(String(actualFeedId), String(actualToken), TEXT)
} catch (e) {
  console.error(`✗ ${actionLabel}失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  // 风控/验证码类错误：立刻停手，不重试、不换号
  if (/验证|风控|频繁|too many|captcha|risk/i.test(e.message)) {
    console.error('  ⚠️ 撞上风控信号。按要求立即停手：不重试、不换号、不改设备。')
    try { logEvent('risk', { note: `小红书${actionLabel}被风控: ${e.message}`, meta: { feedId: actualFeedId, sub } }) } catch {}
  }
  try { logEvent('error', { note: `小红书${actionLabel}失败: ${e.message}`, meta: { feedId: actualFeedId, sub } }) } catch {}
  process.exit(1)
}

console.log(`✓ 已${actionLabel}`)

// ── 回读验证（不假设成功）──
// 用 splitDetail 拆三层；旧写法读 card.interact_info 永远拿不到东西，等于静默跳过验证。
try {
  const v = await feedDetail(String(actualFeedId), String(actualToken))
  const { note, comments: cs } = splitDetail(v)
  const info = note?.interactInfo ?? note?.interact_info ?? {}
  if (sub === 'comment') {
    // 小红书评论区是懒加载，刚发的往往不在首屏 —— 找不到不能判定为失败
    const found = JSON.stringify(cs ?? []).includes(TEXT.slice(0, 20))
    console.log(found
      ? '  回读：评论区已能看到这条 ✓'
      : '  回读：首屏评论里暂时没刷出这条（评论区懒加载，属正常；去 App 确认更准）')
  } else {
    const liked = info.liked
    const collected = info.collected
    if (liked !== undefined || collected !== undefined) {
      const flag = sub === 'like' ? `liked=${liked}` : `collected=${collected}`
      console.log(`  回读：${flag}（期望 ${!UNDO}；平台数字有延迟，以标记位为准）`)
    } else {
      console.log('  回读：接口没返回标记位（服务版本差异），以刚才的返回为准')
    }
  }
} catch { console.log('  回读失败（不影响已完成的动作）') }

// ── 记账 + 留证 ──
try { xhsQuota.record(sub, `${actionLabel}: ${noteTitle}`) } catch {}
try {
  audit[key] = new Date().toISOString()
  fs.mkdirSync(path.dirname(AUDIT), { recursive: true })
  fs.writeFileSync(AUDIT, JSON.stringify(audit, null, 2))
} catch { /* 审计失败不影响主流程，但要让人知道 */ console.error('  （警告：审计记录没写进去）') }

try {
  logEvent(sub === 'comment' ? 'xhs-comment' : `xhs-${sub}`, {
    target: actualFeedId,
    note: `${actionLabel}「${noteTitle}」`,
    meta: { author: noteAuthor, undo: UNDO, text: sub === 'comment' ? TEXT : undefined },
  })
} catch {}
