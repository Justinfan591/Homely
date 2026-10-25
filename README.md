# Scope × Homely Pro

**Show us what's wrong. Get a real price from local pros in minutes.**

Homeowners don't know what a "P-trap" or "flashing" is, so they can't describe a problem well enough to get a quote, and pros waste a site visit just to find out what the job is. Scope fixes both sides with Claude:

- **Homeowners** type, say or photograph the problem. AI agents work out the trade, guide a few photos, ask plain-language questions and write a job spec with a best-guess price. Local pros send offers, and the homeowner books one, Uber-style.
- **Pros** get a complete, photo-backed spec before they ever drive out. Their pricing agent quotes and sends offers for them within the limits they approve. Homely Pro, their dashboard, covers requests, calendar, bookings, reviews and analytics.

| | |
| --- | --- |
| 📱 **Scope** (homeowner app) | Expo / React Native, runs on an iPhone |
| 💻 **Homely Pro** (pro dashboard) | `/pro` on the Next.js server, runs on a laptop |
| 🤖 **9 Claude agents** | intake, photo check, questions, spec, matching, estimate, pricing chat, profile interview, website reader |
| 🇨🇦 **Canada-first** | prices in CA$, demo city Montréal, address type-ahead |

---

## The 3-minute demo

1. **Phone → Home.** Three ways in: ⌨️ type it, 🎤 say it, 📷 show it. Say *"There's a leak under my kitchen sink."*
2. **"Is this right?"** Claude says *It sounds like Plumbing: a leak under the kitchen sink*, with two other guesses and **Not quite** if it's wrong.
3. **Guided photos.** One shot at a time. Claude checks each photo and asks for a retake if it's blurry, dark or shows the wrong thing.
4. **Questions.** Claude writes 0–5 questions from what was said and photographed, in plain words ("the pipes under the sink", never "the shut-off valve").
5. **Estimate.** A job spec (severity, hours, parts, confidence) and a price range in CA$. There's **always a best guess**, even when Claude is unsure.
6. **Offers.** The request goes to every matching pro nearby at once. Pros whose pricing agent is live answer **instantly**; others send offers from their dashboard. Tap one to book.
7. **Laptop → `/pro`.** Open the job: photos by shot, summary, answers and the agent's estimate breakdown. Send an offer, **Ask for more** (the phone gets a notification and rescans only that), then **On my way → Done**. The phone follows each step, and the homeowner rates the job.
8. **Setup → Pricing.** Tell the pricing agent *"CA$120 call-out with the first hour, then CA$90 an hour, parts plus 15%, approve anything over CA$600 myself"*, then **Approve**. New requests under CA$600 now get offers automatically.

---

## How it works

### Homeowner flow (Scope app)

```
Sign in (phone or email + code) → Your name → Your home (location autofill + address type-ahead)
        │
Home: [⌨️ Type]  [🎤 Say it]  [📷 Show it]          ← pull to refresh everywhere
        │
"Is this right?"  ── trade + summary, 2 alternatives, "Not quite"
        │
Guided scan  ── one template shot at a time, Claude checks each, optional shots can be skipped
        │
Mark the spot  ── "move the dot to the leak"
        │
Questions  ── written by the questions agent (+ anything pros' pricing agents want asked)
        │
Estimate  ── job spec + CA$ range, matched pros ranked by fit
        │
Offers  ── live offers (auto from pricing agents + manual from pros) → accept one, others close
        │
Track  ── booked → on the way (ETA) → done → rate ★★★★★
```

Other paths:

- **Talk to a person** on the estimate screen sends the job to human review.
- **No pro in range** shows the best-guess estimate and offers a virtual call.
- **Every pro passes** offers a virtual call.
- **Cancel** works any time before the job is booked.
- Low confidence never hands off automatically. It only adds a "Low confidence" badge for the pro.

### Pro flow (Homely Pro, `/pro`)

| Section | Page | What it does |
| --- | --- | --- |
| Bookings | **Requests** | Open requests sent to this pro, jobs waiting on the homeowner, and jobs needing review. Send, update or withdraw an offer; pass; ask for more; route to a virtual call. |
| | **Calendar** | Mon–Sat week grid of booked jobs; Google Calendar connect. |
| | **Bookings** | Upcoming / Past. Job detail with the **agent's estimate** (call-out, extra time, parts, total), plus On my way / Done. |
| | **Reviews** | Rating summary and every review with stars, note and service. |
| | **Analytics** | Last 12 weeks: revenue, bookings, average job and rating vs the 12 weeks before; revenue/bookings chart; busiest days; top jobs. |
| Setup | **Schedule** | Drag-to-paint working hours. Offer times are only ever inside them and never clash with booked jobs. |
| | **Pricing** | Chat with the pricing agent. It drafts the rate card and the questions it wants homeowners asked; **Approve** makes it live. |
| | **Profile** | A short AI interview (and optionally the pro's website) that writes the summary the matching agent reads. |

**Pricing model.** Each pro has a rate card:

> **price = call-out (includes the 1st hour) + (hours − 1) × hourly + parts × (1 + markup)**

The spec agent estimates hours, complexity and parts for each job, so every pro's quote comes from the same job description and their own rates. When a pro's pricing is live and the quote is at or under their **approve-over** limit, an offer goes out automatically in their first free slot. Anything over the limit waits for the pro.

### The AI agents

All agents use the Anthropic SDK with **structured outputs** (zod schemas through `messages.parse`), so every answer is typed and validated. The model is `claude-sonnet-5-5`; the legacy intake chat uses `claude-opus-5-5`.

| Agent | File | Job |
| --- | --- | --- |
| Intake classifier | `lib/scope/ai.ts` `classifyTrade` | Text (+ optional photo) → trade, summary and 2 alternatives |
| Photo checker | `ai.ts` `checkShot` | Usable shot? Rejects blur, darkness, wrong subject, faces and documents |
| Questions | `ai.ts` `writeQuestions` | 0–5 plain-language questions from what was said and photographed, plus the asks of pros who will see the job |
| Spec | `ai.ts` `generateSpec` | Title, summary, severity 1–5, area, **hours, complexity, parts cost**, confidence, template fields; always a best guess |
| Matching | `lib/scope/fit.ts` | Ranks in-range pros by how well their profile fits this problem |
| Estimate | `lib/scope/estimate.ts` | A CA$ range when no pro is in range |
| Pricing chat | `lib/scope/pricing-chat.ts` | Turns "how I charge" into a rate card and homeowner questions |
| Profile interview | `lib/scope/profile.ts` | 4–8 tap-to-answer questions, then facts and a summary for matching |
| Website reader | `lib/scope/website.ts` | Reads a pro's site and pulls out their services for the profile |

Shared prompt rule (`PLAIN_ASK`): *the homeowner has no trade knowledge, so only ask for what they can find and recognise.*

**Adding a trade is adding a JSON file** to `templates/`, which sets the shots, questions, outputs, severity guide and policy rules. The trades are mold, plumbing, electrical, handyman, roofing, painting, garden and appliances. Templates are validated by `templateSchema` in `shared/scope.ts`.

---

## Tech stack

| Layer | Tech |
| --- | --- |
| Mobile app | Expo SDK 58, React Native, Expo Router, SWR, React Compiler, Reanimated, expo-camera / expo-audio / expo-location / expo-notifications |
| Server + `/pro` | Next.js 15 (App Router, route handlers, server components and server actions), React 19 |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| AI | Claude via `@anthropic-ai/sdk` with zod structured outputs; OpenAI `gpt-4o-mini-transcribe` for speech-to-text (optional) |
| Maps | OpenStreetMap: Photon (address type-ahead), Nominatim (geocoding and reverse geocoding). No API keys. |
| Integrations | Google Calendar (OAuth, optional) |
| Shared | `shared/` types, pricing maths and a typed API client used by the server, the app and the tests |

```
┌──────────── iPhone ────────────┐        ┌──────────── Laptop ─────────────────────┐
│ Scope app (Expo)               │  HTTP  │ Next.js server                          │
│  mobile/src/services/http.ts ──┼───────►│  /api/*  route handlers                 │
│  (or an in-memory mock)        │ Wi-Fi  │  /pro    Homely Pro (server components) │
└────────────────────────────────┘        │  lib/scope/*  agents + business logic   │
                                          │  SQLite data/molsters.db, uploads/      │
                                          └──────┬───────────────┬──────────────────┘
                                                 │               │
                                          Claude API     Photon / Nominatim, Google Calendar
```

The API keys, database and photos stay on the laptop. Nothing secret ships inside the app.

| Folder | What's in it |
| --- | --- |
| `mobile/` | The homeowner app. Screens are in `mobile/src/app` (Expo Router). |
| `app/` | Next.js: `app/api/*` (REST API) and `app/pro/*` (Homely Pro). |
| `lib/scope/` | Agents, matching, pricing chat, offers, pro pages and analytics. |
| `db/` | Drizzle schema, seed and data migrations. |
| `shared/` | Types, `cad()`, `quote()`, rate cards, and the typed client `scope-client.ts`. |
| `templates/` | One JSON file per trade. |
| `scripts/` | e2e tests and agent evals. |

---

## Quick start

**You need:** Node.js 20+ (tested on 22), an iPhone with **Expo Go** (SDK 58) on the same Wi-Fi, and an Anthropic API key. No API key? Use `npm run dev:fake`, which gives instant, free, deterministic AI answers.

```bash
# 1. Install
npm install
cd mobile && npm install && cd ..

# 2. Configure (keep an existing .env.local)
[ -f .env.local ] || cp .env.example .env.local   # PowerShell: if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
#    then set SESSION_SECRET (32+ chars) and ANTHROPIC_API_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Database + demo data (safe to re-run)
npm run setup

# 4. Run
npm run dev            # API + /pro on :3000 (or: npm run dev:fake)
npm run mobile         # second terminal: Expo; scan the QR code with the iPhone camera
```

Then:

- **Phone:** sign in with any phone number or email. The code is **7246** (nothing is sent; set `DEMO_LOGIN_CODE` to change it). New accounts are asked their name and home address.
- **Laptop:** open <http://localhost:3000/pro> and pick a pro, or go to `/pro?provider=1` for Mold Busters. There's no sign-in on `/pro`, so only run it on a network you trust.

### Environment variables (`.env.local`)

| Variable | Needed | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | **Yes** | 32+ random characters; signs the app's login tokens |
| `ANTHROPIC_API_KEY` | For real AI | Claude. Without it, use `npm run dev:fake`. |
| `OPENAI_API_KEY` | Optional | Voice transcription. Without it, the voice screen offers "Pick the problem instead". |
| `DEMO_LAT` / `DEMO_LNG` | Optional | Where the demo pros are seeded (default: downtown Montréal). Change and re-run `npm run db:seed` to move the demo to the venue. |
| `DEMO_LOGIN_CODE` | Optional | The sign-in code (default `7246`) |
| `SCOPE_FAKE_AI` | Optional | `1` = fake AI (same as `npm run dev:fake`) |
| `CORS_ORIGINS` | Optional | Comma-separated origins allowed to call `/api` (empty = any) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google Calendar for pros (see below) |

The app finds the API on the computer Expo Go loaded it from, on port 3000. To point it somewhere else, put `EXPO_PUBLIC_API_URL=http://<ip>:3000` in `mobile/.env`. To work on the UI with no server, set `EXPO_PUBLIC_SCOPE_API=mock`.

### Demo pros

`npm run db:seed` creates 17 pros around `DEMO_LAT`/`DEMO_LNG` and prints their `/pro?provider=` ids. Ratings, rate cards and profiles you change are kept on re-seed.

| Trade | Pros |
| --- | --- |
| Mold | **Mold Busters** (id 1, takes virtual calls), ClearSpore Remediation, Northshore Mold Co (deliberately out of range) |
| Plumbing | Clearwater Plumbing (virtual calls), Pipeline Pros |
| Electrical | Bright Spark Electric, Volt & Co |
| Handyman / painting | Fix-It Fred, Odd Jobs Collective, Fresh Coat Painters |
| Roofing | Northline Roofing, Summit Roof & Gutter |
| Garden | Greenleaf Gardens, Yard Pros |
| Appliances | ApplianceDoc, QuickFix Appliance |
| Mold + plumbing | Justin Fan (id 6, a solo pro, outside the demo home's range) |

---

## Testing

| Command | What it checks |
| --- | --- |
| `npm run test:e2e` | **212 checks** across every API flow against a running server (`E2E_BASE_URL=http://localhost:3100` for another port): sign-up, address type-ahead, happy path (retake, skip, questions, spec, offers, accept, en route, done, rating), ask for more, pass, human handoff, low confidence still priced, no pro in range, profile interview, pricing chat → approve → auto offers, the second trade, access control and CORS. Cleans up after itself; pass `-- --keep` to keep the data. |
| `npm run e2e` | The phone app's real API client plus `/pro` form submissions, end to end |
| `npm run eval:agents` | Real-Claude evals of the agents: no jargon in questions, always an estimate, pricing-chat parsing, and more |
| `npm run typecheck` | Server types (`cd mobile && npx tsc --noEmit` for the app) |
| `npm run lint` | ESLint |

With `npm run dev:fake`:

- Any photo under 2 KB is rejected and everything else passes.
- A note containing "handoff" gives confidence 0.45.
- Voice returns a fixed sentence.

With real Claude, AI-dependent e2e checks become warnings, because the test photos are drawings.

---

## API reference

All endpoints are JSON under `/api`. Homeowner routes need `Authorization: Bearer <token>`. Pro routes take `?provider=<id>`. Errors are `{ error }` with a status of 400, 401, 404 or 409, and the message is safe to show. Types are in `shared/scope.ts`, and `shared/scope-client.ts` has one typed function per endpoint.

<details>
<summary><b>Homeowner</b></summary>

| Method | Path | Does |
| --- | --- | --- |
| POST | `/auth/code` → `/auth/code/verify` | Sign in with phone/email + code → `{ token, isNew }` |
| GET / PUT | `/profile` | Name, age, address, home type. A new address is geocoded unless `lat`/`lng` are sent (picked suggestion or current location). |
| GET | `/geocode/search?q=` | Address type-ahead (Photon), up to 5 `{ address, line1, line2, lat, lng }`, biased to the home's area |
| GET | `/geocode/reverse?lat=&lng=` | Current location → street address |
| POST | `/intake/transcribe`, `/intake/classify` | Voice → text; text (+ photo) → trade with alternatives |
| GET | `/home`, `/templates` | Home + Home Record; available trades |
| POST | `/scans` `{ trade, description? }` | Start a scan → `{ id }` |
| GET | `/scans/:id` | Everything the scan screens render. Poll every 2 s while tracking. |
| POST | `/scans/:id/shots`, `/skip`, `/mark` | Upload a shot (Claude checks it), skip an optional one, mark the spot |
| GET | `/scans/:id/questions` | The questions agent's questions |
| POST | `/scans/:id/finish` `{ answers, notes? }` | → job spec, estimate and matched pros |
| POST | `/scans/:id/request` `{ slot? }` | Send to every matched pro (auto offers fire here) |
| POST | `/scans/:id/offers/:offerId/accept` | Book an offer; the others close |
| POST | `/scans/:id/human`, `/virtual-call`, `/reopen`, `/cancel`, `/rate` | Talk to a person, virtual call, answer ask-for-more, cancel, rate |

</details>

<details>
<summary><b>Pro</b> (<code>?provider=&lt;id&gt;</code>)</summary>

| Method | Path | Does |
| --- | --- | --- |
| GET | `/pro/providers`, `/pro/queue` | Pick a pro; their queue (`new`, `review`, `active`, `done`) |
| GET | `/pro/jobs/:id` | Spec detail with photos, answers, quote breakdown and free slots |
| POST / DELETE | `/pro/jobs/:id/offer` `{ slot, price }` | Send/update or withdraw an offer |
| POST | `/pro/jobs/:id/accept`, `/decline`, `/ask-more`, `/virtual-call`, `/status` | Book, pass, ask for more, route to a virtual call, en route / done |
| GET / POST | `/pro/pricing` | Pricing chat: `{ action: "message", message }`, `{ action: "approve" }` |
| GET / PUT | `/pro/hours` | Working hours (7 days × 48 half-hours) |
| GET / POST | `/pro/profile` | The profile interview and website |

</details>

The older open-board API (`/api/jobs`, support agents, messaging) is still there, but no screen uses it.

---

## More setup

<details>
<summary><b>Windows firewall</b></summary>

Allow Node.js on **Private networks** when Windows asks, or run this once in an administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Node.js (Molsters dev)" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow -Profile Private
```

Your Wi-Fi must be a **Private** network.

</details>

<details>
<summary><b>Google Calendar for pros (optional)</b></summary>

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Calendar API**.
2. Set up an *External* OAuth consent screen and add your account under **Test users**.
3. Create an **OAuth client ID** (Web application) with the redirect URI `http://localhost:3000/pro/google/callback`.
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local`, restart, open `/pro` **on `localhost:3000`**, and click **Connect Google Calendar** on the Calendar page.

Accepted jobs become events (scope `calendar.events` only). **Disconnect** revokes the token. Without Google, each booking has an **Add to Google Calendar** link instead.

</details>

<details>
<summary><b>Notifications</b></summary>

When a pro uses **Ask for more**, the phone shows a local notification that opens the rescan. Expo Go can't receive remote push (SDK 53+), so the notification shows while the app is open or was just switched away, and the home screen banner covers the rest.

</details>

## Where data lives

- `data/molsters.db`: the SQLite database. `npm run setup` creates it and runs the data migrations (e.g. locksmith → roofing, old rate cards → hourly).
- `uploads/scan-<id>/`: photos, up to 8 MB each, JPEG/PNG/WebP/GIF.

Neither is committed. **To start fresh:** stop the server, delete `data/molsters.db*` (and `uploads/scan-*`), then run `npm run setup`.

## Troubleshooting

- **The app can't reach the server.** Check that `npm run dev` is running, both devices are on the same Wi-Fi, Expo Go has Local Network access, and the firewall allows Node. Open `<address>/api/health` in Safari on the phone; a JSON reply means the network is fine.
- **`--tunnel` doesn't reach the API.** Tunnels only forward the app bundle. Use the same Wi-Fi or set `EXPO_PUBLIC_API_URL`.
- **Errors about `SESSION_SECRET`.** It's missing or shorter than 32 characters. Fix it and restart.
- **"AI assistant isn't configured".** Set `ANTHROPIC_API_KEY` and restart (env files are read at startup), or use `npm run dev:fake`.
- **No address suggestions.** Photon is a free public service. If it's unreachable the field still works as plain text, and the server geocodes the address on save.
- **Port 3000 is busy.** Run `npm run dev -- -p 3001`.
- **500s mentioning `routes-manifest.json` or `vendor-chunks`.** Stop all servers, delete `.next/`, and start again.
- **"no such table".** Run `npm run setup`.
