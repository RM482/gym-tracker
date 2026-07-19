import { describe, it, expect } from 'vitest';
import { pickRepeatSet, fmtSet } from '../js/ui/log.js';

// Worked examples from plan §6.2: previous session 10×8, 10×8, 9×8.
const prev = [
  { weightKg: 10, reps: 8 },
  { weightKg: 10, reps: 8 },
  { weightKg: 9, reps: 8 },
];

describe('pickRepeatSet (↻ n+1 rule, §6.2)', () => {
  it('offers set n+1 for n sets logged today', () => {
    expect(pickRepeatSet(prev, 0)).toEqual(prev[0]);
    expect(pickRepeatSet(prev, 1)).toEqual(prev[1]);
    expect(pickRepeatSet(prev, 2)).toEqual(prev[2]);
  });

  it('sticks to the last set once the previous session is exhausted', () => {
    expect(pickRepeatSet(prev, 3)).toEqual(prev[2]);
    expect(pickRepeatSet(prev, 10)).toEqual(prev[2]);
  });

  it('returns null without a previous session', () => {
    expect(pickRepeatSet(null, 0)).toBeNull();
    expect(pickRepeatSet([], 0)).toBeNull();
  });
});

describe('fmtSet', () => {
  it('formats weighted and bodyweight sets', () => {
    expect(fmtSet({ weightKg: 22.5, reps: 8 })).toBe('22.5 kg × 8');
    expect(fmtSet({ weightKg: 0, reps: 12 })).toBe('bw × 12');
  });
});
