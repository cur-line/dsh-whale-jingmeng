// 我是谁 —— 只读，确认当前登录的是哪个号。
//
// 为什么这么小的功能也要单独一条命令：
// 小红书同账号禁止多端登录，cookie 随时可能被别处踢掉。
// 一旦发现"发的东西不对/看不到自己的笔记"，第一件事就是确认现在挂的是哪个账号。
//
// 用法：node xhs.mjs me [--json]
import { myProfile, loginStatus, XhsError } from '../lib/xhs-client.mjs'

const AS_JSON = process.argv.slice(2).includes('--json')

// 先确认登录态：未登录时 /user/me 的行为不确定，不该靠猜
let st
try {
  st = await loginStatus()
} catch (e) {
  console.error(`检查登录状态失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  process.exit(1)
}
if (!st.is_logged_in) {
  console.error('✗ 未登录。先跑：node xhs.mjs login')
  process.exit(2)
}

let me
try {
  me = await myProfile()
} catch (e) {
  console.error(`读取账号信息失败：${e.message}`)
  if (e.hint?.()) console.error(`→ ${e.hint()}`)
  process.exit(1)
}

// 返回是三层嵌套：{ data: { data: { userBasicInfo: {...}, interactions, feeds } } }
// （2026-10-20 实测；直接读 data 会全空，别想当然）
const box = me?.data ?? me ?? {}
const u = box?.userBasicInfo ?? box?.user_basic_info ?? box?.data?.userBasicInfo ?? box

if (AS_JSON) {
  console.log(JSON.stringify(me, null, 2))
  process.exit(0)
}

console.log('当前登录的小红书账号\n')
const rows = [
  ['昵称', u.nickname ?? u.nick_name ?? u.name],
  ['小红书号', u.redId ?? u.red_id],
  ['简介', u.desc ?? u.description],
  ['性别', u.gender === 1 ? '男' : u.gender === 2 ? '女' : (u.gender ? String(u.gender) : '')],
  ['IP 属地', u.ipLocation ?? u.ip_location],
]
let shown = 0
for (const [k, v] of rows) {
  if (v === undefined || v === null || v === '') continue
  console.log(`  ${k.padEnd(8)} ${v}`)
  shown += 1
}
if (!shown) {
  console.log('  （服务返回的字段都是空的 —— 可能是刚登录、主页还没加载完）')
  console.log('  过几十秒再试，或直接看 App 确认当前账号。')
  process.exit(1)
}
