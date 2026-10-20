#!/usr/bin/env node
// Count Shanghai calendar days consistently across UTC midnight boundaries.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jingmeng-timezone-test-'))
try {
  const state = path.join(root, '.dsh')
  await fs.mkdir(state)
  const events = [
    { at: '2026-10-20T16:01:00Z', kind: 'feed' }, // Shanghai Oct 21
    { at: '2026-10-20T15:59:00Z', kind: 'feed' }, // Shanghai Oct 20
    { at: 'invalid timestamp', kind: 'error' },
    { kind: 'error' },
  ]
  await fs.writeFile(path.join(state, 'whale-log.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const collector = new URL('../tools/collect.mjs', import.meta.url).href
  const script = `
    const NativeDate = Date;
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-20T16:30:00Z'])); }
      static now() { return NativeDate.parse('2026-10-20T16:30:00Z'); }
    };
    process.argv = [process.execPath, 'collect.mjs', '--stdout'];
    await import(${JSON.stringify(collector)});
  `
  for (const timezone of ['UTC', 'America/Los_Angeles']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, HOME: root, USERPROFILE: root, DSH_HOME: state, TZ: timezone },
      encoding: 'utf8', timeout: 10_000,
    })
    assert.equal(result.status, 0, result.stderr)
    const data = JSON.parse(result.stdout)
    assert.equal(data.generatedAt, '2026-10-20T16:30:00.000Z')
    assert.equal(data.stats.totalEvents, 4)
    assert.equal(data.stats.todayEvents, 1, `${timezone}: only the Shanghai Oct 21 event is today`)
    assert.deepEqual(data.stats.todayByKind, { feed: 1 })
    assert.equal(data.checks.find((check) => check.name === 'B站凭据').ok, false)
  }
  console.log('PASS collector-timezone: Shanghai date boundary is host-timezone independent; invalid dates excluded')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
