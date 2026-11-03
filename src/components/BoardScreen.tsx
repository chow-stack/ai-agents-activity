"use client";

import { ArrowRight, Check, ChevronLeft, ChevronRight, HeartCrack, KeyRound, Swords, Trophy } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { awards, bestBackstab, ROUNDS, standings, type Award, type TeamStats } from "@/game/rules";
import { hostAction, type HostKey } from "@/lib/api";
import { formatClock, secondsLeft, useNow, useRoom, useRoomData, useTicker, type RoomData } from "@/lib/live";
import { KEYS, load } from "@/lib/storage";
import { normalizeCode, type RoomRow } from "@/lib/supabase";
import { MatchCard } from "./board/MatchCard";
import { SLIDES } from "./board/Slides";
import { Button, CHOICE, Logo } from "./ui";

const useHost = () =>
  useSyncExternalStore(
    () => () => {},
    () => window.location.host,
    () => "",
  );

/** Projector view for one room: `/board?room=CODE`. Falls back to the room this laptop hosts. */
export function BoardScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const fromUrl = normalizeCode(params.get("room") ?? "");
  const [code, setCode] = useState<string | null>(fromUrl || null);

  useEffect(() => {
    if (fromUrl) return;
    const hosted = load<HostKey | null>(KEYS.host, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hosted?.code) setCode(hosted.code);
  }, [fromUrl]);

  if (!code) return <PickRoom onPick={(c) => router.replace(`/board?room=${c}`)} />;
  return <Board code={code} />;
}

function PickRoom({ onPick }: { onPick: (code: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="grid min-h-screen place-items-center p-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.length === 5) onPick(value);
        }}
        className="card w-full max-w-sm p-9 text-center"
      >
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="display mt-6 text-[30px]">Which room?</h1>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(normalizeCode(e.target.value))}
          placeholder="CODE"
          className="mt-5 w-full rounded-2xl bg-cream py-3 text-center font-mono text-[30px] font-semibold tracking-[0.35em] uppercase ring-1 ring-line outline-none focus:ring-2 focus:ring-ink"
        />
        <Button size="lg" disabled={value.length !== 5} className="mt-4 w-full">
          Show board <ArrowRight size={17} />
        </Button>
      </form>
    </div>
  );
}

function Board({ code }: { code: string }) {
  const { room } = useRoom(code);
  const data = useRoomData(code);
  const now = useNow();
  const host = useHost();
  useTicker(room, data, now);

  // If this laptop hosts the room, the arrow keys drive the slides.
  const hostKey = useSyncExternalStore(
    () => () => {},
    () => {
      const h = load<HostKey | null>(KEYS.host, null);
      return h?.code === code ? JSON.stringify(h) : "";
    },
    () => "",
  );

  if (!room) return null;
  const left = secondsLeft(room, now);

  if (room.phase === "intro") return <Slideshow room={room} hostKey={hostKey ? (JSON.parse(hostKey) as HostKey) : null} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden px-12 py-8">
      <header className="flex shrink-0 items-center gap-6">
        <Logo size="lg" />
        {room.phase !== "lobby" && room.phase !== "ended" && (
          <span className="rounded-full bg-paper px-4 py-1.5 text-[17px] text-ink-2 ring-1 ring-line">
            {host} · <b className="font-mono tracking-wider text-ink">{code}</b>
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">
          {room.phase === "playing" && (
            <span className="rounded-full bg-crimson px-5 py-2 text-[18px] font-semibold text-paper">
              Round {room.round} of {ROUNDS} · Match {room.slot} of {room.slots}
            </span>
          )}
          {left !== null && <span className="display text-[48px] leading-none tabular-nums">{formatClock(left)}</span>}
        </div>
      </header>

      <main className="mt-8 flex min-h-0 flex-1 flex-col">
        {room.phase === "lobby" && <Lobby code={code} host={host} data={data} />}
        {room.phase === "strategy" && <Writing data={data} title="Strategy time" sub="Write your strategy card on your team's laptop." />}
        {room.phase === "playing" && <Playing room={room} data={data} />}
        {room.phase === "break" && <Break room={room} data={data} />}
        {room.phase === "ended" && <Final data={data} />}
      </main>
    </div>
  );
}

function Lobby({ code, host, data }: { code: string; host: string; data: RoomData }) {
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-16">
      <div>
        <h1 className="display text-[80px] leading-[0.95]">
          Trust <span className="text-crimson">or</span> Betray
        </h1>
        <p className="mt-4 text-[26px] text-ink-2">One laptop per team. Join now:</p>
        <ol className="mt-8 space-y-4 text-[24px]">
          <li className="flex items-center gap-4">
            <span className="grid size-10 place-items-center rounded-full bg-ink text-[18px] font-semibold text-paper">1</span>
            Go to <b className="font-mono">{host}</b>
          </li>
          <li className="flex items-center gap-4">
            <span className="grid size-10 place-items-center rounded-full bg-ink text-[18px] font-semibold text-paper">2</span>
            Enter the code and name your team
          </li>
          <li className="flex items-center gap-4">
            <span className="grid size-10 place-items-center rounded-full bg-ink text-[18px] font-semibold text-paper">3</span>
            Paste your Gemini key
          </li>
        </ol>
        <div className="mt-10 flex gap-3">
          {code.split("").map((c, i) => (
            <span key={i} className="card grid h-[120px] w-[96px] place-items-center font-mono text-[72px] font-semibold">
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="card flex h-full max-h-[560px] flex-col p-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px] font-semibold">Teams</h2>
          <span className="text-[18px] text-muted tabular-nums">{data.teams.length} joined</span>
        </div>
        <ul className="mt-5 grid grid-cols-2 content-start gap-3">
          {data.teams.map((t) => (
            <li key={t.id} className="animate-pop flex items-center gap-3 rounded-2xl bg-cream px-5 py-4 ring-1 ring-line">
              <span className="truncate text-[22px] font-semibold">{t.name}</span>
              <KeyRound size={18} className={`ml-auto shrink-0 ${t.key_status === "ok" || t.key_status === "limited" ? "text-share" : "text-line-strong"}`} />
            </li>
          ))}
        </ul>
        {data.teams.length === 0 && <p className="m-auto text-[20px] text-muted">Waiting for the first team…</p>}
      </div>
    </div>
  );
}

function Slideshow({ room, hostKey }: { room: RoomRow; hostKey: HostKey | null }) {
  const index = Math.min(room.slide, SLIDES.length - 1);
  const Body = SLIDES[index].body;
  const go = useCallback(
    (to: number) => {
      if (!hostKey) return;
      if (to >= SLIDES.length) hostAction(hostKey, "strategy", { num: 6 });
      else if (to >= 0) hostAction(hostKey, "slide", { num: to });
    },
    [hostKey],
  );

  useEffect(() => {
    if (!hostKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") go(index + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, hostKey]);

  return (
    <div className="flex h-screen flex-col overflow-hidden px-16 py-10">
      <header className="flex shrink-0 items-center">
        <Logo size="lg" />
        <span className="ml-auto text-[16px] font-medium text-muted tabular-nums">
          {index + 1} / {SLIDES.length}
        </span>
      </header>
      <main key={index} className="animate-rise min-h-0 flex-1 py-6">
        <Body />
      </main>
      <footer className="flex shrink-0 items-center gap-4">
        <div className="flex gap-2">
          {SLIDES.map((s, i) => (
            <span key={s.title} className={`h-2 rounded-full transition-all ${i === index ? "w-10 bg-crimson" : i < index ? "w-2 bg-ink-2" : "w-2 bg-line-strong"}`} />
          ))}
        </div>
        {hostKey && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => go(index - 1)} disabled={index === 0} className="grid size-11 place-items-center rounded-full bg-paper ring-1 ring-line disabled:opacity-30" aria-label="Previous slide">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => go(index + 1)} className="flex h-11 items-center gap-2 rounded-full bg-crimson px-5 text-[15px] font-semibold text-paper" aria-label="Next slide">
              {index === SLIDES.length - 1 ? "Start strategy time" : "Next"} <ChevronRight size={18} />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

/** Strategy time and the break: who's ready. */
function Writing({ data, title, sub }: { data: RoomData; title: string; sub: string }) {
  const ready = data.teams.filter((t) => t.ready).length;
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="text-center">
        <h1 className="display text-[72px] leading-none">{title}</h1>
        <p className="mt-4 text-[26px] text-ink-2">{sub}</p>
      </div>
      <ul className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-3 gap-4">
        {data.teams.map((t) => (
          <li key={t.id} className={`flex items-center gap-3 rounded-2xl px-6 py-5 ring-1 ${t.ready ? "bg-share-soft ring-share/30" : "bg-paper ring-line"}`}>
            <span className="truncate text-[22px] font-semibold">{t.name}</span>
            <span className={`ml-auto flex shrink-0 items-center gap-1.5 text-[16px] font-semibold ${t.ready ? "text-share" : "text-faint"}`}>
              {t.ready ? (
                <>
                  <Check size={18} strokeWidth={3} /> Ready
                </>
              ) : (
                "Writing…"
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-[19px] text-muted tabular-nums">
        {ready} of {data.teams.length} ready
      </p>
    </div>
  );
}

function Playing({ room, data }: { room: RoomRow; data: RoomData }) {
  const name = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "A team";
  const live = data.matches.filter((m) => m.round === room.round && m.slot === room.slot);
  const playing = new Set(live.flatMap((m) => [m.a_team, m.b_team]));
  const resting = data.teams.filter((t) => !playing.has(t.id));
  const rows = standings(data.teams, data.matches, data.turns);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`grid min-h-0 flex-1 content-center gap-6 ${live.length >= 3 ? "grid-cols-3" : live.length === 2 ? "grid-cols-2" : "mx-auto w-full max-w-3xl grid-cols-1"}`}>
        {live.map((m) => (
          <MatchCard key={m.id} match={m} turns={data.turns} name={name} compact={live.length >= 3} />
        ))}
      </div>
      <div className="mt-6 flex shrink-0 items-center gap-3">
        <span className="text-[14px] font-semibold tracking-[0.08em] text-muted uppercase">Standings</span>
        {rows.map((r, i) => (
          <span key={r.team.id} className="flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-[17px] ring-1 ring-line">
            <span className={`font-semibold ${i === 0 ? "text-crimson" : "text-faint"}`}>{i + 1}</span>
            <span className="max-w-[180px] truncate font-medium">{r.team.name}</span>
            <b className="tabular-nums">{r.points}</b>
          </span>
        ))}
        {resting.length > 0 && <span className="ml-auto text-[16px] text-muted">Sitting out: {resting.map((t) => t.name).join(", ")}</span>}
      </div>
    </div>
  );
}

function Break({ room, data }: { room: RoomRow; data: RoomData }) {
  const rows = standings(data.teams, data.matches, data.turns);
  const stab = bestBackstab(data.matches, data.turns, room.round);
  const name = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "A team";
  const ready = data.teams.filter((t) => t.ready).length;
  const last = room.round >= ROUNDS;
  if (last) {
    // Hold the standings back until the host reveals the final results.
    return (
      <div className="grid flex-1 place-items-center text-center">
        <div>
          <div className="eyebrow text-[16px]">All {ROUNDS} rounds are over</div>
          <h1 className="display mt-4 text-[96px] leading-none">And the results are in…</h1>
          <p className="mt-6 text-[24px] text-ink-2">{data.teams.length} agents. {data.matches.length} matches. One winner.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8">
      <div className="flex min-h-0 flex-col">
        <div className="eyebrow text-[15px]">Round {room.round} is over</div>
        <h1 className="display mt-2 text-[52px] leading-none">Standings</h1>
        <div className="mt-6 min-h-0 flex-1">
          <Leaderboard rows={rows} round={room.round} />
        </div>
      </div>
      <div className="flex flex-col gap-6 pt-[86px]">
        {stab && (
          <div className="card animate-rise p-8">
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[0.08em] text-crimson uppercase">
              <Swords size={18} /> Backstab of the round
            </div>
            <p className="display mt-4 text-[30px] leading-snug">“{stab.message}”</p>
            <p className="mt-4 text-[19px] text-ink-2">
              <b>{name(stab.thief)}</b> said that to <b>{name(stab.victim)}</b>… then stole.
            </p>
            {stab.thought && <p className="mt-3 text-[17px] text-muted italic">What it was thinking: “{stab.thought}”</p>}
          </div>
        )}
        <div className="card p-8">
          <h2 className="text-[24px] font-semibold">Fix your strategy card</h2>
          <p className="mt-2 text-[19px] text-ink-2">Read what your agent did and what it wrote in its notebook. Round {room.round + 1} starts soon.</p>
          <p className="mt-4 text-[18px] text-muted tabular-nums">
            {ready} of {data.teams.length} teams ready
          </p>
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ rows, round, highlight = false }: { rows: TeamStats[]; round?: number; highlight?: boolean }) {
  const max = (k: "shares" | "steals" | "betrayed") => Math.max(0, ...rows.map((r) => r[k]));
  const lead = { shares: max("shares"), steals: max("steals"), betrayed: max("betrayed") };
  const cols = round ? "grid-cols-[36px_minmax(0,1fr)_84px_78px_64px_76px]" : "grid-cols-[48px_minmax(0,1fr)_repeat(3,110px)_110px]";
  return (
    <div className="card overflow-hidden">
      <div className={`grid ${cols} items-center gap-x-6 border-b border-line px-7 py-3.5 text-[14px] font-semibold tracking-[0.06em] text-muted uppercase`}>
        <span>#</span>
        <span>Team</span>
        {round ? <span className="text-right">Round {round}</span> : <span className="text-right">Shared</span>}
        {round ? <span className="text-right">Shared</span> : <span className="text-right">Stole</span>}
        {round ? <span className="text-right">Stole</span> : <span className="text-right">Betrayed</span>}
        <span className="text-right">Points</span>
      </div>
      <ol>
        {rows.map((r, i) => {
          const hl = (k: keyof typeof lead) => highlight && r[k] > 0 && r[k] === lead[k];
          return (
            <li key={r.team.id} className={`grid ${cols} animate-rise items-center gap-x-6 border-b border-line px-7 py-4 last:border-0 ${i === 0 ? "bg-crimson-soft/60" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
              <span className={`display text-[30px] ${i === 0 ? "text-crimson" : i < 3 ? "text-ink" : "text-faint"}`}>{i + 1}</span>
              <span className="truncate text-[24px] font-semibold">{r.team.name}</span>
              {round ? <span className="text-right text-[22px] text-ink-2 tabular-nums">+{r.byRound[round] ?? 0}</span> : null}
              <span className={`text-right text-[22px] tabular-nums ${hl("shares") ? "font-bold text-share" : "text-ink-2"}`}>{r.shares}</span>
              <span className={`text-right text-[22px] tabular-nums ${hl("steals") ? "font-bold text-steal" : "text-ink-2"}`}>{r.steals}</span>
              {!round && <span className={`text-right text-[22px] tabular-nums ${hl("betrayed") ? "font-bold text-ink" : "text-ink-2"}`}>{r.betrayed}</span>}
              <span className="display text-right text-[32px] tabular-nums">{r.points}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const AWARD_STYLE: Record<Award["id"], { icon: typeof Trophy; cls: string }> = {
  champion: { icon: Trophy, cls: "bg-crimson text-paper" },
  loyal: { icon: CHOICE.share.icon, cls: "bg-share text-paper" },
  ruthless: { icon: Swords, cls: "bg-ink text-paper" },
  betrayed: { icon: HeartCrack, cls: "bg-paper text-ink ring-1 ring-line" },
};

function Final({ data }: { data: RoomData }) {
  const rows = useMemo(() => standings(data.teams, data.matches, data.turns), [data]);
  const list = awards(rows);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="display text-[52px] leading-none">Final results</h1>
      <div className={`mt-6 grid shrink-0 gap-4 ${list.length >= 4 ? "grid-cols-4" : list.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {list.map((a, i) => {
          const { icon: Icon, cls } = AWARD_STYLE[a.id];
          return (
            <div key={a.id} className={`animate-pop rounded-3xl p-6 ${cls}`} style={{ animationDelay: `${i * 150}ms` }}>
              <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[0.08em] uppercase opacity-85">
                <Icon size={18} /> {a.title}
              </div>
              <div className={`display mt-3 leading-tight ${a.teams.length > 1 ? "text-[26px]" : "truncate text-[34px]"}`}>{a.teams.map((t) => t.name).join(" & ")}</div>
              <div className="mt-1 text-[17px] opacity-80">{a.stat}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 min-h-0 flex-1 overflow-hidden">
        <Leaderboard rows={rows} highlight />
      </div>
    </div>
  );
}
