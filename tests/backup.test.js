import { describe, it, expect } from 'vitest';
import { buildBackup, backupFilename, validateBackup, migrateBackup } from '../js/backup.js';
import { DB_VERSION } from '../js/db.js';

describe('backup export', () => {
  it('builds the versioned restorable envelope without changing records', () => {
    const snapshot = { exercises: [{ id: 'e' }], sets: [{ id: 's' }], settings: { id: 'app' }, unreadable: [{ store: 'sets' }] };
    const at = Date.UTC(2026, 6, 19);
    expect(buildBackup(snapshot, at)).toEqual({ app: 'gym-tracker', schemaVersion: DB_VERSION, exportedAtMs: at, ...snapshot });
    expect(backupFilename(at)).toBe('gym-tracker-backup-2026-07-19.json');
  });

  it('stages valid backups and rejects identity, version, duplicate and FK failures', () => {
    const ex = { id: 'e', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 };
    const set = { id: 's', exerciseId: 'e', weightKg: 10, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '2026-07-19', createdAtMs: 1, updatedAtMs: 1 };
    const good = { app: 'gym-tracker', schemaVersion: 1, exercises: [ex], sets: [set], settings: { id: 'app' } };
    expect(validateBackup(good).sets).toHaveLength(1);
    expect(() => validateBackup({ ...good, app: 'other' })).toThrow(/not a Gym Tracker/);
    expect(() => validateBackup({ ...good, schemaVersion: DB_VERSION + 1 })).toThrow(/newer/);
    expect(() => validateBackup({ ...good, exercises: [ex, ex] })).toThrow(/Duplicate exercise/);
    expect(() => validateBackup({ ...good, sets: [{ ...set, exerciseId: 'missing' }] })).toThrow(/missing exercise/);
  });
});

// Codex F7: the restore path never replayed record migrations, so a genuine
// older backup would be inserted missing fields the migration should supply —
// or rejected outright once validators tighten. Migration must run BEFORE
// current-schema validation. Exercised with synthetic steps because the
// shipped table is empty until a real schema change lands.
describe('backup migration replay (F7)', () => {
  const ex = { id: 'e', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 };
  const set = { id: 's', exerciseId: 'e', weightKg: 10, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '2026-07-19', createdAtMs: 1, updatedAtMs: 1 };
  const v1 = { app: 'gym-tracker', schemaVersion: 1, exercises: [ex], sets: [set], settings: { id: 'app' } };
  const table = {
    1: { records: {
      exercises: (x) => ({ ...x, addedInV2: 'group' }),
      sets: (s) => ({ ...s, addedInV2: true }),
    } },
    2: { records: { sets: (s) => ({ ...s, addedInV3: 1 }) } },
  };

  it('applies every step from the file version up to the target', () => {
    const out = migrateBackup(v1, { table, target: 3 });
    expect(out.schemaVersion).toBe(3);
    expect(out.exercises[0].addedInV2).toBe('group');
    expect(out.sets[0]).toMatchObject({ addedInV2: true, addedInV3: 1 });
  });

  it('does not mutate the caller’s backup object', () => {
    const input = structuredClone(v1);
    migrateBackup(input, { table, target: 3 });
    expect(input).toEqual(v1);
    expect(input.sets[0].addedInV2).toBeUndefined();
  });

  it('is a no-op when the file is already at the target version', () => {
    expect(migrateBackup(v1, { table, target: 1 })).toEqual({ ...v1, schemaVersion: 1 });
  });

  it('honours record deletion (a step returning null drops the record)', () => {
    const dropping = { 1: { records: { sets: () => null } } };
    expect(migrateBackup(v1, { table: dropping, target: 2 }).sets).toEqual([]);
  });

  it('refuses a version it has no migration for rather than importing as-is', () => {
    expect(() => migrateBackup(v1, { table: {}, target: 2 })).toThrow(/cannot be upgraded/);
  });

  it('validates the MIGRATED result, not the raw file', () => {
    // A v1 set whose weight only becomes valid after migration must survive:
    // validating first would have rejected it.
    const repairing = { 1: { records: { sets: (s) => ({ ...s, reps: 8 }) } } };
    const broken = { ...v1, schemaVersion: 1, sets: [{ ...set, reps: 0 }] };
    expect(() => validateBackup(broken)).toThrow(); // no migration table: still invalid
    expect(migrateBackup(broken, { table: repairing, target: 2 }).sets[0].reps).toBe(8);
  });
});

// The real v1→v2 case the owner could hit: restoring a backup exported before
// this change set into the upgraded app. Validation must run on the MIGRATED
// records, and the restored data must come back with canonical v2 shapes.
describe('restoring a genuine v1 backup into v2', () => {
  const v1Backup = {
    app: 'gym-tracker',
    schemaVersion: 1,
    exportedAtMs: Date.UTC(2026, 6, 19),
    exercises: [
      { id: 'e1', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 },
      { id: 'e2', name: 'Dip', sortOrder: 1, archivedAtMs: 99, createdAtMs: 1, updatedAtMs: 1 },
    ],
    sets: [
      { id: 's1', exerciseId: 'e1', weightKg: 40, reps: 8, performedAtMs: 5, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 5, updatedAtMs: 5 },
      { id: 's2', exerciseId: 'e2', weightKg: 0, reps: 12, performedAtMs: 6, tzOffsetMin: 120, workoutDay: '2026-07-19', createdAtMs: 6, updatedAtMs: 6 },
    ],
    settings: { id: 'app', coarseIncrementKg: 2.5 },
  };

  it('accepts it and fills in the v2 fields', () => {
    const staged = validateBackup(v1Backup);
    expect(staged.schemaVersion).toBe(DB_VERSION);
    expect(staged.exercises.every((x) => x.muscleGroup === null)).toBe(true);
    expect(staged.sets.every((s) => s.addOn === false)).toBe(true);
    // Everything else survives, including the archived exercise and the
    // bodyweight (0 kg) set.
    expect(staged.exercises.find((x) => x.id === 'e2').archivedAtMs).toBe(99);
    expect(staged.sets.find((s) => s.id === 's2').weightKg).toBe(0);
  });

  it('leaves the file on disk untouched', () => {
    const before = structuredClone(v1Backup);
    validateBackup(v1Backup);
    expect(v1Backup).toEqual(before);
  });

  it('still enforces referential integrity after migrating', () => {
    const broken = { ...v1Backup, sets: [{ ...v1Backup.sets[0], exerciseId: 'gone' }] };
    expect(() => validateBackup(broken)).toThrow(/missing exercise/);
  });
});

// G2: after migration the file must satisfy the CURRENT schema, or tolerated
// junk would be imported and later re-exported as nominally valid v2 data.
describe('current-schema enforcement on import (G2)', () => {
  const ex = { id: 'e', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1, muscleGroup: null };
  const set = { id: 's', exerciseId: 'e', weightKg: 10, reps: 8, addOn: false, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '2026-07-19', createdAtMs: 1, updatedAtMs: 1 };
  const current = { app: 'gym-tracker', schemaVersion: DB_VERSION, exercises: [ex], sets: [set], settings: { id: 'app' } };

  it('accepts a well-formed current backup', () => {
    expect(validateBackup(current).sets).toHaveLength(1);
  });

  it('rejects a muscle group outside the taxonomy, naming the exercise', () => {
    const bad = { ...current, exercises: [{ ...ex, muscleGroup: 'Quads' }] };
    expect(() => validateBackup(bad)).toThrow(/Unknown muscle group on “Row”/);
  });

  it('rejects a non-boolean add-on flag', () => {
    expect(() => validateBackup({ ...current, sets: [{ ...set, addOn: 'yes' }] })).toThrow(/machine add-on/);
    expect(() => validateBackup({ ...current, sets: [{ ...set, addOn: 1 }] })).toThrow(/machine add-on/);
  });

  it('still accepts a v1 file whose records simply lack the fields', () => {
    const v1 = { ...current, schemaVersion: 1, exercises: [{ ...ex, muscleGroup: undefined }], sets: [{ ...set, addOn: undefined }] };
    const staged = validateBackup(v1);
    expect(staged.exercises[0].muscleGroup).toBeNull();
    expect(staged.sets[0].addOn).toBe(false);
  });

  it('rejects a v1 file carrying an invalid group that migration cannot fix', () => {
    const v1 = { ...current, schemaVersion: 1, exercises: [{ ...ex, muscleGroup: 'Quads' }] };
    expect(() => validateBackup(v1)).toThrow(/Unknown muscle group/);
  });
});
