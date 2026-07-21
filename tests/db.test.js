import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDb, DB_VERSION, DbTooOldError, DbBlockedError, migrations } from '../js/db.js';

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
  it('DB_VERSION is 2 and the v1 step exists', () => {
    expect(DB_VERSION).toBe(2);
    expect(migrations[1]).toBeTruthy();
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

  it('upgrades a REAL v1 database in place, keeping every record', async () => {
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

    // Open at the current version: the real migration runs.
    const v2 = await openDb({ name });
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

  it('a fresh install bootstraps directly at v2 with no migration', async () => {
    const h = await openDb({ name: fresh() });
    await h.run('exercises', 'readwrite', (s) => s.exercises.put({ id: 'e1', name: 'New', sortOrder: 0, createdAtMs: 1 }));
    const [rec] = await h.run('exercises', 'readonly', (s) => s.exercises.getAll());
    expect(rec.id).toBe('e1');
    h.close();
  });
});
