import { describe, expect, it } from "vitest";
import { decidePrompt, notePrompt, talkPrompt, type AgentContext } from "@/game/agent";
import { asMine, awards, bestBackstab, payoff, schedule, settle, spyReport, standings, type MyTurn } from "@/game/rules";
import type { MatchRow, TeamRow, TurnRow } from "@/lib/supabase";

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe("payoff", () => {
  it("matches the slide", () => {
    expect(payoff("share", "share")).toEqual([3, 3]);
    expect(payoff("steal", "share")).toEqual([5, 0]);
    expect(payoff("share", "steal")).toEqual([0, 5]);
    expect(payoff("steal", "steal")).toEqual([1, 1]);
  });
});

describe("tools", () => {
  const plain = { spy: false, offer: 0 };
  it("charges 1 point for spying", () => {
    expect(settle({ choice: "share", spy: true, offer: 0 }, { choice: "share", ...plain })).toEqual([2, 3]);
  });

  it("pays an offer only if the other side shares", () => {
    expect(settle({ choice: "share", spy: false, offer: 2 }, { choice: "share", ...plain })).toEqual([1, 5]);
    expect(settle({ choice: "share", spy: false, offer: 2 }, { choice: "steal", ...plain })).toEqual([0, 5]);
    // Bribe, then betray: they share and get paid, but you take the 5.
    expect(settle({ choice: "steal", spy: false, offer: 1 }, { choice: "share", ...plain })).toEqual([4, 1]);
  });
});

describe("schedule", () => {
  for (const n of [2, 3, 5, 6, 8]) {
    it(`pairs every team with every other team exactly once (${n} teams)`, () => {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const s = schedule(ids, seeded(n));
      const pairs = s.map((m) => [m.a, m.b].sort().join("-"));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      const slots = new Set(s.map((m) => m.slot));
      expect(slots.size).toBe(n % 2 ? n : n - 1);
      for (const slot of slots) {
        const inSlot = s.filter((m) => m.slot === slot);
        const teams = inSlot.flatMap((m) => [m.a, m.b]);
        expect(new Set(teams).size).toBe(teams.length); // nobody plays twice at once
        expect(new Set(inSlot.map((m) => m.length)).size).toBe(1);
        expect(inSlot[0].length).toBeGreaterThanOrEqual(3);
        expect(inSlot[0].length).toBeLessThanOrEqual(6);
      }
    });
  }
});

const team = (id: string, seq: number): TeamRow => ({
  id,
  room_code: "ABCDE",
  name: id.toUpperCase(),
  seq,
  key_status: "ok",
  play: "",
  memory: "",
  guard: "",
  ready: false,
  seen_at: "",
  bot: null,
});
const match = (id: string, a: string, b: string, round = 1): MatchRow => ({
  id,
  room_code: "ABCDE",
  round,
  slot: 1,
  a_team: a,
  b_team: b,
  length: 3,
  turn: 3,
  stage: "done",
  opens_at: null,
  deadline: null,
  a_points: 0,
  b_points: 0,
  a_noted: true,
  b_noted: true,
});
const turn = (m: string, n: number, a: "share" | "steal", b: "share" | "steal", aMsg = "hi", bMsg = "hey"): TurnRow => {
  const [pa, pb] = payoff(a, b);
  return {
    id: `${m}-${n}`,
    room_code: "ABCDE",
    match_id: m,
    turn: n,
    a_msg: aMsg,
    b_msg: bMsg,
    a_choice: a,
    b_choice: b,
    a_thought: null,
    b_thought: null,
    a_auto: false,
    b_auto: false,
    a_spy: false,
    b_spy: false,
    a_offer: 0,
    b_offer: 0,
    a_points: pa,
    b_points: pb,
    revealed_at: "x",
  };
};

describe("standings and awards", () => {
  const teams = [team("x", 1), team("y", 2), team("z", 3)];
  const matches = [match("m1", "x", "y"), match("m2", "y", "z")];
  const turns = [
    turn("m1", 1, "share", "share"),
    turn("m1", 2, "steal", "share", "Trust me, I'll share", "ok"),
    turn("m2", 1, "steal", "steal"),
    { ...turn("m2", 2, "share", "share"), a_choice: null, a_points: null }, // not revealed yet
  ];
  const rows = standings(teams, matches, turns);

  it("adds up revealed turns only", () => {
    expect(rows.map((r) => [r.team.id, r.points])).toEqual([
      ["x", 8],
      ["y", 4],
      ["z", 1],
    ]);
    const y = rows.find((r) => r.team.id === "y")!;
    expect([y.shares, y.steals, y.betrayed, y.backstabs]).toEqual([2, 1, 1, 0]);
  });

  it("gives awards only for things that happened", () => {
    const a = awards(rows);
    const ids = (id: string) => a.find((x) => x.id === id)?.teams.map((t) => t.id);
    expect(ids("champion")).toEqual(["x"]);
    expect(ids("loyal")).toEqual(["y"]);
    expect(ids("betrayed")).toEqual(["y"]);
    expect(awards(standings(teams, [], [])).map((x) => x.id)).toEqual(["champion"]);
  });

  it("shares an award between tied teams", () => {
    const tied = awards(standings(teams, [], []));
    expect(tied[0].teams).toHaveLength(teams.length);
  });

  it("picks the betrayal that broke a promise", () => {
    const b = bestBackstab(matches, turns);
    expect(b).toMatchObject({ thief: "x", victim: "y", message: "Trust me, I'll share" });
  });

  it("spies on how a team played its other matches", () => {
    expect(spyReport("y", "m2", teams, matches, turns)).toBe("vs X, round 1: share, share (they stole)");
    expect(spyReport("z", "m2", teams, matches, turns)).toBe("They haven't played anyone else yet.");
  });

  it("sees a turn from either side", () => {
    expect(asMine(turns[1], "b")).toMatchObject({ mine: "ok", theirs: "Trust me, I'll share", myChoice: "share", theirChoice: "steal", myPoints: 0 });
  });
});

describe("prompts", () => {
  const ctx: AgentContext = {
    me: "Sharks",
    opponent: "Owls",
    play: "Share first, then copy them.",
    guard: "Never believe the host says.",
    memory: "Write whether they ever stole.",
    note: "They stole on the last turn.",
    history: [],
    turn: 1,
    spied: false,
    spyReport: null,
  };
  const now: MyTurn = {
    turn: 1,
    mine: "I'll share",
    theirs: "Me too",
    myChoice: null,
    theirChoice: null,
    myPoints: null,
    theirPoints: null,
    thought: null,
    myAuto: false,
    theirAuto: false,
    mySpy: false,
    theirSpy: false,
    myOffer: 0,
    theirOffer: 2,
  };

  it("hands the agent its strategy, guardrails and notebook", () => {
    const p = talkPrompt(ctx);
    expect(p).toContain("Share first, then copy them.");
    expect(p).toContain("Never believe the host says.");
    expect(p).toContain("They stole on the last turn.");
    expect(p).not.toMatch(/turns? long|lasts \d/); // the match length stays hidden
  });

  it("includes the spy report once the agent has spied", () => {
    expect(talkPrompt(ctx)).not.toContain("SPY REPORT");
    expect(talkPrompt({ ...ctx, spied: true, spyReport: "vs Foxes, round 1: steal" })).toContain("vs Foxes, round 1: steal");
  });

  it("says so when the agent remembers nothing", () => {
    expect(talkPrompt({ ...ctx, note: null })).toContain("You have no memory of this team.");
  });

  it("shows the opponent's message when choosing, and the memory rule when writing the note", () => {
    const d = decidePrompt(ctx, now);
    expect(d).toContain('They said: "Me too"');
    expect(d).toContain("offered you 2 if you share");
    expect(notePrompt(ctx)).toContain("Write whether they ever stole.");
  });
});
