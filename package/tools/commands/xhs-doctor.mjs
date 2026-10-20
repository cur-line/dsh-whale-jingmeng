// 依赖体检 —— 装完之后第一件事，先跑它。
//
// 为什么单独一个文件：B 站那套 deps.mjs 检查的是 cookie / ffmpeg；
// 小红书这边完全不同的失败点（服务没起 / 浏览器没装 / 没登录 / 被踢下线），
// 混在一起会让人误判。所以分开，各查各的。
//
// 用法：node xhs.mjs doctor [--json]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { health, loginStatus, myProfile, BASE, token, XhsError } from '../lib/xhs-client.mjs'
import { summary } from '../lib/xhs-quota.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const argv = process.argv.slice(2)
const AS_JSON = argv.includes('--json')

const checks = []
function add(name, ok, detail, hint = '') {
  checks.push({ name, ok, detail, hint })
}

// ① 本地服务在不在
let alive = false
try {
  const h = await health()
  alive = true
  add('本地服务', true, `运行中 ${BASE}（${h.version ?? '版本未知'}）`)
} catch (e) {
  add('本地服务', false, `${BASE} 无响应：${e.message}`,
    '启动它：AUTH_TOKEN=$(cat ~/.dsh/xhs/token.txt) ~/.dsh/xhs/bin/xiaohongshu-mcp -port :18060 &')
}

// ② 鉴权 token
const t = token()
add('本地鉴权 token', !!t, t ? `已配置（${t.slice(0, 6)}…，长 ${t.length}）` : '未配置',
  '生成：head -c 24 /dev/urandom | base64 → 存 ~/.dsh/xhs/token.txt；或用同一个值设 AUTH_TOKEN 启动服务')

// ③ 内置浏览器
const browserCache = path.join(HOME, 'Library', 'Caches', 'xiaohongshu-mcp', 'browser')
let browserOk = false
let browserVer = ''
try {
  for (const v of fs.readdirSync(browserCache)) {
    const bin = path.join(browserCache, v, 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
    if (fs.existsSync(bin)) { browserOk = true; browserVer = v; break }
  }
} catch { /* 目录都没有就是没装 */ }
add('内置浏览器', browserOk, browserOk ? `已就绪 ${browserVer}` : '未安装',
  '首次启动服务会自动下载（约 140–190MB，仅一次）')

// ④ 登录态
let loggedIn = false
let who = ''
if (alive) {
  try {
    const s = await loginStatus()
    loggedIn = !!s.is_logged_in
    who = s.username ?? ''
    add('登录态', loggedIn, loggedIn ? `已登录${who ? '：' + who : ''}` : '未登录',
      '扫码：node xhs.mjs login')
  } catch (e) {
    add('登录态', false, `检查失败：${e.message}`, e.hint?.() ?? '')
  }
} else {
  add('登录态', false, '服务没起，无法检查', '先启动服务')
}

// ⑤ 账号身份（登录后才有意义）
//
// 实测（2026-10-20）：这个接口很容易超时 —— 服务端要真的去打开个人主页，
// 主页资源多/账号没填资料时会卡到 60 秒再 500。
// 它**不影响**读内容、点赞、发笔记，所以不能把"主页读不出"判成"接不进来" ✗
// 处理：降级为「警告」，并且昵称优先用 /login/status 里已有的那个（那个一定有）。
if (loggedIn) {
  try {
    const me = await myProfile()
    const box = me?.data ?? me ?? {}
    const u = box?.userBasicInfo ?? box?.user_basic_info ?? box?.data?.userBasicInfo ?? box
    const nick = u.nickname || who || '(未填)'
    const redId = u.redId || u.red_id || ''
    if (u.nickname || redId) {
      add('账号身份', true, `${nick}${redId ? ' · 小红书号 ' + redId : ''}`)
    } else {
      // 接口通了但字段全空 —— 账号没填资料，不是故障
      add('账号身份', true, `${who || '(未填昵称)'}（账号资料为空，不影响使用）`)
    }
  } catch (e) {
    // 超时/500 只降级成警告：读内容与发布都不依赖它
    add('账号身份', true, `${who || '(昵称未知)'}　⚠️ 主页接口超时（不影响刷内容与发布）`,
      '想修的话：去 App 补全个人资料，主页加载会快很多')
  }
}

// ⑤.5 今日额度（让人一眼看到还剩多少余地）
try {
  add('今日额度', true, summary())
} catch { add('今日额度', true, '（读不到账本，按默认限额走）') }

// ⑥ 数据目录可写
const dataDir = path.join(HOME, '.dsh', 'xhs')
let writable = false
try {
  fs.mkdirSync(dataDir, { recursive: true })
  const probe = path.join(dataDir, '.write-probe')
  fs.writeFileSync(probe, 'ok')
  fs.unlinkSync(probe)
  writable = true
} catch { /* 下面统一报 */ }
add('数据目录', writable, writable ? `${dataDir} 可写` : `${dataDir} 不可写`, '检查磁盘权限')

// ── 输出 ──
if (AS_JSON) {
  console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2))
} else {
  console.log('小红书接入 · 依赖体检\n')
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name.padEnd(14)} ${c.detail}`)
    if (!c.ok && c.hint) console.log(`    → ${c.hint}`)
  }
  const bad = checks.filter((c) => !c.ok)
  console.log()
  if (!bad.length) {
    console.log('全绿。可以开始：node xhs.mjs feed')
  } else {
    console.log(`还有 ${bad.length} 项没过：${bad.map((c) => c.name).join('、')}`)
  }
}

process.exit(checks.every((c) => c.ok) ? 0 : 1)
