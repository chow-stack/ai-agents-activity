"use client";

import { ExternalLink, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { testKey } from "@/game/agent";
import { setKeyStatus } from "@/lib/api";
import { KEYS, remove, save } from "@/lib/storage";
import { Button } from "../ui";

/** Paste a Gemini key, check it with one tiny call, keep it on this laptop only. */
export function KeySetup({ teamId, onDone, current }: { teamId: string; onDone: (key: string) => void; current?: string | null }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key) return setError("Paste your key first.");
    setBusy(true);
    setError(null);
    const res = await testKey(key);
    setBusy(false);
    if (!res.ok) {
      if (res.kind === "limit") {
        // The key is real, just busy right now. Keep it.
        save(KEYS.gemini, key);
        await setKeyStatus(teamId, "limited");
        return onDone(key);
      }
      await setKeyStatus(teamId, "bad");
      return setError(res.kind === "key" ? "That key didn't work. Copy it again from AI Studio." : res.message);
    }
    save(KEYS.gemini, key);
    await setKeyStatus(teamId, "ok");
    onDone(key);
  };

  const forget = async () => {
    remove(KEYS.gemini);
    await setKeyStatus(teamId, "none");
    onDone("");
  };

  return (
    <form onSubmit={check} className="w-full">
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <KeyRound size={16} className="text-crimson" /> Your Gemini key
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
        The same free key from the AI Morning Brief. Your team&apos;s agent thinks with it, so it needs to stay on this laptop all game.
      </p>
      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-crimson hover:underline"
      >
        Find it at aistudio.google.com/apikey <ExternalLink size={12} />
      </a>
      <input
        type="password"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        placeholder={current ? "Paste a different key" : "AIza…"}
        autoComplete="off"
        spellCheck={false}
        aria-label="Gemini API key"
        className="mt-4 w-full rounded-xl bg-cream px-3.5 py-3 font-mono text-[14px] ring-1 ring-line outline-none placeholder:text-faint focus:ring-2 focus:ring-ink"
      />
      {error && <p className="animate-pop mt-2 text-[13px] text-crimson">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={busy}>
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          {busy ? "Checking…" : "Check key"}
        </Button>
        {current && (
          <Button type="button" variant="ghost" onClick={forget}>
            Forget my key
          </Button>
        )}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-snug text-muted">
        <ShieldCheck size={13} className="mt-px shrink-0" />
        Stays in this browser and goes only to Google. It&apos;s never sent to the club&apos;s server.
      </p>
    </form>
  );
}
