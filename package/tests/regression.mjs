import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jingmeng-regression-'))
const sandbox = path.join(temp, 'package')
fs.cpSync(pkg, sandbox, { recursive: true })
const home = path.join(temp, 'home')
const state = path.join(home, '.dsh')
fs.mkdirSync(state, { recursive: true })
const env = { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: state,
  BILI_WHALE_CONFIG: path.join(state, 'bili-whale.config.json'),
  DSH_NODE: process.execPath, DEEPREAD_OWNER_OPEN_ID: '' }
const run = (args, options = {}) => {
  const r = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 10000, ...options })
  assert.equal(r.status, 0, r.stderr || r.stdout || String(r.error))
  return r.stdout
}
try {
  const diary = path.join(sandbox, 'tools/commands/daily-diary.mjs')
  assert.match(run([diary, 'material']), /素材/)
  run([diary, 'draft', '--stdin'], { input: '今天潜到很深的地方，捡到一个好故事。' })
  assert.match(run([diary, 'show']), /捡到一个好故事/)
  run([diary, 'approve'])
  assert.match(run([diary, 'publish', '--dry']), /\[dry\]/)
  // The entire publisher is replaced inside the temporary copy: no B站 request.
  fs.writeFileSync(path.join(sandbox, 'tools/commands/dynamic.mjs'), "console.log('✅ 已发布 dyn_id=123456')\n")
  assert.match(run([diary, 'publish']), /dyn_id=123456/)
  const queue = JSON.parse(fs.readFileSync(path.join(state, 'jingmeng-diary-queue.json')))
  assert.equal(queue.entries[0].status, 'published')
  assert.equal(queue.entries[0].dynId, '123456')
  assert.match(run([path.join(sandbox, 'tools/bili.mjs'), 'daily-diary', 'show']), /没有待审/)

  const fakeBili = path.join(temp, 'fake-bili.mjs')
  const calls = path.join(temp, 'calls.jsonl')
  fs.writeFileSync(fakeBili, `import fs from 'node:fs';
const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');
if(a[0]==='reply-draft'&&a[1]==='show') console.log(JSON.stringify({id:a[2],oid:'1',root:'2',parent:'3',message:'测试'}));
if(a[0]==='comment') { await new Promise(r=>setTimeout(r,100));console.log('nav code=0'); if(process.env.TEST_SEND==='fail') console.log('code=-1');else console.log('code=0\\n✅ 已发布，评论 rpid=456'); }
`)
  fs.writeFileSync(env.BILI_WHALE_CONFIG, JSON.stringify({ toolsPath: fakeBili,
    diary: { push: true }, listen: { comment: false, dm: false, live: false, oncePerPerson: true } }))
  const fixture = `
import assert from 'node:assert/strict';
import fs from 'node:fs';import {EventEmitter} from 'node:events';
globalThis.fetch=()=>{throw new Error('Network is forbidden in regression tests')};
const plugin=(await import(${JSON.stringify(pathToFileURL(path.join(sandbox, 'lib/index.js')).href)})).default;
const routes=new Map();let cleanup;
plugin.apply({webServer:{register(r){routes.set(r.path,r);return ()=>{}}},get(){return {requestRejection(){return null}}},effect(f){cleanup=f()}});
async function request(route,body){const req=new EventEmitter();req.headers={host:'127.0.0.1'};req.method='POST';let output;const res={writeHead(){},end(s){output=JSON.parse(s)}};const pending=routes.get(route).handler(req,res);queueMicrotask(()=>{req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end')});await pending;return output}
try {
 const saving=await request('/dsh-bili/api/settings',{diary:{push:false}});assert.equal(saving.config.diary.push,false);
 const approval=request('/dsh-bili/api/pending/approve',{id:'abc'});
 const duplicate=await request('/dsh-bili/api/pending/approve',{id:'abc'});assert.equal(duplicate.ok,false);assert.match(duplicate.error,/正在发送/);
 const result=await approval;assert.equal(result.ok,process.env.TEST_SEND!=='fail');
} finally {cleanup()}
`
  for (const mode of ['fail', 'success']) {
    fs.writeFileSync(calls, '')
    run(['--input-type=module', '-e', fixture], { env: { ...env, TEST_SEND: mode } })
    const actions = fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse)
    assert.equal(actions.filter(a => a[0] === 'comment').length, 1)
    assert.equal(actions.some(a => a[0] === 'comment' && a.includes('--once-per-person')), true)
    assert.equal(actions.some(a => a[1] === 'drop'), mode === 'success')
  }
  // A due wake queues a prompt against a mocked controller; no model runs.
  const schedulerFixture = `
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
globalThis.fetch=()=>{throw new Error('Network is forbidden in scheduler tests')};
const {startScheduler}=await import(${JSON.stringify(pathToFileURL(path.join(sandbox, 'lib/scheduler.js')).href)});
const state=process.env.DSH_HOME;const bili=${JSON.stringify(fakeBili)};
const date=new Date().toLocaleDateString('sv-SE');
fs.writeFileSync(path.join(state,'whale-night.json'),JSON.stringify({date,action:'wake',at:0,fired:false,wakes:0}));
fs.writeFileSync(process.env.BILI_WHALE_CONFIG,JSON.stringify({persona:{name:'隔离测试鲸'},listen:{comment:false,dm:false,live:false}}));
const created=[];const prompts=[];
const scheduler=startScheduler({sessionController:{async create(v){created.push(v)},async prompt(v,signal){assert.equal(signal.aborted,false);prompts.push(v)}}},{dshHome:state,biliMjs:bili,cwd:process.env.HOME,sessionId:'scheduler-fixture'});
try {
 await scheduler.tick();
 assert.deepEqual(created,[{sessionId:'scheduler-fixture',cwd:process.env.HOME}]);
 assert.equal(prompts.length,1);assert.equal(prompts[0].sessionId,'scheduler-fixture');assert.equal(prompts[0].mode,'queue');
 const text=prompts[0].content[0].text;
 const persona=fs.readFileSync(${JSON.stringify(path.join(sandbox, 'persona/鲸檬.md'))},'utf8').trim();
 assert(text.includes(persona),'the complete persona must reach the wake prompt');
 assert(text.includes('隔离测试鲸'));assert(text.includes('node '+JSON.stringify(bili)+' <命令>'));
 assert(text.includes('node '+JSON.stringify(bili)+' selftest'));
 assert(!text.includes('~/.dsh/plugins/dsh-bili-whale'));
 assert(text.includes('daily-diary material'));assert(text.includes('daily-diary draft --file'));
 assert(text.includes('未经主人批准不得 approve/publish'));
 const after=JSON.parse(fs.readFileSync(path.join(state,'whale-night.json'),'utf8'));
 assert.equal(after.fired,true);assert.equal(after.woke,true);assert.equal(after.wakes,1);
} finally {scheduler.stop()}
`
  const previousCalls = fs.readFileSync(calls, 'utf8')
  run(['--input-type=module', '-e', schedulerFixture])
  assert.equal(fs.readFileSync(calls, 'utf8'), previousCalls, 'wake must queue a prompt without invoking a CLI/model')
  // Mock every B站 fetch before the interaction CLI loads. Dummy credentials only.
  const biliState = path.join(home, '.bili-ai')
  fs.mkdirSync(biliState, { recursive: true })
  fs.writeFileSync(path.join(biliState, 'credentials.json'), JSON.stringify({ sessdata: 'dummy', bili_jct: 'dummy', buvid3: 'dummy' }))
  fs.writeFileSync(env.BILI_WHALE_CONFIG, JSON.stringify({ interact: { dailyLimit: 1, favFolderId: '123' } }))
  const mock = path.join(temp, 'mock-fetch.mjs')
  const fetchCalls = path.join(temp, 'fetch-calls.jsonl')
  fs.writeFileSync(mock, `import fs from 'node:fs';globalThis.fetch=async(url)=>{
const p=new URL(url).pathname;fs.appendFileSync(${JSON.stringify(fetchCalls)},p+'\\n');
const code=p.endsWith('/coin/add')?Number(process.env.TEST_COIN_CODE||0):0;
return {status:200,async text(){return JSON.stringify({code})},async json(){return {code:0,data:{aid:1}}}}};`)
  const interact = path.join(sandbox, 'tools/commands/interact.mjs')
  for (const code of [1, -352]) {
    fs.rmSync(path.join(biliState, 'quota.json'), { force: true })
    fs.writeFileSync(fetchCalls, '')
    const result = spawnSync(process.execPath, ['--import', mock, interact, 'triple', 'BV1234567890'], {
      env: { ...env, TEST_COIN_CODE: String(code) }, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, code === -352 ? 5 : 1, result.stdout + result.stderr)
    const log = JSON.parse(fs.readFileSync(path.join(biliState, 'quota.json'))).log
    assert.equal(log.length, 1, 'partially successful triple must consume one interaction')
    assert.equal(log[0].type, 'triple')
    assert.equal(fs.readFileSync(fetchCalls, 'utf8').includes('fav/resource'), false)
    const before = fs.readFileSync(fetchCalls, 'utf8')
    const blocked = spawnSync(process.execPath, ['--import', mock, interact, 'like', 'BV1234567890'], { env, encoding: 'utf8', timeout: 10000 })
    assert.equal(blocked.status, 6)
    assert.equal(fs.readFileSync(fetchCalls, 'utf8'), before, 'quota must block before fetch')
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json')))
  assert(manifest.files.includes('persona'))
  console.log('PASS: isolated diary publication, optional Feishu, CLI routing, diary setting, failed/successful approval, duplicate approval, scheduler due wake and cleanup, persona packaging, partial interaction accounting, risk stop, interaction budget')
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
