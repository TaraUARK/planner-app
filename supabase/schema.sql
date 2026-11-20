-- Planner database schema.
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- Safe to run more than once.
--
-- Every table:
--   * id          text primary key, created on the device (UUID, or a
--                 deterministic key for exceptions/positions so two offline
--                 devices can't create duplicates)
--   * user_id     filled in automatically from the signed-in user
--   * updated_at  set by the server on every insert/update (used for sync)
--   * deleted_at  "soft delete" so deletions sync to the other device
--   * Row Level Security: only the signed-in owner can see or change rows

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  category    text not null check (category in ('work', 'home')),
  sort_key    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);

create table if not exists public.tasks (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id  text not null references public.projects(id),
  title       text not null,
  date        date not null,
  done        boolean not null default false,
  notes       text not null default '',
  rrule       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);

create table if not exists public.appointments (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'appointment' check (kind in ('appointment', 'special_date')),
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  all_day     boolean not null default false,
  start_time  time,
  end_time    time,
  location    text not null default '',
  notes       text not null default '',
  rrule       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);

-- One row per changed occurrence of a repeating item.
-- id = '<item_type>:<item_id>@<original_date>'
create table if not exists public.occurrence_exceptions (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_type      text not null check (item_type in ('task', 'appointment')),
  item_id        text not null,
  original_date  date not null,
  new_date       date,
  done           boolean,
  skipped        boolean not null default false,
  overrides      jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  deleted_at     timestamptz
);

-- Saved positions in the Daily view and in Weekly-view cells.
-- id = '<scope>:<date>:<item_key>'
create table if not exists public.item_positions (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope       text not null check (scope in ('day', 'week_cell')),
  date        date not null,
  item_key    text not null,
  sort_key    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);

create table if not exists public.notes (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  body_json   jsonb,
  body_text   text not null default '',
  sort_key    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz
);

-- One row per user; id = the user's id.
create table if not exists public.settings (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hide_completed  boolean not null default false,
  show_holidays   boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),
  deleted_at      timestamptz
);

-- ---------------------------------------------------------------------------
-- Triggers, indexes, security (applied to every table)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'tasks', 'appointments', 'occurrence_exceptions',
    'item_positions', 'notes', 'settings'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before insert or update on public.%I
         for each row execute function public.set_updated_at()', t);

    execute format(
      'create index if not exists %I on public.%I (user_id, updated_at)',
      t || '_sync_idx', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);

    execute format('revoke all on public.%I from anon', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

create index if not exists tasks_project_idx on public.tasks (project_id);
