// 动作保险丝管理 —— 看哪些写动作被 B站 风控熔断了，手动恢复。
//
// 用法：
//   node bili.mjs fuse                看所有保险丝状态
//   node bili.mjs fuse reset <动作>   手动解除某个动作的熔断（like/coin/fav/share/comment/dynamic）
//
// 为什么有它：B站 对写动作（点赞/投币/分享）单独做风控，被拒一次就暂停该动作
// 24 小时起步，避免反复重试被盯死。恢复是**人**的决定，不是脚本自己偷偷解。

import * as fuse from '../lib/fuse.mjs'

const argv = process.argv.slice(2)
const sub = argv[0]

if (sub === 'reset') {
  const action = argv[1]
  if (!action) { console.error('用法：node bili.mjs fuse reset <like|coin|fav|share|comment|dynamic>'); process.exit(2) }
  fuse.reset(action)
  console.log(`✓ 已解除「${action}」的熔断。`)
  process.exit(0)
}

const st = fuse.status()
const names = Object.keys(st)
if (!names.length) { console.log('所有写动作都正常，没有熔断的。'); process.exit(0) }
console.log('保险丝状态：\n')
for (const action of names) {
  const f = st[action]
  const time = new Date(f.until).toLocaleString('zh-CN')
  console.log(`  ${f.blocked ? '🔥 熔断中' : '✓ 已恢复'}  ${action.padEnd(10)} 到 ${time}  （连续 ${f.trips} 次 · 上次 ${new Date(f.lastAt).toLocaleString('zh-CN')}）`)
}
console.log('\n解除：node bili.mjs fuse reset <动作>')
process.exit(0)
