import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useEditor } from '../components/Editor';
import { moveProjectToKey, saveCellPositions, taskKey, updateTask } from '../lib/data';
import { fromISODate, timeLabel } from '../lib/dates';
import { holidayAsItem, holidaysBetween, isHolidayItem } from '../lib/holidays';
import { useLayout, useToday } from '../lib/hooks';
import { planMove } from '../lib/ordering';
import { useProjects, useWeek } from '../lib/queries';
import { useSettings } from '../lib/settings';
import type { Category, ISODate, Project, Task } from '../lib/types';
import { buildRows, layoutBand, weekDays, type BandItem } from '../lib/week';

// Data attached to draggable / droppable things.
type TaskData = { type: 'task'; taskId: string; projectId: string; date: ISODate };
type CellData = { type: 'cell'; projectId: string; date: ISODate };
type ProjectData = { type: 'project'; projectId: string; category: Category };
type DndData = TaskData | CellData | ProjectData;

const dataOf = (x: { data: { current?: unknown } } | null | undefined) => x?.data.current as DndData | undefined;

/**
 * Pick the drop target under the finger/pointer:
 * dragging a task → another task (to reorder) or a day cell;
 * dragging a project title → another project title.
 */
const collision: CollisionDetection = (args) => {
  const activeType = dataOf(args.active)?.type;
  const candidates = args.droppableContainers.filter((c) => {
    const t = dataOf(c)?.type;
    return activeType === 'task' ? t === 'task' || t === 'cell' : t === 'project';
  });
  const hits = pointerWithin({ ...args, droppableContainers: candidates });
  if (activeType === 'task') {
    const typeOf = (id: string | number) => dataOf(candidates.find((c) => c.id === id))?.type;
    const overTask = hits.find((h) => typeOf(h.id) === 'task' && h.id !== args.active.id);
    if (overTask) return [overTask];
    const overCell = hits.find((h) => typeOf(h.id) === 'cell');
    return overCell ? [overCell] : [];
  }
  return hits.length ? hits : closestCenter({ ...args, droppableContainers: candidates });
};

/** Moving a project title shouldn't slide other titles out of line with their rows. */
const noShift = () => null;

export function WeekView({ date, settingsId }: { date: ISODate; settingsId: string }) {
  const today = useToday();
  const layout = useLayout();
  const editor = useEditor();
  const days = useMemo(() => weekDays(date), [date]);
  const week = useWeek(days[0], days[6]);
  const projects = useProjects();
  const settings = useSettings(settingsId);
  const hideCompleted = settings?.hide_completed ?? false;
  const showHolidays = settings?.show_holidays ?? true;

  const [active, setActive] = useState<DndData | null>(null);
  const [over, setOver] = useState<{ projectId: string; date: ISODate } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastDragEnd = useRef(0);
  const grid = useRef<HTMLDivElement>(null);

  const saved = useMemo(
    () => new Map((week?.cellPositions ?? []).map((p) => [p.item_key, p.sort_key])),
    [week],
  );
  const rows = useMemo(
    () => buildRows(projects ?? [], week?.tasks ?? [], days, saved, hideCompleted, taskKey),
    [projects, week, days, saved, hideCompleted],
  );
  const lanes = useMemo(() => {
    const holidays = showHolidays ? holidaysBetween(days[0], days[6]).map(holidayAsItem) : [];
    return layoutBand([...(week?.appointments ?? []), ...holidays], days);
  }, [week, days, showHolidays]);
  const loaded = !!week && !!projects;

  // On a narrow screen, open the week scrolled so today's column is visible.
  useEffect(() => {
    const el = grid.current;
    const scroller = el?.closest('.app-main');
    if (!el || !scroller) return;
    const col = days.indexOf(today);
    const head = el.querySelector<HTMLElement>(`[data-col="${col}"]`);
    const corner = el.querySelector<HTMLElement>('.wk-corner');
    scroller.scrollLeft = col <= 0 || !head || !corner ? 0 : Math.max(0, head.offsetLeft - corner.offsetWidth - 8);
    // Only when the week, the layout, or the first load changes — not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], layout, loaded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const sensors = useSensors(
    // Mouse: drag starts after moving a few pixels (a click still opens the task).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold ~0.3 s; moving the finger sooner just scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  if (!loaded) return null;

  const allTasks = new Map((week.tasks ?? []).map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const targetOf = (d: DndData | undefined) =>
    d && (d.type === 'task' || d.type === 'cell') ? { projectId: d.projectId, date: d.date } : null;

  const onDragStart = (e: DragStartEvent) => setActive(dataOf(e.active) ?? null);
  const onDragOver = (e: DragOverEvent) => setOver(targetOf(dataOf(e.over)));
  const onDragEnd = (e: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setActive(null);
    setOver(null);
    const a = dataOf(e.active);
    const o = dataOf(e.over);
    if (!a || !o) return;

    if (a.type === 'task') {
      const target = targetOf(o);
      if (!target) return;
      if (target.projectId !== a.projectId) {
        setToast("Tasks stay in their own project's row. To change a task's project, tap the task.");
        return;
      }
      if (target.date !== a.date) {
        void updateTask(a.taskId, { date: target.date }); // lands at the bottom of the new day's cell
        return;
      }
      if (o.type === 'task' && o.taskId !== a.taskId) {
        // Reorder inside the cell. Include hidden completed tasks so their spots are kept.
        const full = buildRows(
          [projectById.get(a.projectId)!],
          week.tasks.filter((t) => t.project_id === a.projectId && t.date === a.date),
          [a.date],
          saved,
          false,
          taskKey,
        )[0].cells[0].map((t) => ({ key: taskKey(t) }));
        const writes = planMove(
          full,
          taskKey(allTasks.get(a.taskId)!),
          taskKey(allTasks.get(o.taskId)!),
          saved,
        );
        if (writes.length) void saveCellPositions(a.date, writes);
      }
      return;
    }

    if (a.type === 'project' && o.type === 'project' && a.projectId !== o.projectId) {
      if (a.category !== o.category) {
        setToast('Work and home projects stay in their own groups. To switch one, tap its name.');
        return;
      }
      const group = projects.filter((p) => p.category === a.category);
      const keys = new Map(group.map((p) => [p.id, p.sort_key]));
      const writes = planMove(
        group.map((p) => ({ key: p.id })),
        a.projectId,
        o.projectId,
        keys,
      );
      for (const w of writes) void moveProjectToKey(w.key, w.sort_key);
    }
  };

  const bandRows = lanes.length;
  const firstTaskRow = 2 + bandRows;
  const activeTask = active?.type === 'task' ? allTasks.get(active.taskId) : undefined;
  const activeProject = active?.type === 'project' ? projectById.get(active.projectId) : undefined;
  const recentlyDragged = () => Date.now() - lastDragEnd.current < 400;

  return (
    <div className="wk-wrap">
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          setOver(null);
        }}
      >
        <div className="wk" ref={grid}>
          {/* Header row */}
          <div className="wk-corner" style={{ gridRow: 1, gridColumn: 1 }} />
          {days.map((d, i) => (
            <div
              key={d}
              data-col={i}
              className={`wk-head ${d === today ? 'today' : ''}`}
              style={{ gridRow: 1, gridColumn: i + 2 }}
            >
              <span className="wk-dow">{format(fromISODate(d), 'EEE')}</span>
              <span className="wk-dom">{format(fromISODate(d), 'd')}</span>
            </div>
          ))}

          {/* Top band: appointments, holidays, special dates */}
          {bandRows > 0 && (
            <>
              <div className="wk-proj wk-band-label" style={{ gridRow: `2 / span ${bandRows}`, gridColumn: 1 }}>
                {layout === 'wide' ? 'Appointments' : 'Appts'}
              </div>
              {days.map((d, i) => (
                <div
                  key={d}
                  className={`wk-bandcell ${d === today ? 'today' : ''}`}
                  style={{ gridRow: `2 / span ${bandRows}`, gridColumn: i + 2 }}
                />
              ))}
              {lanes.map((lane, li) =>
                lane.map((item) => (
                  <BandChip
                    key={item.appt.id}
                    item={item}
                    style={{ gridRow: 2 + li, gridColumn: `${item.startCol + 2} / ${item.endCol + 3}` }}
                    onOpen={() => editor.openAppointment(item.appt.id, days[item.startCol])}
                  />
                )),
              )}
            </>
          )}

          {/* Task rows: work projects first, then home */}
          {(['work', 'home'] as const).map((cat) => {
            const group = rows.filter((r) => r.project.category === cat);
            return (
              <SortableContext key={cat} id={`projects-${cat}`} items={group.map((r) => `proj:${r.project.id}`)} strategy={noShift}>
                {group.map((row) => {
                  const r = firstTaskRow + rows.indexOf(row);
                  return [
                    <ProjectTitle
                      key={row.project.id}
                      project={row.project}
                      style={{ gridRow: r, gridColumn: 1 }}
                      dropHint={active?.type === 'project' && active.category === cat}
                      onOpen={() => !recentlyDragged() && editor.openProject(row.project.id)}
                    />,
                    ...days.map((d, i) => (
                      <Cell
                        key={`${row.project.id}:${d}`}
                        project={row.project}
                        date={d}
                        tasks={row.cells[i]}
                        today={today}
                        style={{ gridRow: r, gridColumn: i + 2 }}
                        state={
                          active?.type === 'task' && over?.projectId === row.project.id && over.date === d
                            ? over.projectId === active.projectId
                              ? 'ok'
                              : 'no'
                            : ''
                        }
                        onAdd={() => !recentlyDragged() && editor.addTask(d, row.project.id)}
                        onOpenTask={(t) => !recentlyDragged() && editor.openTask(t.id, t.date)}
                      />
                    )),
                  ];
                })}
              </SortableContext>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className={`wk-task overlay ${projectById.get(activeTask.project_id)?.category ?? 'work'}`}>
              {activeTask.title}
            </div>
          )}
          {activeProject && <div className="wk-proj overlay">{activeProject.name}</div>}
        </DragOverlay>
      </DndContext>

      {rows.length === 0 && (
        <p className="placeholder">
          {bandRows ? 'No tasks this week.' : 'Nothing planned this week yet.'} Use <b>+ Task</b> to add one.
        </p>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function BandChip({ item, style, onOpen }: { item: BandItem; style: CSSProperties; onOpen: () => void }) {
  const a = item.appt;
  if (isHolidayItem(a)) {
    return (
      <div className={`wk-band holiday ${a.holiday.observed ? 'observed' : ''}`} style={style} title={a.title}>
        {a.title}
      </div>
    );
  }
  const special = a.kind === 'special_date';
  const time = !special && !a.all_day && a.start_date === a.end_date ? timeLabel(a.start_time).replace(':00', '') : '';
  return (
    <button
      type="button"
      className={`wk-band ${special ? 'holiday' : 'appt'} ${item.before ? 'cont-before' : ''} ${item.after ? 'cont-after' : ''}`}
      style={style}
      onClick={onOpen}
      title={a.title}
    >
      {item.before && <span aria-label="continues from last week">‹ </span>}
      {time && <span className="wk-time">{time} </span>}
      {a.title}
      {item.after && <span aria-label="continues next week"> ›</span>}
    </button>
  );
}

function ProjectTitle(props: { project: Project; style: CSSProperties; dropHint: boolean; onOpen: () => void }) {
  const { project } = props;
  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({
    id: `proj:${project.id}`,
    data: { type: 'project', projectId: project.id, category: project.category } satisfies ProjectData,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`wk-proj ${project.category} no-callout ${isDragging ? 'ghost' : ''} ${props.dropHint && isOver ? 'drop-target' : ''}`}
      style={props.style}
      onClick={props.onOpen}
      {...attributes}
      {...listeners}
    >
      {project.name}
    </button>
  );
}

function Cell(props: {
  project: Project;
  date: ISODate;
  tasks: Task[];
  today: ISODate;
  style: CSSProperties;
  state: '' | 'ok' | 'no';
  onAdd: () => void;
  onOpenTask: (t: Task) => void;
}) {
  const { project, date, tasks, today } = props;
  const { setNodeRef } = useDroppable({
    id: `cell:${project.id}:${date}`,
    data: { type: 'cell', projectId: project.id, date } satisfies CellData,
  });
  return (
    <div
      ref={setNodeRef}
      className={`wk-cell ${date === today ? 'today' : ''} ${props.state ? `drop-${props.state}` : ''}`}
      style={props.style}
    >
      <SortableContext id={`cell:${project.id}:${date}`} items={tasks.map((t) => `task:${t.id}`)} strategy={verticalListSortingStrategy}>
        {tasks.map((t) => (
          <TaskChip key={t.id} task={t} project={project} overdue={!t.done && t.date < today} onOpen={() => props.onOpenTask(t)} />
        ))}
      </SortableContext>
      <button
        type="button"
        className="wk-add"
        aria-label={`Add a ${project.name} task on ${format(fromISODate(date), 'EEEE MMM d')}`}
        onClick={props.onAdd}
      />
    </div>
  );
}

function TaskChip(props: { task: Task; project: Project; overdue: boolean; onOpen: () => void }) {
  const { task, project } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task:${task.id}`,
    data: { type: 'task', taskId: task.id, projectId: project.id, date: task.date } satisfies TaskData,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={[
        'wk-task no-callout',
        project.category,
        task.done && 'done',
        props.overdue && 'overdue',
        isDragging && 'ghost',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={props.onOpen}
      {...attributes}
      {...listeners}
    >
      {props.overdue && <b className="overdue-tag">! </b>}
      {task.title}
    </button>
  );
}
