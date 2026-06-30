import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import settingsIcon from '@jetbrains/icons/settings';
import Icon from '@jetbrains/ring-ui-built/components/icon/icon';
import type { CalendarEvent } from '../interfaces';
import {
  getMonthDays,
  getEventsForDay,
  getQuarterMonths,
  getQuarterFromMonth,
  getReleaseMarkerColor,
  isSameDay
} from '../utils/calendar-utils';
import './calendar-grid.css';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface CalendarGridProps {
  events: CalendarEvent[];
  view: 'month' | 'quarter' | 'year';
  year: number;
  month: number;
  visibleProjectIds: Set<string>;
  allProjects: Array<{ id: string; name: string }>;
  showFreezeDates: boolean;
  showProjectName: boolean;
  showProduct?: boolean;
  onNavigate: (delta: number) => void;
  onViewChange: (view: 'month' | 'quarter' | 'year') => void;
  onToday: () => void;
  onProjectToggle: (projectId: string) => void;
  onConfigure?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onJumpToMonth?: (year: number, month: number) => void;
}

interface TooltipProps {
  text: string;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleMouseLeave = () => setPos(null);

  const child = React.cloneElement(children, {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  });

  return (
    <>
      {child}
      {pos && createPortal(
        <div
          className="rc-tooltip-portal"
          style={{ left: pos.x, top: pos.y }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
};

interface EventMarkerProps {
  event: CalendarEvent;
  mini?: boolean;
  showProjectName?: boolean;
  showProduct?: boolean;
}

const EventMarker: React.FC<EventMarkerProps> = ({ event, mini, showProjectName, showProduct }) => {
  const label = `${event.type === 'freeze' ? 'FF' : 'R'}: ${event.version} · ${event.projectName} · ${event.status}`;
  const color = getReleaseMarkerColor(event);

  if (mini) {
    return (
      <Tooltip text={label}>
        <span className="rc-marker" style={{ backgroundColor: color }} />
      </Tooltip>
    );
  }

  const prefix = event.type === 'freeze' ? 'FF' : 'R';
  return (
    <Tooltip text={label}>
      <span
        className={`rc-event-tag rc-event-tag--${event.type}`}
        style={{ borderLeftColor: color }}
      >
        <span className="rc-event-tag-prefix" style={{ color }}>{prefix}</span>
        <span className="rc-event-tag-version">{event.version}</span>
        {event.status === 'Released' && (
          <span className="rc-event-tag-check" aria-label="Released">✓</span>
        )}
        {showProjectName && (
          <span className="rc-event-tag-project">· {event.projectName}</span>
        )}
        {showProduct && event.product && (
          <span className="rc-event-tag-product">· {event.product}</span>
        )}
      </span>
    </Tooltip>
  );
};

const LEGEND_ITEMS = [
  { color: 'var(--ring-main-color)', label: 'Feature Freeze' },
  { color: 'var(--ring-success-color)', label: 'Future release' },
  { color: 'var(--ring-error-color)', label: 'Overdue / Canceled' },
  { color: 'var(--ring-secondary-color)', label: 'Released ✓' },
] as const;

const Legend: React.FC = () => (
  <div className="rc-legend">
    {LEGEND_ITEMS.map(item => (
      <span key={item.label} className="rc-legend-item">
        <span className="rc-legend-dot" style={{ backgroundColor: item.color }} />
        <span className="rc-legend-label">{item.label}</span>
      </span>
    ))}
  </div>
);

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  mini?: boolean;
  onMonthClick?: (year: number, month: number) => void;  // whole grid clickable (year view)
  onTitleClick?: (year: number, month: number) => void;  // title only clickable (quarter view)
  showProjectName?: boolean;
  showProduct?: boolean;
}

const MonthGrid: React.FC<MonthGridProps> = ({ year, month, events, mini, showProjectName, showProduct, onMonthClick, onTitleClick }) => {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  // Offset: getDay() returns 0=Sun, we want 0=Mon
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const emptyCells = Array.from({ length: firstDayOfWeek });

  const title = `${MONTH_NAMES[month]} ${year}`;

  return (
    <div
      className={`rc-month-grid${mini ? ' rc-month-mini' : ''}`}
      style={{ cursor: mini && onMonthClick ? 'pointer' : undefined }}
      onClick={mini && onMonthClick ? () => onMonthClick(year, month) : undefined}
    >
      {mini && (
        <div
          className={`rc-month-title${onTitleClick ? ' rc-month-title--clickable' : ''}`}
          onClick={onTitleClick ? (e) => { e.stopPropagation(); onTitleClick(year, month); } : undefined}
        >
          {title}
        </div>
      )}
      <div className="rc-day-headers">
        {DAY_HEADERS.map(h => (
          <div key={h} className="rc-day-header">{h}</div>
        ))}
      </div>
      <div className="rc-days-grid">
        {emptyCells.map((_, i) => (
          <div key={`e-${i}`} className="rc-day-cell rc-day-cell--empty" />
        ))}
        {days.map(day => {
          const dayEvents = getEventsForDay(events, day);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.getDate()}
              className={`rc-day-cell${isToday ? ' rc-day-cell--today' : ''}`}
            >
              <div className="rc-day-number">{day.getDate()}</div>
              <div className="rc-day-markers">
                {dayEvents.map((ev, i) => (
                  <EventMarker key={`${ev.releaseId}-${ev.type}-${i}`} event={ev} mini={mini} showProjectName={showProjectName} showProduct={showProduct} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  events,
  view,
  year,
  month,
  visibleProjectIds,
  allProjects,
  showFreezeDates,
  showProjectName,
  showProduct,
  onNavigate,
  onViewChange,
  onToday,
  onProjectToggle,
  onConfigure,
  onRefresh,
  isRefreshing,
  onJumpToMonth
}) => {
  const filteredEvents = useMemo(
    () => events.filter(e => visibleProjectIds.has(e.projectId) && (showFreezeDates || e.type !== 'freeze')),
    [events, visibleProjectIds, showFreezeDates]
  );

  const quarter = getQuarterFromMonth(month);

  const titleText = view === 'month'
    ? `${MONTH_NAMES[month]} ${year}`
    : view === 'quarter'
    ? `Q${quarter + 1} ${year}`
    : `${year}`;

  const quarterMonths = useMemo(
    () => getQuarterMonths(year, quarter),
    [year, quarter]
  );

  const handleYearMonthClick = (y: number, m: number) => {
    if (onJumpToMonth) {
      onJumpToMonth(y, m);
    } else {
      onViewChange('month');
      const currentAbsolute = year * 12 + month;
      const targetAbsolute = y * 12 + m;
      onNavigate(targetAbsolute - currentAbsolute);
    }
  };

  return (
    <div className="rc-grid-container">
      {/* Main toolbar — navigation + view controls only */}
      <div className="rc-toolbar">
        <Button onClick={() => onNavigate(-1)}>←</Button>
        <span className="rc-toolbar-title">{titleText}</span>
        <Button onClick={() => onNavigate(1)}>→</Button>
        <Button onClick={onToday}>Today</Button>
        <Button onClick={() => onViewChange('month')} active={view === 'month'}>Month</Button>
        <Button onClick={() => onViewChange('quarter')} active={view === 'quarter'}>Quarter</Button>
        <Button onClick={() => onViewChange('year')} active={view === 'year'}>Year</Button>
        <div className="rc-toolbar-spacer" />
        {onRefresh && (
          <Button onClick={onRefresh} title="Refresh data" disabled={isRefreshing}>
            <span className={isRefreshing ? 'rc-refresh-icon rc-refresh-icon--spinning' : 'rc-refresh-icon'}>↺</span>
          </Button>
        )}
        {onConfigure && (
          <Button onClick={onConfigure} title="Configure widget">
            <Icon glyph={settingsIcon} />
          </Button>
        )}
      </div>

      {/* Project chips — only shown when multiple projects are selected */}
      {allProjects.length > 1 && (
        <div className="rc-chips-bar">
          {allProjects.map(p => (
            <span
              key={p.id}
              className={`rc-project-chip${visibleProjectIds.has(p.id) ? ' rc-project-chip--active' : ''}`}
              onClick={() => onProjectToggle(p.id)}
              title={p.name}
            >
              <span className="rc-project-chip-dot" />
              <span className="rc-project-chip-name">{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Calendar body */}
      {view === 'month' && (
        <MonthGrid year={year} month={month} events={filteredEvents} showProjectName={showProjectName} showProduct={showProduct} />
      )}

      {view === 'quarter' && (
        <div className="rc-quarter-view">
          {quarterMonths.map(({ year: y, month: m }) => (
            <MonthGrid key={`${y}-${m}`} year={y} month={m} events={filteredEvents} mini onTitleClick={handleYearMonthClick} showProjectName={showProjectName} showProduct={showProduct} />
          ))}
        </div>
      )}

      {view === 'year' && (
        <div className="rc-year-view">
          {Array.from({ length: 12 }, (_, i) => (
            <MonthGrid
              key={i}
              year={year}
              month={i}
              events={filteredEvents}
              mini
              onMonthClick={handleYearMonthClick}
              onTitleClick={handleYearMonthClick}
              showProjectName={showProjectName}
              showProduct={showProduct}
            />
          ))}
        </div>
      )}

      {/* Legend — bottom of calendar */}
      <Legend />
    </div>
  );
};
