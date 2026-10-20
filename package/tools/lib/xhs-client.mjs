// 小红书本地服务客户端 —— 所有 xhs-*.mjs 共用这一个出口。
//
// 背景：小红书没有官方开放 API，社区方案（xpzouying/xiaohongshu-mcp）是
// 「本地起一个服务 + 内置浏览器跑真实登录态」。所以这里不发 HTTP 请求给小红书，
// 而是发给 **本机 127.0.0.1:18060 的那个服务**，由它去驱动浏览器。
//
// 为什么不直接调 MCP 协议：
//   该服务同时开了 MCP(/mcp) 与 REST(/api/v1/*) 两条口子。
//   命令层是独立 CLI（node xxx.mjs），走 REST 最简单、可 curl 复现、出错好查。
//   MCP 通道留给 DSH 宿主用（我本人调用时走那条）。
//
// 鉴权：token 存在 ~/.dsh/xhs/token.txt（600），服务端用 AUTH_TOKEN 启动时校验。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()

export const BASE = (process.env.XHS_BASE || 'http://127.0.0.1:18060').replace(/\/$/, '')
const TOKEN_FILE = path.join(HOME, '.dsh', 'xhs', 'token.txt')

/** 读本地鉴权 token；没有就返回空串（服务未开鉴权时也能用）。 */
export function token() {
  if (process.env.AUTH_TOKEN) return process.env.AUTH_TOKEN.trim()
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch { return '' }
}

export class XhsError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message)
    this.name = 'XhsError'
    this.status = status
    this.code = code
    this.details = details
  }
  /** 给人类看的排查提示。不同 code 的处理方式不一样，别一律说"重试"。 */
  hint() {
    const map = {
      NOT_LOGGED_IN: '没登录。跑 `node xhs.mjs login` 扫码，或检查 cookie 是否过期。',
      LOGIN_REQUIRED: '没登录。跑 `node xhs.mjs login` 扫码。',
      STATUS_CHECK_FAILED: '服务在但浏览器驱动异常。看 ~/.dsh/xhs/logs/server.log 尾部。',
      AUTH_FAILED: '本地 token 不对。确认服务用同一个 AUTH_TOKEN 启动。',
    }
    if (this.status === 401) return map.AUTH_FAILED
    return map[this.code] || null
  }
}

/**
 * 调本地服务。统一解包 {success,data,message}。
 * 失败抛 XhsError —— 调用方要么处理，要么让它冒到顶层打印。
 */
export async function api(method, endpoint, body = null, { timeoutMs = 120_000 } = {}) {
  const url = BASE + endpoint
  const headers = { 'content-type': 'application/json' }
  const t = token()
  if (t) headers.authorization = `Bearer ${t}`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: ac.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw new XhsError(`请求超时（${timeoutMs}ms）：${endpoint}`, { code: 'TIMEOUT' })
    throw new XhsError(`连不上本地服务 ${BASE}：${e.message}`, { code: 'ECONNREFUSED' })
  }
  clearTimeout(timer)

  // 服务重启中会返回 HTML 或空体，别直接 .json() 炸掉 —— 原样带回前 300 字符供排查。
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON */ }

  if (!res.ok || !json || json.success === false) {
    const msg = json?.error || json?.message || text.slice(0, 300) || `HTTP ${res.status}`
    throw new XhsError(msg, { status: res.status, code: json?.code, details: json?.details })
  }
  return json.data
}

// ── 具体能力（薄封装，参数与 docs/API.md 对齐）────────────────────────────

export const health = () => api('GET', '/health', null, { timeoutMs: 8_000 })
export const loginStatus = () => api('GET', '/api/v1/login/status', null, { timeoutMs: 30_000 })
export const loginQrcode = () => api('GET', '/api/v1/login/qrcode', null, { timeoutMs: 90_000 })
export const logout = () => api('DELETE', '/api/v1/login/cookies')

/** 首页推荐流。返回 [{id, xsec_token, note_card:{display_title, user, interact_info}}] */
export const listFeeds = () => api('GET', '/api/v1/feeds/list', null, { timeoutMs: 120_000 })

/** 关键词搜索。 */
export const searchFeeds = (keyword) => api('GET', `/api/v1/feeds/search?keyword=${encodeURIComponent(keyword)}`, null, { timeoutMs: 120_000 })

/** 笔记详情（含评论）。两个参数缺一不可。 */
export const feedDetail = (feedId, xsecToken) =>
  api('POST', '/api/v1/feeds/detail', { feed_id: feedId, xsec_token: xsecToken }, { timeoutMs: 120_000 })

export const myProfile = () => api('GET', '/api/v1/user/me', null, { timeoutMs: 90_000 })

/** 点赞 / 取消点赞。服务端会自己判断当前状态，重复调用是安全的。 */
export const likeFeed = (feedId, xsecToken, unlike = false) =>
  api('POST', '/api/v1/feeds/like', { feed_id: feedId, xsec_token: xsecToken, unlike }, { timeoutMs: 90_000 })

/** 收藏 / 取消收藏。 */
export const favoriteFeed = (feedId, xsecToken, unfavorite = false) =>
  api('POST', '/api/v1/feeds/favorite', { feed_id: feedId, xsec_token: xsecToken, unfavorite }, { timeoutMs: 90_000 })

export const commentFeed = (feedId, xsecToken, content) =>
  api('POST', '/api/v1/feeds/comment', { feed_id: feedId, xsec_token: xsecToken, content }, { timeoutMs: 120_000 })

export const replyComment = (feedId, xsecToken, content, { commentId, userId } = {}) =>
  api('POST', '/api/v1/feeds/comment/reply', {
    feed_id: feedId,
    xsec_token: xsecToken,
    content,
    ...(commentId ? { comment_id: commentId } : {}),
    ...(userId ? { user_id: userId } : {}),
  }, { timeoutMs: 120_000 })

export const publishNote = (title, content, images) =>
  api('POST', '/api/v1/publish', { title, content, images }, { timeoutMs: 300_000 })

export const publishVideo = (title, content, video) =>
  api('POST', '/api/v1/publish_video', { title, content, video }, { timeoutMs: 600_000 })

export const unreadCount = () => api('GET', '/api/v1/notifications/unread', null, { timeoutMs: 60_000 })
export const listNotifications = () => api('GET', '/api/v1/notifications/list', null, { timeoutMs: 90_000 })

// ── 小工具：把接口返回的笔记整理成"她看得懂"的形状 ──────────────────────

/** 小红书标题硬上限 20 字，正文 1000 字。超了服务端会拒，这里提前截断并告知。 */
export const LIMITS = { title: 20, content: 1000 }

export function clampNote(title, content) {
  const t = String(title ?? '').trim()
  const c = String(content ?? '').trim()
  return {
    title: t.length > LIMITS.title ? t.slice(0, LIMITS.title) : t,
    content: c.length > LIMITS.content ? c.slice(0, LIMITS.content) : c,
    truncatedTitle: t.length > LIMITS.title,
    truncatedContent: c.length > LIMITS.content,
  }
}

/**
 * 从 feed 对象里取出"读一条需要的东西"，兼容 feeds/list 与 search 两种壳。
 *
 * ⚠️ 字段命名坑（2026-10-20 实测）：
 *   服务端响应用 **camelCase**（noteId / xsecToken / interactInfo / imageList），
 *   但请求参数用 **snake_case**（feed_id / xsec_token）。两边不一致，别想当然。
 *   这里两种都兼容，优先 camelCase。
 */
export function normalizeFeed(raw) {
  if (!raw) return null
  const card = raw.note_card || raw.noteCard || raw.note || raw
  const info = card.interactInfo || card.interact_info || {}
  const user = card.user || card.userInfo || {}
  const id = raw.id ?? raw.feed_id ?? raw.feedId ?? card.id ?? card.noteId ?? card.note_id
  return {
    id,
    xsecToken: raw.xsec_token ?? raw.xsecToken ?? card.xsec_token ?? card.xsecToken,
    title: card.display_title ?? card.displayTitle ?? card.title ?? '',
    desc: card.desc ?? card.description ?? '',
    type: card.type ?? 'normal',
    author: user.nickname ?? user.nickName ?? user.nick_name ?? user.name ?? '',
    authorId: user.userId ?? user.user_id ?? '',
    ipLocation: card.ipLocation ?? card.ip_location ?? '',
    liked: info.likedCount ?? info.liked_count ?? '',
    collected: info.collectedCount ?? info.collected_count ?? '',
    commentCount: info.commentCount ?? info.comment_count ?? '',
    url: id ? `https://www.xiaohongshu.com/explore/${id}` : '',
  }
}

/**
 * 拆开 feeds/detail 的返回。
 *
 * 真实结构（实测）：{ data: { feed_id, data: { note: {...}, comments: { list, cursor, hasMore } } } }
 * —— 三层，`note` 与 `comments` 同在 `data.data` 下。
 * 早先少拆一层，症状是"读得到标题、读不到评论"。
 */
export function splitDetail(payload) {
  const l1 = payload?.data ?? payload ?? {}
  const l2 = l1?.data ?? l1
  const note = l2?.note ?? l2?.noteCard ?? l2 ?? {}
  const comments = l2?.comments ?? {}
  return {
    note,
    comments: Array.isArray(comments) ? comments : (comments.list ?? []),
    hasMore: comments.hasMore ?? false,
  }
}
