#!/usr/bin/env node
// 任务箱 —— 给鲸檬派活的队列
//
// 老板在面板/聊天里说一句大白话（比如「去看看那个新视频」「记得回评论」），
// 就 `add` 进队列；她下次醒来 `list` 看待办 → `claim` 认领 → 做完 `done` 标记完成。
//
// 参考 yangyu-bot 的做法（panel/task.mjs + store.mjs），但按本项目约定：
//   · 数据放 ~/.dsh/tasks.jsonl（JSONL，每行一个任务，人可直接读）
//   · 字段风格对齐 tools/lib/event-log.mjs（at/kind/note 那套，这里换成任务字段）
//
// 安全说明：任务箱只写本地 ~/.dsh/tasks.jsonl，**不对外发任何东西**
// （不调 B 站、不发动态），所以不需要 --dry/--go 闸门；真要执行任务
// 内容时，由鲸檬在会话里走对应命令（comment / interact / daily-diary…）自带闸门。
//
// 用法：
//   node task.mjs list [--all]                 看待办（--all 含已完成的）
//   node task.mjs add <type> <一句话> [--source 谁派的]   派活
//   node task.mjs claim <id>                   认领（pending → in_progress）
//   node task.mjs done <id> [--note "做了什么"] 标记完成
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.HOME || os.homedir()
const STATE_DIR = process.env.DSH_HOME || path.join(HOME, '.dsh')
const TASKS_FILE = path.join(STATE_DIR, 'tasks.jsonl')

// type → 中文提示（list 时任务没有具体内容就显示这个）
const TYPE_HINT = {
  browse: '随便刷刷B站，看到有意思的点个赞、写两句感想',
  browse_like: '刷B站，挑喜欢的点赞',
  comment: '挑几个视频留两句真实感想',
  diary: '把今天刷到的写进日记，晚上发动态',
  check: '看看有没有新评论和私信要回',
}
const STATUS_LABEL = {
  pending: '待办',
  in_progress: '进行中',
  done: '已完成',
}

// —— 参数解析：非 -- 开头的进 pos[]，--xxx [值] 进 opts ——
const argv = process.argv.slice(2)
const cmd = argv[0] || 'help'
const pos = []
const opts = {}
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opts[a.slice(2)] = true
    else { opts[a.slice(2)] = v; i += 1 }
  } else {
    pos.push(a)
  }
}

// —— 存储：JSONL，每行一个任务；坏行跳过；更新重写全文件 ——
function readTasks() {
  try {
    const lines = fs.readFileSync(TASKS_FILE, 'utf8').trim().split('\n').filter(Boolean)
    const out = []
    for (const l of lines) {
      try { out.push(JSON.parse(l)) } catch { /* 坏行跳过，不拖垮整个箱子 */ }
    }
    return out
  } catch {
    return []
  }
}

// 原子写：先写临时文件再 rename，断电也不会留下半个 JSONL
function writeTasks(tasks) {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true })
  const tmp = TASKS_FILE + '.tmp'
  fs.writeFileSync(tmp, tasks.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8')
  fs.renameSync(tmp, TASKS_FILE)
}

function findTask(tasks, id) {
  return tasks.find((t) => t.id === id)
}

function newId(tasks) {
  // id 形如 task-<ts>；同毫秒撞了就补个随机后缀
  let id = 'task-' + Date.now()
  while (tasks.some((t) => t.id === id)) {
    id = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  }
  return id
}

function localTime(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }) } catch { return iso }
}

// —— 子命令 ——
switch (cmd) {
  case 'list': {
    const all = readTasks()
    // 默认只列 pending（待办）；--all 列全部（含 done）
    const tasks = opts.all ? all : all.filter((t) => t.status === 'pending')
    if (tasks.length === 0) {
      console.log(opts.all ? '任务箱是空的。' : '没有待办任务。')
      break
    }
    console.log(opts.all ? `共 ${tasks.length} 条任务：\n` : `有 ${tasks.length} 条待办：\n`)
    // 新的在前
    for (const t of [...tasks].reverse()) {
      console.log(`[${t.id}]`)
      console.log(`  类型: ${t.type}`)
      console.log(`  内容: ${t.note || TYPE_HINT[t.type] || '(无说明)'}`)
      if (t.source) console.log(`  谁派的: ${t.source}`)
      console.log(`  状态: ${STATUS_LABEL[t.status] || t.status}`)
      if (t.status === 'done' && t.doneAt) console.log(`  完成于: ${localTime(t.doneAt)}`)
      console.log(`  派于: ${localTime(t.createdAt)}`)
      console.log('')
    }
    break
  }
  case 'add': {
    const type = pos[0]
    const note = pos.slice(1).join(' ').trim()
    if (!type || !TYPE_HINT[type]) {
      console.error('用法：node task.mjs add <type> <一句话> [--source 谁派的]')
      console.error(`type 只能是：${Object.keys(TYPE_HINT).join(' / ')}`)
      process.exit(2)
    }
    if (!note) {
      console.error('要有一句话内容（这活具体要她做什么）。')
      process.exit(2)
    }
    const tasks = readTasks()
    const task = {
      id: newId(tasks),
      type,
      note,
      source: opts.source ? String(opts.source) : 'panel',
      status: 'pending',
      createdAt: new Date().toISOString(),
      doneAt: null,
    }
    tasks.push(task)
    writeTasks(tasks)
    console.log(`已派活 ${task.id}（${type}，${task.source} 派的）：${note}`)
    break
  }
  case 'claim': {
    const id = pos[0]
    if (!id) { console.error('用法：node task.mjs claim <id>'); process.exit(2) }
    const tasks = readTasks()
    const t = findTask(tasks, id)
    if (!t) { console.error(`找不到任务 ${id}。`); process.exit(2) }
    if (t.status !== 'pending') {
      console.error(`${id} 当前是 ${STATUS_LABEL[t.status] || t.status}，只有待办才能认领。`)
      process.exit(2)
    }
    t.status = 'in_progress'
    t.claimedAt = new Date().toISOString()
    writeTasks(tasks)
    console.log(`已认领 ${id}（${t.type}）。`)
    break
  }
  case 'done': {
    const id = pos[0]
    if (!id) { console.error('用法：node task.mjs done <id> [--note "做了什么"]'); process.exit(2) }
    const tasks = readTasks()
    const t = findTask(tasks, id)
    if (!t) { console.error(`找不到任务 ${id}。`); process.exit(2) }
    if (t.status === 'done') { console.log(`${id} 已经是 done，不用重复标记。`); process.exit(0) }
    t.status = 'done'
    t.doneAt = new Date().toISOString()
    // --note 存进 doneNote（这活她做了什么）
    if (opts.note && typeof opts.note === 'string') t.doneNote = opts.note
    writeTasks(tasks)
    console.log(`已完成 ${id}${t.doneNote ? '：' + t.doneNote : ''}。`)
    break
  }
  default:
    console.log(`任务箱 —— 给鲸檬派活的队列

用法：
  node task.mjs list [--all]                   看待办（--all 含已完成的）
  node task.mjs add <type> <一句话> [--source 谁派的]   派活
  node task.mjs claim <id>                     认领
  node task.mjs done <id> [--note "做了什么"]   标记完成

type 说明：
${Object.entries(TYPE_HINT).map(([k, v]) => `  ${k.padEnd(12)} ${v}`).join('\n')}`)
}
