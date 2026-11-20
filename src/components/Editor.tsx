import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ISODate } from '../lib/types';
import { AppointmentForm } from './AppointmentForm';
import { TaskForm } from './TaskForm';

type Open =
  | { kind: 'task'; id: string | null; date: ISODate }
  | { kind: 'appointment'; id: string | null; date: ISODate }
  | null;

interface EditorApi {
  addTask: (date: ISODate) => void;
  openTask: (id: string, date: ISODate) => void;
  addAppointment: (date: ISODate) => void;
  openAppointment: (id: string, date: ISODate) => void;
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
      addTask: (date) => setOpen({ kind: 'task', id: null, date }),
      openTask: (id, date) => setOpen({ kind: 'task', id, date }),
      addAppointment: (date) => setOpen({ kind: 'appointment', id: null, date }),
      openAppointment: (id, date) => setOpen({ kind: 'appointment', id, date }),
    }),
    [],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      {open?.kind === 'task' && <TaskForm key={open.id ?? 'new'} taskId={open.id} date={open.date} onClose={close} />}
      {open?.kind === 'appointment' && (
        <AppointmentForm key={open.id ?? 'new'} id={open.id} date={open.date} onClose={close} />
      )}
    </Ctx.Provider>
  );
}

export function useEditor(): EditorApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useEditor must be used inside EditorProvider');
  return api;
}
