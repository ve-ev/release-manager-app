import type { CalendarEvent, ProjectReleases } from '../interfaces';

// Parses a YYYY-MM-DD string as local midnight (avoids UTC-to-local day shift)
function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function buildCalendarEvents(projects: ProjectReleases[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const project of projects) {
    for (const release of project.releases) {
      if (release.featureFreezeDate) {
        events.push({
          date: parseLocalDate(release.featureFreezeDate),
          type: 'freeze',
          releaseId: release.id,
          version: release.version,
          projectId: project.projectId,
          projectName: project.projectName,
          status: release.status,
          product: release.product
        });
      }
      events.push({
        date: parseLocalDate(release.releaseDate),
        type: 'release',
        releaseId: release.id,
        version: release.version,
        projectId: project.projectId,
        projectName: project.projectName,
        status: release.status,
        product: release.product
      });
    }
  }
  return events;
}

export function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter(e => isSameDay(e.date, day));
}

export function navigateMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function getQuarterMonths(year: number, quarter: number): Array<{ year: number; month: number }> {
  const startMonth = quarter * 3;
  return [0, 1, 2].map(offset => {
    const d = new Date(year, startMonth + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
}

export function getQuarterFromMonth(month: number): number {
  return Math.floor(month / 3);
}

export function getReleaseMarkerColor(event: CalendarEvent): string {
  if (event.type === 'freeze') return 'var(--ring-main-color)'; // blue
  if (event.status === 'Canceled') return 'var(--ring-error-color)';
  if (event.status === 'Released') return 'var(--ring-secondary-color)';
  // Overdue: past the release date but not yet Released or Canceled
  if (event.date < new Date()) return 'var(--ring-error-color)';
  return 'var(--ring-success-color)';
}
