import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content, createAnchoringContent } from '../src/content/anchoring.js';
import { anchoringIntroductions as introductions } from '../src/content/anchoring-introductions.js';
import { anchoringManuscript as manuscript } from '../src/content/anchoring-manuscript.js';
import { content as hexerei } from '../src/content/hexerei.js';
import { content as alba } from '../src/content/alba-final.js';
import { content as previous } from '../src/content/alba.js';
import { content as legacy } from '../src/content/legacy.js';
import { contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = await readFile(new URL('../docs/anchoring-source-20261024.md', import.meta.url), 'utf8');
const novelSource = await readFile(new URL('../docs/anchoring-introductions-source-20261024.md', import.meta.url), 'utf8');
const appSource = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const party = ['char.madian', 'char.olivel', 'char.sandro', 'char.vantalt'];
const targets = [['char.olivel', 'char.madian'], ['char.madian', 'char.olivel', 'char.sandro'], ['char.madian', 'char.sandro', 'char.vantalt']];
const expectedTags = { a: ['stability', 'reform'], b: ['reform', 'fairness'], c: ['coordination', 'people'] };
const act = (r, type, args = {}, pack = content) => engine.transition(r, { type, ...args }, pack);
function read(r, pack = content) { for (let i = 0; engine.getCurrentText(r, pack); i++) { assert.ok(i < 200); r = act(r, 'ACK_TEXT', {}, pack); } return r; }
function start(members = party, commanderId = 'commander.alphonse', pack = content) {
  let r = read(engine.createRun(pack), pack);
  r = act(r, 'SELECT_COMMANDER', { commanderId }, pack);
  for (const characterId of members) r = act(r, 'TOGGLE_PARTY', { characterId }, pack);
  return read(act(act(r, 'CONFIRM_PARTY', {}, pack), 'DEPART', {}, pack), pack);
}
const enter = (members = party, commanderId = 'commander.alphonse') => read(act(start(members, commanderId), 'START_REGION', { regionId: 'anchoring' }));
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

test('all nine choices/results/reasons, eight revised conversations, eighteen memos and Theo match the supplied source', () => {
  assert.equal(Object.values(content.information).filter(i => i.regionId === 'anchoring').length, 18);
  for (const row of manuscript.trials) {
    const section = source.split(`# ${row.title}\n`)[1].split('\n---')[0];
    const trial = content.trials[`anchoring.${row.key}`];
    const choices = [...section.matchAll(/^([ABC])（(\d+)点）([^\n]+)/gm)];
    assert.equal(choices.length, 3);
    const results = [...section.matchAll(/## 結果・評価 ([ABC])\n### 結果文章\n([\s\S]*?)\n\n### 評価理由\n([\s\S]*?)(?=\n## 結果・評価 |\n## 同行者会話)/g)];
    assert.equal(results.length, 3);
    for (let i = 0; i < 3; i++) {
      const choice = trial.choices[i];
      assert.equal(choice.label, `${choices[i][1]}：${choices[i][3].split('タグ：')[0].trim()}`);
      assert.equal(choice.points, Number(choices[i][2]));
      assert.equal(content.textBlocks[choice.feedbackBlockIds[0]].text, results[i][2].trim());
      assert.equal(choice.evaluationReason, results[i][3].trim());
      assert.equal(choice.condition, undefined);
      assert.deepEqual(choice.governanceTags, row.key === 'major' ? expectedTags[choices[i][1].toLowerCase()] : []);
    }
    for (const conversation of row.conversations) {
      const name = content.characters[`char.${conversation.actor}`].name;
      const lines = section.split('## 同行者会話')[1].split(`### ${name}`)[1].split('\n').slice(1).join('\n').split('\n### ')[0].split('\n## 情報メモ')[0].trim();
      assert.equal(conversation.lines.join('\n\n'), lines);
      assert.equal(conversation.lines.length, 3);
    }
    const memoSection = section.split('## 情報メモ')[1].split('\n## テオ報告')[0];
    const memos = [...memoSection.matchAll(/^([^「\n]+)「([^」]+)」：([^\n]+)/gm)];
    assert.equal(memos.length, row.key === 'small1' ? 5 : 6);
    for (const m of memos) {
      const memo = Object.values(content.information).find(info => info.trialId === trial.id && info.title === m[2]);
      assert.ok(memo); assert.equal(memo.summary, m[3]);
      if (!['A', 'B', 'C'].includes(m[1])) assert.equal(content.characters[memo.sourceActorId].name, m[1]);
    }
  }
  const theo = source.split('## テオ報告：採用済み修正版「認可の裏にある負担」\n')[1].split('\n---')[0];
  assert.equal(content.textBlocks['text.anchoring.theo.report'].text, theo.split('\n### テオ固有情報メモ')[0].trim());
  assert.equal(content.information['info.anchoring.theo'].summary, theo.split('### テオ固有情報メモ「認可商人の規模による格差」\n')[1].trim());
  assert.equal(content.information['info.anchoring.theo'].title, '認可商人の規模による格差');
});

test('assembly requires all three complete introductions and never substitutes supplied summaries', () => {
  assert.throws(() => createAnchoringContent(), /正式な導入小説3本/);
  assert.throws(() => createAnchoringContent(introductions.slice(0, 2)), /正式な導入小説3本/);
  assert.throws(() => createAnchoringContent([...introductions.slice(0, 2), introductions[0]]), /正式な導入小説3本/);
  for (const intro of introductions) assert.equal(content.textBlocks[`text.${intro.trialId}.introduction`].text, intro.text.replaceAll('【主人公】', '{commander}'));
});

test('all three introductions preserve the complete supplied novels and runs retain the three-city content version', () => {
  assert.equal(contentForRun(engine.createRun(content)), content);
  const novels = [...novelSource.matchAll(/### 本文\n\n([\s\S]*?)\n\n<!-- 本文ここまで -->/g)];
  assert.equal(novels.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(introductions[i].text, novels[i][1]);
    assert.equal(content.textBlocks[`text.${introductions[i].trialId}.introduction`].text, novels[i][1].replaceAll('【主人公】', '{commander}'));
  }
});

test('all 70 parties × 2 commanders × 3 routes finish at 13/20/17, with route-only memos and conditional opinions', () => {
  const ids = Object.keys(content.characters), parties = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 8; d++) parties.push([ids[a], ids[b], ids[c], ids[d]]);
  assert.equal(parties.length, 70);
  for (const members of parties) for (const commander of Object.keys(content.commanders)) {
    for (const [letters, score, listen] of [[['a', 'b', 'c'], 13, false], [['b', 'a', 'b'], 20, true], [['c', 'c', 'a'], 17, false]]) {
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
      assert.equal(engine.getTotalScore(r), score); assert.equal(r.position.phase, 'map'); assert.equal(r.chapterProgress.anchoring.status, 'completed');
      assert.equal(Object.keys(r.acquiredInformation).length, memoCount); assert.equal(engine.getTheoRemaining(r), 2);
      const counts = engine.getGovernance(r, content).counts;
      for (const tag of engine.GOVERNANCE_TAGS) assert.equal(counts[tag], expectedTags[letters[2]].includes(tag) ? 1 : 0);
    }
  }
});

test('three-city routes share only two Theo uses, total sixty points, and do not unlock endings', () => {
  for (const order of [['alba', 'hexerei', 'anchoring'], ['alba', 'anchoring', 'hexerei'], ['hexerei', 'alba', 'anchoring'], ['hexerei', 'anchoring', 'alba'], ['anchoring', 'alba', 'hexerei'], ['anchoring', 'hexerei', 'alba']]) {
    let r = start();
    for (let city = 0; city < 3; city++) {
      const regionId = order[city]; r = read(act(r, 'START_REGION', { regionId }));
      const letters = { alba: ['a', 'c', 'b'], hexerei: ['a', 'a', 'b'], anchoring: ['b', 'a', 'b'] }[regionId];
      for (let i = 0; i < 3; i++) {
        if (i === 2) {
          const choices = engine.getAvailableChoices(r, content), score = engine.getTotalScore(r);
          assert.equal(engine.canUseTheo(r, content), city < 2);
          if (city < 2) { r = act(r, 'REQUEST_THEO'); assert.deepEqual(act(r, 'REQUEST_THEO'), r); r = read(r); assert.equal(engine.canUseTheo(r, content), false); }
          assert.deepEqual(engine.getAvailableChoices(r, content), choices); assert.equal(engine.getTotalScore(r), score);
        }
        r = next(choose(r, letters[i]));
      }
    }
    assert.equal(engine.getTotalScore(r), 60); assert.equal(engine.getTheoRemaining(r), 0); assert.equal(r.position.phase, 'map');
    assert.equal(Object.keys(r.trialResults).length, 9); assert.equal(r.endingSnapshot, undefined); assert.deepEqual(r.storyEvents, {});
  }
});

test('all eight grouped confirmations grant only their private memo, and rollback keeps global reading separate', async () => {
  let r = enter();
  for (const letter of ['b', 'a', 'b']) {
    for (const conversation of engine.getAvailableConversations(r, content)) {
      const infoId = conversation.informationIdsOnComplete[0], { app } = await harness(r);
      await app.handle('save-slot', 'manual1'); await app.handle('conversation', conversation.id);
      assert.equal(app.state().run.acquiredInformation[infoId], undefined);
      assert.match(app.trialPage(), /conversation-text/); assert.doesNotMatch(app.trialPage(), /<p>「|」<\/p>/);
      await app.handle('ack-conversation'); assert.ok(app.state().run.acquiredInformation[infoId]);
      assert.equal(app.state().reader.readTextKeys.length, 3); assert.equal(engine.getTotalScore(app.state().run), engine.getTotalScore(r));
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
  await app.perform({ type: 'RESOLVE_TRIAL', trialId: 'anchoring.small1', choiceId: 'choice.anchoring.small1.b' });
  assert.equal(app.state().run.acquiredInformation['info.anchoring.small1.result.b'], undefined);
  const commit = storage.commitAuto; let attempts = 0;
  storage.commitAuto = (...args) => ++attempts === 1 ? Promise.reject(new Error('injected save failure')) : commit(...args);
  await app.handle('ack'); assert.equal(app.state().pending, true);
  assert.equal((await storage.getSlot('auto')).run.acquiredInformation['info.anchoring.small1.result.b'], undefined);
  await app.handle('retry'); assert.equal(attempts, 2); assert.ok(app.state().run.acquiredInformation['info.anchoring.small1.result.b']);
  assert.equal(engine.getTotalScore(app.state().run), 5);
  await app.openSaves(); await app.load('manual1');
  await app.perform({ type: 'RESOLVE_TRIAL', trialId: 'anchoring.small1', choiceId: 'choice.anchoring.small1.a' }); await app.handle('ack');
  assert.ok(app.state().run.acquiredInformation['info.anchoring.small1.result.a']); assert.equal(app.state().run.acquiredInformation['info.anchoring.small1.result.b'], undefined);
  assert.equal(engine.getTotalScore(app.state().run), 3);
});

test('Theo uses the adopted scale-gap report, persists once, and rollback restores its shared use', async () => {
  const { app, storage } = await harness(major()); await app.handle('save-slot', 'manual1');
  await app.handle('theo'); await app.handle('cancel-confirm'); assert.equal(engine.getTheoRemaining(app.state().run), 2);
  await app.perform({ type: 'REQUEST_THEO' }); const r = app.state().run;
  assert.equal(r.position.phase, 'theoReport'); assert.equal(engine.getTheoRemaining(r), 1);
  assert.ok(app.memoBody().includes(manuscript.theo.summary)); assert.equal(engine.getCurrentText(r, content).text, manuscript.theo.report);
  assert.deepEqual((await storage.getSlot('auto')).run, JSON.parse(JSON.stringify(r)));
  await app.openSaves(); await app.load('auto'); await app.handle('ack');
  assert.equal(engine.canUseTheo(app.state().run, content), false); assert.equal(engine.getAvailableChoices(app.state().run, content).length, 3);
  await app.openSaves(); await app.load('manual1'); assert.equal(engine.getTheoRemaining(app.state().run), 2);
  assert.equal(app.state().run.acquiredInformation['info.anchoring.theo'], undefined);
});

test('all four old content versions load unchanged, and Alba/Hexerei content is preserved in the extension', async () => {
  const { app, storage } = await harness(enter());
  for (const pack of [hexerei, alba, previous, legacy]) {
    let r = read(act(start(['char.harold', 'char.frederica', 'char.lisette', 'char.sandro'], 'commander.alphonse', pack), 'START_REGION', { regionId: 'alba' }, pack), pack); r = choose(r, 'a', pack);
    await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() }); await app.openSaves(); await app.load('manual1');
    assert.deepEqual(JSON.parse(JSON.stringify(app.state().run)), r); assert.equal(contentForRun(r), pack);
  }
  for (const dictionary of ['trials', 'scenes', 'textBlocks', 'conversations', 'information', 'investigations']) {
    for (const [id, row] of Object.entries(hexerei[dictionary])) if (id.includes('alba') || id.includes('hexerei')) assert.deepEqual(content[dictionary][id], row);
  }
  assert.deepEqual(content.characters, hexerei.characters); assert.deepEqual(content.commanders, hexerei.commanders);
  assert.deepEqual(content.regions.alba, hexerei.regions.alba); assert.deepEqual(content.regions.hexerei, hexerei.regions.hexerei);
});

test('the approved novels render continuously with commander substitution, and read confirmation grants no route memo', async () => {
  for (const commander of Object.keys(content.commanders)) {
    const r = act(start(party, commander), 'START_REGION', { regionId: 'anchoring' });
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
      const html = app.trialPage(); assert.ok(html.includes(choice.reaction)); assert.ok(html.includes(choice.evaluationReason));
      assert.doesNotMatch(html, /data-feedback-pending|正式原稿待ち|仮評価/);
      const memo = `info.${r.position.trialId}.result.${choice.letter}`;
      assert.equal(app.state().run.acquiredInformation[memo], undefined); await app.handle('ack'); assert.ok(app.state().run.acquiredInformation[memo]);
    }
    r = next(choose(r, 'b'));
  }
});
