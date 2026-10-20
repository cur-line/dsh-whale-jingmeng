#!/usr/bin/env node
// Execute the production StatusPanel with offline hook/fetch/timer adapters.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const start = source.indexOf('    function StatusPanel(')
const end = source.indexOf('    function ApprovalView(', start)
const helpers = source.slice(source.indexOf('    const ICONS ='), start)
assert.ok(start >= 0 && end > start, 'production StatusPanel must be extractable')
const body = helpers + source.slice(start, end)
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
const fixture = {
  schedule: { current: { action: 'skip', fired: true } },
  switches: { share: false, listenComment: true, warmup: false },
  diary: { watched: [{ date: today }, { date: '2000-01-01' }] },
  checks: [], events: [],
}
let stateIndex = 0
let effect
let interval
let intervalMs
let timeoutMs
let resolveFetch
let requestSignal
let fetchCount = 0
let stateUpdates = 0
let clearedIntervals = 0
const ref = { current: null }
const hooks = {
  h: (type, props, ...children) => typeof type === 'function' ? type({ ...(props || {}), children }) : ({ type, props, children }),
  useState: () => {
    const index = stateIndex++
    return [[fixture, '', false, 'home', true][index], () => { stateUpdates++ }]
  },
  useRef: (initial) => { ref.current ??= initial; return ref },
  useCallback: (callback) => callback,
  useEffect: (callback) => { effect = callback },
}
const createPanel = new Function(
  ...Object.keys(hooks), 'API', 'fetch', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
  body + '\nreturn StatusPanel;',
)
const Panel = createPanel(
  ...Object.values(hooks), '/dsh-bili/api',
  (url, options) => {
    assert.equal(url, '/dsh-bili/api/dashboard')
    assert.equal(options.cache, 'no-store')
    requestSignal = options.signal
    fetchCount++
    return new Promise((resolve) => { resolveFetch = resolve })
  },
  (callback, ms) => { interval = callback; intervalMs = ms; return 1 },
  () => { clearedIntervals++ },
  (_callback, ms) => { timeoutMs = ms; return 1 },
  () => {},
)
const tree = Panel({})
const rendered = JSON.stringify(tree)
assert.ok(rendered.includes('不看流程已入队'), 'skip state must use action and avoid claiming completion')
assert.ok(rendered.includes('分享关 · 评论监听开'), 'mixed switches must remain distinguishable')
assert.ok(!rendered.includes('今天跑完了'), 'enqueue acknowledgment is not completion')
const cards = []
function visit(node) {
  if (!node || typeof node !== 'object') return
  if (node.props?.className?.split(' ').includes('jm-card')) cards.push(node)
  for (const child of node.children ?? []) {
    if (Array.isArray(child)) child.forEach(visit)
    else visit(child)
  }
}
visit(tree)
const watchedCard = cards.find((card) => card.children[0]?.children?.[0]?.children?.[0] === '今天读过')
assert.ok(watchedCard)
assert.equal(watchedCard.children[1].children[0], 1, 'today count must exclude historical rows')

const cleanup = effect()
assert.equal(intervalMs, 30_000)
assert.equal(timeoutMs, 20_000)
interval()
assert.equal(fetchCount, 1, 'timer must not overlap an in-flight request')
assert.equal(requestSignal.aborted, false)
const updatesBeforeUnmount = stateUpdates
cleanup()
assert.equal(requestSignal.aborted, true, 'unmount must abort the pending request')
assert.equal(clearedIntervals, 1)
resolveFetch({ ok: true, json: async () => ({ ok: true, data: fixture }) })
await new Promise((resolve) => setImmediate(resolve))
assert.equal(stateUpdates, updatesBeforeUnmount, 'late results must not update an unmounted component')
assert.equal(ref.current.controller, null)
console.log('PASS status-panel: truthful cards, today filter, timed refresh, no overlap or post-unmount updates')
