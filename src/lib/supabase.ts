import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// NEXT_PUBLIC_* values are inlined at build time, so they must be set in Vercel before the build runs.
export const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars are missing.");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

/** lobby → intro (slideshow) → strategy → playing (round 1) → break → playing (round 2) → break → playing (round 3) → break → ended */
export type Phase = "lobby" | "intro" | "strategy" | "playing" | "break" | "ended";

export interface RoomRow {
  code: string;
  phase: Phase;
  round: number;
  slot: number;
  slots: number;
  slide: number;
  ends_at: string | null;
  /** The host's laptop plays the test teams with Gemini, so they read messages. */
  bot_brain: boolean;
}

export type KeyStatus = "none" | "ok" | "bad" | "limited";

export interface TeamRow {
  id: string;
  room_code: string;
  name: string;
  seq: number;
  key_status: KeyStatus;
  play: string;
  memory: string;
  guard: string;
  ready: boolean;
  seen_at: string;
  /** Set for a test team: nice, copycat, sneaky or tough. Played by the host's laptop or, as a fallback, the database. */
  bot: string | null;
}

export type Stage = "waiting" | "talk" | "decide" | "note" | "done";
export type Choice = "share" | "steal";

export interface MatchRow {
  id: string;
  room_code: string;
  round: number;
  slot: number;
  a_team: string;
  b_team: string;
  length: number;
  turn: number;
  stage: Stage;
  opens_at: string | null;
  deadline: string | null;
  a_points: number;
  b_points: number;
  a_noted: boolean;
  b_noted: boolean;
}

export interface TurnRow {
  id: string;
  room_code: string;
  match_id: string;
  turn: number;
  a_msg: string | null;
  b_msg: string | null;
  a_choice: Choice | null;
  b_choice: Choice | null;
  a_thought: string | null;
  b_thought: string | null;
  a_auto: boolean;
  b_auto: boolean;
  /** Used the Spy tool this turn (costs 1 point). */
  a_spy: boolean;
  b_spy: boolean;
  /** Points offered to the other side if it shares this turn (0–2). */
  a_offer: number;
  b_offer: number;
  /** Net points for the turn: the payoff, minus spying, plus or minus payments. */
  a_points: number | null;
  b_points: number | null;
  revealed_at: string | null;
}

export interface NoteRow {
  room_code: string;
  writer: string;
  about: string;
  note: string;
  round: number;
  updated_at: string;
}

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
