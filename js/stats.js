// stats.js — pure calculation helpers, no DOM/DB (plan §11).
// Phase 1 ships workout-day grouping and set ordering; Phase 5 adds day-overview
// grouping/duration; dashboard metrics arrive in Phase 6.

// D1 (approved): a workout day runs 03:00–03:00 local time, so a set logged at
// 00:30 belongs to the previous evening's workout.
const DAY_SHIFT_MS = 3 * 3600 * 1000;

// The set's stored offset reconstructs its local wall-clock moment, so grouping
// never shifts when the phone later travels or DST changes (plan §11.1).
export function workoutDay(performedAtMs, tzOffsetMin) {
  const wallClockAsUtc = performedAtMs + tzOffsetMin * 60000 - DAY_SHIFT_MS;
  return new Date(wallClockAsUtc).toISOString().slice(0, 10);
}

// Deterministic ordering (plan §8.2): performedAtMs, then createdAtMs, then id.
export function compareSets(a, b) {
  if (a.performedAtMs !== b.performedAtMs) return a.performedAtMs - b.performedAtMs;
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Approximate workout duration: first recorded set → last recorded set.
// A single set has no meaningful duration and returns null (rendered as "—").
export function dayDurationMs(sets) {
  if (!Array.isArray(sets) || sets.length < 2) return null;
  const times = sets.map((set) => set.performedAtMs);
  return Math.max(...times) - Math.min(...times);
}

// Input is normally already in deterministic set order. Sorting here keeps the
// helper pure and safe for fixtures/callers; group order follows first set time.
export function groupDaySets(sets) {
  const groups = new Map();
  for (const set of [...sets].sort(compareSets)) {
    if (!groups.has(set.exerciseId)) groups.set(set.exerciseId, []);
    groups.get(set.exerciseId).push(set);
  }
  return [...groups].map(([exerciseId, groupedSets]) => ({ exerciseId, sets: groupedSets }));
}
