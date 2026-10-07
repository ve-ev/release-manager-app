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
  isSameDay,
  MONTHS_PER_YEAR
} from '../utils/calendar-utils';
import './calendar-grid.css';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_PER_WEEK = DAY_HEADERS.length;
const HALF = 2;
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
    setPos({ x: rect.left + rect.width / HALF, y: rect.top });
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
  const prefix = event.type === 'freeze' ? 'FF' : 'R';
  const label = `${prefix}: ${event.version} · ${event.projectName} · ${event.status}`;
  const color = getReleaseMarkerColor(event);

  if (mini) {
    return (
      <Tooltip text={label}>
        <span className="rc-marker" style={{ backgroundColor: color }}/>
      </Tooltip>
    );
  }

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
        <span className="rc-legend-dot" style={{ backgroundColor: item.color }}/>
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

/** Month title; a button when clicking it jumps to that month (quarter and year views). */
const MonthTitle: React.FC<{ title: string; onClick?: () => void }> = ({ title, onClick }) => (onClick ? (
  <button
    type="button"
    className="rc-month-title rc-month-title--clickable"
    onClick={e => { e.stopPropagation(); onClick(); }}
  >
    {title}
  </button>
) : (
  <div className="rc-month-title">{title}</div>
));

interface DayCellProps {
  day: Date;
  today: Date;
  events: CalendarEvent[];
  mini?: boolean;
  showProjectName?: boolean;
  showProduct?: boolean;
}

const DayCell: React.FC<DayCellProps> = ({ day, today, events, mini, showProjectName, showProduct }) => (
  <div className={`rc-day-cell${isSameDay(day, today) ? ' rc-day-cell--today' : ''}`}>
    <div className="rc-day-number">{day.getDate()}</div>
    <div className="rc-day-markers">
      {getEventsForDay(events, day).map(ev => (
        <EventMarker key={`${ev.projectId}-${ev.releaseId}-${ev.type}`} event={ev} mini={mini} showProjectName={showProjectName} showProduct={showProduct}/>
      ))}
    </div>
  </div>
);

/** Props that make the whole mini grid a keyboard-accessible button (year view). */
function clickableGridProps(onActivate?: () => void): React.HTMLAttributes<HTMLDivElement> {
  if (!onActivate) { return {}; }
  return {
    role: 'button',
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onClick: onActivate,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    }
  };
}

const MonthGrid: React.FC<MonthGridProps> = ({ year, month, events, mini, showProjectName, showProduct, onMonthClick, onTitleClick }) => {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  // Offset: getDay() returns 0=Sun, we want 0=Mon. Blank cells are positional, so their keys are too.
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const emptyCellKeys = Array.from({ length: firstDayOfWeek }, (_, i) => `empty-${i}`);
  const activateMonth = mini && onMonthClick ? () => onMonthClick(year, month) : undefined;
  const activateTitle = onTitleClick ? () => onTitleClick(year, month) : undefined;

  return (
    <div className={`rc-month-grid${mini ? ' rc-month-mini' : ''}`} {...clickableGridProps(activateMonth)}>
      {mini && <MonthTitle title={`${MONTH_NAMES[month]} ${year}`} onClick={activateTitle}/>}
      <div className="rc-day-headers">
        {DAY_HEADERS.map(h => (
          <div key={h} className="rc-day-header">{h}</div>
        ))}
      </div>
      <div className="rc-days-grid">
        {emptyCellKeys.map(key => (
          <div key={key} className="rc-day-cell rc-day-cell--empty"/>
        ))}
        {days.map(day => (
          <DayCell key={day.getDate()} day={day} today={today} events={events} mini={mini} showProjectName={showProjectName} showProduct={showProduct}/>
        ))}
      </div>
    </div>
  );
};

const ToolbarActions: React.FC<{ onRefresh?: () => void; isRefreshing?: boolean; onConfigure?: () => void }> = ({ onRefresh, isRefreshing, onConfigure }) => (
  <>
    {onRefresh && (
      <Button onClick={onRefresh} title="Refresh data" disabled={isRefreshing}>
        <span className={isRefreshing ? 'rc-refresh-icon rc-refresh-icon--spinning' : 'rc-refresh-icon'}>↺</span>
      </Button>
    )}
    {onConfigure && (
      <Button onClick={onConfigure} title="Configure widget">
        <Icon glyph={settingsIcon}/>
      </Button>
    )}
  </>
);

interface ProjectChipsProps {
  projects: Array<{ id: string; name: string }>;
  visibleProjectIds: Set<string>;
  onToggle: (projectId: string) => void;
}

const ProjectChips: React.FC<ProjectChipsProps> = ({ projects, visibleProjectIds, onToggle }) => (
  <div className="rc-chips-bar">
    {projects.map(p => (
      <button
        type="button"
        key={p.id}
        className={`rc-project-chip${visibleProjectIds.has(p.id) ? ' rc-project-chip--active' : ''}`}
        aria-pressed={visibleProjectIds.has(p.id)}
        onClick={() => onToggle(p.id)}
        title={p.name}
      >
        <span className="rc-project-chip-dot"/>
        <span className="rc-project-chip-name">{p.name}</span>
      </button>
    ))}
  </div>
);

function getTitleText(view: CalendarGridProps['view'], year: number, month: number): string {
  if (view === 'month') { return `${MONTH_NAMES[month]} ${year}`; }
  if (view === 'quarter') { return `Q${getQuarterFromMonth(month) + 1} ${year}`; }
  return `${year}`;
}

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
  const titleText = getTitleText(view, year, month);

  const quarterMonths = useMemo(
    () => getQuarterMonths(year, quarter),
    [year, quarter]
  );

  const handleYearMonthClick = (y: number, m: number) => {
    if (onJumpToMonth) {
      onJumpToMonth(y, m);
    } else {
      onViewChange('month');
      const currentAbsolute = year * MONTHS_PER_YEAR + month;
      const targetAbsolute = y * MONTHS_PER_YEAR + m;
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
        <div className="rc-toolbar-spacer"/>
        <ToolbarActions onRefresh={onRefresh} isRefreshing={isRefreshing} onConfigure={onConfigure}/>
      </div>

      {/* Project chips — only shown when multiple projects are selected */}
      {allProjects.length > 1 && (
        <ProjectChips projects={allProjects} visibleProjectIds={visibleProjectIds} onToggle={onProjectToggle}/>
      )}

      {/* Calendar body */}
      {view === 'month' && (
        <MonthGrid year={year} month={month} events={filteredEvents} showProjectName={showProjectName} showProduct={showProduct}/>
      )}

      {view === 'quarter' && (
        <div className="rc-quarter-view">
          {quarterMonths.map(({ year: y, month: m }) => (
            <MonthGrid key={`${y}-${m}`} year={y} month={m} events={filteredEvents} mini onTitleClick={handleYearMonthClick} showProjectName={showProjectName} showProduct={showProduct}/>
          ))}
        </div>
      )}

      {view === 'year' && (
        <div className="rc-year-view">
          {MONTH_NAMES.map((name, i) => (
            <MonthGrid
              key={name}
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
      <Legend/>
    </div>
  );
};
