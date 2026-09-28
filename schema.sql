-- Run once in Supabase SQL Editor. Keep all user data out of the GitHub repository.
create table if not exists public.planner_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  kind text not null check (kind in ('task','event','habit','habitlog','note','drawing','focus','taskcheck')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated double precision not null,
  deleted boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.planner_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) between 1 and 100),
  value jsonb not null,
  primary key (user_id, key)
);

create index if not exists planner_items_user_live_idx
  on public.planner_items (user_id, deleted, updated);

alter table public.planner_items enable row level security;
alter table public.planner_settings enable row level security;

revoke all on table public.planner_items from anon, authenticated;
revoke all on table public.planner_settings from anon, authenticated;
grant select, insert, update on table public.planner_items to authenticated;
grant select, insert, update on table public.planner_settings to authenticated;

create policy "Read own planner items" on public.planner_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own planner items" on public.planner_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own planner items" on public.planner_items
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Read own planner settings" on public.planner_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own planner settings" on public.planner_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own planner settings" on public.planner_settings
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
