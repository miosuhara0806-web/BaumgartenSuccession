import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import { content as legacy } from '../src/content/legacy.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/await init\(\);\s*$/,'');
const content=defaultContent;
const act=(r,type,args={},c=content)=>engine.transition(r,{type,...args},c);
function read(r,c=content){while(engine.getCurrentText(r,c))r=act(r,'ACK_TEXT',{},c);return r;}
function start(c=content){
  let r=read(engine.createRun(c),c);
  r=act(r,'SELECT_COMMANDER',{commanderId:'commander.alphonse'},c);
  for(const characterId of ['char.harold','char.frederica','char.lisette','char.sandro'])r=act(r,'TOGGLE_PARTY',{characterId},c);
  return read(act(act(r,'CONFIRM_PARTY',{},c),'DEPART',{},c),c);
}
function small2(){
  let r=read(act(start(),'START_REGION',{regionId:'alba'}));
  r=act(r,'RESOLVE_TRIAL',{trialId:'alba.small1',choiceId:'choice.alba.small1.a'});
  return read(act(r,'CONTINUE_TRIAL'));
}
async function harness(snapshot){
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),dbName:'alba-ui',validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await storage.open();
  const saved=await storage.commitAuto(snapshot,{expectedRevision:await storage.getRevision()});
  const dom={addEventListener(){},querySelector(){return dom;},querySelectorAll(){return [];}};
  const context=vm.createContext({defaultContent,contentForRun,...engine,createStorage:()=>storage,structuredClone,document:dom,window:{scrollTo(){}},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){}});
  new vm.Script(source+`
    render=()=>{};
    globalThis.api={
      initialize(state,rev,profile){run=state;content=contentForRun(state);revision=rev;slotsRevision=rev;reader=profile;ready=true;title=false;},
      state(){return structuredClone({run,reader,pending:!!pending,version:content.contentVersion});},
      handle,perform,load,openSaves,trialPage,introductionModal,memoBody,
    };
  `).runInContext(context);
  context.api.initialize(snapshot,saved.revision,saved.readerProfile);
  return {app:context.api,storage};
}

test('continuous introduction acknowledgement is atomic, retries once, and viewing never grants facts or reading',async()=>{
  const r=act(start(),'START_REGION',{regionId:'alba'});
  const {app,storage}=await harness(r);
  const original=app.state();
  const viewer=app.introductionModal('alba.small2');
  assert.match(viewer.body,/novel-text/);
  assert.deepEqual(app.state(),original);
  const commit=storage.commitAuto;
  let calls=0;
  storage.commitAuto=(...args)=>++calls===1?Promise.reject(new Error('injected write failure')):commit(...args);
  await app.handle('ack-introduction');
  assert.equal(app.state().pending,true);
  assert.equal((await storage.getSlot('auto')).run.position.sceneId,r.position.sceneId);
  await app.handle('retry');
  assert.equal(calls,2);
  assert.equal(app.state().pending,false);
  assert.equal(app.state().run.position.sceneId,'alba.small1.intro');
  assert.equal(app.state().reader.readTextKeys.length,11);
  assert.equal(Object.keys(app.state().run.acquiredInformation).length,0);
  assert.equal(app.state().run.recentDialogueLog.filter(e=>e.textId.includes('introduction.review')).length,11);
});

test('actual handlers hide D on earlier load despite global reading, then unlock through read skip',async()=>{
  const r=small2();
  const {app,storage}=await harness(r);
  await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
  await app.openSaves();await app.load('manual1');
  assert.doesNotMatch(app.trialPage(),/data-id="choice.alba.small2.d"/);
  await app.handle('conversation','conversation.alba.small2.lisette');
  for(let i=0;i<3;i++)await app.handle('ack');
  assert.match(app.trialPage(),/data-id="choice.alba.small2.d"/);
  assert.doesNotMatch(app.trialPage(),/data-id="conversation.alba.small2.lisette"/);
  assert.equal(engine.getTotalScore(app.state().run),5);
  await app.openSaves();await app.load('manual1');
  assert.equal(app.state().reader.readTextKeys.length,3);
  assert.doesNotMatch(app.trialPage(),/data-id="choice.alba.small2.d"/);
  await app.handle('conversation','conversation.alba.small2.lisette');
  await app.handle('skip');
  assert.match(app.trialPage(),/data-id="choice.alba.small2.d"/);
  assert.equal(engine.getTotalScore(app.state().run),5);
});

test('actual load switches current/legacy content and ordinary results explicitly await manuscripts',async()=>{
  const r=small2();const {app,storage}=await harness(r);
  await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
  const old=start(legacy);
  await storage.saveManual('manual2',old,{expectedRevision:await storage.getRevision()});
  await app.openSaves();await app.load('manual2');
  assert.equal(app.state().version,legacy.contentVersion);
  assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)),old);
  await app.openSaves();await app.load('manual1');
  assert.equal(app.state().version,content.contentVersion);
  await app.perform({type:'RESOLVE_TRIAL',trialId:'alba.small2',choiceId:'choice.alba.small2.c'});
  assert.match(app.trialPage(),/data-feedback-pending/);
  assert.match(app.trialPage(),/正式配点/);
  assert.doesNotMatch(app.trialPage(),/仮評価/);
  assert.equal(engine.getTotalScore(app.state().run),10);
});
