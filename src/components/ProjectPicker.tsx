import { useState } from 'react';
import { useToday } from '../lib/hooks';
import { findProjectByName } from '../lib/ordering';
import { recentProjects, useProjects, useRecentTasks } from '../lib/queries';
import type { Category, Project } from '../lib/types';

/** What the picker hands back: an existing project, or a new one to create on save. */
export type PickedProject = { kind: 'existing'; project: Project } | { kind: 'new'; name: string; category: Category };

/**
 * Project field for the task form.
 * - Empty search: shows projects used in the last 14 days or later (most recent first).
 * - Typing: searches ALL projects, so older ones are suggested instead of
 *   accidentally creating a duplicate. An exact name match is always reused.
 * - A name that matches nothing can be added as a new project (choose work/home).
 */
export function ProjectPicker(props: { value: PickedProject | null; onChange: (v: PickedProject | null) => void }) {
  const today = useToday();
  const projects = useProjects() ?? [];
  const recentTasks = useRecentTasks(today) ?? [];
  const [query, setQuery] = useState('');
  const [newCategory, setNewCategory] = useState<Category | null>(null);

  const recent = recentProjects(projects, recentTasks, today);
  const q = query.trim().toLowerCase();
  const matches = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : recent;
  const exact = findProjectByName(projects, query);

  const { value, onChange } = props;

  if (value) {
    const cat = value.kind === 'existing' ? value.project.category : value.category;
    const name = value.kind === 'existing' ? value.project.name : value.name;
    return (
      <div className="picked">
        <span className={`chip ${cat}`}>
          <span>
            {name}
            {value.kind === 'new' && ' (new)'}
          </span>
        </span>
        <span className="muted">{cat === 'work' ? 'Work' : 'Home'}</span>
        <button
          type="button"
          className="plain"
          onClick={() => {
            onChange(null);
            setQuery('');
            setNewCategory(null);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <input
        type="text"
        placeholder="Search or add a project"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNewCategory(null);
        }}
        autoComplete="off"
        aria-label="Project"
      />
      <div className="picker-list" role="listbox">
        {!q && recent.length === 0 && <div className="muted picker-hint">Type a project name to find or add one.</div>}
        {!q && recent.length > 0 && <div className="muted picker-hint">Recent projects</div>}
        {matches.map((p) => (
          <button
            type="button"
            key={p.id}
            role="option"
            aria-selected={false}
            className="picker-option"
            onClick={() => onChange({ kind: 'existing', project: p })}
          >
            <span className={`dot ${p.category}`} aria-hidden />
            <span className="grow">{p.name}</span>
            <span className="muted">{p.category === 'work' ? 'Work' : 'Home'}</span>
          </button>
        ))}
        {q && !exact && (
          <div className="picker-new">
            <div>
              Add new project <b>“{query.trim()}”</b> as:
            </div>
            <div className="segmented">
              {(['work', 'home'] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={newCategory === c}
                  className={newCategory === c ? `on ${c}` : ''}
                  onClick={() => {
                    setNewCategory(c);
                    onChange({ kind: 'new', name: query.trim(), category: c });
                  }}
                >
                  {c === 'work' ? 'Work' : 'Home'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
