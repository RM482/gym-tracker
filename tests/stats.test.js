import { describe, it, expect } from 'vitest';
import {
  workoutDay, compareSets, dayDurationMs, groupDaySets, epley,
  exerciseProgress, filterSetsByPeriod, consistencyWorkouts,
  topEffort, plateauStreak, plateauNudge,
} from '../js/stats.js';

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

describe('day overview helpers (plan §6.7)', () => {
  it('calculates duration from first to last set, with no duration for fewer than two', () => {
    expect(dayDurationMs([])).toBeNull();
    expect(dayDurationMs([{ performedAtMs: 100 }])).toBeNull();
    expect(dayDurationMs([{ performedAtMs: 3_100 }, { performedAtMs: 100 }, { performedAtMs: 1_000 }])).toBe(3_000);
  });

  it('groups exercises by first-set order and preserves set order within each group', () => {
    const set = (id, exerciseId, performedAtMs) => ({ id, exerciseId, performedAtMs, createdAtMs: performedAtMs });
    const groups = groupDaySets([
      set('b2', 'b', 400), set('a2', 'a', 300), set('b1', 'b', 200), set('a1', 'a', 100),
    ]);
    expect(groups.map((group) => group.exerciseId)).toEqual(['a', 'b']);
    expect(groups[0].sets.map((entry) => entry.id)).toEqual(['a1', 'a2']);
    expect(groups[1].sets.map((entry) => entry.id)).toEqual(['b1', 'b2']);
  });
});

describe('dashboard metrics (plan §11.2)', () => {
  const set = (id, day, weightKg, reps) => ({
    id, exerciseId: 'ex', workoutDay: day, weightKg, reps,
    performedAtMs: Date.parse(`${day}T12:00:00Z`), createdAtMs: id.charCodeAt(0),
  });

  it('calculates top weight and eligible Epley values per day', () => {
    expect(epley(60, 5)).toBe(70);
    const result = exerciseProgress([
      set('a', '2026-07-01', 60, 5), set('b', '2026-07-01', 65, 15),
      set('c', '2026-07-08', 62.5, 8), set('d', '2026-07-08', 0, 20),
    ]);
    expect(result.mode).toBe('weight');
    expect(result.days[0]).toMatchObject({ day: '2026-07-01', topWeightKg: 65, maxReps: 15, bestE1rmKg: 70 });
    expect(result.days[1].bestE1rmKg).toBeCloseTo(79.1667, 3);
    expect(result.prs.heaviest).toEqual({ value: 65, day: '2026-07-01' });
    expect(result.prs.reps).toEqual({ value: 20, day: '2026-07-08' });
  });

  it('uses reps mode only when every set is zero-weight', () => {
    const result = exerciseProgress([set('a', '2026-07-01', 0, 8), set('b', '2026-07-08', 0, 12)]);
    expect(result.mode).toBe('reps');
    expect(result.days.map((day) => day.maxReps)).toEqual([8, 12]);
    expect(result.prs).toEqual({ reps: { value: 12, day: '2026-07-08' } });
    expect(exerciseProgress([]).mode).toBe('empty');
  });

  it('filters periods and counts distinct workout days in the trailing 28 days', () => {
    const sets = [
      set('a', '2026-01-01', 10, 8), set('b', '2026-05-25', 10, 8),
      set('c', '2026-06-22', 10, 8), set('d', '2026-06-22', 20, 5), set('e', '2026-07-19', 20, 5),
    ];
    expect(filterSetsByPeriod(sets, '2026-07-19', '8w').map((entry) => entry.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(filterSetsByPeriod(sets, '2026-07-19', '6m').map((entry) => entry.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(filterSetsByPeriod(sets, '2026-07-19', 'all')).toHaveLength(5);
    expect(consistencyWorkouts(sets, '2026-07-19')).toBe(2);
  });
});

describe('plateau detection (D6)', () => {
  const session = (day, ...sets) => ({ day, sets: sets.map(([weightKg, reps, addOn = false]) => ({ weightKg, reps, addOn })) });

  it('reports the top effort as weight plus add-on state', () => {
    expect(topEffort([{ weightKg: 40, reps: 8, addOn: false }, { weightKg: 50, reps: 5, addOn: true }]))
      .toEqual({ weightKg: 50, addOn: true });
    // Add-on only counts when it was engaged at the TOP weight.
    expect(topEffort([{ weightKg: 50, reps: 5, addOn: false }, { weightKg: 40, reps: 8, addOn: true }]))
      .toEqual({ weightKg: 50, addOn: false });
  });

  it('counts consecutive sessions at an identical top effort', () => {
    const flat = [session('d1', [50, 10]), session('d2', [50, 8]), session('d3', [50, 12])];
    expect(plateauStreak(flat)).toEqual({ streak: 3, weightKg: 50, addOn: false });
  });

  it('breaks the streak when the weight changes', () => {
    const progressing = [session('d1', [50, 10]), session('d2', [50, 10]), session('d3', [52.5, 8])];
    expect(plateauStreak(progressing).streak).toBe(1);
  });

  it('treats the same weight with and without the add-on as different loads (F11)', () => {
    const mixed = [session('d1', [50, 10]), session('d2', [50, 10, true]), session('d3', [50, 10, true])];
    expect(plateauStreak(mixed)).toEqual({ streak: 2, weightKg: 50, addOn: true });
  });

  it('nudges only from the third identical session', () => {
    const two = [session('d1', [50, 10]), session('d2', [50, 10])];
    const three = [...two, session('d3', [50, 10])];
    expect(plateauNudge(two)).toBeNull();
    expect(plateauNudge(three)).toEqual({ sessions: 3, weightKg: 50, addOn: false });
  });

  it('stays visible during today until today actually beats the plateau', () => {
    const three = [session('d1', [50, 10]), session('d2', [50, 10]), session('d3', [50, 10])];
    // A warm-up set today must not clear it (F12).
    expect(plateauNudge(three, [{ weightKg: 20, reps: 10, addOn: false }])).toBeTruthy();
    // Matching the plateau does not clear it either.
    expect(plateauNudge(three, [{ weightKg: 50, reps: 10, addOn: false }])).toBeTruthy();
    // Beating it does.
    expect(plateauNudge(three, [{ weightKg: 52.5, reps: 6, addOn: false }])).toBeNull();
  });

  it('never nudges for pure bodyweight exercises (F13)', () => {
    const bodyweight = [session('d1', [0, 12]), session('d2', [0, 12]), session('d3', [0, 12])];
    expect(plateauStreak(bodyweight).streak).toBe(0);
    expect(plateauNudge(bodyweight)).toBeNull();
  });

  it('handles mixed bodyweight and loaded sessions without false claims', () => {
    // Latest session is loaded, earlier ones were bodyweight-only: no plateau.
    const mixed = [session('d1', [0, 12]), session('d2', [0, 12]), session('d3', [5, 8])];
    expect(plateauStreak(mixed).streak).toBe(1);
  });

  it('is safe on empty input', () => {
    expect(plateauStreak([])).toEqual({ streak: 0, weightKg: null, addOn: false });
    expect(plateauNudge([])).toBeNull();
  });
});
