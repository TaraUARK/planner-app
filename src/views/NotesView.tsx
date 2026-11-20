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
import { ChevronLeft, ChevronRightSmall, GripIcon } from '../components/Icons';
import { Modal } from '../components/Modal';
import { NoteEditor } from '../components/NoteEditor';
import { createNote, createNoteCategory, deleteNoteCategory, moveNoteToKey, renameNoteCategory } from '../lib/data';
import { useLayout, useRoute } from '../lib/hooks';
import { planMove } from '../lib/ordering';
import { notesInCategory, searchNotes, useNoteCategories, useNotes } from '../lib/queries';
import type { Note, NoteCategory } from '../lib/types';

/**
 * Notes, organized in categories.
 *   Mac:   left = categories (or, with a note open, that category's notes + a back arrow);
 *          main = the chosen category's notes, or the open note.
 *   Phone: categories → a category's notes → one note, each full screen with a back button.
 */
export function NotesView({ cat, noteId }: { cat?: string; noteId?: string }) {
  const layout = useLayout();
  const [route, go] = useRoute();
  const notes = useNotes();
  const categories = useNoteCategories();
  if (!notes || !categories) return null;

  const to = (noteCat?: string, id?: string) => go({ view: 'notes', date: route.date, noteCat, noteId: id });
  const current = cat ?? 'all';
  const catName = (c: string) =>
    c === 'all' ? 'All notes' : c === 'none' ? 'No category' : (categories.find((x) => x.id === c)?.name ?? 'Notes');

  const categoryList = (
    <CategoryList categories={categories} notes={notes} selected={layout === 'wide' ? current : undefined} onSelect={(c) => to(c)} />
  );
  const noteList = (opts: { back?: () => void; inSidebar?: boolean }) => (
    <NoteList
      key={current}
      cat={current}
      title={catName(current)}
      notes={notes}
      selected={noteId}
      inSidebar={opts.inSidebar}
      onBack={opts.back}
      onOpen={(id) => to(current, id)}
      onAdd={async () => to(current, (await createNote(current === 'all' || current === 'none' ? null : current)).id)}
    />
  );
  const editor = (back?: () => void) =>
    noteId ? (
      <NoteEditor
        key={noteId}
        id={noteId}
        categories={categories}
        backLabel={catName(current)}
        onBack={back}
        onDeleted={() => to(current)}
      />
    ) : null;

  if (layout === 'compact') {
    if (noteId) return editor(() => to(current));
    if (cat) return noteList({ back: () => to(undefined) });
    return categoryList;
  }

  return (
    <div className="notes-split">
      <aside className="notes-side">{noteId ? noteList({ back: () => to(current), inSidebar: true }) : categoryList}</aside>
      <section className="notes-main">{noteId ? editor() : noteList({})}</section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
function CategoryList(props: {
  categories: NoteCategory[];
  notes: Note[];
  selected?: string;
  onSelect: (cat: string) => void;
}) {
  const { categories, notes } = props;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<NoteCategory | null>(null);
  const count = (c: string) => notesInCategory(notes, c).length;
  const noneCount = count('none');

  const row = (c: string, label: string, cat?: NoteCategory) => (
    <li key={c} className={`cat-row ${props.selected === c ? 'selected' : ''}`}>
      <button type="button" className="cat-main plain" onClick={() => props.onSelect(c)}>
        <span className="grow">{label}</span>
        <span className="muted">{count(c)}</span>
        <ChevronRightSmall />
      </button>
      {cat && (
        <button type="button" className="plain cat-edit" aria-label={`Edit ${cat.name}`} onClick={() => setEditing(cat)}>
          Edit
        </button>
      )}
    </li>
  );

  const add = async () => {
    if (!newName.trim()) return;
    await createNoteCategory(newName);
    setNewName('');
    setAdding(false);
  };

  return (
    <div className="page notes-cats">
      <h2>Categories</h2>
      <ul className="cat-list">
        {row('all', 'All notes')}
        {categories.map((c) => row(c.id, c.name, c))}
        {categories.length > 0 && noneCount > 0 && row('none', 'No category')}
      </ul>
      {adding ? (
        <form
          className="cat-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            className="search"
            autoFocus
            placeholder="Category name"
            aria-label="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="primary">
            Add
          </button>
          <button type="button" className="plain" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="cat-new" onClick={() => setAdding(true)}>
          + New category
        </button>
      )}
      {editing && <CategoryDialog category={editing} count={count(editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryDialog(props: { category: NoteCategory; count: number; onClose: () => void }) {
  const { category, count, onClose } = props;
  const [name, setName] = useState(category.name);
  const save = async () => {
    if (name.trim() && name.trim() !== category.name) await renameNoteCategory(category.id, name);
    onClose();
  };
  const remove = async () => {
    const msg =
      count > 0
        ? `Delete the category “${category.name}”? Its ${count} ${count === 1 ? 'note is' : 'notes are'} kept and moved to “No category”.`
        : `Delete the category “${category.name}”?`;
    if (!window.confirm(msg)) return;
    await deleteNoteCategory(category.id);
    onClose();
  };
  return (
    <Modal
      title="Category"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="danger" onClick={() => void remove()}>
            Delete
          </button>
          <span className="grow" />
          <button type="button" className="primary" onClick={() => void save()}>
            Save
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
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Notes in one category
// ---------------------------------------------------------------------------
function NoteList(props: {
  cat: string;
  title: string;
  notes: Note[];
  selected?: string;
  inSidebar?: boolean;
  onBack?: () => void;
  onOpen: (id: string) => void;
  onAdd: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState('');
  const inCat = notesInCategory(props.notes, props.cat);
  const shown = searchNotes(inCat, query);
  const searching = query.trim().length > 0;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const keys = new Map(inCat.map((n) => [n.id, n.sort_key]));
    const writes = planMove(
      inCat.map((n) => ({ key: n.id })),
      String(e.active.id),
      String(e.over.id),
      keys,
    );
    for (const w of writes) void moveNoteToKey(w.key, w.sort_key);
  };

  return (
    <div className={`notes-list page ${props.inSidebar ? 'in-sidebar' : ''}`}>
      {props.onBack && (
        <button className="plain back" onClick={props.onBack}>
          <ChevronLeft /> Categories
        </button>
      )}
      <h2 className="notes-heading">{props.title}</h2>
      <div className="notes-tools">
        <input
          type="search"
          className="search"
          placeholder={`Search ${props.title.toLowerCase()}`}
          aria-label="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            setQuery('');
            void props.onAdd();
          }}
        >
          + New note
        </button>
      </div>
      {inCat.length === 0 && <p className="placeholder">No notes here yet. Tap “+ New note” to start one.</p>}
      {searching && shown.length === 0 && <p className="placeholder">No notes match “{query.trim()}”.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          <ul className="note-cards">
            {shown.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                selected={n.id === props.selected}
                draggable={!searching}
                onOpen={() => props.onOpen(n.id)}
              />
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
