import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { content } from '../src/content/ending-reading.js';
import { content as previous } from '../src/content/map-return.js';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { endingRun } from './helpers/ending.js';
import { createHelpers } from './helpers/prologue.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
async function harness(snapshot) {
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), dbName: 'ending-reading', validateRun: r => engine.validateRun(r, contentForRun(r)) });
  const saved = await storage.commitAuto(snapshot, { expectedRevision: await storage.getRevision() });
  const dom = { addEventListener() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent, contentForRun, ...engine, createStorage: () => storage, structuredClone,
    document: dom, window: { scrollTo() {} }, CSS: { escape: s => s }, setTimeout: () => 0, clearTimeout() {}, snapshot, saved });
  new vm.Script(source + `
    render=()=>syncReadingSession();
    run=snapshot;content=contentForRun(run);reader=saved.readerProfile;revision=saved.revision;slotsRevision=revision;ready=true;title=false;syncReadingSession();
    globalThis.api={perform,handle,load,openSaves,mapPage,trialSidebar,endingPage,
      state:()=>structuredClone({run,reader,pending:!!pending,readingPreviewIndex}),
      html:()=>endingPage(),
      preview:()=>{const live=run;run=readingHistory[readingPreviewIndex];const html=endingPage();run=live;return html;}};
  `).runInContext(context);
  return { app: context.api, storage };
}
function scenePages(run, pack, sceneId) {
  const scene = pack.scenes[sceneId], pages = [];
  for (let blockIndex = 0; blockIndex < scene.blocks.length;) {
    const page = engine.getCurrentTextPage({ ...run, position: { phase: 'ending', sceneId, blockIndex } }, pack);
    if (!page.length) { blockIndex++; continue; }
    pages.push(page);
    blockIndex = scene.blocks.indexOf(page.at(-1).id) + 1;
  }
  return pages;
}

test('presentation edition preserves all original content and eleven historical editions', async () => {
  assert.equal(defaultContent, content);
  assert.equal(contentForRun(engine.createRun(previous)), previous);
  for (const name of ['legacy', 'alba', 'alba-final', 'hexerei', 'anchoring', 'rude', 'ehrenfels', 'companion-dialogue-unified', 'prologue', 'ending', 'map-return']) {
    const { content: historical } = await import(`../src/content/${name}.js`);
    const run = engine.createRun(historical), saved = JSON.parse(JSON.stringify(run));
    assert.equal(contentForRun(saved), historical);
    engine.validateRun(saved, historical);
    assert.deepEqual(saved, run);
  }
  assert.deepEqual(content.textBlocks, previous.textBlocks);
  for (const key of ['characters', 'commanders', 'trials', 'regions', 'conversations', 'information', 'investigations', 'officialEnding', 'mapReturnLines', 'portraits']) {
    assert.deepEqual(content[key], previous[key], key);
  }
  for (const [id, scene] of Object.entries(previous.scenes)) {
    const { readingPageEnds, ensembleCg, ...unchanged } = content.scenes[id];
    assert.deepEqual(unchanged, scene, id);
  }
  assert.equal(previous.hideMapRest, undefined);
  assert.equal(previous.scenes['ending.ensemble'].ensembleCg, undefined);
  const image = await readFile(new URL('../src/assets/八人の仲間たち_陽だまりの談話会.png', import.meta.url));
  const cg = content.scenes['ending.ensemble'].ensembleCg;
  assert.equal(image.readUInt32BE(16), cg.width); assert.equal(image.readUInt32BE(20), cg.height);
  assert.equal(createHash('sha256').update(image).digest('hex'), 'cc63c18492c7f1e2746c754335beb8e3b37d08c8bfa6bc3cb9c81367e0baa79a');
  assert.deepEqual(cg.blockIds, content.scenes['ending.ensemble'].blocks.slice(0, 5));
});

test('all endings and sixteen governance variants keep exact block order, text, speakers and read keys', () => {
  const reached = new Set();
  for (const commanderId of Object.keys(content.commanders)) for (const rank of ['high', 'normal', 'other'])
    for (const governanceKey of content.officialEnding.governanceKeys) {
      const run = { commanderId, partyIds: [], endingResult: { rank, governanceKey, sovereignId: rank === 'other' ? Object.keys(content.commanders).find(id => id !== commanderId) : commanderId } };
      for (const scene of Object.values(content.scenes).filter(s => s.id.startsWith('ending.'))) {
        const pages = scenePages(run, content, scene.id);
        const expected = scene.blocks.map((_, blockIndex) => engine.getCurrentText({ ...run, partyIds: [], position: { phase: 'ending', sceneId: scene.id, blockIndex } }, previous)).filter(Boolean);
        assert.deepEqual(pages.flat(), expected, `${commanderId}/${rank}/${governanceKey}/${scene.id}`);
        for (const page of pages) {
          page.forEach(b => reached.add(b.id));
          assert.ok(page.reduce((n, b) => n + b.text.length, 0) <= 260);
          const declarations = page.filter(b => b.speakerId === 'support.king' && b.text.startsWith('「次代のバウムガルテン王は'));
          if (declarations.length) assert.equal(page.length, 1);
        }
      }
    }
  const all = Object.values(content.scenes).filter(s => s.id.startsWith('ending.')).flatMap(s => s.blocks);
  assert.equal(reached.size, all.length);
});

test('both protagonists and all three ranks reduce ending pages and ensemble 37 to 19', () => {
  for (const commanderId of Object.keys(content.commanders)) for (const score of [90, 85, 79]) {
    const r = endingRun(score, commanderId, content), counts = [];
    for (const pack of [previous, content]) {
      const pages = Object.values(pack.scenes).filter(s => s.id.startsWith('ending.')).flatMap(s => scenePages(r, pack, s.id));
      counts.push(pages.length);
    }
    assert.equal(scenePages(r, previous, 'ending.ensemble').length, 37);
    assert.equal(scenePages(r, content, 'ending.ensemble').length, 19);
    assert.ok(counts[1] <= 55 && counts[1] < counts[0] * .65);
    console.log(`ending pages ${commanderId}/${score}: ${counts[0]} -> ${counts[1]}, ensemble 37 -> 19`);
  }
});

test('only new map rest controls disappear; random chatter, trial voices and old map saves stay intact', async () => {
  const party = ['char.harold', 'char.frederica', 'char.madian', 'char.olivel'];
  for (const pack of [previous, content]) {
    const h = createHelpers(pack);
    const map = h.start(party), { app } = await harness(map);
    assert.equal(app.mapPage().includes('ひと休み'), pack === previous);
    assert.ok(engine.getAvailableConversations(map, pack).length > 0);
    if (pack === previous) {
      const conversationId = engine.getAvailableConversations(map, pack)[0].id;
      const oldConversation = h.act(map, 'OPEN_CONVERSATION', { conversationId });
      const restored = await harness(JSON.parse(JSON.stringify(oldConversation)));
      assert.deepEqual(restored.app.state().run, oldConversation);
      while (restored.app.state().run.position.phase === 'conversation') await restored.app.perform({ type: 'ACK_PAGE' });
      assert.equal(restored.app.state().run.position.phase, 'map');
      assert.ok(restored.app.state().run.heardConversationIds.includes(conversationId));
    }
    const r = h.read(h.act(map, 'START_REGION', { regionId: 'alba' }));
    const trial = await harness(r);
    assert.ok(trial.app.trialSidebar().includes('data-action="conversation"'));
    const conversation = engine.getAvailableConversations(r, pack)[0];
    const after = h.read(h.act(r, 'OPEN_CONVERSATION', { conversationId: conversation.id }));
    assert.ok(after.heardConversationIds.includes(conversation.id));
    const result = h.read(h.choose(after));
    let hit, miss;
    for (let i = 0; !hit || !miss; i++) {
      const returned = h.act({ ...result, runId: `ui-chatter-${i}` }, 'RETURN_MAP');
      if (engine.getMapReturnChatter(returned, pack)) hit = returned; else miss = returned;
    }
    const shown = await harness(hit);
    assert.match(shown.app.mapPage(), /map-chatter/);
    const hidden = await harness(miss);
    assert.doesNotMatch(hidden.app.mapPage(), /class="map-chatter"/);
  }
});

test('grouped page writes are atomic; save retry, reload and read-only review preserve CG and all reading', async () => {
  const r = endingRun(90, 'commander.alphonse', content);
  r.position = { phase: 'ending', sceneId: 'ending.ensemble', blockIndex: 0 };
  const { app, storage } = await harness(r);
  assert.match(app.html(), /class="event-cg ensemble-cg"/);
  const page = engine.getCurrentTextPage(r, content), commit = storage.commitAuto;
  let calls = 0;
  storage.commitAuto = (...args) => ++calls === 1 ? Promise.reject(new Error('injected capacity failure')) : commit(...args);
  await app.perform({ type: 'ACK_PAGE' });
  assert.equal(app.state().pending, true);
  assert.equal((await storage.getSlot('auto')).run.position.blockIndex, 0);
  const candidate = app.state().run;
  assert.equal(candidate.position.blockIndex, 5);
  assert.doesNotMatch(app.html(), /ensemble-cg/);
  await app.handle('retry');
  assert.equal(calls, 2);
  assert.deepEqual((await storage.getSlot('auto')).run, candidate);
  for (const b of page) assert.ok(app.state().reader.readTextKeys.includes(b.readKey));
  const before = app.state();
  await app.handle('read-prev');
  assert.match(app.preview(), /ensemble-cg/);
  await app.handle('read-forward');
  assert.deepEqual(app.state(), before);
  await app.openSaves();
  await app.load('auto');
  assert.deepEqual(app.state().run, candidate);
  assert.doesNotMatch(app.html(), /ensemble-cg/);
  // A valid saved mid-page position displays only its unacknowledged suffix.
  const partial = { ...r, position: { ...r.position, blockIndex: 2 } };
  engine.validateRun(partial, content);
  const mid = await harness(partial);
  assert.equal(engine.getCurrentTextPage(partial, content).length, 3);
  assert.match(mid.app.html(), /ensemble-cg/);
  await mid.app.perform({ type: 'ACK_PAGE' });
  assert.equal(mid.app.state().run.position.blockIndex, 5);
  assert.deepEqual(mid.app.state().run.recentDialogueLog.slice(-3).map(b => b.textId), page.slice(2).map(b => b.id));
});
