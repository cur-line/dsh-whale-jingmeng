#!/usr/bin/env node
// Execute the real CLIs with disposable state and an allowlisted fetch stub.
// Missing credentials, early exceptions, unexpected requests, and nonzero exits fail.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jingmeng-behavior-'))
const home = path.join(temporary, 'home')
const state = path.join(home, '.dsh')
const bili = path.join(home, '.bili-ai')
const fixtureFile = path.join(temporary, 'responses.json')
const traceFile = path.join(temporary, 'requests.jsonl')
const preload = path.join(temporary, 'fetch-stub.mjs')
const configFile = path.join(state, 'bili-whale.config.json')
const env = {
  PATH: process.env.PATH || '', HOME: home, USERPROFILE: home, DSH_HOME: state,
  BILI_WHALE_CONFIG: configFile, WHALE_CFG: configFile,
  TZ: 'Asia/Shanghai', LANG: 'en_US.UTF-8', NODE_OPTIONS: '',
  TEST_RESPONSES: fixtureFile, TEST_TRACE: traceFile,
}
let passed = 0
let failed = 0
function test(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`) }
  catch (error) { failed += 1; console.error(`FAIL ${name}\n${error.stack}`) }
}
const id = number => `BV${String(number).padStart(10, '0')}`
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value)) }
function configure(value = {}) { writeJson(configFile, value) }
function run(command, args = [], responses = {}) {
  writeJson(fixtureFile, responses)
  fs.writeFileSync(traceFile, '')
  const result = spawnSync(process.execPath,
    ['--import', preload, path.join(root, 'tools', 'commands', `${command}.mjs`), ...args],
    { env, encoding: 'utf8', timeout: 15000 })
  const trace = fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  assert.equal(result.status, 0, `${command} must complete successfully:\n${result.stdout}\n${result.stderr}\n${result.error || ''}`)
  assert(!trace.some(request => !request.allowed), `Unexpected network request: ${JSON.stringify(trace)}`)
  return { out: result.stdout, trace }
}

try {
  fs.mkdirSync(state, { recursive: true })
  fs.mkdirSync(bili, { recursive: true })
  writeJson(path.join(bili, 'credentials.json'), { sessdata: 'fixture-not-a-real-session', bili_jct: 'fixture-csrf', buvid3: 'fixture-device' })
  fs.writeFileSync(preload, `import fs from 'node:fs';
const responses=JSON.parse(fs.readFileSync(process.env.TEST_RESPONSES,'utf8'));
globalThis.fetch=async(input,options={})=>{
 const url=new URL(String(input));const method=String(options.method||'GET').toUpperCase();
 const key=url.pathname==='/x/polymer/web-dynamic/v1/detail'?url.pathname+'?id='+url.searchParams.get('id'):url.pathname;
 const allowed=method==='GET'&&url.origin==='https://api.bilibili.com'&&Object.hasOwn(responses,key);
 fs.appendFileSync(process.env.TEST_TRACE,JSON.stringify({path:key,method,allowed})+'\\n');
 if(!allowed)throw new Error('Real network disabled; unexpected request '+method+' '+url.origin+key);
 const data=responses[key];return {ok:true,status:200,headers:new Headers({'content-type':'application/json'}),async json(){return data},async text(){return JSON.stringify(data)}};
};`)

  configure({ owner: { mid: '1', name: 'A.B*C[D](' }, self: { name: '自己的鲸' },
    preferences: { like: ['AI'], dislike: ['广告'] } })
  fs.writeFileSync(path.join(state, 'whale-diary.md'), `已看过 ${id(8)}\n`)
  writeJson(path.join(bili, 'feedback.json'), { events: [{ kind: 'like', bv: id(99), videoTitle: 'A.B*C[D]( AI学习笔记' }] })
  const search = (number, title, duration, danmaku = 10, play = 1000, author = '外部作者') =>
    ({ bvid: id(number), title, duration, danmaku, play, author })
  const feedResponses = {
    '/x/web-interface/nav': { code: 0, data: { wbi_img: { img_url: 'https://fixture/a123456789012345678901234567890123456.png', sub_url: 'https://fixture/b123456789012345678901234567890123456.png' } } },
    '/x/web-interface/wbi/search/type': { code: 0, data: { result: [
      search(1, 'AI 主候选', '02:00', 100, 1000),
      search(2, 'AI 太短', '00:59', 99999), search(3, 'AI 零时长', '00:00', 99999),
      search(4, 'AI 超长回放', '21:54:34', 99999), search(5, 'AI 刚超上限', '01:00:01', 99999),
      search(6, 'AI 坏时长', 'unknown', 99999), search(7, 'AI 广告', '02:00', 99999),
      search(8, 'AI 已看过', '02:00', 99999), search(9, 'AI 自己的视频', '02:00', 99999, 1000, '自己的鲸'),
      search(10, 'AI 最短边界', '01:00'), search(11, 'AI 最长边界', '01:00:00'),
    ] } },
    '/x/web-interface/popular': { code: 0, data: { list: [
      { bvid: id(1), title: 'AI 主候选', duration: 120, stat: { danmaku: 500, view: 1000 }, owner: { name: '外部作者' } },
    ] } },
    '/x/web-interface/ranking/v2': { code: 0, data: { list: [] } },
    '/x/polymer/web-dynamic/v1/feed/all': { code: 0, data: { items: [
      { modules: { module_author: { name: '外部作者' }, module_dynamic: { major: { archive:
        { bvid: id(1), title: 'AI 主候选', duration_text: '02:00', stat: { play: 99999 } } } } } },
    ] } },
  }
  let feed
  test('feed completes with regex metacharacters in a nickname and a real feedback-learning branch', () => {
    feed = run('feed', ['--n', '20', '--per', '20', '--pool', '100'], feedResponses)
    assert.match(feed.out, /被赞 1 条/)
    const learned = feed.out.match(/学会 (\d+) 个主题词/)
    assert(learned && Number(learned[1]) > 0, 'learning must execute, not exit before processing nickname')
    assert(feed.trace.some(request => request.path.includes('/search/type')))
  })
  const selection = () => {
    assert(feed, 'feed execution must succeed before examining its output')
    return feed.out.split('\n').filter(line => /^\s*\d+\. BV/.test(line))
  }
  test('feed actually removes invalid/out-of-range durations, disliked, seen, and self videos', () => {
    const rows = selection()
    const selectedIds = rows.map(row => row.match(/BV[0-9A-Za-z]{10}/)[0])
    assert.deepEqual(new Set(selectedIds), new Set([id(1), id(10), id(11)]))
    assert.equal(rows.length, 3)
  })
  test('feed dedup retains real danmaku when the following source has zero danmaku', () => {
    const rows = selection().filter(row => row.includes(id(1)))
    assert.equal(rows.length, 1, 'one row per BV')
    assert.match(rows[0], /弹幕\s*500\b/)
  })
  test('feed dedup retains the maximum known play count across all duplicate sources', () => {
    const row = selection().find(row => row.includes(id(1)))
    assert.match(row, /播放\s*99999\b/, 'following must not lose the larger known play count')
  })

  // Review uses the actual published queue, and an obsolete queue is a decoy.
  configure({ self: { mid: '2' } })
  const entry = dynId => ({ date: today(), dynId, status: 'published', chars: 20, publishedAt: new Date().toISOString() })
  writeJson(path.join(state, 'jingmeng-diary-queue.json'), { entries: [entry('1001'), entry('1002')] })
  writeJson(path.join(state, 'deepread-diary-queue.json'), { entries: [entry('9999')] })
  const account = { code: 0, data: { card: { name: '测试鲸', fans: 3, attention: 2 }, like_num: 6, archive_count: 1 } }
  const known = { code: 0, data: { item: { modules: { module_stat: { like: { count: 6 }, comment: { count: 3 }, forward: { count: 2 } } } } } }
  const unavailable = { code: -403, message: 'fixture data unavailable' }
  const mixed = { '/x/web-interface/card': account, '/x/polymer/web-dynamic/v1/detail?id=1001': known, '/x/polymer/web-dynamic/v1/detail?id=1002': unavailable }
  test('review reads the current queue and preserves unavailable statistics as unknown', () => {
    const r = run('review', ['--json'], mixed)
    const report = JSON.parse(r.out)
    assert.equal(report.publishedCount, 2)
    assert.deepEqual(report.dynStats.map(item => item.dynId), ['1001', '1002'])
    assert.equal(report.dynStats[0].statKnown, true)
    assert.equal(report.dynStats[0].like, 6)
    assert.equal(report.dynStats[1].statKnown, false)
    assert.equal(report.dynStats[1].like, null)
    assert.equal(report.dynStats[1].comment, null)
    assert.equal(report.dynStats[1].forward, null)
    assert(!r.trace.some(request => request.path.includes('9999')))
  })
  test('review averages known samples only instead of treating unknown as zero', () => {
    const { out } = run('review', [], mixed)
    assert.match(out, /平均每条 6\.0 个赞/)
    assert.match(out, /已知样本 1 条，另有 1 条读不到/)
    assert.doesNotMatch(out, /平均每条 3\.0/)
  })
  test('review does not report a mean or a zero-engagement conclusion when all data is unknown', () => {
    const { out } = run('review', [], { ...mixed, '/x/polymer/web-dynamic/v1/detail?id=1001': unavailable })
    assert.match(out, /一条互动数据都没读到/)
    assert.doesNotMatch(out, /平均每条|基本没人看到/)
  })

  configure({})
  const bv = id(42)
  const creations = path.join(state, 'creations', `${today()}-${bv}`)
  const brief = path.join(creations, 'brief.md')
  const outline = path.join(creations, 'outline.json')
  const createResponses = {
    '/x/web-interface/view': { code: 0, data: { title: 'AI 隔离测试', owner: { name: '测试作者', mid: 3 }, aid: 1, cid: 2, duration: 120, desc: 'fixture', stat: {} } },
    '/x/player/wbi/v2': { code: 0, data: { subtitle: { subtitles: [] } } },
  }
  fs.mkdirSync(creations, { recursive: true })
  const manualBrief = '# 人工观点，重跑必须保留。\n'
  const manualOutline = JSON.stringify({ manual: '人工分镜，重跑必须保留。' })
  fs.writeFileSync(brief, manualBrief)
  fs.writeFileSync(outline, manualOutline)
  test('create brief preserves existing human edits and succeeds through the stubbed API', () => {
    const { out, trace } = run('create', ['brief', bv], createResponses)
    assert.equal(fs.readFileSync(brief, 'utf8'), manualBrief)
    assert.match(out, /未覆盖/)
    assert.match(out, /--force/)
    assert(trace.some(request => request.path === '/x/web-interface/view'))
  })
  test('create outline preserves existing human edits', () => {
    const { out } = run('create', ['outline', bv, '--sec', '90'], createResponses)
    assert.equal(fs.readFileSync(outline, 'utf8'), manualOutline)
    assert.match(out, /未覆盖/)
  })
  test('explicit create --force regenerates a brief', () => {
    const { out } = run('create', ['brief', bv, '--force'], createResponses)
    const content = fs.readFileSync(brief, 'utf8')
    assert.notEqual(content, manualBrief)
    assert.match(content, /AI 隔离测试/)
    assert.match(out, /已生成创作简报/)
  })
  test('generated outline has contiguous, nonnegative scenes with an exact total duration', () => {
    run('create', ['outline', bv, '--sec', '90', '--force'], createResponses)
    const result = JSON.parse(fs.readFileSync(outline, 'utf8'))
    assert.equal(result.totalSeconds, 90)
    assert.equal(result.scenes.length, 6)
    let end = 0
    for (const scene of result.scenes) {
      assert.equal(scene.from, end)
      assert(scene.dur >= 0)
      assert.equal(scene.to - scene.from, scene.dur)
      end = scene.to
    }
    assert.equal(end, 90)
    assert.equal(result.scenes.reduce((sum, scene) => sum + scene.dur, 0), 90)
  })
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
console.log(`Result: ${passed} passed, ${failed} failed`)
process.exitCode = failed ? 1 : 0
