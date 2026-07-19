import { describe, it, expect } from 'vitest';
import { workoutDay, compareSets } from '../js/stats.js';

// Helper: epoch ms for a local wall-clock time at a fixed offset (minutes east of UTC).
function localMs(y, mo, d, h, mi, offsetMin) {
  return Date.UTC(y, mo - 1, d, h, mi) - offsetMin * 60000;
}

describe('workoutDay (03:00 boundary, D1)', () => {
  const CEST = 120; // +02:00

  it('assigns an evening set to its calendar day', () => {
    expect(workoutDay(localMs(2026, 7, 15, 23, 59, CEST), CEST)).toBe('2026-07-15');
  });

  it('assigns a set at 00:30 to the previous evening', () => {
    expect(workoutDay(localMs(2026, 7, 16, 0, 30, CEST), CEST)).toBe('2026-07-15');
  });

  it('starts the new day at 03:00', () => {
    expect(workoutDay(localMs(2026, 7, 16, 2, 59, CEST), CEST)).toBe('2026-07-15');
    expect(workoutDay(localMs(2026, 7, 16, 3, 1, CEST), CEST)).toBe('2026-07-16');
  });

  it('uses the offset captured with the set, not the current zone', () => {
    const ms = localMs(2026, 7, 16, 0, 30, CEST);
    // Same instant seen from UTC+0 would be 22:30 on the 15th; with the stored
    // CEST offset it still groups to the 15th regardless of where the phone is now.
    expect(workoutDay(ms, CEST)).toBe('2026-07-15');
    // A set genuinely recorded in another zone groups by that zone's wall clock.
    const nycOffset = -240; // -04:00
    expect(workoutDay(localMs(2026, 7, 16, 0, 30, nycOffset), nycOffset)).toBe('2026-07-15');
  });

  it('handles the DST change day via stored offsets', () => {
    // Netherlands, 25 Oct 2026: clocks fall back; offsets differ before/after.
    expect(workoutDay(localMs(2026, 10, 25, 1, 30, 120), 120)).toBe('2026-10-24');
    expect(workoutDay(localMs(2026, 10, 25, 4, 0, 60), 60)).toBe('2026-10-25');
  });
});

describe('compareSets (plan §8.2 ordering rule)', () => {
  it('orders by performedAtMs, then createdAtMs, then id', () => {
    const a = { performedAtMs: 100, createdAtMs: 5, id: 'a' };
    const b = { performedAtMs: 200, createdAtMs: 1, id: 'b' };
    const c = { performedAtMs: 100, createdAtMs: 9, id: 'c' };
    const d = { performedAtMs: 100, createdAtMs: 9, id: 'd' };
    expect([d, c, b, a].sort(compareSets).map((s) => s.id)).toEqual(['a', 'c', 'd', 'b']);
  });
});
