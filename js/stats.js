// stats.js — pure calculation helpers, no DOM/DB (plan §11).
// Phase 1 ships workout-day grouping and set ordering; dashboard metrics arrive in Phase 6.
// Public API: workoutDay(performedAtMs, tzOffsetMin), compareSets(a, b)

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
