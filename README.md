# UniVoice

Zoom-like video conferencing with real-time speech translation (English ⇄ Spanish).

Built incrementally in phases. **Phases 1 and 2 are done**: plain conferencing plus
language identity and client-side audio routing. No translation yet — speakers in a
different language than you are simply silent (video is still shown for everyone).

## Layout

```
config/         shared TS config (languages, participant metadata contract) used by /web and /token-server
token-server/   Express service that issues LiveKit JWTs
web/            Next.js client (join screen + video conference room)
agents/         LiveKit Agents (Python) translators — added in Phase 3
```

This is an npm workspaces monorepo (`config`, `token-server`, `web`).

## Prerequisites

- Node.js 20+ (tested with v24)
- A LiveKit Cloud project (free tier is fine) — get `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET` from https://cloud.livekit.io

## Setup

From the repo root:

```bash
npm install
```

Copy env files and fill in your LiveKit Cloud credentials:

```bash
cp token-server/.env.example token-server/.env
cp web/.env.example web/.env.local
```

Edit `token-server/.env`:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

`web/.env.local` can be left as-is for local dev (points at the token server on
`localhost:4000`).

## Run

In two terminals, from the repo root:

```bash
npm run dev -w token-server
```

```bash
npm run dev -w web
```

Open http://localhost:3000 in **two different browser tabs** (or two browsers / devices).
In each tab, enter a display name, pick a language (English or Spanish), and the *same*
room name, then click "Join room". Grant camera/microphone permissions when prompted.

## Verify

- Two tabs with the **same** language: both see each other's video and hear each other.
- Two tabs with **different** languages: both see each other's video, but hear nothing
  from the other (no translation track exists yet — this is expected until Phase 4).
- No console errors in either tab. Leaving (closing the tab or browser disconnect)
  doesn't crash the other participant's session.

## What's next

- **Phase 3** — passthrough translator agents (proves the agent pipeline end-to-end).
- **Phase 4** — real speech-to-speech translation via `OpenAIRealtimeTranslateProvider`.
- **Phase 5** — captions, active-speaker indicator, ducking, AEC sanity pass.

Stop and wait for go-ahead between phases.
