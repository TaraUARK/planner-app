import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo } from 'react';
import { BringBar } from '../components/BringBar';
import { DayNotesPanel } from '../components/DayNotesPanel';
import { useEditor } from '../components/Editor';
import { GripIcon } from '../components/Icons';
import { NoteButton } from '../components/NoteButton';
import { saveDayPositions, setOccurrenceDone } from '../lib/data';
import { shortDate, timeLabel } from '../lib/dates';
import { holidaysBetween } from '../lib/holidays';
import { useLayout, useToday } from '../lib/hooks';
import { arrangeDay, planMove, type Orderable } from '../lib/ordering';
import { useDay, useOverdue, useProjects } from '../lib/queries';
import type { ApptOcc, TaskOcc } from '../lib/recur';
import { useSettings } from '../lib/settings';
import type { ISODate, Project } from '../lib/types';

/** The main list holds tasks and regular appointments. Holidays, special dates
 *  and low-priority events are shown as cards in the Notes panel instead. */
type DayItem = Orderable &
  ({ type: 'task'; task: TaskOcc; project?: Project; overdue: boolean } | { type: 'appt'; appt: ApptOcc });

const isSideCard = (a: ApptOcc) => a.kind === 'special_date' || a.kind === 'low_priority';

export function DayView({ date, settingsId }: { date: ISODate; settingsId: string }) {
  const today = useToday();
  const layout = useLayout();
  const day = useDay(date);
  const projects = useProjects();
  const settings = useSettings(settingsId);
  const overdue = useOverdue(today);
  const hideCompleted = settings?.hide_completed ?? false;
  const showHolidays = settings?.show_holidays ?? true;

  const { full, saved } = useMemo(() => {
    const saved = new Map((day?.positions ?? []).map((p) => [p.item_key, p.sort_key]));
    const byId = new Map((projects ?? []).map((p) => [p.id, p]));
    const overdueKeys = new Set((overdue ?? []).map((o) => o.key));
    const items: DayItem[] = [];
    for (const appt of day?.appointments ?? []) {
      if (isSideCard(appt)) continue;
      const allDayHere = appt.all_day || appt.start_date !== date;
      items.push({
        type: 'appt',
        appt,
        key: appt.key,
        group: 'appt',
        rank: [allDayHere ? 0 : 1, allDayHere ? '' : (appt.start_time ?? ''), appt.title.toLowerCase()],
      });
    }
    for (const task of day?.tasks ?? []) {
      const project = byId.get(task.project_id);
      items.push({
        type: 'task',
        task,
        project,
        overdue: overdueKeys.has(task.key),
        key: task.key,
        group: project?.category ?? 'work',
        rank: [project?.sort_key ?? '', task.created_at],
      });
    }
    return { full: arrangeDay(items, saved), saved };
  }, [day, projects, date, overdue]);

  const holidays = showHolidays ? holidaysBetween(date, date) : [];
  const sideCards = (day?.appointments ?? [])
    .filter(isSideCard)
    .sort(
      (a, b) =>
        Number(a.kind !== 'special_date') - Number(b.kind !== 'special_date') ||
        Number(!a.all_day) - Number(!b.all_day) ||
        (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
        a.title.localeCompare(b.title),
    );

  const visible = hideCompleted ? full.filter((i) => !(i.type === 'task' && i.task.done)) : full;
  const hiddenCount = full.length - visible.length;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const writes = planMove(full, String(e.active.id), String(e.over.id), saved);
    if (writes.length) void saveDayPositions(date, writes);
  };

  if (!day || !projects) return null;

  const notesPanel = <DayNotesPanel key={`notes-${date}`} date={date} holidays={holidays} cards={sideCards} />;

  return (
    <div className="page day day-layout">
      <div className="day-main">
      <BringBar key={date} date={date} hideCompleted={hideCompleted} />
      {layout === 'compact' && notesPanel}
      {visible.length === 0 ? (
        <p className="placeholder">
          {hiddenCount ? 'Everything here is done.' : 'Nothing planned for this day yet.'}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((i) => i.key)} strategy={verticalListSortingStrategy}>
            <ul className="day-list">
              {visible.map((item) => (
                <Row key={item.key} item={item} date={date} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {hiddenCount > 0 && (
        <p className="muted small center">
          {hiddenCount} completed {hiddenCount === 1 ? 'task' : 'tasks'} hidden (Settings → Hide completed tasks)
        </p>
      )}
      </div>
      {layout === 'wide' && notesPanel}
    </div>
  );
}

function Row({ item, date }: { item: DayItem; date: ISODate }) {
  const editor = useEditor();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const handle = (
    <button
      type="button"
      className="icon plain drag-handle no-callout"
      ref={setActivatorNodeRef}
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <GripIcon />
    </button>
  );

  if (item.type === 'task') {
    const { task, project } = item;
    const cls = ['item', project?.category ?? 'work', task.done && 'done', item.overdue && 'overdue']
      .filter(Boolean)
      .join(' ');
    return (
      <li ref={setNodeRef} style={style} className={`${cls} ${isDragging ? 'dragging' : ''}`}>
        <input
          type="checkbox"
          className="check"
          checked={task.done}
          aria-label={task.done ? 'Mark not done' : 'Mark done'}
          onChange={(e) => void setOccurrenceDone(task, e.target.checked)}
        />
        <button type="button" className="item-body plain" onClick={() => editor.openTask(task.id, date, task.repeating ? task.originalDate : undefined)}>
          <span className="item-title">{task.title}</span>
          <span className="item-meta">
            {item.overdue && <span className="overdue-tag">! Overdue</span>}
            {project?.name ?? 'No project'}
            {task.repeating && <span title="Repeats"> · ↻</span>}
          </span>
        </button>
        {task.notes.trim() && (
          <NoteButton
            label={task.title}
            onOpen={() =>
              editor.showNote(task.title, task.notes, () =>
                editor.openTask(task.id, date, task.repeating ? task.originalDate : undefined),
              )
            }
          />
        )}
        {handle}
      </li>
    );
  }

  const { appt } = item;
  const multiDay = appt.end_date !== appt.start_date;
  const openAppt = () => editor.openAppointment(appt.id, date, appt.repeating ? appt.originalDate : undefined);
  let when: string;
  if (appt.all_day) when = 'All day';
  else if (!multiDay) when = `${timeLabel(appt.start_time)} – ${timeLabel(appt.end_time)}`;
  else if (date === appt.start_date) when = `From ${timeLabel(appt.start_time)}`;
  else if (date === appt.end_date) when = `Until ${timeLabel(appt.end_time)}`;
  else when = 'All day';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`item appt ${isDragging ? 'dragging' : ''}`}
    >
      <button type="button" className="item-body plain" onClick={openAppt}>
        <span className="item-title">{appt.title}</span>
        <span className="item-meta">
          {when}
          {multiDay && ` · ${shortDate(appt.start_date)} – ${shortDate(appt.end_date)}`}
          {appt.location && ` · ${appt.location}`}
          {appt.repeating && ' · ↻'}
        </span>
      </button>
      {appt.notes.trim() && <NoteButton label={appt.title} onOpen={() => editor.showNote(appt.title, appt.notes, openAppt)} />}
      {handle}
    </li>
  );
}
