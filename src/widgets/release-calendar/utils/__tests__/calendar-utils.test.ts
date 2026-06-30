import { describe, it, expect } from 'vitest';
import {
  buildCalendarEvents,
  getMonthDays,
  isSameDay,
  getEventsForDay,
  navigateMonth,
  getQuarterMonths,
  getQuarterFromMonth,
  getReleaseMarkerColor
} from '../calendar-utils';
import type { ProjectReleases } from '../../interfaces';

const mockProject: ProjectReleases = {
  projectId: 'P1',
  projectName: 'Project One',
  releases: [
    {
      id: 'r1',
      version: '1.0',
      featureFreezeDate: '2026-06-15',
      releaseDate: '2026-06-30',
      status: 'Planning'
    },
    {
      id: 'r2',
      version: '1.1',
      featureFreezeDate: null,
      releaseDate: '2026-07-15',
      status: 'Released'
    }
  ]
};

describe('buildCalendarEvents', () => {
  it('creates freeze + release events for a release with both dates', () => {
    const events = buildCalendarEvents([mockProject]);
    const r1 = events.filter(e => e.releaseId === 'r1');
    expect(r1).toHaveLength(2);
    expect(r1.find(e => e.type === 'freeze')?.date).toEqual(new Date(2026, 5, 15));
    expect(r1.find(e => e.type === 'release')?.date).toEqual(new Date(2026, 5, 30));
  });

  it('creates only a release event when featureFreezeDate is null', () => {
    const events = buildCalendarEvents([mockProject]);
    const r2 = events.filter(e => e.releaseId === 'r2');
    expect(r2).toHaveLength(1);
    expect(r2[0].type).toBe('release');
  });

  it('returns empty array for empty input', () => {
    expect(buildCalendarEvents([])).toEqual([]);
  });

  it('attaches projectId and projectName to every event', () => {
    const events = buildCalendarEvents([mockProject]);
    expect(events.every(e => e.projectId === 'P1')).toBe(true);
    expect(events.every(e => e.projectName === 'Project One')).toBe(true);
  });
});

describe('getMonthDays', () => {
  it('returns 30 days for June 2026 (month index 5)', () => {
    expect(getMonthDays(2026, 5)).toHaveLength(30);
  });

  it('returns 31 days for January (month index 0)', () => {
    expect(getMonthDays(2026, 0)).toHaveLength(31);
  });

  it('returns 28 days for February in a non-leap year', () => {
    expect(getMonthDays(2026, 1)).toHaveLength(28);
  });

  it('returns 29 days for February in a leap year', () => {
    expect(getMonthDays(2024, 1)).toHaveLength(29);
  });

  it('first element is the 1st of the month', () => {
    const days = getMonthDays(2026, 5);
    expect(days[0].getDate()).toBe(1);
    expect(days[0].getMonth()).toBe(5);
  });
});

describe('isSameDay', () => {
  it('returns true for identical dates', () => {
    expect(isSameDay(new Date('2026-06-15'), new Date('2026-06-15'))).toBe(true);
  });

  it('returns false for different dates', () => {
    expect(isSameDay(new Date('2026-06-15'), new Date('2026-06-16'))).toBe(false);
  });

  it('ignores the time component', () => {
    expect(isSameDay(new Date('2026-06-15T08:00:00'), new Date('2026-06-15T22:59:59'))).toBe(true);
  });
});

describe('getEventsForDay', () => {
  it('returns events matching the given day', () => {
    const events = buildCalendarEvents([mockProject]);
    const june15 = getEventsForDay(events, new Date(2026, 5, 15));
    expect(june15).toHaveLength(1);
    expect(june15[0].type).toBe('freeze');
  });

  it('returns empty array when no events match', () => {
    const events = buildCalendarEvents([mockProject]);
    expect(getEventsForDay(events, new Date('2026-01-01'))).toHaveLength(0);
  });
});

describe('navigateMonth', () => {
  it('advances to the next month', () => {
    expect(navigateMonth(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
  });

  it('wraps from December to January of next year', () => {
    expect(navigateMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('goes back to December of previous year', () => {
    expect(navigateMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('getQuarterMonths', () => {
  it('returns months 0-2 for Q1', () => {
    expect(getQuarterMonths(2026, 0)).toEqual([
      { year: 2026, month: 0 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 }
    ]);
  });

  it('returns months 9-11 for Q4', () => {
    expect(getQuarterMonths(2026, 3).map(m => m.month)).toEqual([9, 10, 11]);
  });
});

describe('getQuarterFromMonth', () => {
  it('returns 0 for January (month 0)', () => {
    expect(getQuarterFromMonth(0)).toBe(0);
  });

  it('returns 1 for April (month 3)', () => {
    expect(getQuarterFromMonth(3)).toBe(1);
  });

  it('returns 3 for December (month 11)', () => {
    expect(getQuarterFromMonth(11)).toBe(3);
  });
});

describe('getReleaseMarkerColor', () => {
  const base = { releaseId: 'r1', version: '1.0', projectId: 'P1', projectName: 'P' };
  const pastDate = new Date('2020-01-01');
  const futureDate = new Date('2099-01-01');

  it('returns main color for freeze marker regardless of status', () => {
    const e = { ...base, type: 'freeze' as const, status: 'Released', date: futureDate };
    expect(getReleaseMarkerColor(e)).toBe('var(--ring-main-color)');
  });

  it('returns error color for Canceled release', () => {
    const e = { ...base, type: 'release' as const, status: 'Canceled', date: futureDate };
    expect(getReleaseMarkerColor(e)).toBe('var(--ring-error-color)');
  });

  it('returns secondary color for Released status', () => {
    const e = { ...base, type: 'release' as const, status: 'Released', date: pastDate };
    expect(getReleaseMarkerColor(e)).toBe('var(--ring-secondary-color)');
  });

  it('returns error color for past-due Planning release (overdue computed from date)', () => {
    const e = { ...base, type: 'release' as const, status: 'Planning', date: pastDate };
    expect(getReleaseMarkerColor(e)).toBe('var(--ring-error-color)');
  });

  it('returns error color for past-due In progress release', () => {
    const e = { ...base, type: 'release' as const, status: 'In progress', date: pastDate };
    expect(getReleaseMarkerColor(e)).toBe('var(--ring-error-color)');
  });

  it('returns success color for future Planning release', () => {
    const e = { ...base, type: 'release' as const, status: 'Planning', date: futureDate };
    expect(getReleaseMarkerColor(e)).toBe('var(--ring-success-color)');
  });
});
