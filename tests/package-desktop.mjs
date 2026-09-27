// SPDX-License-Identifier: Apache-2.0
// Verify real package upgrades, project reopening and uninstall through the installed launcher.
// Inputs: PRISM_TEST_BUNDLE, PRISM_TEST_PREVIOUS and output path. Output: receipt. Exit: 0 pass, 1 failure.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const bundle=resolve(process.env.PRISM_TEST_BUNDLE), previous=resolve(process.env.PRISM_TEST_PREVIOUS), output=process.env.PRISM_TEST_OUTPUT;
const old=JSON.parse(readFileSync(join(previous,'manifest.json'))), current=JSON.parse(readFileSync(join(bundle,'manifest.json')));
assert.notEqual(old.source_commit,current.source_commit,'Use two distinct verified source packages.');
const root=mkdtempSync(join(tmpdir(),'prism-upgrade-')), prefix=join(root,'Local Applications'), project=join(root,'Preserved project'), state=join(root,'state');
mkdirSync(project); const checks=[], errors=[], env={...process.env,PRISM_STATE_DIR:state}; delete env.ELECTRON_RUN_AS_NODE;
if(output)mkdirSync(output,{recursive:true});let app;
function install(source,action='install'){return execFileSync('python3',[join(source,'install.py'),action,'--prefix',prefix],{encoding:'utf8'});}
async function launch(){app=await electron.launch({chromiumSandbox:true,executablePath:join(prefix,'bin/aotx-prism'),args:[],env});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'Project',exact:true}).waitFor();assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);return page;}
async function openProject(page){await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByLabel('Folder path').fill(project);await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByRole('button',{name:'Close project',exact:true}).click();}
async function check(name,work){await work();checks.push(name);console.log('PASS '+name);}
try{
 await check('install the prior package and create persistent project history',async()=>{
  install(previous);const page=await launch();await openProject(page);await page.getByRole('button',{name:'+ New conversation',exact:true}).click();
  await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByLabel('Conversation name',{exact:true}).fill('Preserved conversation');await page.getByRole('button',{name:'Rename conversation',exact:true}).click();
  await page.getByLabel('Theme',{exact:true}).selectOption('graphite');await app.close();app=undefined;
 });
 await check('upgrade the real package and reopen the existing project',async()=>{
  install(bundle);const target=realpathSync(join(prefix,'share/aotx-prism/current'));assert.ok(target.endsWith(current.version+'-'+current.source_commit.slice(0,12)));
  const page=await launch();assert.equal(await page.getByLabel('Theme',{exact:true}).inputValue(),'graphite');await openProject(page);
  await page.locator('.conversation-list button').filter({hasText:'Preserved conversation'}).waitFor();
  const snapshot=(await page.evaluate(()=>window.prism.command({type:'state'}))).state;assert.equal(snapshot.runtime.phase,'stopped');assert.equal(snapshot.connected,false);assert.equal(snapshot.project.conversations.length,1);
  const invalid={name:'Unavailable installation',build:join(root,'absent'),gateway:root,python:'/usr/bin/python3',models:root,modules:root,folder:root,gpu:'GPU-00000000-0000-0000-0000-000000000001',role:'language'};
  await page.evaluate(profile=>window.prism.command({type:'runtimeStart',profile}),invalid);
  await page.waitForFunction(async()=> (await window.prism.command({type:'state'})).state.runtime.phase==='failed');
  const failed=(await page.evaluate(()=>window.prism.command({type:'state'}))).state.runtime;assert.match(failed.error,/ENOENT/);
  await page.evaluate(()=>window.prism.command({type:'runtimeStop'}));
  if(output)await page.screenshot({path:join(output,'upgraded-project.png')});await app.close();app=undefined;
 });
 await check('uninstall preserves exact project bytes and desktop preferences',async()=>{
  const database=join(project,'.prism/project.sqlite3'), preferences=join(state,'workspace.json'), hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
  const before=[hash(database),hash(preferences)];install(bundle,'uninstall');assert.deepEqual([hash(database),hash(preferences)],before);
  assert.equal(existsSync(join(prefix,'bin/aotx-prism')),false);assert.equal(existsSync(join(prefix,'share/aotx-prism')),false);
  assert.equal(existsSync(join(prefix,'share/applications/aotx-prism.desktop')),false);
  install(bundle);const page=await launch();await openProject(page);await page.locator('.conversation-list button').filter({hasText:'Preserved conversation'}).waitFor();await app.close();app=undefined;install(bundle,'uninstall');
 });
 assert.deepEqual(errors,[]);if(output)writeFileSync(join(output,'upgrade.json'),JSON.stringify({checks,errors,previous:old.source_commit,current:current.source_commit,launcher:'installed shell launcher',sandbox:true},null,2));
}catch(error){if(app&&output)await(await app.firstWindow()).screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{if(app)await app.close().catch(()=>{});rmSync(root,{recursive:true,force:true});}
