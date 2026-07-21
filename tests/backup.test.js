import { describe, it, expect } from 'vitest';
import { buildBackup, backupFilename, validateBackup, migrateBackup } from '../js/backup.js';

describe('backup export', () => {
  it('builds the versioned restorable envelope without changing records', () => {
    const snapshot = { exercises: [{ id: 'e' }], sets: [{ id: 's' }], settings: { id: 'app' }, unreadable: [{ store: 'sets' }] };
    const at = Date.UTC(2026, 6, 19);
    expect(buildBackup(snapshot, at)).toEqual({ app: 'gym-tracker', schemaVersion: 1, exportedAtMs: at, ...snapshot });
    expect(backupFilename(at)).toBe('gym-tracker-backup-2026-07-19.json');
  });

  it('stages valid backups and rejects identity, version, duplicate and FK failures', () => {
    const ex = { id: 'e', name: 'Row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 };
    const set = { id: 's', exerciseId: 'e', weightKg: 10, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '2026-07-19', createdAtMs: 1, updatedAtMs: 1 };
    const good = { app: 'gym-tracker', schemaVersion: 1, exercises: [ex], sets: [set], settings: { id: 'app' } };
    expect(validateBackup(good).sets).toHaveLength(1);
    expect(() => validateBackup({ ...good, app: 'other' })).toThrow(/not a Gym Tracker/);
    expect(() => validateBackup({ ...good, schemaVersion: 2 })).toThrow(/newer/);
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
