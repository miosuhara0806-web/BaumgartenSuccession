import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { content } from '../src/content/companion-dialogue-unified.js';
import { content as old } from '../src/content/ehrenfels.js';
import { content as rude } from '../src/content/rude.js';
import { content as anchoring } from '../src/content/anchoring.js';
import { content as hexerei } from '../src/content/hexerei.js';
import { content as alba } from '../src/content/alba-final.js';
import { content as previous } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';
import { createReviewSeeds } from '../scripts/companion-dialogue-review-seeds.js';

const source = await readFile(new URL('../docs/companion-dialogue-source-20261030.md', import.meta.url), 'utf8');
const act = (r, type, args = {}, pack = content) => engine.transition(r, { type, ...args }, pack);
function read(r, pack = content) {
  for (let n = 0; engine.getCurrentText(r, pack); n++) {
    assert.ok(n < 200); r = act(r, 'ACK_TEXT', {}, pack);
  }
  return r;
}
function start(party, commanderId, pack = content) {
  let r = read(engine.createRun(pack), pack);
  r = act(r, 'SELECT_COMMANDER', { commanderId }, pack);
  for (const characterId of party) r = act(r, 'TOGGLE_PARTY', { characterId }, pack);
  return read(act(act(r, 'CONFIRM_PARTY', {}, pack), 'DEPART', {}, pack), pack);
}
const choose = (r, letter, pack = content) => act(r, 'RESOLVE_TRIAL', { trialId: r.position.trialId, choiceId: `choice.${r.position.trialId}.${letter}` }, pack);
const next = (r, pack = content) => read(act(read(r, pack), 'CONTINUE_TRIAL', {}, pack), pack);
const targets = Object.keys(content.conversations).filter(id => /^conversation\.(alba|hexerei|anchoring)\./.test(id));

// Independent parser: scope by city/trial headers, then use only ### dialogue bodies.
test('26 titles, all 130 paragraphs and speaker assignments match the approved source; 78 old speeches are byte-identical', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), '696d413fb5628ed3a48771595be94665cf97620c816851626126b9e5869d9a9e');
  const names = Object.fromEntries(Object.values(old.characters).map(c => [c.name, c.id]));
  const cities = ['アルバ', 'ヘクセレイ', 'アンカリング'];
  const keys = ['alba', 'hexerei', 'anchoring'];
  const seen = [];
  let paragraphs = 0, speeches = 0, narrations = 0;
  for (const [i, city] of cities.entries()) {
    const cityText = source.split(`\n# ${city}\n`)[1].split(/\n# /)[0];
    const trials = cityText.split(/\n## /).slice(1);
    assert.equal(trials.length, 3);
    for (const [j, section] of trials.entries()) {
      const trial = ['small1', 'small2', 'major'][j];
      const dialogues = [...section.matchAll(/^### (.+)「(.+)」\n\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
      for (const [, actor, title, body] of dialogues) {
        const id = `conversation.${keys[i]}.${trial}.${names[actor].slice(5)}`;
        const c = content.conversations[id], before = old.conversations[id];
        const lines = body.replace(/\n---[\s\S]*$/, '').trim().split('\n\n');
        assert.equal(c.title, title); assert.equal(c.presentation, 'manuscript');
        const blocks = c.blockIds.map(id => content.textBlocks[id]);
        assert.deepEqual(blocks.map(b => b.text), lines);
        assert.deepEqual(blocks.filter(b => b.speakerId).map(b => b.text), before.blockIds.map(id => old.textBlocks[id].text));
        for (const b of blocks) {
          const speech = b.text.startsWith('「') && b.text.endsWith('」');
          assert.equal(b.speakerId, speech ? names[actor] : null);
          speech ? speeches++ : narrations++; paragraphs++;
        }
        const {title: _title, presentation: _presentation, blockIds: _blocks, ...unchanged} = c;
        const {blockIds: _oldBlocks, ...oldUnchanged} = before;
        assert.deepEqual(unchanged, oldUnchanged); seen.push(id);
      }
    }
    assert.equal(seen.filter(id => id.startsWith(`conversation.${keys[i]}.`)).length, [10,8,8][i]);
  }
  assert.deepEqual(seen.sort(), targets.sort());
  assert.equal(paragraphs,130); assert.equal(speeches,78); assert.equal(narrations,52);
});

test('the new edition changes only contentVersion, the 26 presentation fields and 52 new narration blocks', () => {
  assert.equal(contentForRun(engine.createRun(content)), content);
  assert.notEqual(defaultContent.contentVersion, content.contentVersion);
  const restored = structuredClone(content);
  restored.contentVersion = old.contentVersion;
  for (const id of targets) restored.conversations[id] = structuredClone(old.conversations[id]);
  const added = Object.keys(content.textBlocks).filter(id => !old.textBlocks[id]);
  assert.equal(added.length,52);
  for (const id of added) { assert.equal(content.textBlocks[id].speakerId,null); delete restored.textBlocks[id]; }
  // Includes all 15 trials, choices, D conditions, memos, Theo, gates, old blocks,
  // all Rude/Ehrenfels conversations, scores/tags and completion settings.
  assert.deepEqual(restored, old);
});

test('three review parties reach exactly all 26 conversations using ordinary completion and memo rules', () => {
  const seen = new Set();
  for (let r of Object.values(createReviewSeeds())) {
    assert.equal(Object.keys(r.trialResults).length,0);
    for (const letter of 'aab') {
      for (const c of engine.getAvailableConversations(r,content)) {
        const before = r;
        r=act(r,'OPEN_CONVERSATION',{conversationId:c.id});
        assert.deepEqual(r.acquiredInformation,before.acquiredInformation);
        assert.deepEqual(r.heardConversationIds,before.heardConversationIds);
        r=read(r);
        assert.ok(r.heardConversationIds.includes(c.id));
        for(const id of c.informationIdsOnComplete) assert.equal(r.acquiredInformation[id].sources.length,1);
        assert.equal(engine.getTotalScore(r),engine.getTotalScore(before));
        assert.deepEqual(r.trialResults,before.trialResults);
        assert.deepEqual(engine.getAvailableChoices(r,content),engine.getAvailableChoices(r,old)); seen.add(c.id);
      }
      r=next(choose(r,letter));
    }
  }
  assert.deepEqual([...seen].sort(),targets.sort());
});

function permutations(rows) { return rows.length ? rows.flatMap((r,i)=>permutations(rows.filter((_,j)=>i!==j)).map(rest=>[r,...rest])) : [[]]; }
const actors = Object.keys(content.characters), parties = [];
for(let a=0;a<5;a++) for(let b=a+1;b<6;b++) for(let c=b+1;c<7;c++) for(let d=c+1;d<8;d++) parties.push([actors[a],actors[b],actors[c],actors[d]]);
const routes = {alba:['baa','acb'],hexerei:['cbc','aab'],anchoring:['abc','bab'],rude:['bac','acb'],ehrenfels:['cbc','baa']};

test('new edition: 70 parties × 2 commanders × 24 city orders × min/max = 6720 complete five-city routes', () => {
  assert.equal(parties.length,70);
  let completions=0, validations=0, conversations=0;
  for(const party of parties) for(const commander of Object.keys(content.commanders)) for(const order of permutations(['alba','hexerei','anchoring','rude'])) for(const high of [0,1]) {
    let r=start(party,commander), used=0;
    const schedule=new Set([completions%5,(completions%5+2)%5]);
    for(const [city,regionId] of [...order,'ehrenfels'].entries()) {
      if(city<4) assert.throws(()=>act(r,'START_REGION',{regionId:'ehrenfels'}),/まだ解放/);
      r=read(act(r,'START_REGION',{regionId}));
      for(const [i,letter] of [...routes[regionId][high]].entries()) {
        const trialId=r.position.trialId;
        if(high) for(const c of engine.getAvailableConversations(r,content)) {
          const before=r;
          r=act(r,'OPEN_CONVERSATION',{conversationId:c.id});
          assert.deepEqual(r.acquiredInformation,before.acquiredInformation);
          r=read(r); conversations++;
          assert.equal(engine.getTotalScore(r),engine.getTotalScore(before));
        }
        if(regionId==='alba' && i===1) {
          const hasD=engine.getAvailableChoices(r,content).some(c=>c.id.endsWith('.d'));
          assert.equal(hasD,!!(high && party.includes('char.lisette')));
        }
        const choices=engine.getAvailableChoices(r,content), score=engine.getTotalScore(r);
        if(i===2) {
          assert.equal(engine.canUseTheo(r,content),used<2);
          if(schedule.has(city)) { r=act(r,'REQUEST_THEO'); assert.deepEqual(act(r,'REQUEST_THEO'),r); r=read(r); used++; }
          assert.deepEqual(engine.getAvailableChoices(r,content),choices); assert.equal(engine.getTotalScore(r),score);
        }
        r=choose(r,letter); assert.deepEqual(choose(r,letter),r);
        assert.deepEqual(r.trialResults[trialId].governanceTags,old.trials[trialId].choices.find(c=>c.id.endsWith(`.${letter}`)).governanceTags || []);
        r=next(r);
      }
      assert.equal(r.chapterProgress[regionId].status,'completed');
      assert.equal(r.position.phase,'map');
      engine.validateRun(JSON.parse(JSON.stringify(r)),contentForRun(r)); validations++;
    }
    assert.equal(engine.getTotalScore(r),high?100:67);
    assert.equal(engine.getTheoRemaining(r),0); assert.deepEqual(r.visitOrder,order);
    assert.equal(Object.keys(r.trialResults).length,15);
    assert.equal(r.endingSnapshot,undefined); assert.equal(r.completionKey,undefined); assert.deepEqual(r.storyEvents,{}); completions++;
  }
  assert.equal(completions,6720); assert.equal(validations,33600); assert.equal(conversations,68880);
});

test('all seven historical editions save/load without changing scores, results, dialogue, memos, read keys, Theo or progress', async () => {
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await storage.open();
  const party=['char.harold','char.frederica','char.lisette','char.sandro'];
  let accumulatedKeys=[];
  for(const pack of [legacy,previous,alba,hexerei,anchoring,rude,old,content]) {
    let r=read(act(start(party,'commander.rosemond',pack),'START_REGION',{regionId:'alba'},pack),pack);
    for(const letter of 'aa') r=next(choose(r,letter,pack),pack);
    r=read(act(r,'REQUEST_THEO',{},pack),pack);
    const readKeys=[];
    for(const c of engine.getAvailableConversations(r,pack)) {
      r=act(r,'OPEN_CONVERSATION',{conversationId:c.id},pack);
      while(engine.getCurrentText(r,pack)) {
        readKeys.push(engine.getCurrentText(r,pack).readKey); r=act(r,'ACK_TEXT',{},pack);
      }
    }
    await storage.commitAuto(r,{expectedRevision:await storage.getRevision(),readTextKeys:readKeys});
    await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()});
    for(const slot of ['auto','manual1']) {
      const restored=(await storage.getSlot(slot)).run;
      assert.deepEqual(restored,r); assert.equal(contentForRun(restored),pack); engine.validateRun(restored,pack);
      assert.equal(engine.getTheoRemaining(restored),1);
    }
    accumulatedKeys=[...new Set([...accumulatedKeys,...readKeys])].sort();
    assert.deepEqual((await storage.getReaderProfile()).readTextKeys.sort(),accumulatedKeys);
  }
});

test('an old save inside a three-paragraph conversation resumes the old paragraph and keeps its reader history', async () => {
  const storage=createStorage({indexedDB:new MemoryIndexedDB(),validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await storage.open();
  let r=start(['char.harold','char.frederica','char.lisette','char.sandro'],'commander.alphonse',old);
  r=read(act(r,'START_REGION',{regionId:'alba'},old),old);
  r=act(r,'OPEN_CONVERSATION',{conversationId:'conversation.alba.small1.harold'},old);
  const key=engine.getCurrentText(r,old).readKey;
  r=act(r,'ACK_TEXT',{},old);
  await storage.commitAuto(r,{expectedRevision:await storage.getRevision(),readTextKeys:[key]});
  const restored=(await storage.getSlot('auto')).run, pack=contentForRun(restored);
  assert.equal(pack,old); assert.deepEqual(restored,r);
  assert.equal(engine.getCurrentText(restored,pack).text,old.textBlocks['text.alba.small1.harold.2'].text);
  assert.equal(pack.conversations['conversation.alba.small1.harold'].blockIds.length,3);
  assert.deepEqual((await storage.getReaderProfile()).readTextKeys,[key]);
  // Speech read keys survive, but new narration has never been read.
  const newRun=act(createReviewSeeds().alba,'OPEN_CONVERSATION',{conversationId:'conversation.alba.small1.harold'});
  assert.ok(!(await storage.getReaderProfile()).readTextKeys.includes(engine.getCurrentText(newRun,content).readKey));
});
