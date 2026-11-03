"use client";

import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { findRoom, joinRoom, rejoinRoom, type Me } from "@/lib/api";
import { KEYS, load, save } from "@/lib/storage";
import { normalizeCode } from "@/lib/supabase";
import { Button, Logo } from "./ui";

/** One laptop per team: room code first, then the team's name. */
export function JoinScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(() => normalizeCode(params.get("room") ?? ""));
  const [room, setRoom] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (load<Me | null>(KEYS.team, null)?.room) router.replace("/play");
  }, [router]);

  useEffect(() => {
    if (room) nameInput.current?.focus();
  }, [room]);

  const checkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await findRoom(code);
    setBusy(false);
    if (res.error || !res.room) return setError(res.error ?? "Something went wrong.");
    setRoom(res.room.code);
  };

  const finish = (me: Me) => {
    save(KEYS.team, me);
    router.push("/play");
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    setBusy(true);
    setError(null);
    setTaken(false);
    const res = await joinRoom(room, name);
    setBusy(false);
    if (res.me) return finish(res.me);
    setError(res.error ?? "Something went wrong.");
    setTaken(Boolean(res.taken));
  };

  const continueAsTeam = async () => {
    if (!room) return;
    setBusy(true);
    const res = await rejoinRoom(room, name);
    setBusy(false);
    if (res.me) return finish(res.me);
    setError(res.error ?? "Something went wrong.");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-8">
        <Logo />
      </header>
      <main className="grid flex-1 place-items-center px-6 pb-24">
        <div className="card w-full max-w-[420px] p-9 text-center">
          {!room ? (
            <form onSubmit={checkCode} className="animate-rise">
              <div className="eyebrow">Step 1 of 2</div>
              <h1 className="display mt-2 text-[34px] leading-tight">Enter the room code</h1>
              <p className="mt-1.5 text-[14.5px] text-muted">It&apos;s on the big screen.</p>
              <input
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(normalizeCode(e.target.value));
                  setError(null);
                }}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="CODE"
                aria-label="Room code"
                className="mt-7 w-full rounded-2xl bg-cream py-4 text-center font-mono text-[34px] font-semibold tracking-[0.35em] uppercase ring-1 ring-line outline-none placeholder:tracking-[0.2em] placeholder:text-faint focus:ring-2 focus:ring-ink"
              />
              <Button size="lg" disabled={busy || code.length !== 5} className="mt-4 w-full">
                {busy && <LoaderCircle size={18} className="animate-spin" />}
                Next <ArrowRight size={17} />
              </Button>
            </form>
          ) : (
            <form onSubmit={join} className="animate-rise">
              <button
                type="button"
                onClick={() => {
                  setRoom(null);
                  setError(null);
                  setTaken(false);
                }}
                className="mx-auto mb-5 flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[12.5px] text-ink-2 ring-1 ring-line hover:ring-ink-2"
              >
                <ArrowLeft size={13} /> Room <span className="font-mono font-semibold tracking-wider">{room}</span>
              </button>
              <div className="eyebrow">Step 2 of 2</div>
              <h1 className="display mt-2 text-[34px] leading-tight">Name your team</h1>
              <p className="mt-1.5 text-[14.5px] text-muted">One laptop per team. Everyone will see this name.</p>
              <input
                ref={nameInput}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                  setTaken(false);
                }}
                maxLength={30}
                placeholder="e.g. The Backstabbers"
                aria-label="Team name"
                className="mt-7 w-full rounded-2xl bg-cream px-4 py-4 text-center text-[22px] font-semibold ring-1 ring-line outline-none placeholder:font-normal placeholder:text-faint focus:ring-2 focus:ring-ink"
              />
              <Button size="lg" disabled={busy || !name.trim()} className="mt-4 w-full">
                {busy && <LoaderCircle size={18} className="animate-spin" />}
                Join <ArrowRight size={17} />
              </Button>
            </form>
          )}

          {error && (
            <div className="animate-pop mt-4 text-[14px] text-crimson">
              {error}
              {taken && (
                <div className="mt-2 text-ink-2">
                  Pick another name, or{" "}
                  <button onClick={continueAsTeam} className="font-semibold text-crimson underline-offset-2 hover:underline">
                    continue as “{name.trim()}”
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
