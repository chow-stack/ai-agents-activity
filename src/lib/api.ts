// Every write goes through a Supabase function that checks the room's phase. See supabase/migrations/.

import type { ScheduledMatch } from "@/game/rules";
import { supabase, type Choice, type KeyStatus, type RoomRow, type Stage, type TeamRow } from "./supabase";

const OFFLINE = "Couldn't reach the server. Check the wifi and try again.";
const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");

export interface Me {
  id: string;
  name: string;
  room: string;
}

export async function findRoom(code: string): Promise<{ room?: RoomRow; error?: string }> {
  if (code.length !== 5) return { error: "Room codes are 5 characters." };
  const { data, error } = await supabase().from("tob_rooms").select("*").eq("code", code).maybeSingle();
  if (error) return { error: OFFLINE };
  if (!data) return { error: "No room with that code. Check the big screen." };
  if ((data as RoomRow).phase === "ended") return { error: "That game has finished." };
  return { room: data as RoomRow };
}

/** `taken` means a team already has this name (it may be the same team on a new laptop). */
export async function joinRoom(room: string, name: string): Promise<{ me?: Me; error?: string; taken?: boolean }> {
  const clean = cleanName(name);
  if (!clean) return { error: "Enter a team name." };
  if (clean.length > 30) return { error: "Keep it under 30 characters." };
  const { data, error } = await supabase().rpc("tob_join", { p_code: room, p_name: clean });
  if (error) {
    if (error.code === "23505") return { error: `A team called “${clean}” already joined.`, taken: true };
    if (/playing|finished/.test(error.message)) return { error: error.message };
    return { error: OFFLINE };
  }
  const t = data as TeamRow;
  return { me: { id: t.id, name: t.name, room } };
}

export async function rejoinRoom(room: string, name: string): Promise<{ me?: Me; error?: string }> {
  const { data, error } = await supabase().from("tob_teams").select("id, name").eq("room_code", room);
  if (error) return { error: OFFLINE };
  const want = cleanName(name).toLowerCase();
  const hit = (data as Pick<TeamRow, "id" | "name">[]).find((t) => t.name.toLowerCase() === want);
  return hit ? { me: { id: hit.id, name: hit.name, room } } : { error: "No team in this room has that exact name." };
}

export async function setKeyStatus(team: string, status: KeyStatus) {
  await supabase().rpc("tob_set_key", { p_team: team, p_status: status });
}

export async function ping(team: string) {
  await supabase().rpc("tob_ping", { p_team: team });
}

export async function saveStrategy(team: string, card: { play: string; guard: string; memory: string }, ready: boolean) {
  const { error } = await supabase().rpc("tob_save_strategy", {
    p_team: team,
    p_play: card.play,
    p_memory: card.memory,
    p_guard: card.guard,
    p_ready: ready,
  });
  return error ? error.message : null;
}

export async function submitMove(
  team: string,
  match: string,
  turn: number,
  stage: Stage,
  move: { text?: string | null; choice?: Choice | null; thought?: string | null; spy?: boolean; offer?: number },
) {
  const { error } = await supabase().rpc("tob_submit", {
    p_team: team,
    p_match: match,
    p_turn: turn,
    p_stage: stage,
    p_text: move.text ?? null,
    p_choice: move.choice ?? null,
    p_thought: move.thought ?? null,
    p_spy: move.spy ?? false,
    p_offer: move.offer ?? 0,
  });
  return error ? error.message : null;
}

export async function tick(code: string) {
  await supabase().rpc("tob_tick", { p_code: code });
}

// ---------- Host ----------

export interface HostKey {
  code: string;
  hostKey: string;
}

export async function createRoom(): Promise<{ host?: HostKey; error?: string }> {
  const { data, error } = await supabase().rpc("tob_create_room");
  if (error || !data?.[0]) return { error: OFFLINE };
  return { host: { code: data[0].code as string, hostKey: data[0].host_key as string } };
}

export type HostAction = "intro" | "slide" | "strategy" | "start_round" | "add_time" | "skip" | "finish" | "remove_team" | "add_bot" | "bot_brain" | "reset";

export async function hostAction(host: HostKey, action: HostAction, opts: { num?: number; team?: string; schedule?: ScheduledMatch[] } = {}): Promise<string | null> {
  const { error } = await supabase().rpc("tob_host", {
    p_code: host.code,
    p_key: host.hostKey,
    p_action: action,
    p_num: opts.num ?? null,
    p_team: opts.team ?? null,
    p_schedule: opts.schedule ?? null,
  });
  return error ? error.message : null;
}
