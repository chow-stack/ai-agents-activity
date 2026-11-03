-- Trust or Betray schema. Shares the Workflow Lab Supabase project, so every object is prefixed `tob_`.
-- Clients can only read. Every write goes through a security definer function that checks the room's phase.
-- The game runs as a state machine on `tob_matches`: talk → decide → (next turn | note) → done.
-- Team laptops submit their agent's moves; any open screen calls tob_tick to fill in moves that ran out of time.

create table public.tob_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{5}$'),
  phase text not null default 'lobby' check (phase in ('lobby', 'intro', 'strategy', 'playing', 'break', 'ended')),
  round int not null default 0 check (round between 0 and 3),
  slot int not null default 0, -- which set of matches is playing right now
  slots int not null default 0, -- how many sets this round has
  slide int not null default 0,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The host's secret lives apart from `tob_rooms` so the public can read rooms without seeing it.
create table public.tob_room_keys (
  code text primary key references public.tob_rooms on delete cascade,
  host_key uuid not null default gen_random_uuid()
);

-- One row per team. A team is one laptop: its id is that laptop's secret.
create table public.tob_teams (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.tob_rooms on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  seq int not null,
  key_status text not null default 'none' check (key_status in ('none', 'ok', 'bad', 'limited')),
  play text not null default '' check (char_length(play) <= 300),
  memory text not null default '' check (char_length(memory) <= 200),
  ready boolean not null default false,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index tob_teams_room_name_ci on public.tob_teams (room_code, lower(btrim(name)));
create index tob_teams_room_idx on public.tob_teams (room_code);

create table public.tob_matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.tob_rooms on delete cascade,
  round int not null,
  slot int not null,
  a_team uuid not null references public.tob_teams on delete cascade,
  b_team uuid not null references public.tob_teams on delete cascade,
  length int not null check (length between 1 and 10), -- hidden from the agents
  turn int not null default 0,
  stage text not null default 'waiting' check (stage in ('waiting', 'talk', 'decide', 'note', 'done')),
  opens_at timestamptz, -- agents wait until then, so the room can read the last reveal
  deadline timestamptz, -- after this, missing moves are filled in
  a_points int not null default 0,
  b_points int not null default 0,
  a_noted boolean not null default false,
  b_noted boolean not null default false
);
create index tob_matches_room_idx on public.tob_matches (room_code);

create table public.tob_turns (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.tob_rooms on delete cascade,
  match_id uuid not null references public.tob_matches on delete cascade,
  turn int not null,
  a_msg text,
  b_msg text,
  a_choice text check (a_choice in ('share', 'steal')),
  b_choice text check (b_choice in ('share', 'steal')),
  a_thought text,
  b_thought text,
  a_auto boolean not null default false, -- true when the move ran out of time
  b_auto boolean not null default false,
  a_points int,
  b_points int,
  revealed_at timestamptz,
  unique (match_id, turn)
);
create index tob_turns_room_idx on public.tob_turns (room_code);

-- The agent's notebook: one note per opponent, rewritten after every match against them.
create table public.tob_notes (
  room_code text not null references public.tob_rooms on delete cascade,
  writer uuid not null references public.tob_teams on delete cascade,
  about uuid not null references public.tob_teams on delete cascade,
  note text not null check (char_length(note) <= 300),
  round int not null,
  updated_at timestamptz not null default now(),
  primary key (writer, about)
);
create index tob_notes_room_idx on public.tob_notes (room_code);

alter table public.tob_rooms enable row level security;
alter table public.tob_room_keys enable row level security; -- no policies: only functions touch it
alter table public.tob_teams enable row level security;
alter table public.tob_matches enable row level security;
alter table public.tob_turns enable row level security;
alter table public.tob_notes enable row level security;
revoke all on public.tob_room_keys from anon, authenticated;

create policy "read rooms" on public.tob_rooms for select to anon, authenticated using (true);
create policy "read teams" on public.tob_teams for select to anon, authenticated using (true);
create policy "read matches" on public.tob_matches for select to anon, authenticated using (true);
create policy "read turns" on public.tob_turns for select to anon, authenticated using (true);
create policy "read notes" on public.tob_notes for select to anon, authenticated using (true);

-- ---------- Teams ----------

create function public.tob_create_room()
returns table (code text, host_key uuid) language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  c text;
begin
  loop
    c := '';
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from tob_rooms r where r.code = c);
  end loop;
  insert into tob_rooms (code) values (c);
  insert into tob_room_keys (code) values (c);
  return query select k.code, k.host_key from tob_room_keys k where k.code = c;
end $$;

create function public.tob_join(p_code text, p_name text)
returns public.tob_teams language plpgsql security definer set search_path = public as $$
declare
  r tob_rooms;
  t tob_teams;
begin
  select * into r from tob_rooms where code = p_code;
  if r is null then raise exception 'No room with that code.'; end if;
  if r.phase = 'ended' then raise exception 'That room has finished.'; end if;
  if r.phase = 'playing' then raise exception 'A round is playing. Join when it ends.'; end if;
  insert into tob_teams (room_code, name, seq)
  values (p_code, btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
          coalesce((select max(seq) from tob_teams where room_code = p_code), 0) + 1)
  returning * into t;
  return t;
end $$;

create function public.tob_set_key(p_team uuid, p_status text)
returns void language sql security definer set search_path = public as $$
  update tob_teams set key_status = p_status, seen_at = now() where id = p_team and p_status in ('none', 'ok', 'bad', 'limited');
$$;

create function public.tob_ping(p_team uuid)
returns void language sql security definer set search_path = public as $$
  update tob_teams set seen_at = now() where id = p_team;
$$;

create function public.tob_save_strategy(p_team uuid, p_play text, p_memory text, p_ready boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  ph text;
begin
  select r.phase into ph from tob_rooms r join tob_teams t on t.room_code = r.code where t.id = p_team;
  if ph is null then raise exception 'Team not found.'; end if;
  if ph not in ('strategy', 'break') then raise exception 'Strategy cards are locked right now.'; end if;
  update tob_teams set play = left(coalesce(p_play, ''), 300), memory = left(coalesce(p_memory, ''), 200),
    ready = coalesce(p_ready, false), seen_at = now() where id = p_team;
end $$;

-- ---------- The match state machine (internal) ----------

create function public.tob_activate_slot(p_code text, p_round int, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update tob_matches set stage = 'talk', turn = 1, opens_at = now() + interval '3 seconds', deadline = now() + interval '48 seconds'
    where room_code = p_code and round = p_round and slot = p_slot;
  insert into tob_turns (room_code, match_id, turn)
    select room_code, id, 1 from tob_matches where room_code = p_code and round = p_round and slot = p_slot;
  update tob_rooms set slot = p_slot, updated_at = now() where code = p_code;
end $$;

-- When every match in the current slot is done, start the next slot, or end the round.
create function public.tob_next_slot(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r tob_rooms;
begin
  select * into r from tob_rooms where code = p_code;
  if r.phase <> 'playing' then return; end if;
  if exists (select 1 from tob_matches where room_code = p_code and round = r.round and slot = r.slot and stage <> 'done') then return; end if;
  if r.slot < r.slots then
    perform tob_activate_slot(p_code, r.round, r.slot + 1);
  else
    -- No break clock after the last round: the host reveals the results when ready.
    update tob_rooms set phase = 'break', ends_at = case when r.round >= 3 then null else now() + interval '3 minutes' end, updated_at = now()
      where code = p_code;
  end if;
end $$;

create function public.tob_advance(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m tob_matches;
  t tob_turns;
  pa int;
  pb int;
begin
  select * into m from tob_matches where id = p_match;
  if m.stage in ('waiting', 'done') then return; end if;
  select * into t from tob_turns where match_id = m.id and turn = m.turn;
  if m.stage = 'talk' then
    if t.a_msg is not null and t.b_msg is not null then
      update tob_matches set stage = 'decide', opens_at = now() + interval '2 seconds', deadline = now() + interval '47 seconds' where id = m.id;
    end if;
  elsif m.stage = 'decide' then
    if t.a_choice is not null and t.b_choice is not null then
      pa := case when t.a_choice = 'share' and t.b_choice = 'share' then 3 when t.a_choice = 'steal' and t.b_choice = 'share' then 5
                 when t.a_choice = 'steal' then 1 else 0 end;
      pb := case when t.b_choice = 'share' and t.a_choice = 'share' then 3 when t.b_choice = 'steal' and t.a_choice = 'share' then 5
                 when t.b_choice = 'steal' then 1 else 0 end;
      update tob_turns set a_points = pa, b_points = pb, revealed_at = now() where id = t.id;
      if m.turn < m.length then
        insert into tob_turns (room_code, match_id, turn) values (m.room_code, m.id, m.turn + 1);
        update tob_matches set a_points = a_points + pa, b_points = b_points + pb, turn = turn + 1, stage = 'talk',
          opens_at = now() + interval '6 seconds', deadline = now() + interval '51 seconds' where id = m.id;
      else
        update tob_matches set a_points = a_points + pa, b_points = b_points + pb, stage = 'note',
          opens_at = now(), deadline = now() + interval '45 seconds' where id = m.id;
      end if;
    end if;
  elsif m.stage = 'note' then
    if m.a_noted and m.b_noted then
      update tob_matches set stage = 'done', deadline = null where id = m.id;
      perform tob_next_slot(m.room_code);
    end if;
  end if;
end $$;

-- A team's agent made its move. Every write locks the room row first, so moves in one room apply one at a time.
create function public.tob_submit(p_team uuid, p_match uuid, p_turn int, p_stage text, p_text text, p_choice text, p_thought text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m tob_matches;
  side text;
  other uuid;
  rc text;
begin
  select room_code into rc from tob_matches where id = p_match;
  if rc is null then return; end if;
  perform 1 from tob_rooms where code = rc for update;
  select * into m from tob_matches where id = p_match;
  if m.stage <> p_stage or m.turn <> p_turn then return; end if; -- late or duplicate
  side := case when m.a_team = p_team then 'a' when m.b_team = p_team then 'b' end;
  if side is null then raise exception 'Not your match.'; end if;
  other := case when side = 'a' then m.b_team else m.a_team end;

  if p_stage = 'talk' then
    if side = 'a' then
      update tob_turns set a_msg = left(coalesce(nullif(btrim(p_text), ''), '…'), 160) where match_id = m.id and turn = m.turn and a_msg is null;
    else
      update tob_turns set b_msg = left(coalesce(nullif(btrim(p_text), ''), '…'), 160) where match_id = m.id and turn = m.turn and b_msg is null;
    end if;
  elsif p_stage = 'decide' then
    if p_choice not in ('share', 'steal') then raise exception 'Choice must be share or steal.'; end if;
    if side = 'a' then
      update tob_turns set a_choice = p_choice, a_thought = left(p_thought, 300) where match_id = m.id and turn = m.turn and a_choice is null;
    else
      update tob_turns set b_choice = p_choice, b_thought = left(p_thought, 300) where match_id = m.id and turn = m.turn and b_choice is null;
    end if;
  elsif p_stage = 'note' then
    if nullif(btrim(coalesce(p_text, '')), '') is not null then
      insert into tob_notes (room_code, writer, about, note, round)
      values (m.room_code, p_team, other, left(btrim(p_text), 300), m.round)
      on conflict (writer, about) do update set note = excluded.note, round = excluded.round, updated_at = now();
    end if;
    if side = 'a' then update tob_matches set a_noted = true where id = m.id;
    else update tob_matches set b_noted = true where id = m.id; end if;
  end if;
  update tob_teams set seen_at = now() where id = p_team;
  perform tob_advance(m.id);
end $$;

-- Fill in every move that ran out of time: a silent message, a share, or no note. Safe to call often, from any screen.
create function public.tob_tick(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m tob_matches;
begin
  perform 1 from tob_rooms where code = p_code for update;
  for m in select * from tob_matches where room_code = p_code and stage in ('talk', 'decide', 'note') and deadline < now() loop
    if m.stage = 'talk' then
      update tob_turns set a_auto = a_auto or a_msg is null, a_msg = coalesce(a_msg, '…'),
        b_auto = b_auto or b_msg is null, b_msg = coalesce(b_msg, '…') where match_id = m.id and turn = m.turn;
    elsif m.stage = 'decide' then
      update tob_turns set a_auto = a_auto or a_choice is null, a_choice = coalesce(a_choice, 'share'),
        b_auto = b_auto or b_choice is null, b_choice = coalesce(b_choice, 'share') where match_id = m.id and turn = m.turn;
    else
      update tob_matches set a_noted = true, b_noted = true where id = m.id;
    end if;
    perform tob_advance(m.id);
  end loop;
  perform tob_next_slot(p_code);
end $$;

-- ---------- Host ----------

create function public.tob_check_host(p_code text, p_key uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tob_room_keys where code = p_code and host_key = p_key) then
    raise exception 'Only the host can do that.';
  end if;
end $$;

-- p_schedule: [{ "slot": 1, "a": team id, "b": team id, "length": 4 }, ...] for start_round.
create function public.tob_host(p_code text, p_key uuid, p_action text, p_num int default null, p_team uuid default null, p_schedule jsonb default null)
returns public.tob_rooms language plpgsql security definer set search_path = public as $$
declare
  r tob_rooms;
  n int;
begin
  perform tob_check_host(p_code, p_key);
  select * into r from tob_rooms where code = p_code for update;
  case p_action
    when 'intro' then
      if r.phase not in ('lobby', 'intro', 'strategy') then raise exception 'The game has started.'; end if;
      update tob_rooms set phase = 'intro', slide = 0, ends_at = null, updated_at = now() where code = p_code;
    when 'slide' then
      update tob_rooms set slide = greatest(0, coalesce(p_num, 0)), updated_at = now() where code = p_code;
    when 'strategy' then
      if r.phase not in ('lobby', 'intro') then raise exception 'Can''t open strategy time now.'; end if;
      update tob_rooms set phase = 'strategy', ends_at = now() + make_interval(mins => coalesce(p_num, 6)), updated_at = now()
        where code = p_code;
    when 'start_round' then
      if r.phase not in ('strategy', 'break') or r.round >= 3 then raise exception 'Can''t start a round now.'; end if;
      select count(*) into n from tob_teams where room_code = p_code;
      if n < 2 then raise exception 'You need at least 2 teams.'; end if;
      insert into tob_matches (room_code, round, slot, a_team, b_team, length)
        select p_code, r.round + 1, (s->>'slot')::int, (s->>'a')::uuid, (s->>'b')::uuid, (s->>'length')::int
        from jsonb_array_elements(coalesce(p_schedule, '[]')) s
        where exists (select 1 from tob_teams where id = (s->>'a')::uuid and room_code = p_code)
          and exists (select 1 from tob_teams where id = (s->>'b')::uuid and room_code = p_code);
      select coalesce(max(slot), 0) into n from tob_matches where room_code = p_code and round = r.round + 1;
      if n = 0 then raise exception 'The schedule is empty.'; end if;
      update tob_teams set ready = false where room_code = p_code;
      update tob_rooms set phase = 'playing', round = r.round + 1, slots = n, ends_at = null, updated_at = now() where code = p_code;
      perform tob_activate_slot(p_code, r.round + 1, 1);
    when 'add_time' then
      update tob_rooms set ends_at = greatest(coalesce(ends_at, now()), now()) + make_interval(mins => coalesce(p_num, 1)), updated_at = now()
        where code = p_code;
    when 'skip' then
      -- Stop waiting on slow agents: their missing moves get filled in on the next tick.
      update tob_matches set deadline = now() - interval '1 second', opens_at = now()
        where room_code = p_code and stage in ('talk', 'decide', 'note');
    when 'finish' then
      update tob_matches set stage = 'done', deadline = null where room_code = p_code and stage <> 'done';
      update tob_rooms set phase = 'ended', ends_at = null, updated_at = now() where code = p_code;
    when 'remove_team' then
      if r.phase = 'playing' then raise exception 'Wait for the round to end.'; end if;
      delete from tob_teams where id = p_team and room_code = p_code;
    when 'reset' then
      delete from tob_teams where room_code = p_code;
      update tob_rooms set phase = 'lobby', round = 0, slot = 0, slots = 0, slide = 0, ends_at = null, updated_at = now() where code = p_code;
    else
      raise exception 'Unknown action %', p_action;
  end case;
  select * into r from tob_rooms where code = p_code;
  return r;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'tob_create_room()', 'tob_join(text, text)', 'tob_set_key(uuid, text)', 'tob_ping(uuid)',
    'tob_save_strategy(uuid, text, text, boolean)', 'tob_submit(uuid, uuid, int, text, text, text, text)', 'tob_tick(text)',
    'tob_host(text, uuid, text, int, uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['tob_check_host(text, uuid)', 'tob_activate_slot(text, int, int)', 'tob_next_slot(text)', 'tob_advance(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

alter publication supabase_realtime add table public.tob_rooms, public.tob_teams, public.tob_matches, public.tob_turns, public.tob_notes;
