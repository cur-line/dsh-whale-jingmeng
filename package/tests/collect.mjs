#!/usr/bin/env node
// Regression: dashboard watch must re-read source files and refresh both exports.
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
const output = path.join(root, 'dashboard', 'data.json')
const standalone = path.join(root, 'dashboard', '鲸檬面板.html')
const collector = fileURLToPath(new URL('../tools/collect.mjs', import.meta.url))
let child
let exited = false
let childError
let log = ''

function inlineSnapshot(html) {
  const match = html.match(/window\.__DASHBOARD_DATA__ = (.+?);\n<\/script>/)
  assert.ok(match, 'standalone HTML must include the collected snapshot')
  return JSON.parse(match[1])
}

async function waitForSnapshot(name, previousTimestamp) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    if (childError) throw childError
    if (exited) throw new Error(`collector exited before ${name}: ${log}`)
    try {
      const json = JSON.parse(await fs.readFile(output, 'utf8'))
      const inline = inlineSnapshot(await fs.readFile(standalone, 'utf8'))
      if (json.persona.name === name && inline.persona.name === name &&
          json.generatedAt === inline.generatedAt &&
          json.generatedAt !== previousTimestamp) return { json, inline }
    } catch (error) {
      // Poll through the initial absence and the short interval between writes.
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError) &&
          !(error instanceof assert.AssertionError)) throw error
    }
    await delay(50)
  }
  throw new Error(`timed out waiting for fresh JSON and HTML (${name}): ${log}`)
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
  assert.equal(first.json.checks.find((check) => check.name === 'B站凭据').ok, false)
  await fs.writeFile(config, JSON.stringify({ persona: { name: 'fixture-after' } }))
  await fs.writeFile(path.join(state, 'whale-log.jsonl'), JSON.stringify({
    at: new Date().toISOString(), kind: 'feed', note: 'isolated fixture event',
  }) + '\n')
  const second = await waitForSnapshot('fixture-after', first.json.generatedAt)
  assert.equal(first.json.stats.totalEvents, 0)
  assert.equal(second.json.stats.totalEvents, 1)
  assert.equal(second.inline.stats.totalEvents, 1)
  assert.equal(second.json.checks.find((check) => check.name === 'B站凭据').ok, false)
  console.log('PASS collect: watch refreshes JSON, HTML, timestamps, and events in isolated HOME')
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
