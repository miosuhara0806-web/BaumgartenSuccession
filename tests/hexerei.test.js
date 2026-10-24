import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content } from '../src/content/hexerei.js';
import { contentForRun } from '../src/content/catalog.js';
import { content as alba } from '../src/content/alba-final.js';
import { content as previous } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { hexereiManuscript as manuscript } from '../src/content/hexerei-manuscript.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = await readFile(new URL('../docs/hexerei-source-20261022.md', import.meta.url), 'utf8');
const appSource = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const party = ['char.frederica', 'char.vantalt', 'char.sandro', 'char.heidemarie'];
const targets = [['char.frederica', 'char.vantalt'], ['char.vantalt', 'char.sandro', 'char.heidemarie'], ['char.frederica', 'char.vantalt', 'char.sandro']];
const expectedTags = { a: ['reform', 'fairness'], b: ['stability', 'coordination'], c: ['people', 'coordination'] };
const act = (r, type, args = {}, pack = content) => engine.transition(r, { type, ...args }, pack);
function read(r, pack = content) {
  for (let guard = 0; engine.getCurrentText(r, pack); guard++) {
    assert.ok(guard < 200);
    r = act(r, 'ACK_TEXT', {}, pack);
  }
  return r;
}
function start(members = party, commanderId = 'commander.alphonse', pack = content) {
  let r = read(engine.createRun(pack), pack);
  r = act(r, 'SELECT_COMMANDER', { commanderId }, pack);
  for (const characterId of members) r = act(r, 'TOGGLE_PARTY', { characterId }, pack);
  return read(act(act(r, 'CONFIRM_PARTY', {}, pack), 'DEPART', {}, pack), pack);
}
const enter = (members = party, commander = 'commander.alphonse') => read(act(start(members, commander), 'START_REGION', { regionId: 'hexerei' }));
const choose = (r, letter, pack = content) => act(r, 'RESOLVE_TRIAL', { trialId: r.position.trialId, choiceId: `choice.${r.position.trialId}.${letter}` }, pack);
const next = (r, pack = content) => read(act(read(r, pack), 'CONTINUE_TRIAL', {}, pack), pack);
const major = () => next(choose(next(choose(enter(), 'a')), 'a'));
async function harness(snapshot, readTextKeys = []) {
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: r => engine.validateRun(r, contentForRun(r)) });
  await storage.open();
  const saved = await storage.commitAuto(snapshot, { expectedRevision: await storage.getRevision(), readTextKeys });
  const dom = { addEventListener() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent: content, contentForRun, ...engine, createStorage: () => storage,
    structuredClone, document: dom, window: { scrollTo() {} }, CSS: { escape: s => s }, setTimeout: () => 0, clearTimeout() {} });
  new vm.Script(appSource + `
    render=()=>{};
    globalThis.api={
      initialize(state,rev,profile){run=state;content=contentForRun(state);revision=rev;slotsRevision=rev;reader=profile;ready=true;title=false;},
      state(){return structuredClone({run,reader,pending:!!pending});},
      handle,perform,load,openSaves,trialPage,mapPage,memoBody,introductionModal,logModal,startNew,
    };
  `).runInContext(context);
  context.api.initialize(snapshot, saved.revision, saved.readerProfile);
  return { app: context.api, storage };
}

test('all supplied novels, choices, results, reasons, conversations and memos match the source verbatim', () => {
  assert.equal(content.contentVersion, 'alba-hexerei-2026-10-22');
  assert.equal(contentForRun(engine.createRun(content)), content);
  assert.equal(content.mode, 'regionalPreview');
  assert.deepEqual(content.storyEvents, {});
  assert.equal(Object.values(content.information).filter(i => i.regionId === 'hexerei').length, 18);
  const sections = [2, 3, 4].map(n => source.split(`## ${n}. `)[1].split(`## ${n + 1}. `)[0]);
  const normalize = s => s.replaceAll('【主人公】', '{commander}');
  for (let i = 0; i < 3; i++) {
    const section = sections[i], row = manuscript.trials[i], trial = content.trials[`hexerei.${row.key}`];
    const novel = section.match(/```text\n([\s\S]*?)\n```/)[1];
    assert.equal(row.introduction, novel);
    const scene = content.scenes[trial.introductionSceneId];
    assert.equal(scene.presentation, 'novel');
    assert.equal(content.textBlocks[scene.blocks[0]].text, normalize(novel));
    assert.deepEqual(trial.choices.map(c => c.points), [[5, 4, 2], [5, 3, 4], [9, 10, 8]][i]);
    const choices = [...section.matchAll(/- \*\*([ABC])／(\d+)点\*\*：([^\n]+)/g)];
    const results = [...section.matchAll(/#### ([ABC])：[^\n]+\n\n\*\*選択後の反応\*\*\n\n([\s\S]*?)\n\n\*\*評価理由\*\*\n\n([\s\S]*?)(?=\n#### |\n### )/g)];
    assert.equal(choices.length, 3); assert.equal(results.length, 3);
    trial.choices.forEach((choice, index) => {
      assert.equal(choice.label, `${choices[index][1]}：${choices[index][3]}`);
      assert.equal(choice.condition, undefined);
      assert.equal(content.textBlocks[choice.feedbackBlockIds[0]].text, normalize(results[index][2].trim()));
      assert.equal(choice.evaluationReason, results[index][3].trim());
      assert.deepEqual(choice.governanceTags, i === 2 ? expectedTags[results[index][1].toLowerCase()] : []);
    });
    const dialogue = section.split('### 同行者会話（それぞれ3段落・1枠）\n\n')[1].split('\n### 共通情報メモ')[0];
    for (const [index, match] of [...dialogue.matchAll(/#### ([^\n]+)\n\n([\s\S]*?)(?=\n#### |$)/g)].entries()) {
      const conversation = content.conversations[content.scenes[trial.decisionSceneId].conversationIds[index]];
      assert.equal(content.characters[conversation.participantIds[0]].name, match[1]);
      assert.equal(conversation.blockIds.length, 3);
      assert.equal(conversation.blockIds.map(id => content.textBlocks[id].text).join('\n\n'), match[2].trim());
    }
    const common = section.split('### 共通情報メモ（導入読了で3件取得）\n\n')[1].split('\n### 同行者固有メモ')[0];
    const memos = [...common.matchAll(/\*\*[①②③] ([^*]+)\*\*\n\n([\s\S]*?)(?=\n\*\*|$)/g)];
    assert.equal(memos.length, 3);
    for (const [index, m] of memos.entries()) {
      const memo = content.information[`info.${trial.id}.common.${index + 1}`];
      assert.equal(memo.title, m[1]); assert.equal(memo.summary, m[2].trim());
    }
    const privateSection = section.split('### 同行者固有メモ（当該会話確認で取得）\n\n')[1].split('\n### ')[0].split('\n> ')[0].split('\n---')[0];
    const privateMemos = [...privateSection.matchAll(/\*\*([^*]+)の見解\*\*[^\n]+\n\n([\s\S]*?)(?=\n\*\*|$)/g)];
    assert.equal(privateMemos.length, targets[i].length);
    for (const m of privateMemos) {
      const memo = Object.values(content.information).find(info => info.trialId === trial.id && info.title === `${m[1]}の見解`);
      assert.equal(memo.summary, m[2].trim());
      assert.equal(content.characters[memo.sourceActorId].name, m[1]);
    }
  }
  const theo = sections[2].split('**調査報告**\n\n')[1].split('\n\n**テオ取得情報メモ**')[0];
  assert.equal(content.textBlocks['text.hexerei.theo.report'].text, theo);
  assert.equal(content.information['info.hexerei.theo'].sourceLabel, 'テオ／研究施設の内部審査記録');
  assert.equal(content.information['info.hexerei.theo'].summary, sections[2].split('（分類：テオの調査／出典：テオ／研究施設の内部審査記録）\n\n')[1].split('\n\n**テオは')[0]);
});

test('70 parties × 2 commanders × 3 routes cover all nine choices and every conversation/memo condition', () => {
  const ids = Object.keys(content.characters), parties = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 8; d++) parties.push([ids[a], ids[b], ids[c], ids[d]]);
  assert.equal(parties.length, 70);
  let completed = 0;
  for (const commander of Object.keys(content.commanders)) for (const members of parties) {
    assert.equal(engine.getOpponentParty(start(members, commander), content).length, 4);
    for (const [letters, total, listen] of [[['a', 'a', 'b'], 20, true], [['c', 'b', 'c'], 13, false], [['b', 'c', 'a'], 17, false]]) {
      let r = enter(members, commander), memoCount = 0;
      for (let i = 0; i < 3; i++) {
        memoCount += 3;
        assert.equal(Object.keys(r.acquiredInformation).length, memoCount);
        assert.deepEqual(engine.getAvailableConversations(r, content).map(c => c.participantIds[0]), targets[i].filter(id => members.includes(id)));
        const choices = engine.getAvailableChoices(r, content).map(c => c.id);
        assert.equal(choices.length, 3);
        if (listen) for (const conversation of engine.getAvailableConversations(r, content).reverse()) {
          const beforeScore = engine.getTotalScore(r), infoId = conversation.informationIdsOnComplete[0];
          r = act(r, 'OPEN_CONVERSATION', { conversationId: conversation.id });
          assert.equal(r.acquiredInformation[infoId], undefined);
          r = read(r); memoCount++;
          assert.equal(engine.getTotalScore(r), beforeScore);
          assert.equal(r.acquiredInformation[infoId].sources[0].id, conversation.id);
          assert.deepEqual(engine.getAvailableChoices(r, content).map(c => c.id), choices);
        }
        assert.equal(engine.canUseTheo(r, content), i === 2);
        const decision = r;
        r = choose(r, letters[i]);
        assert.deepEqual(choose(r, letters[i]), r);
        assert.equal(engine.getTotalScore(r) - engine.getTotalScore(decision), content.trials[r.position.trialId].choices.find(c => c.id.endsWith(`.${letters[i]}`)).points);
        engine.validateRun(JSON.parse(JSON.stringify(r)), content);
        r = next(r);
      }
      assert.equal(r.chapterProgress.hexerei.status, 'completed');
      assert.equal(r.position.phase, 'map'); assert.equal(engine.getTotalScore(r), total);
      assert.equal(Object.keys(r.acquiredInformation).length, memoCount);
      assert.equal(engine.getTheoRemaining(r), 2);
      assert.deepEqual(r.trialResults['hexerei.major'].governanceTags, expectedTags[letters[2]]);
      const counts = engine.getGovernance(r, content).counts;
      for (const tag of engine.GOVERNANCE_TAGS) assert.equal(counts[tag], expectedTags[letters[2]].includes(tag) ? 1 : 0);
      completed++;
    }
  }
  assert.equal(completed, 420);
});

test('Alba and Hexerei share exactly two Theo uses in either visit order; combined score may reach 40 without an ending', () => {
  for (const order of [['alba', 'hexerei'], ['hexerei', 'alba']]) {
    let r = start();
    for (const [index, regionId] of order.entries()) {
      r = read(act(r, 'START_REGION', { regionId }));
      const letters = regionId === 'alba' ? ['a', 'c', 'b'] : ['a', 'a', 'b'];
      for (let i = 0; i < 3; i++) {
        if (i === 2) {
          const choices = engine.getAvailableChoices(r, content), score = engine.getTotalScore(r);
          const report = act(r, 'REQUEST_THEO');
          assert.equal(engine.getTheoRemaining(report), 1 - index);
          assert.deepEqual(act(report, 'REQUEST_THEO'), report);
          engine.validateRun(JSON.parse(JSON.stringify(report)), content);
          r = read(report);
          assert.equal(engine.getTotalScore(r), score);
          assert.equal(engine.canUseTheo(r, content), false);
          assert.deepEqual(engine.getAvailableChoices(r, content), choices);
          assert.deepEqual(act(r, 'REQUEST_THEO'), r);
        }
        r = next(choose(r, letters[i]));
      }
    }
    assert.equal(engine.getTotalScore(r), 40);
    assert.equal(engine.getTheoRemaining(r), 0);
    assert.equal(r.position.phase, 'map');
    assert.equal(Object.keys(r.trialResults).length, 6);
    assert.equal(r.endingSnapshot, undefined);
    assert.equal(content.regions.ehrenfels.implemented, false);
    assert.deepEqual(engine.getGovernance(r, content).counts, { people: 0, reform: 1, stability: 1, coordination: 1, fairness: 1 });
  }
});

test('grouped novel confirmation grants exactly three local facts atomically; viewing and failed saves grant nothing in storage', async () => {
  const before = act(start(), 'START_REGION', { regionId: 'hexerei' });
  const { app, storage } = await harness(before);
  const snapshot = app.state();
  assert.match(app.trialPage(), /novel-text/);
  assert.doesNotMatch(app.trialPage(), /10月16日版|【主人公】/);
  assert.ok(app.trialPage().includes('アルフォンスたち一行'));
  app.introductionModal('hexerei.major'); assert.deepEqual(app.state(), snapshot);
  const commit = storage.commitAuto;
  let attempts = 0;
  storage.commitAuto = (...args) => ++attempts === 1 ? Promise.reject(new Error('injected save failure')) : commit(...args);
  await app.handle('ack-introduction');
  assert.equal(app.state().pending, true);
  assert.deepEqual((await storage.getSlot('auto')).run, before);
  await app.handle('retry');
  assert.equal(attempts, 2);
  assert.equal(Object.keys(app.state().run.acquiredInformation).length, 3);
  assert.equal(app.state().reader.readTextKeys.length, 1);
  assert.equal((await storage.getSlot('auto')).run.position.stage, 'decision');
});

test('all eight grouped UI confirmations give private memos once; source, score and rollback stay correct', async () => {
  let r = enter();
  for (const letter of ['a', 'a', 'b']) {
    for (const conversation of engine.getAvailableConversations(r, content)) {
      const memoId = conversation.informationIdsOnComplete[0], memo = content.information[memoId];
      const { app, storage } = await harness(r);
      await app.handle('save-slot', 'manual1');
      await app.handle('conversation', conversation.id);
      assert.equal(app.state().run.acquiredInformation[memoId], undefined);
      assert.equal(app.state().run.heardConversationIds.includes(conversation.id), false);
      const html = app.trialPage();
      assert.match(html, /conversation-text/); assert.doesNotMatch(html, /<p>「|」<\/p>/);
      for (const id of conversation.blockIds) assert.ok(html.includes(content.textBlocks[id].text.slice(1, -1)));
      assert.equal((await storage.getSlot('auto')).run.position.phase, 'conversation');
      await app.handle('ack-conversation');
      const confirmed = app.state();
      assert.equal(confirmed.run.acquiredInformation[memoId].sources.length, 1);
      assert.equal(confirmed.reader.readTextKeys.length, 3);
      assert.equal(engine.getTotalScore(confirmed.run), engine.getTotalScore(r));
      assert.ok(app.memoBody().includes(memo.summary)); assert.match(app.memoBody(), /同行者の見解/);
      assert.ok(app.memoBody().includes(`出典：${content.characters[memo.sourceActorId].name}`));
      assert.doesNotMatch(app.trialPage(), new RegExp(`data-id="${conversation.id}"`));
      await app.handle('save-slot', 'manual2');
      await app.openSaves(); await app.load('manual1');
      assert.equal(app.state().run.acquiredInformation[memoId], undefined);
      assert.equal(app.state().reader.readTextKeys.length, 3);
      app.logModal(); assert.equal(app.state().run.acquiredInformation[memoId], undefined);
      await app.handle('conversation', conversation.id); await app.handle('skip');
      assert.equal(app.state().run.acquiredInformation[memoId].sources.length, 1);
      await app.openSaves(); await app.load('manual2');
      assert.equal(app.state().run.acquiredInformation[memoId].sources.length, 1);
    }
    r = next(choose(r, letter));
  }
});

test('result UI uses all nine supplied reactions/reasons and small2 has its explicit incident-response heading', async () => {
  let r = enter();
  for (const row of manuscript.trials) {
    const { app } = await harness(r);
    if (row.key === 'small2') assert.match(app.trialPage(), /事故現場への指示/);
    for (const choice of row.choices) {
      const { app } = await harness(r);
      await app.perform({ type: 'RESOLVE_TRIAL', trialId: r.position.trialId, choiceId: `choice.${r.position.trialId}.${choice.letter}` });
      const html = app.trialPage();
      assert.ok(html.includes(choice.reaction.replaceAll('【主人公】', 'アルフォンス')));
      assert.ok(html.includes(choice.evaluationReason));
      assert.doesNotMatch(html, /data-feedback-pending|【主人公】|fairness|coordination/);
    }
    r = next(choose(r, 'a'));
  }
});

test('new-run reset preserves global reading and manual saves, without granting previous-run memos', async () => {
  const r = enter(), conversationId = 'conversation.hexerei.small1.frederica';
  const confirmed = read(act(r, 'OPEN_CONVERSATION', { conversationId }));
  const readKeys = confirmed.recentDialogueLog.filter(entry => entry.textId.startsWith('text.hexerei.small1.frederica.')).map(entry => entry.readKey);
  assert.equal(readKeys.length, 3);
  const { app, storage } = await harness(confirmed, readKeys);
  await app.handle('save-slot', 'manual1');
  const keys = app.state().reader.readTextKeys;
  await app.openSaves(); await app.startNew();
  assert.deepEqual(Array.from(app.state().reader.readTextKeys), Array.from(keys));
  assert.equal(Object.keys(app.state().run.acquiredInformation).length, 0);
  assert.equal(app.state().run.heardConversationIds.length, 0);
  assert.ok((await storage.getSlot('manual1')).run.acquiredInformation['info.hexerei.small1.frederica']);
  while (engine.getCurrentText(app.state().run, content)) await app.perform({ type: 'ACK_TEXT' });
  await app.perform({ type: 'SELECT_COMMANDER', commanderId: 'commander.alphonse' });
  for (const characterId of party) await app.perform({ type: 'TOGGLE_PARTY', characterId });
  await app.perform({ type: 'CONFIRM_PARTY' }); await app.perform({ type: 'DEPART' });
  while (engine.getCurrentText(app.state().run, content)) await app.perform({ type: 'ACK_TEXT' });
  await app.perform({ type: 'START_REGION', regionId: 'hexerei' }); await app.handle('ack-introduction');
  app.introductionModal('hexerei.small1'); app.logModal();
  assert.equal(app.state().run.acquiredInformation['info.hexerei.small1.frederica'], undefined);
  assert.ok(engine.getAvailableConversations(app.state().run, content).some(c => c.id === conversationId));
  await app.handle('conversation', conversationId); await app.handle('skip');
  assert.ok(app.state().run.acquiredInformation['info.hexerei.small1.frederica']);
});

test('all three old content versions load unchanged and Alba data/read keys remain identical in new runs', async () => {
  const { app, storage } = await harness(enter());
  for (const pack of [alba, previous, legacy]) {
    let r = read(act(start(['char.harold', 'char.frederica', 'char.lisette', 'char.sandro'], 'commander.alphonse', pack), 'START_REGION', { regionId: 'alba' }, pack), pack);
    r = choose(r, 'a', pack);
    await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() });
    await app.openSaves(); await app.load('manual1');
    assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)), r);
    assert.equal(contentForRun(r), pack);
    assert.deepEqual(engine.getCurrentText(app.state().run, pack), engine.getCurrentText(r, pack));
  }
  for (const dictionary of ['trials', 'textBlocks', 'scenes', 'conversations', 'information', 'investigations']) {
    for (const [id, value] of Object.entries(alba[dictionary])) if (id.includes('alba')) assert.deepEqual(content[dictionary][id], value);
  }
  assert.deepEqual(content.regions.alba, alba.regions.alba);
  assert.deepEqual(content.characters, alba.characters);
  assert.deepEqual(content.commanders, alba.commanders);
  assert.deepEqual(content.scenes[content.departureSceneId], alba.scenes[alba.departureSceneId]);
});

test('Theo report is persisted at its start and remains once-only across reload and manual rollback', async () => {
  const r = major(), { app, storage } = await harness(r);
  await app.handle('save-slot', 'manual1');
  await app.perform({ type: 'REQUEST_THEO' });
  const report = app.state().run;
  assert.equal(report.position.phase, 'theoReport');
  assert.equal(report.position.blockIndex, 0);
  assert.ok(report.acquiredInformation['info.hexerei.theo']);
  assert.match(app.memoBody(), /テオの調査/);
  assert.ok(app.memoBody().includes(manuscript.theo.summary));
  assert.deepEqual((await storage.getSlot('auto')).run, JSON.parse(JSON.stringify(report)));
  await app.openSaves(); await app.load('auto');
  assert.equal(engine.getTheoRemaining(app.state().run), 1);
  await app.handle('ack');
  assert.equal(engine.canUseTheo(app.state().run, content), false);
  assert.equal(engine.getAvailableChoices(app.state().run, content).length, 3);
  await app.openSaves(); await app.load('manual1');
  assert.equal(engine.getTheoRemaining(app.state().run), 2);
  assert.equal(app.state().run.acquiredInformation['info.hexerei.theo'], undefined);
});
