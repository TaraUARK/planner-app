import { describe, expect, it } from 'vitest';
import { notesInCategory, searchNotes } from '../queries';
import type { Note } from '../types';

const note = (title: string, body_text: string): Note => ({
  id: title, category_id: null, title, body_text, body_json: null, sort_key: 'a0', created_at: '', deleted_at: null,
});

describe('note search', () => {
  const notes = [note('Grocery ideas', 'cranberries, sweet potatoes'), note('Gift ideas for Mom', 'scarf, garden gloves'), note('Book list', '')];

  it('matches titles and text, ignoring case', () => {
    expect(searchNotes(notes, 'GARDEN').map((n) => n.title)).toEqual(['Gift ideas for Mom']);
    expect(searchNotes(notes, 'book').map((n) => n.title)).toEqual(['Book list']);
  });

  it('requires every word, in any order', () => {
    expect(searchNotes(notes, 'potatoes grocery').map((n) => n.title)).toEqual(['Grocery ideas']);
    expect(searchNotes(notes, 'ideas').length).toBe(2);
    expect(searchNotes(notes, 'ideas gloves').map((n) => n.title)).toEqual(['Gift ideas for Mom']);
  });

  it('an empty search shows everything', () => {
    expect(searchNotes(notes, '   ')).toHaveLength(3);
  });
});

describe('note categories', () => {
  const a = { ...note('A', ''), category_id: 'home' };
  const b = { ...note('B', ''), category_id: 'lab' };
  const c = note('C', ''); // no category
  it('filters by category, "all", and "no category"', () => {
    expect(notesInCategory([a, b, c], 'home').map((n) => n.title)).toEqual(['A']);
    expect(notesInCategory([a, b, c], 'all')).toHaveLength(3);
    expect(notesInCategory([a, b, c], 'none').map((n) => n.title)).toEqual(['C']);
  });
});
