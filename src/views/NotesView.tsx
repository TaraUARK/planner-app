import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { GripIcon } from '../components/Icons';
import { NoteEditor } from '../components/NoteEditor';
import { createNote, moveNoteToKey } from '../lib/data';
import { useLayout, useRoute } from '../lib/hooks';
import { planMove } from '../lib/ordering';
import { searchNotes, useNotes } from '../lib/queries';
import type { Note } from '../lib/types';

/**
 * Notes: a list of cards (titles only). Phone: the list, or one open note
 * full page. Mac: the list on the left and the open note on the right.
 */
export function NotesView({ noteId }: { noteId?: string }) {
  const layout = useLayout();
  const [route, go] = useRoute();
  const notes = useNotes();
  const [query, setQuery] = useState('');
  const open = (id: string | undefined) => go({ view: 'notes', date: route.date, noteId: id });

  if (!notes) return null;

  const addNote = async () => {
    setQuery('');
    open((await createNote()).id);
  };

  const list = <NoteList notes={notes} query={query} setQuery={setQuery} selected={noteId} onOpen={open} onAdd={() => void addNote()} />;

  if (layout === 'compact') {
    return noteId ? <NoteEditor key={noteId} id={noteId} onBack={() => open(undefined)} onDeleted={() => open(undefined)} /> : list;
  }
  return (
    <div className="notes-split">
      <aside className="notes-side">{list}</aside>
      <section className="notes-main">
        {noteId ? (
          <NoteEditor key={noteId} id={noteId} onDeleted={() => open(undefined)} />
        ) : (
          <p className="placeholder">{notes.length ? 'Choose a note, or add a new one.' : 'No notes yet.'}</p>
        )}
      </section>
    </div>
  );
}

function NoteList(props: {
  notes: Note[];
  query: string;
  setQuery: (q: string) => void;
  selected?: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { notes, query } = props;
  const shown = searchNotes(notes, query);
  const searching = query.trim().length > 0;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const keys = new Map(notes.map((n) => [n.id, n.sort_key]));
    const writes = planMove(
      notes.map((n) => ({ key: n.id })),
      String(e.active.id),
      String(e.over.id),
      keys,
    );
    for (const w of writes) void moveNoteToKey(w.key, w.sort_key);
  };

  return (
    <div className="notes-list page">
      <div className="notes-tools">
        <input
          type="search"
          className="search"
          placeholder="Search notes"
          aria-label="Search notes"
          value={query}
          onChange={(e) => props.setQuery(e.target.value)}
        />
        <button className="primary" onClick={props.onAdd}>
          + New note
        </button>
      </div>
      {notes.length === 0 && <p className="placeholder">No notes yet. Tap “+ New note” to start one.</p>}
      {searching && shown.length === 0 && <p className="placeholder">No notes match “{query.trim()}”.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          <ul className="note-cards">
            {shown.map((n) => (
              <NoteCard key={n.id} note={n} selected={n.id === props.selected} draggable={!searching} onOpen={() => props.onOpen(n.id)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {searching && shown.length > 0 && <p className="muted small center">Clear the search to reorder notes.</p>}
    </div>
  );
}

function NoteCard(props: { note: Note; selected: boolean; draggable: boolean; onOpen: () => void }) {
  const { note } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    disabled: !props.draggable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`note-card ${props.selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <button type="button" className="note-card-body plain" onClick={props.onOpen}>
        {note.title.trim() || <span className="muted">Untitled</span>}
      </button>
      {props.draggable && (
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
      )}
    </li>
  );
}
