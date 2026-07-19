import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDb, DB_VERSION } from '../js/db.js';

let n = 0;
const fresh = () => `db-test-${++n}`;

describe('bootstrap and round-trip', () => {
  it('creates the v1 schema and persists across close/reopen', async () => {
    expect(DB_VERSION).toBe(1);
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

describe('migration machinery (synthetic test-only steps — v1 ships none, plan §10)', () => {
  it('applies record transforms sequentially inside the upgrade', async () => {
    const name = fresh();
    let h = await openDb({ name });
    await h.run('sets', 'readwrite', (s) => s.sets.put({ id: 's1', exerciseId: 'e1', weightKg: 10, reps: 8, performedAtMs: 5, tzOffsetMin: 0, workoutDay: 'd', createdAtMs: 5, updatedAtMs: 5 }));
    h.close();
    h = await openDb({
      name,
      _version: 2,
      _migrations: { 1: { records: { sets: (r) => ({ ...r, synthetic: true }) } } },
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
        _version: 2,
        _migrations: { 1: { structural: () => { throw new Error('migration bug'); } } },
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
    const h2 = await openDb({ name, _version: 2, _migrations: { 1: {} } });
    expect(notified).toBe(true);
    h2.close();
  });
});
