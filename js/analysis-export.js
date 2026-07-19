// analysis-export.js — readable, denormalised JSON for user-chosen analysis.
// Pure transformation: no DOM, database, network, or file-system access.

import { compareSets } from './stats.js';

function localDateTime(set) {
  return new Date(set.performedAtMs + set.tzOffsetMin * 60000).toISOString().slice(0, 19);
}

export function buildAnalysisExport({ exercises, sets, exportedAtMs }) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const rows = [...sets].sort(compareSets).map((set) => {
    const exercise = exerciseById.get(set.exerciseId);
    return {
      exerciseId: set.exerciseId,
      exerciseName: exercise?.name ?? 'Unknown exercise',
      exerciseArchived: Boolean(exercise?.archivedAtMs),
      workoutDay: set.workoutDay,
      performedAtLocal: localDateTime(set),
      utcOffsetMinutes: set.tzOffsetMin,
      performedAtUtc: new Date(set.performedAtMs).toISOString(),
      weightKg: set.weightKg,
      reps: set.reps,
      isBodyweight: set.weightKg === 0,
    };
  });
  const days = [...new Set(rows.map((row) => row.workoutDay))].sort();
  return {
    app: 'gym-tracker',
    format: 'llm-analysis',
    formatVersion: 1,
    exportedAtUtc: new Date(exportedAtMs).toISOString(),
    guidance: 'Each row is one completed set. Weight is external load in kilograms; weightKg 0 means pure bodyweight. Workout days run from 03:00 to 03:00 local time.',
    summary: {
      exerciseCount: new Set(rows.map((row) => row.exerciseId)).size,
      setCount: rows.length,
      workoutCount: days.length,
      firstWorkoutDay: days[0] ?? null,
      lastWorkoutDay: days.at(-1) ?? null,
    },
    exercises: exercises.map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      archived: Boolean(exercise.archivedAtMs),
    })),
    sets: rows,
  };
}

export function analysisExportFilename(exportedAtMs) {
  return `gym-tracker-analysis-${new Date(exportedAtMs).toISOString().slice(0, 10)}.json`;
}

export async function collectAnalysisExport(store, exportedAtMs = Date.now()) {
  const exercises = await store.listExercises({ includeArchived: true, order: 'manual' });
  const nested = await Promise.all(exercises.map((exercise) => store.getSetsForExercise(exercise.id)));
  return buildAnalysisExport({ exercises, sets: nested.flat(), exportedAtMs });
}
