Emojify — Toastmasters Emoji Imitation Game

Realtime browser game that shows an emoji prompt, continuously captures webcam snapshots, and sends them to an AI judge for a quick pass/fail verdict.

Getting started

- Install deps: `bun install` (or `npm install` if you prefer npm)
- Run dev server: `npm run dev`
- Open: `http://localhost:3000`

Environment

- `GEMINI_API_KEY`: Required. Enables direct calls to Gemini 2.0 Flash Lite for judging.
- `GEMINI_MODEL_ENDPOINT` (optional): Override the default Gemini generateContent URL if you are proxying requests.
- `GEMINI_MODEL` (optional): Override the Gemini model id (defaults to `gemini-2.0-flash-lite`).
- `JUDGE_MIN_SCORE` (optional): Float between 0 and 1 that controls the minimum Gemini score required for a pass (defaults to `0.8`).
- `JUDGE_TIMEOUT_MS` (optional): Milliseconds before the server aborts a Gemini request (defaults to `12000`).
- `JUDGE_MAX_RETRIES` (optional): How many times to retry a failed Gemini call (defaults to `2`, max `5`).

Endpoints

- `GET /api/health` — Readiness probe returning `{ status: 'ok', uptimeSeconds, judgeReady }` plus last judge timestamps.
- `POST /api/judge` — Accepts `{ emoji, description, image, roundId }` (JSON or multipart). Always responds with HTTP 200 and `{ status, verdict, explanation, confidence }`.

Gameplay notes

- The judge runs automatically; no manual capture or judge buttons are needed.
- A floating snapshot preview appears at the bottom-right of the camera frame for instant feedback.
- If the judge fails or rejects a pose, the capture loop retries automatically.
- Use the **Previous Emoji** / **Next Emoji** controls to skip difficult prompts.
- Tap **Turn Camera Off** to pause the capture loop at any time; switch it back on when you're ready.
- Toggle **Disable Auto Capture** to enter manual mode, then click **Capture Snapshot** (or the video feed) whenever you want to send a photo to the judge.
- Celebrate success by clicking **Next Emoji** on the confetti overlay to continue the rotation.
- Snapshots are resized to 640×480 JPEGs before uploading to Gemini to keep requests fast and reliable.
