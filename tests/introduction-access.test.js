import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { defaultContent as content, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createStorage, STORAGE_SCHEMA_VERSION } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';
import { act, read, start, choose, finishCity, defaultParty } from './helpers/prologue.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const allTrials = Object.keys(content.trials);
const normalCities = ['alba', 'hexerei', 'anchoring', 'rude'];
const idsFor = (city, count = 3) => content.regions[city].trialIds.slice(0, count);

// Exercise the actual rendering functions and opening handler, with real storage.
async function harness(snapshot, readTextKeys = []) {
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: r => engine.validateRun(r, contentForRun(r)) });
  await storage.open();
  const dom = { addEventListener() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent: content, contentForRun, ...engine,
    createStorage: () => storage, structuredClone, document: dom, window: { scrollTo() {} },
    CSS: { escape: s => s }, setTimeout: () => 0, clearTimeout() {} });
  new vm.Script(source + `
    render=()=>{};
    globalThis.api={
      initialize(state,saved){run=state;content=contentForRun(state);revision=saved.revision;slotsRevision=revision;reader=saved.readerProfile;title=false;ready=true;modal=null;},
      state(){return structuredClone({run,reader,revision,version:content.contentVersion});},
      modalBody(){return modal?.body || null;},
      introductionLinks,introductionModal,mapPage,handle,openSaves,load,startNew
    };
  `).runInContext(context);
  async function replace(r, keys = []) {
    const saved = await storage.commitAuto(r, { expectedRevision: await storage.getRevision(), readTextKeys: keys });
    context.api.initialize(r, saved);
  }
  await replace(snapshot, readTextKeys);
  return { app: context.api, storage, replace };
}
function assertAvailable(app, expected) {
  const html = app.introductionLinks();
  assert.deepEqual([...html.matchAll(/data-action="introduction" data-id="([^"]+)"/g)].map(m => m[1]), allTrials.filter(id => expected.includes(id)));
  for (const region of Object.values(content.regions)) {
    assert.equal(html.includes(`<p class="small muted">${region.name}</p>`), expected.some(id => idsFor(region.id).includes(id)), region.id);
  }
  for (const id of allTrials) {
    const modal = app.introductionModal(id);
    if (expected.includes(id)) assert.match(modal.body, /novel-text/);
    else assert.equal(modal, null, id);
  }
}
function assertReachability(r, expected) {
  for (const id of allTrials) assert.equal(engine.trialWasReached(id, r, content), expected.includes(id), id);
}

// Covers requested cases 1–8, all five cities, both protagonists and return-map positions.
test('new runs expose only reached introductions through every trial stage and city completion', async () => {
  for (const commanderId of Object.keys(content.commanders)) {
    let r = start(defaultParty, commanderId);
    const { app, replace } = await harness(r);
    assertAvailable(app, []); assertReachability(r, []);
    for (const city of normalCities) {
      const button = app.mapPage().match(new RegExp(`<button[^>]+data-region="${city}"[^>]*>`))[0];
      assert.doesNotMatch(button, /disabled/);
    }
    const completed = [];
    for (const city of ['rude', 'anchoring', 'hexerei', 'alba', 'ehrenfels']) {
      r = act(r, 'START_REGION', { regionId: city });
      for (let i = 0; i < 3; i++) {
        const expected = [...completed, ...idsFor(city, i + 1)];
        // Reached at entry, before even acknowledging the introduction.
        await replace(r); assertAvailable(app, expected); assertReachability(r, expected);
        r = read(r);
        r = act(r, 'RETURN_MAP');
        assert.equal(r.chapterProgress[city].resumePosition.trialId, idsFor(city)[i]);
        await replace(r); assertAvailable(app, expected); assertReachability(r, expected);
        r = act(r, 'START_REGION', { regionId: city });
        r = choose(r);
        // A result exists, but CONTINUE_TRIAL has not entered the next trial yet.
        await replace(r); assertAvailable(app, expected); assertReachability(r, expected);
        r = read(r);
        await replace(r); assertAvailable(app, expected);
        r = act(r, 'CONTINUE_TRIAL');
        if (i === 2) r = read(r);
      }
      completed.push(...idsFor(city));
      assert.equal(r.chapterProgress[city].status, 'completed');
      await replace(r); assertAvailable(app, completed); assertReachability(r, completed);
      if (completed.length === 12) {
        const capital = app.mapPage().match(/<button[^>]+data-region="ehrenfels"[^>]*>/)[0];
        assert.doesNotMatch(capital, /disabled/);
        assert.equal(r.chapterProgress.ehrenfels.status, 'notStarted');
        assert.ok(!app.introductionLinks().includes('エーレンフェルス'));
      }
    }
    assert.equal(Object.keys(r.trialResults).length, 15);
  }
});

test('past global read keys never unlock an unvisited or later trial in a new run', async () => {
  const keys = Object.values(content.trials).flatMap(t => content.scenes[t.introductionSceneId].blocks.map(id => `${id}@${content.textBlocks[id].textRevision}`));
  let prior = start();
  for (const city of [...normalCities, 'ehrenfels']) prior = finishCity(prior, city);
  const { app, storage, replace } = await harness(prior, keys);
  assertAvailable(app, allTrials);
  await app.openSaves(); await app.startNew();
  assert.equal(app.state().reader.readTextKeys.length, keys.length);
  assertAvailable(app, []);
  let fresh = start(); await replace(fresh); assertAvailable(app, []);
  fresh = act(fresh, 'START_REGION', { regionId: 'alba' }); await replace(fresh);
  assertAvailable(app, ['alba.small1']);
  assert.deepEqual((await storage.getReaderProfile()).readTextKeys, [...keys].sort());
});

test('the modal opening handler rejects direct calls for unvisited, unreached, locked and unknown IDs', async () => {
  const r = read(act(start(), 'START_REGION', { regionId: 'alba' }));
  const { app, storage } = await harness(r);
  const before = app.state(), revision = await storage.getRevision();
  for (const id of ['alba.small2', 'alba.major', 'rude.small1', 'ehrenfels.small1', 'ehrenfels.major', 'unknown.trial']) {
    assert.equal(app.introductionModal(id), null);
    await app.handle('introduction', id); assert.equal(app.modalBody(), null);
    assert.deepEqual(app.state(), before);
  }
  await app.handle('introduction', 'alba.small1'); assert.match(app.modalBody(), /novel-text/);
  await app.handle('close-modal');
  assert.deepEqual(app.state(), before);
  assert.equal(await storage.getRevision(), revision);
  assert.deepEqual((await storage.getSlot('auto')).run, r);
});

test('conversation and Theo return positions retain access without revealing later trials', async () => {
  let r = read(act(start(), 'START_REGION', { regionId: 'alba' }));
  const conversation = engine.getAvailableConversations(r, content)[0]; assert.ok(conversation);
  const { app, replace } = await harness(r);
  r = act(r, 'OPEN_CONVERSATION', { conversationId: conversation.id });
  await replace(r); assertAvailable(app, ['alba.small1']); assertReachability(r, ['alba.small1']);
  r = read(r);
  for (let i = 0; i < 2; i++) r = read(act(read(choose(r)), 'CONTINUE_TRIAL'));
  r = act(r, 'REQUEST_THEO');
  await replace(r); assertAvailable(app, idsFor('alba')); assertReachability(r, idsFor('alba'));
});

test('loading an earlier manual save closes later introductions despite retained global reading', async () => {
  let r = read(act(start(), 'START_REGION', { regionId: 'alba' }));
  const { app, storage, replace } = await harness(r);
  await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() });
  let major = r;
  for (let i = 0; i < 2; i++) major = read(act(read(choose(major)), 'CONTINUE_TRIAL'));
  const scene = content.scenes[content.trials['alba.major'].introductionSceneId];
  const keys = scene.blocks.map(id => `${id}@${content.textBlocks[id].textRevision}`);
  await replace(major, keys); assertAvailable(app, idsFor('alba'));
  await app.openSaves(); await app.load('manual1');
  assertAvailable(app, ['alba.small1']);
  assert.deepEqual(app.state().run, r);
  assert.deepEqual(app.state().reader.readTextKeys, keys);
  assert.equal(STORAGE_SCHEMA_VERSION, 1); assert.equal(app.state().run.schemaVersion, 1);
  assert.equal(app.state().version, content.contentVersion);
});

test('all eight historical content versions keep their existing links, modal behavior and save data', async () => {
  for (const name of ['legacy', 'alba', 'alba-final', 'hexerei', 'anchoring', 'rude', 'ehrenfels', 'companion-dialogue-unified']) {
    const { content: pack } = await import(`../src/content/${name}.js`);
    let r = read(engine.createRun(pack), pack);
    r = act(r, 'SELECT_COMMANDER', { commanderId: 'commander.alphonse' }, pack);
    for (const characterId of defaultParty) r = act(r, 'TOGGLE_PARTY', { characterId }, pack);
    r = read(act(act(r, 'CONFIRM_PARTY', {}, pack), 'DEPART', {}, pack), pack);
    const { app, storage } = await harness(r);
    const expected = Object.values(pack.regions).filter(region => region.implemented).flatMap(region => region.trialIds);
    assert.deepEqual([...app.introductionLinks().matchAll(/data-id="([^"]+)"/g)].map(m => m[1]), expected, name);
    for (const id of expected) assert.ok(app.introductionModal(id), `${name}/${id}`);
    await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() });
    await app.openSaves(); await app.load('manual1');
    assert.deepEqual(app.state().run, r);
    assert.equal(app.state().version, pack.contentVersion);
    assert.equal(app.state().run.schemaVersion, 1);
  }
});
