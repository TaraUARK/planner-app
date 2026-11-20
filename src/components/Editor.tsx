import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useProjects, useTaskCounts } from '../lib/queries';
import type { ISODate } from '../lib/types';
import { ProjectDialog } from '../views/ProjectsView';
import { AppointmentForm } from './AppointmentForm';
import { Modal } from './Modal';
import { OverdueList } from './OverdueList';
import { TaskForm } from './TaskForm';

type Open =
  | { kind: 'task'; id: string | null; date: ISODate; projectId?: string; originalDate?: ISODate }
  | { kind: 'appointment'; id: string | null; date: ISODate; originalDate?: ISODate }
  | { kind: 'overdue' }
  | { kind: 'note'; title: string; text: string; onEdit: () => void }
  | { kind: 'project'; id: string }
  | null;

interface EditorApi {
  /** projectId: pre-fill the project (quick add from a Weekly-view cell). */
  addTask: (date: ISODate, projectId?: string) => void;
  openOverdue: () => void;
  /** Show an item's notes in a pop-up; "Edit" opens the item itself. */
  showNote: (title: string, text: string, onEdit: () => void) => void;
  openProject: (id: string) => void;
  /** originalDate: which occurrence of a repeating task was tapped. */
  openTask: (id: string, date: ISODate, originalDate?: ISODate) => void;
  addAppointment: (date: ISODate) => void;
  openAppointment: (id: string, date: ISODate, originalDate?: ISODate) => void;
}

const Ctx = createContext<EditorApi | null>(null);

/**
 * Holds which add/detail window is open. It lives above the views, so the
 * window (and anything typed in it) survives rotating the phone or resizing
 * the Mac window.
 */
export function EditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  const api = useMemo<EditorApi>(
    () => ({
      addTask: (date, projectId) => setOpen({ kind: 'task', id: null, date, projectId }),
      openOverdue: () => setOpen({ kind: 'overdue' }),
      showNote: (title, text, onEdit) => setOpen({ kind: 'note', title, text, onEdit }),
      openProject: (id) => setOpen({ kind: 'project', id }),
      openTask: (id, date, originalDate) => setOpen({ kind: 'task', id, date, originalDate }),
      addAppointment: (date) => setOpen({ kind: 'appointment', id: null, date }),
      openAppointment: (id, date, originalDate) => setOpen({ kind: 'appointment', id, date, originalDate }),
    }),
    [],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      {open?.kind === 'task' && (
        <TaskForm
          key={`${open.id ?? 'new'}@${open.originalDate ?? ''}`}
          taskId={open.id}
          date={open.date}
          originalDate={open.originalDate}
          projectId={open.projectId}
          onClose={close}
        />
      )}
      {open?.kind === 'overdue' && <OverdueList onClose={close} />}
      {open?.kind === 'note' && (
        <Modal
          title={open.title}
          onClose={close}
          footer={
            <>
              <span className="grow" />
              <button type="button" onClick={open.onEdit}>
                Edit
              </button>
              <button type="button" className="primary" onClick={close}>
                Done
              </button>
            </>
          }
        >
          <div className="note-popup">{open.text}</div>
        </Modal>
      )}
      {open?.kind === 'project' && <ProjectWindow id={open.id} onClose={close} />}
      {open?.kind === 'appointment' && (
        <AppointmentForm
          key={`${open.id ?? 'new'}@${open.originalDate ?? ''}`}
          id={open.id}
          date={open.date}
          originalDate={open.originalDate}
          onClose={close}
        />
      )}
    </Ctx.Provider>
  );
}

function ProjectWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const projects = useProjects();
  const counts = useTaskCounts();
  const project = projects?.find((p) => p.id === id);
  if (!projects || !counts || !project) return null;
  return <ProjectDialog project={project} projects={projects} taskCount={counts.get(id) ?? 0} onClose={onClose} />;
}

export function useEditor(): EditorApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useEditor must be used inside EditorProvider');
  return api;
}
