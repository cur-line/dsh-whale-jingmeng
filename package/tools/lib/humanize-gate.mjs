// 人味闸 —— 发布前的最后一道质量门。
//
// 老板的要求（2026-10-21）：「你发东西要有人味儿，要有鲸鱼娘的味道，
// 不能发个东西跟个 AI 一样。」
//
// 这里的规则来自 humanizer 技能（Wikipedia「Signs of AI writing」维护清单），
// 把最容易辨认的「AI 味」做成硬闸：命中就拒发，逼回去重写。
//
// 用法：
//   import { assertHuman } from './humanize-gate.mjs'
//   assertHuman(text)          // 通过静默，命中抛 Error
//   import { humanScore } from './humanize-gate.mjs'
//   humanScore(text)           // 返回 { tells, score }，供调试/面板展示
//
// 设计原则：
//   · 只拦「确定像 AI」的，不拦「风格不同」的 —— 宁可放行也不误杀鲸娘的语气。
//   · 每条命中都给出具体证据（原文片段），方便她知道自己哪儿露馅了。
//   · 永不抛非 Error 的东西，调用方 catch 到 Error 就知道该拒发。

// ── 检测规则：{ re, why, weak? } ──────────────────────────────────
// weak=true 的单条命中不算数，需要凑够别的 tell 一起才算。
const RULES = [
  // A. 公式化开头 / 机器人式过渡（最致命）
  { re: /^(首先|其次|再次|最后|总的来说|综上所述|值得注意的是|不难发现|总而言之|毫无疑问|显而易见)[，,\s]/m, why: '公式化开头（首先/其次/总之…）' },
  { re: /(让我们|我们来)(深入|探讨|看看|聊聊|拆解|一起)/, why: '「让我们一起…」式开场白' },
  { re: /(接下来|下面|我们)(将|会)(介绍|讲解|展示|分析|分享)/, why: '机器人式过渡（接下来我们将…）' },
  { re: /\b(deep dive|delve|unlock|elevate|elevating|harness the power)\b/i, why: '英文 AI 套话（deep dive/delve…）' },

  // B. 空话套话 / 标题党腔
  { re: /(非常|极其|特别|绝对|完全)(重要|关键|必要|值得注意)/, why: '空洞强调（非常重要/关键…）' },
  { re: /(开启|解锁|赋能|重塑|颠覆|引领)[^。！？]{0,8}(新篇章|新时代|新纪元|未来)/, why: '营销腔（开启新篇章/赋能…）' },
  { re: /(在这个|当今|如今)(数字|信息|快速变化|竞争激烈)的(时代|世界|社会)/, why: '「在当今快速变化的时代」式空话' },

  // C. 排比三连 / 机械工整（弱，需同伴）
  //   真正的 AI 排比是「A、B、C」三连且结构重复（字数相近 + 同词性收尾）。
  //   普通口语里的逗号短句不算。这里要求：三个片段都以「的」「地」「了」等
  //   同类收尾，或整体是 名词、名词、名词 结构 —— 才叫机械工整。
  { re: /([^。！？\n]{2,12})(的|地|了|着|过)[、，,]\s*([^。！？\n]{2,12})(的|地|了|着|过)[、，,]\s*([^。！？\n]{2,12})(的|地|了|着|过)/, why: '机械排比三连', weak: true },
  { re: /(名词|数据|价值|内容|体验|能力|效率|创新|增长)[、，,]\s*(名词|数据|价值|内容|体验|能力|效率|创新|增长)[、，,]\s*(名词|数据|价值|内容|体验|能力|效率|创新|增长)/, why: '空洞三连（名词、名词、名词）', weak: true },

  // D. 结束语 / 收尾腔
  { re: /(希望|愿|祝)(大家|你|我们)(喜欢|能喜欢|有所收获|能帮到你)/, why: '客服式收尾（希望大家喜欢…）' },
  { re: /(感谢|谢谢)(大家|观看|阅读|聆听)(到最后|本期|本条)/, why: '「感谢观看/阅读」式收尾' },

  // E. 聊天机器人残留
  { re: /(希望这|希望能)(帮助|帮到|对你有帮助)/, why: '聊天机器人残留（希望这能帮助…）' },
  { re: /(如果|若)(你|您)(觉得|认为|想)[^。！？]{0,8}(有用|有帮助|喜欢)/, why: '机器人式询问反馈', weak: true },

  // F. 小红书特有：纯种草腔（鲸娘日记不该像广告）
  { re: /(家人们|姐妹们|宝子们|集美们)/, why: '种草博主腔（家人们/姐妹们…）—— 你是鲸，不是卖货的' },
  { re: /(绝绝子|YYDS|yyds|栓Q|无语子|破防了|一整个[^ ]{0,4}(住|爱住))/i, why: '网络梗堆砌（绝绝子/YYDS…）' },

  // G. 长破折号滥用（弱，需同伴）——鲸娘口语是短句，不该通篇破折号
  { re: /——[^——\n]{0,30}——/, why: '破折号滥用（——…——）', weak: true },
]

/** 数一篇文章里的 AI 味 tell。返回 { tells: [{rule, why, hit}], score } */
export function humanScore(text) {
  const tells = []
  for (const r of RULES) {
    const m = String(text).match(r.re)
    if (m) tells.push({ rule: r.re.source, why: r.why, hit: m[0].slice(0, 40), weak: !!r.weak })
  }
  const strong = tells.filter((t) => !t.weak).length
  const weak = tells.filter((t) => t.weak).length
  // 强 tell ≥1，或弱 tell ≥2 且和强 tell 凑一起 ≥2 —— 才算像 AI
  const score = strong + Math.floor(weak / 2)
  return { tells, strong, weak, score }
}

/**
 * 硬闸：像 AI 就抛 Error（带证据），通过则静默。
 * 调用方：xhs-diary / daily-diary 发布前。
 */
export function assertHuman(text) {
  const { tells, strong, weak } = humanScore(text)
  const flag = strong >= 1 || (weak >= 2 && strong + weak >= 2)
  if (!flag) return
  const list = tells.map((t) => `  · ${t.why}：「${t.hit}」`).join('\n')
  throw new Error(`这段写得像 AI（${strong} 处明显 + ${weak} 处疑似）：\n${list}\n重新写，像你自己说话那样，别用这些腔调。`)
}
