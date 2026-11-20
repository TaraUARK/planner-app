import { useEffect, useState } from 'react';
import {
  createProject,
  createTask,
  deleteTask,
  editTaskFromHere,
  editTaskOccurrence,
  endSeriesBefore,
  setOccurrenceDone,
  skipOccurrence,
  updateTask,
} from '../lib/data';
import { db } from '../lib/db';
import { isISODate } from '../lib/dates';
import { useTask } from '../lib/queries';
import {
  defaultSpec,
  exceptionId,
  oneTimeTask,
  rruleToSpec,
  specToRRule,
  taskOccKey,
  type RepeatSpec,
  type TaskOcc,
} from '../lib/recur';
import type { ISODate, Task } from '../lib/types';
import { Modal } from './Modal';
import { ProjectPicker, type PickedProject } from './ProjectPicker';
import { RepeatEditor, ScopeChooser } from './RepeatEditor';

/** The occurrence being edited: the task itself, or one day of a repeating task. */
async function loadOccurrence(series: Task, originalDate: ISODate | undefined): Promise<TaskOcc> {
  if (!series.rrule || !originalDate) return oneTimeTask(series);
  const e = await db.occurrence_exceptions.get(exceptionId('task', series.id, originalDate));
  const ex = e && !e.deleted_at ? e : undefined;
  return {
    ...series,
    ...(ex?.overrides as Partial<Task> | undefined),
    date: ex?.new_date ?? originalDate,
    done: ex?.done ?? false,
    originalDate,
    repeating: true,
    key: taskOccKey(series.id, originalDate),
  };
}

/**
 * Add a task (taskId = null) or open one (the detail window). For a repeating
 * task, `originalDate` says which occurrence was tapped.
 */
export function TaskForm(props: {
  taskId: string | null;
  date: ISODate;
  originalDate?: ISODate;
  projectId?: string;
  onClose: () => void;
}) {
  const { taskId, onClose } = props;
  const series = useTask(taskId);
  const [occ, setOcc] = useState<TaskOcc | null>(null);
  const [title, setTitle] = useState('');
  const [project, setProject] = useState<PickedProject | null>(null);
  const [date, setDate] = useState(props.date);
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const [spec, setSpec] = useState<RepeatSpec>(defaultSpec(props.date));
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [asking, setAsking] = useState<null | 'save' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(taskId === null);

  // Quick add from a Weekly-view cell: start with that cell's project.
  useEffect(() => {
    if (taskId || !props.projectId) return;
    void db.projects.get(props.projectId).then((p) => p && setProject({ kind: 'existing', project: p }));
  }, [taskId, props.projectId]);

  // Fill the form once when opening an existing task.
  useEffect(() => {
    if (loaded || !series) return;
    void (async () => {
      const o = await loadOccurrence(series, props.originalDate);
      const p = await db.projects.get(o.project_id);
      setOcc(o);
      setTitle(o.title);
      setDate(o.date);
      setNotes(o.notes);
      setDone(o.done);
      setSpec(rruleToSpec(series.rrule, series.date));
      if (p) setProject({ kind: 'existing', project: p });
      setLoaded(true);
    })();
  }, [series, loaded, props.originalDate]);

  if (taskId && series === null) {
    return (
      <Modal title="Task" onClose={onClose}>
        <p className="muted">This task no longer exists.</p>
      </Modal>
    );
  }

  const repeating = !!series?.rrule && !!occ?.repeating;

  const validate = (): string | null => {
    if (!title.trim()) return 'Enter a task title.';
    if (!project) return 'Choose a project.';
    if (!isISODate(date)) return 'Choose a date.';
    return null;
  };

  const projectIdNow = async () =>
    project!.kind === 'existing' ? project!.project.id : (await createProject(project!.name, project!.category)).id;

  const save = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    if (!taskId || !series || !occ) {
      await createTask({ title, project_id: await projectIdNow(), date, notes, rrule: specToRRule(spec, date) });
      return onClose();
    }
    if (!repeating) {
      await updateTask(taskId, {
        title,
        project_id: await projectIdNow(),
        date,
        notes,
        done,
        rrule: specToRRule(spec, date),
      });
      return onClose();
    }
    // Repeating: if only "done" changed, just tick this occurrence.
    const sameProject = project!.kind === 'existing' && project!.project.id === occ.project_id;
    const onlyDone =
      !repeatTouched && title.trim() === occ.title && notes === occ.notes && date === occ.date && sameProject;
    if (onlyDone) {
      if (done !== occ.done) await setOccurrenceDone(occ, done);
      return onClose();
    }
    setAsking('save');
  };

  const saveRepeating = async (scope: 'one' | 'future') => {
    if (!series || !occ) return;
    const projectId = await projectIdNow();
    if (scope === 'one') {
      await editTaskOccurrence(series, occ, { title, project_id: projectId, date, notes, done });
    } else {
      // Keep the same pattern (re-anchored to the new start date) unless it was edited.
      const rule = repeatTouched
        ? specToRRule(spec, date)
        : specToRRule(rruleToSpec(series.rrule, series.date), date);
      await editTaskFromHere(series, occ.originalDate, { title, project_id: projectId, date, notes, done, rrule: rule });
    }
    onClose();
  };

  const remove = async () => {
    if (!taskId) return;
    if (repeating) return setAsking('delete');
    if (!window.confirm('Delete this task?')) return;
    await deleteTask(taskId);
    onClose();
  };

  const removeRepeating = async (scope: 'one' | 'future') => {
    if (!series || !occ) return;
    if (scope === 'one') await skipOccurrence('task', series.id, occ.originalDate);
    else await endSeriesBefore('task', series.id, occ.originalDate);
    onClose();
  };

  return (
    <Modal
      title={taskId ? (repeating ? 'Repeating task' : 'Task') : 'Add task'}
      onClose={onClose}
      footer={
        <>
          {taskId && (
            <button type="button" className="danger" onClick={() => void remove()}>
              Delete
            </button>
          )}
          <span className="grow" />
          <button type="button" className="primary" onClick={() => void save()} disabled={!loaded}>
            {taskId ? 'Save' : 'Add task'}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span>Task</span>
          <textarea
            rows={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus={!taskId}
          />
        </label>
        <div className="field">
          <span>Project</span>
          <ProjectPicker value={project} onChange={setProject} />
        </div>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {taskId && (
          <label className="field-inline">
            <input type="checkbox" className="switch" checked={done} onChange={(e) => setDone(e.target.checked)} />
            <span>Done{repeating ? ' (this day)' : ''}</span>
          </label>
        )}
        <RepeatEditor
          spec={spec}
          start={date}
          onChange={(s) => {
            setSpec(s);
            setRepeatTouched(true);
          }}
        />
        <label className="field">
          <span>Notes</span>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
      </form>

      {asking && (
        <ScopeChooser
          action={asking}
          allowThisOnly={asking === 'delete' || !repeatTouched}
          onCancel={() => setAsking(null)}
          onChoose={(scope) => {
            setAsking(null);
            void (asking === 'save' ? saveRepeating(scope) : removeRepeating(scope));
          }}
        />
      )}
    </Modal>
  );
}
