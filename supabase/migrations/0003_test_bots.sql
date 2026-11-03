-- Test teams for rehearsing alone. A bot team has no laptop: the database plays its moves with a fixed style
-- whenever any open screen calls tob_tick, so the host can fill a room and play against it from one computer.

alter table public.tob_teams add column bot text check (bot in ('nice', 'copycat', 'sneaky', 'coin'));

-- One move for every bot whose turn it is. Called from tob_tick, which already holds the room lock.
create function public.tob_bot_moves(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m tob_matches;
  t tob_turns;
  bot tob_teams;
  side text;
  prev text; -- the opponent's choice last turn
  stole int;
  choice text;
  lines text[];
begin
  for m in select * from tob_matches where room_code = p_code and stage in ('talk', 'decide', 'note') and opens_at <= now() loop
    foreach side in array array['a', 'b'] loop
      select * into bot from tob_teams where id = case when side = 'a' then m.a_team else m.b_team end;
      continue when bot.bot is null;
      select * into t from tob_turns where match_id = m.id and turn = m.turn;

      if m.stage = 'talk' and (case when side = 'a' then t.a_msg else t.b_msg end) is null then
        lines := case bot.bot
          when 'nice' then array['Let''s both share. Easy points for everyone.', 'I always share. You can count on me.', 'Sharing again. Join me?']
          when 'copycat' then array['I do whatever you did last turn.', 'Share with me and I''ll share back.', 'Fair is fair. Your move decides mine.']
          when 'sneaky' then array['Trust me, I''m sharing. Promise.', 'We''re partners, right? Let''s both share.', 'Deal. Sharing all the way.']
          else array['I flip a coin. Good luck.', 'Heads I share, tails I steal.', 'Even I don''t know what I''ll pick.']
        end;
        perform tob_submit(bot.id, m.id, m.turn, 'talk', lines[1 + floor(random() * array_length(lines, 1))::int], null, null);

      elsif m.stage = 'decide' and (case when side = 'a' then t.a_choice else t.b_choice end) is null then
        select case when side = 'a' then b_choice else a_choice end into prev from tob_turns where match_id = m.id and turn = m.turn - 1;
        choice := case bot.bot
          when 'nice' then 'share'
          when 'copycat' then coalesce(prev, 'share')
          when 'sneaky' then case when m.turn >= 3 then 'steal' else 'share' end
          else case when random() < 0.5 then 'share' else 'steal' end
        end;
        perform tob_submit(bot.id, m.id, m.turn, 'decide', null, choice,
          case bot.bot when 'nice' then 'Always share.' when 'copycat' then 'Copy their last move.'
            when 'sneaky' then 'Build trust, then steal from turn 3.' else 'Coin flip.' end);

      elsif m.stage = 'note' and not (case when side = 'a' then m.a_noted else m.b_noted end) then
        select count(*) into stole from tob_turns where match_id = m.id and (case when side = 'a' then b_choice else a_choice end) = 'steal';
        perform tob_submit(bot.id, m.id, m.turn, 'note',
          case when stole > 0 then format('Stole from me %s time(s).', stole) else 'Shared every turn.' end, null, null);
      end if;
      select * into m from tob_matches where id = m.id; -- the first side's move may have moved the stage on
      exit when m.stage not in ('talk', 'decide', 'note') or m.opens_at > now();
    end loop;
  end loop;
end $$;

-- Same as before, plus bot moves first.
create or replace function public.tob_tick(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m tob_matches;
begin
  perform 1 from tob_rooms where code = p_code for update;
  perform tob_bot_moves(p_code);
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
  update tob_teams set seen_at = now() where room_code = p_code and bot is not null;
end $$;

-- Host actions, plus add_bot (p_num picks nothing; styles take turns: nice, copycat, sneaky, coin).
create or replace function public.tob_host(p_code text, p_key uuid, p_action text, p_num int default null, p_team uuid default null, p_schedule jsonb default null)
returns public.tob_rooms language plpgsql security definer set search_path = public as $$
declare
  r tob_rooms;
  n int;
  style text;
  label text;
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
      update tob_teams set ready = (bot is not null) where room_code = p_code;
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
    when 'add_bot' then
      if r.phase in ('playing', 'ended') then raise exception 'Add test teams between rounds.'; end if;
      select count(*) into n from tob_teams where room_code = p_code and bot is not null;
      loop -- skip names already in the room (a removed bot frees its slot in the count)
        label := (array['Nice Bot', 'Copycat Bot', 'Sneaky Bot', 'Coin Bot'])[1 + n % 4] || case when n >= 4 then ' ' || (n / 4 + 1) else '' end;
        exit when not exists (select 1 from tob_teams where room_code = p_code and lower(name) = lower(label));
        n := n + 1;
      end loop;
      style := (array['nice', 'copycat', 'sneaky', 'coin'])[1 + n % 4];
      insert into tob_teams (room_code, name, seq, key_status, play, memory, ready, bot)
      values (p_code, label, coalesce((select max(seq) from tob_teams where room_code = p_code), 0) + 1, 'ok',
        case style when 'nice' then 'Always share.' when 'copycat' then 'Share first, then copy what they did last turn.'
          when 'sneaky' then 'Promise to share, share twice, then steal every turn.' else 'Flip a coin every turn.' end,
        'Write down how many times they stole.', true, style);
    when 'reset' then
      delete from tob_teams where room_code = p_code;
      update tob_rooms set phase = 'lobby', round = 0, slot = 0, slots = 0, slide = 0, ends_at = null, updated_at = now() where code = p_code;
    else
      raise exception 'Unknown action %', p_action;
  end case;
  select * into r from tob_rooms where code = p_code;
  return r;
end $$;

revoke execute on function public.tob_bot_moves(text) from public, anon, authenticated;
