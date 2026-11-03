import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import * as history from '../src/chronicles.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';
import { endingRun } from './helpers/ending.js';
import { content as oldEnding } from '../src/content/ending.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const fixtures = new Map();
function lastPage(score = 71, commanderId = 'commander.rosemond', pack = defaultContent) {
  const key = `${score}/${commanderId}/${pack.contentVersion}`;
  if (!fixtures.has(key)) {
    const r = endingRun(score, commanderId, pack);
    r.position = { phase: 'ending', sceneId: pack.officialEnding.lastSceneId, blockIndex: 0 };
    engine.validateRun(r, pack); fixtures.set(key, r);
  }
  return structuredClone(fixtures.get(key));
}
async function harness(initial = []) {
  const indexedDB = new MemoryIndexedDB(), dbName = 'chronicles-ui';
  const storage = createStorage({ indexedDB, dbName, contentStatus:'reviewed', validateRun: r => engine.validateRun(r, contentForRun(r)) });
  await storage.open();
  for (const [i, before] of initial.entries()) {
    const pack = contentForRun(before);
    const r = engine.transition(before, { type: 'ACK_TEXT' }, pack);
    r.runId = `history-run-${i}`;
    const result = await storage.recordCompletion(r, engine.buildEndingRecord(r, pack), { expectedRevision: await storage.getRevision() });
    indexedDB.seed(dbName, 'chronicles', result.record.completionKey, { ...result.record, recordedAt: `2026-11-0${i+1}T00:00:00.000Z` });
  }
  const dom = { innerHTML: '', addEventListener() {}, focus() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent, contentForRun, ...engine, ...history, createStorage: () => storage,
    structuredClone, document: dom, window: { scrollTo() {} }, CSS: { escape: s => s }, setTimeout: () => 0, clearTimeout() {} });
  new vm.Script(source + `
    globalThis.api={init,handle,startNew,load,openSaves,perform,
      titlePage,chroniclesPage,
      atLastPage(r){run=r;content=contentForRun(r);title=false;},
      html:()=>app.innerHTML,
      state:()=>structuredClone({run,reader,revision,slotsRevision,pending:!!pending,title,ready,error,chronicleError,chronicles,chronicleScreen})};
  `).runInContext(context);
  await context.api.init();
  return { app: context.api, storage, indexedDB, dbName };
}
async function persisted(s) {
  return { revision: await s.getRevision(), slots: await s.listSlots(), reader: await s.getReaderProfile(), records: await s.listChronicles() };
}

test('uncompleted title hides history; completing FIN unlocks it and reopening FIN never duplicates it', async () => {
  const { app, storage } = await harness();
  assert.doesNotMatch(app.titlePage(), /data-action="chronicles"/);
  const r = lastPage();
  await storage.commitAuto(r, { expectedRevision: await storage.getRevision() });
  await app.init(); app.atLastPage(r);
  await app.perform({ type: 'ACK_PAGE' });
  assert.equal(app.state().run.position.phase, 'completed');
  await app.handle('fin-title');
  assert.match(app.titlePage(), /data-action="chronicles"/);
  assert.equal((await storage.listChronicles()).length, 1);
  await app.openSaves(); await app.load('auto');
  assert.equal(app.state().run.position.phase, 'completed');
  await app.handle('fin-title'); await app.handle('chronicles');
  assert.equal((await storage.listChronicles()).length, 1);
});

test('71-point Rosemond record lists Alphonse as sovereign; multiple records sort newest first', async () => {
  const { app } = await harness([lastPage(), lastPage(100, 'commander.alphonse', oldEnding)]);
  assert.match(app.titlePage(), /data-action="chronicles"/);
  await app.handle('chronicles');
  const records = app.state().chronicles;
  assert.equal(records.length, 2);
  assert.equal(records[0].finalScore, 100);
  const row = history.chronicleView(records[1]);
  assert.equal(row.commander, 'ローズモンド'); assert.equal(row.sovereign, 'アルフォンス'); assert.equal(row.score, '71／100');
  assert.match(row.date, /2026\/11\/01 09:00:00/);
  const html = app.chroniclesPage();
  assert.ok(html.indexOf('100／100') < html.indexOf('71／100'));
  await app.handle('chronicle-detail', records[1].completionKey);
  const detail = app.chroniclesPage();
  for (const name of ['ハロルド', 'フレデリカ', 'リゼット', 'サンドロ']) assert.ok(detail.includes(name));
  for (const p of Object.values(records[1].submittedPolicies)) assert.ok(detail.includes(p.labelAtCompletion));
  assert.match(detail, /<details/); assert.match(detail, /八人の談話（保存本文）/);
  assert.equal(row.epilogue, records[1].epilogueSnapshot);
  assert.equal(row.ensemble, records[1].ensembleAfterwordSnapshot);
});

test('list, details, text reading and back navigation write neither game saves nor reading nor history', async () => {
  const { app, storage } = await harness([lastPage()]);
  const before = await persisted(storage), state = app.state();
  // Fail immediately if any viewer handler accidentally reaches a writer.
  for (const method of ['commitAuto', 'saveManual', 'loadSlot', 'deleteSlot', 'recordCompletion']) storage[method] = () => { throw new Error(`Viewer called ${method}`); };
  for (let i = 0; i < 3; i++) {
    await app.handle('chronicles');
    await app.handle('chronicle-detail', before.records[0].completionKey);
    app.chroniclesPage(); app.chroniclesPage();
    await app.handle('chronicles-back'); await app.handle('chronicles-title');
  }
  assert.deepEqual(await persisted(storage), before);
  for (const key of ['run', 'reader', 'revision', 'slotsRevision']) assert.deepEqual(app.state()[key], state[key]);
});

test('a new run retains history and normal manual save/load works after browsing', async () => {
  const { app, storage } = await harness([lastPage()]);
  const before = await storage.listChronicles();
  await app.handle('chronicles'); await app.handle('chronicles-title');
  await app.startNew();
  assert.equal(app.state().run.contentVersion, defaultContent.contentVersion);
  await app.handle('title'); await app.handle('accept-confirm');
  assert.match(app.titlePage(), /data-action="chronicles"/);
  assert.deepEqual(await storage.listChronicles(), before);
  await app.handle('chronicles'); await app.handle('chronicles-title');
  await app.openSaves(); await app.load('auto');
  const r = app.state().run;
  await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() });
  await app.openSaves(); await app.load('manual1');
  assert.deepEqual(app.state().run, r);
  assert.deepEqual(await storage.listChronicles(), before);
});

test('old and unknown editions show only saved information, escape markup, and never infer a sovereign from score', async () => {
  const record = { completionKey: 'past', contentVersion: 'unknown-old-content', commanderId: 'commander.rosemond',
    finalScore: 71, rank: 'success', outcome: '保存済みの旧結果', recordedAt: 'not-a-date',
    partyIds: ['char.harold'], submittedPolicies: { alba: { policyId: 'old', labelAtCompletion: '<script>saved policy</script>' } },
    epilogueSnapshot: '<img src=x onerror=alert(1)>\n\n保存された本文', companionAfterwordSnapshots: { 'char.harold': '旧版の保存本文' } };
  const before = structuredClone(record), view = history.chronicleView(record);
  assert.equal(view.sovereign, '記録なし'); assert.equal(view.outcome, record.outcome); assert.equal(view.epilogue, record.epilogueSnapshot);
  assert.equal(view.date, '記録なし'); assert.equal(view.governance, '記録なし');
  assert.deepEqual(record, before);
  const { app, indexedDB, dbName } = await harness();
  indexedDB.seed(dbName, 'chronicles', record.completionKey, record);
  await app.init(); await app.handle('chronicles'); await app.handle('chronicle-detail', 'past');
  assert.match(app.html(), /&lt;script&gt;saved policy&lt;\/script&gt;/);
  assert.match(app.html(), /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(app.html(), /<script>|<img src=x/);
  assert.deepEqual(history.sortChronicles([{ ...record, completionKey: 'a' }, { ...record, completionKey: 'b', recordedAt: '2026-11-01T00:00:00Z' }]).map(r => r.completionKey), ['b', 'a']);
});

test('history read failures preserve existing records, keep the game ready and allow a read-only retry', async () => {
  const { app, storage } = await harness([lastPage()]), before = await persisted(storage);
  const list = storage.listChronicles;
  storage.listChronicles = async () => { throw new Error('injected read failure'); };
  await app.init();
  assert.equal(app.state().ready, true);
  assert.match(app.titlePage(), /王国史を読み込めませんでした/);
  storage.listChronicles = list;
  await app.handle('chronicles-refresh'); await app.handle('chronicles');
  assert.equal(app.state().chronicleError, '');
  assert.deepEqual(await persisted(storage), before);
});
