import { describe, it, expect } from 'vitest';
import { parseRoute, canResetData, RESET_PHRASE, routeKey, shouldCommitRender } from '../js/app.js';

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

  // The superset pair lives in the route because it is ad-hoc per session.
  it('parses a superset pair and refuses one exercise supersetted with itself', () => {
    expect(parseRoute('#/superset/a-1/b-2')).toEqual({ screen: 'superset', params: { aId: 'a-1', bId: 'b-2' } });
    // Order is meaningful — it decides which panel is on top.
    expect(parseRoute('#/superset/b-2/a-1')).toEqual({ screen: 'superset', params: { aId: 'b-2', bId: 'a-1' } });
    // Two panels for ONE exercise would mean two independent write guards and
    // two live Save buttons for the same target — the duplicate path the single
    // guard exists to prevent. Rejected at the router.
    expect(parseRoute('#/superset/a-1/a-1')).toBeNull();
    expect(parseRoute('#/superset/a-1')).toBeNull();
    expect(parseRoute('#/superset/a-1/')).toBeNull();
    expect(parseRoute('#/superset//b-2')).toBeNull();
  });

  // Bulk grouping keeps its target group in the route so a background refresh
  // cannot drop the owner out of the mode.
  it('parses the bulk grouping route, including a group name with a space', () => {
    expect(parseRoute('#/manage/group/Arms')).toEqual({ screen: 'manage', params: { groupingAs: 'Arms' } });
    expect(parseRoute('#/manage/group/Full%20body')).toEqual({ screen: 'manage', params: { groupingAs: 'Full body' } });
    // Routing stays ignorant of the taxonomy; manage.js falls back to the plain
    // list for a name it does not recognise, so an odd URL is harmless.
    expect(parseRoute('#/manage/group/Nonsense')).toEqual({ screen: 'manage', params: { groupingAs: 'Nonsense' } });
    // A malformed escape must not throw out of the router.
    expect(parseRoute('#/manage/group/%E0%A4%A')).toEqual({ screen: 'manage', params: {} });
    expect(parseRoute('#/manage/group/')).toBeNull();
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

describe('routeKey', () => {
  it('distinguishes screens and their params', () => {
    expect(routeKey(parseRoute('#/'))).toBe(routeKey(parseRoute('#/')));
    expect(routeKey(parseRoute('#/log/a'))).not.toBe(routeKey(parseRoute('#/log/b')));
    expect(routeKey(parseRoute('#/dashboard'))).not.toBe(routeKey(parseRoute('#/manage')));
    expect(routeKey(null)).toBe('');
  });
});

// Regression for the duplicate-Home-list bug: overlapping renders used to each
// clear #app once and then interleave their appends, stacking 2–3 copies of the
// list. Rendering is now detached and only commits when this predicate holds.
describe('shouldCommitRender', () => {
  const base = { seq: 2, currentSeq: 2, updateRequired: false, key: 'home:{}', currentKey: 'home:{}' };

  it('commits the newest render for the current route', () => {
    expect(shouldCommitRender(base)).toBe(true);
  });

  it('discards a render superseded by a newer one', () => {
    expect(shouldCommitRender({ ...base, seq: 1, currentSeq: 3 })).toBe(false);
  });

  it('discards a render whose route changed while it was loading', () => {
    expect(shouldCommitRender({ ...base, currentKey: 'log:{"exerciseId":"x"}' })).toBe(false);
    expect(shouldCommitRender({ ...base, key: 'log:{"exerciseId":"a"}', currentKey: 'log:{"exerciseId":"b"}' })).toBe(false);
  });

  it('never commits over a blocking update screen', () => {
    expect(shouldCommitRender({ ...base, updateRequired: true })).toBe(false);
  });

  it('requires every condition together', () => {
    expect(shouldCommitRender({ ...base, seq: 1, currentSeq: 3, updateRequired: true, currentKey: 'manage:{}' })).toBe(false);
  });
});
