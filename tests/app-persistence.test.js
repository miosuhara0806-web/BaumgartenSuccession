import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content } from '../src/content/fixture.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

// Run the actual app's persistence handlers with a headless DOM boundary. This
// deliberately does not copy their implementation into the tests. Real browser
// rendering and native IndexedDB are verified by the manual browser smoke route.
const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm,'')
  .replace(/await init\(\);\s*$/,'');

async function harness() {
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),dbName:'app-retry-test',validateRun:r=>engine.validateRun(r,content)});
  await storage.open();
  let snapshot=engine.createRun(content);
  let saved=await storage.commitAuto(snapshot,{expectedRevision:await storage.getRevision()});
  const noDom={addEventListener(){},querySelector(){return noDom;},querySelectorAll(){return []}};
  const context=vm.createContext({content,...engine,createStorage:()=>storage,structuredClone,document:noDom,window:{scrollTo(){}},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){},console});
  new vm.Script(source+`
    render=()=>{};
    globalThis.appHarness={
      initialize(state,rev,profile){run=state;revision=rev;slotsRevision=rev;reader=profile;ready=true;title=false;},
      state(){return structuredClone({run,reader,revision,slotsRevision,busy,error,pending:!!pending,title});},
      transact,perform,load,startNew,openSaves,
      retry(){return handle('retry');}
    };
  `).runInContext(context);
  const app=context.appHarness;
  app.initialize(snapshot,saved.revision,saved.readerProfile);
  return {storage,app};
}

test('a committed auto save is never retried when refreshing the slot list fails',async()=>{
  const {storage,app}=await harness();
  const list=storage.listSlots;
  let writes=0;
  const commit=storage.commitAuto;
  storage.commitAuto=(...args)=>{writes++;return commit(...args);};
  storage.listSlots=async()=>{throw new Error('injected list failure');};
  await app.perform({type:'ACK_TEXT'});
  assert.equal(app.state().pending,false);
  assert.equal(writes,1);
  const persisted=await storage.getSlot('auto');
  assert.deepEqual(app.state().run,persisted.run);
  assert.equal(app.state().revision,persisted.saveRevision);
  assert.match(app.state().error,/保存処理は完了/);
  storage.listSlots=list;
  await app.retry();
  assert.equal(writes,1);assert.equal(app.state().error,'');
});

test('a load committed before a global-reading refresh failure is not loaded again on retry',async()=>{
  const {storage,app}=await harness();
  const read=storage.getReaderProfile;
  let loads=0;
  const load=storage.loadSlot;
  storage.loadSlot=(...args)=>{loads++;return load(...args);};
  storage.getReaderProfile=async()=>{throw new Error('injected profile read failure');};
  await app.load('auto');
  assert.equal(app.state().pending,false);assert.equal(loads,1);
  assert.match(app.state().error,/保存処理は完了/);
  storage.getReaderProfile=read;
  await app.retry();
  assert.equal(loads,1);assert.equal(app.state().error,'');
});

for(const operation of ['startNew','load']) {
  test(`${operation} retry retains its original revision and cannot overwrite another tab`,async()=>{
    const {storage,app}=await harness();
    const before=app.state();
    const method=operation==='startNew'?'commitAuto':'loadSlot';
    const mutate=storage[method];
    let first=true;
    storage[method]=(...args)=>{
      if(first){first=false;return Promise.reject(new Error('injected pre-commit failure'));}
      return mutate(...args);
    };
    await app[operation](...(operation==='load'?['auto']:[]));
    assert.equal(app.state().pending,true);
    assert.equal(app.state().revision,before.revision);
    storage[method]=mutate;
    const other=engine.createRun(content,{runId:'other-tab-run'});
    await storage.commitAuto(other,{expectedRevision:await storage.getRevision()});
    await app.retry();
    assert.equal(app.state().pending,true);
    assert.match(app.state().error,/別のタブ/);
    assert.equal((await storage.getSlot('auto')).run.runId,'other-tab-run');
    // Only an explicit fresh slot-list load may replace the current progress.
    await app.openSaves();
    await app.load('auto');
    assert.equal(app.state().pending,false);
    assert.equal(app.state().run.runId,'other-tab-run');
  });
}

test('normal failed auto save preserves the in-memory candidate and can retry once without duplicate effects',async()=>{
  const {storage,app}=await harness();
  const before=app.state();
  const commit=storage.commitAuto;
  let first=true;
  storage.commitAuto=(...args)=>first?(first=false,Promise.reject(new Error('injected capacity failure'))):commit(...args);
  await app.perform({type:'ACK_TEXT'});
  assert.equal(app.state().pending,true);
  assert.notDeepEqual(app.state().run.position,before.run.position);
  assert.deepEqual((await storage.getSlot('auto')).run,before.run);
  const candidate=app.state().run;
  await app.retry();
  assert.equal(app.state().pending,false);
  assert.deepEqual((await storage.getSlot('auto')).run,candidate);
  assert.equal(app.state().run.recentDialogueLog.length,1);
  assert.equal(app.state().reader.readTextKeys.length,1);
});

test('double invocation during a write is ignored at the UI handler boundary',async()=>{
  const {storage,app}=await harness();
  const commit=storage.commitAuto;
  let release;
  storage.commitAuto=(...args)=>new Promise(resolve=>{release=()=>resolve(commit(...args));});
  const first=app.perform({type:'ACK_TEXT'});
  assert.equal(app.state().busy,true);
  await app.perform({type:'ACK_TEXT'});
  assert.equal(app.state().run.recentDialogueLog.length,1);
  release();await first;
  assert.equal((await storage.getSlot('auto')).run.recentDialogueLog.length,1);
});
