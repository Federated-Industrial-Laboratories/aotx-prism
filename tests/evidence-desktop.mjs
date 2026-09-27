// SPDX-License-Identifier: Apache-2.0
// Exercise evidence, qualified controls and visible-only activity with isolated HTTP fixtures.
// Inputs: built app and optional PRISM_TEST_OUTPUT. Output: check receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { SharedFixture, identity } from './shared-fixture.ts';
import { ProjectStore } from '../desktop/storage.ts';
import { caps, token } from './fixture.ts';
import { waitState } from './ui.mjs';
const root = mkdtempSync(join(tmpdir(), 'prism-evidence-ui-')), directory = join(root, 'desktop'), project = join(directory, 'Workspace');
mkdirSync(project, { recursive: true });
const store = new ProjectStore(project), fixture = new SharedFixture(7, () => store.readShared());
const output = process.env.PRISM_TEST_OUTPUT; if (output) mkdirSync(output, { recursive: true });
const errors = [], checks = [], requests = []; let cold = false, permission = false;
const discovery = structuredClone(caps); discovery.features.control_selection = true;
discovery.models[0].controls = [{ schema: 'aotx.control.v1', name: 'curiosity', kind: 'residual_vector', available: true,
  positions: 'response', hook: 1, layers: [24], dose_scale: 10000, accepted_doses: [5000], combinations: false, qualification_sha256: identity(900,64) }];
const bytes = Buffer.alloc(32 + Buffer.byteLength('Exact retained source: \u20ac.'));
bytes.write('AOTXMEM1'); bytes.writeUInt32LE(1,8); bytes.writeUInt32LE(bytes.length - 32,12); bytes.write('Exact retained source: \u20ac.',32);
const assessment = Buffer.alloc(32); assessment.writeUInt32LE(1); assessment.writeUInt32LE(0xffffffff,8); assessment.writeUInt32LE(1,24);
const payloads = [bytes, assessment, Buffer.from('Future format bytes')];
const rows = payloads.map((b,i) => ({ id: identity(i + 10), version: String(i+1), kind: [1,3,500][i], scope: 'private', owner: fixture.space.split('-')[2], room: identity(0), bytes: String(b.length), source: identity(0), actor: fixture.actor }));
const events=Array.from({length:65},(_,i)=>({id:`op-${fixture.lineage}-${identity(700+i)}`,actor:fixture.actor,input_order:String(i+1),sequence:String(i+1),state:i===64?'running':'completed',saved_admission:true,saved_terminal:i!==64,output_bytes:String(i*13),status:200,output_tokens:i+1,finish:1,admission_source:String(i+1),terminal_source:String(i+2),gap:false}));
const epoch = '18446744073709551610', revision = '9007199254740997';
const policy = `{"schema":"aotx.policy.v1","epoch":${epoch},"control_revision":${revision},"abi":3,"mode":1,"state":"active","reason":"active","review_enabled":true,"pending":2,"active_rows":1,"status":0,${['source_frontier','completed','interrupted','refused','decision','saved_generation','maximum_ns','last_ns','written_bytes','result_bytes'].map((k,i)=>`"${k}":${i+10}`).join(',')}}`;
const server = createServer(async (req,res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return; }
    const parts = []; for await (const part of req) parts.push(part); const body = parts.length ? Buffer.concat(parts).toString() : undefined;
    const url = new URL(req.url, 'http://localhost'); requests.push({ path: url.pathname, body });
    if (url.pathname.endsWith('/policy')) { res.writeHead(body && !permission ? 403 : 200).end(body && !permission ? '{}' : policy); return; }
    if (url.pathname === '/aotx/v1/capabilities') { res.end(JSON.stringify(discovery)); return; }
    if (url.pathname.endsWith('/events')) { const start=Math.max(Number(url.searchParams.get('cursor')),1),items=events.filter(r=>Number(r.input_order)>=start).slice(0,64); res.end(JSON.stringify({...fixture.base(),space:fixture.space,items,next_cursor:String(start+items.length),next_order:'66',event_floor:'1',gap:false})); return; }
    if (url.pathname.includes('/memory')) {
      const index = rows.findIndex(r => url.pathname.endsWith(r.id)), detail = index >= 0;
      if (cold && detail) { res.writeHead(503).end('{}'); return; }
      const offset = Number(url.searchParams.get('offset') || 0), part = detail ? payloads[index].subarray(offset,offset+11) : Buffer.alloc(0);
      res.end(JSON.stringify({ ...fixture.base(), space: fixture.space, scope: 'private', permissions: ['read','manage'], items: detail ? [rows[index]] : rows,
        next_cursor: '0', next_offset: String(detail ? offset + part.length : 0), payload: { base64: part.toString('base64'), bytes: String(part.length) } })); return;
    }
    if (url.pathname.endsWith('/affect')) { res.end(JSON.stringify({ ...fixture.base(), space: fixture.space, id: fixture.conversation, affect: {
      schema:'aotx.affect.scope.v1',enabled:false,revision:'1',fast_q15:[0,0,0,0],slow_q15:[0,0,0,0],scale_q16:65535,event_mask:0,actuator_flags:0,budget_spent:0,model_role:0,model_sha256:identity(1,64),probes_at_last_turn:{valence:'unavailable',arousal:'unavailable'} } })); return; }
    const result = await fixture.value(req.url, body); res.writeHead(result.status).end(JSON.stringify(result.value));
  } catch(error) { errors.push(error.message); req.socket.destroy(); }
});
server.listen(0,'127.0.0.1'); await once(server,'listening'); const url = `http://127.0.0.1:${server.address().port}`;
const env = { ...process.env, PRISM_STATE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function open(label) { await page.getByRole('button',{name:'Windows',exact:true}).click(); await page.locator('.menu-popup').getByRole('button',{name:label,exact:true}).click(); }
async function check(name,work) { await work(); checks.push(name); console.log(`PASS ${name}`); }
try {
  app = await electron.launch({ chromiumSandbox:true, executablePath:process.env.PRISM_TEST_PACKAGE ? resolve(process.env.PRISM_TEST_PACKAGE,'runtime/electron') : resolve('node_modules/electron/dist/electron'),args:process.env.PRISM_TEST_PACKAGE ? [] : ['.'],env });
  page = await app.firstWindow(); page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'Connection',exact:true}).click(); await page.getByLabel('Gateway URL',{exact:true}).fill(url); await page.getByLabel('Bearer token',{exact:true}).fill(token);
  await page.getByRole('button',{name:'Connect',exact:true}).click(); await waitState(page,s=>s.connected); await page.getByRole('button',{name:'Close connection',exact:true}).click();
  await page.getByRole('button',{name:'CCIR workspace',exact:true}).click(); await page.getByRole('button',{name:'Open shared workspace',exact:true}).click(); await waitState(page,s=>s.shared.connected);
  await page.getByRole('button',{name:new RegExp(fixture.space)}).click(); await page.getByRole('button',{name:new RegExp(fixture.conversation)}).click();
  await check('qualified dose reaches the exact shared mutation',async()=>{
    await page.getByRole('button',{name:'Affect',exact:true}).click(); await page.getByLabel('Control and dose',{exact:true}).selectOption('0:5000'); await waitState(page,s=>s.control?.dose===5000);
    await page.getByRole('button',{name:'Close affect',exact:true}).click(); await page.getByLabel('Shared message',{exact:true}).fill('Use the selected control.');
    await page.getByRole('button',{name:'Send shared input',exact:true}).click(); await waitState(page,s=>s.shared.records[0]?.result?.saved_terminal&&!s.shared.watching.length);
    assert.equal(JSON.parse(fixture.posts[0]).control.qualification_sha256,identity(900,64)); assert.equal(fixture.posts.length,1);
  });
  await check('evidence shows exact text, unknown values, unknown bytes and cold refusal',async()=>{
    await open('Memory evidence'); await page.getByRole('button',{name:'Maximize evidence',exact:true}).click(); await page.getByRole('button',{name:'Refresh memory',exact:true}).click();
    await page.locator('.memory-list button').nth(0).click(); await page.getByText('Exact retained source: \u20ac.',{exact:true}).waitFor();
    await page.locator('.memory-list button').nth(1).click(); await page.locator('.evidence-body dd').filter({hasText:'Unknown'}).first().waitFor();
    assert.ok((await page.locator('.evidence-body').innerText()).includes('0 / 1000000'));
    await page.locator('.memory-list button').nth(2).click(); await page.getByText('This payload has no supported text view. Its exact bytes remain available below.',{exact:true}).waitFor();
    await page.getByText('Identity and exact bytes',{exact:true}).click(); assert.equal(await page.getByLabel('Base64 payload',{exact:true}).inputValue(),payloads[2].toString('base64'));
    if(output) await page.screenshot({path:join(output,'evidence-silver.png')}); cold=true;
    await page.locator('.memory-list button').nth(0).click(); await waitState(page,s=>s.evidence.error.includes('503'));
    assert.equal(await page.locator('.evidence-detail').count(),0); cold=false; await page.getByRole('button',{name:'Close evidence',exact:true}).click();
  });
  await check('activity preserves exact revisions and disables refused policy actions',async()=>{
    await open('Activity'); await page.getByRole('button',{name:'Maximize activity',exact:true}).click(); await waitState(page,s=>s.evidence.policy?.epoch===epoch);
    assert.equal(await page.locator('.activity-events article').count(),64);
    await page.getByRole('button',{name:'Next event page',exact:true}).click(); await waitState(page,s=>s.evidence.eventCursor==='65'&&!s.evidence.reading);
    await page.getByText('Input 65 / running',{exact:true}).waitFor();
    assert.equal((await page.evaluate(()=>window.prism.command({type:'state'}))).state.shared.events.items[0].input_order,'1');
    await page.getByRole('button',{name:'Refresh activity',exact:true}).click(); await waitState(page,s=>!s.evidence.reading&&s.evidence.events.items[0]?.input_order==='65');
    assert.equal(await page.locator('canvas.rain').count(),0); await page.getByText('Policy controls and counters',{exact:true}).click();
    await page.getByRole('button',{name:'Pause background work',exact:true}).click(); await waitState(page,s=>s.evidence.policyDenied);
    const post=requests.find(r=>r.path.endsWith('/policy')&&r.body); assert.ok(post.body.includes(`"epoch":${epoch}`)); assert.ok(post.body.includes(`"control_revision":${revision}`));
    await page.getByRole('button',{name:'Refresh activity',exact:true}).click(); await waitState(page,s=>!!s.evidence.policy);
    await page.getByText('Policy controls and counters',{exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Pause background work',exact:true}).isDisabled(),true);
  });
  await check('readable activity stops polling with the panel',async()=>{
    assert.equal(await page.getByRole('button',{name:'Show visualization',exact:true}).count(),0);
    await page.getByLabel('Theme',{exact:true}).selectOption('graphite');
    await page.getByText('Policy controls and counters',{exact:true}).click();
    await page.locator('.panel-activity .form-panel').evaluate(e=>{e.scrollTop=0;});
    if(output) await page.screenshot({path:join(output,'activity-graphite.png')});
    assert.equal(await page.locator('canvas').count(),0);

    await page.getByRole('button',{name:'Close activity',exact:true}).click(); await page.waitForTimeout(300);
    const count=requests.filter(r=>r.path.endsWith('/policy')).length; await page.waitForTimeout(2800);
    assert.equal(requests.filter(r=>r.path.endsWith('/policy')).length,count); assert.equal(fixture.posts.length,1);
  });
  assert.deepEqual(errors,[]); if(output) writeFileSync(join(output,'desktop.json'),JSON.stringify({checks,errors,policyRequests:requests.filter(r=>r.path.endsWith('/policy')).length},null,2));
} catch(error) { if(app&&output) await page.screenshot({path:join(output,'failure.png')}).catch(()=>{}); throw error; }
finally { if(app) await app.close().catch(()=>{}); server.closeAllConnections(); await new Promise(r=>server.close(r)); store.close(); rmSync(root,{recursive:true,force:true}); }
