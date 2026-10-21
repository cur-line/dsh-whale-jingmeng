// 统一配置层 —— 一个文件承载所有"属于使用者"的东西。
//
// 为什么要有它（2026-10-14 外部评审指出的最大架构缺口）：
//   在此之前，"个人化的东西"散在四处、形态还不一样 ——
//     ① `~/.bili-ai/quota.json`（额度/白名单，独立文件）
//     ② `~/.dsh/whale-night.config.json`（作息，独立文件）
//     ③ `whale-diary.md` 的叙事段落（偏好被 feed.mjs 解析 Markdown 提取 ✗ 脆弱）
//     ④ 代码里硬编码（历史昵称 SELF_NAMES ✗）
//   使用者的体验是"我得读源码才知道要改哪" ✗ —— 这不是模板，是作者的自用件。
//   现在：**填一个 `bili-whale.config.json` 就完成自定义** ✓，其余全是中性默认值。
//
// 查找顺序：$BILI_WHALE_CONFIG → ~/.dsh/bili-whale.config.json → 内置默认值（中性）
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
export const configPath = process.env.BILI_WHALE_CONFIG || path.join(HOME, '.dsh', 'bili-whale.config.json')

/** 中性默认值：不含任何作者的个人信息，换个人也能跑。 */
export const DEFAULTS = {
  persona: {
    name: '<角色名>',
    ownerTitle: '你',      // 助手怎么称呼使用者
    selfClaim: '我',       // 助手怎么自称
    diaryTitle: '今日摘要', // diary show 的标题（想用自己的口吻就改这里）
  },
  preferences: {
    like: ['AI 工具与插件', '鬼畜与怀旧向剪辑', '猫咪', 'Live2D/模型'],
    dislike: ['带货', '擦边', '标题党', '纯搬运'],
  },
  notify: { type: 'none', url: '', template: 'text', cmd: '' },   // none | desktop | webhook | command（见 commands/notify.mjs）
  aliases: [],                  // 历史昵称（兜底用；当前昵称仍从 nav 动态读）
  // 使用者本人（分享型评论要 @ 的人）：mid 用于白名单/查询，name 用于正文里的 @昵称
  // （acc/info 查询会风控，所以 name 缓存一份；改过就用 thread 的 `@到:` 验一下）
  owner: { mid: '', name: '' },
  quota: { shareDaily: 3 },
  // 「标尺」（2026-10-18 加）：分享前必须打分，不到 share.minScore 就是"今天没有值得发的"（合法结果）
  share: { enabled: true, via: 'comment', minScore: 13, silentAfterDays: 3, decayPerDay: 1 },  // 分享型（@主人）开关与评分阈值
  // 倾听（2026-10-18 补默认值，与设置页对齐）：评论区 + 直播间
  listen: { comment: true, commentIntervalSec: 300, scope: 'both', oncePerPerson: false, allDay: false, dm: false, live: false, liveRoom: '', liveScope: 'owner' },
  // 作息：windows[] = 每天允许醒来的时段（每个窗口 = 一次机会）；maxWakesPerDay 缺省 = 窗口数（硬上限 3）
  night: { windows: [{ start: '20:00', end: '24:00', wakes: 1 }], skipChance: 0.3, maxVideos: 5 },
  // 小红书（2026-10-20 加）：与 B 站并行的第二条腿。
  // 关掉很直接：enabled:false → 调度器整段不提；但命令层仍可手动跑（方便排查）
  xhs: {
    enabled: true,
    baseUrl: 'http://127.0.0.1:18060',
    dailyLimit: 2,               // 点赞+收藏+评论 合计每天上限（比 B 站保守：新地方先少动手）
    publishNeedsApproval: true,  // 发笔记必须先给人看 —— 默认死守
    readPerWake: 2,              // 每轮最多深读几条
    // 分享定向主号（2026-10-21 加）：发笔记/日记时，正文开头自动带 @提及。enabled 关掉就回归普通发布。
    mentionOwner: { enabled: false, name: '' },
  },
  // 特别关注（2026-10-21 借鉴 yangyu-bot）：名单里的人发新视频 → 鲸檬优先看/互动。
  // users: [{ uid: <B站mid>, name: <昵称> }]；每天最多 dailyMax 条
  vip: {
    users: [],
    dailyMax: 6,
  },
}

const merge = (base, over) => {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? merge(base[k] ?? {}, v) : v
  }
  return out
}

let cache = null
/** 读取合并后的配置（带缓存）。 */
export function config() {
  if (cache) return cache
  let user = {}
  try { user = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { /* 没配置就用默认 */ }
  cache = merge(DEFAULTS, user)
  cache.__hasUserFile = Object.keys(user).length > 0
  return cache
}
