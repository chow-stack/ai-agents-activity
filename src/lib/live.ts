"use client";

import { useEffect, useRef, useState } from "react";
import { tick } from "./api";
import { supabase, type MatchRow, type NoteRow, type RoomRow, type TeamRow, type TurnRow } from "./supabase";

/** Live state of one room. `offline` is true when Supabase can't be reached; `missing` when the code doesn't exist. */
export function useRoom(code: string | null) {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [offline, setOffline] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!code) return;
    const db = supabase();
    let alive = true;
    const fetchIt = async () => {
      const { data, error } = await db.from("tob_rooms").select("*").eq("code", code).maybeSingle();
      if (!alive) return;
      if (error) return setOffline(true);
      setOffline(false);
      setMissing(!data);
      if (data) setRoom(data as RoomRow);
    };
    fetchIt();
    const ch = db
      .channel(`tob-room-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tob_rooms", filter: `code=eq.${code}` }, (p) => {
        const row = p.new as RoomRow;
        if (row?.phase) setRoom(row);
      })
      .subscribe();
    // Safety net in case a realtime event is missed.
    const poll = window.setInterval(fetchIt, 8000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      db.removeChannel(ch);
    };
  }, [code]);

  return { room, offline, missing };
}

export interface RoomData {
  teams: TeamRow[];
  matches: MatchRow[];
  turns: TurnRow[];
  notes: NoteRow[];
  loaded: boolean;
}

const EMPTY: RoomData = { teams: [], matches: [], turns: [], notes: [], loaded: false };

/** Teams, matches, turns and notes in one room, kept live. Bursts of changes are batched into one refetch. */
export function useRoomData(code: string | null) {
  const [data, setData] = useState<RoomData>(EMPTY);

  useEffect(() => {
    if (!code) return;
    const db = supabase();
    let alive = true;
    let queued: number | null = null;
    const refresh = async () => {
      queued = null;
      const [t, m, u, n] = await Promise.all([
        db.from("tob_teams").select("*").eq("room_code", code).order("seq"),
        db.from("tob_matches").select("*").eq("room_code", code).order("round").order("slot"),
        db.from("tob_turns").select("*").eq("room_code", code).order("turn"),
        db.from("tob_notes").select("*").eq("room_code", code),
      ]);
      if (!alive) return;
      const ok = !t.error && !m.error && !u.error && !n.error;
      setData((prev) => ({
        loaded: prev.loaded || ok,
        teams: (t.data as TeamRow[]) ?? prev.teams,
        matches: (m.data as MatchRow[]) ?? prev.matches,
        turns: (u.data as TurnRow[]) ?? prev.turns,
        notes: (n.data as NoteRow[]) ?? prev.notes,
      }));
    };
    const soon = () => {
      if (queued === null) queued = window.setTimeout(refresh, 150);
    };
    refresh();
    const filter = `room_code=eq.${code}`;
    const ch = db
      .channel(`tob-data-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tob_teams", filter }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "tob_matches", filter }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "tob_turns", filter }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "tob_notes", filter }, soon)
      .subscribe();
    const poll = window.setInterval(refresh, 6000);
    return () => {
      alive = false;
      if (queued !== null) window.clearTimeout(queued);
      window.clearInterval(poll);
      db.removeChannel(ch);
    };
  }, [code]);

  return data;
}

/** Re-renders every second; returns ms since epoch, or 0 before mount (prerender has no clock). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tickIt = () => setNow(Date.now());
    const first = window.setTimeout(tickIt, 0);
    const id = window.setInterval(tickIt, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

/**
 * While a round plays, fill in moves that ran out of time. Any open screen can do this (the board, the host, team
 * laptops); the database makes it safe to run from several places at once.
 */
export function useTicker(room: RoomRow | null, data: Pick<RoomData, "matches" | "teams">, now: number) {
  const last = useRef(0);
  const { matches, teams } = data;
  useEffect(() => {
    if (!room || room.phase !== "playing" || !now || now - last.current < 2500) return;
    const live = matches.filter((m) => m.round === room.round && m.slot === room.slot);
    const overdue = live.some((m) => m.stage !== "done" && m.stage !== "waiting" && m.deadline && Date.parse(m.deadline) < now);
    const stuck = live.length > 0 && live.every((m) => m.stage === "done");
    // Test teams have no laptop: the database plays their move when a tick arrives.
    const bots = new Set(teams.filter((t) => t.bot).map((t) => t.id));
    const botTurn = live.some(
      (m) => (bots.has(m.a_team) || bots.has(m.b_team)) && m.stage !== "done" && m.stage !== "waiting" && m.opens_at && Date.parse(m.opens_at) <= now,
    );
    if (overdue || stuck || botTurn) {
      last.current = now;
      tick(room.code);
    }
  }, [room, matches, teams, now]);
}

export function secondsLeft(room: RoomRow | null, now: number): number | null {
  if (!room?.ends_at || !now) return null;
  return Math.max(0, Math.round((Date.parse(room.ends_at) - now) / 1000));
}

export function formatClock(s: number | null): string {
  if (s === null) return "--:--";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
