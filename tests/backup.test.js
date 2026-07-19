import { describe, it, expect } from 'vitest';
import { buildBackup, backupFilename } from '../js/backup.js';

describe('backup export', () => {
  it('builds the versioned restorable envelope without changing records', () => {
    const snapshot = { exercises: [{ id: 'e' }], sets: [{ id: 's' }], settings: { id: 'app' }, unreadable: [{ store: 'sets' }] };
    const at = Date.UTC(2026, 6, 19);
    expect(buildBackup(snapshot, at)).toEqual({ app: 'gym-tracker', schemaVersion: 1, exportedAtMs: at, ...snapshot });
    expect(backupFilename(at)).toBe('gym-tracker-backup-2026-07-19.json');
  });
});
