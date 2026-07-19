import { describe, it, expect } from 'vitest';
import { buildAnalysisExport, analysisExportFilename } from '../js/analysis-export.js';

describe('LLM-friendly analysis export', () => {
  const exportedAtMs = Date.UTC(2026, 6, 19, 12);
  const exercises = [
    { id: 'bench', name: 'Bench press', archivedAtMs: null },
    { id: 'dip', name: 'Dip', archivedAtMs: 123 },
  ];
  const sets = [
    { id: 'b', exerciseId: 'dip', weightKg: 0, reps: 12, performedAtMs: Date.UTC(2026, 6, 16, 10), tzOffsetMin: 120, workoutDay: '2026-07-16', createdAtMs: 2 },
    { id: 'a', exerciseId: 'bench', weightKg: 40, reps: 8, performedAtMs: Date.UTC(2026, 6, 15, 10), tzOffsetMin: 120, workoutDay: '2026-07-15', createdAtMs: 1 },
  ];

  it('denormalises names and emits analysis-ready chronology and context', () => {
    const data = buildAnalysisExport({ exercises, sets, exportedAtMs });
    expect(data.format).toBe('llm-analysis');
    expect(data.summary).toEqual({
      exerciseCount: 2, setCount: 2, workoutCount: 2,
      firstWorkoutDay: '2026-07-15', lastWorkoutDay: '2026-07-16',
    });
    expect(data.sets[0]).toMatchObject({
      exerciseId: 'bench', exerciseName: 'Bench press', exerciseArchived: false,
      performedAtLocal: '2026-07-15T12:00:00', weightKg: 40, reps: 8, isBodyweight: false,
    });
    expect(data.sets[1]).toMatchObject({
      exerciseName: 'Dip', exerciseArchived: true, weightKg: 0, isBodyweight: true,
    });
    expect(data.exercises).toEqual([
      { exerciseId: 'bench', exerciseName: 'Bench press', archived: false },
      { exerciseId: 'dip', exerciseName: 'Dip', archived: true },
    ]);
  });

  it('handles an empty tracker and generates a dated filename', () => {
    const data = buildAnalysisExport({ exercises: [], sets: [], exportedAtMs });
    expect(data.summary).toEqual({ exerciseCount: 0, setCount: 0, workoutCount: 0, firstWorkoutDay: null, lastWorkoutDay: null });
    expect(analysisExportFilename(exportedAtMs)).toBe('gym-tracker-analysis-2026-07-19.json');
  });
});
