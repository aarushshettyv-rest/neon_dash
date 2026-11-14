create table if not exists public.player_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  save_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_saves enable row level security;

revoke all on table public.player_saves from anon, authenticated;
grant select, insert, update on table public.player_saves to authenticated;

drop policy if exists "Players can read their own saves" on public.player_saves;
drop policy if exists "Players can create their own saves" on public.player_saves;
drop policy if exists "Players can update their own saves" on public.player_saves;

create policy "Players can read their own saves"
  on public.player_saves
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Players can create their own saves"
  on public.player_saves
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Players can update their own saves"
  on public.player_saves
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
