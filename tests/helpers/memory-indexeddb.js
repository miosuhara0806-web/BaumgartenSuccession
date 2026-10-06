/**
 * Small transactional IndexedDB test double, not a production fallback.
 * Requests are asynchronous; all transactions serialize; writes publish only on
 * commit. Failure injection checks that production storage uses atomic scopes.
 * Actual browser IndexedDB is covered separately by the browser smoke check.
 */
const copy = value => structuredClone(value);
const domError = name => new DOMException(name, name);

class MemoryTransaction {
  constructor(entry, storeNames, mode, onFinished) {
    this.entry = entry;
    this.names = [...storeNames];
    this.mode = mode;
    this.onFinished = onFinished;
    this.queue = [];
    this.working = new Map();
    this.finished = false;
    this.active = false;
    this.error = null;
    entry.pending.push(this);
    queueMicrotask(() => this.tryStart());
  }

  tryStart() {
    if (this.entry.running || this.entry.pending[0] !== this || this.finished) return;
    this.entry.running = this;
    this.entry.pending.shift();
    this.active = true;
    this.names.forEach(name => this.working.set(name, copy(this.entry.stores.get(name))));
    this.drain();
  }

  objectStore(name) {
    if (!this.names.includes(name) || !this.entry.stores.has(name)) throw domError('NotFoundError');
    const request = operation => {
      if (this.finished) throw domError('TransactionInactiveError');
      const item = { operation, result: undefined, error: null };
      this.queue.push(item);
      if (this.active) queueMicrotask(() => this.drain());
      return item;
    };
    const mutate = operation => {
      if (this.mode === 'readonly') throw domError('ReadOnlyError');
      const failure = this.entry.factory.failures.findIndex(value => value.storeName === name);
      if (failure >= 0) throw domError(this.entry.factory.failures.splice(failure, 1)[0].errorName);
      return operation();
    };
    return {
      get: key => request(() => copy(this.working.get(name).get(key))),
      getAll: () => request(() => [...this.working.get(name).values()].map(copy)),
      put: (value, key) => {
        const captured = copy(value);
        return request(() => mutate(() => { this.working.get(name).set(key, captured); return key; }));
      },
      delete: key => request(() => mutate(() => { this.working.get(name).delete(key); })),
    };
  }

  drain() {
    if (!this.active || this.finished || this.draining) return;
    this.draining = true;
    queueMicrotask(() => {
      this.draining = false;
      if (this.finished) return;
      const item = this.queue.shift();
      if (!item) { this.complete(); return; }
      try {
        item.result = item.operation();
        item.onsuccess?.({ target: item });
      } catch (error) {
        item.error = error;
        this.error = error;
        item.onerror?.({ target: item });
        this.onerror?.({ target: this });
        this.abort();
        return;
      }
      this.drain();
    });
  }

  release() {
    if (this.entry.running === this) this.entry.running = null;
    else this.entry.pending = this.entry.pending.filter(tx => tx !== this);
    queueMicrotask(() => this.entry.pending[0]?.tryStart());
  }

  complete() {
    if (this.finished) return;
    this.finished = true;
    if (this.mode !== 'readonly') this.names.forEach(name => this.entry.stores.set(name, this.working.get(name)));
    this.release();
    this.oncomplete?.({ target: this });
    this.onFinished?.(null);
  }

  abort() {
    if (this.finished) throw domError('InvalidStateError');
    this.finished = true;
    this.error ||= domError('AbortError');
    this.release();
    queueMicrotask(() => {
      this.onabort?.({ target: this });
      this.onFinished?.(this.error);
    });
  }
}

class MemoryDatabase {
  constructor(entry) {
    this.entry = entry;
    this.closed = false;
    this.objectStoreNames = { contains: name => entry.stores.has(name) };
    entry.connections.add(this);
  }

  createObjectStore(name) {
    if (!this.upgrade) throw domError('InvalidStateError');
    if (this.entry.stores.has(name)) throw domError('ConstraintError');
    this.entry.stores.set(name, new Map());
    this.upgrade.names.push(name);
    return this.upgrade.objectStore(name);
  }

  transaction(names, mode = 'readonly') {
    if (this.closed) throw domError('InvalidStateError');
    const list = typeof names === 'string' ? [names] : names;
    if (list.some(name => !this.entry.stores.has(name))) throw domError('NotFoundError');
    return new MemoryTransaction(this.entry, list, mode);
  }

  close() { this.closed = true; this.entry.connections.delete(this); }
}

export class MemoryIndexedDB {
  constructor() { this.databases = new Map(); this.failures = []; }

  open(name, version) {
    const request = { result: undefined, error: null, transaction: null };
    queueMicrotask(() => {
      let entry = this.databases.get(name);
      if (entry && entry.version > version) {
        request.error = domError('VersionError');
        request.onerror?.({ target: request });
        return;
      }
      const oldVersion = entry?.version ?? 0;
      if (!entry) {
        entry = { version, stores: new Map(), connections: new Set(), pending: [], running: null, factory: this };
        this.databases.set(name, entry);
      }
      const database = new MemoryDatabase(entry);
      request.result = database;
      if (oldVersion !== version) {
        const tx = new MemoryTransaction(entry, [], 'versionchange', error => {
          database.upgrade = null;
          request.transaction = null;
          if (error) {
            this.databases.delete(name);
            request.error = error;
            request.onerror?.({ target: request });
          } else request.onsuccess?.({ target: request });
        });
        request.transaction = tx;
        database.upgrade = tx;
        request.onupgradeneeded?.({ oldVersion, newVersion: version, target: request });
      } else request.onsuccess?.({ target: request });
    });
    return request;
  }

  deleteDatabase(name) {
    const request = { result: undefined, error: null };
    queueMicrotask(() => {
      const entry = this.databases.get(name);
      if (entry) {
        [...entry.connections].forEach(db => db.onversionchange?.({ oldVersion: entry.version, newVersion: null }));
        if (entry.connections.size) { request.onblocked?.({ target: request }); return; }
      }
      this.databases.delete(name);
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  failNextWrite(storeName, errorName = 'QuotaExceededError') { this.failures.push({ storeName, errorName }); }
  inspect(name, storeName, key) { return copy(this.databases.get(name).stores.get(storeName).get(key)); }
  seed(name, storeName, key, value) { this.databases.get(name).stores.get(storeName).set(key, copy(value)); }
}
