# Molsters

Molsters connects homeowners with local repair pros.

1. A customer opens a job with an address, ZIP code and photos of the problem.
2. A Claude-powered assistant looks at the photos. It can ask for more shots or follow-up details.
3. It writes a job report: category, urgency, likely cause and cost range.
4. The job goes one of two ways:
   - It goes on an open board, where matching providers (by trade and ZIP) can accept it.
   - It goes to a support agent, who reviews it and assigns a provider.
5. The job moves through *en route*, *in progress* and *completed*. Everyone on the job can message each other.

Molsters is a **mobile app** you run on your iPhone with **Expo Go**. It has three parts:

| Folder | What it is |
| --- | --- |
| `mobile/` | The app: Expo SDK 58, React Native, Expo Router. All screens for customers, pros and support agents. |
| repo root | The API server: Next.js 15 route handlers, SQLite via better-sqlite3 + Drizzle, Claude via the Anthropic SDK. It runs on your computer and the phone talks to it over Wi-Fi. |
| `shared/` | Types and schemas used by both. |

The Claude API key, database and photos stay on your computer. They're never shipped inside the app.

---

## Scope: the homeowner flow (SOON26)

The **customer** side of the app now runs the Scope flow from `SOON26.md`. The older open-board flow above still exists for the provider and agent screens.

1. **Home**: a big **Scan a problem** button, with the Home Record (every scan and job for this home) below it.
2. **Scan**: full-screen camera, one shot at a time from the trade template. Claude (`claude-sonnet-5-5`, JSON-only, validated with zod) checks each photo. Blurry, dark, wrong subject, or a face or document in frame means a retake. Optional shots can be skipped with a reason ("There's no wall next to it").
3. **Clarify**: the template's questions as tap chips, plus an optional note.
4. **Spec**: Claude writes the JobSpec (title, summary, severity 1-5, area m², confidence 0-1, template fields). It never prices. The price is `(base + per_m2 × area) × severity_multiplier[severity-1]`, ±15%, from the provider's rate card, labelled "Estimate — confirmed by provider".
5. **Matching**: providers for the trade within their radius, best rating first, then shortest ETA. **Book [Provider] · [time]** sends the spec to that pro.
6. **Track**: polls every 2 s. Waiting → booked (slot + confirmed price) → on the way (ETA countdown) → done → 5-star rating, which updates the provider's rating.
7. **Fallbacks**: confidence under 0.6 goes straight to human review with the spec attached. If no provider is in range, the homeowner can book a virtual call (Mold Busters for mold). If a pro declines, the next pro is offered.

**Adding a trade means adding a file** to `templates/` (`mold.json` and `plumbing_sink.json` ship). The format is checked by `templateSchema` in `shared/scope.ts`, and templates are re-read on every request in dev.

**Demo data**: `npm run db:seed` creates five providers around `DEMO_LAT`/`DEMO_LNG` (default: downtown Montreal) and a "Demo house" for `customer@demo.com`. Northshore Mold Co is deliberately out of range. To move the demo to the venue, set both variables and run the seed again. Rate cards and ratings are kept. New homeowner accounts set their home with **Use my current location**.

### Connecting a UI

Any UI (a Next page in this app, a separate web app, or the Expo app) can use **`shared/scope-client.ts`**. It's a typed client with one function per endpoint and no dependencies:

```ts
import { createScopeClient } from "@/shared/scope-client"; // or a relative path

const api = createScopeClient({ baseUrl: "http://localhost:3000", getToken: () => localStorage.getItem("token") });
const { token } = await api.auth.login("customer@demo.com", "password123"); // store it
const { id } = await api.homeowner.startScan("mold");
const scan = await api.homeowner.scan(id);                 // ScanResponse: render from scan.status
await api.homeowner.uploadShot(id, scan.remainingShots[0], file);
const queue = await api.pro(1).queue();                     // Mold Busters' dashboard
```

- **Same Next app:** use `baseUrl: ""`.
- **Another origin** (Vite, Expo web, a tunnel): CORS is open for `/api/*`. Auth is a bearer token, never cookies. Set `CORS_ORIGINS` to restrict it.
- **Errors** throw `ScopeApiError` with the server's message (safe to show) and `status`.
- **Images:** use `api.photoSrc(photo)` for `<img src>`.
- **No API key, or saving credits:** run `npm run dev:fake`. Shot checks and specs come back instantly and free:
  - Any photo under 2 KB (e.g. a black frame) is rejected; anything else passes.
  - A note containing "handoff" gives confidence 0.45, which goes to review.
- **Health:** `GET /api/health` reports `{ ai: "claude" | "fake" | "missing_key" }`.

#### Homeowner screens → endpoints

Every action returns the full `ScanResponse` unless noted. Render the screen from `scan.status` and `job.status`, and poll `GET /api/scans/:id` every 2 s.

| Screen | Show when | Calls |
| --- | --- | --- |
| Home | always | `GET /api/home` → `{ home, record }`. If `home` is null, `PUT /api/home { address, lat, lng }`. |
| Pick trade | | `GET /api/templates`, then `POST /api/scans { trade }` → `{ id }` |
| Scan | `scan.status = capturing` | Next shot = `remainingShots[0]` (prompt in `template.required_shots`). `POST /api/scans/:id/shots` (form: `shotId`, `photo`) → `ShotResult`; `ok:false` means show `message` and retake. Optional shots: `POST /skip { shotId }` → `ShotResult`. |
| Clarify | `clarifying` | `POST /finish { answers: { [questionId]: option }, notes? }`. During an ask-for-more, only `scan.focus.questionIds` are asked. |
| Spec | `spec_ready`, or `job.status = declined` | `spec`, `matches[]` (ranked, each with `quote` and `slots`). `POST /book { providerId }`, `POST /human`. If `matches` is empty: `POST /virtual-call`. |
| Track | `submitted` | `job.status`: `pending` · `handoff` · `virtual_call` · `accepted` (slot, price) · `en_route` (`eta`) · `done` → `POST /rate { stars }` · `more_info` → `POST /reopen`, then back to Scan/Clarify. `POST /cancel` any time before accepted. |

All paths are under `/api/scans/:id`. `shared/scope.ts` has the labels (`JOB_STATUS_LABELS`, `ESTIMATE_LABEL`, `slotLabel`, `priceRange`).

#### End-to-end test

```bash
npm run dev:fake      # terminal 1 (or npm run dev for real Claude)
npm run test:e2e      # terminal 2; E2E_BASE_URL=http://localhost:3001 for another port
```

It drives every flow through the same client a UI uses:

- happy path with a retake, skip, booking, accept, en route, done and rating;
- ask for more;
- decline and rebook;
- human and low-confidence handoff;
- no pro in range, leading to a virtual call;
- a rate-card change;
- a cancel;
- the second trade;
- access control and CORS.

It signs up a throwaway homeowner, then deletes that data and restores ratings and rate cards. Pass `-- --keep` to leave the data so you can look at it in a UI. With real Claude, AI-dependent checks become warnings (the test photos are drawings, so Claude often scores them below 0.6 and hands off).

### Pro side integration (`/pro`, no auth)

The dashboard picks its provider with `?provider=<id>` (the seed prints the ids; Mold Busters is `1`). Every endpoint below takes that query parameter. Response types are in `shared/scope.ts` (`ProQueueResponse`, `ProJobDetail`, `ProProvider`, `RateCard`).

| Method | Path | Body | Does |
| --- | --- | --- | --- |
| GET | `/api/pro/providers` | | All providers (for a picker) |
| GET | `/api/pro/queue` | | Tabs `new` (pending) · `review` (handoff, virtual_call) · `active` (accepted, en_route) · `done`. Each card has trade, title, severity, area, confidence, distance, age and a quote **priced with this provider's current rate card**. Poll every 2 s. |
| GET | `/api/pro/jobs/:id` | | Spec detail: photos labelled by shot, summary, fields, answers, notes, quote, 3 time slots. The exact address appears once the job is this provider's. |
| POST | `/api/pro/jobs/:id/accept` | `{ slot: ISO, price }` | Price must be inside the quote range. → `accepted`; the phone shows the booking. |
| POST | `/api/pro/jobs/:id/ask-more` | `{ shotIds, questionIds, message? }` | → `more_info`. The phone rescans only those items; the job then returns to `new` with a new spec version. |
| POST | `/api/pro/jobs/:id/decline` | | → `declined`; the phone offers the next pro or a virtual call. |
| POST | `/api/pro/jobs/:id/virtual-call` | | Needs review → route to a virtual call. |
| POST | `/api/pro/jobs/:id/status` | `{ to: "en_route" \| "done" }` | Active-job stepper. `en_route` sets the ETA from distance. |
| GET / PUT | `/api/pro/rate-card` | `{ base, per_m2, severity_multiplier: [5 numbers] }` | New quotes use it immediately. |
| GET | `photos[].src` | | Photo bytes. `src` is a signed link that works on its own for 24 h, so put it straight in `<img src>` (prefix the API origin if the UI is on another origin). `photos[].url?provider=<id>` also works. |

Actions return the updated `ProJobDetail`. Errors are `{ error }` with 400/404/409. Server logic lives in `lib/scope/` (`pro.ts` for these endpoints).

---

## Prerequisites

- **Node.js 20 or newer** (tested with Node 22) and npm.
- **No C++ build tools are needed.** better-sqlite3 ships prebuilt binaries for Windows, macOS and Linux.
- An **Anthropic API key** for the AI intake step. Everything else works without one.

## Run it locally

All commands run from the project root (the folder with `package.json`).

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

If `.env.local` already exists, skip the copy (it may hold a secret you want to keep) and just check its values. Otherwise copy the example file:

```powershell
# Windows PowerShell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

```bash
# macOS / Linux / Git Bash
[ -f .env.local ] || cp .env.example .env.local
```

Then open `.env.local` and fill in both values:

| Variable | Required | What it is |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | Random string of **at least 32 characters**, used to sign the login tokens the app stores. Without it, every request returns an error. |
| `ANTHROPIC_API_KEY` | For AI intake | Get one at <https://console.anthropic.com>. If it's empty, the app still runs, but the photo-intake step shows "AI assistant isn't configured". |

One way to generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Create the database and demo accounts

```bash
npm run setup
```

This creates `data/molsters.db`, builds the tables and adds the demo users below. You can run it again safely; it won't create duplicates.

### 4. Start the API server

```bash
npm run dev
```

This listens on port 3000 on every network interface, so your phone can reach it. Leave it running.

### 5. Install the app's dependencies

In a second terminal:

```bash
cd mobile
npm install
```

### 6. Open it on your iPhone

1. Install **Expo Go** from the App Store. It must support SDK 58, so update it if it asks.
2. Put the iPhone and the computer on the **same Wi-Fi network**.
3. Start the app's dev server from `mobile/`:

   ```bash
   npx expo start
   ```

4. Scan the QR code with the iPhone's **Camera** app and tap the banner to open it in Expo Go.
5. When iOS asks whether Expo Go can **find devices on your local network**, tap **Allow**. Without it the app can't reach the server.
6. Sign in with a demo account (below). The sign-in screen shows which server address the app is using.

The app finds the server automatically. It uses the computer address that Expo Go loaded the app from, on port 3000. To use a different server, create `mobile/.env` with `EXPO_PUBLIC_API_URL=http://<ip>:3000` and restart `npx expo start`.

#### Windows: allow Node through the firewall

The first time, Windows may show a firewall prompt for Node.js. Tick **Private networks** and allow it. If you missed the prompt, run this once in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Node.js (Molsters dev)" -Direction Inbound -Program "C:\Program Files
odejs
ode.exe" -Action Allow -Profile Private
```

This covers both the API (port 3000) and Expo's dev server (port 8081). Your Wi-Fi must be set to a **Private** network in Windows settings.

---

## Demo accounts

Every demo account uses the password **`password123`**.

| Email | Role | Notes |
| --- | --- | --- |
| `customer@demo.com` | Customer | Creates jobs |
| `agent@demo.com` | Support agent | Reviews and assigns jobs |
| `plumber@demo.com` | Provider (plumbing) | Serves ZIPs 94110, 94103, 94114 |
| `electrician@demo.com` | Provider (electrical) | Serves ZIPs 94110, 94103 |
| `hvac@demo.com` | Provider (HVAC) | Serves ZIPs 10001, 10011 |

You can also sign up in the app as a new customer or pro ("I'm a pro" on the sign-up screen). Agent accounts only come from the seed script.

### Try the full flow

1. Sign in as **customer@demo.com** and start a new job. Use ZIP **94110** and upload a few photos of a leak or similar problem.
2. Answer the AI assistant's questions until it produces a job report.
3. Sign out (top right), then sign in as **plumber@demo.com** and accept the job from the open board. A second phone works too.
   - Or send the job to a person, then sign in as **agent@demo.com** to assign it.
   - Open jobs that nobody claims within 15 minutes also show up in the agent's queue.
4. As the provider, move the job through en route, in progress and completed. Message the customer along the way.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API server on port 3000, reachable from your phone |
| `npm run dev:fake` | Same, with the fake AI (no API key or credits needed) |
| `npm run test:e2e` | End-to-end test of the Scope flow against a running server |
| `npm run mobile` | Start the Expo dev server (same as `cd mobile && npx expo start`) |
| `npm run build` | Build for production |
| `npm start` | Run the production API build (run `npm run build` first) |
| `npm run typecheck` | Check the server's types (`cd mobile && npm run typecheck` for the app) |
| `npm run lint` | Run ESLint |
| `npm run setup` | Run `db:push` and then `db:seed` |
| `npm run db:push` | Create or update the database tables from `db/schema.ts` |
| `npm run db:seed` | Add the demo accounts |

## Where data lives

- **Database:** `data/molsters.db`, a SQLite file. It isn't committed to git.
- **Uploaded photos:** `uploads/job-<id>/`. Not committed either. Limits: 8 MB per photo, 12 photos per job, and JPEG, PNG, WebP or GIF only.

**To start fresh:** stop the server, delete `data/molsters.db` and any `data/molsters.db-*` files (plus `uploads/job-*` if you want), then run `npm run setup` again.

## Troubleshooting

- **The app says it can't reach the server.** Check each of these:
  - `npm run dev` is running.
  - The phone and computer are on the same Wi-Fi.
  - Expo Go has Local Network access (iPhone Settings → Expo Go).
  - The Windows firewall allows Node (see step 6).

  To test the network, open `<server address shown on sign-in>/api/auth/me` in Safari on the phone. A `Please sign in` message means the network is fine.
- **`npx expo start --tunnel` doesn't reach the server.** A tunnel only forwards the app bundle, not the API. Use the same Wi-Fi, or set `EXPO_PUBLIC_API_URL` to an address the phone can reach.
- **Every request fails with an error about `SESSION_SECRET`.** The value in `.env.local` is missing or shorter than 32 characters. Fix it and restart `npm run dev`.
- **"AI assistant isn't configured" during intake.** Set `ANTHROPIC_API_KEY` in `.env.local` and restart the dev server. Env files are only read at startup.
- **Port 3000 is already in use.** Run `npm run dev -- -p 3001` and open http://localhost:3001.
- **Requests return 500 with errors like `routes-manifest.json` / `_document.js` not found, or `Cannot find module './vendor-chunks/...'`.** The `.next` build folder is out of date or corrupted. This usually happens when `next build` and `next dev` ran at the same time. Stop every running server, delete the `.next` folder, and start `npm run dev` again.
- **"no such table" errors.** You skipped step 3. Run `npm run setup`.
- **The database or photos end up in an odd place.** Paths are relative to the folder you start the app from, so always run commands from the project root.
