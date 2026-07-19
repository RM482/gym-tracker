import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../js/db.js';
import { createStore, ValidationError } from '../js/store.js';

// Deterministic fake platform: controllable clock, sequential ids, fixed CEST offset.
function fakePlatform(startMs = Date.UTC(2026, 6, 15, 10, 0)) {
  let t = startMs;
  let n = 0;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    uuid: () => `id-${String(++n).padStart(4, '0')}`,
    tzOffsetMin: () => 120,
  };
}

let dbCount = 0;
let store;
let platform;

beforeEach(async () => {
  platform = fakePlatform();
  const dbHandle = await openDb({ name: `store-test-${++dbCount}` });
  store = createStore({ dbHandle, platform });
});

describe('exercise management', () => {
  it('adds exercises with contiguous sortOrder and timestamps', async () => {
    const a = await store.addExercise('Bench press');
    const b = await store.addExercise('  Squat  ');
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(b.name).toBe('Squat'); // trimmed
    expect((await store.listExercises()).map((x) => x.name)).toEqual(['Bench press', 'Squat']);
  });

  it('rejects empty, too-long and duplicate names (case/trim-insensitive)', async () => {
    await store.addExercise('Bench press');
    await expect(store.addExercise('')).rejects.toThrow(ValidationError);
    await expect(store.addExercise('x'.repeat(61))).rejects.toThrow(/too long/);
    await expect(store.addExercise(' bench PRESS ')).rejects.toThrow(/already have/);
  });

  it('renames without touching history identity', async () => {
    const ex = await store.addExercise('Row');
    await store.addSet({ exerciseId: ex.id, weightKg: 40, reps: 8 });
    await store.renameExercise(ex.id, 'Barbell row');
    expect((await store.getExercise(ex.id)).name).toBe('Barbell row');
    expect((await store.getSetsForExercise(ex.id))).toHaveLength(1);
  });

  it('archives, then allows the name to be reused; unarchive then needs a rename', async () => {
    const ex = await store.addExercise('Curl');
    await store.archiveExercise(ex.id);
    expect(await store.listExercises()).toHaveLength(0);
    const again = await store.addExercise('Curl'); // archived name is reusable (A8)
    await expect(store.unarchiveExercise(ex.id)).rejects.toThrow(/already have/);
    await store.unarchiveExercise(ex.id, { newName: 'Curl (2)' });
    const names = (await store.listExercises()).map((x) => x.name).sort();
    expect(names).toEqual(['Curl', 'Curl (2)']);
    expect(again.id).not.toBe(ex.id);
  });

  it('deletes an exercise and all its sets in one go', async () => {
    const ex = await store.addExercise('Dip');
    await store.addSets(ex.id, [{ weightKg: 0, reps: 10 }, { weightKg: 5, reps: 8 }]);
    expect(await store.countSets(ex.id)).toBe(2);
    const { deletedSets } = await store.deleteExercise(ex.id);
    expect(deletedSets).toBe(2);
    expect(await store.getExercise(ex.id)).toBeNull();
    expect(await store.getSetsForExercise(ex.id)).toHaveLength(0);
  });

  it('moves exercises and keeps sortOrder contiguous', async () => {
    const a = await store.addExercise('A');
    await store.addExercise('B');
    const c = await store.addExercise('C');
    await store.moveExercise(c.id, -1);
    expect((await store.listExercises()).map((x) => x.name)).toEqual(['A', 'C', 'B']);
    await store.moveExercise(a.id, -1); // already at top: no-op
    const list = await store.listExercises();
    expect(list.map((x) => x.name)).toEqual(['A', 'C', 'B']);
    expect(list.map((x) => x.sortOrder)).toEqual([0, 1, 2]);
  });

  it('orders by recency when asked (MRU), falling back to manual order', async () => {
    const a = await store.addExercise('A');
    const b = await store.addExercise('B');
    await store.addExercise('C'); // never used
    await store.addSet({ exerciseId: a.id, weightKg: 10, reps: 8 });
    platform.advance(60000);
    await store.addSet({ exerciseId: b.id, weightKg: 10, reps: 8 });
    const recent = await store.listExercises({ order: 'recent' });
    expect(recent.map((x) => x.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('set logging', () => {
  let ex;
  beforeEach(async () => { ex = await store.addExercise('Bench press'); });

  it('records a set with derived workoutDay and offset', async () => {
    const rec = await store.addSet({ exerciseId: ex.id, weightKg: 22.5, reps: 8 });
    expect(rec.workoutDay).toBe('2026-07-15');
    expect(rec.tzOffsetMin).toBe(120);
    expect((await store.getTodaySets(ex.id))).toHaveLength(1);
  });

  it('accepts weight 0 (bodyweight) and 2-decimal weights; rejects invalid input', async () => {
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 0, reps: 12 })).resolves.toBeTruthy();
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 8.75, reps: 8 })).resolves.toBeTruthy();
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 8.125, reps: 8 })).rejects.toThrow(/2 decimals/);
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 1000, reps: 8 })).rejects.toThrow(/between 0 and 999/);
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 0 })).rejects.toThrow(/whole number/);
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8.5 })).rejects.toThrow(/whole number/);
    await expect(store.addSet({ exerciseId: ex.id, weightKg: NaN, reps: 8 })).rejects.toThrow(ValidationError);
  });

  it('rejects sets for missing or archived exercises (FK inside the transaction)', async () => {
    await expect(store.addSet({ exerciseId: 'nope', weightKg: 10, reps: 8 })).rejects.toThrow(/no longer exists/);
    await store.archiveExercise(ex.id);
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 })).rejects.toThrow(/no longer exists/);
  });

  it('rejects timestamps more than 10 minutes in the future', async () => {
    await expect(store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8, performedAtMs: platform.now() + 11 * 60000 }))
      .rejects.toThrow(/future/);
  });

  it('saves batches in entry order with millisecond spacing, all-or-nothing', async () => {
    const recs = await store.addSets(ex.id, [
      { weightKg: 10, reps: 8 }, { weightKg: 10, reps: 8 }, { weightKg: 9, reps: 8 },
    ]);
    expect(recs.map((r) => r.performedAtMs)).toEqual([recs[0].performedAtMs, recs[0].performedAtMs + 1, recs[0].performedAtMs + 2]);
    const sets = await store.getSetsForExercise(ex.id);
    expect(sets.map((s) => s.weightKg)).toEqual([10, 10, 9]);
    // one bad set → nothing saved
    await expect(store.addSets(ex.id, [{ weightKg: 10, reps: 8 }, { weightKg: -1, reps: 8 }])).rejects.toThrow(ValidationError);
    expect(await store.getSetsForExercise(ex.id)).toHaveLength(3);
    await expect(store.addSets(ex.id, Array(31).fill({ weightKg: 10, reps: 8 }))).rejects.toThrow(/At most 30/);
  });

  it('edits values without touching the timestamp fields, and recomputes the day on timestamp edits', async () => {
    const rec = await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 });
    const edited = await store.editSet(rec.id, { weightKg: 12.5 });
    expect(edited.performedAtMs).toBe(rec.performedAtMs);
    expect(edited.tzOffsetMin).toBe(rec.tzOffsetMin);
    expect(edited.workoutDay).toBe(rec.workoutDay);
    // move it (into the past) to 00:30 just after midnight → previous evening's workout day (D1)
    const lateNight = Date.UTC(2026, 6, 13, 22, 30); // 00:30 CEST on the 14th
    const moved = await store.editSet(rec.id, { performedAtMs: lateNight });
    expect(moved.workoutDay).toBe('2026-07-13');
  });

  it('deletes with Undo restoring the identical record', async () => {
    const rec = await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 });
    const deleted = await store.deleteSet(rec.id);
    expect(await store.getSetsForExercise(ex.id)).toHaveLength(0);
    await store.restoreSet(deleted);
    const back = await store.getSetsForExercise(ex.id);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe(rec.id);
  });

  it('keeps identical sets as distinct records with deterministic order', async () => {
    await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 });
    await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 });
    const sets = await store.getSetsForExercise(ex.id);
    expect(sets).toHaveLength(2);
    expect(sets[0].id).not.toBe(sets[1].id);
  });
});

describe('sessions and day queries', () => {
  let ex;
  beforeEach(async () => { ex = await store.addExercise('Bench press'); });

  it('previous session excludes today and picks the most recent earlier day', async () => {
    const day = 24 * 3600 * 1000;
    await store.addSet({ exerciseId: ex.id, weightKg: 8, reps: 8, performedAtMs: platform.now() - 8 * day });
    await store.addSet({ exerciseId: ex.id, weightKg: 9, reps: 8, performedAtMs: platform.now() - 4 * day });
    await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 }); // today
    const prev = await store.getPreviousSession(ex.id);
    expect(prev.day).toBe('2026-07-11');
    expect(prev.sets.map((s) => s.weightKg)).toEqual([9]);
  });

  it('returns null when there is no earlier session (first time)', async () => {
    await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 }); // today only
    expect(await store.getPreviousSession(ex.id)).toBeNull();
  });

  it('summarises the most recent session per exercise, including today', async () => {
    const other = await store.addExercise('Squat');
    const day = 24 * 3600 * 1000;
    await store.addSet({ exerciseId: ex.id, weightKg: 9, reps: 8, performedAtMs: platform.now() - 4 * day });
    await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 }); // today
    await store.addSet({ exerciseId: other.id, weightKg: 60, reps: 5, performedAtMs: platform.now() - 2 * day });
    const map = await store.getLastSessionsByExercise();
    expect(map[ex.id].day).toBe('2026-07-15');
    expect(map[ex.id].sets.map((s) => s.weightKg)).toEqual([10]);
    expect(map[other.id].day).toBe('2026-07-13');
  });

  it('day query returns every exercise trained that day, in order', async () => {
    const other = await store.addExercise('Squat');
    await store.addSet({ exerciseId: ex.id, weightKg: 10, reps: 8 });
    platform.advance(60000);
    await store.addSet({ exerciseId: other.id, weightKg: 60, reps: 5 });
    const day = await store.getDaySets(store.getTodayDay());
    expect(day.map((s) => s.exerciseId)).toEqual([ex.id, other.id]);
  });
});

describe('settings and diagnostics', () => {
  it('returns defaults, persists updates', async () => {
    const s = await store.getSettings();
    expect(s.coarseIncrementKg).toBe(2.5);
    expect(s.exerciseSort).toBe('recent');
    await store.updateSettings({ coarseIncrementKg: 5 });
    expect((await store.getSettings()).coarseIncrementKg).toBe(5);
  });

  it('excludes malformed records from queries but never deletes them', async () => {
    const ex = await store.addExercise('Row');
    await store.addSet({ exerciseId: ex.id, weightKg: 40, reps: 8 });
    // Corrupt a record behind the store's back.
    const dbHandle = await openDb({ name: `store-test-${dbCount}` });
    await dbHandle.run('sets', 'readwrite', (s) => s.sets.put({ id: 'broken', exerciseId: ex.id, junk: true }));
    const sets = await store.getSetsForExercise(ex.id);
    expect(sets).toHaveLength(1);
    expect(store.unreadableCount()).toBeGreaterThan(0);
    // still physically present
    const raw = await dbHandle.run('sets', 'readonly', (s) => s.sets.getAll());
    expect(raw).toHaveLength(2);
    dbHandle.close();
  });
});
