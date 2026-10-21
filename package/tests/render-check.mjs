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
function renderTree(node, trail, texts) {
  if (!node || typeof node !== 'object') {
    if (texts && (typeof node === 'string' || typeof node === 'number')) texts.push(String(node))
    return
  }
  if (Array.isArray(node)) {
    node.forEach((n, i) => renderTree(n, `${trail}[${i}]`, texts))
    return
  }
  const { type, props, kids } = node
  if (texts && texts.links && props && typeof props.href === 'string') texts.links.push(props.href)
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
    renderTree(out, `${trail}>${type.name || '匿名'}`, texts)
    return
  }
  ;(kids || []).forEach((k, i) => renderTree(k, `${trail}#${i}`, texts))
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
    xhs: { name: '鲸檬', logged: true, todayEvents: 1, events: 2, readCount: 3, feedCount: 1, aiIdentity: true },
  },
  checks: [{ ok: true, name: 'cookie' }],
  switches: { warmup: true, share: true, listenComment: false },
  stats: { todayEvents: 1, totalEvents: 2 },
  diary: {
    watched: [{ date: '2026-10-21', title: 'X' }], wants: ['A'],
    statusCount: { pending: 1, published: 1 },
    queue: [{ status: 'pending', text: 'x', date: '2026-10-21' }],
  },
  events: [{ at: new Date().toISOString(), kind: 'interact', note: '点赞《X》', target: 'BV1Yku16CEzX', url: 'https://www.bilibili.com/video/BV1Yku16CEzX' }],
  mood: { key: 'hungry', line: '今天想吃白饭。' },
  comments: {
    bili: [{ at: new Date().toISOString(), note: '留言', target: 'BV1Yku16CEzX', url: 'https://www.bilibili.com/video/BV1Yku16CEzX' }],
    xhs: [{ at: new Date().toISOString(), note: '评论「做会计前后」', target: '6acdc8ec000000001301905d', url: 'https://www.xiaohongshu.com/explore/6acdc8ec000000001301905d' }],
  },
  grow: { vip: { users: [{ name: 'u', uid: '1' }], doneToday: 1, dailyMax: 6, left: 5 }, taskPending: 1, fuse: {} },
  treasure: [{ kind: '想学', title: 't', url: 'https://example.com', up: 'UP', reason: '理由' }],
  videoSuggestions: [
    { at: '2026-10-21', title: '参考片', url: 'https://www.bilibili.com/video/BV1TEST', why: '为什么', action: '建议', prompt: '提示方向', seen: false },
    { at: '2026-10-21', title: '看过的', url: 'https://www.bilibili.com/video/BV2TEST', why: '为什么', action: '建议', prompt: '提示方向', seen: true },
  ],
  videoPrompts: {
    roleAnchor: '角色锚点：蓝发鲸鱼娘',
    spec: '规格：横屏 16:9，气泡字幕',
    items: [
      { day: 1, at: '2026-10-21', kind: '角色剧情向', topic: '自我介绍', title: '【Day 1】我是鲸檬', status: 'ready', prompt: '镜1 · 0-6s 深海上浮' },
      { day: 2, at: '2026-10-22', kind: '待定', topic: '待定主题', title: '【Day 2】待定', status: 'template', prompt: '模板' },
      { topic: '旧的一期（缺 day/title，验证兜底）', status: 'done', prompt: '已完成' },
    ],
  },
}

const CASES = [
  ['全量数据', CFG_FULL, D_FULL],
  ['空数据（新装）', {}, {}],
  ['无数据（首屏）', {}, undefined],
]

let pass = 0
const failures = []
const allText = []
const allLinks = []

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
      const texts = []
      texts.links = []
      renderTree(Comp({ close: () => {}, onClose: () => {} }), name, texts)
      if (label === '全量数据') { allText.push(...texts); allLinks.push(...texts.links) }
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
// 全量数据下必须真的渲染出这些文案（防止「不报错但整块没内容」）
const joined = allText.join('\n')
const MUST_VIDEO = ['B 站视频', '小红书视频', 'jm-vp-video', 'jm-vp-cover']
const SRC_HAS_VIDEO = ['bili-video', 'xhs-video', 'jm-vp-cover', '你要发（视频）']
const MUST = [
  ['给你的视频建议', '视频建议卡片'],
  ['标记已阅', '未阅按钮'],
  ['每天要做的视频', '视频提示词卡片'],
  ['该做这条', '当前该做那一期的高亮'],
  ['下一步 Day 1', '头部进度'],
  ['复制提示词', '复制按钮'],
  ['镜1 · 0-6s 深海上浮', '分镜提示词全文'],
]
const missing = MUST.filter(([kw]) => !joined.includes(kw)).map(([kw, what]) => `${what}（缺「${kw}」）`)
// 留言/评论必须能点进去跳原页面（老板 2026-10-21 要求）
if (!allLinks.some((u) => u.startsWith('https://www.xiaohongshu.com/explore/'))) {
  missing.push('小红书留言的可点链接')
}
if (!allLinks.some((u) => u.startsWith('https://www.bilibili.com/video/'))) {
  missing.push('B站视频的可点链接')
}
// 视频待审分支：源码级断言（fixture 里没有视频队列，渲染层测不到这类）
const clientSrc = fs.readFileSync(CLIENT, 'utf8')
for (const kw of SRC_HAS_VIDEO) {
  if (!clientSrc.includes(kw)) missing.push(`视频待审 UI（源码缺「${kw}」）`)
}
if (missing.length) {
  failures.push(`【全量数据】渲染结果里没找到这些内容：\n      ${missing.join('\n      ')}`)
  pass = Math.max(0, pass - 1)
}

if (failures.length) {
  console.error(`❌ 渲染自检失败（${pass}/${CASES.length} 通过）\n`)
  for (const f of failures) console.error('  ' + f)
  console.error('\n提示：这类错误静态检查发现不了 —— 首屏 `if (!d)` 会提前返回，')
  console.error('      只有数据到位后的那次渲染才会暴露。务必修到全绿。')
  process.exit(1)
}
console.log(`✅ 渲染自检全部通过（${pass}/${CASES.length}）`)
