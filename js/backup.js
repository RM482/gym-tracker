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
