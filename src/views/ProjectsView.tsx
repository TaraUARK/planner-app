import { useState } from 'react';
import { ChevronRightSmall } from '../components/Icons';
import { Modal } from '../components/Modal';
import { createProject, deleteProject, mergeProject, renameProject, setProjectCategory } from '../lib/data';
import { findProjectByName } from '../lib/ordering';
import { useProjects, useTaskCounts } from '../lib/queries';
import type { Category, Project } from '../lib/types';

/** Settings → Projects: rename, merge, switch work/home, delete. */
export function ProjectsView() {
  const projects = useProjects();
  const counts = useTaskCounts();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  if (!projects || !counts) return null;

  const group = (cat: Category) => {
    const list = projects.filter((p) => p.category === cat);
    return (
      <>
        <h2>{cat === 'work' ? 'Work' : 'Home'}</h2>
        <div className="card">
          {list.length === 0 && <div className="row muted">No {cat} projects yet.</div>}
          {list.map((p) => (
            <button key={p.id} className="row row-button" onClick={() => setEditing(p)}>
              <span className={`dot ${p.category}`} aria-hidden />
              <span className="label">{p.name}</span>
              <span className="value">
                {counts.get(p.id) ?? 0} {(counts.get(p.id) ?? 0) === 1 ? 'task' : 'tasks'}
              </span>
              <ChevronRightSmall />
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="page">
      <p className="muted small">
        Tap a project to rename it, switch it between work and home, or delete it. To change the order, drag
        project names in the Week view (coming in stage 3).
      </p>
      {group('work')}
      {group('home')}
      <p>
        <button onClick={() => setEditing('new')}>+ New project</button>
      </p>
      {editing && (
        <ProjectDialog
          project={editing === 'new' ? null : editing}
          projects={projects}
          taskCount={editing === 'new' ? 0 : (counts.get(editing.id) ?? 0)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProjectDialog(props: {
  project: Project | null;
  projects: Project[];
  taskCount: number;
  onClose: () => void;
}) {
  const { project, projects, taskCount, onClose } = props;
  const [name, setName] = useState(project?.name ?? '');
  const [category, setCategory] = useState<Category>(project?.category ?? 'work');
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const others = projects.filter((p) => p.id !== project?.id);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a project name.');
    const clash = findProjectByName(others, trimmed);
    if (clash) {
      if (!project) return setError(`A project named “${clash.name}” already exists.`);
      const ok = window.confirm(
        `A project named “${clash.name}” already exists. Merge them? ` +
          `${taskCount} ${taskCount === 1 ? 'task moves' : 'tasks move'} into “${clash.name}” and this project is removed.`,
      );
      if (!ok) return;
      await mergeProject(project.id, clash.id);
      return onClose();
    }
    if (!project) {
      await createProject(trimmed, category);
      return onClose();
    }
    if (trimmed !== project.name) await renameProject(project.id, trimmed);
    if (category !== project.category) await setProjectCategory(project.id, category);
    onClose();
  };

  const remove = async () => {
    if (!project) return;
    if (taskCount === 0) {
      if (!window.confirm(`Delete “${project.name}”?`)) return;
      await deleteProject(project.id, null);
      return onClose();
    }
    if (moveTo === '__delete__') {
      if (!window.confirm(`Delete “${project.name}” AND its ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}? This can't be undone.`)) return;
      await deleteProject(project.id, { deleteTasks: true });
      return onClose();
    }
    if (!moveTo) return setError('Choose where its tasks should go.');
    await deleteProject(project.id, { moveTo });
    onClose();
  };

  return (
    <Modal
      title={project ? 'Project' : 'New project'}
      onClose={onClose}
      footer={
        deleting ? (
          <>
            <button type="button" onClick={() => setDeleting(false)}>
              Back
            </button>
            <span className="grow" />
            <button type="button" className="danger" onClick={() => void remove()}>
              Delete project
            </button>
          </>
        ) : (
          <>
            {project && (
              <button type="button" className="danger" onClick={() => setDeleting(true)}>
                Delete
              </button>
            )}
            <span className="grow" />
            <button type="button" className="primary" onClick={() => void save()}>
              {project ? 'Save' : 'Add project'}
            </button>
          </>
        )
      }
    >
      {deleting && project ? (
        <div className="form">
          {taskCount === 0 ? (
            <p>“{project.name}” has no tasks. Delete it?</p>
          ) : (
            <>
              <p>
                “{project.name}” has {taskCount} {taskCount === 1 ? 'task' : 'tasks'}. What should happen to{' '}
                {taskCount === 1 ? 'it' : 'them'}?
              </p>
              <label className="field">
                <span>Tasks</span>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose…</option>
                  <optgroup label="Move them to">
                    {others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.category === 'work' ? 'Work' : 'Home'})
                      </option>
                    ))}
                  </optgroup>
                  <option value="__delete__">Delete them too</option>
                </select>
              </label>
            </>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!project} />
          </label>
          <div className="field">
            <span>Category</span>
            <div className="segmented">
              {(['work', 'home'] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={category === c}
                  className={category === c ? `on ${c}` : ''}
                  onClick={() => setCategory(c)}
                >
                  {c === 'work' ? 'Work' : 'Home'}
                </button>
              ))}
            </div>
            {project && category !== project.category && (
              <span className="muted small">It will move to the end of the {category} list.</span>
            )}
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
