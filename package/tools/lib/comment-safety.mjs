// 评论内容安全闸（2026-10-21 加）
// 为什么有它：鲸檬的评论「直发免审批」是老板批的红线，但必须友善守 B站 规则。
// 安全闸 = 红线代码化 —— 任何带链接 / 联系方式 / 引流话术 / @ 的评论一律拒绝发送，
// 防止账号被 B站 判成广告号。纯本地正则判断，零 token 消耗，不调任何 API。
//
// 参考：yangyu-bot 的 sanitizeComment（panel/llm.mjs:81 的 banned 正则），
// 本闸把它拆成 5 类并逐类给出命中类别，方便知道「为什么拒」。
//
// 用法：
//   import { checkComment } from '../lib/comment-safety.mjs'
//   const s = checkComment('正文')
//   if (!s.ok) console.error('✗ 安全闸拒绝：' + s.reason)

/** 违规规则表：按序检查，命中即拒（i = 不区分大小写） */
const RULES = [
  { key: 'links',   label: '链接',     re: /(https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|xyz|top|cc|me|io)(\/|\b))/i },
  { key: 'contact', label: '联系方式', re: /(微信|vx|v信|qq群|加群|群号|私信我|私聊我|加我|q ?q ?[:：]?\s*\d)/i },
  { key: 'promote', label: '引流话术', re: /(互关|互粉|求关注|关注我|点点关注|三连|一键三连|投币支持|关注走一波)/i },
  { key: 'mention', label: '@ 提及',    re: /@/ },
  { key: 'spam',    label: '广告刷量', re: /(代刷|涨粉|刷量|工作室|接单|打广告)/i },
]

/**
 * 评论内容安全闸：不合格就拒绝发送。
 * @param {string} text 要发送的评论正文
 * @param {{ allowMention?: boolean }} [opts]
 *   allowMention=true 时跳过 @ 检查 —— 分享型评论（--share）正文带 @主人 是合法设计，
 *   其余规则（链接/联系方式/引流/广告）照查。
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkComment(text, { allowMention = false } = {}) {
  const t = String(text ?? '')
  for (const { key, label, re } of RULES) {
    if (key === 'mention' && allowMention) continue
    if (re.test(t)) return { ok: false, reason: `命中「${label}」类违规（${key}）` }
  }
  return { ok: true }
}
