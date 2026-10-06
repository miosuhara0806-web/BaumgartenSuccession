import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, createCompletionKey, SLOT_IDS } from '../src/storage.js';
import { MemoryIndexedDB } from './helpers/memory-indexeddb.js';
import { content } from '../src/content/fixture.js';
import { createRun, transition, getCurrentText, getAvailableChoices, getAvailableConversations, getTotalScore, getTheoRemaining, validateRun } from '../src/engine.js';

const REGIONS = ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels'];
const PARTY = ['char.harold', 'char.frederica', 'char.lisette', 'char.sandro'];

function runFixture(overrides = {}) {
  return {
    schemaVersion: 1, contentVersion: 'test-fixture-1', mode: 'albaPrototype',
    runId: 'test-run-one', startedAt: '2026-10-05T00:00:00.000Z', commanderId: 'commander.alphonse',
    partyIds: [...PARTY], visitOrder: [], position: { phase: 'map' }, chapterProgress: {}, trialResults: {},
    heardConversationIds: [], acquiredInformation: {}, theoInvestigations: {}, storyEvents: {}, recentDialogueLog: [],
    ...overrides,
  };
}

// Intentionally a storage-only validator; engine.test.js tests the content-bound validator.
function validateFixture(run) {
  if (run?.schemaVersion !== 1 || !['test-fixture-1', 'test-reviewed-1'].includes(run.contentVersion)
    || typeof run.runId !== 'string' || !Array.isArray(run.partyIds) || run.invalid === true) {
    throw new Error('Unsupported or corrupt test run.');
  }
  return true;
}

function setup() {
  const indexedDB = new MemoryIndexedDB();
  const dbName = 'isolated-storage-test';
  const options = { indexedDB, dbName, validateRun: validateFixture, contentStatus: 'reviewed' };
  return { indexedDB, dbName, storage: createStorage(options), options };
}

function endingFixture() {
  const run = runFixture({
    contentVersion: 'test-reviewed-1', mode: 'full', visitOrder: REGIONS.slice(0, 4), position: { phase: 'ending' },
    chapterProgress: Object.fromEntries(REGIONS.map(id => [id, { status: 'completed' }])),
    trialResults: Object.fromEntries(REGIONS.flatMap(id => [1, 2, 3].map(ordinal => [`${id}.${ordinal}`, {
      choiceId: `${id}.${ordinal}.choice`, awardedPoints: ordinal === 3 ? 10 : 5,
      governanceTags: ordinal === 3 ? ['people'] : [], contentVersion: 'test-reviewed-1',
    }]))),
  });
  const record = {
    contentStatus: 'reviewed', finalScore: 100, rank: 'highSuccess', outcome: 'test-only successful ending',
    governance: { kind: 'single', dominantTags: ['people'] },
    submittedPolicies: Object.fromEntries(REGIONS.map(id => [id, { policyId: `policy.${id}`, labelAtCompletion: `TEST ${id}` }])),
    afterwordConditions: { metCompanion: true }, epilogueSnapshot: 'TEST ONLY immutable ending text',
    companionAfterwordSnapshots: Object.fromEntries(PARTY.map(id => [id, `TEST ONLY ${id} afterword`])),
  };
  return { run, record };
}

test('creates four empty slots and independent global stores', async () => {
  const { storage } = setup();
  assert.deepEqual(await storage.listSlots(), Object.fromEntries(SLOT_IDS.map(id => [id, null])));
  assert.deepEqual(await storage.getReaderProfile(), { schemaVersion: 1, readTextKeys: [] });
  assert.deepEqual(await storage.listChronicles(), []);
  assert.match(await storage.getRevision(), /:0$/);
});

test('auto commits state and global reading together; new run keeps manual saves and prior reading', async () => {
  const { storage } = setup();
  const first = runFixture({ heardConversationIds: ['conversation.one'], acquiredInformation: { first: { sources: ['conversation.one'] } } });
  let result = await storage.commitAuto(first, { expectedRevision: await storage.getRevision(), readTextKeys: ['text.one@1'] });
  result = await storage.saveManual('manual1', first, { expectedRevision: result.revision });
  const second = runFixture({ runId: 'test-run-two' });
  result = await storage.commitAuto(second, { expectedRevision: result.revision, readTextKeys: ['text.two@1', 'text.one@1'] });
  assert.deepEqual(result.readerProfile.readTextKeys, ['text.one@1', 'text.two@1']);
  assert.deepEqual((await storage.getSlot('auto')).run.heardConversationIds, []);
  assert.deepEqual((await storage.getSlot('auto')).run.acquiredInformation, {});
  assert.equal((await storage.getSlot('manual1')).run.runId, first.runId);
});

test('manual and auto snapshots are copied before asynchronous writes and returned values are detached', async () => {
  const { storage } = setup();
  const run = runFixture();
  const pending = storage.saveManual('manual1', run, { expectedRevision: await storage.getRevision() });
  run.partyIds.length = 0;
  const result = await pending;
  result.slot.run.partyIds.length = 0;
  const saved = await storage.getSlot('manual1');
  assert.deepEqual(saved.run.partyIds, PARTY);
  saved.run.partyIds.length = 0;
  assert.deepEqual((await storage.getSlot('manual1')).run.partyIds, PARTY);
});

test('load restores the complete saved state without merging another slot or rolling back global reading', async () => {
  const { storage } = setup();
  const old = runFixture({
    position: { phase: 'trialResult', trialId: 'alba.1', blockIndex: 0 },
    trialResults: { 'alba.1': { choiceId: 'one', awardedPoints: 3, governanceTags: [], contentVersion: 'test-fixture-1' } },
    heardConversationIds: ['earlier'], acquiredInformation: { old: { sources: ['earlier'] } },
    theoInvestigations: { alba: 'theo.alba' }, recentDialogueLog: [{ text: 'earlier log' }],
  });
  let result = await storage.saveManual('manual1', old, { expectedRevision: await storage.getRevision() });
  const manualBefore = await storage.getSlot('manual1');
  result = await storage.commitAuto(runFixture({ heardConversationIds: ['later'], recentDialogueLog: [{ text: 'later log' }] }), {
    expectedRevision: result.revision, readTextKeys: ['earlier@1', 'later@1'],
  });
  result = await storage.loadSlot('manual1', { expectedRevision: result.revision });
  assert.deepEqual(result.run, old);
  assert.deepEqual((await storage.getSlot('auto')).run, old);
  assert.deepEqual(await storage.getSlot('manual1'), manualBefore);
  assert.deepEqual((await storage.getReaderProfile()).readTextKeys, ['earlier@1', 'later@1']);
});

test('three manual slots remain independent, and deleting a normal slot preserves other slots and globals', async () => {
  const { storage } = setup();
  let revision = await storage.getRevision();
  for (const [index, id] of ['manual1', 'manual2', 'manual3'].entries()) {
    ({ revision } = await storage.saveManual(id, runFixture({ runId: `test-run-${index}` }), { expectedRevision: revision }));
  }
  ({ revision } = await storage.commitAuto(runFixture(), { expectedRevision: revision, readTextKeys: ['keep@1'] }));
  await storage.deleteSlot('manual2', { expectedRevision: revision });
  const slots = await storage.listSlots();
  assert.equal(slots.manual2, null);
  assert.equal(slots.manual1.run.runId, 'test-run-0');
  assert.equal(slots.manual3.run.runId, 'test-run-2');
  assert.equal(slots.auto.run.runId, 'test-run-one');
  assert.deepEqual((await storage.getReaderProfile()).readTextKeys, ['keep@1']);
});

test('stale tabs cannot overwrite, delete, or recreate a slot after another tab changes it', async () => {
  const { storage, options } = setup();
  const other = createStorage(options);
  const revision = await storage.getRevision();
  await other.open();
  const attempts = await Promise.allSettled([
    storage.commitAuto(runFixture({ runId: 'first' }), { expectedRevision: revision }),
    other.commitAuto(runFixture({ runId: 'second' }), { expectedRevision: revision }),
  ]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(value => value.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  const beforeDelete = await storage.getRevision();
  await storage.deleteSlot('auto', { expectedRevision: beforeDelete });
  await assert.rejects(other.commitAuto(runFixture(), { expectedRevision: beforeDelete }), { code: 'REVISION_CONFLICT' });
  await assert.rejects(other.deleteSlot('manual1', { expectedRevision: beforeDelete }), { code: 'REVISION_CONFLICT' });
  assert.equal(await storage.getSlot('auto'), null);
});

test('database recreation changes the epoch and rejects an old revision even when counters match', async () => {
  const { storage, indexedDB, dbName } = setup();
  const revision = await storage.getRevision();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = resolve;
    request.onerror = reject;
  });
  const newRevision = await storage.getRevision();
  assert.notEqual(newRevision, revision);
  assert.match(newRevision, /:0$/);
  await assert.rejects(storage.commitAuto(runFixture(), { expectedRevision: revision }), { code: 'REVISION_CONFLICT' });
});

test('queued mutations preserve invocation order and an earlier failure does not poison future retries', async () => {
  const { storage } = setup();
  const revision = await storage.getRevision();
  const [first, second] = await Promise.allSettled([
    storage.saveManual('manual1', runFixture(), { expectedRevision: revision }),
    storage.saveManual('manual2', runFixture(), { expectedRevision: revision }),
  ]);
  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'rejected');
  assert.equal(second.reason.code, 'REVISION_CONFLICT');
  await storage.saveManual('manual2', runFixture(), { expectedRevision: first.value.revision });
  assert.ok(await storage.getSlot('manual2'));
});

test('failed auto/profile or revision write rolls back every write and preserves existing saves', async () => {
  const { storage, indexedDB } = setup();
  const first = await storage.commitAuto(runFixture(), { expectedRevision: await storage.getRevision(), readTextKeys: ['old@1'] });
  for (const failingStore of ['slots', 'readerProfile', 'meta']) {
    indexedDB.failNextWrite(failingStore);
    await assert.rejects(storage.commitAuto(runFixture({ runId: 'unsaved' }), {
      expectedRevision: first.revision, readTextKeys: ['uncommitted@1'],
    }), { code: 'QUOTA_EXCEEDED' });
    assert.equal(await storage.getRevision(), first.revision);
    assert.deepEqual(await storage.getSlot('auto'), first.slot);
    assert.deepEqual((await storage.getReaderProfile()).readTextKeys, ['old@1']);
  }
  const retried = await storage.commitAuto(runFixture({ runId: 'retry' }), { expectedRevision: first.revision });
  assert.equal(retried.slot.run.runId, 'retry');
});

test('corrupt and unsupported slots cannot overwrite auto or affect unrelated slots', async () => {
  const { storage, indexedDB, dbName } = setup();
  const initial = await storage.commitAuto(runFixture(), { expectedRevision: await storage.getRevision() });
  for (const run of [runFixture({ contentVersion: 'future-version' }), runFixture({ schemaVersion: 99 }), runFixture({ invalid: true })]) {
    indexedDB.seed(dbName, 'slots', 'manual1', { ...initial.slot, slotId: 'manual1', run });
    await assert.rejects(storage.loadSlot('manual1', { expectedRevision: initial.revision }), { code: 'INVALID_RUN' });
    assert.deepEqual(await storage.getSlot('auto'), initial.slot);
    assert.equal(await storage.getRevision(), initial.revision);
  }
  indexedDB.seed(dbName, 'slots', 'manual1', { ...initial.slot, slotId: 'manual1', schemaVersion: 99 });
  await assert.rejects(storage.loadSlot('manual1', { expectedRevision: initial.revision }), { code: 'CORRUPT_DATA' });
  assert.ok((await storage.listSlots()).auto);
  await assert.rejects(storage.loadSlot('manual3', { expectedRevision: initial.revision }), { code: 'EMPTY_SLOT' });
});

test('corrupt global reading aborts auto update rather than silently resetting the profile', async () => {
  const { storage, indexedDB, dbName } = setup();
  const initial = await storage.commitAuto(runFixture(), { expectedRevision: await storage.getRevision() });
  indexedDB.seed(dbName, 'readerProfile', 'global', { schemaVersion: 99, readTextKeys: ['preserve'] });
  await assert.rejects(storage.commitAuto(runFixture({ runId: 'new' }), { expectedRevision: initial.revision }), { code: 'CORRUPT_DATA' });
  assert.deepEqual(await storage.getSlot('auto'), initial.slot);
  assert.equal(indexedDB.inspect(dbName, 'readerProfile', 'global').schemaVersion, 99);
});

test('unsupported database and corrupt metadata are rejected without erasing or resetting data', async () => {
  const { storage, indexedDB, dbName, options } = setup();
  const initial = await storage.commitAuto(runFixture(), { expectedRevision: await storage.getRevision() });
  await storage.close();
  const existingMeta = indexedDB.inspect(dbName, 'meta', 'state');
  indexedDB.seed(dbName, 'meta', 'state', { ...existingMeta, schemaVersion: 99 });
  await assert.rejects(createStorage(options).open(), { code: 'CORRUPT_DATA' });
  assert.deepEqual(indexedDB.inspect(dbName, 'slots', 'auto'), initial.slot);
  assert.equal(indexedDB.inspect(dbName, 'meta', 'state').schemaVersion, 99);
  indexedDB.seed(dbName, 'meta', 'state', existingMeta);
  indexedDB.databases.get(dbName).version = 99;
  await assert.rejects(createStorage(options).open(), { code: 'STORAGE_FAILURE' });
  assert.deepEqual(indexedDB.inspect(dbName, 'slots', 'auto'), initial.slot);
});

test('missing IndexedDB or required validation never produces a false successful save', async () => {
  assert.throws(() => createStorage(), TypeError);
  const storage = createStorage({ indexedDB: null, validateRun: validateFixture });
  await assert.rejects(storage.open(), { code: 'UNAVAILABLE' });
  await assert.rejects(storage.commitAuto(runFixture(), { expectedRevision: 'unknown' }), { code: 'UNAVAILABLE' });
});

test('completion key ignores object insertion order and timestamps but distinguishes all arrival inputs', async () => {
  const { run, record } = endingFixture();
  const key = await createCompletionKey(run, record);
  assert.equal(await createCompletionKey({ ...run, startedAt: 'later', partyIds: [...run.partyIds].reverse(),
    trialResults: Object.fromEntries(Object.entries(run.trialResults).reverse()) }, { ...record, recordedAt: 'later' }), key);
  for (const changedRun of [
    { ...run, runId: 'another-run' }, { ...run, commanderId: 'another-commander' },
    { ...run, visitOrder: [...run.visitOrder].reverse() },
    { ...run, trialResults: { ...run.trialResults, 'alba.1': { ...run.trialResults['alba.1'], choiceId: 'different' } } },
  ]) assert.notEqual(await createCompletionKey(changedRun, record), key);
  for (const changedRecord of [
    { ...record, epilogueSnapshot: 'changed text' }, { ...record, afterwordConditions: { metCompanion: false } },
  ]) assert.notEqual(await createCompletionKey(run, changedRecord), key);
});

test('full reviewed completion is atomic, deduplicated, immutable, and independent of save deletion', async () => {
  const { storage } = setup();
  const { run, record } = endingFixture();
  const first = await storage.recordCompletion(run, record, { expectedRevision: await storage.getRevision() });
  assert.equal(first.run.position.phase, 'completed');
  assert.equal(first.run.completionKey, first.record.completionKey);
  assert.deepEqual(first.run.endingSnapshot, first.record);
  const repeated = await storage.recordCompletion(first.run, record, { expectedRevision: first.revision });
  assert.equal(repeated.record.recordedAt, first.record.recordedAt);
  assert.equal((await storage.listChronicles()).length, 1);
  record.epilogueSnapshot = 'changed source content';
  first.record.epilogueSnapshot = 'changed return value';
  assert.equal((await storage.listChronicles())[0].epilogueSnapshot, 'TEST ONLY immutable ending text');
  const changedArrival = await storage.recordCompletion(run, record, { expectedRevision: repeated.revision });
  assert.equal((await storage.listChronicles()).length, 2);
  const anotherRun = await storage.recordCompletion({ ...run, runId: 'another-run' }, record, { expectedRevision: changedArrival.revision });
  assert.equal((await storage.listChronicles()).length, 3);
  await storage.deleteSlot('auto', { expectedRevision: anotherRun.revision });
  assert.equal((await storage.listChronicles()).length, 3);
});

test('failed chronicle commit cannot leave a finished save, and retry produces exactly one record', async () => {
  const { storage, indexedDB } = setup();
  const { run, record } = endingFixture();
  const initial = await storage.commitAuto(runFixture(), { expectedRevision: await storage.getRevision() });
  for (const store of ['chronicles', 'slots', 'meta']) {
    indexedDB.failNextWrite(store);
    await assert.rejects(storage.recordCompletion(run, record, { expectedRevision: initial.revision }), { code: 'QUOTA_EXCEEDED' });
    assert.equal((await storage.listChronicles()).length, 0);
    assert.deepEqual(await storage.getSlot('auto'), initial.slot);
    assert.equal(await storage.getRevision(), initial.revision);
  }
  await storage.recordCompletion(run, record, { expectedRevision: initial.revision });
  assert.equal((await storage.listChronicles()).length, 1);
});

test('a corrupted existing chronicle is never reused as an ending snapshot or overwritten', async () => {
  const { storage, indexedDB, dbName } = setup();
  const { run, record } = endingFixture();
  const result = await storage.recordCompletion(run, record, { expectedRevision: await storage.getRevision() });
  const before = await storage.getSlot('auto');
  const corrupted = { ...result.record, epilogueSnapshot: 'corrupted historical text' };
  indexedDB.seed(dbName, 'chronicles', result.record.completionKey, corrupted);
  await assert.rejects(storage.recordCompletion(run, record, { expectedRevision: result.revision }), { code: 'CORRUPT_DATA' });
  assert.deepEqual(await storage.getSlot('auto'), before);
  assert.equal(await storage.getRevision(), result.revision);
  assert.deepEqual(indexedDB.inspect(dbName, 'chronicles', result.record.completionKey), corrupted);
});

test('prototype, fixture, incomplete final, and missing text never enter official chronicles', async () => {
  const { storage } = setup();
  const { run, record } = endingFixture();
  const revision = await storage.getRevision();
  for (const [candidateRun, candidateRecord, code] of [
    [runFixture(), record, 'PROTOTYPE_COMPLETION'],
    [run, { ...record, contentStatus: 'fixture' }, 'PROTOTYPE_COMPLETION'],
    [{ ...run, contentStatus: 'fixture' }, record, 'PROTOTYPE_COMPLETION'],
    [{ ...run, chapterProgress: { alba: { status: 'completed' } } }, record, 'CORRUPT_DATA'],
    [run, { ...record, companionAfterwordSnapshots: {} }, 'CORRUPT_DATA'],
    [run, { ...record, finalScore: 90 }, 'CORRUPT_DATA'],
  ]) await assert.rejects(storage.recordCompletion(candidateRun, candidateRecord, { expectedRevision: revision }), { code });
  assert.equal(await storage.getRevision(), revision);
  assert.deepEqual(await storage.listChronicles(), []);
  const unreviewedStorage = createStorage({ indexedDB: new MemoryIndexedDB(), validateRun: validateFixture });
  await assert.rejects(unreviewedStorage.recordCompletion(run, record, { expectedRevision: await unreviewedStorage.getRevision() }), { code: 'PROTOTYPE_COMPLETION' });
});

test('real Alba run reloads results and Theo reports without repeating points or consumption; new run retains only global reading', async () => {
  const storage = createStorage({ indexedDB: new MemoryIndexedDB(), dbName: 'real-alba-integration', validateRun: run => validateRun(run, content) });
  let revision = await storage.getRevision();
  let run = createRun(content, { runId: 'real-alba-test' });
  async function act(action) {
    const text = action.type === 'ACK_TEXT' ? getCurrentText(run, content) : null;
    run = transition(run, action, content);
    ({ revision } = await storage.commitAuto(run, { expectedRevision: revision, readTextKeys: text ? [text.readKey] : [] }));
  }
  async function readAll() {
    let budget = 50;
    while (getCurrentText(run, content)) {
      assert.ok(budget-- > 0, 'dialogue must terminate');
      await act({ type: 'ACK_TEXT' });
    }
  }
  await readAll();
  await act({ type: 'SELECT_COMMANDER', commanderId: Object.keys(content.commanders)[0] });
  for (const characterId of PARTY) await act({ type: 'TOGGLE_PARTY', characterId });
  await act({ type: 'CONFIRM_PARTY' });
  await act({ type: 'DEPART' });
  await readAll();
  await act({ type: 'START_REGION', regionId: 'alba' });
  await readAll();
  const optional = getAvailableConversations(run, content)[0];
  await act({ type: 'OPEN_CONVERSATION', conversationId: optional.id });
  await readAll();
  assert.ok(run.heardConversationIds.includes(optional.id));

  for (const trialId of content.regions.alba.trialIds) {
    await readAll();
    if (trialId === 'alba.major') {
      await act({ type: 'REQUEST_THEO' });
      const theoReport = structuredClone(run);
      const reloaded = await storage.loadSlot('auto', { expectedRevision: revision });
      ({ revision, run } = reloaded);
      assert.deepEqual(run, theoReport);
      await act({ type: 'REQUEST_THEO' });
      assert.equal(getTheoRemaining(run), 1);
      await readAll();
      await act({ type: 'REQUEST_THEO' });
      assert.equal(getTheoRemaining(run), 1);
    }
    const choiceId = getAvailableChoices(run, content).at(-1).id;
    await act({ type: 'RESOLVE_TRIAL', trialId, choiceId });
    const score = getTotalScore(run);
    const resultPosition = structuredClone(run.position);
    ({ revision } = await storage.saveManual('manual1', run, { expectedRevision: revision }));
    ({ revision, run } = await storage.loadSlot('manual1', { expectedRevision: revision }));
    assert.deepEqual(run.position, resultPosition);
    await act({ type: 'RESOLVE_TRIAL', trialId, choiceId });
    assert.equal(getTotalScore(run), score);
    await readAll();
    await act({ type: 'CONTINUE_TRIAL' });
  }
  await readAll();
  assert.equal(run.position.phase, 'map');
  assert.equal(run.chapterProgress.alba.status, 'completed');
  assert.equal(Object.keys(run.trialResults).length, 3);
  assert.equal(getTheoRemaining(run), 1);
  assert.deepEqual(await storage.listChronicles(), []);
  const readerBefore = await storage.getReaderProfile();
  assert.ok(readerBefore.readTextKeys.length > 0);
  run = createRun(content, { runId: 'new-real-alba-test' });
  ({ revision } = await storage.commitAuto(run, { expectedRevision: revision }));
  assert.deepEqual(await storage.getReaderProfile(), readerBefore);
  assert.deepEqual(run.heardConversationIds, []);
  assert.deepEqual(run.acquiredInformation, {});
  assert.equal((await storage.getSlot('manual1')).run.runId, 'real-alba-test');
});
