import type { ReactNode } from 'react';
import type { Account } from '../lib/account';
import { dayLabel, monthLabel, shiftDate, todayISO, weekLabel } from '../lib/dates';
import { useLayout, useRoute, type Route, type View } from '../lib/hooks';
import { DayView } from '../views/DayView';
import { MonthView } from '../views/MonthView';
import { NotesView } from '../views/NotesView';
import { SettingsView } from '../views/SettingsView';
import { WeekView } from '../views/WeekView';
import { ChevronLeft, ChevronRight, DayIcon, GearIcon, MonthIcon, NotesIcon, WeekIcon } from './Icons';
import { SyncBadge } from './SyncBadge';
import { UpdateBanner } from './UpdateBanner';

const TABS: { view: View; label: string; icon: () => ReactNode }[] = [
  { view: 'month', label: 'Month', icon: MonthIcon },
  { view: 'week', label: 'Week', icon: WeekIcon },
  { view: 'day', label: 'Day', icon: DayIcon },
  { view: 'notes', label: 'Notes', icon: NotesIcon },
];

function title(r: Route): string {
  switch (r.view) {
    case 'month':
      return monthLabel(r.date);
    case 'week':
      return weekLabel(r.date);
    case 'day':
      return dayLabel(r.date);
    case 'notes':
      return 'Notes';
    case 'settings':
      return 'Settings';
  }
}

export function Shell({ account }: { account: Account }) {
  const layout = useLayout();
  const [route, go] = useRoute();
  const hasPeriod = route.view === 'month' || route.view === 'week' || route.view === 'day';
  const step = (n: number) =>
    go({ view: route.view, date: shiftDate(route.date, route.view as 'month' | 'week' | 'day', n) });

  const tabs = TABS.map((t) => (
    <button
      key={t.view}
      aria-current={route.view === t.view ? 'page' : undefined}
      onClick={() => go({ view: t.view, date: route.date })}
    >
      {layout === 'compact' && <t.icon />}
      {t.label}
    </button>
  ));

  return (
    <div className={`app layout-${layout}`}>
      <header className="app-header">
        {layout === 'wide' && (
          <>
            <span className="brand">Planner</span>
            <nav className="toptabs" aria-label="Views">
              {tabs}
            </nav>
          </>
        )}
        <div className="title">{title(route)}</div>
        {hasPeriod && (
          <div className="period-nav">
            <button className="icon" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft />
            </button>
            <button className="today-btn" onClick={() => go({ view: route.view, date: todayISO() })}>
              Today
            </button>
            <button className="icon" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight />
            </button>
          </div>
        )}
        <SyncBadge onClick={() => go({ view: 'settings', date: route.date })} />{/* dot only on the phone */}
        <button
          className="icon plain"
          aria-label="Settings"
          aria-current={route.view === 'settings' ? 'page' : undefined}
          onClick={() => go({ view: 'settings', date: route.date })}
        >
          <GearIcon />
        </button>
      </header>

      <UpdateBanner />

      <main className="app-main">
        {route.view === 'month' && <MonthView date={route.date} />}
        {route.view === 'week' && <WeekView date={route.date} />}
        {route.view === 'day' && <DayView date={route.date} />}
        {route.view === 'notes' && <NotesView />}
        {route.view === 'settings' && <SettingsView account={account} />}
      </main>

      {layout === 'compact' && (
        <nav className="tabbar" aria-label="Views">
          {tabs}
        </nav>
      )}
    </div>
  );
}
