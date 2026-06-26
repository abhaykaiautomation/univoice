# UniVoice

Zoom-like video conferencing with real-time speech translation (English ⇄ Spanish).

Built incrementally in phases. **Phases 1–3 are done**: plain conferencing, language
identity + client-side audio routing, and the two translator agents passing audio
through untranslated end-to-end (proving subscribe → agent → publish → consume). Real
translation lands in Phase 4 — until then, the "translated" track is just a copy of the
original audio.

## Layout

```
config/   shared TS config (languages, participant + track metadata contracts) used by /web
web/      Next.js client (join screen, video conference room, and the /api/token route
          that issues LiveKit JWTs + requests agent dispatch — deploys as one app)
agents/   LiveKit Agents (Python) translators: en_to_es, es_to_en — long-running
          workers, not deployable to Vercel; run them anywhere with outbound internet
```

This is an npm workspaces monorepo (`config`, `web`) plus a separate Python project
(`agents/`). There's no standalone token server: token issuance lives in
`web/app/api/token/route.ts` so the whole web app (frontend + token endpoint) ships as
a single Vercel deployment. The agents only ever make *outbound* connections to LiveKit
Cloud, so they don't need to be publicly reachable — keep them running on a laptop, a
small VPS, anywhere.

## Prerequisites

- Node.js 20+ (tested with v24)
- Python 3.11+ (tested with 3.12)
- A LiveKit Cloud project (free tier is fine) — get `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET` from https://cloud.livekit.io

## Setup

From the repo root:

```bash
npm install
```

Copy env files and fill in your LiveKit Cloud credentials (same project for both):

```bash
cp web/.env.example web/.env.local
cp agents/.env.example agents/.env
```

Edit both with:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Set up the agents' Python virtualenv:

```bash
cd agents
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Windows
# . .venv/bin/pip install -r requirements.txt     # macOS/Linux
```

## Run locally

Three processes, each in its own terminal, from the repo root:

```bash
npm run dev -w web
```

```bash
cd agents && ./.venv/Scripts/python en_to_es_agent.py dev
```

```bash
cd agents && ./.venv/Scripts/python es_to_en_agent.py dev
```

Open http://localhost:3000 in **two different browser tabs** (or two browsers / devices).
In each tab, enter a display name, pick a language (English or Spanish), and the *same*
room name, then click "Join room". Grant camera/microphone permissions when prompted.

## Deploy the web app to Vercel

The agents can't run on Vercel (they're persistent workers, not serverless functions) —
deploy only `/web`. Keep the agents running wherever you like (your machine is fine);
they connect outbound to LiveKit Cloud regardless of where the web app lives.

```bash
cd web
vercel link        # first time: creates/links the Vercel project
vercel env add LIVEKIT_URL production
vercel env add LIVEKIT_API_KEY production
vercel env add LIVEKIT_API_SECRET production
vercel --prod
```

Repeat the `vercel env add` lines for `preview`/`development` if you want those
environments to work too. Once deployed, anyone can open the Vercel URL from any device
to join a room — the agents on your machine handle translation for all participants
regardless of where they connect from.

## Verify

- Two tabs with the **same** language: both see each other's video and hear each other
  directly (original track, no agent involved).
- Two tabs with **different** languages (e.g. EN and ES): both see each other's video.
  The EN tab's speech reaches the ES tab via the `es`-targeted translation track
  published by `en_to_es` — untranslated audio for now (Phase 4 adds real translation).
  Watch the agent terminals for `started session for <identity>` / `stopped session for
  <identity>` log lines as people start and stop talking.
- No console errors in either tab or agent terminal.
- Same checks work across two different physical devices once `/web` is deployed.

## What's next

- **Phase 4** — real speech-to-speech translation via `OpenAIRealtimeTranslateProvider`.
- **Phase 5** — captions, active-speaker indicator, ducking, AEC sanity pass.

Stop and wait for go-ahead between phases.
