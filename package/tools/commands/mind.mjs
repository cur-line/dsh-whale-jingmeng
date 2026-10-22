// 她的内心（2026-10-22）
//
// 用法：
//   node bili.mjs mind                                   看现在的内心状态
//   node bili.mjs mind react --bv BV1xx --title "标题" --played 320 --score 4 --thought "……"
//                                                        看完一条，留一句独白 + 喜欢分（1~5）
//   node bili.mjs mind react --bv BV1xx --score 1 --thought "……" --skipped
//                                                        扫几秒就划走的，也记一条
//   node bili.mjs mind after --mood "有点困但挺开心" --obsession "深海纪录片"
//                                                        一轮收尾，更新心情和着迷的东西
//   node bili.mjs mind reflect --text "最近的我：……"      每晚反思（会留历史）

import * as mind from '../lib/mind.mjs'

const argv = process.argv.slice(2)
const sub = argv[0]
const opt = {}
for (let i = 1; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[k] = true
    else { opt[k] = v; i += 1 }
  }
}

if (sub === 'react') {
  if (!opt.thought) { console.error('✗ 要写一句 --thought "刚看完想了什么"'); process.exit(2) }
  if (opt.score === undefined) { console.error('✗ 要给 --score 1~5（有多喜欢）'); process.exit(2) }
  const it = mind.react({
    bv: opt.bv, title: opt.title, score: opt.score, thought: opt.thought,
    played: opt.played ?? null, skipped: !!opt.skipped,
  })
  console.log(`✓ 记下了：${it.score}/5${it.skipped ? '（扫几秒划走）' : ''} —— ${it.thought.slice(0, 60)}`)
  process.exit(0)
}
if (sub === 'after') {
  const m = mind.afterSession({ mood: opt.mood, obsession: opt.obsession, thought: opt.thought, goal: opt.goal })
  console.log('✓ 一轮收尾：')
  if (m.mood) console.log(`  心情：${m.mood}`)
  if (m.obsession) console.log(`  最近着迷：${m.obsession}`)
  process.exit(0)
}
if (sub === 'reflect') {
  const text = String(opt.text || '')
  if (!text) { console.error('✗ 要写 --text "最近的我……"'); process.exit(2) }
  mind.reflect(text)
  console.log('✓ 反思写好了，「最近的我」已更新（旧版本留了历史）')
  process.exit(0)
}

const m = mind.read()
const today = new Date().toLocaleDateString('sv-SE')
const todays = (m.thoughts || []).filter((x) => x.date === today)
console.log('【现在的内心】')
console.log(`  心情：${m.mood || '（还没更新）'}`)
console.log(`  最近着迷：${m.obsession || '（还没更新）'}`)
if (m.goal) console.log(`  小目标：${m.goal}`)
if (m.thought) console.log(`  没想完的：${m.thought}`)
console.log('')
console.log('【最近的我】')
console.log(`  ${m.self || '（还没反思过）'}`)
console.log('')
console.log(`【今天的独白】${todays.length} 条`)
for (const t of todays.slice(0, 5)) {
  console.log(`  ${t.score}/5${t.skipped ? '（划走）' : ''} ${t.title ? `《${t.title}》` : ''}`)
  console.log(`      ${t.thought}`)
}
if ((m.interests || []).length) {
  console.log('')
  console.log('【自己长出来的兴趣】' + (m.interests || []).slice(0, 8).map((x) => x.kw).join(' · '))
}
