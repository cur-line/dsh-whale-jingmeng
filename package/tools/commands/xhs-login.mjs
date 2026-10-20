// 扫码登录 —— 把二维码取出来、存成能扫的图片，并告诉你路径。
//
// 为什么不是"自动登录"：小红书没有开放 API，登录必须真人扫码。
// 这个脚本能做的只是把二维码端到你面前，然后把等待那句写在屏幕上。
//
// 用法：
//   node xhs.mjs login            取码 + 等登录（等 4 分钟）
//   node xhs.mjs login --status   只看当前登录状态
//   node xhs.mjs login --logout   清掉 cookie（换号/重登）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loginQrcode, loginStatus, logout, myProfile, XhsError } from '../lib/xhs-client.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const DIR = path.join(HOME, '.dsh', 'xhs')
const argv = process.argv.slice(2)
const STATUS_ONLY = argv.includes('--status')
const DO_LOGOUT = argv.includes('--logout')

function pretty(status) {
  if (status.is_logged_in) {
    console.log(`✓ 已登录${status.username ? '：' + status.username : ''}`)
  } else {
    console.log('✗ 未登录')
  }
}

// ── 只看状态 ──
if (STATUS_ONLY) {
  try {
    pretty(await loginStatus())
    process.exit(0)
  } catch (e) {
    console.error(`检查失败：${e.message}`)
    if (e.hint?.()) console.error(`→ ${e.hint()}`)
    process.exit(1)
  }
}

// ── 重置登录 ──
if (DO_LOGOUT) {
  try {
    await logout()
    console.log('已清除本地 cookie。下次用要重新扫码。')
    process.exit(0)
  } catch (e) {
    console.error(`清除失败：${e.message}`)
    process.exit(1)
  }
}

// ── 取码 ──
fs.mkdirSync(DIR, { recursive: true })
let qr
try {
  qr = await loginQrcode()
} catch (e) {
  console.error(`取二维码失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  process.exit(1)
}

const data = qr?.data ?? qr ?? {}
if (data.is_logged_in) {
  console.log('已经登录了，不用再扫。')
  process.exit(0)
}

const img = data.img ?? ''
if (!String(img).startsWith('data:image')) {
  console.error('服务没返回二维码图片，原始返回：')
  console.error(JSON.stringify(qr).slice(0, 400))
  process.exit(1)
}

// 注意：不能写 split(',', 1)[1] —— 那个 1 是"数组最多留 1 个元素"，不是"只切一次"，
// 结果取到 undefined（2026-10-20 踩过）。用 indexOf 截取最稳。
const s = String(img)
const comma = s.indexOf(',')
const b64 = comma >= 0 ? s.slice(comma + 1) : ''
if (!b64) {
  console.error('二维码数据格式异常（没有 base64 段）：')
  console.error(s.slice(0, 120))
  process.exit(1)
}
const raw = Buffer.from(b64, 'base64')
const rawPath = path.join(DIR, 'qr.png')
fs.writeFileSync(rawPath, raw)

const desktopPath = path.join(HOME, 'Desktop', '小红书登录二维码.png')
let finalPath = rawPath
try {
  const { execFileSync } = await import('node:child_process')
  execFileSync('sips', ['-Z', '768', rawPath, '--out', desktopPath], { stdio: 'ignore' })
  finalPath = desktopPath
} catch { /* sips 不可用就退回原图，不阻断 */ }

console.log('请用【小红书 App】扫码登录：')
console.log(`  二维码：${finalPath}`)
console.log(`  有效期：${data.timeout ?? '约 4 分钟'}`)
console.log('  提示：App → 左上角扫一扫。别用微信扫。')
console.log('')
console.log('⚠️ 扫码后此账号的网页端会被踢下线（小红书同账号禁止多端登录），用手机 App 查看。')
console.log('')

// ── 轮询等待 ──
const DEADLINE = Date.now() + 4 * 60 * 1000
let last = ''
process.stdout.write('等待扫码 ')
while (Date.now() < DEADLINE) {
  await new Promise((r) => setTimeout(r, 3000))
  try {
    const s = await loginStatus()
    if (s.is_logged_in) {
      process.stdout.write('\n')
      console.log(`✓ 登录成功${s.username ? '：' + s.username : ''}`)
      try {
        const me = await myProfile()
        const u = me?.data ?? me ?? {}
        if (u.nickname || u.nick_name) console.log(`  账号：${u.nickname ?? u.nick_name}`)
      } catch { /* 昵称取不到不影响登录成功 */ }
      process.exit(0)
    }
  } catch { /* 轮询期的偶发失败忽略，继续等 */ }
  process.stdout.write('.')
  last = 'timeout'
}
process.stdout.write('\n')
console.log('二维码过期了。重新跑一次：node xhs.mjs login')
process.exit(last === 'timeout' ? 2 : 1)
