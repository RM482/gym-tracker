import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../js/db.js';
import { createStore, ValidationError, MUSCLE_GROUPS, isBackupOverdue } from '../js/store.js';

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
  it('atomically replaces all stores from a validated backup', async () => {
    await store.addExercise('Old');
    const snapshot = {
      exercises: [{ id: 'new', name: 'Restored', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 }],
      sets: [{ id: 'set-new', exerciseId: 'new', weightKg: 25, reps: 6, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '1970-01-01', createdAtMs: 1, updatedAtMs: 1 }],
      settings: { id: 'app', coarseIncrementKg: 5, exerciseSort: 'manual' },
    };
    await store.replaceFromBackup(snapshot);
    expect((await store.listExercises()).map((x) => x.name)).toEqual(['Restored']);
    expect(await store.getSetsForExercise('new')).toHaveLength(1);
    expect((await store.getSettings()).coarseIncrementKg).toBe(5);
  });

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

describe('v2 fields: muscle group and machine add-on', () => {
  it('new exercises are Ungrouped unless a group is given, and the group is editable', async () => {
    const plain = await store.addExercise('Row');
    expect(plain.muscleGroup).toBeNull();
    const tagged = await store.addExercise('Squat', { muscleGroup: 'Legs' });
    expect(tagged.muscleGroup).toBe('Legs');

    await store.setMuscleGroup(plain.id, 'Back');
    expect((await store.getExercise(plain.id)).muscleGroup).toBe('Back');
    // Clearing back to Ungrouped is allowed.
    await store.setMuscleGroup(plain.id, null);
    expect((await store.getExercise(plain.id)).muscleGroup).toBeNull();
  });

  it('rejects groups outside the curated taxonomy', async () => {
    await expect(store.addExercise('Bad', { muscleGroup: 'Quads' })).rejects.toThrow(/Unknown muscle group/);
    const ex = await store.addExercise('Fine');
    await expect(store.setMuscleGroup(ex.id, 'quads')).rejects.toThrow(/Unknown muscle group/);
    expect(MUSCLE_GROUPS).toContain('Full body');
  });

  it('records the add-on flag without touching the recorded weight', async () => {
    const ex = await store.addExercise('Leg press');
    const plain = await store.addSet({ exerciseId: ex.id, weightKg: 50, reps: 10 });
    const withAddOn = await store.addSet({ exerciseId: ex.id, weightKg: 50, reps: 10, addOn: true });
    expect(plain.addOn).toBe(false);
    expect(withAddOn.addOn).toBe(true);
    // The unknown increment is never invented into the weight (D7).
    expect(withAddOn.weightKg).toBe(50);
  });

  it('carries the add-on flag through batches, edits and undo', async () => {
    const ex = await store.addExercise('Chest press');
    const batch = await store.addSets(ex.id, [
      { weightKg: 40, reps: 8, addOn: true },
      { weightKg: 40, reps: 8 },
    ]);
    expect(batch.map((s) => s.addOn)).toEqual([true, false]);

    const corrected = await store.editSet(batch[1].id, { addOn: true });
    expect(corrected.addOn).toBe(true);

    const deleted = await store.deleteSet(corrected.id);
    await store.restoreSet(deleted);
    const [restored] = (await store.getSetsForExercise(ex.id)).filter((s) => s.id === corrected.id);
    expect(restored.addOn).toBe(true);
  });

  it('normalises legacy records on read instead of hiding them', async () => {
    const ex = await store.addExercise('Legacy');
    // Write pre-v2 shapes straight past the store, as a missed migration would leave them.
    const dbHandle = await openDb({ name: `store-test-${dbCount}` });
    await dbHandle.run(['exercises', 'sets'], 'readwrite', async (s) => {
      await s.exercises.put({ id: 'old-ex', name: 'Old', sortOrder: 9, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 'old-set', exerciseId: ex.id, weightKg: 10, reps: 8, performedAtMs: platform.now(), tzOffsetMin: 120, workoutDay: store.getTodayDay(), createdAtMs: 1, updatedAtMs: 1 });
    });
    dbHandle.close();

    const list = await store.listExercises();
    const old = list.find((x) => x.id === 'old-ex');
    expect(old).toBeTruthy();              // still visible, not quarantined
    expect(old.muscleGroup).toBeNull();    // normalised
    const sets = await store.getSetsForExercise(ex.id);
    expect(sets.find((s) => s.id === 'old-set').addOn).toBe(false);
  });
});

describe('backup reminder timing (plan §6.1)', () => {
  const DAY = 86400000;
  const now = Date.UTC(2026, 6, 21);
  const base = { lastDataChangeAtMs: now - DAY, lastExportAtMs: null, firstDataChangeAtMs: now - 40 * DAY, backupBannerSnoozedAtMs: null };

  it('does not nag a new owner the moment they save something', () => {
    // The bug: with no export ever, the banner fired immediately and stayed.
    expect(isBackupOverdue({ ...base, firstDataChangeAtMs: now - 60000, lastDataChangeAtMs: now }, now)).toBe(false);
  });

  it('nags once 30 days have passed with unexported changes', () => {
    expect(isBackupOverdue(base, now)).toBe(true);
  });

  it('stays quiet when everything has been exported since the last change', () => {
    expect(isBackupOverdue({ ...base, lastExportAtMs: now - 1000 }, now)).toBe(false);
  });

  it('counts the 30 days from the last export once one exists', () => {
    const exportedRecently = { ...base, lastExportAtMs: now - 5 * DAY, lastDataChangeAtMs: now - DAY };
    expect(isBackupOverdue(exportedRecently, now)).toBe(false);
    const exportedLongAgo = { ...base, lastExportAtMs: now - 45 * DAY, lastDataChangeAtMs: now - DAY };
    expect(isBackupOverdue(exportedLongAgo, now)).toBe(true);
  });

  it('respects the 7-day snooze', () => {
    expect(isBackupOverdue({ ...base, backupBannerSnoozedAtMs: now - 2 * DAY }, now)).toBe(false);
    expect(isBackupOverdue({ ...base, backupBannerSnoozedAtMs: now - 8 * DAY }, now)).toBe(true);
  });

  it('says nothing when there is no data at all', () => {
    expect(isBackupOverdue({ lastDataChangeAtMs: null }, now)).toBe(false);
  });

  it('records the first data change as the baseline', async () => {
    await store.addExercise('Row');
    const settings = await store.getSettings();
    expect(settings.firstDataChangeAtMs).toBe(platform.now());
    const first = settings.firstDataChangeAtMs;
    platform.advance(60000);
    await store.addExercise('Squat');
    expect((await store.getSettings()).firstDataChangeAtMs).toBe(first); // set once
  });
});

// G2: a legacy record must not survive an unrelated edit still un-migrated, or
// be exported as nominally-current v2 data.
describe('legacy records become canonical on write (G2)', () => {
  async function writeLegacy() {
    const dbHandle = await openDb({ name: `store-test-${dbCount}` });
    await dbHandle.run(['exercises', 'sets'], 'readwrite', async (s) => {
      await s.exercises.put({ id: 'old', name: 'Old row', sortOrder: 50, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 });
      await s.sets.put({ id: 'old-set', exerciseId: 'old', weightKg: 10, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '2026-07-01', createdAtMs: 1, updatedAtMs: 1 });
    });
    return dbHandle;
  }
  const raw = async (dbHandle, store, id) => dbHandle.run(store, 'readonly', (s) => s[store].get(id));

  it('rename writes back a canonical record', async () => {
    const dbHandle = await writeLegacy();
    expect((await raw(dbHandle, 'exercises', 'old')).muscleGroup).toBeUndefined();
    await store.renameExercise('old', 'Renamed row');
    expect((await raw(dbHandle, 'exercises', 'old')).muscleGroup).toBeNull();
    dbHandle.close();
  });

  it('archiving and editing a set do the same', async () => {
    const dbHandle = await writeLegacy();
    await store.archiveExercise('old');
    expect((await raw(dbHandle, 'exercises', 'old')).muscleGroup).toBeNull();
    await store.editSet('old-set', { reps: 10 });
    expect((await raw(dbHandle, 'sets', 'old-set')).addOn).toBe(false);
    dbHandle.close();
  });

  it('backup snapshots export canonical shapes, never raw legacy records', async () => {
    const dbHandle = await writeLegacy();
    const snapshot = await store.snapshotForBackup();
    expect(snapshot.exercises.find((x) => x.id === 'old').muscleGroup).toBeNull();
    expect(snapshot.sets.find((s) => s.id === 'old-set').addOn).toBe(false);
    dbHandle.close();
  });
});
