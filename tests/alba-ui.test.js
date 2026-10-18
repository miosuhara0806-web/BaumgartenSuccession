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
async function harness(snapshot,readTextKeys=[]){
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),dbName:'alba-ui',validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await storage.open();
  const saved=await storage.commitAuto(snapshot,{expectedRevision:await storage.getRevision(),readTextKeys});
  const dom={addEventListener(){},querySelector(){return dom;},querySelectorAll(){return [];}};
  const context=vm.createContext({defaultContent,contentForRun,...engine,createStorage:()=>storage,structuredClone,document:dom,window:{scrollTo(){}},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){}});
  new vm.Script(source+`
    render=()=>{};
    globalThis.api={
      initialize(state,rev,profile){run=state;content=contentForRun(state);revision=rev;slotsRevision=rev;reader=profile;ready=true;title=false;},
      state(){return structuredClone({run,reader,pending:!!pending,version:content.contentVersion});},
      handle,perform,load,openSaves,trialPage,introductionModal,memoBody,logModal,
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
  assert.ok(viewer.body.includes('「魔物の数は？ 住民への被害は出ていますか？」'));
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
  await app.handle('ack-conversation');
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

test('each of the ten companion opinions displays all exact lines and completes in one atomic confirmation',async()=>{
  let r=read(act(start(),'START_REGION',{regionId:'alba'}));
  for(const letter of ['a','c','b']) {
    for(const conversation of engine.getAvailableConversations(r,content)) {
      const {app,storage}=await harness(r);
      const before=app.state();
      await app.handle('conversation',conversation.id);
      const opened=app.state();
      assert.equal(opened.run.position.blockIndex,0);
      assert.deepEqual(opened.run.heardConversationIds,before.run.heardConversationIds);
      assert.deepEqual(opened.reader,before.reader);
      assert.deepEqual(opened.run.acquiredInformation,before.run.acquiredInformation);
      const markup=app.trialPage();
      assert.equal((markup.match(/data-action="ack-conversation"/g)||[]).length,1);
      assert.doesNotMatch(markup,/data-action="ack"/);
      assert.equal((markup.match(/<p>/g)||[]).length,3);
      assert.doesNotMatch(markup,/<p>「|」<\/p>/);
      const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      let last=-1;
      for(const id of conversation.blockIds) {
        const index=markup.indexOf(escape(content.textBlocks[id].text.slice(1,-1)));
        assert.ok(index>last);last=index;
      }
      let writes=0;const commit=storage.commitAuto;
      storage.commitAuto=(...args)=>{writes++;return commit(...args);};
      await app.handle('ack-conversation');
      const confirmed=app.state();
      assert.equal(writes,1);
      assert.equal(confirmed.run.position.phase,'trial');
      assert.ok(confirmed.run.heardConversationIds.includes(conversation.id));
      assert.equal(confirmed.reader.readTextKeys.length,3);
      assert.equal(engine.getTotalScore(confirmed.run),engine.getTotalScore(r));
      assert.deepEqual(confirmed.run.acquiredInformation,before.run.acquiredInformation);
      assert.equal(confirmed.run.recentDialogueLog.filter(e=>conversation.blockIds.includes(e.textId)).length,3);
      assert.deepEqual(Array.from(confirmed.run.recentDialogueLog.filter(e=>conversation.blockIds.includes(e.textId)),e=>e.text),conversation.blockIds.map(id=>content.textBlocks[id].text));
      assert.deepEqual(JSON.parse(JSON.stringify(confirmed.run)),(await storage.getSlot('auto')).run);
    }
    r=read(act(r,'RESOLVE_TRIAL',{trialId:r.position.trialId,choiceId:`choice.${r.position.trialId}.${letter}`}));
    r=read(act(r,'CONTINUE_TRIAL'));
  }
});

test('an unconfirmed reload stays unread and hides D; confirmed manual load restores both without awarding points',async()=>{
  const r=small2();const {app,storage}=await harness(r);
  await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
  await app.openSaves();await app.load('manual1');
  await app.handle('conversation','conversation.alba.small2.lisette');
  await app.openSaves();await app.load('auto');
  assert.equal(app.state().run.position.phase,'conversation');
  assert.equal(app.state().run.position.blockIndex,0);
  assert.equal(app.state().reader.readTextKeys.length,0);
  assert.equal(app.state().run.heardConversationIds.includes('conversation.alba.small2.lisette'),false);
  await app.handle('skip');
  assert.equal(app.state().run.position.phase,'conversation');
  await app.handle('ack-conversation');
  const confirmed=app.state();
  await storage.saveManual('manual2',confirmed.run,{expectedRevision:await storage.getRevision()});
  await app.openSaves();await app.load('manual1');
  assert.doesNotMatch(app.trialPage(),/data-id="choice.alba.small2.d"/);
  assert.equal(app.state().reader.readTextKeys.length,3);
  await app.openSaves();await app.load('manual2');
  assert.match(app.trialPage(),/data-id="choice.alba.small2.d"/);
  assert.doesNotMatch(app.trialPage(),/data-id="conversation.alba.small2.lisette"/);
  assert.equal(engine.getTotalScore(app.state().run),5);
});

test('partial conversation reading from existing current and legacy saves resumes all lines without duplicating acknowledged lines',async()=>{
  for(const pack of [content,legacy]) {
    let r=read(act(start(pack),'START_REGION',{regionId:'alba'},pack),pack);
    const conversationId='conversation.alba.small1.harold';
    r=act(r,'OPEN_CONVERSATION',{conversationId},pack);
    const first=engine.getCurrentText(r,pack);
    const partial=pack.conversations[conversationId].blockIds.length>1;
    if(partial)r=act(r,'ACK_TEXT',{},pack);
    const {app}=await harness(r,partial?[first.readKey]:[]);
    assert.equal(app.state().run.position.blockIndex,partial?1:0);
    const markup=app.trialPage();
    assert.match(markup,/conversation-text/);
    for(const id of pack.conversations[conversationId].blockIds) {
      const text=pack.textBlocks[id].text;
      assert.ok(markup.includes(text.startsWith('「')&&text.endsWith('」')?text.slice(1,-1):text));
    }
    await app.handle('ack-conversation');
    const result=app.state();
    assert.equal(result.run.position.phase,'trial');
    assert.equal(result.reader.readTextKeys.length,pack.conversations[conversationId].blockIds.length);
    assert.equal(result.run.recentDialogueLog.filter(e=>e.textId===first.id).length,1);
    assert.equal(engine.getTotalScore(result.run),0);
  }
});

test('failed grouped confirmation retries the same snapshot without duplicate reading, history, D or scores',async()=>{
  const {app,storage}=await harness(small2());
  await app.handle('conversation','conversation.alba.small2.lisette');
  const before=(await storage.getSlot('auto')).run;
  const commit=storage.commitAuto;let writes=0;
  storage.commitAuto=(...args)=>++writes===1?Promise.reject(new Error('injected write failure')):commit(...args);
  await app.handle('ack-conversation');
  assert.equal(app.state().pending,true);
  assert.deepEqual((await storage.getSlot('auto')).run,before);
  assert.equal((await storage.getReaderProfile()).readTextKeys.length,0);
  await app.handle('ack-conversation');
  assert.equal(writes,1);
  await app.handle('retry');
  assert.equal(writes,2);
  assert.equal(app.state().pending,false);
  assert.equal(app.state().reader.readTextKeys.length,3);
  assert.equal(app.state().run.heardConversationIds.filter(id=>id==='conversation.alba.small2.lisette').length,1);
  assert.equal(engine.getTotalScore(app.state().run),5);
  assert.match(app.trialPage(),/data-id="choice.alba.small2.d"/);
});

test('read-only logs group one conversation under one speaker without merging different scenes or changing save state',async()=>{
  let r=read(act(start(),'START_REGION',{regionId:'alba'}));
  r=read(act(r,'OPEN_CONVERSATION',{conversationId:'conversation.alba.small1.lisette'}));
  r=act(r,'RESOLVE_TRIAL',{trialId:'alba.small1',choiceId:'choice.alba.small1.a'});
  r=read(act(r,'CONTINUE_TRIAL'));
  const {app}=await harness(r);
  await app.handle('conversation','conversation.alba.small2.lisette');
  const before=app.state();
  const pending=app.logModal();
  assert.deepEqual(app.state(),before);
  assert.equal((pending.body.match(/<strong>リゼット<\/strong>/g)||[]).length,2);
  for(const id of content.conversations['conversation.alba.small2.lisette'].blockIds)assert.ok(pending.body.includes(content.textBlocks[id].text.slice(1,-1)));
  await app.handle('ack-conversation');
  const confirmed=app.state();
  const log=app.logModal();
  assert.equal((log.body.match(/<strong>リゼット<\/strong>/g)||[]).length,2);
  assert.deepEqual(app.state(),confirmed);
});
