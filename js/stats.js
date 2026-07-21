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

export function epley(weightKg, reps) {
  return weightKg * (1 + reps / 30);
}

export function exerciseProgress(sets) {
  if (!sets.length) return { mode: 'empty', days: [], prs: {} };
  const ordered = [...sets].sort(compareSets);
  const mode = ordered.some((set) => set.weightKg > 0) ? 'weight' : 'reps';
  const grouped = new Map();
  for (const set of ordered) {
    if (!grouped.has(set.workoutDay)) grouped.set(set.workoutDay, []);
    grouped.get(set.workoutDay).push(set);
  }
  const days = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([day, entries]) => {
    const eligible = entries.filter((set) => set.weightKg > 0 && set.reps <= 12);
    return {
      day,
      topWeightKg: Math.max(...entries.map((set) => set.weightKg)),
      maxReps: Math.max(...entries.map((set) => set.reps)),
      bestE1rmKg: eligible.length ? Math.max(...eligible.map((set) => epley(set.weightKg, set.reps))) : null,
    };
  });
  const maxBy = (entries, value) => entries.reduce((best, entry) => value(entry) > value(best) ? entry : best);
  const positive = ordered.filter((set) => set.weightKg > 0);
  const eligible = positive.filter((set) => set.reps <= 12);
  const zeroWeight = ordered.filter((set) => set.weightKg === 0);
  const prs = {};
  if (positive.length) {
    const set = maxBy(positive, (entry) => entry.weightKg);
    prs.heaviest = { value: set.weightKg, day: set.workoutDay };
  }
  if (eligible.length) {
    const set = maxBy(eligible, (entry) => epley(entry.weightKg, entry.reps));
    prs.e1rm = { value: epley(set.weightKg, set.reps), day: set.workoutDay };
  }
  if (zeroWeight.length) {
    const set = maxBy(zeroWeight, (entry) => entry.reps);
    prs.reps = { value: set.reps, day: set.workoutDay };
  }
  return { mode, days, prs };
}

function shiftUtcDay(day, { days = 0, months = 0 }) {
  const date = new Date(`${day}T00:00:00Z`);
  if (months) {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  }
  if (days) date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function filterSetsByPeriod(sets, todayDay, period) {
  if (period === 'all') return [...sets];
  const cutoff = period === '6m'
    ? shiftUtcDay(todayDay, { months: -6 })
    : shiftUtcDay(todayDay, { days: -55 }); // inclusive today = 8 weeks
  return sets.filter((set) => set.workoutDay >= cutoff && set.workoutDay <= todayDay);
}

export function consistencyWorkouts(sets, todayDay) {
  const cutoff = shiftUtcDay(todayDay, { days: -27 }); // inclusive today = 28 days
  return new Set(sets.filter((set) => set.workoutDay >= cutoff && set.workoutDay <= todayDay)
    .map((set) => set.workoutDay)).size;
}

// A session's top effort: the heaviest weight recorded that day, plus whether
// the machine add-on was engaged at that weight. The add-on's kilograms are
// unknown (D7), so it cannot be added to the number — but 50 kg with it is a
// different load from 50 kg without, which is why it travels as a pair.
export function topEffort(sets) {
  const weightKg = Math.max(...sets.map((s) => s.weightKg));
  const addOn = sets.some((s) => s.weightKg === weightKg && s.addOn === true);
  return { weightKg, addOn };
}

// Sessions must be ordered OLDEST → NEWEST.
// How many of the most recent consecutive sessions share an identical top
// effort. Zero-weight (pure bodyweight) sessions are excluded: reps progression
// is a different measure and would produce false plateau claims (F13).
export function plateauStreak(sessions) {
  const none = { streak: 0, weightKg: null, addOn: false };
  if (!sessions?.length) return none;
  const tops = sessions.map((session) => topEffort(session.sets));
  const latest = tops.at(-1);
  if (!(latest.weightKg > 0)) return none;
  let streak = 1;
  for (let i = tops.length - 2; i >= 0; i--) {
    const t = tops[i];
    if (t.weightKg === latest.weightKg && t.addOn === latest.addOn && t.weightKg > 0) streak += 1;
    else break;
  }
  return { streak, weightKg: latest.weightKg, addOn: latest.addOn };
}

// The in-app plateau nudge (D6). Evaluated over COMPLETED workout-days strictly
// before today, so a warm-up set logged today cannot make it vanish before the
// day's real top set exists. It clears as soon as today beats the plateau.
export function plateauNudge(previousSessions, todaySets = [], threshold = 3) {
  const { streak, weightKg, addOn } = plateauStreak(previousSessions);
  if (streak < threshold || !(weightKg > 0)) return null;
  if (todaySets.length) {
    const todayTop = Math.max(...todaySets.map((s) => s.weightKg));
    if (todayTop > weightKg) return null;
  }
  return { sessions: streak, weightKg, addOn };
}
