#!/usr/bin/env node
// 飞书通知转发器 —— whale 调它，它把消息推到你飞书。
//
// 为什么需要这一层：
//   whale 的 notify 只支持 none/desktop/webhook/command/dm 五种。
//   - desktop 在 macOS 上是死的（代码里 process.platform !== 'win32' 直接跳过）
//   - webhook 要你自己建自定义机器人、复制 URL（飞书没有 API 能读回这个 URL）
//   - command 是「可执行文件 + 参数数组，消息作为最后一个参数传进去」← 就用这个
//
// 所以：把本脚本配成 whale 的 notify.cmd，它会收到消息正文作为最后一个参数。
//
// 用法（whale 会自动这么调）：
//   node /path/to/notify-feishu.mjs --dsh "<消息正文>"
//
// 手动测试：
//   node notify-feishu.mjs --dsh "测试一下"
//   node notify-feishu.mjs --dsh "测试" --dry

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.HOME || os.homedir()

// 收件人：你自己的飞书 open_id
// 收件人 open_id 从配置读，不写死在源码里（个人标识不该进公开仓库）
const OWNER_OPEN_ID = (() => {
  if (process.env.DEEPREAD_OWNER_OPEN_ID) return process.env.DEEPREAD_OWNER_OPEN_ID
  try {
    const c = JSON.parse(fs.readFileSync(path.join(HOME, '.dsh', 'bili-whale.config.json'), 'utf8'))
    return String(c?.notify?.ownerOpenId ?? '')
  } catch { return '' }
})()
if (!OWNER_OPEN_ID) {
  console.error('缺少飞书 open_id：在 ~/.dsh/bili-whale.config.json 的 notify.ownerOpenId 填一个，或设 DEEPREAD_OWNER_OPEN_ID。')
  process.exit(2)
}

// 发消息用的身份：user（用你自己的账号给你自己发，最稳，不需要把机器人拉进群）
const AS = 'user'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')

// whale 的 command 后端会把消息作为**最后一个参数**追加，所以取最后一个非 -- 开头、非 --dry 的
const skip = new Set()
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--dsh' || argv[i] === '--dry') skip.add(i)
}
const text = argv.find((a, i) => !skip.has(i) && !a.startsWith('--'))

if (!text) {
  console.error('用法: node notify-feishu.mjs --dsh "<消息正文>" [--dry]')
  process.exit(2)
}

// ── 组装消息 ─────────────────────────────────────────────────────
// 加个前缀，一眼看出这是鲸檬来的，跟别的飞书消息区分开
const stamp = new Date().toLocaleString('zh-CN', {
  hour12: false, timeZone: 'Asia/Shanghai',
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

// 日记云文档 token 也一律从配置/环境变量读，不写死在源码里（跟上面 open_id 同理）
const DIARY_DOC_TOKEN = (() => {
  if (process.env.JINGMENG_DIARY_DOC_TOKEN) return process.env.JINGMENG_DIARY_DOC_TOKEN
  try {
    const c = JSON.parse(fs.readFileSync(path.join(HOME, '.dsh', 'bili-whale.config.json'), 'utf8'))
    return String(c?.notify?.diaryDocToken ?? '')
  } catch { return '' }
})()

const body = [
  `🐳 鲸檬 · ${stamp}`,
  '',
  text,
  '',
  '——',
  DIARY_DOC_TOKEN ? `日记：https://my.feishu.cn/docx/${DIARY_DOC_TOKEN}` : '日记（未配置云文档）',
].join('\n')

if (DRY) {
  console.log('=== 将要发送的内容 ===')
  console.log(body)
  console.log('=== 结束（--dry，没真发）===')
  process.exit(0)
}

// ── 发送 ────────────────────────────────────────────────────────
// 先同步日记到飞书云文档 —— 利用「每轮收工必调 notify」这个天然时机。
// 这样不用改 whale 的源码，也不会因为漏调而丢一天的记录。
// 同步失败不影响推送本身：消息你必须收到，日记可以补。
let syncNote = ''
if (!argv.includes('--no-sync')) {
  try {
    const syncScript = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      'diary-to-feishu.mjs',
    )
    const r = execFileSync(process.execPath, [syncScript], {
      encoding: 'utf8', timeout: 120000,
    })
    if (/同步成功/.test(r)) {
      syncNote = '日记已同步到飞书云文档'
      console.log('[日记同步] ' + syncNote)
    } else if (/没有新内容|还是空的/.test(r)) {
      syncNote = ''
      console.log('[日记同步] 无新内容，跳过')
    } else {
      console.log('[日记同步] ' + String(r).trim().slice(0, 200))
    }
  } catch (e) {
    // 不同步也不阻断推送
    console.error('[日记同步] 失败（不影响推送）：' + String(e.message).slice(0, 200))
  }
}

// --text 走命令行参数有转义风险（消息里可能有引号、换行），所以写临时文件走 @file。
// 注意 lark-cli 的 @file 只认 /tmp、当前目录、~/files 三个根 —— 必须写 /tmp。
const tmp = '/tmp/whale-notify.md'
try {
  fs.writeFileSync(tmp, body, 'utf8')
} catch (e) {
  console.error('写临时文件失败：' + e.message)
  process.exit(1)
}

try {
  const r = execFileSync('lark-cli', [
    'im', '+messages-send',
    '--user-id', OWNER_OPEN_ID,
    '--text', '@' + tmp,
    '--as', AS,
  ], { encoding: 'utf8', timeout: 60000 })

  let ok = false
  try { ok = JSON.parse(r).ok === true } catch { ok = /"ok":\s*true/.test(r) }

  if (!ok) {
    console.error('飞书返回异常：' + String(r).slice(0, 500))
    process.exit(1)
  }
  console.log('飞书已推送 ✓')
} catch (e) {
  // whale 的 notify 失败只提示不抛，所以这里把原因打出来方便排查
  console.error('飞书推送失败：' + String(e.message).slice(0, 300))
  if (e.stdout) console.error(String(e.stdout).slice(0, 500))
  if (e.stderr) console.error(String(e.stderr).slice(0, 500))

  // 兜底：飞书挂了也不能让消息彻底丢，落到本地文件
  try {
    const fallback = path.join(HOME, '.dsh', 'whale-notify-fallback.log')
    fs.appendFileSync(fallback, JSON.stringify({ at: new Date().toISOString(), text }) + '\n')
    console.error('已落本地兜底：' + fallback)
  } catch { /* 兜底也失败就算了 */ }

  process.exit(1)
}
