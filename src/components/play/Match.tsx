"use client";

import { Coffee, KeyRound, NotebookPen, ShieldCheck, Target } from "lucide-react";
import { asMine, opponentOf, sideOf } from "@/game/rules";
import type { Me } from "@/lib/api";
import type { RoomData } from "@/lib/live";
import type { AgentState } from "@/lib/worker";
import type { MatchRow, RoomRow, TeamRow } from "@/lib/supabase";
import { Transcript } from "../Transcript";
import { Button, Typing } from "../ui";

/** The team laptop while a round plays: its agent's current match, live. */
export function Match({
  me,
  team,
  room,
  data,
  match,
  agent,
  onFixKey,
}: {
  me: Me;
  team: TeamRow;
  room: RoomRow;
  data: RoomData;
  match: MatchRow | null;
  agent: AgentState;
  onFixKey: () => void;
}) {
  const label = `Round ${room.round} · Match ${room.slot} of ${room.slots}`;

  if (!match) {
    return (
      <div className="grid flex-1 place-items-center px-6 pb-16">
        <div className="card max-w-md p-10 text-center">
          <Coffee size={34} className="mx-auto text-muted" />
          <div className="eyebrow mt-4">{label}</div>
          <h1 className="display mt-1.5 text-[30px]">You sit out this match</h1>
          <p className="mt-2 text-[15px] text-muted">With an odd number of teams, one team rests each match. Watch the big screen.</p>
        </div>
      </div>
    );
  }

  const side = sideOf(match, me.id)!;
  const oppId = opponentOf(match, me.id);
  const opponent = data.teams.find((t) => t.id === oppId)?.name ?? "Opponent";
  const turns = data.turns
    .filter((t) => t.match_id === match.id)
    .sort((a, b) => a.turn - b.turn)
    .map((t) => asMine(t, side));
  const us = side === "a" ? match.a_points : match.b_points;
  const them = side === "a" ? match.b_points : match.a_points;
  const note = data.notes.find((n) => n.writer === me.id && n.about === oppId);
  const waiting = match.stage === "talk" || match.stage === "decide" ? match.stage : null;
  const now = turns.find((t) => t.turn === match.turn);
  const talked = { me: now?.mine != null, them: now?.theirs != null };
  const chose = { me: now?.myChoice != null, them: now?.theirChoice != null };
  const status =
    match.stage === "talk"
      ? talked.me && !talked.them
        ? `Waiting for ${opponent}'s message`
        : !talked.me && talked.them
          ? "Your agent is writing its message"
          : "Both agents are writing a message"
      : match.stage === "decide"
        ? chose.me && !chose.them
          ? `Your agent locked in. Waiting for ${opponent}`
          : !chose.me && chose.them
            ? `${opponent} locked in. Your agent is choosing`
            : "Both agents are choosing: share or steal?"
        : match.stage === "note"
          ? "Match over. Agents are writing in their notebooks"
          : "Match over";

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_340px] gap-6 px-8 py-8">
      <div className="min-w-0">
        <section className="card flex items-center gap-6 px-7 py-5">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{label}</div>
            <div className="mt-1 flex items-center gap-2 text-[14px] text-muted">
              {match.stage !== "done" && <Typing className="text-crimson" />}
              {status}
            </div>
          </div>
          <Score name={team.name} points={us} you />
          <span className="text-[15px] font-semibold text-faint">vs</span>
          <Score name={opponent} points={them} />
        </section>

        {agent.kind === "error" && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-crimson-soft px-5 py-3 text-[14px] text-crimson">
            <span>{agent.keyBroken ? "Your Gemini key stopped working. Until it's fixed, your agent shares and says nothing." : agent.message}</span>
            {agent.keyBroken && (
              <Button size="sm" onClick={onFixKey}>
                <KeyRound size={14} /> Fix key
              </Button>
            )}
          </div>
        )}

        <div className="mt-6">
          <Transcript turns={turns} opponent={opponent} waiting={waiting} />
          {match.stage === "note" && (
            <p className="mt-6 text-center text-[14px] text-muted">
              Final: <b className="text-ink">{us}</b> to <b className="text-ink">{them}</b>
            </p>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <section className="card p-5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            <NotebookPen size={13} /> What your agent remembers about {opponent}
          </div>
          <p className="mt-2 text-[14px] leading-snug">
            {note ? `“${note.note}”` : <span className="text-muted">Nothing. {team.memory.trim() ? "This is their first match." : "Your memory box is blank."}</span>}
          </p>
        </section>
        <section className="card p-5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
            <Target size={13} /> Your strategy card
          </div>
          <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{team.play || <span className="text-muted">Blank</span>}</p>
          {team.guard.trim() && (
            <p className="mt-2 flex gap-1.5 text-[13px] leading-snug text-ink-2">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-muted" /> {team.guard}
            </p>
          )}
          <p className="mt-2 text-[12px] text-faint">Locked while the round plays. You can change it at the break.</p>
        </section>
        <p className="px-1 text-[12px] leading-snug text-muted">Keep this tab open and in front. Your agent plays from this laptop, so switching tabs can make it miss moves.</p>
      </aside>
    </div>
  );
}

function Score({ name, points, you = false }: { name: string; points: number; you?: boolean }) {
  return (
    <div className={`text-center ${you ? "" : ""}`}>
      <div className={`display text-[34px] leading-none tabular-nums ${you ? "text-ink" : "text-ink-2"}`}>{points}</div>
      <div className="mt-1 max-w-[140px] truncate text-[12.5px] font-semibold text-muted">{you ? `${name} (you)` : name}</div>
    </div>
  );
}
