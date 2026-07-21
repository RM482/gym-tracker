import { describe, it, expect } from 'vitest';
import { buildAnalysisExport, analysisExportFilename } from '../js/analysis-export.js';

describe('LLM-friendly analysis export', () => {
  const exportedAtMs = Date.UTC(2026, 6, 19, 12);
  const exercises = [
    { id: 'bench', name: 'Bench press', muscleGroup: 'Chest', archivedAtMs: null },
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
      exerciseId: 'bench', exerciseName: 'Bench press', exerciseMuscleGroup: 'Chest', exerciseArchived: false,
      performedAtLocal: '2026-07-15T12:00:00', weightKg: 40, reps: 8, isBodyweight: false,
    });
    expect(data.sets[1]).toMatchObject({
      exerciseName: 'Dip', exerciseArchived: true, weightKg: 0, isBodyweight: true,
    });
    expect(data.exercises).toEqual([
      { exerciseId: 'bench', exerciseName: 'Bench press', muscleGroup: 'Chest', archived: false },
      { exerciseId: 'dip', exerciseName: 'Dip', muscleGroup: null, archived: true },
    ]);
  });

  it('handles an empty tracker and generates a dated filename', () => {
    const data = buildAnalysisExport({ exercises: [], sets: [], exportedAtMs });
    expect(data.summary).toEqual({ exerciseCount: 0, setCount: 0, workoutCount: 0, firstWorkoutDay: null, lastWorkoutDay: null });
    expect(analysisExportFilename(exportedAtMs)).toBe('gym-tracker-analysis-2026-07-19.json');
  });
});

// The add-on flag must reach the analysis file with an explicit explanation:
// an LLM reading it would otherwise treat 50 kg with the add-on and 50 kg
// without as identical loads (D7).
describe('analysis export carries v2 context', () => {
  it('emits machineAddOn per set and explains that its kg are not in weightKg', () => {
    const data = buildAnalysisExport({
      exercises: [{ id: 'press', name: 'Leg press', muscleGroup: 'Legs', archivedAtMs: null }],
      sets: [
        { id: 'a', exerciseId: 'press', weightKg: 50, reps: 10, addOn: true, performedAtMs: Date.UTC(2026, 6, 15, 10), createdAtMs: 1, tzOffsetMin: 120, workoutDay: '2026-07-15' },
        { id: 'b', exerciseId: 'press', weightKg: 50, reps: 10, addOn: false, performedAtMs: Date.UTC(2026, 6, 15, 10, 5), createdAtMs: 2, tzOffsetMin: 120, workoutDay: '2026-07-15' },
      ],
      exportedAtMs: Date.UTC(2026, 6, 21),
    });

    expect(data.sets.map((s) => s.machineAddOn)).toEqual([true, false]);
    expect(data.sets.every((s) => s.weightKg === 50)).toBe(true); // never inflated
    expect(data.guidance).toMatch(/machineAddOn/);
    expect(data.guidance).toMatch(/not included in weightKg/i);
    expect(data.exercises[0].muscleGroup).toBe('Legs');
  });
});
