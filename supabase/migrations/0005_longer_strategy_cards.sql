-- Longer strategy cards: 1000 characters for how the agent plays, 500 each for guardrails and memory.

alter table public.tob_teams drop constraint tob_teams_play_check, add constraint tob_teams_play_check check (char_length(play) <= 1000);
alter table public.tob_teams drop constraint tob_teams_guard_check, add constraint tob_teams_guard_check check (char_length(guard) <= 500);
alter table public.tob_teams drop constraint tob_teams_memory_check, add constraint tob_teams_memory_check check (char_length(memory) <= 500);

create or replace function public.tob_save_strategy(p_team uuid, p_play text, p_memory text, p_guard text, p_ready boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  ph text;
begin
  select r.phase into ph from tob_rooms r join tob_teams t on t.room_code = r.code where t.id = p_team;
  if ph is null then raise exception 'Team not found.'; end if;
  if ph not in ('strategy', 'break') then raise exception 'Strategy cards are locked right now.'; end if;
  update tob_teams set play = left(coalesce(p_play, ''), 1000), memory = left(coalesce(p_memory, ''), 500),
    guard = left(coalesce(p_guard, ''), 500), ready = coalesce(p_ready, false), seen_at = now() where id = p_team;
end $$;
