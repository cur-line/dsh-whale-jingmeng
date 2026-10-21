// 特别关注命令 —— 名单里的人发新视频，鲸檬优先看。
//
// 用法：
//   node bili.mjs vip check         拉一次特别关注动态流，打印新视频（只读，不互动）
//   node bili.mjs vip done <BV>     记一条已处理（今天配额 -1）
//   node bili.mjs vip status        看名单、今天还剩几条配额
//
// 名单配置：~/.dsh/bili-whale.config.json 的 vip.users = [{ uid, name }]
// 每天最多：vip.dailyMax（默认 6）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { config } from '../lib/config.mjs'
import { fetchVipDynamics, markVipDone, vipDailyLeft } from '../lib/vip.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const CRED_FILE = path.join(HOME, '.bili-ai', 'credentials.json')

const argv = process.argv.slice(2)
const cmd = argv[0]

function loadCred() {
  try { return JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')) }
  catch { console.error('凭据读取失败：' + CRED_FILE); process.exit(2) }
}

async function main() {
  const cfg = config()
  const vip = cfg.vip ?? {}
  const users = Array.isArray(vip.users) ? vip.users : []
  const max = Number(vip.dailyMax) || 6

  if (cmd === 'status') {
    console.log(`特别关注名单（${users.length} 人）· 每天最多 ${max} 条`)
    if (!users.length) { console.log('（名单为空：在配置 vip.users 里加 [{ uid, name }]）') }
    for (const u of users) console.log(`  · ${u.name ?? '?'}（mid ${u.uid}）`)
    console.log(`今日剩余配额：${vipDailyLeft(cfg)} 条`)
    process.exit(0)
  }

  if (cmd === 'done') {
    const bvid = argv[1]
    if (!bvid) { console.error('用法：node bili.mjs vip done <BV>'); process.exit(2) }
    markVipDone(bvid)
    console.log(`✓ 已记账 ${bvid}（今日剩余 ${vipDailyLeft(cfg)} 条）`)
    process.exit(0)
  }

  if (!cmd || cmd === 'check') {
    const cred = loadCred()
    if (!users.length) { console.log('没有特别关注名单（配置 vip.users 为空），跳过。'); process.exit(0) }
    const left = vipDailyLeft(cfg)
    if (left <= 0) { console.log(`今天 ${max} 条配额已用完，明天再来。`); process.exit(0) }
    console.log(`正在查 ${users.length} 位特别关注的动态流…`)
    const fresh = await fetchVipDynamics(cred, cfg)
    if (!fresh.length) { console.log('没有新视频（72h 内 + 未看过）。'); process.exit(0) }
    console.log(`\n特别关注新视频 ${fresh.length} 条（今日剩 ${left}）：`)
    for (const v of fresh) console.log(`  《${v.title}》 by ${v.name || v.owner} · ${v.bvid}`)
    console.log('\n处理：node bili.mjs watch-video <BV> 真看 → interact like/coin → vip done <BV> 记账')
    process.exit(0)
  }

  console.error('未知命令：' + cmd)
  console.error('用法：node bili.mjs vip check | done <BV> | status')
  process.exit(2)
}

main().catch((e) => { console.error(String(e.message)); process.exit(1) })
