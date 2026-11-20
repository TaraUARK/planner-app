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
import { useEditor } from '../components/Editor';
import { GripIcon } from '../components/Icons';
import { apptKey, saveDayPositions, setTaskDone, taskKey } from '../lib/data';
import { shortDate, timeLabel } from '../lib/dates';
import { holidayKey, holidaysBetween, type Holiday } from '../lib/holidays';
import { useToday } from '../lib/hooks';
import { arrangeDay, planMove, type Orderable } from '../lib/ordering';
import { useDay, useProjects } from '../lib/queries';
import { useSettings } from '../lib/settings';
import type { Appointment, ISODate, Project, Task } from '../lib/types';

type DayItem = Orderable &
  (
    | { type: 'task'; task: Task; project?: Project; overdue: boolean }
    | { type: 'appt'; appt: Appointment }
    | { type: 'holiday'; holiday: Holiday }
  );

export function DayView({ date, settingsId }: { date: ISODate; settingsId: string }) {
  const today = useToday();
  const day = useDay(date);
  const projects = useProjects();
  const settings = useSettings(settingsId);
  const hideCompleted = settings?.hide_completed ?? false;
  const showHolidays = settings?.show_holidays ?? true;

  const { full, saved } = useMemo(() => {
    const saved = new Map((day?.positions ?? []).map((p) => [p.item_key, p.sort_key]));
    const byId = new Map((projects ?? []).map((p) => [p.id, p]));
    const items: DayItem[] = [];
    if (showHolidays) {
      for (const holiday of holidaysBetween(date, date)) {
        items.push({ type: 'holiday', holiday, key: holidayKey(holiday), group: 'appt', rank: [0, '', holiday.name.toLowerCase()] });
      }
    }
    for (const appt of day?.appointments ?? []) {
      const allDayHere = appt.kind === 'special_date' || appt.all_day || appt.start_date !== date;
      items.push({
        type: 'appt',
        appt,
        key: apptKey(appt),
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
        overdue: !task.done && task.date < today,
        key: taskKey(task),
        group: project?.category ?? 'work',
        rank: [project?.sort_key ?? '', task.created_at],
      });
    }
    return { full: arrangeDay(items, saved), saved };
  }, [day, projects, date, today, showHolidays]);

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

  return (
    <div className="page day">
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
          onChange={(e) => void setTaskDone(task.id, e.target.checked)}
        />
        <button type="button" className="item-body plain" onClick={() => editor.openTask(task.id, date)}>
          <span className="item-title">{task.title}</span>
          <span className="item-meta">
            {item.overdue && <span className="overdue-tag">! Overdue</span>}
            {project?.name ?? 'No project'}
          </span>
        </button>
        {handle}
      </li>
    );
  }

  if (item.type === 'holiday') {
    const h = item.holiday;
    return (
      <li ref={setNodeRef} style={style} className={`item holiday ${h.observed ? 'observed' : ''} ${isDragging ? 'dragging' : ''}`}>
        <div className="item-body">
          <span className="item-title">{h.name}</span>
          <span className="item-meta">Holiday</span>
        </div>
        {handle}
      </li>
    );
  }

  const { appt } = item;
  const special = appt.kind === 'special_date';
  const multiDay = appt.end_date !== appt.start_date;
  let when: string;
  if (special) when = 'Special date';
  else if (appt.all_day) when = 'All day';
  else if (!multiDay) when = `${timeLabel(appt.start_time)} – ${timeLabel(appt.end_time)}`;
  else if (date === appt.start_date) when = `From ${timeLabel(appt.start_time)}`;
  else if (date === appt.end_date) when = `Until ${timeLabel(appt.end_time)}`;
  else when = 'All day';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`item ${special ? 'holiday' : 'appt'} ${isDragging ? 'dragging' : ''}`}
    >
      <button type="button" className="item-body plain" onClick={() => editor.openAppointment(appt.id, date)}>
        <span className="item-title">{appt.title}</span>
        <span className="item-meta">
          {when}
          {multiDay && ` · ${shortDate(appt.start_date)} – ${shortDate(appt.end_date)}`}
          {appt.location && ` · ${appt.location}`}
        </span>
      </button>
      {handle}
    </li>
  );
}
