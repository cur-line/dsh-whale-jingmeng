#!/usr/bin/env node
// Regression: collect watch must re-read source files and refresh the JSON snapshot.
// Every source and output lives under a disposable, credential-free HOME.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jingmeng-collect-test-'))
const state = path.join(root, '.dsh')
const config = path.join(state, 'bili-whale.config.json')
const output = path.join(root, 'whale-dashboard.json')
const collector = fileURLToPath(new URL('../tools/collect.mjs', import.meta.url))
let child
let exited = false
let childError
let log = ''

async function waitForSnapshot(name, previousTimestamp) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    if (childError) throw childError
    if (exited) throw new Error(`collector exited before ${name}: ${log}`)
    try {
      const json = JSON.parse(await fs.readFile(output, 'utf8'))
      if (json.persona.name === name && json.generatedAt !== previousTimestamp) return json
    } catch (error) {
      // Poll through the initial absence and the short interval between writes.
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
    await delay(50)
  }
  throw new Error(`timed out waiting for fresh JSON (${name}): ${log}`)
}

try {
  await fs.mkdir(state, { recursive: true })
  await fs.writeFile(config, JSON.stringify({ persona: { name: 'fixture-before' } }))
  child = spawn(process.execPath, [collector, '--watch', '5', '--out', output], {
    env: { ...process.env, HOME: root, USERPROFILE: root, DSH_HOME: state },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.once('error', (error) => { childError = error; exited = true })
  child.once('exit', () => { exited = true })
  child.stdout.on('data', (chunk) => { log += chunk })
  child.stderr.on('data', (chunk) => { log += chunk })
  const first = await waitForSnapshot('fixture-before')
  assert.equal(first.checks.find((check) => check.name === 'B站凭据').ok, false)
  await fs.writeFile(config, JSON.stringify({ persona: { name: 'fixture-after' } }))
  await fs.writeFile(path.join(state, 'whale-log.jsonl'), JSON.stringify({
    at: new Date().toISOString(), kind: 'feed', note: 'isolated fixture event',
  }) + '\n')
  const second = await waitForSnapshot('fixture-after', first.generatedAt)
  assert.equal(first.stats.totalEvents, 0)
  assert.equal(second.stats.totalEvents, 1)
  assert.equal(second.checks.find((check) => check.name === 'B站凭据').ok, false)

  // 点赞标题补全：interact 事件 note 应带《标题》（从「看过」表格映射）
  const diary = [
    '| 日期 | BV | 标题 | 想法 |',
    '| 2026-10-21 | BV1TEST00001 | 测试视频标题 | 不错 |',
  ].join('\n')
  await fs.writeFile(path.join(state, 'whale-diary.md'), diary + '\n')
  await fs.writeFile(path.join(state, 'whale-log.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), kind: 'interact', note: 'like', target: 'BV1TEST00001', meta: { action: 'like' } }) + '\n')
  const third = await waitForSnapshot('fixture-after', second.generatedAt)
  const like = third.events.find((e) => e.kind === 'interact' && e.target === 'BV1TEST00001')
  assert.ok(like, 'interact event must exist')
  assert.match(like.note, /点赞《测试视频标题》/, `note should carry title, got: ${like.note}`)

  console.log('PASS collect: watch refreshes JSON, timestamps, events, and like-title enrichment in isolated HOME')
} finally {
  if (child && !exited) {
    child.kill('SIGTERM')
    const deadline = Date.now() + 2_000
    while (!exited && Date.now() < deadline) await delay(25)
    if (!exited) {
      child.kill('SIGKILL')
      while (!exited) await delay(25)
    }
  }
  await fs.rm(root, { recursive: true, force: true })
}
