/** IndexedDB persistence. Run state, global reading, and history have separate ownership. */
export const SLOT_IDS = Object.freeze(['auto', 'manual1', 'manual2', 'manual3']);
export const STORAGE_SCHEMA_VERSION = 1;
const STORE_NAMES = ['slots', 'readerProfile', 'chronicles', 'meta'];
const REGION_IDS = ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels'];

export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StorageError';
    this.code = code;
  }
}

const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.length > 0;
const badData = message => new StorageError('CORRUPT_DATA', message);
const uniqueStrings = values => Array.isArray(values) && values.every(nonempty) && new Set(values).size === values.length;

function storageFailure(error) {
  if (error instanceof StorageError) return error;
  if (error?.name === 'QuotaExceededError') {
    return new StorageError('QUOTA_EXCEEDED', '保存容量が不足している。既存の保存は変更していない。', error);
  }
  return new StorageError('STORAGE_FAILURE', '保存処理に失敗した。現在の進行を保持して再試行できる。', error);
}

function assertSlotId(slotId, manualOnly = false) {
  if (!SLOT_IDS.includes(slotId) || (manualOnly && slotId === 'auto')) {
    throw new StorageError('INVALID_SLOT', '指定された保存枠は使えない。');
  }
}

function assertMeta(meta) {
  if (!isObject(meta) || meta.schemaVersion !== STORAGE_SCHEMA_VERSION || !nonempty(meta.epoch)
    || !Number.isSafeInteger(meta.counter) || meta.counter < 0) {
    throw badData('保存管理情報が破損しているか、対応していない形式になっている。');
  }
}

const revisionOf = meta => `${meta.epoch}:${meta.counter}`;
const emptyProfile = () => ({ schemaVersion: STORAGE_SCHEMA_VERSION, readTextKeys: [] });

function assertProfile(profile) {
  if (!isObject(profile) || profile.schemaVersion !== STORAGE_SCHEMA_VERSION || !uniqueStrings(profile.readTextKeys)) {
    throw badData('既読記録が破損しているか、対応していない形式になっている。');
  }
}

function assertSlot(slot, slotId, validateRun) {
  if (!isObject(slot) || slot.slotId !== slotId || slot.schemaVersion !== STORAGE_SCHEMA_VERSION
    || !nonempty(slot.savedAt) || !Number.isFinite(Date.parse(slot.savedAt)) || !nonempty(slot.saveRevision)) {
    throw badData('保存枠が破損しているか、対応していない形式になっている。');
  }
  validateRun(slot.run);
}

/** Canonical data only; dates and database revision cannot affect completion identity. */
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  throw badData('到達記録には保存可能な確定値だけを使う必要がある。');
}

export function createCompletionSignature(run, record) {
  const trialResults = Object.fromEntries(Object.entries(run.trialResults).map(([id, result]) => [id, {
    choiceId: result.choiceId,
    awardedPoints: result.awardedPoints,
    governanceTags: [...result.governanceTags].sort(),
    contentVersion: result.contentVersion,
  }]));
  return canonical({
    contentVersion: run.contentVersion,
    commanderId: run.commanderId,
    partyIds: [...run.partyIds].sort(),
    visitOrder: run.visitOrder,
    trialResults,
    afterwordConditions: record.afterwordConditions ?? {},
    finalScore: record.finalScore,
    rank: record.rank,
    outcome: record.outcome,
    governance: { ...record.governance, dominantTags: [...record.governance.dominantTags].sort() },
    submittedPolicies: record.submittedPolicies,
    epilogueSnapshot: record.epilogueSnapshot,
    companionAfterwordSnapshots: record.companionAfterwordSnapshots,
  });
}

export async function createCompletionKey(run, record) {
  const identity = canonical({ runId: run.runId, decisionSignature: createCompletionSignature(run, record) });
  // A cryptographic digest avoids lossy checksums and keeps IndexedDB keys compact.
  if (!globalThis.crypto?.subtle) throw new StorageError('UNAVAILABLE', '王国史の保存には安全な実行環境が必要。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return `completion-v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function assertCompletion(run, record) {
  if (run.mode !== 'full' || record.contentStatus !== 'reviewed' || run.contentStatus === 'fixture') {
    throw new StorageError('PROTOTYPE_COMPLETION', '試作・仮データは正式な王国史へ登録できない。');
  }
  if (!['ending', 'completed'].includes(run.position?.phase)
    || !REGION_IDS.every(id => run.chapterProgress?.[id]?.status === 'completed')) {
    throw badData('王都を含む全 5 章の終了前には王国史へ登録できない。');
  }
  const score = Object.values(run.trialResults).reduce((sum, result) => sum + result.awardedPoints, 0);
  const rank = score >= 80 ? 'highSuccess' : score >= 60 ? 'success' : 'failure';
  if (record.finalScore !== score || score < 0 || score > 100 || record.rank !== rank || !nonempty(record.outcome)) {
    throw badData('王国史の最終結果が確定した試練結果と一致しない。');
  }
  if (!isObject(record.governance) || !['single', 'dual', 'balanced'].includes(record.governance.kind)
    || !uniqueStrings(record.governance.dominantTags)
    || record.governance.dominantTags.length !== ({ single: 1, dual: 2, balanced: 0 })[record.governance.kind]) {
    throw badData('王国史の統治傾向の形式が正しくない。');
  }
  if (!isObject(record.submittedPolicies) || Object.keys(record.submittedPolicies).length !== 5
    || !REGION_IDS.every(id => nonempty(record.submittedPolicies[id]?.policyId) && nonempty(record.submittedPolicies[id]?.labelAtCompletion))) {
    throw badData('王国史には全 5 章の政策名の確定コピーが必要。');
  }
  if (!nonempty(record.epilogueSnapshot) || !isObject(record.companionAfterwordSnapshots)
    || Object.keys(record.companionAfterwordSnapshots).length !== 4
    || !run.partyIds.every(id => nonempty(record.companionAfterwordSnapshots[id]))) {
    throw badData('王国史にはエピローグと同行 4 人の後日談の確定本文が必要。');
  }
}

export function createStorage({ indexedDB = globalThis.indexedDB, dbName = 'baumgarten-succession-v1', validateRun, contentStatus = 'fixture' } = {}) {
  if (typeof validateRun !== 'function') throw new TypeError('createStorage requires a content-bound validateRun function.');
  let database = null;
  let opening = null;
  let writeTail = Promise.resolve();

  function assertRun(run) {
    try {
      if (validateRun(run) === false) throw badData('保存する周回の状態が正しくない。');
    } catch (error) {
      throw error instanceof StorageError ? error : new StorageError('INVALID_RUN', error.message, error);
    }
  }

  function transaction(db, names, mode, setup) {
    return new Promise((resolve, reject) => {
      let tx;
      let result;
      let failure;
      const fail = error => {
        failure ||= error;
        try { tx.abort(); } catch { reject(storageFailure(failure)); }
      };
      try {
        tx = db.transaction(names, mode);
        tx.oncomplete = () => resolve(clone(result));
        tx.onabort = () => reject(storageFailure(failure || tx.error));
        tx.onerror = () => { failure ||= tx.error; };
        const read = (storeName, key, callback) => {
          const request = tx.objectStore(storeName).get(key);
          request.onsuccess = () => { try { callback(request.result); } catch (error) { fail(error); } };
        };
        setup({ tx, read, setResult: value => { result = value; }, fail });
      } catch (error) {
        if (tx) fail(error);
        else reject(storageFailure(error));
      }
    });
  }

  function open() {
    if (database) return Promise.resolve();
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new StorageError('UNAVAILABLE', 'この環境ではブラウザ保存を利用できない。')); return; }
      let request;
      let failure;
      let settled = false;
      const rejectOpen = error => { settled = true; reject(storageFailure(error)); };
      try { request = indexedDB.open(dbName, STORAGE_SCHEMA_VERSION); }
      catch (error) { rejectOpen(error); return; }
      request.onupgradeneeded = event => {
        try {
          if (event.oldVersion !== 0) throw badData('この保存形式の自動移行には対応していない。');
          const db = request.result;
          STORE_NAMES.forEach(name => db.createObjectStore(name));
          const epoch = globalThis.crypto.randomUUID();
          request.transaction.objectStore('meta').put({ schemaVersion: STORAGE_SCHEMA_VERSION, epoch, counter: 0 }, 'state');
          request.transaction.objectStore('readerProfile').put(emptyProfile(), 'global');
        } catch (error) { failure = error; request.transaction.abort(); }
      };
      request.onerror = () => rejectOpen(failure || request.error);
      request.onblocked = () => rejectOpen(new StorageError('BLOCKED', '別のタブが保存先を使用している。閉じてから再試行してほしい。'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        if (STORE_NAMES.some(name => !db.objectStoreNames.contains(name))) {
          db.close(); rejectOpen(badData('保存領域が欠けている。既存データは変更していない。')); return;
        }
        db.onversionchange = () => { db.close(); if (database === db) database = null; };
        transaction(db, ['meta'], 'readonly', ({ read, setResult }) => {
          read('meta', 'state', meta => { assertMeta(meta); setResult(true); });
        }).then(() => { database = db; resolve(); }, error => { db.close(); rejectOpen(error); });
      };
    }).finally(() => { opening = null; });
    return opening;
  }

  async function readTransaction(stores, setup) {
    await writeTail;
    await open();
    return transaction(database, stores, 'readonly', setup);
  }

  function enqueue(operation) {
    const pending = writeTail.then(operation);
    writeTail = pending.catch(() => {});
    return pending;
  }

  async function write(stores, expectedRevision, operation) {
    await open();
    return transaction(database, [...new Set(['meta', ...stores])], 'readwrite', context => {
      context.read('meta', 'state', meta => {
        assertMeta(meta);
        if (expectedRevision !== revisionOf(meta)) {
          throw new StorageError('REVISION_CONFLICT', '別の操作またはタブで保存が更新された。古い状態では上書きしていない。');
        }
        if (meta.counter === Number.MAX_SAFE_INTEGER) throw badData('保存 revision の上限に達した。');
        const nextMeta = { ...meta, counter: meta.counter + 1 };
        const revision = revisionOf(nextMeta);
        const finish = result => {
          context.tx.objectStore('meta').put(nextMeta, 'state');
          context.setResult({ revision, ...result });
        };
        operation({ ...context, revision, finish });
      });
    });
  }

  const makeSlot = (slotId, run, revision) => ({
    slotId, schemaVersion: STORAGE_SCHEMA_VERSION, savedAt: new Date().toISOString(), saveRevision: revision, run: clone(run),
  });

  return {
    open,
    async close() {
      await writeTail;
      if (opening) await opening;
      database?.close();
      database = null;
    },
    async getRevision() {
      return readTransaction(['meta'], ({ read, setResult }) => {
        read('meta', 'state', meta => { assertMeta(meta); setResult(revisionOf(meta)); });
      });
    },
    async getSlot(slotId) {
      assertSlotId(slotId);
      return readTransaction(['slots'], ({ read, setResult }) => read('slots', slotId, slot => setResult(slot ?? null)));
    },
    async listSlots() {
      return readTransaction(['slots'], ({ read, setResult }) => {
        const slots = Object.fromEntries(SLOT_IDS.map(id => [id, null]));
        SLOT_IDS.forEach(id => read('slots', id, slot => { slots[id] = slot ?? null; setResult(slots); }));
      });
    },
    async getReaderProfile() {
      return readTransaction(['readerProfile'], ({ read, setResult }) => {
        read('readerProfile', 'global', profile => { assertProfile(profile); setResult(profile); });
      });
    },
    async commitAuto(run, { expectedRevision, readTextKeys = [] } = {}) {
      const snapshot = clone(run);
      const keys = clone(readTextKeys);
      assertRun(snapshot);
      if (!Array.isArray(keys) || !keys.every(nonempty)) throw badData('既読キーの形式が正しくない。');
      return enqueue(() => write(['slots', 'readerProfile'], expectedRevision, ({ tx, read, revision, finish }) => {
        read('readerProfile', 'global', existing => {
          assertProfile(existing);
          const readerProfile = { ...existing, readTextKeys: [...new Set([...existing.readTextKeys, ...keys])].sort() };
          const slot = makeSlot('auto', snapshot, revision);
          tx.objectStore('slots').put(slot, 'auto');
          tx.objectStore('readerProfile').put(readerProfile, 'global');
          finish({ slot, readerProfile });
        });
      }));
    },
    async saveManual(slotId, run, { expectedRevision } = {}) {
      assertSlotId(slotId, true);
      const snapshot = clone(run);
      assertRun(snapshot);
      return enqueue(() => write(['slots'], expectedRevision, ({ tx, revision, finish }) => {
        const slot = makeSlot(slotId, snapshot, revision);
        tx.objectStore('slots').put(slot, slotId);
        finish({ slot });
      }));
    },
    async loadSlot(slotId, { expectedRevision } = {}) {
      assertSlotId(slotId);
      return enqueue(() => write(['slots'], expectedRevision, ({ tx, read, revision, finish }) => {
        read('slots', slotId, source => {
          if (!source) throw new StorageError('EMPTY_SLOT', 'この保存枠は空になっている。');
          assertSlot(source, slotId, assertRun);
          const slot = makeSlot('auto', source.run, revision);
          tx.objectStore('slots').put(slot, 'auto');
          finish({ slot, run: clone(source.run) });
        });
      }));
    },
    async deleteSlot(slotId, { expectedRevision } = {}) {
      assertSlotId(slotId);
      return enqueue(() => write(['slots'], expectedRevision, ({ tx, finish }) => {
        tx.objectStore('slots').delete(slotId);
        finish({});
      }));
    },
    async listChronicles() {
      return readTransaction(['chronicles'], ({ tx, setResult, fail }) => {
        const request = tx.objectStore('chronicles').getAll();
        request.onsuccess = () => {
          try {
            if (!request.result.every(record => isObject(record) && nonempty(record.completionKey))) throw badData('王国史の記録形式が正しくない。');
            setResult(request.result.sort((left, right) => (right.recordedAt ?? '').localeCompare(left.recordedAt ?? '')));
          } catch (error) { fail(error); }
        };
      });
    },
    async recordCompletion(run, record, { expectedRevision } = {}) {
      const snapshot = clone(run);
      const provided = clone(record);
      if (contentStatus !== 'reviewed') throw new StorageError('PROTOTYPE_COMPLETION', '正式確認前の内容から王国史へ登録することはできない。');
      assertRun(snapshot);
      assertCompletion(snapshot, provided);
      return enqueue(async () => {
        const completionKey = await createCompletionKey(snapshot, provided);
        const decisionSignature = createCompletionSignature(snapshot, provided);
        return write(['slots', 'chronicles'], expectedRevision, ({ tx, read, revision, finish }) => {
          read('chronicles', completionKey, existing => {
            const completedRecord = existing ?? {
              ...provided,
              schemaVersion: STORAGE_SCHEMA_VERSION,
              id: completionKey,
              completionKey,
              runId: snapshot.runId,
              contentVersion: snapshot.contentVersion,
              commanderId: snapshot.commanderId,
              partyIds: [...snapshot.partyIds],
              visitOrder: [...snapshot.visitOrder],
              recordedAt: new Date().toISOString(),
              decisionSignature,
            };
            if (existing) {
              assertCompletion(snapshot, existing);
              if (existing.completionKey !== completionKey || existing.runId !== snapshot.runId
                || existing.decisionSignature !== decisionSignature || existing.schemaVersion !== STORAGE_SCHEMA_VERSION
                || createCompletionSignature(snapshot, existing) !== decisionSignature) {
                throw badData('同じ到達キーの王国史が破損している。上書きは行っていない。');
              }
            }
            const completedRun = {
              ...snapshot,
              position: { phase: 'completed' },
              completionKey,
              endingSnapshot: clone(completedRecord),
            };
            assertRun(completedRun);
            if (!existing) tx.objectStore('chronicles').put(completedRecord, completionKey);
            tx.objectStore('slots').put(makeSlot('auto', completedRun, revision), 'auto');
            finish({ record: completedRecord, run: completedRun });
          });
        });
      });
    },
  };
}
