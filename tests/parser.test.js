import { describe, it, expect } from 'vitest';
import { parseQuickEntry } from '../js/parser.js';

describe('quick-entry parser', () => {
  it('parses the canonical sentence into an ordered batch', () => {
    const result = parseQuickEntry('I did 2 sets of 8 reps at 10kg, then one set of 8 reps at 9kg');
    expect(result.errors).toEqual([]);
    expect(result.sets).toEqual([
      { weightKg: 10, reps: 8 },
      { weightKg: 10, reps: 8 },
      { weightKg: 9, reps: 8 },
    ]);
  });

  it('supports symbolic, unit-first, bodyweight, decimal-comma and Dutch forms', () => {
    expect(parseQuickEntry('2x8 @ 22,5kg; 20kg x 6; bw x 12').sets).toEqual([
      { weightKg: 22.5, reps: 8 }, { weightKg: 22.5, reps: 8 },
      { weightKg: 20, reps: 6 }, { weightKg: 0, reps: 12 },
    ]);
    expect(parseQuickEntry('deed twee sets van acht keer op tien kilo').sets).toHaveLength(2);
  });

  it('lets bare reps and short sets×reps inherit sentence or pre-filled weight', () => {
    expect(parseQuickEntry('8 @ 10kg, 6, 2x5').sets).toEqual([
      { weightKg: 10, reps: 8 }, { weightKg: 10, reps: 6 },
      { weightKg: 10, reps: 5 }, { weightKg: 10, reps: 5 },
    ]);
    expect(parseQuickEntry('2x8', { fallbackWeightKg: 12.5 }).sets).toHaveLength(2);
  });

  it('rejects ambiguous unit-less multiplication and missing inherited weight', () => {
    expect(parseQuickEntry('10 x 8', { fallbackWeightKg: 20 }).errors[0].reason).toMatch(/add kg or @/);
    expect(parseQuickEntry('8').errors[0].reason).toMatch(/add a weight/);
  });

  it('is all-or-nothing and identifies the failing fragment', () => {
    const result = parseQuickEntry('8 @ 10kg, bananas, 6');
    expect(result.sets).toEqual([]);
    expect(result.errors).toEqual([{ fragment: 'bananas', reason: 'could not understand this part' }]);
  });

  it('enforces per-segment and per-submission limits without throwing', () => {
    expect(parseQuickEntry('21x8 @ 10kg').errors[0].reason).toMatch(/1 and 20/);
    expect(parseQuickEntry('31x8 @ 10kg').sets).toEqual([]);
    expect(parseQuickEntry('20x8 @ 10kg, 20x8 @ 10kg').errors[0].reason).toMatch(/at most 30/);
    expect(() => parseQuickEntry(null)).not.toThrow();
  });

  it('documents the decimal-comma separator rule', () => {
    expect(parseQuickEntry('10,1x8', { fallbackWeightKg: 5 }).errors).not.toEqual([]);
    expect(parseQuickEntry('10, 1x8', { fallbackWeightKg: 5 }).sets).toEqual([
      { weightKg: 5, reps: 10 }, { weightKg: 5, reps: 8 },
    ]);
  });
});
