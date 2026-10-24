# Molsters

Molsters runs **Scope**: point your phone at a home problem, get it fixed.

1. The homeowner taps **Scan a problem** and the app guides the photos one shot at a time. Claude checks each one.
2. A few tap-to-answer questions, then Claude writes a **JobSpec** (severity, area, confidence). It never prices.
3. The price comes from the provider's rate card (±15%), and the best-matched pros nearby are offered.
4. The homeowner books a pro and asks for a time. The pro accepts on the **`/pro` dashboard** (laptop), confirming the time and price.
5. The phone tracks the job (booked → on the way → done) and the homeowner rates it.

It has four parts:

| Folder | What it is |
| --- | --- |
| `mobile/` | The homeowner app: Expo SDK 58, React Native, Expo Router. Runs in **Expo Go** on your iPhone. |
| repo root | The API server and the `/pro` dashboard: Next.js 15, SQLite via better-sqlite3 + Drizzle, Claude via the Anthropic SDK. It runs on your computer and the phone talks to it over Wi-Fi. |
| `shared/` | Types, pricing and the typed API client (`scope-client.ts`) used by the server, the app and `/pro`. |
| `templates/` | Trade templates (`mold.json`, `plumbing_sink.json`). Server and app read the same files. |

The Claude API key, database and photos stay on your computer. They're never shipped inside the app.

The older open-board API (`/api/jobs`, support agents, messaging) is still in the server, but no screen uses it any more.

---

## Scope: the homeowner flow (SOON26)

The Scope flow from `SOON26.md`, as the server implements it. The app in `mobile/` uses it through `mobile/src/services/http.ts`.

1. **Home**: a big **Scan a problem** button, with the Home Record (every scan and job for this home) below it.
2. **Scan**: full-screen camera, one shot at a time from the trade template. Claude (`claude-sonnet-5-5`, JSON-only, validated with zod) checks each photo. Blurry, dark, wrong subject, or a face or document in frame means a retake. Optional shots can be skipped with a reason ("There's no wall next to it").
3. **Clarify**: the template's questions as tap chips, plus an optional note.
4. **Spec**: Claude writes the JobSpec (title, summary, severity 1-5, area m², confidence 0-1, template fields). It never prices. The price is `(base + per_m2 × area) × severity_multiplier[severity-1]`, ±15%, from the provider's rate card, labelled "Estimate — confirmed by provider".
5. **Matching**: providers for the trade within their radius, best rating first, then shortest ETA. **Book [Provider] · [time]** sends the spec to that pro with the time the homeowner asked for. The pro confirms that time or picks another.
6. **Track**: polls every 2 s. Waiting → booked (slot + confirmed price) → on the way (ETA countdown) → done → 5-star rating, which updates the provider's rating.
7. **Fallbacks**: confidence under 0.6 goes straight to human review with the spec attached. If no provider is in range, the homeowner can book a virtual call (Mold Busters for mold). If a pro declines, the next pro is offered.

**Adding a trade means adding a file** to `templates/` (`mold.json` and `plumbing_sink.json` ship). The format is checked by `templateSchema` in `shared/scope.ts`, and templates are re-read on every request in dev.

**Demo data**: `npm run db:seed` creates five providers around `DEMO_LAT`/`DEMO_LNG` (default: downtown Montreal) and a "Demo house" for `customer@demo.com`. Northshore Mold Co is deliberately out of range. To move the demo to the venue, set both variables and run the seed again. Rate cards and ratings are kept. Other homeowner accounts set their home with `PUT /api/home`.

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
| Spec | `spec_ready`, or `job.status = declined` | `spec`, `matches[]` (ranked, each with `quote` and `slots`). `POST /book { providerId, slot? }` (`slot` = a `slots[].startsAt`, the requested time), `POST /human`. If `matches` is empty: `GET /api/slots`, then `POST /virtual-call { slot? }`. |
| Track | `submitted` | `job.status`: `pending` (`requestedSlot`) · `handoff` · `virtual_call` · `accepted` (slot, price) · `en_route` (`eta`) · `done` → `POST /rate { stars }` · `more_info` → `POST /reopen`, then back to Scan/Clarify. `POST /cancel` any time before accepted. |

All paths are under `/api/scans/:id`. `shared/scope.ts` has the labels (`JOB_STATUS_LABELS`, `ESTIMATE_LABEL`, `slotLabel`, `priceRange`).

#### End-to-end tests

```bash
npm run dev:fake      # terminal 1 (or npm run dev for real Claude)
npm run test:e2e      # terminal 2: the API, every flow (E2E_BASE_URL=http://localhost:3001 for another port)
npm run e2e           # terminal 2: the phone app's client + the /pro dashboard together
```

`npm run e2e` runs the app's real API client (`mobile/src/services/http.ts`) as the homeowner and submits the `/pro` page's forms as the provider. It covers: a retake, a skip, booking with a requested time, ask for more (a shot and a question), accept (including an out-of-range price), en route, done, rating, decline → next pro → virtual call, talk to a person, cancel, the second trade and a rate-card change. It deletes its scans afterwards.

`npm run test:e2e` drives every flow through the typed client:

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
| GET | `/api/pro/queue` | | Tabs `new` (pending, and more_info while the homeowner answers) · `review` (handoff, virtual_call) · `active` (accepted, en_route) · `done`. Each card has trade, title, severity, area, confidence, distance, age and a quote **priced with this provider's current rate card**. Poll every 2 s. |
| GET | `/api/pro/jobs/:id` | | Spec detail: photos labelled by shot, summary, fields, answers, notes, quote, and time slots (the homeowner's requested time first, `id: "requested"`). The exact address appears once the job is this provider's. |
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
6. There's no sign-in for the live demo. The app signs in as the demo homeowner (`customer@demo.com`, with the seeded "Demo house") by itself.

The app finds the server automatically. It uses the computer address that Expo Go loaded the app from, on port 3000. To use a different server, create `mobile/.env` with `EXPO_PUBLIC_API_URL=http://<ip>:3000` and restart `npx expo start`. To work on the UI without a server, set `EXPO_PUBLIC_SCOPE_API=mock` instead: the app then runs on the in-memory mock in `mobile/src/services/mock`.

#### Windows: allow Node through the firewall

The first time, Windows may show a firewall prompt for Node.js. Tick **Private networks** and allow it. If you missed the prompt, run this once in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Node.js (Molsters dev)" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow -Profile Private
```

This covers both the API (port 3000) and Expo's dev server (port 8081). Your Wi-Fi must be set to a **Private** network in Windows settings.

### 7. Open the provider dashboard on your laptop

Open <http://localhost:3000/pro> and pick a provider, or go straight to `http://localhost:3000/pro?provider=<id>` (the seed prints the ids; Mold Busters is `1`). There's no sign-in: the `?provider=` id picks who you are, so only run this on a network you trust.

| Tab | What it does |
| --- | --- |
| New / Needs review / Active / Done | The provider's queue: trade, severity, area, price range, distance, confidence and age. *Needs review* holds handoffs (low confidence, or the homeowner asked for a person) and virtual calls. Jobs waiting on the homeowner stay in *New*, badged. |
| Spec (click a card) | Photos by shot, AI summary, extracted fields, answers, notes and the price from your rate card. **Accept** (the homeowner's requested time is pre-selected; price within ±15%), **Ask for more** (pick template shots and questions, or write a request; the homeowner gets it on their phone), **Decline**. Handoffs can be routed to a virtual call. |
| Active job | Status stepper and an **Add to Google Calendar** link. Advancing the status updates the homeowner's screen. |
| Rate card | `base`, `per_m2` and the severity multipliers. Saving re-prices every spec. |

The page refreshes every 3 seconds.

---

## Demo accounts

The app signs in as **`customer@demo.com`** (password **`password123`**). The seed also prints the Scope providers and their `/pro` ids:

| `/pro?provider=` | Provider | Notes |
| --- | --- | --- |
| `1` | Mold Busters | Mold. Takes virtual calls when nobody else is in range. |
| `2` | ClearSpore Remediation | Mold. Smaller radius. |
| `3` | Northshore Mold Co | Mold. Deliberately out of range. |
| `4` | Clearwater Plumbing | Leaking sink. Takes virtual calls. |
| `5` | Pipeline Pros | Leaking sink. |

The seed still creates the older accounts (`agent@demo.com`, `plumber@demo.com`, `electrician@demo.com`, `hvac@demo.com`) for the open-board API.

### Try the full flow

1. On the phone, tap **Scan a problem** → **Mold or damp spot**, take the photos and answer the questions.
2. Book **Mold Busters** and pick a time.
3. On the laptop, open `/pro?provider=1`. The job is in **New** with your time pre-selected. Try **Ask for more**: the phone shows a banner, rescans only what was asked and sends the updated spec back.
4. **Accept**, then **On my way** and **Mark done**. The phone follows each step. Rate the job on the phone.
5. Other paths: **Decline** (the phone offers the next pro), **Talk to a person instead** on the estimate screen (lands in *Needs review*), and **Cancel request** while waiting.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API server on port 3000, reachable from your phone |
| `npm run dev:fake` | Same, with the fake AI (no API key or credits needed) |
| `npm run test:e2e` | End-to-end test of the Scope API (every flow) against a running server |
| `npm run mobile` | Start the Expo dev server (same as `cd mobile && npx expo start`) |
| `npm run build` | Build for production |
| `npm start` | Run the production API build (run `npm run build` first) |
| `npm run e2e` | End-to-end test of the phone app's client + the `/pro` dashboard against a running server. Cleans up after itself. |
| `npm run typecheck` | Check the server's types (`cd mobile && npm run typecheck` for the app) |
| `npm run lint` | Run ESLint |
| `npm run setup` | Run `db:push` and then `db:seed` |
| `npm run db:push` | Create or update the database tables from `db/schema.ts` |
| `npm run db:seed` | Add the demo accounts |

## Where data lives

- **Database:** `data/molsters.db`, a SQLite file. It isn't committed to git.
- **Uploaded photos:** `uploads/scan-<id>/` (and `uploads/job-<id>/` for the older API). Not committed either. Limits: 8 MB per photo, and JPEG, PNG, WebP or GIF only. The app converts photos to JPEG before uploading.

**To start fresh:** stop the server, delete `data/molsters.db` and any `data/molsters.db-*` files (plus `uploads/scan-*` and `uploads/job-*` if you want), then run `npm run setup` again.

## Troubleshooting

- **The app says it can't reach the server.** Check each of these:
  - `npm run dev` is running.
  - The phone and computer are on the same Wi-Fi.
  - Expo Go has Local Network access (iPhone Settings → Expo Go).
  - The Windows firewall allows Node (see step 6).

  The error message shows the server address the app is using. To test the network, open `<that address>/api/health` in Safari on the phone. A short JSON reply means the network is fine.
- **`npx expo start --tunnel` doesn't reach the server.** A tunnel only forwards the app bundle, not the API. Use the same Wi-Fi, or set `EXPO_PUBLIC_API_URL` to an address the phone can reach.
- **Every request fails with an error about `SESSION_SECRET`.** The value in `.env.local` is missing or shorter than 32 characters. Fix it and restart `npm run dev`.
- **"AI assistant isn't configured" during a scan.** Set `ANTHROPIC_API_KEY` in `.env.local` and restart the dev server (env files are only read at startup), or use `npm run dev:fake`.
- **Port 3000 is already in use.** Run `npm run dev -- -p 3001` and open http://localhost:3001.
- **Requests return 500 with errors like `routes-manifest.json` / `_document.js` not found, or `Cannot find module './vendor-chunks/...'`.** The `.next` build folder is out of date or corrupted. This usually happens when `next build` and `next dev` ran at the same time. Stop every running server, delete the `.next` folder, and start `npm run dev` again.
- **"no such table" errors.** You skipped step 3. Run `npm run setup`.
- **The database or photos end up in an odd place.** Paths are relative to the folder you start the app from, so always run commands from the project root.
