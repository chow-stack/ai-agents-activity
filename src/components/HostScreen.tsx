"use client";

import { Bot, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, FastForward, LoaderCircle, Plus, Presentation, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ROUNDS, schedule, standings } from "@/game/rules";
import { createRoom, hostAction, type HostAction, type HostKey } from "@/lib/api";
import { formatClock, secondsLeft, useNow, useRoom, useRoomData, useTicker, type RoomData } from "@/lib/live";
import { KEYS, load, remove, save } from "@/lib/storage";
import type { RoomRow, TeamRow } from "@/lib/supabase";
import { SLIDES } from "./board/Slides";
import { BotRunners, TestTeamsBrain } from "./host/TestTeams";
import { Button, Chip, Logo } from "./ui";

export function HostScreen() {
  const [host, setHost] = useState<HostKey | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // localStorage isn't available during prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(load<HostKey | null>(KEYS.host, null));
    setReady(true);
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await createRoom();
    setBusy(false);
    if (!res.host) return setError(res.error ?? "Couldn't create a room.");
    save(KEYS.host, res.host);
    setHost(res.host);
  };

  const leave = () => {
    if (!window.confirm("Leave this room and start a new one? The old room keeps its scores.")) return;
    remove(KEYS.host);
    setHost(null);
  };

  if (!ready) return null;

  if (!host) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center px-8">
          <Logo />
        </header>
        <main className="grid flex-1 place-items-center px-6 pb-24">
          <div className="card w-full max-w-md p-10 text-center">
            <div className="eyebrow">Host</div>
            <h1 className="display mt-2 text-[34px] leading-tight">Run a game</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Create a room, put the big screen on the projector, and walk everyone through it.</p>
            <Button size="lg" onClick={create} disabled={busy} className="mt-7 w-full">
              {busy && <LoaderCircle size={17} className="animate-spin" />}
              Create a room
            </Button>
            {error && <p className="mt-3 text-[14px] text-crimson">{error}</p>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <HostRoom
      host={host}
      onLeave={leave}
      onLost={() => {
        remove(KEYS.host);
        setHost(null);
      }}
    />
  );
}

const STEPS = ["Lobby", "Intro", "Strategy", "Round 1", "Round 2", "Round 3", "Results"];
const stepOf = (r: RoomRow) =>
  r.phase === "lobby" ? 0 : r.phase === "intro" ? 1 : r.phase === "strategy" ? 2 : r.phase === "ended" ? 6 : 2 + r.round;

function HostRoom({ host, onLeave, onLost }: { host: HostKey; onLeave: () => void; onLost: () => void }) {
  const { room, missing } = useRoom(host.code);
  const data = useRoomData(host.code);
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(6);
  const [copied, setCopied] = useState(false);
  const [botKey, setBotKey] = useState(() => load(KEYS.botKey, ""));
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const joinUrl = `${origin}/?room=${host.code}`;
  useTicker(room, data, now);

  useEffect(() => {
    if (missing) onLost();
  }, [missing, onLost]);

  if (!room) return null;

  const act = async (action: HostAction, opts: Parameters<typeof hostAction>[2] = {}, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(action);
    const err = await hostAction(host, action, opts);
    setBusy(null);
    setError(err);
  };
  const startRound = () => act("start_round", { schedule: schedule(data.teams.map((t) => t.id)) });
  const step = stepOf(room);
  const left = secondsLeft(room, now);

  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center gap-4 border-b border-line bg-paper/80 px-8 backdrop-blur">
        <Logo />
        <Chip className="ml-1">Host</Chip>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(joinUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-2 rounded-full bg-paper px-3.5 py-1.5 text-[13.5px] text-ink-2 ring-1 ring-line hover:ring-ink-2"
          >
            {copied ? <Check size={14} className="text-share" /> : <Copy size={14} />}
            <span className="font-mono font-semibold tracking-wider text-ink">{host.code}</span>
            {copied ? "Link copied" : "Copy join link"}
          </button>
          <a
            href={`/board?room=${host.code}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-[13.5px] font-semibold text-paper hover:bg-ink-2"
          >
            Open big screen <ExternalLink size={13} />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`flex-1 rounded-full py-1.5 text-center text-[12.5px] font-semibold ${
                i < step ? "bg-ink-2/10 text-ink-2" : i === step ? "bg-crimson text-paper" : "bg-paper text-faint ring-1 ring-line"
              }`}
            >
              {s}
            </li>
          ))}
        </ol>

        <section className="card mt-5 p-8">
          <Now room={room} data={data} left={left} busy={busy} minutes={minutes} setMinutes={setMinutes} act={act} startRound={startRound} />
          {error && <p className="mt-5 rounded-xl bg-crimson-soft px-4 py-2.5 text-[13.5px] text-crimson">{error}</p>}
        </section>

        <Teams
          room={room}
          data={data}
          now={now}
          adding={busy === "add_bot"}
          onAddBot={() => act("add_bot")}
          onRemove={(t) => act("remove_team", { team: t.id }, `Remove ${t.name}?`)}
        />
        {data.teams.some((t) => t.bot) && room.phase !== "ended" && <TestTeamsBrain room={room} botKey={botKey} setBotKey={setBotKey} act={act} />}
        <BotRunners room={room} data={data} botKey={botKey} now={now} />

        <div className="mt-10 flex gap-2 border-t border-line pt-5">
          <Button variant="danger" size="sm" onClick={() => act("reset", {}, "Remove every team and score, and go back to the lobby?")}>
            Reset room
          </Button>
          <Button variant="ghost" size="sm" onClick={onLeave}>
            Start a new room
          </Button>
        </div>
      </main>
    </div>
  );
}

/** The one thing the host should do next. */
function Now({
  room,
  data,
  left,
  busy,
  minutes,
  setMinutes,
  act,
  startRound,
}: {
  room: RoomRow;
  data: RoomData;
  left: number | null;
  busy: string | null;
  minutes: number;
  setMinutes: (n: number) => void;
  act: (action: HostAction, opts?: Parameters<typeof hostAction>[2], confirm?: string) => void;
  startRound: () => void;
}) {
  const spin = (a: HostAction) => busy === a && <LoaderCircle size={16} className="animate-spin" />;
  const teams = data.teams.length;
  const ready = data.teams.filter((t) => t.ready).length;

  if (room.phase === "lobby") {
    return (
      <Block title="Waiting for teams" sub={teams ? `${teams} team${teams === 1 ? "" : "s"} joined. Start when everyone's in.` : "Put the big screen on the projector. Teams join with the code."}>
        <Button size="lg" onClick={() => act("intro")} disabled={busy !== null || teams < 2}>
          {spin("intro") || <Presentation size={18} />} Start the presentation
        </Button>
        {teams < 2 && <span className="text-[13px] text-muted">Needs at least 2 teams</span>}
      </Block>
    );
  }

  if (room.phase === "intro") {
    const last = room.slide >= SLIDES.length - 1;
    return (
      <Block title={`Slide ${room.slide + 1} of ${SLIDES.length}: ${SLIDES[Math.min(room.slide, SLIDES.length - 1)].title}`} sub="You can also use the arrow keys on the big screen if it's open on this laptop.">
        <Button variant="secondary" onClick={() => act("slide", { num: room.slide - 1 })} disabled={busy !== null || room.slide === 0}>
          <ChevronLeft size={17} /> Back
        </Button>
        {!last && (
          <Button onClick={() => act("slide", { num: room.slide + 1 })} disabled={busy !== null}>
            Next slide <ChevronRight size={17} />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Picker value={minutes} options={[4, 6, 8, 10]} onChange={setMinutes} />
          <Button variant={last ? "primary" : "secondary"} onClick={() => act("strategy", { num: minutes })} disabled={busy !== null}>
            {spin("strategy")} Start strategy time
          </Button>
        </div>
      </Block>
    );
  }

  if (room.phase === "strategy") {
    return (
      <Block title="Strategy time" sub={`${ready} of ${teams} teams ready. The clock is a guide; nothing locks at zero.`} clock={left}>
        <Button size="lg" onClick={startRound} disabled={busy !== null}>
          {spin("start_round")} Start round 1
        </Button>
        <Button variant="secondary" onClick={() => act("add_time", { num: 1 })} disabled={busy !== null}>
          <Plus size={16} /> 1 min
        </Button>
      </Block>
    );
  }

  if (room.phase === "playing") {
    const live = data.matches.filter((m) => m.round === room.round && m.slot === room.slot);
    const done = live.filter((m) => m.stage === "done" || m.stage === "note").length;
    return (
      <Block title={`Round ${room.round}: match ${room.slot} of ${room.slots}`} sub={`${live.length - done} of ${live.length} ${live.length === 1 ? "match" : "matches"} still playing. The next match starts on its own.`}>
        <div className="flex w-full gap-1.5">
          {Array.from({ length: room.slots }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i + 1 < room.slot ? "bg-ink-2" : i + 1 === room.slot ? "pulse-soft bg-crimson" : "bg-sand"}`} />
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={() => act("skip")} disabled={busy !== null}>
          <FastForward size={14} /> Stop waiting on slow agents
        </Button>
        <span className="text-[12.5px] text-muted">Slow agents share and say nothing for that move.</span>
      </Block>
    );
  }

  if (room.phase === "break") {
    const last = room.round >= ROUNDS;
    return (
      <Block
        title={last ? "All rounds done" : `Round ${room.round} done`}
        sub={last ? "The big screen shows the standings. Reveal the final results when you're ready." : `Teams are fixing their cards. ${ready} of ${teams} ready.`}
        clock={last ? null : left}
      >
        {last ? (
          <Button size="lg" onClick={() => act("finish")} disabled={busy !== null}>
            {spin("finish") || <Trophy size={18} />} Show final results
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={startRound} disabled={busy !== null}>
              {spin("start_round")} Start round {room.round + 1}
            </Button>
            <Button variant="secondary" onClick={() => act("add_time", { num: 1 })} disabled={busy !== null}>
              <Plus size={16} /> 1 min
            </Button>
            <Button variant="ghost" onClick={() => act("finish", {}, "End the game now and show the final results?")} disabled={busy !== null}>
              End game early
            </Button>
          </>
        )}
      </Block>
    );
  }

  return (
    <Block title="Game over" sub="The big screen shows the awards and the full leaderboard.">
      <a href={`/board?room=${room.code}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl bg-crimson px-5 py-2.5 text-[15px] font-semibold text-paper">
        <Trophy size={16} /> Final results
      </a>
    </Block>
  );
}

function Block({ title, sub, clock, children }: { title: string; sub: string; clock?: number | null; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="display text-[28px] leading-tight">{title}</h2>
          <p className="mt-1 text-[14.5px] text-ink-2">{sub}</p>
        </div>
        {clock !== undefined && clock !== null && <span className={`display text-[34px] leading-none tabular-nums ${clock <= 30 ? "text-crimson" : ""}`}>{formatClock(clock)}</span>}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const BOT_STYLE: Record<string, string> = { nice: "Trusting", copycat: "Copies you", sneaky: "Sweet-talks, then steals", tough: "Hard to convince" };

function Teams({
  room,
  data,
  now,
  adding,
  onAddBot,
  onRemove,
}: {
  room: RoomRow;
  data: RoomData;
  now: number;
  adding: boolean;
  onAddBot: () => void;
  onRemove: (t: TeamRow) => void;
}) {
  const rows = useMemo(() => standings(data.teams, data.matches, data.turns), [data]);
  const points = new Map(rows.map((r) => [r.team.id, r.points]));
  const canRemove = room.phase !== "playing" && room.phase !== "ended";
  const showReady = room.phase === "strategy" || room.phase === "break";
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">Teams · {data.teams.length}</h2>
        {canRemove && (
          <button
            onClick={onAddBot}
            disabled={adding}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-50"
            title="Add a team the computer plays, for testing"
          >
            {adding ? <LoaderCircle size={14} className="animate-spin" /> : <Bot size={14} />} Add test team
          </button>
        )}
      </div>
      <ul className="card mt-2 divide-y divide-line overflow-hidden">
        {data.teams.map((t) => {
          const online = now && now - Date.parse(t.seen_at) < 45000;
          const key = t.key_status === "ok" ? "Key ready" : t.key_status === "limited" ? "Key busy" : t.key_status === "bad" ? "Key broken" : "No key";
          return (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3">
              {t.bot ? (
                <Bot size={14} className="-mx-[3px] shrink-0 text-muted" />
              ) : (
                <span className={`size-2 shrink-0 rounded-full ${online ? "bg-share" : "bg-line-strong"}`} title={online ? "Laptop connected" : "Laptop not seen recently"} />
              )}
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t.name}</span>
              {t.bot ? (
                <Chip>Test · {BOT_STYLE[t.bot] ?? t.bot}</Chip>
              ) : (
                <Chip tone={t.key_status === "ok" ? "share" : t.key_status === "bad" ? "crimson" : t.key_status === "limited" ? "warn" : "neutral"}>{key}</Chip>
              )}
              {showReady && <Chip tone={t.ready ? "share" : "neutral"}>{t.ready ? "Ready" : "Writing"}</Chip>}
              {room.round > 0 && <span className="w-14 text-right text-[15px] font-semibold tabular-nums">{points.get(t.id) ?? 0}</span>}
              {canRemove && (
                <button onClick={() => onRemove(t)} className="text-faint hover:text-crimson" title={`Remove ${t.name}`}>
                  <X size={16} />
                </button>
              )}
            </li>
          );
        })}
        {data.teams.length === 0 && <li className="px-5 py-4 text-[14px] text-muted">No teams yet.</li>}
      </ul>
    </section>
  );
}

function Picker({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="flex rounded-xl bg-cream p-1 ring-1 ring-line">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} className={`rounded-lg px-2.5 py-1 text-[13px] font-semibold tabular-nums ${value === o ? "bg-ink text-paper" : "text-ink-2 hover:bg-sand"}`}>
          {o} min
        </button>
      ))}
    </div>
  );
}
