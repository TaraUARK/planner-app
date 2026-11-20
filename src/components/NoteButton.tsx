import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { NoteSmallIcon } from './Icons';

/**
 * Small note icon on a task/event card that has notes. Tapping it shows the
 * notes in a pop-up. It's a <span role="button"> so it can sit inside cards
 * that are themselves buttons, and it never starts a drag.
 */
export function NoteButton(props: { label: string; onOpen: () => void }) {
  const stop = (e: PointerEvent | MouseEvent) => e.stopPropagation();
  return (
    <span
      role="button"
      tabIndex={0}
      className="note-btn"
      aria-label={`Notes for ${props.label}`}
      title="Show notes"
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        props.onOpen();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          props.onOpen();
        }
      }}
    >
      <NoteSmallIcon />
    </span>
  );
}
