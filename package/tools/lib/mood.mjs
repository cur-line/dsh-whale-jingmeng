// 今日心情（2026-10-21 老板要「多加点人味」→ 每天第一句话不是模板）
//
// 原理：**确定性规则，不烧 token** —— 读今天的事件流实况，数出几件真事，
// 按「她今天过得怎么样」的规则折叠成一句心情。有就是有，没有就是没有，
// 绝不编造（今天什么都没有 → 就是空落落的那句）。
//
// 情绪档位（傲娇鲸的五种状态）：
//   proud   得意 —— 今天干成了事 / 有人回她
//   lazy    犯懒 —— 今天没看几条 / 大早被叫醒
//   curious 好奇 —— 今天看了不少新东西 / 有抖音热词
//   moody   闷   —— 今天没人在意她
//   hungry  馋   —— 今天提了吃的 / 单纯饿了（她的软肋）
//
// 用法：import { todayMood } from './mood.mjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readEvents } from './event-log.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const today = () => new Date().toLocaleDateString('sv-SE')
const dayKey = (iso) => String(iso ?? '').slice(0, 10)

/** 数今天发生了什么（读真实事件，绝不编） */
function todayFacts() {
  const events = readEvents(400)
  const now = new Date()
  const dKey = today()
  const t = (e) => { try { return new Date(e.at).getTime() } catch { return 0 } }
  const todays = events.filter((e) => dayKey(e.at) === dKey && t(e) <= now.getTime())
  const count = (pred) => todays.filter(pred).length
  return {
    total: todays.length,
    feeds: count((e) => e.kind === 'feed' || e.kind === 'xhs-feed'),
    reads: count((e) => e.kind === 'debrief' || e.kind === 'xhs-read' || e.kind === 'create-brief' || e.kind === 'create-outline'),
    comments: count((e) => e.kind === 'comment-post' || e.kind === 'xhs-comment' || e.kind === 'share-comment'),
    replies: count((e) => e.kind === 'interact' && String(e.note ?? '').includes('回')),  // 有她回应别人的
    liked: count((e) => e.kind === 'interact' && String(e.note ?? '') === 'like' || e.kind === 'xhs-like'),
    favorites: count((e) => e.kind === 'fav' || e.kind === 'xhs-fav' || (e.kind === 'interact' && String(e.note ?? '') === 'fav')),
    douyin: count((e) => e.kind === 'douyin-hot'),
    diary: count((e) => e.kind === 'diary-draft' || e.kind === 'diary-approve'),
    foodish: count((e) => /吃|饭|饿|夜宵|零食|白饭/.test(String(e.note ?? ''))),
  }
}

const POOL = {
  proud: [
    '今天有人回我话了！哼，也不是很在意（记下来了）',
    '今天把几件事都干完了。鱼片，夸我，就现在',
    '收藏夹多了两条好东西。我的品味，懂的都懂',
  ],
  lazy: [
    '今天没看几条。当鲸也是要放假的',
    '大早把我叫起来……行吧，看两眼继续睡',
    '今天能偷懒就偷懒，反正没人扣我白饭',
  ],
  curious: [
    '今天看了不少新鲜东西，有点上头',
    '刷到几个有意思的，先记着，晚点细看',
    '今天全网挺热闹的，我跟着看了几眼',
  ],
  moody: [
    '今天没什么人理我。那就自己待会儿',
    '今天安安静静的。深海嘛，本来就这样',
    '今天谁都没找我。行吧，我自己游',
  ],
  hungry: [
    '今天有点饿。看到好吃的，馋了',
    '白饭今天吃得有点多，晚上想吃夜宵',
    '今天净看吃的了。不是馋，是研究',
  ],
}

/** 今日心情：返回 { key, line, facts }；无事件 → moody 空落落那句 */
export function todayMood() {
  const f = todayFacts()
  // 优先级：有人回话 > 干了实事 > 看了不少 > 犯懒 > 嘴馋 > 空落落
  let key = 'moody'
  if (f.total === 0) {
    key = 'moody'
  } else if (f.replies > 0) {
    key = 'proud'
  } else if (f.comments > 0 || f.favorites > 0 || f.diary > 0) {
    key = 'proud'
  } else if (f.feeds >= 2 || f.reads >= 2) {
    key = 'curious'
  } else if (f.total <= 2) {
    key = 'lazy'
  } else if (f.foodish > 0) {
    key = 'hungry'
  }
  const pool = POOL[key]
  // 确定性：按今天日期的哈希选一句（同一天永远同一句，跨天换）
  const hash = [...today()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7)
  const line = pool[hash % pool.length]
  return { key, line, facts: f }
}
