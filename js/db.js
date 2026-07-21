// db.js — IndexedDB open/bootstrap/migrations and transaction primitives (plan §9, §10).
// The IndexedDB database version (DB_VERSION) is the SINGLE schema authority.
//
// Public API:
//   DB_VERSION
//   openDb({ name?, onVersionChange? }) -> Promise<handle>
//     handle.run(storeNames, mode, fn) — fn(stores, tx) executes inside ONE
//       transaction; stores are promisified. INVARIANT: fn may only await the
//       provided store operations — awaiting anything else lets IndexedDB
//       auto-commit the transaction early.
//     handle.close()
//   deleteDb(name) — guided reset only (plan §12 recovery matrix)
//   DbBlockedError — another tab holds an old connection (plan §10 protocol)
//
// Migrations (from v2 on) are steps { structural(db, tx), records: {store: fn} },
// applied sequentially inside the one upgrade transaction — atomic: any error
// aborts and the DB stays at the old version. v1 ships an EMPTY table (§10:
// no invented history). The `records` functions are pure and reused by the
// backup import path (backup.js, Phase 7).

export const DB_VERSION = 2;

// v1 → v2 (change set 1): adds Exercise.muscleGroup (nullable — Ungrouped until
// the owner assigns one) and SetEntry.addOn (required boolean — whether the
// machine's small add-on weight was engaged; its kg value is unknown by design,
// see DECISIONS D7). Records only: no new stores or indexes are needed.
// These same pure transforms are replayed by the backup import path.
export const migrations = {
  1: {
    records: {
      exercises: (x) => ({ ...x, muscleGroup: x.muscleGroup ?? null }),
      sets: (s) => ({ ...s, addOn: s.addOn === true }),
    },
  },
};

export class DbBlockedError extends Error {
  constructor() { super('Another tab of this app is blocking a database upgrade'); }
}

// Raised when THIS code is older than the data on disk: a stale cached shell
// (or an attempted rollback) opening a database already upgraded by a newer
// release. IndexedDB reports this as VersionError. It is emphatically not
// corruption — the fix is to load the newer app, never to erase data — so it
// is a distinct type that the recovery UI must never treat as a failed open.
export class DbTooOldError extends Error {
  constructor() { super('This app version is older than the data stored on this device'); }
}

function bootstrap(db) {
  const sets = db.createObjectStore('sets', { keyPath: 'id' });
  sets.createIndex('byExercise', 'exerciseId');
  sets.createIndex('byExerciseDay', ['exerciseId', 'workoutDay']);
  sets.createIndex('byDay', 'workoutDay');
  db.createObjectStore('exercises', { keyPath: 'id' });
  db.createObjectStore('settings', { keyPath: 'id' });
}

function applyMigrations(db, tx, oldVersion, newVersion, steps) {
  for (let v = oldVersion; v < newVersion; v++) {
    const step = steps[v];
    if (!step) throw new Error(`Missing migration for version ${v}`);
    step.structural?.(db, tx);
    for (const [storeName, fn] of Object.entries(step.records ?? {})) {
      const store = tx.objectStore(storeName);
      store.openCursor().onsuccess = (ev) => {
        const cur = ev.target.result;
        if (!cur) return;
        const out = fn(cur.value);
        if (out === null) cur.delete(); else cur.update(out);
        cur.continue();
      };
    }
  }
}

// _version/_migrations exist only so tests can exercise the migration machinery
// with synthetic steps (plan §17.1) — production callers never pass them.
export function openDb({ name = 'gym-tracker', onVersionChange = null, _version = DB_VERSION, _migrations = migrations } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, _version);
    req.onblocked = () => reject(new DbBlockedError());
    req.onupgradeneeded = (e) => {
      try {
        if (e.oldVersion === 0) bootstrap(req.result);
        else applyMigrations(req.result, req.transaction, e.oldVersion, _version, _migrations);
      } catch (err) {
        req.transaction.abort();
        reject(err);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); onVersionChange?.(); };
      resolve(makeHandle(db));
    };
    req.onerror = () => {
      const err = req.error;
      reject(err?.name === 'VersionError' ? new DbTooOldError() : err);
    };
  });
}

export function deleteDb(name = 'gym-tracker') {
  return promisify(indexedDB.deleteDatabase(name));
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrapStore(store) {
  return {
    get: (key) => promisify(store.get(key)),
    getAll: (query) => promisify(store.getAll(query)),
    getAllKeys: (query) => promisify(store.getAllKeys(query)),
    put: (value) => promisify(store.put(value)),
    delete: (key) => promisify(store.delete(key)),
    clear: () => promisify(store.clear()),
    index: (name) => {
      const idx = store.index(name);
      return {
        getAll: (query) => promisify(idx.getAll(query)),
        getAllKeys: (query) => promisify(idx.getAllKeys(query)),
      };
    },
  };
}

function makeHandle(db) {
  return {
    run(storeNames, mode, fn) {
      return new Promise((resolve, reject) => {
        let tx;
        try {
          tx = db.transaction(storeNames, mode);
        } catch (err) { reject(err); return; }
        const stores = {};
        for (const n of [].concat(storeNames)) stores[n] = wrapStore(tx.objectStore(n));
        let result;
        let failure;
        Promise.resolve()
          .then(() => fn(stores, tx))
          .then((r) => { result = r; })
          .catch((err) => {
            failure = err;
            try { tx.abort(); } catch { /* already aborted/committed */ }
          });
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Transaction aborted'));
      });
    },
    close: () => db.close(),
  };
}
