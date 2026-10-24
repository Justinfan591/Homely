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
