import {describe, expect, it} from 'vitest';
import source from '../backend.js?raw';

type Release = { autoAttachQuery?: string; plannedIssues?: Array<{ id: string; source?: string }> };
type ApplyFn = (ctx: unknown, prev: Release | null, rv: Release) => { code: number; message: string } | null;

// backend.js is a YouTrack CommonJS module; run it with stub YouTrack APIs and reach the private function
const moduleExports: Record<string, unknown> = {};
// eslint-disable-next-line no-new-func
new Function('require', 'exports', `${source}\nexports.applyAutoAttachOnSave = applyAutoAttachOnSave;`)(() => ({}), moduleExports);
const applyAutoAttachOnSave = moduleExports.applyAutoAttachOnSave as ApplyFn;

const FORBIDDEN = 403;

function ctxFor(isManager: boolean) {
  return {
    settings: {autoAttachByFilter: true, releaseManagers: [{name: 'rm'}], lightManagers: []},
    currentUser: {login: 'u', isInGroup: (group: string) => isManager && group === 'rm'}
  };
}

describe('applyAutoAttachOnSave permissions', () => {
  it('rejects clearing the filter for a user without a manager role', () => {
    const prev = {autoAttachQuery: 'tag: x', plannedIssues: [{id: 'A-1', source: 'filter'}]};
    const rv = {plannedIssues: [{id: 'A-1', source: 'filter'}]};
    expect(applyAutoAttachOnSave(ctxFor(false), prev, rv)?.code).toBe(FORBIDDEN);
  });

  it('ignores client-sent markers from a user without a manager role', () => {
    const prev = {autoAttachQuery: 'tag: x', plannedIssues: [{id: 'A-1'}, {id: 'A-2', source: 'filter'}]};
    const rv = {
      autoAttachQuery: 'tag: x',
      plannedIssues: [{id: 'A-1', source: 'filter'}, {id: 'A-2'}, {id: 'A-3', source: 'filter'}]
    };
    expect(applyAutoAttachOnSave(ctxFor(false), prev, rv)).toBeNull();
    expect(rv.plannedIssues).toEqual([{id: 'A-1'}, {id: 'A-2', source: 'filter'}, {id: 'A-3'}]);
  });

  it('keeps markers set by a manager and lets a manager clear the filter', () => {
    const prev = {autoAttachQuery: 'tag: x', plannedIssues: [{id: 'A-1', source: 'filter'}]};
    const kept = {autoAttachQuery: 'tag: x', plannedIssues: [{id: 'A-1', source: 'filter'}, {id: 'A-2', source: 'filter'}]};
    expect(applyAutoAttachOnSave(ctxFor(true), prev, kept)).toBeNull();
    expect(kept.plannedIssues.map(i => i.source)).toEqual(['filter', 'filter']);

    const cleared: Release = {plannedIssues: [{id: 'A-1', source: 'filter'}]};
    expect(applyAutoAttachOnSave(ctxFor(true), prev, cleared)).toBeNull();
    expect(cleared.plannedIssues).toEqual([{id: 'A-1'}]);
  });
});
