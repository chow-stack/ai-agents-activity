import { Coins, Lock, Search } from "lucide-react";
import { SPY_COST } from "@/game/rules";
import type { MatchRow, TurnRow } from "@/lib/supabase";
import { ChoiceTag, CHOICE, Typing } from "../ui";

/** One live match on the projector: both teams, the turn being played, and every turn's result so far. */
export function MatchCard({ match, turns, name, compact = false }: { match: MatchRow; turns: TurnRow[]; name: (id: string) => string; compact?: boolean }) {
  const mine = turns.filter((t) => t.match_id === match.id).sort((a, b) => a.turn - b.turn);
  const current = mine.find((t) => t.turn === match.turn);
  const previous = mine.find((t) => t.turn === match.turn - 1);
  // Keep the last reveal up until someone starts talking in the next turn.
  const shown = match.stage === "talk" && current && !current.a_msg && !current.b_msg && previous ? previous : current;
  const over = match.stage === "note" || match.stage === "done";
  const revealed = Boolean(shown?.revealed_at);
  const winner = over ? (match.a_points > match.b_points ? "a" : match.b_points > match.a_points ? "b" : null) : null;
  const text = compact ? "text-[17px]" : "text-[20px]";

  return (
    <div className="card flex min-h-0 flex-col p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4">
        <Side name={name(match.a_team)} points={match.a_points} win={winner === "a"} />
        <div className="pt-2 text-center">
          <div className="text-[13px] font-semibold tracking-[0.08em] text-faint uppercase">{over ? "Final" : `Turn ${shown?.turn ?? match.turn}`}</div>
        </div>
        <Side name={name(match.b_team)} points={match.b_points} win={winner === "b"} right />
      </div>

      <div className="mt-5 grid flex-1 grid-cols-2 gap-4">
        {(["a", "b"] as const).map((s) => {
          const msg = shown?.[`${s}_msg`] ?? null;
          const auto = shown?.[`${s}_auto`] ?? false;
          const choice = shown?.[`${s}_choice`] ?? null;
          const spy = shown?.[`${s}_spy`] ?? false;
          const offer = shown?.[`${s}_offer`] ?? 0;
          return (
            <div key={s} className={`flex flex-col ${s === "b" ? "items-end text-right" : "items-start"}`}>
              <div
                className={`max-w-full rounded-3xl px-5 py-3.5 leading-snug ${text} ${s === "a" ? "rounded-tl-lg bg-cream ring-1 ring-line" : "rounded-tr-lg bg-ink text-paper"}`}
              >
                {msg === null ? <Typing className={s === "a" ? "text-muted" : "text-paper/70"} /> : auto || msg === "…" ? <span className="italic opacity-60">(no answer)</span> : msg}
              </div>
              {msg !== null && (spy || offer > 0) && (
                <div className={`animate-pop mt-2.5 flex flex-wrap gap-2 ${s === "b" ? "justify-end" : ""}`}>
                  {spy && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-sand px-3 py-1 text-[15px] font-semibold text-ink-2">
                      <Search size={15} /> Spied · −{SPY_COST}
                    </span>
                  )}
                  {offer > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn-soft px-3 py-1 text-[15px] font-semibold text-warn">
                      <Coins size={15} /> Offers {offer} if they share
                    </span>
                  )}
                </div>
              )}
              <div className="mt-4 flex h-11 items-center">
                {revealed && choice ? (
                  <ChoiceTag choice={choice} size="lg" auto={auto} />
                ) : match.stage === "decide" && shown === current ? (
                  <span className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[17px] font-semibold ${choice ? "bg-ink text-paper" : "bg-sand text-muted"}`}>
                    <Lock size={17} /> {choice ? "Locked in" : "Choosing…"}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3">
        {Array.from({ length: Math.max(match.turn, 1) }, (_, i) => {
          const t = mine.find((x) => x.turn === i + 1);
          if (!t?.revealed_at) return <span key={i} className="h-6 w-9 rounded-md bg-sand" />;
          return (
            <span key={i} className="flex overflow-hidden rounded-md" title={`Turn ${i + 1}`}>
              <span className={`h-6 w-[18px] ${CHOICE[t.a_choice!].solid}`} />
              <span className={`h-6 w-[18px] ${CHOICE[t.b_choice!].solid}`} />
            </span>
          );
        })}
        {over && <span className="ml-auto text-[14px] font-semibold text-muted">{winner ? `${name(winner === "a" ? match.a_team : match.b_team)} wins` : "Tie"}</span>}
      </div>
    </div>
  );
}

function Side({ name, points, win, right = false }: { name: string; points: number; win: boolean; right?: boolean }) {
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`truncate text-[22px] font-semibold ${win ? "text-crimson" : ""}`}>{name}</div>
      <div className="display text-[46px] leading-none tabular-nums">{points}</div>
    </div>
  );
}
