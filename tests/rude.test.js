import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content } from '../src/content/rude.js';
import { content as anchoring } from '../src/content/anchoring.js';
import { createHash } from 'node:crypto';
import { rudeManuscript as manuscript } from '../src/content/rude-manuscript.js';
import { content as hexerei } from '../src/content/hexerei.js';
import { content as alba } from '../src/content/alba-final.js';
import { content as previous } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = await readFile(new URL('../docs/rude-source-20261025.md', import.meta.url), 'utf8');
const appSource = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const party = ['char.madian', 'char.olivel', 'char.sandro', 'char.lisette'];
const targets = [['char.sandro', 'char.olivel'], ['char.olivel', 'char.madian'], ['char.olivel', 'char.lisette', 'char.madian']];
const expectedTags = { a: ['people', 'stability'], b: ['coordination', 'fairness'], c: ['reform', 'stability'] };
const act = (r, type, args = {}, pack = content) => engine.transition(r, { type, ...args }, pack);
function read(r, pack = content) { for (let i = 0; engine.getCurrentText(r, pack); i++) { assert.ok(i < 200); r = act(r, 'ACK_TEXT', {}, pack); } return r; }
function start(members = party, commanderId = 'commander.alphonse', pack = content) {
  let r = read(engine.createRun(pack), pack);
  r = act(r, 'SELECT_COMMANDER', { commanderId }, pack);
  for (const characterId of members) r = act(r, 'TOGGLE_PARTY', { characterId }, pack);
  return read(act(act(r, 'CONFIRM_PARTY', {}, pack), 'DEPART', {}, pack), pack);
}
const enter = (members = party, commanderId = 'commander.alphonse') => read(act(start(members, commanderId), 'START_REGION', { regionId: 'rude' }));
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
    state(){return structuredClone({run,reader,pending:!!pending});},handle,perform,load,openSaves,trialPage,memoBody,logModal,startNew };
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

test('saved Rude runs retain the four-city edition; all 55 prose fields match the supplied source with only the approved edits', () => {
  assert.equal(contentForRun(engine.createRun(content)), content);
  assert.equal(Object.values(content.information).filter(i => i.regionId === 'rude').length, 17);
  const hashes = ['eabba110fc5f09fa7f91fe9a61ca94bc97249fb77a16bd2d2fa197179bb02df7', '2673f327f4dc9421c697c487748ca839b85d5e8ec6189bb1795ff358143e82e0', '7d09e65c7d483120c71ef3725edc002329f19c72f13ab77bd37907101086887a'];
  const expectedPoints = [[5,3,4],[3,4,5],[9,10,8]];
  let verified = 0;
  for (const [i, row] of manuscript.trials.entries()) {
    const n = i + 4, id = `rude.${row.key}`, trial = content.trials[id];
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
      if (i === 2 && j === 2) reaction = reaction.replace('自然保護についても、王国共通の規則を適用することになった。', '自然保護についても、王国共通の規則を適用する方針を、現王に提言した。');
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
      assert.equal(memo.title, i === 0 ? ['薬の使い分けと管理', '森の知恵と外来薬'][j] : memoSource.match(/^メモ名：(.+)$/m)[1]); verified++;
    }
  }
  const theo = originalSection('6.6'), investigation = content.investigations['investigation.rude'];
  assert.equal(investigation.title, '森の取り決め、その外側で');
  assert.equal(content.textBlocks[investigation.reportBlockIds[0]].text, theo.split('**報告本文【原文】**\n\n')[1].split('\n\n**取得メモ【原文】**')[0]); verified++;
  assert.equal(content.information['info.rude.theo'].title, '森の外から生まれる圧力');
  assert.equal(content.information['info.rude.theo'].summary, stripProvenance(theo.split('**取得メモ【原文】**\n\n')[1])); verified++;
  assert.equal(verified, 55);
});

test('all 27 normal routes reach exactly 14–20 with no gated choices or extra D', () => {
  const scores = new Set();
  for (const a of 'abc') for (const b of 'abc') for (const c of 'abc') {
    let r = enter();
    for (const letter of [a,b,c]) { assert.equal(engine.getAvailableChoices(r,content).length,3); r=next(choose(r,letter)); }
    scores.add(engine.getTotalScore(r));
  }
  assert.deepEqual([...scores].sort((a,b)=>a-b), [14,15,16,17,18,19,20]);
});

test('all 70 parties × 2 commanders × 3 routes finish at 14/20/17, with route-only memos and conditional opinions', () => {
  const ids = Object.keys(content.characters), parties = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 8; d++) parties.push([ids[a], ids[b], ids[c], ids[d]]);
  assert.equal(parties.length, 70);
  for (const members of parties) for (const commander of Object.keys(content.commanders)) {
    for (const [letters, score, listen] of [[['b', 'a', 'c'], 14, false], [['a', 'c', 'b'], 20, true], [['c', 'b', 'a'], 17, false]]) {
      let r = enter(members, commander), memoCount = 0;
      for (let i = 0; i < 3; i++) {
        const trialId = r.position.trialId;
        assert.equal(Object.keys(r.acquiredInformation).length, memoCount);
        assert.equal(engine.getAvailableChoices(r, content).length, 3);
        assert.deepEqual(engine.getAvailableConversations(r, content).map(c => c.participantIds[0]), targets[i].filter(id => members.includes(id)));
        if (listen) for (const conversation of engine.getAvailableConversations(r, content).reverse()) {
          const before = engine.getTotalScore(r), infoId = conversation.informationIdsOnComplete[0];
          r = act(r, 'OPEN_CONVERSATION', { conversationId: conversation.id }); assert.equal(r.acquiredInformation[infoId], undefined);
          r = read(r); memoCount++; assert.ok(r.acquiredInformation[infoId]); assert.equal(engine.getTotalScore(r), before);
        }
        assert.equal(engine.canUseTheo(r, content), i === 2);
        r = choose(r, letters[i]); assert.deepEqual(choose(r, letters[i]), r);
        assert.equal(r.acquiredInformation[`info.${trialId}.result.${letters[i]}`], undefined);
        r = read(r); memoCount++;
        assert.ok(r.acquiredInformation[`info.${trialId}.result.${letters[i]}`]);
        for (const other of ['a', 'b', 'c'].filter(l => l !== letters[i])) assert.equal(r.acquiredInformation[`info.${trialId}.result.${other}`], undefined);
        engine.validateRun(JSON.parse(JSON.stringify(r)), content); r = next(r);
      }
      assert.equal(engine.getTotalScore(r), score); assert.equal(r.position.phase, 'map'); assert.equal(r.chapterProgress.rude.status, 'completed');
      assert.equal(Object.keys(r.acquiredInformation).length, memoCount); assert.equal(engine.getTheoRemaining(r), 2);
      const counts = engine.getGovernance(r, content).counts;
      for (const tag of engine.GOVERNANCE_TAGS) assert.equal(counts[tag], expectedTags[letters[2]].includes(tag) ? 1 : 0);
    }
  }
});

function permutations(rows) { return rows.length ? rows.flatMap((r,i) => permutations(rows.filter((_,j)=>i!==j)).map(rest=>[r,...rest])) : [[]]; }
const ids = Object.keys(content.characters), parties = [];
for (let a=0;a<5;a++) for (let b=a+1;b<6;b++) for (let c=b+1;c<7;c++) for (let d=c+1;d<8;d++) parties.push([ids[a],ids[b],ids[c],ids[d]]);

test('70 parties × both commanders × 24 four-city orders × min/max = 6720 complete regressions preserve shared Theo, old cities and saves', () => {
  const routes = {
    alba: ['baa', 'acb'], hexerei: ['cbc', 'aab'], anchoring: ['abc', 'bab'], rude: ['bac', 'acb'],
  };
  let completions=0, conversations=0, validations=0;
  for (const members of parties) for (const commander of Object.keys(content.commanders)) for (const order of permutations(Object.keys(routes))) for (const high of [0,1]) {
    let r=start(members,commander);
    for (const [city, regionId] of order.entries()) {
      r=read(act(r,'START_REGION',{regionId}));
      for (const [i,letter] of [...routes[regionId][high]].entries()) {
        // Include all available conversations in the max route; min requires none.
        if (high) for (const conversation of engine.getAvailableConversations(r,content)) {
          r=read(act(r,'OPEN_CONVERSATION',{conversationId:conversation.id})); conversations++;
        }
        const choices=engine.getAvailableChoices(r,content), score=engine.getTotalScore(r);
        assert.ok(choices.length>=3);
        if (i===2) {
          assert.equal(engine.canUseTheo(r,content),city<2);
          if (city<2) { r=act(r,'REQUEST_THEO'); assert.deepEqual(act(r,'REQUEST_THEO'),r); r=read(r); assert.equal(engine.canUseTheo(r,content),false); }
          assert.deepEqual(engine.getAvailableChoices(r,content),choices); assert.equal(engine.getTotalScore(r),score);
        }
        r=choose(r,letter); assert.deepEqual(choose(r,letter),r); r=next(r);
      }
      const restored=JSON.parse(JSON.stringify(r)); engine.validateRun(restored,contentForRun(restored)); validations++;
    }
    assert.equal(engine.getTotalScore(r), high?80:53); assert.equal(engine.getTheoRemaining(r),0);
    assert.equal(r.position.phase,'map'); assert.equal(Object.keys(r.trialResults).length,12);
    assert.equal(content.regions.ehrenfels.implemented,false);
    assert.throws(()=>act(r,'START_REGION',{regionId:'ehrenfels'}));
    assert.equal(r.endingSnapshot,undefined); assert.deepEqual(r.storyEvents,{}); completions++;
  }
  assert.equal(completions,6720); assert.equal(validations,26880); assert.equal(conversations,55440);
});

test('all seven full-text grouped confirmations grant only their private memo, and rollback keeps global reading separate', async () => {
  let r = enter();
  for (const letter of ['b', 'a', 'b']) {
    for (const conversation of engine.getAvailableConversations(r, content)) {
      const infoId = conversation.informationIdsOnComplete[0], { app } = await harness(r);
      await app.handle('save-slot', 'manual1'); await app.handle('conversation', conversation.id);
      assert.equal(app.state().run.acquiredInformation[infoId], undefined);
      assert.match(app.trialPage(), /conversation-text/); assert.ok(app.trialPage().includes(conversation.title));
      await app.handle('ack-conversation'); assert.ok(app.state().run.acquiredInformation[infoId]);
      assert.equal(app.state().reader.readTextKeys.length, conversation.blockIds.length); assert.equal(engine.getTotalScore(app.state().run), engine.getTotalScore(r));
      await app.handle('save-slot', 'manual2'); await app.openSaves(); await app.load('manual1');
      assert.equal(app.state().run.acquiredInformation[infoId], undefined); app.logModal(); assert.equal(app.state().run.acquiredInformation[infoId], undefined);
      await app.handle('conversation', conversation.id); await app.handle('skip'); assert.equal(app.state().run.acquiredInformation[infoId].sources.length, 1);
      await app.openSaves(); await app.load('manual2'); assert.ok(app.state().run.acquiredInformation[infoId]);
    }
    r = next(choose(r, letter));
  }
});

test('route memo acknowledgement retries atomically, and choosing a different saved route never grants the other memo', async () => {
  const { app, storage } = await harness(enter()); await app.handle('save-slot', 'manual1');
  await app.perform({ type: 'RESOLVE_TRIAL', trialId: 'rude.small1', choiceId: 'choice.rude.small1.b' });
  assert.equal(app.state().run.acquiredInformation['info.rude.small1.result.b'], undefined);
  const commit = storage.commitAuto; let attempts = 0;
  storage.commitAuto = (...args) => ++attempts === 1 ? Promise.reject(new Error('injected save failure')) : commit(...args);
  await app.handle('ack'); assert.equal(app.state().pending, true);
  assert.equal((await storage.getSlot('auto')).run.acquiredInformation['info.rude.small1.result.b'], undefined);
  await app.handle('retry'); assert.equal(attempts, 2); assert.ok(app.state().run.acquiredInformation['info.rude.small1.result.b']);
  assert.equal(engine.getTotalScore(app.state().run), 3);
  await app.openSaves(); await app.load('manual1');
  await app.perform({ type: 'RESOLVE_TRIAL', trialId: 'rude.small1', choiceId: 'choice.rude.small1.a' }); await app.handle('ack');
  assert.ok(app.state().run.acquiredInformation['info.rude.small1.result.a']); assert.equal(app.state().run.acquiredInformation['info.rude.small1.result.b'], undefined);
  assert.equal(engine.getTotalScore(app.state().run), 5);
});

test('Theo uses the full adopted forest-pressure report, persists once, and rollback restores its shared use', async () => {
  const { app, storage } = await harness(major()); await app.handle('save-slot', 'manual1');
  await app.handle('theo'); await app.handle('cancel-confirm'); assert.equal(engine.getTheoRemaining(app.state().run), 2);
  await app.perform({ type: 'REQUEST_THEO' }); const r = app.state().run;
  assert.equal(r.position.phase, 'theoReport'); assert.equal(engine.getTheoRemaining(r), 1);
  assert.ok(app.memoBody().includes(manuscript.theo.summary)); assert.equal(engine.getCurrentText(r, content).text, manuscript.theo.report);
  assert.deepEqual((await storage.getSlot('auto')).run, JSON.parse(JSON.stringify(r)));
  await app.openSaves(); await app.load('auto'); await app.handle('ack');
  assert.equal(engine.canUseTheo(app.state().run, content), false); assert.equal(engine.getAvailableChoices(app.state().run, content).length, 3);
  await app.openSaves(); await app.load('manual1'); assert.equal(engine.getTheoRemaining(app.state().run), 2);
  assert.equal(app.state().run.acquiredInformation['info.rude.theo'], undefined);
});

test('all five old content versions load unchanged, and all three earlier cities and their data is preserved in the extension', async () => {
  const { app, storage } = await harness(enter());
  for (const pack of [anchoring, hexerei, alba, previous, legacy]) {
    let r = read(act(start(['char.harold', 'char.frederica', 'char.lisette', 'char.sandro'], 'commander.alphonse', pack), 'START_REGION', { regionId: 'alba' }, pack), pack); r = choose(r, 'a', pack);
    await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() }); await app.openSaves(); await app.load('manual1');
    assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)), r); assert.equal(contentForRun(r), pack);
  }
  for (const dictionary of ['trials', 'scenes', 'textBlocks', 'conversations', 'information', 'investigations']) {
    for (const [id, row] of Object.entries(anchoring[dictionary])) if (id.includes('alba') || id.includes('hexerei') || id.includes('anchoring')) assert.deepEqual(content[dictionary][id], row);
  }
  assert.deepEqual(content.characters, anchoring.characters); assert.deepEqual(content.commanders, anchoring.commanders);
  assert.deepEqual(content.regions.anchoring, anchoring.regions.anchoring);
  assert.deepEqual(content.regions.ehrenfels, anchoring.regions.ehrenfels);
  assert.deepEqual(content.storyEvents, anchoring.storyEvents);
  assert.equal(content.mode, 'regionalPreview');
  assert.deepEqual(content.regions.alba, hexerei.regions.alba); assert.deepEqual(content.regions.hexerei, hexerei.regions.hexerei);
});

test('the approved novels render continuously with commander substitution, and read confirmation grants no route memo', async () => {
  for (const commander of Object.keys(content.commanders)) {
    const r = act(start(party, commander), 'START_REGION', { regionId: 'rude' });
    const { app } = await harness(r), before = app.state();
    const html = app.trialPage(); assert.match(html, /novel-text/); assert.doesNotMatch(html, /【主人公】/);
    assert.ok(html.includes(`${content.commanders[commander].name}たち一行`));
    // Modal/log views have no acknowledgement or memo side effect.
    app.logModal(); assert.deepEqual(app.state(), before);
    await app.handle('ack-introduction');
    assert.equal(app.state().run.position.stage, 'decision'); assert.equal(Object.keys(app.state().run.acquiredInformation).length, 0);
    assert.equal(app.state().reader.readTextKeys.length, 1); assert.equal(engine.getTotalScore(app.state().run), 0);
  }
});

test('all nine result screens show the exact adopted prose and evaluation and grant their route memo on confirmation', async () => {
  let r = enter();
  for (const row of manuscript.trials) {
    for (const choice of row.choices) {
      const { app } = await harness(r);
      await app.perform({ type: 'RESOLVE_TRIAL', trialId: r.position.trialId, choiceId: `choice.${r.position.trialId}.${choice.letter}` });
      const html = app.trialPage(); assert.ok(html.includes(choice.reaction.replaceAll('【主人公】', content.commanders[r.commanderId].name))); assert.ok(html.includes(choice.evaluationReason));
      assert.doesNotMatch(html, /data-feedback-pending|正式原稿待ち|仮評価/);
      const memo = `info.${r.position.trialId}.result.${choice.letter}`;
      assert.equal(app.state().run.acquiredInformation[memo], undefined); await app.handle('ack'); assert.ok(app.state().run.acquiredInformation[memo]);
    }
    r = next(choose(r, 'b'));
  }
});

test('a full conversation confirms all paragraphs and its memo in one retryable transaction', async () => {
  const before = enter(), conversation = engine.getAvailableConversations(before,content).find(c=>c.participantIds[0]==='char.olivel');
  const { app,storage } = await harness(before), infoId=conversation.informationIdsOnComplete[0];
  await app.handle('conversation',conversation.id);
  const savedBefore=(await storage.getSlot('auto')).run;
  assert.equal(savedBefore.acquiredInformation[infoId],undefined);
  assert.equal((await storage.getReaderProfile()).readTextKeys.length,0);
  const commit=storage.commitAuto; let attempts=0;
  storage.commitAuto=(...args)=>++attempts===1?Promise.reject(new Error('injected grouped save failure')):commit(...args);
  await app.handle('ack-conversation');
  assert.equal(app.state().pending,true);
  assert.deepEqual((await storage.getSlot('auto')).run,savedBefore);
  assert.equal((await storage.getReaderProfile()).readTextKeys.length,0);
  await app.handle('retry');
  assert.equal(attempts,2);
  assert.equal(app.state().run.position.stage,'decision');
  assert.equal(app.state().run.acquiredInformation[infoId].sources.length,1);
  assert.equal((await storage.getReaderProfile()).readTextKeys.length,conversation.blockIds.length);
  assert.equal(engine.getTotalScore(app.state().run),0);
});

test('a partially read conversation cannot skip its unread tail, and the narrative-first speaker and paragraph labels stay intact', async () => {
  const base=enter(), conversation=content.conversations['conversation.rude.small1.olivel'];
  let r=act(base,'OPEN_CONVERSATION',{conversationId:conversation.id});
  const first=engine.getCurrentText(r,content);
  assert.equal(first.speakerId,null);
  r=act(r,'ACK_TEXT');
  const {app}=await harness(r,[first.readKey]);
  const html=app.trialPage();
  assert.ok(html.includes('<div class="speaker">オリヴェル</div>'));
  assert.ok(html.includes('aria-label="地の文"'));
  assert.ok(html.includes('aria-label="オリヴェルの台詞"'));
  const before=app.state(); await app.handle('skip'); assert.deepEqual(app.state(),before);
  await app.handle('ack-conversation');
  assert.equal(app.state().reader.readTextKeys.length,conversation.blockIds.length);
  for(const blockId of conversation.blockIds) assert.ok(app.logModal().body.includes(content.textBlocks[blockId].text));
  assert.ok(app.logModal().body.includes('地の文'));
});
