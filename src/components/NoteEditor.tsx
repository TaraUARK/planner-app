import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { deleteNote, saveNote, setNoteCategory } from '../lib/data';
import type { NoteCategory } from '../lib/types';
import { useNote } from '../lib/queries';
import { ChevronLeft } from './Icons';

const SAVE_DELAY = 600; // ms after the last keystroke

/** JSON with sorted keys, so the same content always compares equal (the database may reorder keys). */
function stable(v: unknown): string {
  return JSON.stringify(v ?? null, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val,
  );
}

/**
 * One note, full page, editable straight away (no Edit button). Changes
 * save automatically. If the same note is changed on the other device
 * while it's open, a notice offers to load that version.
 */
export function NoteEditor(props: {
  id: string;
  categories: NoteCategory[];
  /** Text of the back button (the category name). */
  backLabel?: string;
  onBack?: () => void;
  onDeleted: () => void;
}) {
  const note = useNote(props.id);
  const [title, setTitle] = useState<string | null>(null);
  const [remoteChange, setRemoteChange] = useState(false);
  /** The body / title we last saved (or loaded), to tell our own changes from the other device's. */
  const known = useRef<string | null>(null);
  const knownTitle = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Unsaved changes (title and/or body), combined until the next save. */
  const pending = useRef<null | Parameters<typeof saveNote>[1]>(null);

  const flush = () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = null;
    if (patch) void saveNote(props.id, patch);
  };
  const schedule = (patch: Parameters<typeof saveNote>[1]) => {
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: null,
    editorProps: { attributes: { class: 'note-body', 'aria-label': 'Note text' } },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      known.current = stable(json);
      schedule({ body_json: json, body_text: ed.getText({ blockSeparator: '\n' }) });
    },
  });

  // Load the note into the editor once, when it first arrives.
  const loaded = useRef(false);
  useEffect(() => {
    if (!editor || !note || loaded.current) return;
    loaded.current = true;
    editor.commands.setContent((note.body_json as object | null) ?? '', { emitUpdate: false });
    known.current = stable(note.body_json);
    knownTitle.current = note.title;
    setTitle(note.title);
    // A brand-new note starts with the cursor in the title.
    if (!note.title && !note.body_text) setTimeout(() => document.getElementById('note-title')?.focus(), 0);
  }, [editor, note]);

  // Spot a newer version arriving from the other device.
  useEffect(() => {
    if (!note || !loaded.current || pending.current) return;
    if (stable(note.body_json) !== known.current || note.title !== knownTitle.current) setRemoteChange(true);
  }, [note]);

  // Save anything still waiting when leaving the note or the app.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (note === null || note?.deleted_at) {
    return <p className="placeholder">This note no longer exists.</p>;
  }
  if (!note || !editor || title === null) return null;

  const loadLatest = () => {
    editor.commands.setContent((note.body_json as object | null) ?? '', { emitUpdate: false });
    known.current = stable(note.body_json);
    knownTitle.current = note.title;
    setTitle(note.title);
    setRemoteChange(false);
  };

  const remove = async () => {
    if (!window.confirm(`Delete the note “${title.trim() || 'Untitled'}”? This can't be undone.`)) return;
    pending.current = null;
    clearTimeout(timer.current);
    await deleteNote(props.id);
    props.onDeleted();
  };

  return (
    <div className="note-page">
      <div className="note-top">
        {props.onBack && (
          <button
            className="plain back"
            onClick={() => {
              flush();
              props.onBack!();
            }}
          >
            <ChevronLeft /> {props.backLabel ?? 'Notes'}
          </button>
        )}
        <span className="grow" />
        <select
          className="note-cat"
          aria-label="Category"
          value={note.category_id ?? ''}
          onChange={(e) => void setNoteCategory(props.id, e.target.value || null)}
        >
          <option value="">No category</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="danger" onClick={() => void remove()}>
          Delete
        </button>
      </div>

      {remoteChange && (
        <div className="banner" role="status">
          <span className="grow">This note was changed on another device.</span>
          <button
            className="plain"
            onClick={() => {
              // Keep what's on screen: save it again so it becomes the latest version.
              setRemoteChange(false);
              known.current = stable(editor.getJSON());
              knownTitle.current = title;
              void saveNote(props.id, { title, body_json: editor.getJSON(), body_text: editor.getText({ blockSeparator: '\n' }) });
            }}
          >
            Keep mine
          </button>
          <button className="primary" onClick={loadLatest}>
            Load it
          </button>
        </div>
      )}

      <Toolbar editor={editor} />
      <input
        id="note-title"
        className="note-title"
        placeholder="Title"
        value={title}
        onChange={(e) => {
          const v = e.target.value;
          setTitle(v);
          knownTitle.current = v;
          schedule({ title: v });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            editor.commands.focus('start');
          }
        }}
      />
      <EditorContent editor={editor} className="note-editor" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      checks: e.isActive('taskList'),
    }),
  });
  const btn = (label: string, active: boolean, run: () => void, content: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={active ? 'on' : ''}
      // Keep the text cursor in the note while tapping toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {content}
    </button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div className="note-toolbar" role="toolbar" aria-label="Formatting">
      {btn('Bold', s.bold, () => chain().toggleBold().run(), <b>B</b>)}
      {btn('Italic', s.italic, () => chain().toggleItalic().run(), <i>I</i>)}
      {btn('Underline', s.underline, () => chain().toggleUnderline().run(), <u>U</u>)}
      {btn('Heading', s.h1, () => chain().toggleHeading({ level: 1 }).run(), 'H1')}
      {btn('Subheading', s.h2, () => chain().toggleHeading({ level: 2 }).run(), 'H2')}
      {btn('Bulleted list', s.bullets, () => chain().toggleBulletList().run(), '•')}
      {btn('Numbered list', s.numbers, () => chain().toggleOrderedList().run(), '1.')}
      {btn('Checklist', s.checks, () => chain().toggleTaskList().run(), '☑')}
    </div>
  );
}
