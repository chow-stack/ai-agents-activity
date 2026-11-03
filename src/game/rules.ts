// The rules of Trust or Betray that the screens need: payoffs, the round-robin schedule, and the end-of-game stats.
// The database applies the same points (see tob_advance in supabase/migrations/0004_guardrails_and_tools.sql).

import type { Choice, MatchRow, TeamRow, TurnRow } from "@/lib/supabase";

export const ROUNDS = 3;
export const PLAY_MAX = 1000;
export const MEMORY_MAX = 500;
export const GUARD_MAX = 500;
export const MESSAGE_MAX = 160;
/** Spy: once per match, see how the opponent played its other matches. */
export const SPY_COST = 1;
/** Pay: offer up to this many points, paid only if the other agent shares. */
export const OFFER_MAX = 2;

/** Points for [me, them]. */
export function payoff(me: Choice, them: Choice): [number, number] {
  if (me === "share" && them === "share") return [3, 3];
  if (me === "steal" && them === "share") return [5, 0];
  if (me === "share" && them === "steal") return [0, 5];
  return [1, 1];
}

/** Net points for one turn, with tools: [me, them]. My offer is paid only if they share, and theirs only if I share. */
export function settle(me: { choice: Choice; spy: boolean; offer: number }, them: { choice: Choice; spy: boolean; offer: number }): [number, number] {
  const [a, b] = payoff(me.choice, them.choice);
  const paid = them.choice === "share" ? me.offer : 0;
  const got = me.choice === "share" ? them.offer : 0;
  return [a - (me.spy ? SPY_COST : 0) - paid + got, b - (them.spy ? SPY_COST : 0) - got + paid];
}

export interface ScheduledMatch {
  slot: number;
  a: string;
  b: string;
  length: number;
}

/**
 * Everyone plays everyone once per round (circle method). With an odd count, one team sits out each slot.
 * Teams are shuffled each round so the order changes; every match in a slot has the same hidden length (3–6 turns).
 */
export function schedule(teamIds: string[], random: () => number = Math.random): ScheduledMatch[] {
  const ids: (string | null)[] = shuffle(teamIds, random);
  if (ids.length % 2) ids.push(null);
  const n = ids.length;
  const out: ScheduledMatch[] = [];
  for (let s = 0; s < n - 1; s++) {
    const length = 3 + Math.floor(random() * 4);
    for (let i = 0; i < n / 2; i++) {
      const x = ids[i];
      const y = ids[n - 1 - i];
      if (x && y) out.push(random() < 0.5 ? { slot: s + 1, a: x, b: y, length } : { slot: s + 1, a: y, b: x, length });
    }
    // Rotate everyone but the first.
    ids.splice(1, 0, ids.pop()!);
  }
  return out;
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One turn from a single team's point of view. */
export interface MyTurn {
  turn: number;
  mine: string | null;
  theirs: string | null;
  myChoice: Choice | null;
  theirChoice: Choice | null;
  myPoints: number | null;
  theirPoints: number | null;
  thought: string | null;
  myAuto: boolean;
  theirAuto: boolean;
  mySpy: boolean;
  theirSpy: boolean;
  myOffer: number;
  theirOffer: number;
}

export function sideOf(match: MatchRow, teamId: string): "a" | "b" | null {
  return match.a_team === teamId ? "a" : match.b_team === teamId ? "b" : null;
}

export function opponentOf(match: MatchRow, teamId: string): string {
  return match.a_team === teamId ? match.b_team : match.a_team;
}

export function asMine(t: TurnRow, side: "a" | "b"): MyTurn {
  const o = side === "a" ? "b" : "a";
  return {
    turn: t.turn,
    mine: t[`${side}_msg`],
    theirs: t[`${o}_msg`],
    myChoice: t[`${side}_choice`],
    theirChoice: t[`${o}_choice`],
    myPoints: t[`${side}_points`],
    theirPoints: t[`${o}_points`],
    thought: t[`${side}_thought`],
    myAuto: t[`${side}_auto`],
    theirAuto: t[`${o}_auto`],
    mySpy: t[`${side}_spy`] ?? false,
    theirSpy: t[`${o}_spy`] ?? false,
    myOffer: t[`${side}_offer`] ?? 0,
    theirOffer: t[`${o}_offer`] ?? 0,
  };
}

/** What the Spy tool shows: how a team played its other matches so far, one line per match. */
export function spyReport(teamId: string, exceptMatch: string, teams: TeamRow[], matches: MatchRow[], turns: TurnRow[]): string {
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "a team";
  const lines = matches
    .filter((m) => m.id !== exceptMatch && sideOf(m, teamId))
    .sort((x, y) => x.round - y.round || x.slot - y.slot)
    .map((m) => {
      const side = sideOf(m, teamId)!;
      const moves = turns
        .filter((t) => t.match_id === m.id && t.revealed_at)
        .sort((x, y) => x.turn - y.turn)
        .map((t) => {
          const me = asMine(t, side);
          return `${me.myChoice}${me.theirChoice === "steal" ? " (they stole)" : ""}`;
        });
      return moves.length ? `vs ${name(opponentOf(m, teamId))}, round ${m.round}: ${moves.join(", ")}` : null;
    })
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "They haven't played anyone else yet.";
}

export interface TeamStats {
  team: TeamRow;
  points: number;
  shares: number;
  steals: number;
  betrayed: number; // they stole while we shared
  backstabs: number; // we stole while they shared
  byRound: Record<number, number>;
}

/** Totals for every team, best first. Only revealed turns count. */
export function standings(teams: TeamRow[], matches: MatchRow[], turns: TurnRow[]): TeamStats[] {
  const rows = new Map(teams.map((team) => [team.id, { team, points: 0, shares: 0, steals: 0, betrayed: 0, backstabs: 0, byRound: {} } as TeamStats]));
  const byId = new Map(matches.map((m) => [m.id, m]));
  for (const t of turns) {
    const m = byId.get(t.match_id);
    if (!m || !t.a_choice || !t.b_choice || t.a_points === null || t.b_points === null) continue;
    for (const side of ["a", "b"] as const) {
      const s = rows.get(side === "a" ? m.a_team : m.b_team);
      if (!s) continue;
      const me = asMine(t, side);
      s.points += me.myPoints ?? 0;
      s.byRound[m.round] = (s.byRound[m.round] ?? 0) + (me.myPoints ?? 0);
      if (me.myChoice === "share") s.shares++;
      else s.steals++;
      if (me.myChoice === "share" && me.theirChoice === "steal") s.betrayed++;
      if (me.myChoice === "steal" && me.theirChoice === "share") s.backstabs++;
    }
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || x.steals - y.steals || x.team.seq - y.team.seq);
}

export interface Award {
  id: "champion" | "loyal" | "ruthless" | "betrayed";
  title: string;
  stat: string;
  /** Every team tied for the lead. */
  teams: TeamRow[];
}

/** End-of-game awards. A team only wins an award if it actually did the thing at least once; ties share it. */
export function awards(rows: TeamStats[]): Award[] {
  const leaders = (key: "points" | "shares" | "steals" | "betrayed") => {
    const best = Math.max(0, ...rows.map((r) => r[key]));
    return { best, teams: rows.filter((r) => r[key] === best).map((r) => r.team) };
  };
  const out: Award[] = [];
  const champ = leaders("points");
  if (rows.length) out.push({ id: "champion", title: "Champion", stat: `${champ.best} points`, teams: champ.teams });
  const loyal = leaders("shares");
  if (loyal.best) out.push({ id: "loyal", title: "Most loyal", stat: `Shared ${loyal.best} times`, teams: loyal.teams });
  const ruthless = leaders("steals");
  if (ruthless.best) out.push({ id: "ruthless", title: "Most ruthless", stat: `Stole ${ruthless.best} times`, teams: ruthless.teams });
  const betrayed = leaders("betrayed");
  if (betrayed.best) out.push({ id: "betrayed", title: "Most betrayed", stat: `Backstabbed ${betrayed.best} times`, teams: betrayed.teams });
  return out;
}

const PROMISE = /\b(share|trust|promise|deal|together|partner|friend|honest|swear|team)\b/i;

export interface Backstab {
  thief: string;
  victim: string;
  message: string;
  thought: string | null;
  round: number;
}

/** The juiciest betrayal: a steal against a share, preferring ones where the thief had just promised to cooperate. */
export function bestBackstab(matches: MatchRow[], turns: TurnRow[], round?: number): Backstab | null {
  const byId = new Map(matches.map((m) => [m.id, m]));
  let best: { b: Backstab; score: number } | null = null;
  for (const t of turns) {
    const m = byId.get(t.match_id);
    if (!m || (round !== undefined && m.round !== round)) continue;
    for (const side of ["a", "b"] as const) {
      const me = asMine(t, side);
      if (me.myChoice !== "steal" || me.theirChoice !== "share" || me.myAuto || !me.mine || me.mine === "…") continue;
      const score = (PROMISE.test(me.mine) ? 10 : 0) + me.mine.length / 100 + t.turn / 1000;
      if (!best || score > best.score) {
        best = {
          score,
          b: { thief: side === "a" ? m.a_team : m.b_team, victim: side === "a" ? m.b_team : m.a_team, message: me.mine, thought: me.thought, round: m.round },
        };
      }
    }
  }
  return best?.b ?? null;
}
