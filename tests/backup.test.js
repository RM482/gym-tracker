import { describe, it, expect } from 'vitest';
import { buildBackup, backupFilename, validateBackup } from '../js/backup.js';

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
