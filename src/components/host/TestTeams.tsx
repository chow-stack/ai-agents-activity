"use client";

import { Bot, BrainCircuit, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { testKey } from "@/game/agent";
import type { HostAction, hostAction } from "@/lib/api";
import type { RoomData } from "@/lib/live";
import { KEYS, remove, save } from "@/lib/storage";
import type { RoomRow, TeamRow } from "@/lib/supabase";
import { useTeamAgent } from "@/lib/worker";
import { Button } from "../ui";

type Act = (action: HostAction, opts?: Parameters<typeof hostAction>[2]) => Promise<void>;

/**
 * Test teams can be scripted (the database plays a fixed style and ignores messages) or "listen": this laptop plays
 * them with Gemini on the host's own key, through the same agent as real teams, so persuasion and guardrails matter.
 */
export function TestTeamsBrain({ room, botKey, setBotKey, act }: { room: RoomRow; botKey: string; setBotKey: (k: string) => void; act: Act }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = room.bot_brain && Boolean(botKey);

  const turnOn = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = value.trim() || botKey;
    if (!key) return setError("Paste a Gemini key first.");
    setBusy(true);
    setError(null);
    const res = await testKey(key);
    if (!res.ok && res.kind !== "limit") {
      setBusy(false);
      return setError(res.kind === "key" ? "That key didn't work." : res.message);
    }
    save(KEYS.botKey, key);
    setBotKey(key);
    setValue("");
    await act("bot_brain", { num: 1 });
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true);
    await act("bot_brain", { num: 0 });
    remove(KEYS.botKey);
    setBotKey("");
    setBusy(false);
  };

  return (
    <div className={`mt-2 rounded-2xl px-5 py-4 ring-1 ${live ? "bg-share-soft/60 ring-share/25" : "bg-paper ring-line"}`}>
      {live ? (
        <div className="flex items-start gap-3">
          <BrainCircuit size={18} className="mt-0.5 shrink-0 text-share" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Test teams listen</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              They think with Gemini on this laptop, read every message, and use Spy and Pay. Keep this tab open. A slow move falls back to the scripted one after
              20 seconds.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={turnOff} disabled={busy}>
            Turn off
          </Button>
        </div>
      ) : (
        <form onSubmit={turnOn}>
          <div className="flex items-start gap-3">
            <Bot size={18} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">Test teams are scripted</p>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">They ignore messages. Add a Gemini key to make them listen and answer like real agents.</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={botKey ? "Use the saved key" : "Gemini key (stays on this laptop)"}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-lg bg-cream px-3 py-1.5 font-mono text-[13px] ring-1 ring-line outline-none placeholder:font-sans placeholder:text-faint focus:bg-paper focus:ring-2 focus:ring-ink"
                />
                <Button size="sm" type="submit" disabled={busy}>
                  {busy && <LoaderCircle size={14} className="animate-spin" />} Make them listen
                </Button>
              </div>
              {error && <p className="mt-2 text-[12.5px] text-crimson">{error}</p>}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

/** Plays every test team from this laptop while "listen" is on. Renders nothing. */
export function BotRunners({ room, data, botKey, now }: { room: RoomRow; data: RoomData; botKey: string; now: number }) {
  if (!room.bot_brain || !botKey) return null;
  return data.teams.filter((t) => t.bot).map((t) => <BotAgent key={t.id} team={t} room={room} data={data} botKey={botKey} now={now} />);
}

function BotAgent({ team, room, data, botKey, now }: { team: TeamRow; room: RoomRow; data: RoomData; botKey: string; now: number }) {
  useTeamAgent({ id: team.id, name: team.name, room: room.code }, room, data, botKey, now);
  return null;
}
