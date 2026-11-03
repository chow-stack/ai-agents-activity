# Trust or Betray

Gen AI Club AI agents meeting activity. Each team of 3 builds an AI agent by writing a three-line strategy card, then the agents play share/steal against every other team's agent. The agents are real: each one runs on Gemini with the team's own key. The main skill is persuasion: the other agent is an AI that reads every message, so teams try to talk it into sharing, and write guardrails so theirs can't be tricked. Each turn the agents talk (and can use a tool), then secretly pick **share** or **steal**:

| | They share | They steal |
|---|---|---|
| **You share** | 3 / 3 | 0 / 5 |
| **You steal** | 5 / 0 | 1 / 1 |

**Tools**, used during Talk:
- **Spy** (costs 1 point, once per match): see how the opponent played its other matches.
- **Pay** (0–2 points): offer points if the other agent shares. Paid automatically at the reveal, only if it really shared. A bribe-then-steal still works: you pay, they share, you take the 5.

Same stack, colors and fonts as [Workflow Lab](../workflow-activity).

## How a session runs (5–6 teams of 3)

| Step | Time | What happens |
|---|---|---|
| Join | 3 min | One laptop per team opens the site, enters the room code, a team name and a Gemini key. The laptop then says "look up". |
| Slideshow | 6 min | Host presents 9 slides on the projector (arrow keys work on the host laptop): the agent, persuasion, share/steal, the two tools, guardrails and prompt injection, memory, the card, the tournament. The last → starts strategy time. |
| Strategy | ~6 min | Teams write the card: **How your agent plays** (including when to spy or pay), **Guardrails** (what it never does, believes or reveals), and **What it remembers**. A practice match against Mirror Bot, who copies your last move but shares when paid, shows what the agent would do. Teams press "We're ready". |
| Round 1–3 | ~5 min each | Round robin: every agent plays every other agent once. With an odd team count one team sits out each match. Every match lasts a hidden 3–6 turns. |
| Breaks | 3 min | Projector shows standings and the backstab of the round. Laptops show the team's matches and its agent's notebook, and teams fix the card. |
| Results | — | After round 3 the projector waits on "And the results are in…" until the host reveals the awards: Champion, Most loyal, Most ruthless, Most betrayed (ties share), plus the full leaderboard. |

### Memory
The agent is stateless: every move is a fresh Gemini call. Inside a match it sees the whole chat so far. Across matches it only has its notebook: after each match it writes one note about its opponent, following the team's "What it remembers" line, and reads that note the next time they meet. A blank line means no notes, so the agent forgets everyone.

## Routes

- `/` join with the room code, then a team name (`/?room=CODE` prefills the code)
- `/play` the team laptop: key setup, look-up screen, strategy card, live match, results
- `/host` create and run a room: Lobby → Intro → Strategy → Round 1–3 → Results. Only the laptop that created the room can control it
- `/board?room=CODE` the projector

## Gemini keys

- The key is stored only in the team laptop's browser (`localStorage`) and sent only to Google. It never reaches Supabase.
- Calls use the Interactions API with `gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite` when the first hits its rate limit (limits are per model). About 2 calls per turn plus 1 note per match. Test teams that listen use the host's key for all of them, so a free key may hit its rate limit with many test teams; their late moves fall back to the script.
- The team's laptop must keep the tab open and in front during rounds; browsers slow down background tabs. A move that doesn't arrive in ~45 s is filled in as "share" with no message, and the host's **Stop waiting on slow agents** does the same right away.

## Run locally

```bash
npm install
cp .env.example .env.local   # same Supabase URL + publishable key as Workflow Lab
npm run dev
```

**Test teams:** on `/host`, **Add test team** (lobby, strategy time or a break) adds a team with a ready-made card: Nice Bot (trusting), Copycat Bot (copies your last move), Sneaky Bot (sweet-talks, then steals), Tough Bot (spies, only shares if paid or earned). By default the database plays them with a fixed script that ignores messages. Paste a Gemini key under the team list and press **Make them listen**: the host laptop then plays them through the same agent as real teams, so they read your messages, use Spy and Pay, and follow their guardrails. Keep the host tab open; any move that's 20 seconds late falls back to the script. Join as a real team in another tab to play against them.

**Rehearse without Gemini:** in development only, the key `dev` swaps in a scripted agent. To be several teams on one computer, give each its own origin so storage is separate: `http://team1.localhost:3000/play`, `http://team2.localhost:3000/play`, and so on.

## Tests

```bash
npm test
```

## Where things live

- `src/game/rules.ts` payoffs and tools (`settle`), spy reports, round-robin schedule, standings, awards, backstab of the round
- `src/game/agent.ts` the prompts (talk with tools, decide, note) and the Gemini calls
- `src/game/practice.ts` the Mirror Bot practice match (runs in the browser, not saved)
- `src/lib/worker.ts` runs the team's agent on its laptop during a round (and the test teams on the host's laptop)
- `src/components/host/TestTeams.tsx` the "make them listen" switch for test teams
- `src/components/board/` slideshow and live match cards for the projector
- `supabase/migrations/0002_trust_or_betray.sql` schema and game engine; `0003_test_bots.sql` adds test teams; `0004_guardrails_and_tools.sql` adds guardrails, Spy, Pay and test teams that listen; `0005_longer_strategy_cards.sql` raises the card limits to 1000/500/500 characters. Shares Workflow Lab's Supabase project; every object is prefixed `tob_`. Clients only read; all writes go through functions that check the room's phase.

## Deploy

Import the repo in Vercel and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the same values as Workflow Lab).
