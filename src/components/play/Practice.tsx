"use client";

import { FlaskConical, LoaderCircle, NotebookPen, Play } from "lucide-react";
import { useRef, useState } from "react";
import type { GeminiError } from "@/game/agent";
import { PRACTICE_BOT, PRACTICE_TURNS, runPractice, type PracticeResult } from "@/game/practice";
import { Transcript } from "../Transcript";
import { Button, Typing } from "../ui";

/** Try the current strategy card against a house bot. Runs on this laptop's key; nothing is saved. */
export function Practice({ apiKey, team }: { apiKey: string; team: { name: string; play: string; guard: string; memory: string } }) {
  const [result, setResult] = useState<(PracticeResult & { thinking: string | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult({ turns: [], note: null, thinking: "Starting…" });
    ctrl.current = new AbortController();
    try {
      await runPractice(apiKey, team, setResult, ctrl.current.signal);
    } catch (e) {
      const err = e as GeminiError;
      if (err.kind !== "aborted") setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const total = result?.turns.reduce((s, t) => s + (t.myPoints ?? 0), 0) ?? 0;
  const done = !busy && result && result.turns.length === PRACTICE_TURNS && result.turns.at(-1)?.myChoice;

  return (
    <section className="card p-6">
      <div className="flex items-center gap-2">
        <FlaskConical size={17} className="text-crimson" />
        <h2 className="text-[16px] font-semibold">Test it</h2>
      </div>
      <p className="mt-1 text-[13.5px] leading-snug text-muted">
        A {PRACTICE_TURNS}-turn practice match against {PRACTICE_BOT}, who copies your last move but shares whenever it&apos;s paid. Nothing counts.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
          {busy ? "Playing…" : result ? "Run again" : "Run practice match"}
        </Button>
        {busy && (
          <Button size="sm" variant="ghost" onClick={() => ctrl.current?.abort()}>
            Stop
          </Button>
        )}
      </div>
      {error && <p className="mt-3 text-[13px] text-crimson">{error}</p>}

      {result && result.turns.length > 0 && (
        <div className="mt-5">
          <Transcript turns={result.turns} opponent={PRACTICE_BOT} waiting={result.thinking === "Writing a message…" ? "talk" : result.thinking === "Choosing…" ? "decide" : null} />
        </div>
      )}
      {result?.thinking && result.turns.length === 0 && (
        <p className="mt-4 text-[13px] text-muted">
          <Typing className="mr-2 text-muted" />
          {result.thinking}
        </p>
      )}
      {done && (
        <div className="animate-rise mt-5 space-y-3 border-t border-line pt-4">
          <p className="text-[14px]">
            Your agent scored <b className="tabular-nums">{total}</b> points.
          </p>
          <div className="rounded-xl bg-cream p-3.5 ring-1 ring-line">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
              <NotebookPen size={13} /> Its note about {PRACTICE_BOT}
            </div>
            <p className="mt-1 text-[13.5px]">
              {result.note ?? <span className="text-crimson">Nothing. Your memory box is blank, so it forgot this match.</span>}
            </p>
          </div>
        </div>
      )}
      {!busy && result?.thinking === "Writing its notebook…" && <p className="mt-3 text-[13px] text-muted">Writing its notebook…</p>}
    </section>
  );
}
