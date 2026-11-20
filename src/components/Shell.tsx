import type { ReactNode } from 'react';
import type { Account } from '../lib/account';
import { dayLabel, monthLabel, shiftDate, todayISO, weekLabel } from '../lib/dates';
import { useLayout, useRoute, useToday, type Route, type View } from '../lib/hooks';
import { DayView } from '../views/DayView';
import { MonthView } from '../views/MonthView';
import { NotesView } from '../views/NotesView';
import { ProjectsView } from '../views/ProjectsView';
import { SettingsView } from '../views/SettingsView';
import { WeekView } from '../views/WeekView';
import { EditorProvider, useEditor } from './Editor';
import { HideDoneToggle, OverdueBadge } from './HeaderExtras';
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
    case 'projects':
      return 'Projects';
  }
}

export function Shell({ account }: { account: Account }) {
  return (
    <EditorProvider>
      <Frame account={account} />
    </EditorProvider>
  );
}

function Frame({ account }: { account: Account }) {
  const layout = useLayout();
  const [route, go] = useRoute();
  const today = useToday();
  const editor = useEditor();
  const hasPeriod = route.view === 'month' || route.view === 'week' || route.view === 'day';
  const step = (n: number) =>
    go({ view: route.view, date: shiftDate(route.date, route.view as 'month' | 'week' | 'day', n) });
  // New items default to the day being looked at in the Daily view, otherwise today.
  const addDate = route.view === 'day' ? route.date : today;

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

  const periodNav = hasPeriod && (
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
  );

  const addButtons = (
    <div className="add-buttons">
      <button onClick={() => editor.addTask(addDate)}>+ Task</button>
      <button onClick={() => editor.addAppointment(addDate)}>+ Appointment</button>
    </div>
  );

  const showsTasks = route.view === 'week' || route.view === 'day';
  const extras = (
    <>
      <OverdueBadge />
      {showsTasks && <HideDoneToggle settingsId={account.settingsId} />}
    </>
  );

  const settingsButton = (
    <button
      className="icon plain"
      aria-label="Settings"
      aria-current={route.view === 'settings' ? 'page' : undefined}
      onClick={() => go({ view: 'settings', date: route.date })}
    >
      <GearIcon />
    </button>
  );

  return (
    <div className={`app layout-${layout}`}>
      {layout === 'wide' ? (
        <header className="app-header">
          <span className="brand">Planner</span>
          <nav className="toptabs" aria-label="Views">
            {tabs}
          </nav>
          <div className="title">{title(route)}</div>
          {extras}
          {periodNav}
          {addButtons}
          <SyncBadge onClick={() => go({ view: 'settings', date: route.date })} />
          {settingsButton}
        </header>
      ) : (
        <header className="app-header two-rows">
          <div className="header-row">
            <div className="title">{title(route)}</div>
            {extras}
            <SyncBadge onClick={() => go({ view: 'settings', date: route.date })} />
            {settingsButton}
          </div>
          <div className="header-row">
            {periodNav}
            <span className="grow" />
            {addButtons}
          </div>
        </header>
      )}

      <UpdateBanner />

      <main className="app-main">
        {route.view === 'month' && <MonthView date={route.date} settingsId={account.settingsId} />}
        {route.view === 'week' && <WeekView date={route.date} settingsId={account.settingsId} />}
        {route.view === 'day' && <DayView date={route.date} settingsId={account.settingsId} />}
        {route.view === 'notes' && <NotesView cat={route.noteCat} noteId={route.noteId} />}
        {route.view === 'settings' && <SettingsView account={account} />}
        {route.view === 'projects' && <ProjectsView />}
      </main>

      {layout === 'compact' && (
        <nav className="tabbar" aria-label="Views">
          {tabs}
        </nav>
      )}
    </div>
  );
}
