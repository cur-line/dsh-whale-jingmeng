#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const start = source.indexOf('    function ApprovalView()')
const end = source.indexOf('    // ── 侧栏入口', start)
assert.ok(start >= 0 && end > start)
const states = []
let cursor = 0, effect, fixture = [], failList = true, lastMutation
const refs = []
const h = (type, props, ...children) => ({ type, props, children })
const factory = new Function('h', 'useState', 'useRef', 'useCallback', 'useEffect', 'API', 'fetch', source.slice(start, end) + '\nreturn ApprovalView;')
const View = factory(h,
  (initial) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value }] },
  (initial) => { const i = cursor++; refs[i] ??= { current: initial }; return refs[i] },
  (fn) => fn, (fn) => { effect = fn }, '/dsh-bili/api',
  async (url, options = {}) => {
    if (!options.method) return { ok: !failList, status: failList ? 404 : 200, json: async () => ({ ok: !failList, items: fixture }) }
    lastMutation = { action: url.split('/').pop(), ...JSON.parse(options.body) }
    return { ok: true, status: 200, json: async () => ({ ok: true, detail: 'fixture saved' }) }
  })
function render() { cursor = 0; return View() }
function nodes(tree) {
  const result = []
  const walk = (node) => { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; result.push(node); (node.children || []).forEach(walk) }
  walk(tree); return result
}
function button(tree, label) { const found = nodes(tree).find((n) => n.type === 'button' && n.children.includes(label)); assert.ok(found, label); return found }
render(); effect(); await new Promise((r) => setImmediate(r))
let tree = render()
assert.ok(JSON.stringify(tree).includes('HTTP 404'))
assert.ok(!JSON.stringify(tree).includes('没有待审的东西'))
assert.ok(!JSON.stringify(tree).includes('暂时没有要审的'))
failList = false
fixture = [{ id: 'same-id', kind: 'xhs-diary', title: '原始标题', text: '原始正文', images: ['/fixture/image.png'], maxChars: 1000, status: 'approved' }]
await button(tree, '刷新').props.onClick(); tree = render()
assert.ok(JSON.stringify(tree).includes('原始标题'))
assert.ok(JSON.stringify(tree).includes('配图 1 张'))
button(tree, '改一下').props.onClick(); tree = render()
assert.equal(button(tree, '现在发布').props.disabled, true)
const textarea = nodes(tree).find((n) => n.type === 'textarea')
assert.equal(textarea.props.maxLength, 1000)
textarea.props.onChange({ target: { value: '修改正文' } }); tree = render()
nodes(tree).find((n) => n.type === 'input' && n.props.placeholder === '笔记标题').props.onChange({ target: { value: '修改标题' } }); tree = render()
await button(tree, '保存修改，重新待审').props.onClick()
assert.deepEqual(lastMutation, { action: 'edit', id: 'same-id', kind: 'xhs-diary', text: '修改正文', title: '修改标题' })
fixture[0].status = 'pending'; tree = render(); await button(tree, '刷新').props.onClick(); tree = render()
button(tree, '不通过').props.onClick(); tree = render()
assert.equal(button(tree, '确认驳回并保存理由').props.disabled, true)
nodes(tree).find((n) => n.type === 'input' && n.props.autoFocus).props.onChange({ target: { value: '  更具体一些  ' } }); tree = render()
await button(tree, '确认驳回并保存理由').props.onClick()
assert.deepEqual(lastMutation, { action: 'reject', id: 'same-id', kind: 'xhs-diary', reason: '更具体一些' })
console.log('PASS approvals-ui: 404 remains an error; XHS title/content contract; edit blocks approval/publish; rejection requires reason and kind')

// The sidebar opens JingmengPanel directly, without mounting the settings section.
// Execute its real style hook against a tiny offline DOM and check idempotency.
const cssStart = source.indexOf('    const CSS_TAG =')
const cssEnd = source.indexOf('    const FIELDS =', cssStart)
const styleStart = source.indexOf('    function useStyleOnce()')
const styleEnd = source.indexOf('    function Row(', styleStart)
const panelStart = source.indexOf('    function JingmengPanel()')
const panelEnd = source.indexOf('    function BiliWhaleSection()', panelStart)
assert.ok(cssStart >= 0 && cssEnd > cssStart && styleEnd > styleStart && panelEnd > panelStart)
const styles = new Map()
const pendingEffects = []
const dom = {
  getElementById: (id) => styles.get(id),
  createElement: (tag) => ({ tag }),
  head: { appendChild: (element) => { styles.set(element.id, element) } },
}
let panelState = 0
const mountPanel = new Function('h', 'useState', 'useEffect', 'document', 'API', 'fetch', 'setInterval', 'clearInterval', 'StatusPanel', 'ApprovalView',
  source.slice(cssStart, cssEnd) + source.slice(styleStart, styleEnd) + source.slice(panelStart, panelEnd) + '\nreturn JingmengPanel;')(
  h,
  () => [panelState++ % 2 === 0 ? 'approval' : 0, () => {}],
  (callback) => { pendingEffects.push(callback) }, dom, '/dsh-bili/api',
  async () => ({ ok: true, json: async () => ({ ok: true, items: [] }) }),
  () => 1, () => {}, () => null, () => null,
)
for (let mount = 0; mount < 2; mount++) {
  const panel = mountPanel()
  assert.equal(panel.props.className, 'jm-page')
  const cleanup = pendingEffects.splice(0).map((callback) => callback())
  cleanup.forEach((callback) => callback?.())
}
assert.equal(styles.size, 1, 'sidebar panel remount must not duplicate shared CSS')
const installedStyle = styles.get('dsh-whale-jingmeng/section.css')
assert.ok(installedStyle, 'sidebar entry must install CSS without mounting BiliWhaleSection')
assert.ok(installedStyle.textContent.includes('.jm-approval'))
assert.ok(installedStyle.textContent.includes('.jm-appr-item'))
assert.ok(installedStyle.textContent.includes('.jm-page-tab'))
console.log('PASS approvals-ui: direct sidebar panel mount installs real shared approval CSS once')
