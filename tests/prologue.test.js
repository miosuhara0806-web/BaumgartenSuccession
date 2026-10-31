import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { content } from '../src/content/prologue.js';
import { content as previous } from '../src/content/companion-dialogue-unified.js';
import { defaultContent, contentForRun } from '../src/content/catalog.js';
import { manuscript } from '../src/content/prologue-manuscript.js';
import * as engine from '../src/engine.js';
import { createStorage, STORAGE_SCHEMA_VERSION } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';
import { act, read, tutorial, draft, start, choose, finishCity, permutations, defaultParty } from './helpers/prologue.js';

const eventId = 'event.midgame-reunion';
const source = await readFile(new URL('../docs/prologue-source-20261031.md', import.meta.url), 'utf8');
const section = n => source.match(new RegExp(`^## ${n}\\.[^\\n]*\\n([\\s\\S]*?)(?=^## \\d+\\.|$(?![\\s\\S]))`, 'm'))[1].split('\n---')[0].trim();
const gameData = r => ({ chapterProgress: r.chapterProgress, trialResults: r.trialResults, visitOrder: r.visitOrder,
  heardConversationIds: r.heardConversationIds, acquiredInformation: r.acquiredInformation, theoInvestigations: r.theoInvestigations, storyEvents: r.storyEvents });
const roundtrip = r => { const copy = JSON.parse(JSON.stringify(r)); engine.validateRun(copy, contentForRun(copy)); assert.deepEqual(copy, r); return copy; };

test('new default is isolated; all 15 trials, 5 cities, old blocks, conversations, memos, Theo and characters are unchanged', () => {
  assert.equal(defaultContent, content);
  assert.equal(contentForRun(engine.createRun(previous)), previous);
  for (const key of ['characters', 'commanders', 'regions', 'trials', 'conversations', 'information', 'investigations']) assert.deepEqual(content[key], previous[key], key);
  for (const key of ['textBlocks', 'scenes']) for (const [id, value] of Object.entries(previous[key])) assert.deepEqual(content[key][id], value, id);
  for (const key of ['mode', 'partySelection', 'enforceChoiceScores', 'endingSceneId', 'finalChapterCompletion', 'completionNotice']) assert.deepEqual(content[key], previous[key], key);
  assert.deepEqual(Object.keys(content.storyEvents), [eventId]);
  assert.equal(STORAGE_SCHEMA_VERSION, 1); assert.equal(engine.createRun(content).schemaVersion, 1);
  assert.equal(content.speakers['support.king'].name, '現王');
  assert.equal(content.speakers['support.overseer'].name, '監督官');
  assert.equal(content.speakers['support.chancellor'].name, '宰相');
});

test('approved dialogue/narration and all eight introductions match the source, including both protagonist variants', () => {
  const expectedSections = { intro: 4, courtCommon: 21, courtAlphonse: 22, courtRosemond: 23, reunionAlphonse: 28, reunionRosemond: 29 };
  for (const [key, n] of Object.entries(expectedSections)) {
    const quotes = section(n).match(/「[^」]*」/g) || [];
    assert.deepEqual(manuscript[key].filter(row => row.speakerId).map(row => row.text), quotes, key);
    const text = section(n).replace(/^### .+$/gm, '').replace(/^(現王|監督官|アルフォンス|ローズモンド|主人公)：\n/gm, '')
      .replace(/^【.+】$/gm, '').trim().replace(/\s/g, '');
    assert.equal(manuscript[key].map(row => row.text).join('').replace(/\s/g, ''), text, key);
  }
  assert.deepEqual(content.scenes['prologue.court'].blocks.slice(0, manuscript.courtCommon.length)
    .map(id => ({ text: content.textBlocks[id].text, speakerId: content.textBlocks[id].speakerId })), manuscript.courtCommon);
  for (const [id, p] of Object.entries(content.companionProfiles)) {
    const name = content.characters[id].name;
    const text = section(16).split(`### ${name}\n`)[1].split('\n### ')[0].trim();
    assert.equal(`人物紹介：\n${p.profile}\n\n旅で活きる視点：\n${p.perspective}\n\n本人の一言：\n${p.quote}`, text);
    assert.ok(section(14).includes(`${name}：\n「${p.summary}」`));
  }
  for (const commanderId of Object.keys(content.commanders)) {
    const r = { commanderId }, alphonse = commanderId.endsWith('alphonse');
    for (const [sceneId, n, excludedReply, extra] of [
      ['prologue.tutorial.after', 10, alphonse ? '「分かりました」' : '「分かった」', section(11)],
      ['prologue.departure', 24, alphonse ? '「ええ」' : '「ああ」', ''],
    ]) {
      const expected = (section(n) + extra).match(/「[^」]*」/g).filter(text => text !== excludedReply);
      const actual = content.scenes[sceneId].blocks.map(id => content.textBlocks[id])
        .filter(b => b.speakerId && engine.evaluateCondition(b.condition, r, content));
      assert.deepEqual(actual.map(b => b.text), expected, `${sceneId}/${commanderId}`);
      assert.ok(actual.some(b => b.speakerId === commanderId));
    }
  }
  const actors = new Set([...Object.keys(content.characters), ...Object.keys(content.commanders), ...Object.keys(content.speakers)]);
  for (const b of Object.values(content.textBlocks).filter(b => b.id.startsWith('text.prologue.'))) {
    assert.ok(!b.speakerId || actors.has(b.speakerId), b.id);
    assert.deepEqual(b.informationIdsOnAcknowledge, []);
  }
});

test('the nine approved original PNGs have a fixed ID mapping, with Theo excluded from selection and saves', async () => {
  const hashes = {
  "sandro": "600d7bc78861a9e09effdd7c051141944b2f330f1de90f0154920aa4dd157e83",
  "madian": "83d52421af5cf531f67021c24ae969f27af89b720bc912816d70e574f85cb7af",
  "frederica": "16fa16d6c8156dea30733c4fc51e7f5e7ed20d5cdc36260b254027ae3957bd7c",
  "theo": "e890eb9f58fa622572bd9c57f3120c319734230a5fd24a4c16dc3ec7c62caaf8",
  "vantalt": "ecde2d3a356f789ff9e34f8cb8150fa1eed09318e9e479c625a71ed9efa3b8df",
  "heidemarie": "1f4ca92e86ced4f869e633458061819bd5f769c4aaee6e874d37ef62dce9bf66",
  "harold": "1bd7c6e6861980f14cfa1eed5de2a127a9a69a6b1de0d91a8a695f59d17ae41f",
  "lisette": "b57b37132995b53ba92358c2132046223f8ff29a655a04166732003091a2ccf6",
  "olivel": "05880fe90336850eb49c2e002ad4f5ceda06c46e1b0f13727e2bff2ce318d7e3"
};
  const expected = Object.keys(content.characters).concat('support.theo');
  assert.deepEqual(Object.keys(content.portraits), expected);
  assert.equal(content.characters['support.theo'], undefined);
  for (const id of expected) {
    const asset = content.portraits[id];
    const file = await readFile(new URL(`../${asset.src.replace('./', '')}`, import.meta.url));
    assert.equal(createHash('sha256').update(file).digest('hex'), hashes[id.split('.')[1]]);
    assert.match(asset.position, /^\d+% \d+%$/);
  }
  assert.doesNotMatch(JSON.stringify(start()), /data:image|portrait|\.png/);
});

test('tutorial gates judgment until all 3 locations are read, in each possible order, with no gameplay effects', () => {
  for (const commander of Object.keys(content.commanders)) for (const order of permutations(Object.keys(content.prologue.tutorial.locations))) {
    let r = tutorial(commander);
    const before = gameData(r);
    assert.equal(r.partyIds.length, 0);
    assert.throws(() => act(r, 'TOGGLE_PARTY', { characterId: 'char.harold' }));
    assert.throws(() => act(r, 'START_REGION', { regionId: 'alba' }));
    assert.throws(() => act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' }));
    for (const [i, locationId] of order.entries()) {
      r = act(r, 'INSPECT_TUTORIAL_LOCATION', { locationId });
      roundtrip(r);
      assert.equal(r.tutorial.judgmentUnlocked, false);
      r = read(r);
      assert.equal(r.tutorial.investigatedLocationIds.length, i + 1);
      assert.equal(r.tutorial.judgmentUnlocked, i === 2);
      if (i < 2) assert.throws(() => act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' }));
    }
    const investigated = r.tutorial.investigatedLocationIds;
    r = read(act(r, 'INSPECT_TUTORIAL_LOCATION', { locationId: order[0] }));
    assert.deepEqual(r.tutorial.investigatedLocationIds, investigated);
    for (const choiceId of ['a', 'c', 'a']) {
      r = read(roundtrip(act(r, 'DECIDE_TUTORIAL', { choiceId })));
      assert.equal(r.position.stage, 'investigate'); assert.equal(r.tutorial.completed, false);
    }
    r = act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' });
    assert.equal(r.tutorial.completed, true); assert.equal(r.tutorial.postSuccessProcessed, false);
    assert.throws(() => act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' }));
    const correctId = engine.getCurrentText(r, content).id;
    r = act(roundtrip(r), 'ACK_TEXT');
    assert.notEqual(engine.getCurrentText(roundtrip(r), content).id, correctId);
    r = read(r);
    assert.equal(r.position.phase, 'draft'); assert.equal(r.tutorial.postSuccessProcessed, true);
    assert.deepEqual(gameData(r), before); assert.equal(engine.getTotalScore(r), 0); assert.equal(engine.getTheoRemaining(r), 2);
    roundtrip(r);
    assert.throws(() => act(r, 'SELECT_COMMANDER', { commanderId: commander }));
    assert.throws(() => act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' }));
  }
});

const actors = Object.keys(content.characters), parties = [];
for (let a=0;a<5;a++) for(let b=a+1;b<6;b++) for(let c=b+1;c<7;c++) for(let d=c+1;d<8;d++) parties.push([actors[a],actors[b],actors[c],actors[d]]);
test('all 70 free parties × 2 protagonists confirm, reselect without losing state, and lock permanently', () => {
  assert.equal(parties.length, 70);
  for (const commanderId of Object.keys(content.commanders)) {
    const seed = draft(commanderId);
    for (const party of parties) {
      let r = seed;
      assert.throws(() => act(r, 'TOGGLE_PARTY', { characterId: 'support.theo' }));
      for (const [i, characterId] of party.entries()) {
        assert.throws(() => act(r, 'CONFIRM_PARTY'));
        r = act(r, 'TOGGLE_PARTY', { characterId }); assert.equal(r.partyIds.length, i + 1);
      }
      const opponent = engine.getOpponentParty(r, content).map(c => c.id);
      assert.equal(opponent.length, 4); assert.equal(new Set([...party, ...opponent]).size, 8);
      assert.throws(() => act(r, 'TOGGLE_PARTY', { characterId: opponent[0] }));
      r = act(r, 'CONFIRM_PARTY'); roundtrip(r);
      r = act(r, 'BACK_TO_DRAFT'); assert.deepEqual(r.partyIds, party);
      r = act(r, 'TOGGLE_PARTY', { characterId: party[0] }); assert.equal(r.partyIds.length, 3);
      r = act(r, 'TOGGLE_PARTY', { characterId: party[0] });
      r = act(act(r, 'CONFIRM_PARTY'), 'DEPART');
      assert.equal(r.position.sceneId, 'prologue.court');
      assert.throws(() => act(r, 'BACK_TO_DRAFT'));
      assert.throws(() => act(r, 'TOGGLE_PARTY', { characterId: party[0] }));
      r = read(r); assert.equal(r.position.phase, 'map'); assert.deepEqual(r.partyIds, party);
      assert.deepEqual(engine.getOpponentParty(r, content).map(c => c.id), opponent);
      assert.throws(() => act(r, 'TOGGLE_PARTY', { characterId: party[0] })); roundtrip(r);
    }
  }
});

test('Alba small2 D requires Lisette AND this run\'s conversation; C=5 and D=4 are unchanged', () => {
  for (const withLisette of [false, true]) {
    let r = start(withLisette ? defaultParty : actors.slice(0, 4));
    r = read(act(r, 'START_REGION', { regionId: 'alba' }));
    r = read(act(read(choose(r)), 'CONTINUE_TRIAL'));
    assert.ok(!engine.getAvailableChoices(r, content).some(c => c.id.endsWith('.d')));
    if (!withLisette) {
      assert.throws(() => act(r, 'OPEN_CONVERSATION', { conversationId: 'conversation.alba.small2.lisette' })); continue;
    }
    const before = structuredClone(r);
    r = read(act(r, 'OPEN_CONVERSATION', { conversationId: 'conversation.alba.small2.lisette' }));
    assert.ok(engine.getAvailableChoices(r, content).some(c => c.id.endsWith('.d')));
    assert.ok(!engine.getAvailableChoices(roundtrip(before), content).some(c => c.id.endsWith('.d')));
    assert.equal(choose(r, 'c').trialResults['alba.small2'].awardedPoints, 5);
    assert.equal(choose(r, 'd').trialResults['alba.small2'].awardedPoints, 4);
  }
});

test('2nd city closing is completely read and committed before reunion; no map or trials are usable until it ends', () => {
  for (const commanderId of Object.keys(content.commanders)) {
    let r = finishCity(start(defaultParty, commanderId), 'hexerei');
    assert.equal(r.position.phase, 'map'); assert.deepEqual(r.storyEvents, {});
    r = finishCity(r, 'alba', { stopBeforeClosing: true });
    assert.equal(r.position.phase, 'chapterClosing'); assert.equal(r.chapterProgress.alba.status, 'active');
    assert.deepEqual(r.storyEvents, {});
    while (r.position.phase === 'chapterClosing') r = act(roundtrip(r), 'ACK_TEXT');
    assert.equal(r.position.phase, 'storyEvent'); assert.equal(r.chapterProgress.alba.status, 'completed');
    assert.equal(r.storyEvents[eventId].status, 'inProgress');
    assert.throws(() => act(r, 'START_REGION', { regionId: 'alba' })); assert.throws(() => act(r, 'RETURN_MAP'));
    assert.equal(engine.canUseTheo(r, content), false); assert.deepEqual(engine.getAvailableChoices(r, content), []);
    assert.deepEqual(engine.getAvailableConversations(r, content), []);
    const unchanged = gameData(r), seen = [];
    while (engine.getCurrentText(r, content)) {
      const b = engine.getCurrentText(r, content); seen.push(b.text);
      assert.ok(!b.speakerId || b.speakerId.startsWith('commander.'));
      r = act(roundtrip(r), 'ACK_TEXT');
    }
    assert.deepEqual(seen, manuscript[commanderId.endsWith('alphonse') ? 'reunionAlphonse' : 'reunionRosemond'].map(row => row.text));
    assert.equal(r.position.phase, 'map'); assert.equal(r.storyEvents[eventId].status, 'completed');
    assert.deepEqual(gameData(r), { ...unchanged, storyEvents: { [eventId]: { status: 'completed' } } });
    assert.deepEqual(act(roundtrip(r), 'RETURN_MAP'), r);
    assert.deepEqual(start(defaultParty, commanderId).storyEvents, {});
  }
});

test('24 free city orders × 2 protagonists finish all 15 trials with unchanged choices/tags, all eligible voices and Theo limits', () => {
  let runs = 0, voices = 0;
  for (const commanderId of Object.keys(content.commanders)) for (const order of permutations(['alba','hexerei','anchoring','rude'])) {
    let r = start(parties[(runs * 13) % 70], commanderId), encounters = 0;
    for (const [i, city] of [...order, 'ehrenfels'].entries()) {
      if (i < 4) assert.throws(() => act(r, 'START_REGION', { regionId: 'ehrenfels' }));
      r = read(act(r, 'START_REGION', { regionId: city }));
      for (let j = 0; j < 3; j++) {
        for (const c of engine.getAvailableConversations(r, content)) {
          const score = engine.getTotalScore(r); r = read(act(r, 'OPEN_CONVERSATION', { conversationId: c.id }));
          assert.equal(engine.getTotalScore(r), score); voices++;
        }
        if (j === 2) {
          assert.equal(engine.canUseTheo(r, content), i < 2);
          if (i < 2) { r = act(r, 'REQUEST_THEO'); assert.deepEqual(act(r, 'REQUEST_THEO'), r); r = read(r); }
        }
        assert.deepEqual(engine.getAvailableChoices(r, content), engine.getAvailableChoices(r, previous));
        r = read(choose(r, 'a'));
        r = act(r, 'CONTINUE_TRIAL');
        if (j === 2) {
          r = read(r, content, state => state.position.phase === 'storyEvent');
          assert.equal(r.position.phase === 'storyEvent', i === 1);
          if (r.position.phase === 'storyEvent') { encounters++; r = read(roundtrip(r)); }
        } else r = read(r);
      }
      assert.equal(r.position.phase, 'map'); roundtrip(r);
    }
    assert.deepEqual(r.visitOrder, order); assert.equal(encounters, 1);
    assert.equal(Object.keys(r.trialResults).length, 15); assert.equal(engine.getTheoRemaining(r), 0);
    assert.equal(r.endingSnapshot, undefined); assert.equal(r.completionKey, undefined); runs++;
  }
  assert.equal(runs, 48); assert.ok(voices > 500);
});

test('actual auto/manual persistence keeps tutorial, selection, court, departure and reunion positions exact; old content stays old', async () => {
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: r => engine.validateRun(r, contentForRun(r)) });
  await storage.open();
  const snapshots = [];
  let r = tutorial(); snapshots.push(r);
  for (const locationId of Object.keys(content.prologue.tutorial.locations)) {
    r = act(r, 'INSPECT_TUTORIAL_LOCATION', { locationId }); snapshots.push(r); r = read(r);
  }
  r = act(r, 'DECIDE_TUTORIAL', { choiceId: 'a' }); snapshots.push(r); r = read(r);
  r = act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' }); snapshots.push(r);
  r = act(r, 'ACK_TEXT'); snapshots.push(r); r = read(r); snapshots.push(r);
  for (const characterId of defaultParty) r = act(r, 'TOGGLE_PARTY', { characterId });
  r = act(r, 'CONFIRM_PARTY'); snapshots.push(r);
  r = act(r, 'DEPART'); snapshots.push(r);
  r = read(r, content, state => state.position.sceneId === 'prologue.departure'); snapshots.push(r); r = read(r);
  r = finishCity(r, 'alba'); r = finishCity(r, 'anchoring', { stopBeforeClosing: true });
  r = read(r, content, state => state.position.phase === 'storyEvent'); snapshots.push(r);
  r = act(r, 'ACK_TEXT'); snapshots.push(r); r = read(r); snapshots.push(r);
  let old = read(engine.createRun(previous), previous);
  old = act(old, 'SELECT_COMMANDER', { commanderId: 'commander.rosemond' }, previous);
  assert.equal(old.position.phase, 'draft'); assert.equal(old.tutorial, undefined);
  for (const characterId of defaultParty) old = act(old, 'TOGGLE_PARTY', { characterId }, previous);
  old = read(act(act(old, 'CONFIRM_PARTY', {}, previous), 'DEPART', {}, previous), previous);
  old = finishCity(finishCity(old, 'hexerei', { pack: previous }), 'rude', { pack: previous });
  assert.equal(old.position.phase, 'map'); assert.deepEqual(old.storyEvents, {}); snapshots.push(old);
  await storage.saveManual('manual3', old, { expectedRevision: await storage.getRevision() });
  for (const state of snapshots) {
    await storage.commitAuto(state, { expectedRevision: await storage.getRevision() });
    await storage.saveManual('manual1', state, { expectedRevision: await storage.getRevision() });
    for (const slot of ['auto', 'manual1']) {
      const loaded = await storage.loadSlot(slot, { expectedRevision: await storage.getRevision() });
      assert.deepEqual(loaded.run, state); roundtrip(loaded.run);
    }
  }
  assert.deepEqual((await storage.getSlot('manual3')).run, old);
});

test('validation rejects inconsistent tutorial state, skips, and tutorial injection into a historical edition', () => {
  const seed = tutorial();
  for (const mutate of [r => delete r.tutorial, r => r.tutorial.judgmentUnlocked = true,
    r => r.tutorial.investigatedLocationIds = ['warehouse', 'warehouse'], r => r.tutorial.postSuccessProcessed = true,
    r => r.position = { phase: 'draft' }, r => r.tutorial.completed = true,
    r => r.position = { phase: 'tutorial', stage: 'location', locationId: 'bad', sceneId: 'prologue.tutorial.warehouse', blockIndex: 0 }]) {
    const r = structuredClone(seed); mutate(r); assert.throws(() => engine.validateRun(r, content));
  }
  const old = engine.createRun(previous); old.tutorial = seed.tutorial;
  assert.throws(() => engine.validateRun(old, previous));
});
