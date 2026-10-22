// 「这会儿话多不多」—— 看她今天愿不愿意开口（2026-10-22）
//
// 用法：
//   node bili.mjs chatty                 看今天这一档 + 门槛
//   node bili.mjs chatty roll            重新掷一次
//   node bili.mjs chatty set chatty|lazy 手动指定今天的档（面板排错用）
//   node bili.mjs chatty ignore --to "谁" --why "为什么懒得回"
//                                       记一条「这次不理」——不理也要留一句心里话 ✓

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as chatty from '../lib/chatty.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const argv = process.argv.slice(2)
const sub = argv[0]
const opt = {}
for (let i = 1; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[argv[i].slice(2)] = true
    else { opt[argv[i].slice(2)] = v; i += 1 }
  }
}

if (sub === 'roll') {
  const t = chatty.reroll()
  console.log(`🎲 重新掷：${t.label}（想回程度 ≥${t.bar} 才回）—— ${t.line}`)
  process.exit(0)
}
if (sub === 'set') {
  const t = chatty.setTier(argv[1])
  if (!t) { console.error('用法：chatty set chatty|normal|lazy'); process.exit(2) }
  console.log(`✓ 今天改成「${t.label}」（门槛 ${t.bar}）`)
  process.exit(0)
}
if (sub === 'ignore') {
  const to = String(opt.to || '对方')
  const why = String(opt.why || '').trim()
  if (why.length < 4) { console.error('✗ 要写清为什么懒得回（≥4 字）：--why "……"'); process.exit(2) }
  const t = chatty.todayTier()
  try {
    fs.appendFileSync(path.join(HOME, '.dsh', 'whale-log.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), kind: 'social-ignore', target: to, note: `${t.label} · ${why}` }) + '\n')
  } catch {}
  console.log(`✓ 记下了：这次不理 ${to}（${t.label}）—— ${why}`)
  console.log('  活动记录里留了痕，主人翻得到 ✓')
  process.exit(0)
}

const t = chatty.todayTier()
console.log(`今天这一档：${t.label}（想回程度 ≥${t.bar} 才回）`)
console.log(`  ${t.line}`)
console.log('')
console.log('怎么用：看到有人找你 → 先想「我有多想回这一条」（1~5）')
console.log(`  · ≥${t.bar} → 写草稿：node bili.mjs reply-draft add … --want <分数>`)
console.log('  · 够不着 → 别硬回，记一笔：node bili.mjs chatty ignore --to "谁" --why "……"')
