-- Mediator Dei: one row per signed-in user holding their saved prayer book state.
-- Run once in the Supabase SQL editor (project prwboqyigjqdwpolcpit).
create table if not exists public.prayer_book_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.prayer_book_state enable row level security;

drop policy if exists "Read own prayer state" on public.prayer_book_state;
drop policy if exists "Insert own prayer state" on public.prayer_book_state;
drop policy if exists "Update own prayer state" on public.prayer_book_state;
drop policy if exists "Delete own prayer state" on public.prayer_book_state;

create policy "Read own prayer state" on public.prayer_book_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own prayer state" on public.prayer_book_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own prayer state" on public.prayer_book_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own prayer state" on public.prayer_book_state
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.prayer_book_state from anon;
grant select, insert, update, delete on public.prayer_book_state to authenticated;
