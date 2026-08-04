import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDb, DB_VERSION, DbTooOldError, DbBlockedError, DbUpgradeError, migrations } from '../js/db.js';

let n = 0;
const fresh = () => `db-test-${++n}`;

describe('bootstrap and round-trip', () => {
  it('creates the current schema and persists across close/reopen', async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(1);
    const name = fresh();
    let h = await openDb({ name });
    await h.run(['exercises', 'sets', 'settings'], 'readwrite', async (s) => {
      await s.exercises.put({ id: 'e1', name: 'Bench', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 10, reps: 8, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-15', createdAtMs: 5, updatedAtMs: 5 });
      await s.settings.put({ id: 'app', coarseIncrementKg: 2.5 });
    });
    h.close();
    h = await openDb({ name });
    const sets = await h.run('sets', 'readonly', (s) => s.sets.index('byExerciseDay').getAll(['e1', '2026-07-15']));
    expect(sets).toHaveLength(1);
    expect(await h.run('settings', 'readonly', (s) => s.settings.get('app'))).toMatchObject({ coarseIncrementKg: 2.5 });
    h.close();
  });

  it('rolls back the whole transaction when any operation fails', async () => {
    const h = await openDb({ name: fresh() });
    let failed = false;
    try {
      await h.run('exercises', 'readwrite', async (s) => {
        await s.exercises.put({ id: 'e1', name: 'A' });
        throw new Error('boom mid-transaction');
      });
    } catch { failed = true; }
    expect(failed).toBe(true);
    expect(await h.run('exercises', 'readonly', (s) => s.exercises.getAll())).toHaveLength(0);
    h.close();
  });
});

describe('migration machinery (synthetic steps above the shipped version, plan §10)', () => {
  it('applies record transforms sequentially inside the upgrade', async () => {
    const name = fresh();
    let h = await openDb({ name });
    await h.run('sets', 'readwrite', (s) => s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 10, reps: 8, performedAtMs: 5, tzOffsetMin: 0, workoutDay: 'd', createdAtMs: 5, updatedAtMs: 5 }));
    h.close();
    h = await openDb({
      name,
      _version: DB_VERSION + 1,
      _migrations: { [DB_VERSION]: { records: { sets: (r) => ({ ...r, synthetic: true }) } } },
    });
    const [rec] = await h.run('sets', 'readonly', (s) => s.sets.getAll());
    expect(rec.synthetic).toBe(true);
    h.close();
  });

  // A migration that fails must never be mistaken for a broken database. The
  // recovery UI counts generic open failures toward offering the destructive
  // reset screen; an aborted upgrade leaves the data intact at the old version
  // and the only fix is corrected code, so it gets its own type that is exempt.
  it('reports a failed upgrade as DbUpgradeError, whether it throws in structural or in a record transform', async () => {
    // (a) synchronous failure in structural
    const a = fresh();
    let h = await openDb({ name: a });
    await h.run('exercises', 'readwrite', (s) => s.exercises.put({ id: 'e1', name: 'Bench' }));
    h.close();
    await expect(openDb({
      name: a,
      _version: DB_VERSION + 1,
      _migrations: { [DB_VERSION]: { structural: () => { throw new Error('migration bug'); } } },
    })).rejects.toBeInstanceOf(DbUpgradeError);

    // (b) failure inside a RECORD transform, which throws in a cursor callback
    // and so surfaces as a transaction abort rather than synchronously.
    const b = fresh();
    h = await openDb({ name: b });
    await h.run('sets', 'readwrite', (s) => s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 10, reps: 8, performedAtMs: 5, tzOffsetMin: 0, workoutDay: 'd', createdAtMs: 5, updatedAtMs: 5 }));
    h.close();
    await expect(openDb({
      name: b,
      _version: DB_VERSION + 1,
      _migrations: { [DB_VERSION]: { records: { sets: () => { throw new Error('bad transform'); } } } },
    })).rejects.toBeInstanceOf(DbUpgradeError);

    // The database is untouched: still openable at the old version, record intact.
    const after = await openDb({ name: b });
    const [rec] = await after.run('sets', 'readonly', (s) => s.sets.getAll());
    expect(rec.id).toBe('s1');
    expect(rec.weightKg).toBe(10);
    after.close();
  });

  it('aborts atomically on a failing migration, leaving the old version intact', async () => {
    const name = fresh();
    let h = await openDb({ name });
    await h.run('exercises', 'readwrite', (s) => s.exercises.put({ id: 'e1', name: 'Bench' }));
    h.close();
    let failed = false;
    try {
      await openDb({
        name,
        _version: DB_VERSION + 1,
        _migrations: { [DB_VERSION]: { structural: () => { throw new Error('migration bug'); } } },
      });
    } catch { failed = true; }
    expect(failed).toBe(true);
    // still opens at v1 with data intact
    h = await openDb({ name });
    expect(await h.run('exercises', 'readonly', (s) => s.exercises.getAll())).toHaveLength(1);
    h.close();
  });

  it('closes stale connections on versionchange and notifies (plan §10 protocol)', async () => {
    const name = fresh();
    let notified = false;
    const h1 = await openDb({ name, onVersionChange: () => { notified = true; } });
    const h2 = await openDb({ name, _version: DB_VERSION + 1, _migrations: { [DB_VERSION]: {} } });
    expect(notified).toBe(true);
    h2.close();
  });
});

// Codex F9: old cached code meeting a database a newer release already upgraded
// gets a VersionError. That is not corruption — surfacing it as a generic open
// failure could walk the owner toward the destructive reset screen.
describe('old code opening a newer database (F9)', () => {
  it('reports DbTooOldError and leaves the data untouched', async () => {
    const name = fresh();
    // Newer release upgrades the database.
    const newer = await openDb({ name, _version: DB_VERSION + 1, _migrations: { [DB_VERSION]: {} } });
    await newer.run('exercises', 'readwrite', (s) => s.exercises.put({ id: 'e1', name: 'Row', sortOrder: 0, createdAtMs: 1 }));
    newer.close();

    // Stale shell still on v1 tries to open it.
    await expect(openDb({ name, _version: DB_VERSION })).rejects.toBeInstanceOf(DbTooOldError);

    // Data survives untouched and is readable again by current code.
    const again = await openDb({ name, _version: DB_VERSION + 1, _migrations: { [DB_VERSION]: {} } });
    expect(await again.run('exercises', 'readonly', (s) => s.exercises.getAll())).toHaveLength(1);
    again.close();
  });

  it('is distinct from a blocked upgrade', async () => {
    expect(new DbTooOldError()).not.toBeInstanceOf(DbBlockedError);
    expect(new DbTooOldError().message).toMatch(/older than the data/);
  });
});

// MAINTENANCE.md requires every real migration to ship BOTH a pure record-transform
// fixture test AND a database-level upgrade test from a real older database.
describe('v1 → v2 migration (muscleGroup + addOn)', () => {
  it('DB_VERSION is 3 and every step from v1 up exists', () => {
    expect(DB_VERSION).toBe(3);
    for (let v = 1; v < DB_VERSION; v++) expect(migrations[v], `missing migration ${v}`).toBeTruthy();
  });

  it('pure transforms add the fields with safe defaults and preserve everything else', () => {
    const { exercises, sets } = migrations[1].records;
    const v1Exercise = { id: 'e1', name: 'Row', sortOrder: 3, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 2 };
    const v1Set = { id: 's1', exerciseId: 'e1', weightKg: 40, reps: 8, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 5, updatedAtMs: 5 };

    expect(exercises(v1Exercise)).toEqual({ ...v1Exercise, muscleGroup: null });
    expect(sets(v1Set)).toEqual({ ...v1Set, addOn: false });

    // Idempotent: an already-migrated record keeps its values.
    expect(exercises({ ...v1Exercise, muscleGroup: 'Back' }).muscleGroup).toBe('Back');
    expect(sets({ ...v1Set, addOn: true }).addOn).toBe(true);
    // Anything non-boolean becomes a real boolean rather than leaking through.
    expect(sets({ ...v1Set, addOn: 'yes' }).addOn).toBe(false);
  });

  // Pinned at _version: 2 on purpose. It used to call openDb({ name }), which
  // silently became a v1→v3 test the moment DB_VERSION was bumped — testing
  // something other than what its name claims. The v1→current path is covered
  // separately below.
  it('upgrades a REAL v1 database to v2 in place, keeping every record', async () => {
    const name = fresh();
    // Build a genuine v1 database with v1-shaped records.
    const v1 = await openDb({ name, _version: 1, _migrations: {} });
    await v1.run(['exercises', 'sets'], 'readwrite', async (s) => {
      await s.exercises.put({ id: 'e1', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 });
      await s.exercises.put({ id: 'e2', name: 'Dip', sortOrder: 1, archivedAtMs: 99, createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 40, reps: 8, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 5, updatedAtMs: 5 });
      await s.sets.put({ id: 's2', exerciseId: 'e2', weightKg: 0, reps: 12, performedAtMs: 6, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 6, updatedAtMs: 6 });
    });
    v1.close();

    // Open at v2 specifically: only the v1→v2 step runs.
    const v2 = await openDb({ name, _version: 2 });
    const exercises = await v2.run('exercises', 'readonly', (s) => s.exercises.getAll());
    const sets = await v2.run('sets', 'readonly', (s) => s.sets.getAll());

    expect(exercises).toHaveLength(2);
    expect(sets).toHaveLength(2);
    expect(exercises.every((x) => x.muscleGroup === null)).toBe(true);
    expect(sets.every((s) => s.addOn === false)).toBe(true);
    // Pre-existing data is untouched, including the archived exercise.
    expect(exercises.find((x) => x.id === 'e2').archivedAtMs).toBe(99);
    expect(sets.find((s) => s.id === 's1').weightKg).toBe(40);
    v2.close();
  });

  it('a fresh install bootstraps directly at the current version with no migration', async () => {
    const h = await openDb({ name: fresh() });
    await h.run('exercises', 'readwrite', (s) => s.exercises.put({ id: 'e1', name: 'New', sortOrder: 0, createdAtMs: 1 }));
    const [rec] = await h.run('exercises', 'readonly', (s) => s.exercises.getAll());
    expect(rec.id).toBe('e1');
    h.close();
  });

// v2 → v3 is the upgrade the owner's phone will actually perform: it is the
// version their data is on today. MAINTENANCE.md requires both a pure fixture
// test and a real database-upgrade test for every migration.
describe('v2 → v3 migration (per-set intensity)', () => {
  it('the pure transform stamps null and preserves everything else', () => {
    const { sets } = migrations[2].records;
    const v2Set = { id: 's1', exerciseId: 'e1', weightKg: 40, reps: 8, addOn: false, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 5, updatedAtMs: 5 };

    // A set logged before this feature existed did not "feel ok" — it is
    // unrecorded, and null is how that is said.
    expect(sets(v2Set)).toEqual({ ...v2Set, intensity: null });

    // Idempotent for a real value, and junk never leaks through.
    expect(sets({ ...v2Set, intensity: 'hard' }).intensity).toBe('hard');
    expect(sets({ ...v2Set, intensity: 'easy' }).intensity).toBe('easy');
    expect(sets({ ...v2Set, intensity: 'ok' }).intensity).toBe('ok');
    expect(sets({ ...v2Set, intensity: 'MASSIVE' }).intensity).toBe(null);
    expect(sets({ ...v2Set, intensity: 3 }).intensity).toBe(null);
    expect(sets({ ...v2Set, intensity: '' }).intensity).toBe(null);
  });

  it('upgrades a REAL v2 database, the path the owner\u2019s phone takes', async () => {
    const name = fresh();
    const v2 = await openDb({ name, _version: 2 });
    await v2.run(['exercises', 'sets'], 'readwrite', async (s) => {
      await s.exercises.put({ id: 'e1', name: 'Bench', muscleGroup: 'Chest', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 60, reps: 8, addOn: false, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 5, updatedAtMs: 5 });
      await s.sets.put({ id: 's2', exerciseId: 'e1', weightKg: 60, reps: 6, addOn: true, performedAtMs: 6, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 6, updatedAtMs: 6 });
    });
    v2.close();

    const v3 = await openDb({ name });
    const sets = await v3.run('sets', 'readonly', (s) => s.sets.getAll());
    const exercises = await v3.run('exercises', 'readonly', (s) => s.exercises.getAll());

    expect(sets).toHaveLength(2);
    expect(sets.every((x) => x.intensity === null)).toBe(true);
    // Everything from v2 survives untouched, including the add-on flag and group.
    expect(sets.find((x) => x.id === 's2').addOn).toBe(true);
    expect(sets.find((x) => x.id === 's1').weightKg).toBe(60);
    expect(exercises[0].muscleGroup).toBe('Chest');
    v3.close();
  });

  it('upgrades a REAL v1 database all the way to the current version', async () => {
    const name = fresh();
    const v1 = await openDb({ name, _version: 1, _migrations: {} });
    await v1.run(['exercises', 'sets'], 'readwrite', async (s) => {
      await s.exercises.put({ id: 'e1', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 40, reps: 8, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 5, updatedAtMs: 5 });
    });
    v1.close();

    // Both steps run, in order, over one cursor per store (G4).
    const current = await openDb({ name });
    const [ex] = await current.run('exercises', 'readonly', (s) => s.exercises.getAll());
    const [set] = await current.run('sets', 'readonly', (s) => s.sets.getAll());

    // All three fields from both migrations are present together.
    expect(ex.muscleGroup).toBe(null);
    expect(set.addOn).toBe(false);
    expect(set.intensity).toBe(null);
    expect(set.weightKg).toBe(40);
    current.close();
  });
});

});

// G4: a multi-version upgrade previously opened one cursor per version over the
// same store, so two cursors could read the same original record and the later
// version's transform could overwrite the earlier one's work.
describe('multi-version record migrations (G4)', () => {
  it('applies each version in order to every record, including dependent steps', async () => {
    const name = fresh();
    const v1 = await openDb({ name, _version: 1, _migrations: {} });
    await v1.run('sets', 'readwrite', async (s) => {
      await s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 10, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: 'd', createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 's2', exerciseId: 'e1', weightKg: 20, reps: 5, performedAtMs: 2, tzOffsetMin: 0, workoutDay: 'd', createdAtMs: 2, updatedAtMs: 2 });
    });
    v1.close();

    // v3 depends on the field v2 creates: if the steps raced, `doubled` would be
    // NaN (or the v2 field would be missing entirely).
    const table = {
      1: { records: { sets: (r) => ({ ...r, addedInV2: r.weightKg * 2 }) } },
      2: { records: { sets: (r) => ({ ...r, doubled: r.addedInV2 * 2 }) } },
    };
    const v3 = await openDb({ name, _version: 3, _migrations: table });
    const sets = (await v3.run('sets', 'readonly', (s) => s.sets.getAll())).sort((a, b) => a.id < b.id ? -1 : 1);
    expect(sets.map((s) => s.addedInV2)).toEqual([20, 40]);
    expect(sets.map((s) => s.doubled)).toEqual([40, 80]);
    v3.close();
  });

  it('stops a record’s chain when a step deletes it', async () => {
    const name = fresh();
    const v1 = await openDb({ name, _version: 1, _migrations: {} });
    await v1.run('sets', 'readwrite', (s) => s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 10, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: 'd', createdAtMs: 1, updatedAtMs: 1 }));
    v1.close();
    const table = {
      1: { records: { sets: () => null } },
      2: { records: { sets: (r) => ({ ...r, shouldNotRun: true }) } },
    };
    const v3 = await openDb({ name, _version: 3, _migrations: table });
    expect(await v3.run('sets', 'readonly', (s) => s.sets.getAll())).toEqual([]);
    v3.close();
  });
});
