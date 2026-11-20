import { useEffect, useState } from 'react';
import { createProject, createTask, deleteTask, updateTask } from '../lib/data';
import { db } from '../lib/db';
import { isISODate } from '../lib/dates';
import { useTask } from '../lib/queries';
import type { ISODate } from '../lib/types';
import { Modal } from './Modal';
import { ProjectPicker, type PickedProject } from './ProjectPicker';

/** Add a task (taskId = null) or open an existing one (the detail window). */
export function TaskForm(props: { taskId: string | null; date: ISODate; projectId?: string; onClose: () => void }) {
  const { taskId, onClose } = props;
  const existing = useTask(taskId);
  const [title, setTitle] = useState('');
  const [project, setProject] = useState<PickedProject | null>(null);
  const [date, setDate] = useState(props.date);
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(taskId === null);

  // Quick add from a Weekly-view cell: start with that cell's project.
  useEffect(() => {
    if (taskId || !props.projectId) return;
    void db.projects.get(props.projectId).then((p) => p && setProject({ kind: 'existing', project: p }));
  }, [taskId, props.projectId]);

  // Fill the form once when opening an existing task.
  useEffect(() => {
    if (loaded || !existing) return;
    void (async () => {
      const p = await db.projects.get(existing.project_id);
      setTitle(existing.title);
      setDate(existing.date);
      setNotes(existing.notes);
      setDone(existing.done);
      if (p) setProject({ kind: 'existing', project: p });
      setLoaded(true);
    })();
  }, [existing, loaded]);

  if (taskId && existing === null) {
    return (
      <Modal title="Task" onClose={onClose}>
        <p className="muted">This task no longer exists.</p>
      </Modal>
    );
  }

  const save = async () => {
    if (!title.trim()) return setError('Enter a task title.');
    if (!project) return setError('Choose a project.');
    if (!isISODate(date)) return setError('Choose a date.');
    const projectId =
      project.kind === 'existing' ? project.project.id : (await createProject(project.name, project.category)).id;
    if (taskId) await updateTask(taskId, { title, project_id: projectId, date, notes, done });
    else await createTask({ title, project_id: projectId, date, notes });
    onClose();
  };

  const remove = async () => {
    if (!taskId || !window.confirm('Delete this task?')) return;
    await deleteTask(taskId);
    onClose();
  };

  return (
    <Modal
      title={taskId ? 'Task' : 'Add task'}
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
            <span>Done</span>
          </label>
        )}
        <label className="field">
          <span>Notes</span>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
