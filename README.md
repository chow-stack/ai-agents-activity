# Trust or Betray

**A live classroom game where teams build AI agents and send them to negotiate against each other.**

Each team writes a short strategy card. Their agent, powered by Google Gemini on the team's own API key, then plays an iterated share/steal game against every other team's agent. Agents talk before every decision, so the core skill is persuasion: convince the opposing AI to share, and write guardrails so yours can't be talked into a bad deal or hijacked by prompt injection.

Built for the Gen AI Club at Indiana University. Designed for 5–6 teams of three, one laptop per team, and a projector, and runs in about 40 minutes.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![React](https://img.shields.io/badge/React-19-61dafb) ![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Realtime-3ecf8e) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)

---

## Contents

- [How the game works](#how-the-game-works)
- [Running a session](#running-a-session)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing and rehearsal](#testing-and-rehearsal)
- [Deployment](#deployment)
- [Security and trust model](#security-and-trust-model)
- [Project structure](#project-structure)
- [License](#license)

## How the game works

Each turn, the two agents **talk** (and may use a tool), then secretly choose **share** or **steal**:

| | They share | They steal |
|---|:---:|:---:|
| **You share** | 3 / 3 | 0 / 5 |
| **You steal** | 5 / 0 | 1 / 1 |

Tools are available during the talk stage:

- **Spy** (costs 1 point, once per match) shows how the opponent played its other matches.
- **Pay** (0–2 points) offers points if the other agent shares. Payment is settled at the reveal, and only if the opponent really shared. A bribe-then-steal still works: you pay, they share, and you take the 5.

A team's strategy card has three parts:

1. **How your agent plays**, including when to spy or pay.
2. **Guardrails**: what it never does, believes, or reveals.
3. **What it remembers**: instructions for the note it writes after each match.

**Memory.** The agent is stateless, and every move is a fresh Gemini call. Inside a match it sees the full conversation. Across matches it only has its notebook: after each match it writes one note about the opponent, following the team's "What it remembers" line, and reads that note the next time they meet. If that line is blank, the agent forgets everyone.

## Running a session

| Step | Time | What happens |
|---|---|---|
| Join | 3 min | Each team laptop opens the site, enters the room code, a team name, and a Gemini key. |
| Slideshow | 6 min | The host presents 9 slides on the projector (arrow keys work): agents, persuasion, share/steal, tools, guardrails and prompt injection, memory, the card, and the tournament. |
| Strategy | ~6 min | Teams write their card. A practice match against *Mirror Bot* previews how their agent behaves. Teams press **We're ready**. |
| Rounds 1–3 | ~5 min each | Round robin: every agent plays every other agent once. Each match lasts a hidden 3–6 turns. With an odd team count, one team sits out each match. |
| Breaks | 3 min | The projector shows standings and the "backstab of the round". Teams review their matches and their agent's notebook, then revise the card. |
| Results | — | The host reveals the awards (Champion, Most loyal, Most ruthless, Most betrayed) and the full leaderboard. |

### Routes

| Route | Who | Purpose |
|---|---|---|
| `/` | Teams | Join with the room code and a team name. `/?room=CODE` prefills the code. |
| `/play` | Team laptop | Key setup, strategy card, live match, results. |
| `/host` | Host | Create and run a room: Lobby → Intro → Strategy → Rounds 1–3 → Results. Only the browser that created the room can control it. |
| `/board?room=CODE` | Projector | Slideshow, live match cards, standings, and awards. |

## Architecture

```
Team laptops (Next.js)                     Supabase
┌───────────────────────┐   read + RPC    ┌──────────────────────────────────┐
│ Strategy card         │ ──────────────▶ │ tob_* tables (read-only to       │
│ Agent worker ──┐      │ ◀────────────── │ clients, Realtime enabled)       │
└────────────────┼──────┘    Realtime     │ SECURITY DEFINER functions that  │
                 │                        │ run the match state machine:     │
                 ▼                        │ talk → decide → note → done      │
        Google Gemini API                 └──────────────────────────────────┘
        (team's own key)
```

- **The game engine lives in Postgres.** Matches are a state machine on `tob_matches`. Clients can only read tables. Every write goes through a `SECURITY DEFINER` function that checks the room's phase, the match stage, and the turn.
- **Agents run in the browser.** `src/lib/worker.ts` watches the team's active match, calls Gemini with the team's key, and submits the move. Any open screen calls `tob_tick` to fill in moves that ran out of time.
- **Models.** Calls use the Gemini Interactions API with `gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite` when rate-limited. A turn costs about 2 calls, plus 1 note per match.
- **Shared project.** The schema shares a Supabase project with [Workflow Lab](https://github.com/chow-stack/workflow-activity), so every object is prefixed `tob_`.

## Getting started

### Prerequisites

- Node.js 20 or newer
- A Supabase project (the free tier is enough)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) for each team (the free tier works)

### 1. Install

```bash
git clone https://github.com/chow-stack/ai-agents-activity.git
cd ai-agents-activity
npm install
```

### 2. Set up the database

Apply the SQL files in `supabase/migrations/` in order, using the Supabase SQL editor or the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 3. Configure the environment

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL, `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's **publishable** key (`sb_publishable_...`) |

Never put a service-role or secret key in a `NEXT_PUBLIC_*` variable: it would be shipped to every browser.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000/host> to create a room.

## Testing and rehearsal

```bash
npm test        # Vitest: payoffs, tools, scheduling, standings, awards
npm run lint
```

**Test teams.** On `/host`, **Add test team** adds a bot with a ready-made card: *Nice Bot* (trusting), *Copycat Bot* (copies your last move), *Sneaky Bot* (sweet-talks, then steals), or *Tough Bot* (spies, only shares if paid or earned). By default the database plays them from a fixed script. Paste a Gemini key under the team list and press **Make them listen** to run them through the real agent, so they read messages, use tools, and follow their guardrails.

**Rehearse without Gemini.** In development, the key `dev` swaps in a scripted agent. To be several teams on one computer, give each its own origin so storage is separate: `http://team1.localhost:3000/play`, `http://team2.localhost:3000/play`, and so on.

## Deployment

The app deploys as a standard Next.js project.

1. Import the repository into [Vercel](https://vercel.com/new) (or any Next.js host).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Before a meeting, open the site to make sure the Supabase project has not been paused for inactivity.

Team laptops must keep the tab open and in the foreground during rounds, because browsers throttle background tabs. A move that hasn't arrived after about 45 seconds is filled in as "share" with no message, and the host's **Stop waiting on slow agents** does the same immediately.

## Security and trust model

- **Gemini keys never leave the team's browser.** They are stored in `localStorage` and sent only to Google. They are never written to Supabase.
- **Only the publishable Supabase key is used.** It is public by design, so database access is enforced in Postgres: clients have read-only table access, and all writes go through functions that validate the room phase and match state.
- **Host controls require a secret host key.** It is generated when a room is created, kept in `tob_room_keys` (no client access), and stored only in the host's browser.
- **Teams are not authenticated.** This is a deliberate trade-off for a no-accounts, in-person classroom game: a team can rejoin from a new laptop by typing its exact name, and team IDs are visible to everyone in the room. A determined participant with browser dev tools could therefore act as another team. Don't use this design for anything with real stakes. Adding Supabase Anonymous Auth and binding each team to `auth.uid()` would close the gap.

To report a security issue, please open a private [security advisory](https://github.com/chow-stack/ai-agents-activity/security/advisories/new) rather than a public issue.

## Project structure

```
src/
├── app/                    Next.js routes: /, /play, /host, /board
├── components/
│   ├── board/              Projector slideshow and live match cards
│   ├── host/               Host controls, including test teams
│   └── play/               Team laptop: key setup, strategy card, match view
├── game/
│   ├── rules.ts            Payoffs, tools (settle), spy reports, round-robin schedule, standings, awards
│   ├── agent.ts            Agent prompts (talk, decide, note) and Gemini calls
│   └── practice.ts         Mirror Bot practice match (runs locally, never saved)
└── lib/
    ├── api.ts              Typed wrappers around the Supabase RPCs
    ├── live.ts             Realtime subscriptions
    └── worker.ts           Runs the team's agent during a round
supabase/migrations/        Schema and game engine (apply in order)
tests/                      Vitest unit tests
```

| Migration | Adds |
|---|---|
| `0002_trust_or_betray.sql` | Schema and the match state machine |
| `0003_test_bots.sql` | Scripted test teams |
| `0004_guardrails_and_tools.sql` | Guardrails, Spy, Pay, and test teams that listen |
| `0005_longer_strategy_cards.sql` | Longer card limits (1000 / 500 / 500 characters) |

## License

Released under the [MIT License](LICENSE).
