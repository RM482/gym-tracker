// backup.js — canonical restorable export envelope (plan §16).

import { DB_VERSION } from './db.js';

export function buildBackup(snapshot, exportedAtMs) {
  return {
    app: 'gym-tracker',
    schemaVersion: DB_VERSION,
    exportedAtMs,
    exercises: snapshot.exercises,
    sets: snapshot.sets,
    settings: snapshot.settings,
    unreadable: snapshot.unreadable,
  };
}

export function backupFilename(exportedAtMs) {
  return `gym-tracker-backup-${new Date(exportedAtMs).toISOString().slice(0, 10)}.json`;
}

export async function collectBackup(store, exportedAtMs = Date.now()) {
  return buildBackup(await store.snapshotForBackup(), exportedAtMs);
}

export class BackupError extends Error {}

export function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BackupError('This is not a Gym Tracker backup');
  if (data.app !== 'gym-tracker') throw new BackupError('This is not a Gym Tracker backup');
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) throw new BackupError('Invalid backup version');
  if (data.schemaVersion > DB_VERSION) throw new BackupError('This backup comes from a newer app version — update the app and retry');
  if (!Array.isArray(data.exercises) || !Array.isArray(data.sets) || !data.settings || typeof data.settings !== 'object') {
    throw new BackupError('The backup is missing exercises, sets, or settings');
  }
  if (data.exercises.length > 500 || data.sets.length > 200000) throw new BackupError('The backup contains too many records');
  const ids = new Set(); const activeNames = new Set();
  for (const ex of data.exercises) {
    if (!ex || typeof ex.id !== 'string' || typeof ex.name !== 'string' || !ex.name.trim() || ex.name.length > 60
      || !Number.isInteger(ex.sortOrder) || typeof ex.createdAtMs !== 'number') throw new BackupError('An exercise record is invalid');
    if (ids.has(ex.id)) throw new BackupError(`Duplicate exercise id: ${ex.id}`);
    ids.add(ex.id);
    if (!ex.archivedAtMs) {
      const key = ex.name.trim().toLowerCase();
      if (activeNames.has(key)) throw new BackupError(`Duplicate active exercise name: ${ex.name}`);
      activeNames.add(key);
    }
  }
  const setIds = new Set();
  for (const set of data.sets) {
    if (!set || typeof set.id !== 'string' || setIds.has(set.id)) throw new BackupError('A set has an invalid or duplicate id');
    setIds.add(set.id);
    if (!ids.has(set.exerciseId)) throw new BackupError(`A set refers to missing exercise: ${set.exerciseId}`);
    if (typeof set.weightKg !== 'number' || !Number.isFinite(set.weightKg) || set.weightKg < 0 || set.weightKg > 999
      || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 200
      || typeof set.performedAtMs !== 'number' || !Number.isFinite(set.performedAtMs)
      || typeof set.tzOffsetMin !== 'number' || typeof set.workoutDay !== 'string') throw new BackupError(`Invalid set: ${set.id}`);
  }
  return { ...data, unreadable: Array.isArray(data.unreadable) ? data.unreadable : [] };
}
