// 读懂一条笔记 —— 小红书版的 debrief（只读，不产生任何对外动作）。
//
// 与 B 站 debrief.mjs 的差别：那边要 WBI 签名拿字幕、抽帧、看弹幕；
// 小红书笔记是图文为主，能读的就是 正文 + 图片数量 + 互动数 + 评论区。
// 所以这里不做"分析框架"，只把原料完整摊平，交给鲸檬自己去想。
//
// 用法：node xhs.mjs read <feed_id> --token <xsec_token> [--json] [--comments 20]
import { feedDetail, normalizeFeed, splitDetail, XhsError } from '../lib/xhs-client.mjs'
import { logEvent } from '../lib/event-log.mjs'

const argv = process.argv.slice(2)
const pos = []
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = argv[i + 1]
    if (v && !v.startsWith('--')) { opt[k] = v; i += 1 } else { opt[k] = true }
  } else pos.push(a)
}

const feedId = pos[0] ?? opt.id
const xsecToken = opt.token ?? opt.xsec_token
const AS_JSON = !!opt.json
const MAX_COMMENTS = Number(opt.comments ?? 20)

if (!feedId || !xsecToken) {
  console.error('用法: node xhs.mjs read <feed_id> --token <xsec_token>')
  console.error('（两个都要：小红书详情接口强制要求 id 与 xsec_token 成对）')
  console.error('不知道 token？先跑 node xhs.mjs feed 拿到。')
  process.exit(2)
}

let raw
try {
  raw = await feedDetail(String(feedId), String(xsecToken))
} catch (e) {
  console.error(`读取失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  if (e.code === 'NOT_LOGGED_IN') console.error('  没登录的话：node xhs.mjs login')
  if (/xsec|token/i.test(e.message)) console.error('  token 可能过期了。重新跑 node xhs.mjs feed 取一个新鲜的。')
  process.exit(1)
}

// 真实结构是三层（data.data.note / data.data.comments），交给 lib 里的 splitDetail 拆，
// 不要在命令里手写层级 —— 少拆一层就会"读得到标题读不到评论"。
const { note: noteRaw, comments: commentList, hasMore } = splitDetail(raw)
const base = normalizeFeed({ ...noteRaw, id: feedId, xsec_token: xsecToken })

function flattenComment(c, depth = 0) {
  if (!c) return []
  const u = c.userInfo ?? c.user_info ?? c.user ?? {}
  const out = [{
    id: c.id ?? '',
    depth,
    author: u.nickname ?? u.nickName ?? u.nick_name ?? '',
    userId: u.userId ?? u.user_id ?? '',
    content: c.content ?? c.text ?? '',
    like: c.likeCount ?? c.like_count ?? '',
    ip: c.ipLocation ?? '',
    time: c.createTime ?? c.create_time ?? '',
    isAuthor: !!(Array.isArray(c.showTags) ? c.showTags.includes('is_author')
      : Array.isArray(c.show_tags) ? c.show_tags.includes('is_author') : c.is_author),
  }]
  const subs = c.subComments ?? c.sub_comments ?? []
  if (Array.isArray(subs)) for (const s of subs) out.push(...flattenComment(s, depth + 1))
  return out
}

const comments = commentList.flatMap((c) => flattenComment(c)).slice(0, MAX_COMMENTS)

const imgs = noteRaw.imageList ?? noteRaw.image_list ?? noteRaw.images ?? []

if (AS_JSON) {
  console.log(JSON.stringify({ note: base, images: imgs, comments, hasMore }, null, 2))
  process.exit(0)
}

// ── 人类可读输出 ──
console.log('━━━ 笔记 ━━━')
console.log(base.title || '(无标题)')
console.log(`作者：${base.author || '未知'}${base.type === 'video' ? '　[视频]' : ''}${base.ipLocation ? '　IP ' + base.ipLocation : ''}`)
if (base.liked) console.log(`赞 ${base.liked}　藏 ${base.collected || '-'}　评 ${base.commentCount || '-'}`)
console.log()
console.log(base.desc || '(正文为空)')
console.log()

if (Array.isArray(imgs) && imgs.length) {
  console.log(`图片 ${imgs.length} 张`)
  console.log()
}

if (comments.length) {
  console.log(`━━━ 评论（前 ${comments.length} 条，含子评论）━━━`)
  for (const c of comments) {
    const indent = '  '.repeat(c.depth)
    const who = c.isAuthor ? `${c.author}(作者)` : c.author
    const like = c.like ? ` · 赞${c.like}` : ''
    console.log(`${indent}· ${who}${like}`)
    console.log(`${indent}  ${String(c.content).replace(/\s+/g, ' ')}`)
  }
} else {
  console.log('（没有评论，或评论未随详情返回）')
}

try {
  logEvent('xhs-read', { target: base.id, note: base.title, meta: { author: base.author, comments: comments.length } })
} catch { /* 日志失败不阻断 */ }
