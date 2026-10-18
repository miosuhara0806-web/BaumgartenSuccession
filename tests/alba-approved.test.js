import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { content } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { content as fixture } from '../src/content/fixture.js';
import { albaIntroductions } from '../src/content/alba-introductions.js';
import { contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const act = (r,type,args={},c=content) => engine.transition(r,{type,...args},c);
function read(r,c=content) {
  for(let guard=0;engine.getCurrentText(r,c);guard++) {
    assert.ok(guard<200); r=act(r,'ACK_TEXT',{},c);
  }
  return r;
}
const ids=Object.keys(content.characters);
const defaultParty=['char.harold','char.frederica','char.lisette','char.sandro'];
function start(party=defaultParty,commanderId='commander.alphonse',c=content) {
  let r=read(engine.createRun(c),c);
  r=act(r,'SELECT_COMMANDER',{commanderId},c);
  for(const characterId of party)r=act(r,'TOGGLE_PARTY',{characterId},c);
  r=act(r,'CONFIRM_PARTY',{},c);
  return read(act(r,'DEPART',{},c),c);
}
function enter(party=defaultParty,commanderId='commander.alphonse') {
  return read(act(start(party,commanderId),'START_REGION',{regionId:'alba'}));
}
function resolve(r,letter) {
  return read(act(r,'RESOLVE_TRIAL',{trialId:r.position.trialId,choiceId:`choice.${r.position.trialId}.${letter}`}));
}
const next = r => read(act(r,'CONTINUE_TRIAL'));
function parties() {
  const result=[];
  for(let a=0;a<5;a++)for(let b=a+1;b<6;b++)for(let c=b+1;c<7;c++)for(let d=c+1;d<8;d++)
    result.push([ids[a],ids[b],ids[c],ids[d]]);
  return result;
}

test('approved score tables, the sole additional choice, and all reachable content references agree',()=>{
  assert.deepEqual(content.trials['alba.small1'].choices.map(c=>c.points),[5,3,4]);
  assert.deepEqual(content.trials['alba.small2'].choices.map(c=>c.points),[3,3,5,4]);
  assert.deepEqual(content.trials['alba.major'].choices.map(c=>c.points),[7,10,9]);
  assert.deepEqual(Object.values(content.trials).flatMap(t=>t.choices.filter(c=>c.condition).map(c=>c.id)),['choice.alba.small2.d']);
  for(const scene of Object.values(content.scenes)) {
    for(const id of scene.blocks)assert.ok(content.textBlocks[id]);
    for(const id of scene.conversationIds)assert.ok(content.conversations[id]);
  }
  for(const conversation of Object.values(content.conversations)) {
    for(const id of conversation.blockIds)assert.ok(content.textBlocks[id]);
    for(const id of conversation.informationIdsOnComplete)assert.ok(content.information[id]);
  }
  for(const block of Object.values(content.textBlocks)) {
    for(const id of block.informationIdsOnAcknowledge)assert.ok(content.information[id]);
  }
});

test('all 70 parties and both protagonists complete Alba with 13/20 bounds and ordinary perfect route',()=>{
  assert.equal(parties().length,70);
  for(const commanderId of Object.keys(content.commanders))for(const party of parties())
    for(const [letters,total] of [[['a','c','b'],20],[['b','a','a'],13],[['c','b','c'],16]]) {
      let r=enter(party,commanderId);
      assert.equal(engine.getOpponentParty(r,content).length,4);
      for(const letter of letters) {
        assert.equal(engine.getAvailableChoices(r,content).length,3);
        assert.ok(engine.getAvailableConversations(r,content).every(c=>party.includes(c.participantIds[0])));
        r=next(resolve(r,letter));
      }
      assert.equal(r.chapterProgress.alba.status,'completed');
      assert.equal(r.position.phase,'map');
      assert.equal(engine.getTotalScore(r),total);
      assert.equal(Object.keys(r.acquiredInformation).length,12);
    }
});

test('a fifth member is rejected and departure fixes the chosen four',()=>{
  let r=read(engine.createRun(content));
  r=act(r,'SELECT_COMMANDER',{commanderId:'commander.rosemond'});
  for(const characterId of ids.slice(0,4))r=act(r,'TOGGLE_PARTY',{characterId});
  assert.throws(()=>act(r,'TOGGLE_PARTY',{characterId:ids[4]}),/4人まで/);
  r=act(r,'CONFIRM_PARTY');r=read(act(r,'DEPART'));
  assert.throws(()=>act(r,'TOGGLE_PARTY',{characterId:ids[0]}));
});

test('only scene-relevant companions speak, in any order, and listening never awards points or invented memos',()=>{
  let r=enter();
  const expected={
    'alba.small1':['harold','lisette','frederica'],
    'alba.small2':['harold','frederica','sandro','lisette'],
    'alba.major':['harold','lisette','frederica'],
  };
  for(const letter of ['a','c','b']) {
    const conversations=engine.getAvailableConversations(r,content);
    assert.deepEqual(conversations.map(c=>c.participantIds[0].slice(5)),expected[r.position.trialId]);
    const points=engine.getTotalScore(r),infos=structuredClone(r.acquiredInformation);
    for(const conversation of conversations.toReversed()) {
      r=act(r,'OPEN_CONVERSATION',{conversationId:conversation.id});
      for(const id of conversation.blockIds) {
        assert.equal(engine.getCurrentText(r,content).id,id);
        r=act(r,'ACK_TEXT');
      }
      assert.ok(!engine.getAvailableConversations(r,content).some(c=>c.id===conversation.id));
    }
    assert.equal(engine.getTotalScore(r),points);
    assert.deepEqual(r.acquiredInformation,infos);
    r=next(resolve(r,letter));
  }
});

test('Lisette D is completely absent before completion, unavailable without her, and awards exactly 4',()=>{
  let absent=next(resolve(enter(['char.harold','char.frederica','char.madian','char.olivel']),'a'));
  assert.deepEqual(engine.getAvailableChoices(absent,content).map(c=>c.id.at(-1)),['a','b','c']);
  assert.throws(()=>act(absent,'RESOLVE_TRIAL',{trialId:'alba.small2',choiceId:'choice.alba.small2.d'}));
  let r=next(resolve(enter(),'a'));
  const convo='conversation.alba.small2.lisette';
  r=act(r,'OPEN_CONVERSATION',{conversationId:convo});
  r=act(r,'ACK_TEXT');r=act(r,'ACK_TEXT');
  assert.equal(r.heardConversationIds.includes(convo),false);
  r=JSON.parse(JSON.stringify(r));engine.validateRun(r,content);
  r=act(r,'ACK_TEXT');
  assert.deepEqual(engine.getAvailableChoices(r,content).map(c=>c.id.at(-1)),['a','b','c','d']);
  const before=engine.getTotalScore(r);
  const action={type:'RESOLVE_TRIAL',trialId:'alba.small2',choiceId:'choice.alba.small2.d'};
  r=engine.transition(r,action,content);
  assert.equal(engine.getTotalScore(r),before+4);
  assert.deepEqual(engine.transition(r,action,content),r);
  const reactions=[];
  while(engine.getCurrentText(r,content)) {
    reactions.push(engine.getCurrentText(r,content).text);r=act(r,'ACK_TEXT');
    r=JSON.parse(JSON.stringify(r));engine.validateRun(r,content);
  }
  assert.equal(reactions.length,4);
  assert.match(reactions[3],/課題が残った/);
  assert.equal(engine.getTotalScore(r),before+4);
});

test('common memos are acquired only after their own supplied fact is acknowledged',()=>{
  let r=act(start(),'START_REGION',{regionId:'alba'});
  assert.deepEqual(r.acquiredInformation,{});
  const novelScene=r.position.sceneId;
  while(r.position.sceneId===novelScene)r=act(r,'ACK_TEXT');
  assert.deepEqual(r.acquiredInformation,{});
  assert.equal(r.position.sceneId,'alba.small1.intro');
  r=act(r,'ACK_TEXT');
  assert.deepEqual(Object.keys(r.acquiredInformation),['info.alba.small1.youth']);
  const entry=r.acquiredInformation['info.alba.small1.youth'];
  assert.equal(entry.sources[0].kind,'text');
  assert.equal(content.information['info.alba.small1.youth'].title,'防衛家系の青年');
  assert.equal(engine.getTotalScore(r),0);
});

test('manual/auto load keeps partial and completed conversations separate from global reading',async()=>{
  const db=createStorage({indexedDB:new MemoryIndexedDB(),dbName:'approved-test',validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await db.open();
  const before=next(resolve(enter(),'a'));
  const write=(method,...args)=>db[method](...args,{expectedRevision:revision});
  let revision=await db.getRevision();
  let saved=await write('saveManual','manual1',before);revision=saved.revision;
  let r=act(before,'OPEN_CONVERSATION',{conversationId:'conversation.alba.small2.lisette'});
  const keys=[];
  for(let i=0;i<2;i++){keys.push(engine.getCurrentText(r,content).readKey);r=act(r,'ACK_TEXT');}
  saved=await db.commitAuto(r,{expectedRevision:revision,readTextKeys:keys});revision=saved.revision;
  let loaded=await db.loadSlot('auto',{expectedRevision:revision});revision=loaded.revision;r=loaded.run;
  assert.equal(r.position.blockIndex,2);
  keys.push(engine.getCurrentText(r,content).readKey);r=act(r,'ACK_TEXT');
  saved=await db.commitAuto(r,{expectedRevision:revision,readTextKeys:keys});revision=saved.revision;
  saved=await db.saveManual('manual2',r,{expectedRevision:revision});revision=saved.revision;
  loaded=await db.loadSlot('manual1',{expectedRevision:revision});revision=loaded.revision;
  assert.equal(engine.getAvailableChoices(loaded.run,content).length,3);
  assert.equal((await db.getReaderProfile()).readTextKeys.length,3);
  loaded=await db.loadSlot('manual2',{expectedRevision:revision});revision=loaded.revision;
  assert.equal(engine.getAvailableChoices(loaded.run,content).length,4);
  const fresh=engine.createRun(content);
  saved=await db.commitAuto(fresh,{expectedRevision:revision});
  assert.deepEqual(saved.readerProfile.readTextKeys,keys);
  assert.deepEqual(fresh.heardConversationIds,[]);assert.deepEqual(fresh.acquiredInformation,{});
});

test('normal reactions stay pending, Theo does not unlock extra policies, and approved scores reject tampering',()=>{
  for(const trial of Object.values(content.trials)) {
    const normal=trial.choices.filter(c=>!c.condition);
    assert.equal(normal.length,3);
    for(const choice of normal){assert.deepEqual(choice.feedbackBlockIds,[]);assert.equal(choice.feedbackPending,true);assert.deepEqual(choice.governanceTags,[]);}
    assert.equal(trial.interaction,'decision');
  }
  let r=next(resolve(next(resolve(enter(),'a')),'c'));
  r=read(act(r,'REQUEST_THEO'));
  assert.equal(engine.getTheoRemaining(r),1);
  assert.equal(engine.getAvailableChoices(r,content).length,3);
  r=resolve(r,'b');
  r.trialResults['alba.major'].awardedPoints=9;
  assert.throws(()=>engine.validateRun(r,content),/正式配点/);
});

test('original public saves and Oct16 introduction positions keep their own content and scores',()=>{
  let r=start(defaultParty,'commander.alphonse',fixture);
  const snapshot=structuredClone(r);
  assert.equal(contentForRun(r),legacy);engine.validateRun(r,legacy);
  assert.deepEqual(r,snapshot);
  r=act(r,'START_REGION',{regionId:'alba'},legacy);
  for(let i=0;i<5;i++)r=act(r,'ACK_TEXT',{},legacy);
  const restored=JSON.parse(JSON.stringify(r));
  engine.validateRun(restored,contentForRun(restored));
  assert.equal(restored.position.blockIndex,5);
  assert.equal(engine.getCurrentText(restored,legacy).readKey,engine.getCurrentText(r,legacy).readKey);
  assert.throws(()=>engine.validateRun(restored,content),/内容版/);
  assert.throws(()=>contentForRun({contentVersion:'unknown'}),/既存の保存は保持/);
});

test('recovered manuscripts preserve all paragraphs, fragments and the complete Oct16 content hash',async()=>{
  const source=await readFile(new URL('../docs/alba-introductions-source.md',import.meta.url),'utf8');
  const sections=source.split(/^## (.+)\n/gm);
  assert.deepEqual(albaIntroductions.map(i=>i.fragments.length),[11,21,5]);
  for(let i=0;i<3;i++) {
    const intro=albaIntroductions[i];
    assert.equal(intro.fragments.join('\n\n'),sections[i*2+2].trim().replaceAll('【主人公】','{commander}'));
    const scene=legacy.scenes[legacy.trials[intro.trialId].introductionSceneId];
    assert.deepEqual(scene.blocks.map(id=>legacy.textBlocks[id].text),intro.fragments);
    assert.deepEqual(content.scenes[scene.id],scene);
    assert.deepEqual(scene.blocks.map(id=>content.textBlocks[id]),scene.blocks.map(id=>legacy.textBlocks[id]));
  }
  assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),'2b73cd3ae148df98621b9d1394bdf2e1a7689925ceb490064f605115a7c95d45');
});
