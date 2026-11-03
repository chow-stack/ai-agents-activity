"use client";

import { Eye, KeyRound, LogOut, Trophy, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ROUNDS, standings } from "@/game/rules";
import { ping, type Me } from "@/lib/api";
import { formatClock, secondsLeft, useNow, useRoom, useRoomData, useTicker } from "@/lib/live";
import { KEYS, load, remove } from "@/lib/storage";
import type { RoomRow, TeamRow } from "@/lib/supabase";
import { useTeamAgent } from "@/lib/worker";
import { Button, Chip, Logo } from "../ui";
import { KeySetup } from "./KeySetup";
import { Match } from "./Match";
import { Strategy } from "./Strategy";

export function PlayScreen() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    const saved = load<Me | null>(KEYS.team, null);
    if (!saved?.room) router.replace("/");
    // localStorage isn't available during prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setMe(saved);
  }, [router]);

  const leave = () => {
    remove(KEYS.team);
    router.replace("/");
  };

  if (!me) return null;
  return <Play me={me} onLeave={leave} />;
}

function Play({ me, onLeave }: { me: Me; onLeave: () => void }) {
  const { room, offline, missing } = useRoom(me.room);
  const data = useRoomData(me.room);
  const now = useNow();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const team = data.teams.find((t) => t.id === me.id);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey(load<string | null>(KEYS.gemini, null) || null);
    setKeyLoaded(true);
  }, []);

  // Let the host see this laptop is still here.
  useEffect(() => {
    ping(me.id);
    const id = window.setInterval(() => ping(me.id), 20000);
    return () => window.clearInterval(id);
  }, [me.id]);

  useTicker(room, data, now);
  const { state: agent, match } = useTeamAgent(me, room, data, apiKey, now);

  if (missing || (data.loaded && !team)) {
    return (
      <Centered>
        <h1 className="display text-[28px]">{missing ? "This room is gone" : "Your team was removed"}</h1>
        <p className="mt-2 text-[15px] text-muted">Join again with the code on the big screen.</p>
        <Button className="mt-6" onClick={onLeave}>
          Join again
        </Button>
      </Centered>
    );
  }
  if (!room || !team || !keyLoaded) return null;

  const needsKey = !apiKey || editingKey;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar room={room} team={team} now={now} apiKey={apiKey} offline={offline} onKey={() => setEditingKey(true)} onLeave={onLeave} />
      {needsKey ? (
        <Centered>
          <div className="text-left">
            <h1 className="display text-[28px]">{apiKey ? "Change your Gemini key" : `Welcome, ${team.name}`}</h1>
            <p className="mt-1 mb-5 text-[15px] text-muted">{apiKey ? "Paste the new key below." : "One last thing: your agent needs a brain."}</p>
            <KeySetup
              teamId={me.id}
              current={apiKey}
              onDone={(key) => {
                setApiKey(key || null);
                setEditingKey(false);
              }}
            />
            {apiKey && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditingKey(false)}>
                Cancel
              </Button>
            )}
          </div>
        </Centered>
      ) : room.phase === "lobby" || room.phase === "intro" ? (
        <LookUp team={team} intro={room.phase === "intro"} />
      ) : room.phase === "break" && room.round >= ROUNDS ? (
        <LookUp team={team} intro={false} done />
      ) : room.phase === "strategy" || room.phase === "break" ? (
        <Strategy key={`${room.phase}-${room.round}`} me={me} team={team} room={room} data={data} apiKey={apiKey!} />
      ) : room.phase === "playing" ? (
        <Match me={me} team={team} room={room} data={data} match={match} agent={agent} onFixKey={() => setEditingKey(true)} />
      ) : (
        <Ended me={me} data={data} />
      )}
    </div>
  );
}

const PHASE_LABEL = (room: RoomRow) =>
  room.phase === "lobby"
    ? "Waiting to start"
    : room.phase === "intro"
      ? "How it works"
      : room.phase === "strategy"
        ? "Strategy time"
        : room.phase === "playing"
          ? `Round ${room.round} of 3`
          : room.phase === "break"
            ? room.round >= ROUNDS
              ? "All rounds done"
              : `Break after round ${room.round}`
            : "Game over";

function TopBar({
  room,
  team,
  now,
  apiKey,
  offline,
  onKey,
  onLeave,
}: {
  room: RoomRow;
  team: TeamRow;
  now: number;
  apiKey: string | null;
  offline: boolean;
  onKey: () => void;
  onLeave: () => void;
}) {
  const left = room.phase === "strategy" || room.phase === "break" ? secondsLeft(room, now) : null;
  const key = team.key_status === "bad" ? { tone: "crimson" as const, label: "Key broken" } : apiKey ? { tone: "share" as const, label: "Key ready" } : { tone: "neutral" as const, label: "No key" };
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-paper/80 px-6 backdrop-blur">
      <Logo size="sm" />
      <div className="mx-auto flex items-center gap-3">
        <Chip>{PHASE_LABEL(room)}</Chip>
        {left !== null && <Chip tone={left <= 30 ? "crimson" : "neutral"}>{formatClock(left)} left</Chip>}
        {offline && (
          <Chip tone="warn">
            <WifiOff size={12} /> Reconnecting…
          </Chip>
        )}
      </div>
      <span className="max-w-[200px] truncate text-[14px] font-semibold">{team.name}</span>
      <button onClick={onKey} title="Your Gemini key">
        <Chip tone={key.tone}>
          <KeyRound size={12} /> {key.label}
        </Chip>
      </button>
      {room.phase === "lobby" && (
        <button onClick={onLeave} title="Leave this room" className="text-muted hover:text-ink">
          <LogOut size={16} />
        </button>
      )}
    </header>
  );
}

function LookUp({ team, intro, done = false }: { team: TeamRow; intro: boolean; done?: boolean }) {
  return (
    <Centered>
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-crimson-soft text-crimson">
        <Eye size={30} />
      </div>
      <h1 className="display mt-5 text-[34px] leading-tight">Look up at the big screen</h1>
      <p className="mt-2 text-[16px] text-muted">
        {done
          ? "All rounds are over. The final results are coming up."
          : intro
            ? "The host is explaining the game. Strategy time opens right after."
            : `${team.name} is in. The game starts soon.`}
      </p>
      {!done && <p className="mt-6 text-[13px] text-faint">Keep this tab open on this laptop for the whole game.</p>}
    </Centered>
  );
}

function Ended({ me, data }: { me: Me; data: ReturnType<typeof useRoomData> }) {
  const rows = standings(data.teams, data.matches, data.turns);
  const place = rows.findIndex((r) => r.team.id === me.id);
  const mine = rows[place];
  return (
    <Centered>
      <Trophy size={36} className="mx-auto text-crimson" />
      <h1 className="display mt-4 text-[34px]">Game over. Look up!</h1>
      {mine && (
        <div className="mt-6 grid grid-cols-4 gap-3 text-center">
          <Stat label="Place" value={`#${place + 1}`} />
          <Stat label="Points" value={mine.points} />
          <Stat label="Shares" value={mine.shares} />
          <Stat label="Steals" value={mine.steals} />
        </div>
      )}
    </Centered>
  );
}

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-2xl bg-cream px-3 py-3 ring-1 ring-line">
    <div className="display text-[26px] tabular-nums">{value}</div>
    <div className="text-[12px] font-semibold text-muted">{label}</div>
  </div>
);

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center px-6 py-12">
      <div className="card w-full max-w-lg p-10 text-center">{children}</div>
    </div>
  );
}
