import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import { createHelpers } from './helpers/prologue.js';
import { createStorage } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';

const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/await init\(\);\s*$/, '');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const targets = ['anchoring.small2', 'hexerei.major'];
const cities = ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels'];
function view(storage = {}) {
  const dom = { addEventListener() {}, querySelector() { return dom; }, querySelectorAll() { return []; } };
  const context = vm.createContext({ defaultContent, contentForRun, ...engine, createStorage: () => storage,
    document: dom, structuredClone, window: { scrollTo() {} }, setTimeout: () => 0, clearTimeout() {} });
  new vm.Script(source + `
    render=()=>syncReadingSession();
    globalThis.api={
      initialize(state,saved={}){run=structuredClone(state);content=contentForRun(run);reader=saved.readerProfile||{readTextKeys:[]};revision=saved.revision;slotsRevision=revision;title=false;ready=true;},
      state:()=>structuredClone({run,reader,revision}),
      introductionText,introductionBlocks,introductionPanel,introductionModal,handle,perform,load,openSaves
    };
  `).runInContext(context);
  return context.api;
}
function samples(pack = defaultContent) {
  const h = createHelpers(pack), rows = [];
  for (const commanderId of Object.keys(pack.commanders)) {
    let r = h.start(undefined, commanderId);
    for (const city of cities) {
      const base = r;
      r = h.act(r, 'START_REGION', { regionId: city });
      for (let i = 0; i < 3; i++) {
        rows.push(r);
        r = h.act(h.read(h.choose(h.read(r))), 'CONTINUE_TRIAL');
      }
      r = h.finishCity(base, city);
    }
  }
  return rows;
}
const current = samples();
const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g,
  (_, entity) => ({ amp:'&', lt:'<', gt:'>', quot:'"', '#39':"'" }[entity]));
const paragraphs = article => [...article.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => decode(m[1]));

test('both commanders see one neutral label in all 15 normal/replay views; 13 novels and all source blocks keep their pre-fix hashes', () => {
  const app = view(), unchangedArticles = [], blocks = [];
  for (const r of current) {
    app.initialize(r);
    const before = app.state(), sceneId = r.position.sceneId, id = r.position.trialId;
    const article = app.introductionText(sceneId), panel = app.introductionPanel(), modal = app.introductionModal(id);
    assert.match(panel, /<p class="small muted">導入小説<\/p>/);
    assert.match(modal.body, /<p class="small muted">導入小説<br>閲覧のみ。進行・得点・情報・既読は変更しません。<\/p>/);
    assert.doesNotMatch(panel + modal.body, /10月16日版|正式原稿|正式版/);
    assert.ok(panel.includes(article) && modal.body.includes(article));
    assert.equal(modal.title, defaultContent.scenes[sceneId].title);
    assert.deepEqual(app.state(), before);
    const key = `${r.commanderId}/${id}`;
    blocks.push([key, app.introductionBlocks(sceneId)]);
    if (!targets.includes(id)) unchangedArticles.push([key, article]);
  }
  // Frozen from main b867278 BEFORE the display edit, including the one
  // intentional single newline in anchoring.small1 and commander read variants.
  assert.equal(unchangedArticles.length, 26);
  assert.equal(hash(unchangedArticles), '87931c7d709b98bd63205ad5c0a8e8d039a4224c15ceb5e209e170c2f76e79a3');
  assert.equal(hash(blocks), '868a2cf1db81376a78ced96bd46e4d3ad7ffbd97cba6de2913f9cd68fb0e6769');
});

test('the complete two novels join 54 reviewed wraps, keep the narration contrast, and never break inside continuous dialogue', () => {
  const pauses = {
    'anchoring.small2': { 28:1 },
    'hexerei.major': {},
  };
  const app = view();
  for (const r of current.filter(r => targets.includes(r.position.trialId))) {
    app.initialize(r);
    const id = r.position.trialId, raw = app.introductionBlocks(r.position.sceneId).flatMap(b => b.text.split('\n\n'));
    const shown = paragraphs(app.introductionText(r.position.sceneId));
    assert.equal(shown.length, id === 'anchoring.small2' ? 38 : 19);
    assert.equal(shown.length, raw.length);
    let beforeCount = 0, afterCount = 0;
    raw.forEach((paragraph, index) => {
      const lines = paragraph.split('\n'), keep = pauses[id][index + 1];
      // Independent expected output: keep only the reviewed narration contrast.
      // All dialogue stays inside its original paragraph and quotation marks.
      const expected = keep ? lines.slice(0, keep).join('') + '\n' + lines.slice(keep).join('') : lines.join('');
      assert.equal(shown[index], expected, `${id}, paragraph ${index + 1}`);
      assert.equal(shown[index].replaceAll('\n', ''), paragraph.replaceAll('\n', ''));
      if (paragraph.startsWith('「')) assert.doesNotMatch(shown[index], /\n/);
      beforeCount += lines.length - 1;
      afterCount += (shown[index].match(/\n/g) || []).length;
    });
    assert.equal(beforeCount, id === 'anchoring.small2' ? 30 : 25);
    assert.equal(afterCount, id === 'anchoring.small2' ? 1 : 0);
    assert.equal(beforeCount - afterCount, id === 'anchoring.small2' ? 29 : 25);
  }
});

test('historical editions stay immutable and the current edition changes only the approved Alba closing dialogue', async () => {
  const packs = [];
  for (const name of ['legacy','alba','alba-final','hexerei','anchoring','rude','ehrenfels',
    'companion-dialogue-unified','prologue','ending','map-return','ending-reading']) {
    const { content } = await import(`../src/content/${name}.js`);
    packs.push([name, content]);
  }
  const previous = packs.find(([name]) => name === 'map-return')[1];
  const current = packs.find(([name]) => name === 'ending-reading')[1];
  const oldClosing = previous.textBlocks['text.alba.closing'];
  const closing = current.textBlocks['text.alba.closing'];
  assert.deepEqual(closing, {
    ...oldClosing,
    text: 'アルバでの三つの判断を記録しました。今回提出した政策は、あくまで現王に示す案であり、ここで実施が決まるものではありません。\n\nここまでの経験も、次の都市での判断につながっていくでしょう。\n\n地図に戻り、次の目的地へ進んでください。',
    textRevision: 2,
  });
  // Restore only the approved fields in a copy: the frozen hash still covers all
  // historical editions and every other field of the current edition.
  const normalized = structuredClone(packs);
  const normalizedClosing = normalized.find(([name]) => name === 'ending-reading')[1].textBlocks['text.alba.closing'];
  normalizedClosing.text = oldClosing.text;
  normalizedClosing.textRevision = oldClosing.textRevision;
  assert.equal(hash(normalized), '64174781a45bca9e86f0d7c1e236779fe4eb7ef98c79ffa8a822ac067b93b3db');
});

test('current and historical saves render/replay without writes and acknowledge the original read keys and effects exactly once', async () => {
  for (const name of ['ending-reading', 'prologue', 'ending', 'map-return']) {
    const { content: pack } = await import(`../src/content/${name}.js`);
    const rows = name === 'ending-reading' ? current : samples(pack);
    for (const r of rows.filter(r => targets.includes(r.position.trialId))) {
      const storage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: r => engine.validateRun(r, contentForRun(r)) });
      await storage.open();
      const app = view(storage);
      app.initialize(r);
      const keys = Array.from(app.introductionBlocks(r.position.sceneId), b => b.readKey);
      await storage.commitAuto(r, { expectedRevision: await storage.getRevision(), readTextKeys: keys });
      await storage.saveManual('manual1', r, { expectedRevision: await storage.getRevision() });
      app.initialize(r, { revision:await storage.getRevision(), readerProfile:await storage.getReaderProfile() });
      const persisted = async () => ({ revision:await storage.getRevision(), slots:await storage.listSlots(),
        reader:await storage.getReaderProfile(), chronicles:await storage.listChronicles() });
      const before = await persisted(), state = app.state();
      app.introductionPanel();
      await app.handle('introduction', r.position.trialId);
      await app.handle('close-modal');
      assert.deepEqual(await persisted(), before);
      assert.deepEqual(app.state(), state);
      await app.openSaves(); await app.load('manual1');
      assert.deepEqual(app.state().run, r);
      assert.deepEqual((await storage.getReaderProfile()).readTextKeys, keys.slice().sort());
      let commits = 0;
      const commit = storage.commitAuto.bind(storage);
      storage.commitAuto = (...args) => { commits++; return commit(...args); };
      await app.handle('ack-introduction');
      await app.handle('ack-introduction');
      const expected = createHelpers(pack).read(r);
      assert.equal(commits, 1);
      assert.deepEqual(app.state().run, expected);
      assert.deepEqual((await storage.getSlot('auto')).run, expected);
      assert.deepEqual((await storage.getReaderProfile()).readTextKeys, keys.slice().sort());
      assert.deepEqual(await storage.listChronicles(), before.chronicles);
    }
  }
});
