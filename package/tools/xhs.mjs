#!/usr/bin/env node
// 小红书统一入口：node xhs.mjs <命令> [参数...]
// 与 B 站的 bili.mjs 平行，参数原样透传给 commands/xhs-*.mjs。
//
// 设计原则（重要）：这是**新增的第 N 条腿**，不是替换。
//   B 站那套（feed/debrief/comment/...）一行没动，出问题也不会互相牵连。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const map = {
  // —— 接入与体检（只读/本地） ——
  doctor: ['commands/xhs-doctor.mjs', '依赖体检：服务是否在跑 / 登录态 / 权限 / 目录'],
  login: ['commands/xhs-login.mjs', '扫码登录（打印二维码路径；--status 只看状态 / --logout 重置）'],
  me: ['commands/xhs-me.mjs', '我是谁：当前登录账号信息'],

  // —— 刷（只读，安全） ——
  feed: ['commands/xhs-feed.mjs', '选题：首页推荐流 + 关键词搜索，按她的偏好排序 [--n 5] [--keyword "…"]'],
  read: ['commands/xhs-read.mjs', '读懂一条笔记：正文 + 互动数据 + 评论（含子评论）<feed_id> --token <xsec_token>'],

  // —— 互动（会真的发出去；必须 --dry 或 --go） ——
  like: ['commands/xhs-interact.mjs', 'like   <feed_id> --token <xsec_token> [--undo] --dry|--go'],
  fav: ['commands/xhs-interact.mjs', 'fav    <feed_id> --token <xsec_token> [--undo] --dry|--go'],
  comment: ['commands/xhs-interact.mjs', 'comment <feed_id> --token <xsec_token> --text "…" --dry|--go'],

  // —— 写（发布；必须 --go） ——
  note: ['commands/xhs-note.mjs', '发图文笔记：--title … --content … --images a.jpg,b.jpg [--dry|--go]'],

  // —— 她的日志（复用 B 站那套日记与事件流，按 platform 分开） ——
  diary: ['commands/xhs-diary.mjs', '写她的潜水日志到小红书：material / draft / push / approve / publish'],
}

const [cmd, ...rest] = process.argv.slice(2)
if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
  console.log('用法: node xhs.mjs <命令> [参数...]\n')
  console.log('命令:')
  for (const [name, [file, desc]] of Object.entries(map)) console.log(`  ${name.padEnd(10)} ${desc}`)
  console.log('\n安全约定:')
  console.log('  · 写操作必须显式 --dry（只打印）或 --go（真的发）')
  console.log('  · 一次一条；撞风控立刻停手，不重试、不换号')
  console.log('  · 小红书同账号禁止多端登录 —— 接了这里，网页端会被踢下线，用 App 看')
  process.exit(cmd ? 0 : 2)
}
const entry = map[cmd]
if (!entry) {
  console.error(`未知命令: ${cmd}\n跑 "node xhs.mjs help" 看清单。`)
  process.exit(2)
}

// like / fav / comment 三个入口共用 xhs-interact.mjs，该脚本靠**第一个位置参数**认动作，
// 所以这里必须把命令名本身排在最前面传进去（否则它就不知道该点赞还是该评论）。
const SHARED = new Set(['like', 'fav', 'comment'])
const args = SHARED.has(cmd) ? [cmd, ...rest] : rest

const r = spawnSync(process.execPath, [path.join(here, entry[0]), ...args], { stdio: 'inherit' })
process.exit(r.status ?? 1)
