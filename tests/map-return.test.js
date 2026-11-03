import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { content } from '../src/content/map-return.js';
import { content as previous } from '../src/content/ending.js';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { drawMapReturn } from '../src/map-return.js';
import { createHelpers } from './helpers/prologue.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const h = createHelpers(content);
const key = 'trial:alba.small1';
const result = party => h.read(h.choose(h.read(h.act(h.start(party), 'START_REGION', { regionId: 'alba' }))));
const returnMap = r => h.act(r, 'RETURN_MAP');
function seeded(r, predicate) {
  for (let i = 0; i < 1000; i++) {
    const candidate = { ...r, runId: `map-return-acceptance-${i}` };
    if (predicate(drawMapReturn(candidate, key))) return candidate;
  }
  throw new Error('Missing draw outcome');
}
const gameplay = r => ({ ...r, mapReturnChatter: undefined });

test('new edition keeps all historical content, saves and approved 16 lines intact', () => {
  assert.equal(contentForRun(engine.createRun(content)), content);
  assert.equal(contentForRun(engine.createRun(previous)), previous);
  assert.deepEqual({ ...content, contentVersion: previous.contentVersion, mapReturnLines: undefined }, { ...previous, mapReturnLines: undefined });
  assert.deepEqual(Object.keys(content.mapReturnLines).sort(), Object.keys(content.characters).sort());
  assert.deepEqual(Object.values(content.mapReturnLines).flat(), [
    'この旅、思っていたよりずっと勉強になりますね', '皆さんと一緒だと、知らない道も心強いです',
    '次へ行く前に、持ち物を確かめておこう', '……さっきの人たち、少しは安心できたかな',
    '……街によって、こんなに暮らしが違うんですね', '次の街でも、私にできることを探してみます',
    '地図で見るのと、実際に歩くのとでは違いますね', '今日の出来事は、忘れないうちに記録しておきましょう',
    'やっと一息つけるな。……飯はまだか？', '次の街まで長いなら、先に休憩しとけよ',
    'さっきの方、少し表情が明るくなりましたね', 'あら、道端に小さな花が。綺麗ですね',
    '次の街には何があるかな。ちょっと楽しみだ！', '少しくらい寄り道したっていいだろ？ 面白いものがあるかもよ',
    '街が変わると、人の考え方も変わる。そういうのを知るのも、旅の面白さよね', 'せっかくの旅なんだから、景色も楽しみなさいよ',
  ]);
  const old = engine.createRun(previous), copy = structuredClone(old);
  engine.validateRun(copy, contentForRun(copy));
  assert.deepEqual(copy, old);
  assert.equal(copy.mapReturnChatter, undefined);
});

test('all 70 parties: only the chosen four speak, both lines display, returns do not change gameplay', () => {
  const ids = Object.keys(content.characters), parties = [];
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 6; b++)
    for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 8; d++) parties.push([ids[a], ids[b], ids[c], ids[d]]);
  assert.equal(parties.length, 70);
  const displayed = new Set();
  for (const party of parties) {
    const base = result(party);
    for (const speakerId of party) for (const lineIndex of [0, 1]) {
      const before = seeded(base, d => d?.speakerId === speakerId && d.lineIndex === lineIndex);
      const after = returnMap(before), shown = engine.getMapReturnChatter(after, content);
      assert.deepEqual(shown, { speakerId, lineIndex, text: content.mapReturnLines[speakerId][lineIndex] });
      assert.equal(after.mapReturnChatter.currentKey, key);
      const expected = structuredClone(before);
      expected.chapterProgress.alba.resumePosition = expected.position;
      expected.position = { phase: 'map' };
      assert.deepEqual(gameplay(after), gameplay(expected));
      displayed.add(`${speakerId}:${lineIndex}`);
      assert.deepEqual(returnMap(after), after);
      // Reopening the same completed checkpoint restores its stored draw.
      const again = returnMap(h.act(after, 'START_REGION', { regionId: 'alba' }));
      assert.deepEqual(again, after);
      assert.deepEqual(returnMap(JSON.parse(JSON.stringify(before))), after);
    }
  }
  assert.equal(displayed.size, 16);
});

test('30000 seeded returns occur about one third of the time with uniform speakers and lines', () => {
  const partyIds = h.defaultParty, counts = Object.fromEntries(partyIds.map(id => [id, [0, 0]]));
  let hits = 0;
  for (let i = 0; i < 30000; i++) {
    const d = drawMapReturn({ runId: `distribution-${i}`, partyIds }, key);
    if (d) { hits++; counts[d.speakerId][d.lineIndex]++; }
  }
  assert.ok(hits > 9700 && hits < 10300, `${hits}/30000`);
  for (const n of Object.values(counts).flat()) assert.ok(n > 1100 && n < 1400, String(n));
  console.log(`map-return distribution: ${hits}/30000 (${(100 * hits / 30000).toFixed(2)}%)`);
});

test('initial map, decision return and existing rest conversations never draw; misses stay playable', () => {
  let r = h.start();
  assert.deepEqual(r.mapReturnChatter, { currentKey: null, draws: {} });
  assert.deepEqual(returnMap(r), r);
  r = h.read(h.act(r, 'START_REGION', { regionId: 'alba' }));
  r = returnMap(r);
  assert.deepEqual(r.mapReturnChatter, { currentKey: null, draws: {} });
  r = h.read(h.act(r, 'START_REGION', { regionId: 'alba' }));
  const missed = returnMap(seeded(h.read(h.choose(r)), d => d === null));
  assert.deepEqual(missed.mapReturnChatter, { currentKey: key, draws: { [key]: null } });
  assert.equal(engine.getMapReturnChatter(missed, content), null);
  assert.equal(h.act(missed, 'START_REGION', { regionId: 'alba' }).position.phase, 'trialResult');
  const conversation = engine.getAvailableConversations(missed, content)[0];
  if (conversation) {
    const after = h.read(h.act(missed, 'OPEN_CONVERSATION', { conversationId: conversation.id }));
    assert.deepEqual(after.mapReturnChatter, missed.mapReturnChatter);
  }
});

test('all cities, important events and final chapter keep their existing sequence and ending result', () => {
  for (const commanderId of Object.keys(content.commanders)) {
    let r = h.start(undefined, commanderId);
    for (const city of ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels']) {
      r = h.finishCity(r, city, { stopBeforeClosing: true });
      const before = structuredClone(r.mapReturnChatter.draws);
      r = h.read(r, content, s => s.position.phase === 'storyEvent' || s.position.phase === 'ending');
      if (Object.values(content.storyEvents).some(event => r.position.eventId === event.id)) {
        assert.equal(r.position.phase, 'storyEvent');
        assert.deepEqual(r.mapReturnChatter.draws, before);
        assert.equal(engine.getMapReturnChatter(r, content), null);
        r = h.read(r);
        assert.deepEqual(r.mapReturnChatter.draws, before);
        assert.equal(r.mapReturnChatter.currentKey, null);
      } else if (city === 'ehrenfels') {
        assert.equal(r.position.phase, 'ending');
        assert.deepEqual(r.mapReturnChatter.draws, before);
        assert.equal(engine.getMapReturnChatter(r, content), null);
        assert.deepEqual(r.endingResult, engine.getSuccessionResult(r, content));
      } else assert.ok(Object.hasOwn(r.mapReturnChatter.draws, `region:${city}`));
    }
    assert.equal(r.storyEvents['event.midgame-reunion'].status, 'completed');
  }
  let r = h.start();
  for (const city of ['alba', 'hexerei', 'anchoring', 'rude']) r = h.finishCity(r, city);
  r = h.read(h.act(r, 'START_REGION', { regionId: 'ehrenfels' }));
  for (let i = 0; i < 3; i++) {
    r = h.read(h.choose(r));
    const before = structuredClone(r.mapReturnChatter.draws);
    r = returnMap(r);
    if (i < 2) assert.ok(Object.hasOwn(r.mapReturnChatter.draws, `trial:ehrenfels.small${i + 1}`));
    else {
      assert.deepEqual(r.mapReturnChatter.draws, before);
      assert.equal(engine.getMapReturnChatter(r, content), null);
    }
    r = h.read(h.act(h.act(r, 'START_REGION', { regionId: 'ehrenfels' }), 'CONTINUE_TRIAL'), content, s => s.position.phase === 'ending');
  }
  assert.equal(r.position.phase, 'ending');
});

test('hit and miss survive manual save, auto save, storage reopen and load without reroll', async () => {
  const indexedDB = new MemoryIndexedDB();
  const storage = () => createStorage({ indexedDB, dbName: 'map-return', validateRun: r => engine.validateRun(r, contentForRun(r)) });
  let s = storage();
  const base = result();
  for (const hit of [true, false]) {
    const r = returnMap(seeded(base, d => Boolean(d) === hit));
    await s.commitAuto(r, { expectedRevision: await s.getRevision() });
    await s.saveManual('manual1', r, { expectedRevision: await s.getRevision() });
    s = storage();
    assert.deepEqual((await s.getSlot('auto')).run, r);
    await s.loadSlot('manual1', { expectedRevision: await s.getRevision() });
    assert.deepEqual((await s.getSlot('auto')).run, r);
    assert.deepEqual(returnMap(r), r);
  }
});

test('actual app render, profile/memo/log and failed auto-save retry preserve the draw', async () => {
  const snapshot = seeded(result(), Boolean);
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), dbName: 'map-return-ui', validateRun: r => engine.validateRun(r, contentForRun(r)) });
  const saved = await storage.commitAuto(snapshot, { expectedRevision: await storage.getRevision() });
  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
  const dom = { addEventListener() {}, focus() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent, contentForRun, ...engine, createStorage: () => storage, structuredClone, document: dom, window: { scrollTo() {} }, CSS: { escape: s => s }, setTimeout: () => 0, clearTimeout() {}, snapshot, saved });
  new vm.Script(source + `
    run=snapshot;content=contentForRun(run);reader=saved.readerProfile;revision=saved.revision;slotsRevision=revision;ready=true;title=false;
    globalThis.api={handle,perform,mapPage,state:()=>structuredClone({run,reader,pending:!!pending})};
  `).runInContext(context);
  const app = context.api, commit = storage.commitAuto;
  let calls = 0;
  storage.commitAuto = (...args) => ++calls === 1 ? Promise.reject(new Error('capacity failure')) : commit(...args);
  await app.perform({ type: 'RETURN_MAP' });
  assert.equal(app.state().pending, true);
  const candidate = app.state().run;
  assert.match(app.mapPage(), /map-chatter/);
  for (const action of ['memo', 'log', 'profile']) {
    await app.handle(action, candidate.partyIds[0]);
    await app.handle('close-modal');
    app.mapPage();
    assert.deepEqual(app.state().run, candidate);
  }
  await app.handle('retry');
  assert.equal(calls, 2);
  assert.deepEqual((await storage.getSlot('auto')).run, candidate);
  assert.deepEqual(app.state().reader, saved.readerProfile);
});
