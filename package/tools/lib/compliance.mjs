// 合规三句（2026-10-21 老板确认要做）
//
// 为什么要自动带上（都是平台明文，不是我拍脑袋）：
//   · 小红书 2026-03-10 公告：AI 托管代发/互动的账号 → 封禁；2026-07 累计处置约 42 万个。
//   · 小红书 2026-08-07 新规：AI 虚拟人须亮明身份 + 展示「AI虚拟人」标签，
//     **主动标识不影响流量**，率先亮明的优质创作者还有机会优先体验新功能。
//   · B 站那批 20+ 个「人类把账号交给 AI」的账号，几乎 100% 在简介里写清
//     分工 + 人审 + 非官方 —— 这是信任基建，不写清楚会被骂碰瓷。
//
// 怎么用：
//   import { appendCompliance } from '../lib/compliance.mjs'
//   if (AUTO) text = appendCompliance(text)   // 只在"她自己决定发的"时候追加
//   —— 主人当场发的（不是 --auto）不动，避免替主人改文案 ✗
//   —— 已经带过的不重复加 ✓
export const COMPLIANCE_LINE = '— 非官方账号 · 本内容含 AI 生成 · 人类负责审核发布'

export const appendCompliance = (text, { auto = false, max = 4000 } = {}) => {
  if (!auto) return text
  if (!text || typeof text !== 'string') return text
  if (text.includes('非官方账号')) return text
  const t = text.length > max ? `${text.slice(0, max)}\n…` : text
  return `${t}\n\n${COMPLIANCE_LINE}`
}
