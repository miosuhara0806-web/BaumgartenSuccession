import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content } from '../src/content/ehrenfels.js';
import { content as rude } from '../src/content/rude.js';
import { content as anchoring } from '../src/content/anchoring.js';
import { createHash } from 'node:crypto';
import { ehrenfelsManuscript as manuscript } from '../src/content/ehrenfels-manuscript.js';
import { content as hexerei } from '../src/content/hexerei.js';
import { content as alba } from '../src/content/alba-final.js';
import { content as previous } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = await readFile(new URL('../docs/ehrenfels-source-20261025.md', import.meta.url), 'utf8');
const appSource = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const party = ['char.heidemarie', 'char.frederica', 'char.harold', 'char.lisette'];
const targets = [['char.heidemarie', 'char.frederica'], ['char.harold', 'char.heidemarie', 'char.lisette'], ['char.harold', 'char.heidemarie', 'char.madian']];
const expectedTags = { a: ['fairness', 'coordination'], b: ['people', 'reform'], c: ['stability', 'fairness'] };
const act = (r, type, args = {}, pack = content) => engine.transition(r, { type, ...args }, pack);
function read(r, pack = content) { for (let i = 0; engine.getCurrentText(r, pack); i++) { assert.ok(i < 200); r = act(r, 'ACK_TEXT', {}, pack); } return r; }
function start(members = party, commanderId = 'commander.alphonse', pack = content) {
  let r = read(engine.createRun(pack), pack);
  r = act(r, 'SELECT_COMMANDER', { commanderId }, pack);
  for (const characterId of members) r = act(r, 'TOGGLE_PARTY', { characterId }, pack);
  return read(act(act(r, 'CONFIRM_PARTY', {}, pack), 'DEPART', {}, pack), pack);
}
const capitalBases = new Map();
const routes = { alba: ['baa','acb'], hexerei: ['cbc','aab'], anchoring: ['abc','bab'], rude: ['bac','acb'], ehrenfels: ['cbc','baa'] };
function finishCity(r, regionId, letters) {
  r=read(act(r,'START_REGION',{regionId}));
  for (const letter of letters) r=next(choose(r,letter));
  return r;
}
function enter(members = party, commanderId = 'commander.alphonse') {
  const key=JSON.stringify([members,commanderId]);
  if (!capitalBases.has(key)) {
    let r=start(members,commanderId);
    for (const regionId of Object.keys(routes).slice(0,4)) r=finishCity(r,regionId,routes[regionId][0]);
    capitalBases.set(key,r);
  }
  return read(act(capitalBases.get(key),'START_REGION',{regionId:'ehrenfels'}));
}
const capitalScore = r => Object.entries(r.trialResults).filter(([id])=>id.startsWith('ehrenfels.')).reduce((s,[,r])=>s+r.awardedPoints,0);
const capitalMemos = r => Object.keys(r.acquiredInformation).filter(id=>id.startsWith('info.ehrenfels.'));
const choose = (r, letter, pack = content) => act(r, 'RESOLVE_TRIAL', { trialId: r.position.trialId, choiceId: `choice.${r.position.trialId}.${letter}` }, pack);
const next = (r, pack = content) => read(act(read(r, pack), 'CONTINUE_TRIAL', {}, pack), pack);
const major = () => next(choose(next(choose(enter(), 'b')), 'a'));
async function harness(snapshot, readTextKeys = []) {
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: r => engine.validateRun(r, contentForRun(r)) });
  await storage.open(); const saved = await storage.commitAuto(snapshot, { expectedRevision: await storage.getRevision(), readTextKeys });
  const dom = { addEventListener() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent: content, contentForRun, ...engine, createStorage: () => storage, structuredClone,
    document: dom, window: { scrollTo() {} }, CSS: { escape: s => s }, setTimeout: () => 0, clearTimeout() {} });
  new vm.Script(appSource + `
    render=()=>{};
    globalThis.api={ initialize(state,rev,profile){run=state;content=contentForRun(state);revision=rev;slotsRevision=rev;reader=profile;ready=true;title=false;},
    state(){return structuredClone({run,reader,pending:!!pending});},handle,perform,load,openSaves,trialPage,mapPage,memoBody,logModal,startNew };
  `).runInContext(context);
  context.api.initialize(snapshot, saved.revision, saved.readerProfile);
  return { app: context.api, storage };
}

// Explicit heading boundaries keep editorial notes out of the playable manuscript.
function originalSection(n) {
  const start = source.indexOf(`### ${n}．`);
  const rest = source.slice(source.indexOf('\n', start) + 1);
  return rest.split(/\n### |\n## /)[0].trim();
}
function sourceRows(n) { return [...originalSection(n).matchAll(/^#### ([^\n]*)\n([\s\S]*?)(?=^#### |$(?![\s\S]))/gm)]; }
function stripProvenance(text) { return text.trim().split('\n\n').filter(p => !/^(出典|会話出典|メモ出典|メモ名)：/.test(p)).join('\n\n'); }
const normalize = text => text.replaceAll('【主人公】', '{commander}');

test('historical five-city review edition resolves unchanged; all 57 prose fields match the final source verbatim', () => {
  assert.equal(contentForRun({contentVersion: content.contentVersion}),content);
  assert.equal(contentForRun(engine.createRun(content)), content);
  assert.equal(Object.values(content.information).filter(i => i.regionId === 'ehrenfels').length, 18);
  const hashes = ['f17eb91af25d026e7207df8ddad50cb39aaf4295faf661b783aa6ef2c4758f94', 'f8242115bd97c7ea6a65d0b42b521ad43341efeaf21bd5e51561bb3537652b5f', 'fe3e2a56328fc212bcf62299b7cf6e6e729ce1efdab34eaf8d5e391d4a037b80'];
  const expectedPoints = [[4,5,3],[5,3,4],[10,9,8]];
  let verified = 0;
  for (const [i, row] of manuscript.trials.entries()) {
    const n = i + 4, id = `ehrenfels.${row.key}`, trial = content.trials[id];
    const introduction = stripProvenance(originalSection(`${n}.1`));
    assert.equal(createHash('sha256').update(introduction).digest('hex'), hashes[i]);
    assert.equal(row.introduction, introduction);
    assert.equal(content.textBlocks[`text.${id}.introduction`].text, normalize(introduction)); verified++;
    const choices = sourceRows(`${n}.2`), results = sourceRows(`${n}.3`), memos = sourceRows(`${n}.5`);
    assert.equal(choices.length, 3); assert.equal(results.length, 3); assert.equal(memos.length, 3);
    for (const [j, choice] of trial.choices.entries()) {
      const letter = 'abc'[j], policy = stripProvenance(choices[j][2]).split('\n\n');
      assert.equal(choice.label, `${letter.toUpperCase()}：${policy.shift()}`);
      assert.equal(choice.description, policy.join('\n\n'));
      assert.equal(choice.points, expectedPoints[i][j]);
      assert.equal(choice.condition, undefined);
      assert.deepEqual(choice.governanceTags, i === 2 ? expectedTags[letter] : []); verified++;
      let reaction = results[j][2].split('**結果文章【原文】**\n\n')[1].split('\n\n**評価理由【原文】**')[0];
      assert.equal(content.textBlocks[choice.feedbackBlockIds[0]].text, normalize(reaction)); verified++;
      assert.equal(choice.evaluationReason, results[j][2].split('**評価理由【原文】**\n\n')[1].trim()); verified++;
      const memo = content.information[`info.${id}.result.${letter}`];
      assert.equal(memo.title, memos[j][1].split('／')[1]);
      assert.equal(memo.summary, stripProvenance(memos[j][2])); verified++;
    }
    const conversations = sourceRows(`${n}.4`);
    assert.equal(conversations.length, row.conversations.length);
    for (const [j, dialogue] of row.conversations.entries()) {
      const conversation = content.conversations[`conversation.${id}.${dialogue.actor}`];
      const original = conversations[j][2].split('**会話本文【原文】**\n\n')[1].split('\n\n**対応する取得メモ【原文】**')[0];
      assert.equal(dialogue.lines.join('\n\n'), original);
      assert.equal(conversation.blockIds.map(b => content.textBlocks[b].text).join('\n\n'), original);
      assert.ok(conversation.blockIds.length > 3);
      assert.equal(conversation.title, conversations[j][1].split('／')[1]);
      for (const blockId of conversation.blockIds) {
        const block = content.textBlocks[blockId];
        assert.equal(block.speakerId, block.text.startsWith('「') ? `char.${dialogue.actor}` : null);
      }
      verified++;
      const memoSource = conversations[j][2].split('**対応する取得メモ【原文】**\n\n')[1];
      const memo = content.information[conversation.informationIdsOnComplete[0]];
      assert.equal(memo.summary, stripProvenance(memoSource));
      assert.equal(memo.title, memoSource.match(/^メモ名：(.+)$/m)[1]); verified++;
    }
  }
  const theo = originalSection('6.6'), investigation = content.investigations['investigation.ehrenfels'];
  assert.equal(investigation.title, '王城へ届かない報告');
  assert.equal(content.textBlocks[investigation.reportBlockIds[0]].text, theo.split('**報告本文【原文】**\n\n')[1].split('\n\n**取得メモ【原文】**')[0]); verified++;
  assert.equal(content.information['info.ehrenfels.theo'].title, '報告からこぼれる情報');
  assert.equal(content.information['info.ehrenfels.theo'].summary, stripProvenance(theo.split('**取得メモ【原文】**\n\n')[1])); verified++;
  assert.equal(verified, 57);
  assert.match(manuscript.trials[1].choices[0].reaction,/遠い地区/);
  assert.doesNotMatch(JSON.stringify(manuscript),/森側の地区|編集注：|出典：/);
  assert.equal(createHash('sha256').update(source).digest('hex'),'86097b749a41c4aa329de2fa4c7272afc84c381b52a68eb5cf5ba7c7ac987d7a');
});


test('27 ABC routes give 14–20, exactly three selected route memos, and stop at the review map', () => {
  const scores=new Set();
  for(const a of 'abc') for(const b of 'abc') for(const c of 'abc') {
    let r=enter();
    for(const letter of [a,b,c]) {
      const id=r.position.trialId;
      assert.equal(engine.getAvailableChoices(r,content).length,3);
      r=choose(r,letter); assert.deepEqual(choose(r,letter),r);
      assert.equal(r.acquiredInformation[`info.${id}.result.${letter}`],undefined);
      r=read(r); assert.ok(r.acquiredInformation[`info.${id}.result.${letter}`]);
      for(const other of 'abc') if(other!==letter) assert.equal(r.acquiredInformation[`info.${id}.result.${other}`],undefined);
      r=next(r);
    }
    scores.add(capitalScore(r)); assert.equal(capitalMemos(r).length,3);
    assert.equal(r.position.phase,'map'); assert.equal(r.chapterProgress.ehrenfels.status,'completed');
    assert.equal(r.endingSnapshot,undefined); assert.equal(r.completionKey,undefined); assert.deepEqual(r.storyEvents,{});
    assert.equal(engine.validateRun(JSON.parse(JSON.stringify(r)),contentForRun(r)),true);
    const forged=structuredClone(r); forged.position={phase:'ending'};
    assert.throws(()=>engine.validateRun(forged,content),/正式終幕は未実装/);
  }
  assert.deepEqual([...scores].sort((a,b)=>a-b),[14,15,16,17,18,19,20]);
});

const ids=Object.keys(content.characters), parties=[];
for(let a=0;a<5;a++) for(let b=a+1;b<6;b++) for(let c=b+1;c<7;c++) for(let d=c+1;d<8;d++) parties.push([ids[a],ids[b],ids[c],ids[d]]);
function permutations(rows) { return rows.length ? rows.flatMap((r,i)=>permutations(rows.filter((_,j)=>i!==j)).map(rest=>[r,...rest])) : [[]]; }

test('70 parties × both commanders retain free ABC, exact conversation conditions and policy tags', () => {
  assert.equal(parties.length,70);
  for(const members of parties) for(const commander of Object.keys(content.commanders)) {
    for(const [letters,score] of [['cbc',14],['baa',20],['acb',17]]) {
      let r=enter(members,commander), memos=0;
      for(const [i,letter] of [...letters].entries()) {
        assert.equal(capitalMemos(r).length,memos);
        assert.equal(engine.getAvailableChoices(r,content).length,3);
        assert.deepEqual(engine.getAvailableConversations(r,content).map(c=>c.participantIds[0]), targets[i].filter(id=>members.includes(id)));
        if(letters==='baa') for(const conversation of engine.getAvailableConversations(r,content)) {
          const info=conversation.informationIdsOnComplete[0],before=engine.getTotalScore(r);
          r=act(r,'OPEN_CONVERSATION',{conversationId:conversation.id});
          assert.equal(r.acquiredInformation[info],undefined); assert.ok(!r.heardConversationIds.includes(conversation.id));
          r=read(r); memos++; assert.ok(r.acquiredInformation[info]); assert.equal(engine.getTotalScore(r),before);
        }
        assert.equal(engine.canUseTheo(r,content),i===2);
        r=next(choose(r,letter)); memos++;
      }
      assert.equal(capitalScore(r),score); assert.equal(capitalMemos(r).length,memos);
      const result=r.trialResults['ehrenfels.major']; assert.deepEqual(result.governanceTags,expectedTags[letters[2]]);
      assert.equal(engine.getTheoRemaining(r),2); assert.equal(r.position.phase,'map');
    }
  }
});

test('70 parties × both commanders × 24 normal-city orders × min/max = 6720 five-city regressions', () => {
  let completions=0,conversations=0,validations=0;
  for(const members of parties) for(const commander of Object.keys(content.commanders)) for(const order of permutations(['alba','hexerei','anchoring','rude'])) for(const high of [0,1]) {
    let r=start(members,commander);
    // Vary the two investigated cities, covering all 10 city pairs including the capital.
    const schedule=new Set([completions%5,(completions%5+2)%5]);
    let used=0;
    for(const [city,regionId] of [...order,'ehrenfels'].entries()) {
      if(city<4) assert.throws(()=>act(r,'START_REGION',{regionId:'ehrenfels'}),/まだ解放/);
      r=read(act(r,'START_REGION',{regionId}));
      for(const [i,letter] of [...routes[regionId][high]].entries()) {
        if(high) for(const conversation of engine.getAvailableConversations(r,content)) {
          r=read(act(r,'OPEN_CONVERSATION',{conversationId:conversation.id})); conversations++;
        }
        const choices=engine.getAvailableChoices(r,content),score=engine.getTotalScore(r);
        assert.ok(choices.length>=3);
        if(i===2) {
          assert.equal(engine.canUseTheo(r,content),used<2);
          if(schedule.has(city)) {r=act(r,'REQUEST_THEO'); assert.deepEqual(act(r,'REQUEST_THEO'),r); r=read(r); used++;}
          assert.deepEqual(engine.getAvailableChoices(r,content),choices); assert.equal(engine.getTotalScore(r),score);
        }
        r=choose(r,letter); assert.deepEqual(choose(r,letter),r); r=next(r);
      }
      const restored=JSON.parse(JSON.stringify(r)); engine.validateRun(restored,contentForRun(restored)); validations++;
      assert.equal(r.position.phase,'map');
    }
    assert.equal(engine.getTotalScore(r),high?100:67); assert.equal(capitalScore(r),high?20:14);
    assert.equal(engine.getTheoRemaining(r),0); assert.deepEqual(r.visitOrder,order);
    assert.equal(Object.keys(r.trialResults).length,15); assert.equal(r.chapterProgress.ehrenfels.status,'completed');
    assert.equal(r.endingSnapshot,undefined); assert.equal(r.completionKey,undefined); assert.deepEqual(r.storyEvents,{}); completions++;
  }
  assert.equal(completions,6720); assert.equal(validations,33600); assert.equal(conversations,68880);
});

test('all 8 full conversations confirm atomically; open/log grant nothing; load preserves global reading separately', async () => {
  for(const members of [party,['char.heidemarie','char.frederica','char.harold','char.madian']]) {
    let r=enter(members);
    for(const letter of 'baa') {
      for(const conversation of engine.getAvailableConversations(r,content)) {
        const info=conversation.informationIdsOnComplete[0], {app,storage}=await harness(r);
        await app.handle('save-slot','manual1'); await app.handle('conversation',conversation.id);
        const unconfirmed=app.state().run;
        assert.equal(unconfirmed.acquiredInformation[info],undefined);
        const html=app.trialPage(); assert.match(html,/manuscript-text/); assert.ok(html.includes(conversation.title));
        for(const blockId of conversation.blockIds) {
          const block=content.textBlocks[blockId]; assert.ok(html.includes(block.text));
          assert.equal(block.speakerId,block.text.startsWith('「')?conversation.participantIds[0]:null);
        }
        const commit=storage.commitAuto; let attempts=0;
        storage.commitAuto=(...args)=>++attempts===1?Promise.reject(new Error('injected save failure')):commit(...args);
        await app.handle('ack-conversation'); assert.equal(app.state().pending,true);
        assert.deepEqual(JSON.parse(JSON.stringify((await storage.getSlot('auto')).run)),JSON.parse(JSON.stringify(unconfirmed)));
        assert.equal((await storage.getReaderProfile()).readTextKeys.length,0);
        await app.handle('retry'); assert.equal(attempts,2);
        assert.ok(app.state().run.acquiredInformation[info]); assert.ok(app.state().run.heardConversationIds.includes(conversation.id));
        assert.equal(app.state().reader.readTextKeys.length,conversation.blockIds.length);
        assert.equal(engine.getTotalScore(app.state().run),engine.getTotalScore(r));
        for(const blockId of conversation.blockIds) assert.ok(app.logModal().body.includes(content.textBlocks[blockId].text));
        assert.ok(app.logModal().body.includes('地の文'));
        await app.openSaves(); await app.load('manual1');
        assert.equal(app.state().run.acquiredInformation[info],undefined);
        const before=app.state(); app.logModal(); app.memoBody(); assert.deepEqual(app.state(),before);
        await app.handle('conversation',conversation.id); await app.handle('skip');
        assert.equal(app.state().run.acquiredInformation[info].sources.length,1);
      }
      r=next(choose(r,letter));
    }
  }
});

test('all 9 results and evaluation reasons render verbatim and grant only the confirmed route memo', async () => {
  for(const commander of Object.keys(content.commanders)) {
    let r=enter(party,commander);
    for(const row of manuscript.trials) {
      for(const choice of row.choices) {
        const {app}=await harness(r),trialId=r.position.trialId;
        await app.perform({type:'RESOLVE_TRIAL',trialId,choiceId:`choice.${trialId}.${choice.letter}`});
        const html=app.trialPage(); assert.ok(html.includes(choice.reaction.replaceAll('【主人公】',content.commanders[commander].name))); assert.ok(html.includes(choice.evaluationReason));
        assert.equal(app.state().run.acquiredInformation[`info.${trialId}.result.${choice.letter}`],undefined);
        await app.handle('ack'); assert.ok(app.state().run.acquiredInformation[`info.${trialId}.result.${choice.letter}`]);
      }
      r=next(choose(r,'b'));
    }
  }
});

test('Theo cancellation, full report, save/resume, rereading and shared uses preserve points and choices', async () => {
  const {app,storage}=await harness(major()); await app.handle('save-slot','manual1');
  const before=app.state().run,score=engine.getTotalScore(before),choices=engine.getAvailableChoices(before,content);
  await app.handle('theo'); await app.handle('cancel-confirm'); assert.deepEqual(app.state().run,before);
  await app.perform({type:'REQUEST_THEO'}); const reported=app.state().run;
  assert.equal(engine.getCurrentText(reported,content).text,manuscript.theo.report);
  assert.equal(engine.getTheoRemaining(reported),1); assert.ok(reported.acquiredInformation['info.ehrenfels.theo']);
  assert.ok(app.trialPage().includes('王城へ届かない報告')); assert.ok(app.memoBody().includes(manuscript.theo.summary));
  await app.openSaves(); await app.load('auto'); await app.handle('ack');
  assert.equal(engine.canUseTheo(app.state().run,content),false);
  assert.deepEqual(engine.getAvailableChoices(app.state().run,content),choices); assert.equal(engine.getTotalScore(app.state().run),score);
  const confirmed=app.state(); app.logModal(); app.memoBody(); assert.deepEqual(app.state(),confirmed);
  await app.openSaves(); await app.load('manual1'); assert.equal(engine.getTheoRemaining(app.state().run),2);
  assert.equal(app.state().run.acquiredInformation['info.ehrenfels.theo'],undefined);
  assert.deepEqual(await storage.listChronicles(),[]);
});

test('all six old editions restore unchanged, including Rude scores, memos, reading, Theo and progress', async () => {
  const {app,storage}=await harness(enter());
  for(const pack of [rude,anchoring,hexerei,alba,previous,legacy]) {
    let r=start(['char.harold','char.frederica','char.lisette','char.sandro'],'commander.alphonse',pack);
    const regionId=pack===rude?'rude':'alba'; r=read(act(r,'START_REGION',{regionId},pack),pack);
    for(const letter of 'aa') r=next(choose(r,letter,pack),pack);
    r=read(act(r,'REQUEST_THEO',{},pack),pack);
    for(const conversation of engine.getAvailableConversations(r,pack)) r=read(act(r,'OPEN_CONVERSATION',{conversationId:conversation.id},pack),pack);
    await storage.saveManual('manual1',r,{expectedRevision:await storage.getRevision()}); await app.openSaves(); await app.load('manual1');
    assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)),r); assert.equal(contentForRun(r),pack);
    assert.equal(pack.regions.ehrenfels.implemented,false); assert.equal(engine.getTheoRemaining(app.state().run),1);
  }
  for(const dictionary of ['trials','scenes','textBlocks','conversations','information','investigations']) {
    for(const [id,row] of Object.entries(rude[dictionary])) if(id.includes('alba')||id.includes('hexerei')||id.includes('anchoring')||id.includes('rude')) assert.deepEqual(content[dictionary][id],row);
  }
  for(const region of ['alba','hexerei','anchoring','rude']) assert.deepEqual(content.regions[region],rude.regions[region]);
  assert.deepEqual(content.characters,rude.characters); assert.deepEqual(content.commanders,rude.commanders); assert.deepEqual(content.storyEvents,{});
  assert.equal(content.endingSceneId,undefined); assert.equal(content.mode,'full'); assert.equal(content.finalChapterCompletion,'map');
});

test('capital completion remains saveable, announces the pending ending, and cannot register a chronicle', async () => {
  let r=enter(); for(const letter of 'baa') r=next(choose(r,letter));
  const {app,storage}=await harness(r); assert.ok(app.mapPage().includes(content.completionNotice));
  await app.handle('save-slot','manual3'); await app.openSaves(); await app.load('manual3');
  assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)),r); assert.equal(engine.canManualSave(r),true);
  assert.deepEqual(await storage.listChronicles(),[]);
  const reviewedStorage=createStorage({indexedDB:new MemoryIndexedDB(),contentStatus:'reviewed',validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await reviewedStorage.open();
  await assert.rejects(reviewedStorage.recordCompletion(r,{contentStatus:'reviewed'},{expectedRevision:await reviewedStorage.getRevision()}));
  assert.deepEqual(await reviewedStorage.listChronicles(),[]);
});
