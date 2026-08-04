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

export const DB_VERSION = 3;

// How hard a set felt, in the owner's own words (change set 5). Ordered but not
// evenly spaced, so it is ordinal: nothing may average it. `null` means the
// owner did not say, which is NOT the same as 'ok'.
export const INTENSITIES = ['easy', 'ok', 'hard'];

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
  // v2 → v3 (change set 5): adds SetEntry.intensity — how hard the set felt,
  // as the owner reported it: null | 'easy' | 'ok' | 'hard'. Records only.
  //
  // Every set logged before this release becomes `null`, meaning NOT RECORDED,
  // which is deliberately distinct from 'ok'. Nothing may retroactively claim
  // an old set felt a particular way (the same distinction D8 draws between
  // Ungrouped and a deliberate Other).
  2: {
    records: {
      sets: (s) => ({ ...s, intensity: INTENSITIES.includes(s.intensity) ? s.intensity : null }),
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

// Raised when a schema upgrade failed. IndexedDB rolls the version-change
// transaction back atomically, so the data is intact at the OLD version and the
// fix is always to ship corrected code — never to erase anything. Without its
// own type this arrives as a generic open failure, which the recovery UI counts
// toward offering the destructive reset screen (app.js): the app would be
// telling the owner to wipe an intact database because of a bug in the new
// release. Like DbTooOldError, this has a known safe fix and must never lead
// there.
export class DbUpgradeError extends Error {
  constructor(cause) {
    super('A database upgrade did not complete; your data is unchanged');
    this.cause = cause;
  }
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
  // Structural changes run first, in version order — they are synchronous on
  // the upgrade transaction.
  const chains = new Map(); // storeName -> [fn, …] in version order
  for (let v = oldVersion; v < newVersion; v++) {
    const step = steps[v];
    if (!step) throw new Error(`Missing migration for version ${v}`);
    step.structural?.(db, tx);
    for (const [storeName, fn] of Object.entries(step.records ?? {})) {
      if (!chains.has(storeName)) chains.set(storeName, []);
      chains.get(storeName).push(fn);
    }
  }

  // Each store is then walked ONCE, applying every version's transform to a
  // record in order. Opening a cursor per version instead would let two cursors
  // read the same original value concurrently, so a later version's transform
  // could overwrite an earlier one's work on a multi-version upgrade.
  for (const [storeName, fns] of chains) {
    tx.objectStore(storeName).openCursor().onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) return;
      let value = cur.value;
      for (const fn of fns) {
        value = fn(value);
        if (value === null) break; // a step deleting the record ends its chain
      }
      if (value === null) cur.delete(); else cur.update(value);
      cur.continue();
    };
  }
}

// _version/_migrations exist only so tests can exercise the migration machinery
// with synthetic steps (plan §17.1) — production callers never pass them.
export function openDb({ name = 'gym-tracker', onVersionChange = null, _version = DB_VERSION, _migrations = migrations } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, _version);
    req.onblocked = () => reject(new DbBlockedError());
    let upgrading = false;
    req.onupgradeneeded = (e) => {
      // Anything that fails from here on failed during an upgrade, including a
      // record transform that throws asynchronously inside a cursor callback —
      // that surfaces later as an abort on req.onerror, not here.
      upgrading = e.oldVersion !== 0;
      try {
        if (e.oldVersion === 0) bootstrap(req.result);
        else applyMigrations(req.result, req.transaction, e.oldVersion, _version, _migrations);
      } catch (err) {
        req.transaction.abort();
        reject(new DbUpgradeError(err));
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); onVersionChange?.(); };
      resolve(makeHandle(db));
    };
    req.onerror = () => {
      const err = req.error;
      if (err?.name === 'VersionError') { reject(new DbTooOldError()); return; }
      // A transform that threw inside a cursor callback aborts the transaction
      // and lands here rather than in the try/catch above.
      reject(upgrading ? new DbUpgradeError(err) : err);
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
