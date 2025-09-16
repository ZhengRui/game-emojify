# Emojify Agents

## Purpose
This document tracks the non-human agents that power the Toastmasters Emoji Imitation Game. It explains why each agent exists, the data it expects, and how other parts of the system should interact with it. Keep this file up to date so anyone touching the project understands how automation pieces fit together.

## Judge API Agent (`/api/judge`)
- **Role**: Decide whether the latest webcam snapshot matches the prompted emoji.
- **Input payload**: JSON containing the emoji identifier, a short textual description, and the captured image encoded as base64 PNG/JPEG. Accept multipart form data as an alternative when file uploads are easier.
- **Output**: Structured JSON (`{ verdict: 'pass' | 'fail', explanation: string, confidence: number }`). Always return HTTP 200 with the payload; use `status: 'error'` inside the body if something goes wrong so the UI can keep polling.
- **Implementation notes**:
  - Forward the payload to Gemini 2.0 Flash Lite using a strict rubric that explains what constitutes a pass. Include the emoji name and description in the prompt so the model has context.
  - Enforce a tunable timeout (`JUDGE_TIMEOUT_MS`, default 12s) and retry failed calls up to `JUDGE_MAX_RETRIES` times with a short backoff. Surface warnings when Gemini is unreachable so the host knows to retry.
  - Log round id, emoji, verdict, and the judge narrative for recap mode. Mask or hash any image data after the decision to avoid storing raw photos.
  - Require `GEMINI_API_KEY` in the environment. Use `JUDGE_MIN_SCORE` to tune the score threshold for passing verdicts.

## Emoji Cycle / Capture Agent (client state machine)
- **Role**: Runs in the Next.js client page, cycling through emojis, handling camera permissions, capturing frames, and coordinating Judge calls.
- **Responsibilities**:
  - Prefetch the next emoji while the current round is in progress.
  - Manage the camera preview with `navigator.mediaDevices.getUserMedia`, capture stills via canvas on a rolling timer, and automatically send them to `/api/judge` until the round succeeds. Downscale snapshots to 640×480 JPEG to reduce latency before calling Gemini.
  - Maintain local state: `{ currentEmoji, nextEmoji, snapshotDataUrl, judgeState, celebrationVisible }` so the UI can reflect the realtime loop.
  - Render clear status cues: idle, capturing, awaiting judge, success, failure, and error; surface the judge’s explanation and confidence when available.
  - Show the most recent snapshot as a floating preview in the camera frame and expose **Previous / Next Emoji** controls for quick skips.
  - Offer camera and auto-capture toggles; when auto capture is disabled, trigger the judge only when the host clicks the capture button or video feed.
  - Provide a camera toggle so hosts can pause/resume the capture loop without leaving the page.

## Health Check Agent (`/api/health`)
- **Role**: Lightweight readiness probe to confirm the app is online before a meeting.
- **Response**: `{ status: 'ok', uptimeSeconds, judgeReady: boolean }`. `judgeReady` should reflect whether the Judge API can reach the external model provider. Include recent success/failure timestamps to help operators diagnose outages.
- **Usage**: Hit this endpoint from monitoring dashboards or a CLI script during event setup.

## Operational Guidance
- When adding new agents (e.g. emoji quiz scoring, leaderboard, analytics), document them here with the same structure: role, input/output, dependencies, failure modes.
- Treat this file as the single source of truth for automated components so multiple contributors—or future AI assistants—have aligned expectations.
