#!/usr/bin/env node
// 客户端组件渲染自检 —— 防止「页面整块空白」这类错误再溜进来。
//
// 为什么需要它（2026-10-21 的真实事故）：
//   StatusPanel 里 homeView 引用了三个**声明在它之后**的 const
//   （commentsCards / growCard / treasureCard）→ TDZ ReferenceError
//   → 组件每次渲染都抛错 → 「养鱼」页面整块空白。
//
//   阴险之处：首屏 `if (!d)` 会提前返回，**绕过了出错的代码**。
//   所以现象是「先显示读取中…，数据一到就白屏」——静态检查看不出来。
//
// 这个脚本做的事：
//   在 Node 里把 lib/client.js 加载起来，模拟 DSH 的 slots，
//   捕获真实注册的组件，然后用【三种数据形态】各渲染一遍：
//     ① 全量数据  ② 空数据（新装）  ③ 无数据（首屏）
//   任何一处抛错都算失败。
//
// 用法：node tests/render-check.mjs

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(HERE, '..', 'lib', 'client.js')

if (!fs.existsSync(CLIENT)) {
  console.error(`找不到客户端文件：${CLIENT}`)
  process.exit(2)
}
const SRC = fs.readFileSync(CLIENT, 'utf8')

// ── 最小 React 替身 ─────────────────────────────────────────────
const React = {
  createElement: (type, props, ...kids) => ({ type, props, kids }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (v) => ({ current: v === undefined ? null : v }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
}

/** 把状态初值替换成模拟数据（只在内存里改，不写文件） */
function build(cfgMock, dMock) {
  let t = SRC
  if (cfgMock !== undefined) {
    t = t.replace(
      'const [cfg, setCfg] = useState(null);',
      `const [cfg, setCfg] = useState(${JSON.stringify(cfgMock)});`)
  }
  if (dMock !== undefined) {
    t = t.replace(
      'const [d, setD] = useState(null);',
      `const [d, setD] = useState(${JSON.stringify(dMock)});`)
  }
  return t
}

function load(src) {
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (def) => { captured = def } } },
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {} }),
      head: { appendChild: () => {} },
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, URL,
  }
  sandbox.globalThis = sandbox
  vm.runInContext(src, vm.createContext(sandbox))
  if (!captured) throw new Error('模块没有被 __ModuleLoader__ 捕获')
  return captured.factory((n) => (n === 'react' ? React : n))
}

/** 递归渲染：遇到函数组件就调用它，直到画出真正的树或抛错 */
let depth = 0
function renderTree(node, trail) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n, i) => renderTree(n, `${trail}[${i}]`))
    return
  }
  const { type, props, kids } = node
  if (typeof type === 'function') {
    if (++depth > 80) { depth--; return }
    let out
    try {
      out = type({ ...(props || {}) })
    } catch (e) {
      depth--
      throw new Error(`<${type.name || '匿名组件'}> @${trail}：${e.message}`)
    }
    depth--
    renderTree(out, `${trail}>${type.name || '匿名'}`)
    return
  }
  ;(kids || []).forEach((k, i) => renderTree(k, `${trail}#${i}`))
}

/** 模拟 DSH 的 slots，捕获真实注册出来的组件（连挂载路径一起验证） */
function captureRegistrations(exp) {
  const out = {}
  const ctx = {
    effect: (fn) => fn(),
    slots: {
      inject: (_slot, fn) => fn(),
      register: (opts, comp) => { out[`${opts.name}#${opts.id ?? opts.key ?? ''}`] = comp },
    },
  }
  exp.apply(ctx)
  return out
}

// ── 三种数据形态 ────────────────────────────────────────────────
const CFG_FULL = {
  persona: { name: '鲸檬', ownerTitle: '鱼片', selfClaim: '我' },
  preferences: { like: ['AI 工具与插件'], dislike: ['带货'] },
  owner: { mid: '397066943', name: '形影络绎' },
  self: { mid: '3747573363902837', name: '鲸檬' },
  quota: { shareDaily: 3 },
  share: { enabled: true, via: 'dm' },
  listen: { comment: true },
  night: { windows: [{ start: '20:00', end: '24:00', wakes: 1 }] },
  notify: { type: 'command' },
}
const D_FULL = {
  schedule: { current: { planAt: 1, msUntil: 3.6e6, atText: '23:42', fired: false } },
  platforms: {
    bili: { name: '鲸檬', mid: '3747573363902837', logged: true, todayEvents: 1, events: 2, shareOn: true, commentOn: true },
    xhs: { name: '鲸檬', logged: true, todayEvents: 1, events: 2, readCount: 3, feedCount: 1 },
  },
  checks: [{ ok: true, name: 'cookie' }],
  switches: { warmup: true, share: true, listenComment: false },
  stats: { todayEvents: 1, totalEvents: 2 },
  diary: {
    watched: [{ date: '2026-10-21', title: 'X' }], wants: ['A'],
    statusCount: { pending: 1, published: 1 },
    queue: [{ status: 'pending', text: 'x', date: '2026-10-21' }],
  },
  events: [{ at: new Date().toISOString(), kind: 'diary', note: '写了日记', target: 'BV1xxxxxxxxx' }],
  mood: { key: 'hungry', line: '今天想吃白饭。' },
  comments: { bili: [{ at: new Date().toISOString(), note: '留言' }], xhs: [] },
  grow: { vip: { users: [{ name: 'u', uid: '1' }], doneToday: 1, dailyMax: 6, left: 5 }, taskPending: 1, fuse: {} },
  treasure: [{ kind: '想学', title: 't', url: 'https://example.com', up: 'UP', reason: '理由' }],
}

const CASES = [
  ['全量数据', CFG_FULL, D_FULL],
  ['空数据（新装）', {}, {}],
  ['无数据（首屏）', {}, undefined],
]

let pass = 0
const failures = []

for (const [label, cfg, d] of CASES) {
  let exp
  try {
    exp = load(build(cfg, d))
  } catch (e) {
    failures.push(`【${label}】模块加载失败：${e.message}`)
    continue
  }

  let regs
  try {
    regs = captureRegistrations(exp)
  } catch (e) {
    failures.push(`【${label}】注册阶段失败：${e.message}`)
    continue
  }

  const names = Object.keys(regs)
  if (!names.length) {
    failures.push(`【${label}】一个组件都没注册 —— 插件的客户端半边没生效`)
    continue
  }

  let bad = false
  for (const name of names) {
    const Comp = regs[name]
    if (typeof Comp !== 'function') continue
    depth = 0
    try {
      renderTree(Comp({ close: () => {}, onClose: () => {} }), name)
    } catch (e) {
      failures.push(`【${label}】${name}\n      ${e.message}`)
      bad = true
    }
  }
  if (!bad) {
    console.log(`  ✓ ${label} —— 注册 ${names.length} 个组件，全部渲染通过`)
    pass += 1
  }
}

console.log('')
if (failures.length) {
  console.error(`❌ 渲染自检失败（${pass}/${CASES.length} 通过）\n`)
  for (const f of failures) console.error('  ' + f)
  console.error('\n提示：这类错误静态检查发现不了 —— 首屏 `if (!d)` 会提前返回，')
  console.error('      只有数据到位后的那次渲染才会暴露。务必修到全绿。')
  process.exit(1)
}
console.log(`✅ 渲染自检全部通过（${pass}/${CASES.length}）`)
