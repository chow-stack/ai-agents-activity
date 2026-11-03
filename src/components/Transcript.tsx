import { Coins, Lock, Search } from "lucide-react";
import type { MyTurn } from "@/game/rules";
import { SPY_COST } from "@/game/rules";
import { ChoiceTag, Typing } from "./ui";

const said = (msg: string | null, auto: boolean) => (auto || msg === "…" ? null : msg);

/**
 * A match from one team's side, like a chat: the opponent on the left, your agent on the right.
 * `waiting` marks what the current turn is still waiting on, so the right spot shows a typing indicator.
 */
export function Transcript({ turns, opponent, waiting }: { turns: MyTurn[]; opponent: string; waiting?: "talk" | "decide" | null }) {
  return (
    <ol className="space-y-5">
      {turns.map((t, i) => {
        const last = i === turns.length - 1;
        const revealed = t.myChoice !== null && t.theirChoice !== null && t.myPoints !== null;
        return (
          <li key={t.turn} className="animate-rise">
            <div className="mb-2 flex items-center gap-3 text-[11.5px] font-semibold tracking-[0.08em] text-faint uppercase">
              <span className="h-px flex-1 bg-line" />
              Turn {t.turn}
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Side
                who={opponent}
                msg={said(t.theirs, t.theirAuto)}
                typing={last && waiting === "talk" && t.theirs === null}
                choice={revealed ? t.theirChoice : null}
                locked={last && waiting === "decide"}
                points={revealed ? t.theirPoints : null}
                auto={t.theirAuto}
                spy={t.theirSpy}
                offer={t.theirOffer}
              />
              <Side
                who="Your agent"
                mine
                msg={said(t.mine, t.myAuto)}
                typing={last && waiting === "talk" && t.mine === null}
                choice={revealed ? t.myChoice : null}
                locked={last && waiting === "decide"}
                points={revealed ? t.myPoints : null}
                auto={t.myAuto}
                spy={t.mySpy}
                offer={t.myOffer}
                thought={t.thought}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Side({
  who,
  mine = false,
  msg,
  typing,
  choice,
  locked,
  points,
  auto,
  spy,
  offer,
  thought,
}: {
  who: string;
  mine?: boolean;
  msg: string | null;
  typing: boolean;
  choice: MyTurn["myChoice"];
  locked: boolean;
  points: number | null;
  auto: boolean;
  spy: boolean;
  offer: number;
  thought?: string | null;
}) {
  return (
    <div className={`flex flex-col ${mine ? "items-end text-right" : "items-start"}`}>
      <div className="mb-1 text-[11.5px] font-semibold text-muted">{who}</div>
      <div
        className={`max-w-full rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${
          mine ? "rounded-tr-md bg-ink text-paper" : "rounded-tl-md bg-paper text-ink ring-1 ring-line"
        }`}
      >
        {typing ? <Typing className={mine ? "text-paper/70" : "text-muted"} /> : (msg ?? <span className="italic opacity-60">{auto ? "(no answer in time)" : "(said nothing)"}</span>)}
      </div>
      {(spy || offer > 0) && (
        <div className={`mt-1.5 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
          {spy && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sand px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">
              <Search size={11} /> Spied · −{SPY_COST}
            </span>
          )}
          {offer > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-warn-soft px-2 py-0.5 text-[11.5px] font-semibold text-warn">
              <Coins size={11} /> {mine ? `Offered ${offer} if they share` : `Offers ${offer} if you share`}
            </span>
          )}
        </div>
      )}
      <div className="mt-2 flex h-7 items-center gap-2">
        {choice ? (
          <>
            {mine && points !== null && <Points n={points} />}
            <ChoiceTag choice={choice} size="sm" auto={auto} />
            {!mine && points !== null && <Points n={points} />}
          </>
        ) : locked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-sand px-2 py-0.5 text-[11.5px] font-semibold text-muted">
            <Lock size={11} /> Choosing…
          </span>
        ) : null}
      </div>
      {mine && thought && <p className="mt-1 max-w-[95%] text-[12px] leading-snug text-muted italic">“{thought}”</p>}
    </div>
  );
}

const Points = ({ n }: { n: number }) => (
  <span className={`text-[13px] font-bold tabular-nums ${n >= 3 ? "text-share" : n < 0 ? "text-crimson" : n === 0 ? "text-faint" : "text-ink-2"}`}>
    {n < 0 ? `−${-n}` : `+${n}`}
  </span>
);
