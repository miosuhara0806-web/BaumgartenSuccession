import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createHelpers } from './helpers/prologue.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const dom = { addEventListener() {}, querySelector() { return dom; } };
function view(snapshot) {
  const context = vm.createContext({ defaultContent, contentForRun, ...engine, createStorage: () => ({}),
    document: dom, structuredClone, snapshot });
  new vm.Script(source + `
    run=snapshot;content=contentForRun(run);
    globalThis.api={mapPage,trialSidebar,state:()=>structuredClone(run)};
  `).runInContext(context);
  return context.api;
}
const notice = /aria-label="王都解放のお知らせ"/;
const h = createHelpers(defaultContent);
const cities = ['alba', 'hexerei', 'anchoring', 'rude'];

function major(r, city) {
  r = h.read(h.act(r, 'START_REGION', { regionId: city }));
  for (let i = 0; i < 2; i++) r = h.read(h.act(h.read(h.choose(r)), 'CONTINUE_TRIAL'));
  return r;
}

test('Theo introduction and limits accompany the live remaining count and existing availability', () => {
  let r = major(h.start(), 'alba');
  for (const remaining of [2, 1, 0]) {
    const ui = view(r), before = structuredClone(r), html = ui.trialSidebar();
    assert.match(html, /テオは王国の密偵。各地の記録や現地の情報を調べ、指揮官の判断を助ける人物です。ただし、政策の正解を教えてくれるわけではありません。/);
    assert.match(html, /旅全体で合計2回まで、各都市の大試練で最大1回/);
    assert.ok(html.includes(`残り ${remaining} / 2 回`));
    assert.equal(/data-action="theo"/.test(html), engine.canUseTheo(r, defaultContent));
    assert.deepEqual(ui.state(), before);
    if (!remaining) break;
    r = h.read(h.act(r, 'REQUEST_THEO'));
    assert.equal(engine.canUseTheo(r, defaultContent), false);
    assert.doesNotMatch(view(r).trialSidebar(), /data-action="theo"/);
    r = h.read(h.act(h.read(h.choose(r)), 'CONTINUE_TRIAL'));
    r = major(r, remaining === 2 ? 'hexerei' : 'anchoring');
  }
});

test('capital notice follows all four-city orders, reunion, first entry and final completion', () => {
  for (const commanderId of Object.keys(defaultContent.commanders)) for (const order of h.permutations(cities)) {
    let r = h.start(undefined, commanderId);
    assert.doesNotMatch(view(r).mapPage(), notice);
    for (const [index, city] of order.entries()) {
      r = h.finishCity(r, city, { stopBeforeClosing: true });
      r = h.read(r, defaultContent, s => s.position.phase === 'storyEvent');
      if (index === 1) {
        assert.equal(r.position.phase, 'storyEvent');
        assert.equal(r.position.eventId, 'event.midgame-reunion');
        assert.doesNotMatch(view(r).mapPage(), notice);
        r = h.read(r);
      }
      assert.equal(r.position.phase, 'map');
      const ui = view(r), before = structuredClone(r);
      for (let repeat = 0; repeat < 3; repeat++) assert.equal(notice.test(ui.mapPage()), index === 3);
      assert.deepEqual(ui.state(), before);
      if (index < 3) assert.throws(() => h.act(r, 'START_REGION', { regionId: 'ehrenfels' }), /まだ解放/);
    }
    const capital = h.act(r, 'START_REGION', { regionId: 'ehrenfels' });
    const returned = h.act(h.read(capital), 'RETURN_MAP');
    assert.doesNotMatch(view(returned).mapPage(), notice);
    const done = h.finishCity(r, 'ehrenfels');
    assert.doesNotMatch(view(done).mapPage(), notice);
  }
});

test('existing saves retain their exact data across rendering, manual save and reload', async () => {
  const { content: prologue } = await import('../src/content/prologue.js');
  const { content: ending } = await import('../src/content/ending.js');
  for (const pack of [prologue, ending, defaultContent]) {
    const helper = createHelpers(pack);
    let r = helper.start();
    for (const city of cities) r = helper.finishCity(r, city);
    const before = structuredClone(r);
    const storage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: s => engine.validateRun(s, contentForRun(s)) });
    await storage.commitAuto(r, { expectedRevision: await storage.getRevision() });
    await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() });
    await storage.loadSlot('manual1', { expectedRevision: await storage.getRevision() });
    const loaded = (await storage.getSlot('auto')).run;
    const ui = view(loaded);
    assert.match(ui.mapPage(), notice);
    ui.trialSidebar();
    assert.deepEqual(ui.state(), before);
    assert.deepEqual(loaded, before);
    assert.equal(contentForRun(loaded), pack);
  }
  // Older editions with an unimplemented capital must never announce its release.
  const { content: alba } = await import('../src/content/alba-final.js');
  const old = engine.createRun(alba);
  assert.doesNotMatch(view(old).mapPage(), notice);
  assert.deepEqual(view(old).state(), old);
});
