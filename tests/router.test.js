import { describe, it, expect } from 'vitest';
import { parseRoute, canResetData, RESET_PHRASE } from '../js/app.js';

describe('parseRoute', () => {
  it('maps the empty/base hash to home', () => {
    expect(parseRoute('')).toEqual({ screen: 'home', params: {} });
    expect(parseRoute('#/')).toEqual({ screen: 'home', params: {} });
  });

  it('parses parameterised routes', () => {
    expect(parseRoute('#/log/abc-123')).toEqual({ screen: 'log', params: { exerciseId: 'abc-123' } });
    expect(parseRoute('#/history/abc-123')).toEqual({ screen: 'history', params: { exerciseId: 'abc-123' } });
    expect(parseRoute('#/day/2026-07-19')).toEqual({ screen: 'day', params: { date: '2026-07-19' } });
  });

  it('parses static routes', () => {
    for (const s of ['dashboard', 'manage', 'settings']) {
      expect(parseRoute(`#/${s}`)).toEqual({ screen: s, params: {} });
    }
  });

  it('rejects unknown or malformed routes', () => {
    expect(parseRoute('#/nope')).toBeNull();
    expect(parseRoute('#/day/19-07-2026')).toBeNull();
    expect(parseRoute('#/log/')).toBeNull();
  });
});

describe('recovery confirmation', () => {
  it('requires the exact destructive reset phrase', () => {
    expect(canResetData(RESET_PHRASE)).toBe(true);
    expect(canResetData(` ${RESET_PHRASE} `)).toBe(true);
    expect(canResetData('reset my data')).toBe(false);
    expect(canResetData('RESET MY DATA NOW')).toBe(false);
  });
});
