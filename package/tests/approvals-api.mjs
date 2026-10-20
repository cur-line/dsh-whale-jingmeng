#!/usr/bin/env node
// Real approval handlers and real diary CLIs; publisher implementations are stubbed
// inside a disposable package copy. Never touches the user's queues or accounts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
const source = fileURLToPath(new URL('../', import.meta.url))
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jingmeng-approval-test-'))
try {
  const pkg = path.join(temporary, 'package')
  fs.cpSync(source, pkg, { recursive: true })
  const home = path.join(temporary, 'home'), state = path.join(home, '.dsh')
  fs.mkdirSync(state, { recursive: true })
  const calls = path.join(temporary, 'publisher-calls.jsonl')
  fs.writeFileSync(calls, '')
  fs.writeFileSync(path.join(pkg, 'tools/commands/dynamic.mjs'), `import fs from 'node:fs';const args=process.argv.slice(2);const text=args[args.indexOf('--text')+1];fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({platform:'bili',text})+'\\n');await new Promise(r=>setTimeout(r,400));if(text.includes('FAIL')){console.error('stub publish failed');process.exit(1)}console.log('✅ 已发布 dyn_id=123456789');`)
  fs.writeFileSync(path.join(pkg, 'tools/lib/xhs-client.mjs'), `import fs from 'node:fs';export const clampNote=(title,content)=>({title,content});export async function publishNote(title,content,images){fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({platform:'xhs',title,text:content,images})+'\\n');await new Promise(r=>setTimeout(r,100));if(content.includes('FAIL'))throw new Error('stub xhs publish failed');return {noteId:'xhs-confirmed-id'}}`)
  const config = path.join(state, 'bili-whale.config.json')
  fs.writeFileSync(config, JSON.stringify({ toolsPath: path.join(pkg, 'tools/bili.mjs'), listen: { comment: false, dm: false, live: false }, xhs: { enabled: true, shareDaily: 100 } }))
  const fixture = `
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {EventEmitter} from 'node:events';import {spawnSync} from 'node:child_process';
globalThis.fetch=()=>{throw new Error('Network forbidden in approval tests')};
const plugin=(await import(${JSON.stringify(pathToFileURL(path.join(pkg, 'lib/index.js')).href)})).default;
const queuedRewrites=[], createdSessions=[];let controllerFails=false;
const controller={async create(value){createdSessions.push(value)},async prompt(value,signal){assert.equal(signal.aborted,false);if(controllerFails)throw new Error('fixture queue unavailable');queuedRewrites.push(value)}};
fs.writeFileSync(path.join(process.env.DSH_HOME,'whale-night.json'),JSON.stringify({date:new Date().toLocaleDateString('sv-SE'),action:'done'}));
const routes=new Map();let cleanup;plugin.apply({sessionController:controller,webServer:{register(route){routes.set(route.path,route);return()=>{}}},get(){return{requestRejection(){return null}}},effect(fn){cleanup=fn()}});
const state=process.env.DSH_HOME;const queue=path.join(state,'jingmeng-diary-queue.json');const xqueue=path.join(state,'xhs/pending.json');const calls=${JSON.stringify(calls)};
const save=entries=>fs.writeFileSync(queue,JSON.stringify({entries}));const load=()=>JSON.parse(fs.readFileSync(queue)).entries;
const xsave=entries=>{fs.mkdirSync(path.dirname(xqueue),{recursive:true});fs.writeFileSync(xqueue,JSON.stringify(entries))};const xload=()=>JSON.parse(fs.readFileSync(xqueue));
const readCalls=()=>fs.readFileSync(calls,'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);
const request=(name,body={},method='POST')=>new Promise((resolve,reject)=>{const req=new EventEmitter();req.method=method;req.headers={host:'127.0.0.1'};const res={status:200,writeHead(code){this.status=code},end(text){try{resolve({status:this.status,...JSON.parse(text)})}catch(error){reject(error)}}};Promise.resolve(routes.get('/dsh-bili/api/approvals'+(name?'/'+name:'')).handler(req,res)).catch(reject);queueMicrotask(()=>{req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end')})});
const diary=(id,text,status='approved')=>({id,text,status,date:'2026-10-20',approvedAt:'fixture-approval'});
const cli=(script,args)=>spawnSync(process.execPath,[${JSON.stringify(path.join(pkg, 'tools/commands'))}+'/'+script+'.mjs',...args],{env:process.env,encoding:'utf8',timeout:5000});
try {
 save([diary('A','approved A'),diary('B','approved B')]);xsave([]);
 let r=await request('publish',{id:'A',kind:'diary'});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(readCalls()[0].text,'approved A');assert.equal(load().find(e=>e.id==='A').status,'published');assert.equal(load().find(e=>e.id==='B').status,'approved');
 console.log('PASS approvals: exact requested id is published and other approved drafts survive');
 save([diary('C','concurrent C')]);fs.writeFileSync(calls,'');
 const first=request('publish',{id:'C',kind:'diary'});const deadline=Date.now()+5000;while(!readCalls().length&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(readCalls().length,1,'publisher must start');
 for(let i=0;i<2;i++){r=await request('publish',{id:'C',kind:'diary'});assert.equal(r.status,409)}
 r=await request('edit',{id:'C',kind:'diary',text:'must not race'});assert.equal(r.status,409);
 const racingCli=cli('daily-diary',['publish','C']);assert.notEqual(racingCli.status,0,'cross-process CLI must respect publication lock');
 assert.equal((await first).ok,true);assert.equal(readCalls().length,1);assert.equal(fs.existsSync(queue+'.lock'),false);
 console.log('PASS approvals: concurrent API/CLI publishes and edits are rejected; one publisher call');
 save([diary('F','FAIL preserved draft')]);r=await request('publish',{id:'F',kind:'diary'});assert.equal(r.ok,false);assert.equal(load()[0].text,'FAIL preserved draft');assert.equal(load()[0].status,'approved');assert.equal(fs.existsSync(queue+'.lock'),false);
 r=await request('edit',{id:'F',kind:'diary',text:'revised text'});assert.equal(r.ok,true);assert.equal(load()[0].status,'pending');assert.equal(load()[0].approvedAt,undefined);
 r=await request('reject',{id:'F',kind:'diary',reason:''});assert.equal(r.status,400);r=await request('reject',{id:'F',kind:'diary',reason:'make it warmer'});assert.equal(r.ok,true);
 const material=cli('daily-diary',['material']);assert.equal(material.status,0);assert.match(material.stdout,/make it warmer/);
 r=await request('edit',{id:'F',kind:'diary',text:'revised again'});assert.equal(r.ok,true);assert.equal(load()[0].status,'pending');
 r=await request('edit',{id:'F',kind:'diary',text:' '});assert.equal(r.status,400);r=await request('edit',{id:'F',kind:'diary',text:'x'.repeat(501)});assert.equal(r.status,400);assert.equal(load()[0].text,'revised again');
 r=await request('approve',{id:'F',kind:'diary'});assert.equal(r.ok,true);r=await request('publish',{id:'F',kind:'diary'});assert.equal(r.ok,true);
 r=await request('edit',{id:'F',kind:'diary',text:'cannot change published'});assert.equal(r.status,409);
 console.log('PASS approvals: failed publication preserves draft and releases lock; edits invalidate approval; rejection enters writing material');
 const image=path.join(state,'fixture.jpg');fs.writeFileSync(image,'dummy fixture bytes');
 const note=(id,content,status='pending')=>({id,title:'小红书标题',content,images:[image],status,createdAt:new Date().toISOString()});
 save([diary('same','B站同名稿','pending')]);xsave([note('same','x'.repeat(600))]);
 r=await request('',{},'GET');assert.equal(r.items.length,2);const xitem=r.items.find(e=>e.kind==='xhs-diary');assert.equal(xitem.text.length,600);assert.equal(xitem.maxChars,1000);assert.equal(xitem.title,'小红书标题');assert.deepEqual(xitem.images,[image]);
 r=await request('approve',{id:'same'});assert.equal(r.status,409,'ambiguous id must require kind');
 r=await request('edit',{id:'same',kind:'xhs-diary',title:'改后的标题',text:'z'.repeat(800)});assert.equal(r.ok,true);assert.equal(xload()[0].content.length,800);assert.equal(xload()[0].title,'改后的标题');assert.equal(load()[0].text,'B站同名稿');
 r=await request('approve',{id:'same',kind:'xhs-diary'});assert.equal(r.ok,true);r=await request('publish',{id:'same',kind:'xhs-diary'});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(xload()[0].status,'published');assert.equal(xload()[0].noteId,'xhs-confirmed-id');assert.equal(load()[0].status,'pending');
 xsave([note('xfail','FAIL xhs retained','approved')]);r=await request('publish',{id:'xfail',kind:'xhs-diary'});assert.equal(r.ok,false);assert.equal(xload()[0].status,'approved');assert.equal(xload()[0].content,'FAIL xhs retained');assert.equal(fs.existsSync(xqueue+'.lock'),false);
 xsave([note('xreject','rewrite this')]);r=await request('reject',{id:'xreject',kind:'xhs-diary',reason:'small red rewrite reason'});assert.equal(r.ok,true);const xmaterial=cli('xhs-diary',['material']);assert.equal(xmaterial.status,0);assert.match(xmaterial.stdout,/small red rewrite reason/);
 console.log('PASS approvals: real XHS array/schema, id collisions, title/content edits, publication and failure retention');
 const beforeRewritePublishCount=readCalls().length;
 save([diary('rewrite-bili','original rejected text','pending')]);const beforeQueued=queuedRewrites.length;
 r=await request('reject',{id:'rewrite-bili',kind:'diary',reason:'write this in a warmer voice'});assert.equal(r.ok,true);assert.equal(r.rewriteQueued,true);assert.equal(queuedRewrites.length,beforeQueued+1);
 const rewriteTask=queuedRewrites.at(-1);assert.equal(rewriteTask.sessionId,'bili-whale');assert.equal(rewriteTask.mode,'queue');assert.match(rewriteTask.requestId,/jingmeng-rewrite/);
 const instructions=rewriteTask.content[0].text;assert.match(instructions,/rewrite-bili/);assert.match(instructions,/write this in a warmer voice/);assert.match(instructions,/daily-diary material/);assert.match(instructions,/daily-diary revise --id/);assert.match(instructions,/禁止 approve、publish/);assert.match(instructions,/新 pending/);assert.match(instructions,/不改共享队列/);
 assert(createdSessions.every(value=>value.sessionId==='bili-whale'),'rewrites must use the existing dedicated session');assert.equal(fs.existsSync(queue+'.lock'),false,'queue lock must be released before accepting model work');
 const queuedOnce=queuedRewrites.length;r=await request('reject',{id:'rewrite-bili',kind:'diary',reason:'write this in a warmer voice'});assert.equal(r.rewriteQueued,true);assert.equal(queuedRewrites.length,queuedOnce,'repeat rejection must not queue another rewrite');
 const originalRecord=JSON.stringify(load()[0]);const rewrittenFile=path.join(state,'local-rewrite.txt');fs.writeFileSync(rewrittenFile,'a warmer locally rewritten manuscript');
 let revised=cli('daily-diary',['revise','--id','rewrite-bili','--file',rewrittenFile]);assert.equal(revised.status,0,revised.stderr);assert.equal(load().length,2);assert.equal(JSON.stringify(load()[0]),originalRecord,'original rejected manuscript and reason must remain intact');const revision=load()[1];assert.equal(revision.status,'pending');assert.equal(revision.revisionOf,'rewrite-bili');assert.equal(revision.text,'a warmer locally rewritten manuscript');assert.equal(revision.approvedAt,undefined);assert.equal(revision.dynId,undefined);
 revised=cli('daily-diary',['revise','--id','rewrite-bili','--file',rewrittenFile]);assert.notEqual(revised.status,0,'one rejected version must not create duplicate revisions');assert.equal(load().length,2);
 save([diary('rewrite-fails','keep rejected on controller failure','pending')]);controllerFails=true;r=await request('reject',{id:'rewrite-fails',kind:'diary',reason:'rewrite reason survives failure'});assert.equal(r.ok,true);assert.equal(r.rewriteQueued,false);assert.match(r.rewriteError,/fixture queue unavailable/);assert.equal(load()[0].status,'rejected');assert.equal(load()[0].reason,'rewrite reason survives failure');assert.equal(load()[0].rewriteQueuedAt,undefined);controllerFails=false;
 r=await request('reject',{id:'rewrite-fails',kind:'diary',reason:'rewrite reason survives failure'});assert.equal(r.rewriteQueued,true,'failed queue attempt can be retried without losing the rejection');
 const xOriginal=JSON.stringify(xload()[0]);const xRewrittenFile=path.join(state,'local-xhs-rewrite.json');fs.writeFileSync(xRewrittenFile,JSON.stringify({title:'本地修订标题',content:'本地重写后的正文'}));revised=cli('xhs-diary',['revise','--id','xreject','--file',xRewrittenFile]);assert.equal(revised.status,0,revised.stderr);assert.equal(xload().length,2);assert.equal(JSON.stringify(xload()[0]),xOriginal);const xRevision=xload()[1];assert.equal(xRevision.revisionOf,'xreject');assert.equal(xRevision.status,'pending');assert.equal(xRevision.title,'本地修订标题');assert.equal(xRevision.content,'本地重写后的正文');assert.deepEqual(xRevision.images,[image]);assert.equal(xRevision.approvedAt,undefined);assert.equal(xRevision.noteId,undefined);
 const xTask=queuedRewrites.find(value=>value.content[0].text.includes('small red rewrite reason'));assert(xTask);assert.match(xTask.content[0].text,/diary revise --id/);assert.match(xTask.content[0].text,/JSON对象/);
 assert.equal(readCalls().length,beforeRewritePublishCount,'rejection/revision must never invoke any publisher');
 console.log('PASS approvals: rejection queues local-only revision in the existing session; controller failures preserve rejected drafts; both CLIs append new pending revisionOf without approvals or publishing');

 fs.writeFileSync(queue,'{broken');r=await request('',{},'GET');assert.equal(r.ok,false);assert.equal(fs.readFileSync(queue,'utf8'),'{broken');
 save([diary('lock','locked draft')]);fs.writeFileSync(queue+'.lock','stale fixture lock');r=await request('publish',{id:'lock',kind:'diary'});assert.equal(r.status,409);assert.equal(fs.readFileSync(queue+'.lock','utf8'),'stale fixture lock');fs.rmSync(queue+'.lock');
 console.log('PASS approvals: corrupt queues fail closed; interrupted publication lock is not silently discarded');
} finally {cleanup()}
`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', fixture], {
    env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: state, BILI_WHALE_CONFIG: config,
      WHALE_CFG: config, DSH_NODE: process.execPath, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 20000,
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  assert.equal(result.status, 0, result.error?.message || 'isolated approval handler regression failed')
} finally { fs.rmSync(temporary, { recursive: true, force: true }) }
