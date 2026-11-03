// A practice match against a house bot, run entirely in the team's browser. Nothing is saved or scored.
// The bot plays tit-for-tat (shares first, then copies your agent's last move), but it shares whenever it's paid.
// That way a team can see Spy and Pay do something before the real game.

import { agentDecide, agentNote, agentTalk, type AgentContext } from "./agent";
import { settle, type MyTurn } from "./rules";
import type { Choice } from "@/lib/supabase";

export const PRACTICE_BOT = "Mirror Bot";
export const PRACTICE_TURNS = 3;
const SPY_REPORT = "vs Owls, round 1: share, share, steal (they stole)\nvs Foxes, round 1: share, share, share";

const LINES: Record<Choice, string[]> = {
  share: ["Hi! I share if you share. Paying me works too.", "That was nice. Let's keep sharing.", "Good partners so far. Same again?"],
  steal: ["You stole. I'll remember that.", "Steal from me and I steal back. Unless you pay.", "Share and I'll forgive you."],
};

export interface PracticeResult {
  turns: MyTurn[];
  note: string | null;
}

export async function runPractice(
  key: string,
  team: { name: string; play: string; memory: string; guard: string },
  onUpdate: (r: PracticeResult & { thinking: string | null }) => void,
  signal?: AbortSignal,
): Promise<PracticeResult> {
  const turns: MyTurn[] = [];
  const spied = () => turns.some((t) => t.mySpy);
  const base = (turn: number): AgentContext => ({
    me: team.name,
    opponent: PRACTICE_BOT,
    play: team.play,
    guard: team.guard,
    memory: team.memory,
    note: null,
    history: turns.filter((t) => t.myChoice),
    turn,
    spied: spied(),
    spyReport: spied() ? SPY_REPORT : null,
  });
  for (let turn = 1; turn <= PRACTICE_TURNS; turn++) {
    const last = turns.at(-1);
    const copied: Choice = last?.myChoice ?? "share";
    const botLine = turn === 1 ? LINES.share[0] : LINES[copied][Math.min(turn - 1, 2)];
    onUpdate({ turns: [...turns], note: null, thinking: "Writing a message…" });
    const talk = await agentTalk(key, base(turn), signal);
    const current: MyTurn = {
      turn,
      mine: talk.message,
      theirs: botLine,
      myChoice: null,
      theirChoice: null,
      myPoints: null,
      theirPoints: null,
      thought: null,
      myAuto: false,
      theirAuto: false,
      mySpy: talk.spy,
      theirSpy: false,
      myOffer: talk.offer,
      theirOffer: 0,
    };
    turns.push(current);
    onUpdate({ turns: [...turns], note: null, thinking: "Choosing…" });
    const decide = await agentDecide(key, base(turn), current, signal);
    const botChoice: Choice = talk.offer > 0 ? "share" : copied;
    const [mine, theirs] = settle({ choice: decide.choice, spy: talk.spy, offer: talk.offer }, { choice: botChoice, spy: false, offer: 0 });
    Object.assign(current, { myChoice: decide.choice, theirChoice: botChoice, myPoints: mine, theirPoints: theirs, thought: decide.thought });
    onUpdate({ turns: [...turns], note: null, thinking: null });
  }
  onUpdate({ turns: [...turns], note: null, thinking: team.memory.trim() ? "Writing its notebook…" : null });
  const note = await agentNote(key, { ...base(PRACTICE_TURNS + 1), history: turns }, signal);
  onUpdate({ turns: [...turns], note, thinking: null });
  return { turns, note };
}
