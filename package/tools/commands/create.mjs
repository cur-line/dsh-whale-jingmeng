// 创作 —— 把「她读懂了什么」变成「一条视频的脚本骨架」。
//
// 为什么需要：完整闭环里，刷和懂都做完了，但看懂之后没有出口。
// 她要能把自己的判断整理成能拍的东西，这才算「会创作」。
//
// 分工（和 daily-diary 一致）：
//   · 内容与观点 → 她自己写（在会话里，带人格）
//   · 结构、时长、分镜卡点 → 本脚本给骨架（确定性，不靠模型现编）
//   · 落盘格式 → 本脚本保证（后面 Remotion 能直接读）
//
// 用法：
//   node create.mjs brief  <BV>                从一条视频生成创作简报（选题角度/受众/钩子）
//   node create.mjs outline <BV> [--sec 90]    生成分镜骨架（保存 JSON）
//   node create.mjs list                       看已有的创作项目
//   node create.mjs show <项目id>              看某个项目的分镜
//
// 产物位置：~/.dsh/creations/<日期>-<BV>/
//   brief.md      创作简报（她填观点）
//   outline.json  分镜骨架（给 Remotion）
//   script.md     口播稿（她写）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { logEvent } from '../lib/event-log.mjs'
import { config } from '../lib/config.mjs'

const HOME = process.env.HOME || os.homedir()
const DSH = path.join(HOME, '.dsh')
const BILI = path.join(HOME, '.bili-ai')
const CREATIONS = path.join(DSH, 'creations')

const argv = process.argv.slice(2)
const cmd = argv[0]
const FORCE = argv.includes('--force')   // 允许覆盖已有的人工稿
function opt(name, def) {
  const i = argv.indexOf('--' + name)
  return i < 0 ? def : argv[i + 1]
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb }
}

const cred = readJson(path.join(BILI, 'credentials.json'), null)
const COOKIE = cred ? `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 || ''}` : ''

async function api(p) {
  try {
    const r = await fetch('https://api.bilibili.com' + p, {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', cookie: COOKIE },
    })
    return await r.json()
  } catch (e) { return { code: -1, message: String(e.message) } }
}

function die(m, c = 2) { console.error(m); process.exit(c) }

// ── 读视频信息 ──────────────────────────────────────────────────
async function videoInfo(bv) {
  if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) die(`不是合法 BV 号：${bv}`)
  const v = await api(`/x/web-interface/view?bvid=${bv}`)
  if (v.code !== 0) die(`查视频失败：${v.code} ${v.message}`, 4)
  const d = v.data
  return {
    bv,
    title: d.title,
    up: d.owner?.name,
    upMid: d.owner?.mid,
    aid: d.aid,
    cid: d.cid,
    duration: d.duration,
    desc: d.desc,
    pic: d.pic,
    tname: d.tname,
    stat: {
      play: d.stat?.view,
      danmaku: d.stat?.danmaku,
      like: d.stat?.like,
      coin: d.stat?.coin,
      fav: d.stat?.favorite,
      reply: d.stat?.reply,
    },
    pubdate: d.pubdate,
  }
}

// 取官方字幕（有就读，没有就说明只能看弹幕+画面）
async function subtitles(bv, cid, aid) {
  const j = await api(`/x/player/wbi/v2?bvid=${bv}&cid=${cid}`)
  const list = j?.data?.subtitle?.subtitles ?? []
  if (!list.length) return { count: 0, lines: [] }
  const url = list[0].subtitle_url
  if (!url) return { count: 0, lines: [] }
  try {
    const full = url.startsWith('//') ? 'https:' + url : url
    const r = await fetch(full, { headers: { 'user-agent': UA, referer: `https://www.bilibili.com/video/${bv}/` } })
    const s = await r.json()
    const lines = (s.body ?? []).map((x) => ({ t: x.from, text: x.content }))
    return { count: lines.length, lines }
  } catch { return { count: 0, lines: [] } }
}

function mdBrief(info, sub) {
  const mins = Math.floor(info.duration / 60)
  const secs = info.duration % 60
  return `# 创作简报 · ${info.title}

> 源视频：${info.bv} · UP ${info.up} · ${mins}分${secs}秒 · 分区 ${info.tname || '未知'}
> 数据：播放 ${info.stat.play ?? '?'} · 弹幕 ${info.stat.danmaku ?? '?'} · 点赞 ${info.stat.like ?? '?'} · 评论 ${info.stat.reply ?? '?'}
> 字幕：${sub.count ? `${sub.count} 行` : '无官方字幕（只能靠弹幕+画面）'}

## 一、她认为这条讲的是什么

（她填：一句话概括，不许抄标题）

## 二、她为什么想讲这个

（她填：哪个点让她坐直了 / 哪句弹幕让她不服气 / 哪个问题视频没回答）

## 三、这条能做成什么

（她填：观点型？科普型？吐槽型？教程型？）

## 四、钩子（前 3 秒要说什么）

（她填：一句话，能让人不划走）

## 五、她独有的角度

（她填：真人 UP 给不了的角度 —— 她自己是 AI，这是她的优势）

## 六、不做什么

（她填：哪些话不该说、哪些结论她没把握）

---
*本文件由 create brief 生成骨架，观点部分由她填写。*
`
}

// ── 分镜骨架 ────────────────────────────────────────────────────
// 结构：钩子 → 铺垫 → 主体 2-3 段 → 收尾
// 每段给时长配额，Remotion 按这个做帧分配
function mdOutline(info, seconds) {
  const hook = Math.round(seconds * 0.08)
  const setup = Math.round(seconds * 0.15)
  const body = Math.round(seconds * 0.62)
  const tail = seconds - hook - setup - body
  const perBody = Math.round(body / 3)

  const scenes = [
    { id: 's1', role: 'hook', dur: hook, label: '钩子', note: '3 秒内说清为什么要看，别自我介绍' },
    { id: 's2', role: 'setup', dur: setup, label: '铺垫', note: '交代这是什么、她为什么会点开' },
    { id: 's3', role: 'body1', dur: perBody, label: '主体 1', note: '最反直觉的那个点' },
    { id: 's4', role: 'body2', dur: perBody, label: '主体 2', note: '她的判断 / 和主流说法的分歧' },
    { id: 's5', role: 'body3', dur: perBody, label: '主体 3', note: '能让人记住的那个细节' },
    { id: 's6', role: 'tail', dur: tail, label: '收尾', note: '不要总结，留一句话让人想评论' },
  ]

  // ⚠️ 各段取整会累计误差（实测 90s 配出 91s）—— 最后一段吃掉落差，保证总和精确
  let cum = 0
  for (let i = 0; i < scenes.length; i += 1) {
    const s = scenes[i]
    s.from = cum
    s.to = (i === scenes.length - 1) ? seconds : cum + s.dur
    s.dur = s.to - s.from
    cum = s.to
  }

  return {
    source: { bv: info.bv, title: info.title, up: info.up },
    totalSeconds: seconds,
    aspect: '16:9',
    resolution: '1920x1080',
    fps: 30,
    scenes,
  }
}

// ── 命令 ────────────────────────────────────────────────────────
if (cmd === 'brief') {
  const bv = argv[1]
  if (!bv) die('用法: node create.mjs brief <BV>')
  const info = await videoInfo(bv)
  const sub = await subtitles(info.bv, info.cid, info.aid)

  const dir = path.join(CREATIONS, `${new Date().toLocaleDateString('sv-SE')}-${bv}`)
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'brief.md')
  // ⚠️ 同一天同一 BV 重跑会覆盖她手写的观点 —— 默认拒绝，要覆盖得显式 --force
  if (fs.existsSync(p) && !FORCE) {
    console.log(`已存在创作简报，未覆盖：${p}`)
    console.log('  （要重新生成加 --force；她填过的观点会被冲掉）')
    process.exit(0)
  }
  fs.writeFileSync(p, mdBrief(info, sub), 'utf8')

  // 字幕全文也存一份，供她写稿时查阅
  if (sub.count) {
    fs.writeFileSync(path.join(dir, 'subtitle.txt'),
      sub.lines.map((l) => `[${String(Math.floor(l.t / 60)).padStart(2, '0')}:${String(Math.floor(l.t % 60)).padStart(2, '0')}] ${l.text}`).join('\n'),
      'utf8')
  }

  console.log(`已生成创作简报：${p}`)
  console.log(`  ${info.title}`)
  console.log(`  ${sub.count ? `字幕 ${sub.count} 行已存` : '无官方字幕'}`)
  try { logEvent('create-brief', { target: bv, note: info.title.slice(0, 60) }) } catch {}
} else if (cmd === 'outline') {
  const bv = argv[1]
  if (!bv) die('用法: node create.mjs outline <BV> [--sec 90]')
  const seconds = Number(opt('sec', 90)) || 90
  const info = await videoInfo(bv)

  const dir = path.join(CREATIONS, `${new Date().toLocaleDateString('sv-SE')}-${bv}`)
  fs.mkdirSync(dir, { recursive: true })
  const outline = mdOutline(info, seconds)
  const p = path.join(dir, 'outline.json')
  if (fs.existsSync(p) && !FORCE) {
    console.log(`已存在分镜骨架，未覆盖：${p}`)
    console.log('  （要重新生成加 --force）')
    process.exit(0)
  }
  fs.writeFileSync(p, JSON.stringify(outline, null, 2), 'utf8')

  console.log(`已生成分镜骨架：${p}`)
  console.log(`  总时长 ${seconds}s · ${outline.scenes.length} 个镜头`)
  for (const s of outline.scenes) {
    console.log(`  ${s.id}  ${s.from}s–${s.to}s (${s.dur}s)  ${s.label}  — ${s.note}`)
  }
  try { logEvent('create-outline', { target: bv, note: `${seconds}s / ${outline.scenes.length} 镜头` }) } catch {}
} else if (cmd === 'list') {
  if (!fs.existsSync(CREATIONS)) { console.log('还没有创作项目。'); process.exit(0) }
  const dirs = fs.readdirSync(CREATIONS).filter((d) => fs.statSync(path.join(CREATIONS, d)).isDirectory())
  if (!dirs.length) { console.log('还没有创作项目。'); process.exit(0) }
  console.log(`共 ${dirs.length} 个创作项目：\n`)
  for (const d of dirs.sort().reverse()) {
    const full = path.join(CREATIONS, d)
    const files = fs.readdirSync(full)
    const hasBrief = files.includes('brief.md')
    const hasOutline = files.includes('outline.json')
    let total = ''
    if (hasOutline) {
      try { total = ` · ${JSON.parse(fs.readFileSync(path.join(full, 'outline.json'), 'utf8')).totalSeconds}s` } catch {}
    }
    console.log(`  ${d}`)
    console.log(`    简报 ${hasBrief ? '✓' : '✗'} · 分镜 ${hasOutline ? '✓' : '✗'}${total} · ${files.length} 个文件`)
  }
} else if (cmd === 'show') {
  const id = argv[1]
  if (!id) die('用法: node create.mjs show <项目id>')
  const p = path.join(CREATIONS, id, 'outline.json')
  if (!fs.existsSync(p)) die(`找不到：${p}`, 4)
  const o = JSON.parse(fs.readFileSync(p, 'utf8'))
  console.log(JSON.stringify(o, null, 2))
} else {
  console.log(`创作命令

  node create.mjs brief   <BV> [--force]          从一条视频生成创作简报
  node create.mjs outline <BV> [--sec 90] [--force]  生成分镜骨架
  node create.mjs list                       看已有创作项目
  node create.mjs show   <项目id>            看某个项目的分镜

产物：~/.dsh/creations/<日期>-<BV>/
  brief.md      创作简报（她填观点）
  outline.json  分镜骨架（给 Remotion）
  subtitle.txt  字幕原文（有的话）`)
}
