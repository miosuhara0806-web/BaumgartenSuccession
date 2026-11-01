import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as engine from '../src/engine.js';
import { content, createPrologueContent } from '../src/content/prologue.js';
import { contentForRun } from '../src/content/catalog.js';
import { protagonistNarrationEdits, quantityEdits, dialoguePageGroups, rosemondTutorialEdits } from '../src/content/prologue-presentation.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';
import { start, read, act, tutorial, finishCity } from './helpers/prologue.js';

const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/await init\(\);\s*$/,'');
async function harness(snapshot,pack=content) {
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),validateRun:r=>engine.validateRun(r,pack)});
  await storage.open();
  const saved=await storage.commitAuto(snapshot,{expectedRevision:await storage.getRevision()});
  const dom={addEventListener(){},querySelector(){return dom;},querySelectorAll(){return [];}};
  const context=vm.createContext({defaultContent:pack,contentForRun:()=>pack,...engine,createStorage:()=>storage,
    structuredClone,document:dom,window:{scrollTo(){}},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){}});
  new vm.Script(source+`
    render=()=>syncReadingSession();
    globalThis.api={
      initialize(snapshot,saved){run=snapshot;content=defaultContent;reader=saved.readerProfile;revision=saved.revision;slotsRevision=revision;ready=true;title=false;syncReadingSession();},
      state(){return structuredClone({run,reader,revision,pending:!!pending,readingPreviewIndex,history:readingHistory.length});},
      previewPage(){return getCurrentTextPage(readingPreviewIndex===null?run:readingHistory[readingPreviewIndex],content);},
      panel(){return dialoguePanel(getCurrentTextPage(run,content));},
      handle,perform,trialSidebar,load,openSaves,faceIcon,speakerLabel,member
    };
  `).runInContext(context);
  context.api.initialize(snapshot,saved);
  return {app:context.api,storage};
}
const atBlock=(sceneId,index,commanderId)=>({ ...start(undefined,commanderId),position:{phase:'departure',sceneId,blockIndex:index} });

test('all reviewed protagonist narration and existing commander placeholders render both names, without replacing general UI nouns',async()=>{
  assert.equal(protagonistNarrationEdits.length,17);
  let literals=0;
  for(const commanderId of Object.keys(content.commanders)) {
    const r=start(undefined,commanderId), name=content.commanders[commanderId].name;
    for(const [id] of protagonistNarrationEdits) {
      const b=content.textBlocks[id];
      assert.ok(b.text.includes('{commander}'));
      const sceneId=Object.values(content.scenes).find(s=>s.blocks.includes(id))?.id;
      const probe=structuredClone(content);
      probe.scenes['test.render']={id:'test.render',blocks:[id]};
      // Rendering each audited block independently also covers both conditional variants.
      const shown=engine.getCurrentText({...r,position:{phase:'departure',sceneId:'test.render',blockIndex:0}},probe);
      if(!shown) continue;
      assert.doesNotMatch(shown.text,/主人公|\{commander\}|【主人公】/);
      assert.ok(shown.text.includes(name),`${commanderId}/${id}/${sceneId}`);
      literals+=(b.text.match(/\{commander\}/g)||[]).length;
    }
    for(const trial of Object.values(content.trials)) {
      const scene=content.scenes[trial.introductionSceneId];
      for(let blockIndex=0;blockIndex<scene.blocks.length;blockIndex++) {
        const b=engine.getCurrentText({...r,position:{phase:'trial',sceneId:scene.id,blockIndex}},content);
        if(b) assert.doesNotMatch(b.text,/主人公|【主人公】|\{commander\}/,b.id);
      }
    }
    const {app}=await harness(r);
    assert.match(app.panel(),/dialogue-panel/);
  }
  assert.equal(literals,32); // 13 city occurrences × 2 + 3 prologue occurrences per route.
  const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  assert.ok(appSource.includes('最後に判断するのは主人公自身です。'));
  assert.doesNotMatch(Object.values(content.textBlocks).map(b=>b.text).join('\n'),/主人公/);
});

test('quantity edits are an audited list; explicit party numbers change while idiomatic phrasing survives',()=>{
  assert.equal(quantityEdits.length,32);
  for(const [id,from,to] of quantityEdits) {
    assert.ok(content.textBlocks[id].text.includes(to),id);
    assert.ok(!content.textBlocks[id].text.includes(from),id);
  }
  const text=Object.values(content.textBlocks).map(b=>b.text).join('\n');
  assert.match(text,/俺一人じゃ/); assert.match(text,/誰か一人にとって/); assert.match(text,/一つ一つ/);
  assert.match(text,/「4人？」/); assert.match(text,/4名の同行者/); assert.match(text,/候補は8名/);
});

test('each explicit dramatic page has 2–4 labeled turns and stays within one scene, phase and protagonist branch',async()=>{
  for(const commanderId of Object.keys(content.commanders)) {
    let mixed=0;
    for(const sceneId of Object.keys(dialoguePageGroups)) {
      let r=sceneId==='prologue.declaration'?engine.createRun(content):atBlock(sceneId,0,commanderId);
      // Tutorial scene is tested as a rendering probe; transition semantics remain engine-owned.
      for(let index=0;index<content.scenes[sceneId].blocks.length;) {
        const p={...r,commanderId,position:{...r.position,sceneId,blockIndex:index}};
        const page=engine.getCurrentTextPage(p,content);
        if(!page.length){index++;continue;}
        const first=page[0];
        if(first.pageGroup) {
          assert.ok(page.length>=2&&page.length<=4,first.id);
          assert.ok(page.every(b=>b.pageGroup===first.pageGroup));
          assert.ok(page.reduce((n,b)=>n+b.text.length,0)<=220);
          assert.ok(page.every(b=>b.text.length<=120));
          assert.ok(page.every(b=>!b.condition||b.condition.commanderIs===commanderId));
          mixed++;
        }
        index=content.scenes[sceneId].blocks.indexOf(page.at(-1).id)+1;
      }
    }
    assert.equal(mixed,8);
  }
  const r=atBlock('prologue.court',11,'commander.alphonse');
  const {app}=await harness(r);const html=app.panel();
  assert.equal((html.match(/class="dialogue-turn"/g)||[]).length,4);
  assert.equal((html.match(/<span>ローズモンド<\/span>/g)||[]).length,2);
  assert.equal((html.match(/<span>アルフォンス<\/span>/g)||[]).length,2);
});

test('shared face labels cover both commanders, the king, all companions and Theo without embedding images in saves',async()=>{
  const r=start(),{app}=await harness(r);
  for(const id of [...Object.keys(content.commanders),...Object.keys(content.characters),'support.theo']) {
    const icon=app.faceIcon(id);
    assert.match(icon,/<img src="\.\/src\/assets\/portraits\//,id);
    assert.match(icon,/aria-hidden="true"/);
    assert.match(icon,/alt=""/);
    assert.match(app.speakerLabel(id),new RegExp(`<span>${(content.characters[id]||content.commanders[id]||content.speakers[id]).name}</span>`));
  }
  assert.match(app.faceIcon('support.king'),/emblem-icon.*kingdom-emblem\.svg/);
  assert.equal(app.faceIcon('support.overseer'),'');
  for(const c of Object.values(content.characters)) {
    assert.match(app.member(c),new RegExp(content.portraits[c.id].src.replaceAll('.','\\.')));
    assert.doesNotMatch(app.member(c),/member-avatar/);
  }
  assert.deepEqual(app.state().run,r);
  assert.doesNotMatch(JSON.stringify(app.state().run),/data:image|\.png|portrait/);
});

test('both short pauses stay between their adjacent speeches and resume from every saved block without replay',async()=>{
  for(const [sceneId,commanderId,firstOrdinal] of [
    ['prologue.court','commander.rosemond',35],
    ['prologue.midgame-reunion','commander.alphonse',44],
  ]) {
    let base=start(undefined,commanderId);
    if(sceneId.endsWith('reunion')) base=finishCity(finishCity(base,'alba'),'hexerei',{stopBeforeClosing:true});
    const ids=content.scenes[sceneId].blocks.slice(firstOrdinal-1,firstOrdinal+2);
    for(let offset=0;offset<3;offset++) {
      const r={...base,position:{...base.position,sceneId,blockIndex:firstOrdinal-1+offset}};
      if(sceneId.endsWith('court')) r.position={phase:'departure',sceneId,blockIndex:firstOrdinal-1+offset};
      const {app,storage}=await harness(r), before=app.state();
      const shown=engine.getCurrentTextPage(r,content);
      assert.deepEqual(shown.map(b=>b.id),ids.slice(offset));
      assert.ok(shown.length>1||offset===2);
      if(offset<2) {
        const html=app.panel();
        assert.match(html,/narration-turn/);assert.doesNotMatch(html,/>記録</);
      }
      await app.handle('ack-page');
      const after=app.state(), saved=(await storage.getSlot('auto')).run;
      assert.deepEqual(saved,after.run);
      assert.deepEqual(after.run.trialResults,before.run.trialResults);
      assert.deepEqual(after.run.recentDialogueLog.slice(-shown.length).map(b=>b.textId),ids.slice(offset));
      for(const b of shown) assert.equal(after.reader.readTextKeys.filter(key=>key===b.readKey).length,1);
      await app.handle('read-prev');await app.handle('read-forward');
      assert.deepEqual(app.state().run,after.run);assert.deepEqual(app.state().reader,after.reader);
      assert.equal(app.state().revision,after.revision);
      await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
      await app.openSaves();await app.load('manual1');assert.deepEqual(app.state().run,r);
    }
  }
});

test('tutorial success keeps Alphonse copy and read keys, revises only Rosemond and preserves saved logs',async()=>{
  const old=createPrologueContent();
  for(const [id,from,to]of rosemondTutorialEdits) {
    assert.equal(content.textBlocks[id].text,to);assert.equal(content.textBlocks[id].textRevision,2);
    old.textBlocks[id].text=from;old.textBlocks[id].textRevision=1;
  }
  for(const commanderId of Object.keys(content.commanders)) {
    let r=tutorial(commanderId);
    for(const locationId of ['warehouse','servants','preparation']) r=read(act(r,'INSPECT_TUTORIAL_LOCATION',{locationId}));
    r=act(r,'DECIDE_TUTORIAL',{choiceId:'b'});
    const original=engine.getCurrentTextPage(r,old), revised=engine.getCurrentTextPage(r,content);
    assert.equal(revised.length,4);
    if(commanderId.endsWith('alphonse')) assert.deepEqual(revised,original);
    else {
      assert.deepEqual(revised.map(b=>b.text),rosemondTutorialEdits.map(row=>row[2]));
      assert.ok(revised.every((b,i)=>b.readKey!==original[i].readKey));
    }
    // A pre-update log entry remains verbatim when resuming the same content version.
    r=act(r,'ACK_TEXT',{},old);
    const logged=structuredClone(r.recentDialogueLog);
    const {app,storage}=await harness(r);
    await app.handle('ack-page');
    assert.deepEqual(app.state().run.recentDialogueLog.slice(0,logged.length),logged);
    assert.deepEqual((await storage.getSlot('auto')).run,app.state().run);
  }
});

test('long turns, explicit breaks, scene changes, and normal novels remain separate',()=>{
  const c=createPrologueContent(),r=atBlock('prologue.court',11,'commander.alphonse');
  const ids=c.scenes['prologue.court'].blocks;
  c.textBlocks[ids[12]].text='長'.repeat(121);
  assert.equal(engine.getCurrentTextPage(r,c).length,1);
  const next={...r,position:{...r.position,blockIndex:12}};
  assert.equal(engine.getCurrentTextPage(next,c).length,1);
  c.textBlocks[ids[12]].text='短い台詞';c.textBlocks[ids[12]].pageBreakBefore=true;
  assert.equal(engine.getCurrentTextPage(r,c).length,1);
  const first=engine.createRun(content),normal=engine.getCurrentTextPage(first,content);
  assert.equal(normal.length,2);
  const king=act(act(first,'ACK_TEXT'),'ACK_TEXT');assert.equal(engine.getCurrentTextPage(king,content).length,1);
  const novel=content.scenes[content.trials['ehrenfels.major'].introductionSceneId];
  assert.equal(novel.presentation,'novel');assert.ok(content.textBlocks[novel.blocks[0]].text.length>1000);
  const last=atBlock('prologue.court',39,'commander.rosemond');
  assert.equal(engine.getCurrentTextPage(last,content).length,1);
});

function effectFixture() {
  const pack=structuredClone(content);
  let r=read(act(start(),'START_REGION',{regionId:'alba'}));
  const scene=pack.scenes[r.position.sceneId];
  scene.blocks=[1,2,3].map(i=>{
    const id=`text.test.reading.${i}`,infoId=`info.test.reading.${i}`;
    pack.information[infoId]={id:infoId,regionId:'alba',trialId:'alba.small1',summary:`情報${i}`,sourceKind:'local',sourceSceneId:scene.id};
    pack.textBlocks[id]={id,text:`発言${i}`,textRevision:1,speakerId:i%2?'commander.alphonse':'commander.rosemond',
      informationIdsOnAcknowledge:[infoId],pageGroup:'test.effects'};
    return id;
  });
  r={...r,position:{...r.position,blockIndex:0}};engine.validateRun(r,pack);
  return {r,pack};
}

test('page acknowledgement commits every block once; previous/forward and skip are strictly read-only',async()=>{
  const {r,pack}=effectFixture();const {app,storage}=await harness(r,pack);
  const page=engine.getCurrentTextPage(r,pack);assert.equal(page.length,3);
  await app.handle('ack-page');
  const after=app.state(), persisted=await storage.getSlot('auto');
  assert.equal(after.run.recentDialogueLog.length,r.recentDialogueLog.length+3);
  for(let i=1;i<=3;i++)assert.equal(after.run.acquiredInformation[`info.test.reading.${i}`].sources.length,1);
  assert.equal(after.reader.readTextKeys.length,3);
  await app.handle('read-prev');
  assert.deepEqual(app.previewPage().map(b=>b.id),page.map(b=>b.id));
  assert.match(app.trialSidebar(),/読み返し中/);
  for(const action of ['ack-page','ack','skip'])await app.handle(action);
  assert.deepEqual(app.state().run,after.run);assert.deepEqual(app.state().reader,after.reader);
  assert.equal(app.state().revision,after.revision);
  await app.handle('read-forward');assert.equal(app.state().readingPreviewIndex,null);
  assert.deepEqual(app.state().run,after.run);assert.deepEqual(await storage.getSlot('auto'),persisted);
  await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
  await app.handle('read-prev');await app.openSaves();await app.load('manual1');
  assert.equal(app.state().readingPreviewIndex,null);assert.equal(app.state().history,0);
  assert.deepEqual(app.state().run,r);
});

test('a failed grouped auto save retries its snapshot without repeating block effects or reading keys',async()=>{
  const {r,pack}=effectFixture();const {app,storage}=await harness(r,pack);
  const commit=storage.commitAuto;let attempts=0;
  storage.commitAuto=(...args)=>++attempts===1?Promise.reject(new Error('injected grouped write failure')):commit(...args);
  await app.handle('ack-page');assert.equal(app.state().pending,true);
  assert.deepEqual((await storage.getSlot('auto')).run,r);
  await app.handle('retry');assert.equal(app.state().pending,false);assert.equal(attempts,2);
  const run=(await storage.getSlot('auto')).run;
  assert.equal(run.recentDialogueLog.length,r.recentDialogueLog.length+3);
  for(let i=1;i<=3;i++)assert.equal(run.acquiredInformation[`info.test.reading.${i}`].sources.length,1);
  assert.equal((await storage.getReaderProfile()).readTextKeys.length,3);
});

test('both protagonists finish all 15 trials through actual page handlers, voices, Theo and read-only result review',async()=>{
  for(const commanderId of Object.keys(content.commanders)) {
    const {app,storage}=await harness(start(undefined,commanderId));
    let reunions=0,expectedScore=0;
    async function readVisible(){
      let guard=0;
      while(engine.getCurrentText(app.state().run,content)){
        assert.ok(++guard<200);
        const r=app.state().run;
        const scene=content.scenes[r.position.sceneId];
        await app.handle(r.position.phase==='conversation'?'ack-conversation':scene?.presentation==='novel'?'ack-introduction':'ack-page');
        assert.equal(app.state().pending,false);
      }
    }
    for(const [cityIndex,regionId]of ['alba','rude','hexerei','anchoring','ehrenfels'].entries()) {
      await app.perform({type:'START_REGION',regionId});await readVisible();
      for(let index=0;index<3;index++) {
        for(const c of engine.getAvailableConversations(app.state().run,content)) {
          await app.perform({type:'OPEN_CONVERSATION',conversationId:c.id});await readVisible();
        }
        if(index===2&&[0,2].includes(cityIndex)) {
          const before=app.state().run;
          await app.handle('theo');await app.handle('cancel-confirm');assert.deepEqual(app.state().run,before);
          await app.perform({type:'REQUEST_THEO'});await readVisible();
        }
        const r=app.state().run;
        const choiceId=`choice.${r.position.trialId}.${regionId==='alba'&&index===1?'d':'a'}`;
        const choice=engine.getAvailableChoices(r,content).find(c=>c.id===choiceId);assert.ok(choice);
        expectedScore+=choice.points;
        await app.perform({type:'RESOLVE_TRIAL',trialId:r.position.trialId,choiceId});await readVisible();
        const after=app.state();
        await app.handle('read-prev');await app.handle('read-forward');
        assert.deepEqual(app.state().run,after.run);assert.deepEqual(app.state().reader,after.reader);assert.equal(app.state().revision,after.revision);
        await app.perform({type:'CONTINUE_TRIAL'});
        while(engine.getCurrentText(app.state().run,content)) {
          if(app.state().run.position.phase==='storyEvent')reunions=1;
          await app.handle('ack-page');
        }
      }
      assert.equal(app.state().run.position.phase,'map');
      assert.equal(app.state().run.chapterProgress[regionId].status,'completed');
      const slot=await storage.getSlot('auto');assert.deepEqual(slot.run,app.state().run);
    }
    const r=app.state().run;
    assert.equal(Object.keys(r.trialResults).length,15);assert.equal(reunions,1);
    assert.equal(engine.getTotalScore(r),expectedScore);assert.equal(engine.getTheoRemaining(r),0);
    assert.equal(r.trialResults['alba.small2'].awardedPoints,4);
    assert.equal(content.trials['alba.small2'].choices.find(c=>c.id.endsWith('.c')).points,5);
    assert.equal(new Set(r.heardConversationIds).size,r.heardConversationIds.length);
    await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
    await app.openSaves();await app.load('manual1');assert.deepEqual(app.state().run,r);
  }
});
