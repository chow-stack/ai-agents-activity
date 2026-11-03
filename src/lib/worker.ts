"use client";

// While a round plays, the team's laptop watches its current match. Whenever it's this team's move (and the room has
// had a moment to read the last reveal), it asks Gemini on the team's key and submits the answer.
// The host's laptop runs the same hook for each test team when "bots that listen" is on.

import { useEffect, useRef, useState } from "react";
import { agentDecide, agentNote, agentTalk, GeminiError, type AgentContext } from "@/game/agent";
import { asMine, opponentOf, sideOf, spyReport } from "@/game/rules";
import { setKeyStatus, submitMove, type Me } from "./api";
import type { RoomData } from "./live";
import type { MatchRow, RoomRow } from "./supabase";

export type AgentState = { kind: "idle" } | { kind: "thinking"; stage: "talk" | "decide" | "note" } | { kind: "error"; message: string; keyBroken: boolean };

/** The match this team is playing right now, if any (a team sits out one slot per round when the team count is odd). */
export function currentMatch(room: RoomRow | null, matches: MatchRow[], teamId: string) {
  if (!room || room.phase !== "playing") return null;
  return matches.find((m) => m.round === room.round && m.slot === room.slot && sideOf(m, teamId)) ?? null;
}

export function useTeamAgent(me: Me, room: RoomRow | null, data: RoomData, apiKey: string | null, now: number) {
  const [state, setState] = useState<AgentState>({ kind: "idle" });
  const tried = useRef(new Map<string, number>()); // move key → when we last tried it
  const busy = useRef(false);
  const [wake, setWake] = useState(0);

  const match = currentMatch(room, data.matches, me.id);

  // Wake up right when the move opens. A one-off timer set from a data update isn't slowed down much in a
  // background tab, unlike the once-a-second clock.
  const opensAt = match?.opens_at ? Date.parse(match.opens_at) : 0;
  useEffect(() => {
    const wait = opensAt - Date.now();
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWake((n) => n + 1), wait + 50);
    return () => window.clearTimeout(id);
  }, [opensAt]);

  useEffect(() => {
    const t = Date.now();
    if (!match || !apiKey || busy.current || !now) return;
    if (match.opens_at && Date.parse(match.opens_at) > t) return;
    const side = sideOf(match, me.id)!;
    const turns = data.turns.filter((x) => x.match_id === match.id);
    const current = turns.find((x) => x.turn === match.turn);
    const stage = match.stage;
    const pending =
      (stage === "talk" && current && current[`${side}_msg`] === null) ||
      (stage === "decide" && current && current[`${side}_choice`] === null) ||
      (stage === "note" && !match[`${side}_noted`]);
    if (!pending || (stage !== "talk" && stage !== "decide" && stage !== "note")) return;

    const moveKey = `${match.id}:${match.turn}:${stage}`;
    const lastTry = tried.current.get(moveKey);
    if (lastTry && t - lastTry < 8000) return; // wait a bit before retrying a failed move
    tried.current.set(moveKey, t);

    const team = data.teams.find((x) => x.id === me.id);
    const oppId = opponentOf(match, me.id);
    const spied = turns.some((x) => x[`${side}_spy`]);
    const ctx: AgentContext = {
      me: me.name,
      opponent: data.teams.find((t) => t.id === oppId)?.name ?? "the other team",
      play: team?.play ?? "",
      guard: team?.guard ?? "",
      memory: team?.memory ?? "",
      note: data.notes.find((n) => n.writer === me.id && n.about === oppId)?.note ?? null,
      history: turns.filter((x) => x.revealed_at).map((x) => asMine(x, side)),
      turn: match.turn,
      spied,
      spyReport: spied ? spyReport(oppId, match.id, data.teams, data.matches, data.turns) : null,
    };

    busy.current = true;
    setState({ kind: "thinking", stage });
    (async () => {
      try {
        if (stage === "talk") {
          const out = await agentTalk(apiKey, ctx);
          await submitMove(me.id, match.id, match.turn, stage, { text: out.message, spy: out.spy, offer: out.offer });
        } else if (stage === "decide") {
          const out = await agentDecide(apiKey, ctx, asMine(current!, side));
          await submitMove(me.id, match.id, match.turn, stage, { choice: out.choice, thought: out.thought });
        } else {
          const note = await agentNote(apiKey, ctx);
          await submitMove(me.id, match.id, match.turn, stage, { text: note });
        }
        setState({ kind: "idle" });
        if (team && team.key_status !== "ok") await setKeyStatus(me.id, "ok");
      } catch (e) {
        const err = e as GeminiError;
        if (err.kind === "key") {
          await setKeyStatus(me.id, "bad");
          setState({ kind: "error", message: err.message, keyBroken: true });
        } else {
          if (err.kind === "limit") await setKeyStatus(me.id, "limited");
          setState({ kind: "error", message: `${err.message} Retrying…`, keyBroken: false });
        }
      } finally {
        busy.current = false;
      }
    })();
  }, [match, apiKey, now, wake, data, me]);

  return { state, match };
}
