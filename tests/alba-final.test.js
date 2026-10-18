import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content } from '../src/content/alba-final.js';
import { content as previous } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const manuscript=await readFile(new URL('../docs/alba-final-source-20261018.md',import.meta.url),'utf8');
const section=manuscript.split('## 1．')[1].split('## 2．')[0];
const reactions=[...section.matchAll(/#### ([ABC])：([^\n]+)\n\n\*\*継承点：(\d+)／\d+点\*\*\n\n\*\*選択後の反応\*\*\n\n([\s\S]*?)\n\n\*\*評価理由\*\*\n\n([\s\S]*?)(?=\n#### |\n### |$)/g)].map((m,i)=>({
  trialId:['alba.small1','alba.small2','alba.major'][Math.floor(i/3)],letter:m[1].toLowerCase(),points:Number(m[3]),reaction:m[4],reason:m[5].trim(),
}));
const expectedMemos=[...manuscript.split('## 2．')[1].split('## 3．')[0].matchAll(/\*\*(\d{2})｜([^*\n]+)\*\*  \n分類：同行者の見解／出典：([^\n]+)\n\n([\s\S]*?)(?=\n\n\*\*\d|\n\n### |$)/g)];
const expectedReport=manuscript.split('### 調査報告（原文）\n\n')[1].split('\n\n### 取得メモ')[0];
const expectedTheoMemo=manuscript.split('出典：テオ／防衛隊の内部記録\n\n')[1].split('\n\n### 発生条件')[0];
const tags={a:['people','stability'],b:['reform','fairness'],c:['stability','coordination']};
const party=['char.harold','char.frederica','char.lisette','char.sandro'];
const act=(r,type,args={},pack=content)=>engine.transition(r,{type,...args},pack);
function read(r,pack=content){for(let guard=0;engine.getCurrentText(r,pack);guard++){assert.ok(guard<200);r=act(r,'ACK_TEXT',{},pack);}return r;}
function start(members=party,commanderId='commander.alphonse',pack=content){
  let r=read(engine.createRun(pack),pack);
  r=act(r,'SELECT_COMMANDER',{commanderId},pack);
  for(const characterId of members)r=act(r,'TOGGLE_PARTY',{characterId},pack);
  return read(act(act(r,'CONFIRM_PARTY',{},pack),'DEPART',{},pack),pack);
}
const enter=(members=party,commanderId='commander.alphonse',pack=content)=>read(act(start(members,commanderId,pack),'START_REGION',{regionId:'alba'},pack),pack);
const choose=(r,letter,pack=content)=>act(r,'RESOLVE_TRIAL',{trialId:r.position.trialId,choiceId:`choice.${r.position.trialId}.${letter}`},pack);
const next=(r,pack=content)=>read(act(read(r,pack),'CONTINUE_TRIAL',{},pack),pack);
const major=()=>next(choose(next(choose(enter(),'a')),'c'));
const appSource=(await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/await init\(\);\s*$/,'');
async function harness(snapshot){
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),dbName:'alba-final-ui',validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await storage.open();
  const saved=await storage.commitAuto(snapshot,{expectedRevision:await storage.getRevision()});
  const dom={addEventListener(){},querySelector(){return dom;},querySelectorAll(){return [];}};
  const context=vm.createContext({defaultContent,contentForRun,...engine,createStorage:()=>storage,structuredClone,document:dom,window:{scrollTo(){}},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){}});
  new vm.Script(appSource+`
    render=()=>{};
    globalThis.api={
      initialize(state,rev,profile){run=state;content=contentForRun(state);revision=rev;slotsRevision=rev;reader=profile;ready=true;title=false;},
      state(){return structuredClone({run,reader,pending:!!pending,version:content.contentVersion});},
      handle,perform,load,openSaves,trialPage,memoBody,slotSummary,
    };
  `).runInContext(context);
  context.api.initialize(snapshot,saved.revision,saved.readerProfile);
  return {app:context.api,storage};
}

test('all nine reactions and reasons match the supplied manuscript verbatim; only the three major policies have tags',()=>{
  assert.equal(defaultContent,content);assert.equal(reactions.length,9);
  for(const row of reactions){
    const trial=content.trials[row.trialId],choice=trial.choices.find(c=>c.id===`choice.${row.trialId}.${row.letter}`);
    assert.equal(choice.points,row.points);
    assert.equal(choice.feedbackBlockIds.map(id=>content.textBlocks[id].text).join('\n\n'),row.reaction);
    assert.equal(choice.evaluationReason,row.reason);
    assert.equal(choice.feedbackPending,undefined);
    assert.equal(trial.contentStatus,'reviewed');
    assert.deepEqual(choice.governanceTags,trial.kind==='major'?tags[row.letter]:[]);
  }
  assert.deepEqual(content.trials['alba.small2'].choices.at(-1),previous.trials['alba.small2'].choices.at(-1));
});

test('all ten companion memos and the Theo report/memo match the supplied text and provenance',()=>{
  assert.equal(expectedMemos.length,10);
  const memos=Object.values(content.information).filter(i=>i.sourceKind==='companion');
  assert.equal(memos.length,10);
  for(const m of expectedMemos){
    const memo=memos.find(i=>i.title===`${m[1]}｜${m[2]}`);
    assert.ok(memo);assert.equal(memo.summary,m[4].trim());
    assert.equal(content.characters[memo.sourceActorId].name,m[3]);
    assert.equal(memo.sourceKind,'companion');
  }
  assert.equal(content.informationSourceLabels.companion,'同行者の見解');
  assert.equal(content.textBlocks['text.alba.theo.report'].text,expectedReport);
  assert.equal(content.textBlocks['text.alba.theo.report'].textRevision,2);
  assert.equal(content.information['info.alba.theo'].summary,expectedTheoMemo);
  assert.equal(content.information['info.alba.theo'].title,'過去の防衛訓練の中断');
  assert.equal(content.information['info.alba.theo'].sourceLabel,'テオ／防衛隊の内部記録');
  assert.equal(Object.keys(content.information).length,23);
});

test('70 freely selected parties and both commanders finish the final content at 13, 20 and intermediate scores without duplicate awards',()=>{
  const ids=Object.keys(content.characters),parties=[];
  for(let a=0;a<5;a++)for(let b=a+1;b<6;b++)for(let c=b+1;c<7;c++)for(let d=c+1;d<8;d++)parties.push([ids[a],ids[b],ids[c],ids[d]]);
  assert.equal(parties.length,70);
  for(const commander of Object.keys(content.commanders))for(const members of parties)for(const [letters,total] of [[['a','c','b'],20],[['b','a','a'],13],[['c','b','c'],16]]){
    let r=enter(members,commander);
    for(const letter of letters){
      assert.equal(engine.getAvailableChoices(r,content).length,3);
      const action={type:'RESOLVE_TRIAL',trialId:r.position.trialId,choiceId:`choice.${r.position.trialId}.${letter}`};
      r=engine.transition(r,action,content);
      assert.deepEqual(engine.transition(r,action,content),r);
      const restored=JSON.parse(JSON.stringify(r));engine.validateRun(restored,content);
      r=next(restored);
    }
    assert.equal(r.chapterProgress.alba.status,'completed');assert.equal(engine.getTotalScore(r),total);
    assert.equal(Object.keys(r.acquiredInformation).length,12);assert.equal(engine.getTheoRemaining(r),2);
    assert.deepEqual(r.trialResults['alba.major'].governanceTags,tags[letters[2]]);
    const counts=engine.getGovernance(r,content).counts;
    for(const tag of engine.GOVERNANCE_TAGS)assert.equal(counts[tag],tags[letters[2]].includes(tag)?1:0);
  }
});

test('each memo is granted only by its own grouped confirmation, with sources, hidden-until-acquired display and no points',async()=>{
  let r=enter();
  for(const letter of ['a','c','b']){
    const conversations=engine.getAvailableConversations(r,content);
    for(const conversation of conversations){
      const {app,storage}=await harness(r),memoId=conversation.informationIdsOnComplete[0];
      const memo=content.information[memoId];
      assert.ok(memo);assert.doesNotMatch(app.memoBody(),new RegExp(memo.title));
      await app.handle('conversation',conversation.id);
      assert.equal(app.state().run.acquiredInformation[memoId],undefined);
      const html=app.trialPage();assert.match(html,/conversation-text/);assert.doesNotMatch(html,/<p>「|」<\/p>/);
      await app.handle('ack-conversation');
      const result=app.state();
      assert.ok(result.run.acquiredInformation[memoId]);assert.equal(engine.getTotalScore(result.run),engine.getTotalScore(r));
      assert.equal(result.run.acquiredInformation[memoId].sources[0].kind,'conversation');
      assert.match(app.memoBody(),/同行者の見解/);
      assert.ok(app.memoBody().includes(memo.summary));
      assert.ok(app.memoBody().includes(`出典：${content.characters[memo.sourceActorId].name}`));
      assert.deepEqual(JSON.parse(JSON.stringify(result.run)),(await storage.getSlot('auto')).run);
    }
    for(const conversation of conversations)r=read(act(r,'OPEN_CONVERSATION',{conversationId:conversation.id}));
    r=next(choose(r,letter));
  }
  assert.equal(Object.keys(r.acquiredInformation).length,22);
  const {app}=await harness(r);assert.equal((app.memoBody('alba').match(/class="info-item"/g)||[]).length,22);
});

test('unrelated parties have no Alba opinions or private memos, and no future trial memo appears early',()=>{
  let r=enter(['char.madian','char.olivel','char.vantalt','char.heidemarie']);
  assert.equal(Object.keys(r.acquiredInformation).length,3);
  for(const letter of ['a','c','b']){
    assert.deepEqual(engine.getAvailableConversations(r,content),[]);
    assert.ok(Object.keys(r.acquiredInformation).every(id=>content.information[id].sourceKind==='local'));
    r=next(choose(r,letter));
  }
  assert.equal(Object.keys(r.acquiredInformation).length,12);
});

test('memo and Lisette D acquisition roll back together while global reading remains; confirmed load restores both',async()=>{
  const before=next(choose(enter(),'a')),{app,storage}=await harness(before);
  await app.handle('save-slot','manual1');
  await app.handle('conversation','conversation.alba.small2.lisette');
  const memo='info.alba.small2.lisette';
  assert.equal(app.state().run.acquiredInformation[memo],undefined);
  await app.handle('ack-conversation');
  assert.ok(app.state().run.acquiredInformation[memo]);assert.match(app.trialPage(),/data-id="choice.alba.small2.d"/);
  await app.handle('save-slot','manual2');
  await app.openSaves();await app.load('manual1');
  assert.equal(app.state().run.acquiredInformation[memo],undefined);assert.doesNotMatch(app.trialPage(),/data-id="choice.alba.small2.d"/);
  assert.equal(app.state().reader.readTextKeys.length,3);
  await app.handle('conversation','conversation.alba.small2.lisette');await app.handle('skip');
  assert.ok(app.state().run.acquiredInformation[memo]);
  await app.openSaves();await app.load('manual2');
  const restored=app.state().run;
  assert.equal(restored.acquiredInformation[memo].sources.length,1);
  assert.equal(engine.getTotalScore(restored),5);
  await app.perform({type:'RESOLVE_TRIAL',trialId:'alba.small2',choiceId:'choice.alba.small2.d'});
  assert.equal(engine.getTotalScore(app.state().run),9);
  assert.equal((await storage.getSlot('auto')).run.trialResults['alba.small2'].awardedPoints,4);
});

test('Theo adds only the supplied facts once, consumes once, and changes neither policies nor scores or tags',async()=>{
  const r=major(),{app,storage}=await harness(r);
  assert.equal(r.acquiredInformation['info.alba.theo'],undefined);assert.equal(engine.canUseTheo(enter(),content),false);
  const labels=engine.getAvailableChoices(r,content).map(c=>c.id);
  await app.perform({type:'REQUEST_THEO'});
  const report=app.state().run;
  assert.equal(engine.getTheoRemaining(report),1);assert.equal(engine.getTotalScore(report),10);
  assert.equal(engine.getCurrentText(report,content).text,expectedReport);
  assert.deepEqual(engine.transition(report,{type:'REQUEST_THEO'},content),report);
  assert.ok(app.memoBody().includes(expectedTheoMemo));assert.match(app.memoBody(),/テオの調査/);
  assert.ok(app.memoBody().includes('出典：テオ／防衛隊の内部記録'));
  await app.openSaves();await app.load('auto');
  assert.equal(engine.getTheoRemaining(app.state().run),1);
  await app.handle('ack');
  assert.deepEqual(engine.getAvailableChoices(app.state().run,content).map(c=>c.id),labels);
  assert.equal(engine.canUseTheo(app.state().run,content),false);
  const unchanged=app.state().run;
  assert.deepEqual(engine.transition(unchanged,{type:'REQUEST_THEO'},content),unchanged);
  assert.equal(unchanged.acquiredInformation['info.alba.theo'].sources.length,1);
  await app.perform({type:'RESOLVE_TRIAL',trialId:'alba.major',choiceId:'choice.alba.major.b'});
  assert.equal(engine.getTotalScore(app.state().run),20);
  assert.deepEqual(Array.from(app.state().run.trialResults['alba.major'].governanceTags),tags.b);
  assert.equal((await storage.getSlot('auto')).run.theoInvestigations.alba,'investigation.alba');
});

test('all new result screens show the supplied prose/reasons and never the pending notice',async()=>{
  for(const row of reactions){
    let r=enter();if(row.trialId!=='alba.small1')r=next(choose(r,'a'));
    if(row.trialId==='alba.major')r=next(choose(r,'c'));
    const {app}=await harness(r);
    await app.perform({type:'RESOLVE_TRIAL',trialId:row.trialId,choiceId:`choice.${row.trialId}.${row.letter}`});
    const html=app.trialPage();
    assert.doesNotMatch(html,/data-feedback-pending|正式原稿待ち|仮評価/);
    assert.ok(html.includes(row.reaction));assert.ok(html.includes(row.reason));
    assert.doesNotMatch(html,/reform|fairness|stability|coordination/);
  }
});

test('older acceptance and fixture saves retain their content, stored scores, tags, facts and read keys without retroactive memos',async()=>{
  for(const pack of [previous,legacy]){
    let old=enter(party,'commander.alphonse',pack);
    old=read(act(old,'OPEN_CONVERSATION',{conversationId:'conversation.alba.small1.harold'},pack),pack);
    old=next(choose(old,'a',pack),pack);old=next(choose(old,'c',pack),pack);
    old=choose(old,'b',pack);
    const copy=structuredClone(old);
    assert.equal(contentForRun(old),pack);engine.validateRun(old,pack);
    const {app,storage}=await harness(enter());
    await storage.saveManual('manual1',old,{expectedRevision:await storage.getRevision()});
    await app.openSaves();await app.load('manual1');
    assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)),copy);
    assert.equal(app.state().run.contentVersion,pack.contentVersion);
    assert.equal(engine.getTotalScore(app.state().run),engine.getTotalScore(copy));
    if(pack===previous){
      assert.equal(app.state().run.acquiredInformation['info.alba.small1.harold'],undefined);
      assert.deepEqual(Array.from(app.state().run.trialResults['alba.major'].governanceTags),[]);
      assert.match(app.slotSummary({run:old}),/前回検収版・正式配点を保持/);
    }
  }
  for(const trialId of content.regions.alba.trialIds){
    const id=content.trials[trialId].introductionSceneId;
    assert.deepEqual(content.scenes[id],previous.scenes[id]);
    for(const textId of content.scenes[id].blocks)assert.deepEqual(content.textBlocks[textId],previous.textBlocks[textId]);
  }
  for(const [id,info] of Object.entries(previous.information).filter(([,i])=>i.sourceKind==='local'))assert.deepEqual(content.information[id],info);
});
