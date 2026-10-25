# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Molsters runs **Scope**: a homeowner photographs a home problem on their phone, Claude turns the photos and answers into a JobSpec, and the request goes out to every matching pro nearby; pros send offers from the `/pro` dashboard and the homeowner accepts one. `SOON26.md` is the original hackathon build brief; `README.md` documents the full endpoint list, demo accounts and setup.

The repo has four parts:

- **Repo root** — Next.js 15 (App Router) API server + the `/pro` provider dashboard. SQLite (better-sqlite3 + Drizzle), Claude via `@anthropic-ai/sdk`.
- **`mobile/`** — the homeowner app: Expo SDK 58, React Native, Expo Router. Separate `package.json`/`node_modules`. Read `mobile/AGENTS.md` before touching Expo APIs (fetch versioned Expo docs, use `npx expo install`, never hand-edit `ios/`/`android/`).
- **`shared/`** — types, pricing math and zod schemas (`scope.ts`) plus the dependency-free typed API client (`scope-client.ts`), imported by the server, `/pro`, scripts and tests. Must stay safe to import anywhere (no server-only code).
- **`templates/*.json`** — trade templates (shots, questions, notes). Validated by `templateSchema` in `shared/scope.ts`, read by the server (`lib/scope/templates.ts`, re-read per request in dev) and bundled into the app via `mobile/src/templates/index.ts`. Adding a trade = adding a JSON file (and registering it in `mobile/src/templates/index.ts` + an icon in `art.ts`).

## Commands

Run from the repo root unless noted. `.env.local` needs `SESSION_SECRET` (≥32 chars) and `ANTHROPIC_API_KEY` (optional with fake AI); see `.env.example`.

```bash
npm run setup          # db:push (drizzle-kit, from db/schema.ts) + db:seed (demo users/providers; idempotent)
npm run dev            # API + /pro on 0.0.0.0:3000 (phone reaches it over Wi-Fi)
npm run dev:fake       # same with SCOPE_FAKE_AI=1: instant, deterministic AI, no key needed
npm run typecheck      # server types; app: cd mobile && npm run typecheck
npm run lint           # server ESLint; app: cd mobile && npx expo lint
npm run mobile         # Expo dev server (cd mobile && npx expo start)
npx tsx scripts/migrate.ts   # data migrations in db/migrations.ts (also run by the seed); safe to re-run
```

Tests (no test framework; plain tsx scripts with their own tiny harness):

```bash
npm run test:e2e       # scripts/e2e-scope.ts: every Scope flow via shared/scope-client, against a RUNNING server
                       # (start `npm run dev:fake` first; E2E_BASE_URL to override; --keep leaves data). Cleans up after itself.
npm run e2e            # scripts/e2e.ts: the mobile app's http client + /pro, against a running server
npx tsx scripts/calendar.test.ts   # Google Calendar logic against a fake Google (no server)
npm run eval:agents    # scripts/eval-agents.ts: live quality eval of the Claude agents (real API, ~45 calls; --runs 1, --verbose)
```

There is no single-test filter; run the one script you need. With real Claude, AI-dependent e2e checks become warnings.

If dev returns 500s about `routes-manifest.json` / missing vendor chunks, stop servers and delete `.next` (happens when `next build` and `next dev` overlap).

## Server architecture

- **Route handlers** in `app/api/**/route.ts` stay thin: wrap with `route()` from `lib/api.ts` (turns thrown `HttpError` / `ZodError` into `{ error }` JSON with the right status), parse the body with zod, auth with `requireApiUser(role)` from `lib/auth.ts`, then call into `lib/scope/`.
- **Auth** is a signed bearer token (iron-session sealing with `SESSION_SECRET`), never cookies. `middleware.ts` adds CORS to `/api/*` (`CORS_ORIGINS`, default `*`). `/pro` has no login: `?provider=<id>` selects the provider.
- **Business logic lives in `lib/scope/`**: `service.ts` (scans, specs, jobs, offers, the homeowner flow), `pro.ts` (pro dashboard actions), `matching.ts` (radius/ETA/slots), `photos.ts` (validation, storage under `uploads/scan-<id>/`, signed photo URLs), `calendar.ts` (Google OAuth + events), `templates.ts`.
- **Claude agents** each live in their own file and all use structured JSON output validated with zod (`betaZodOutputFormat`); model is set in `lib/scope/ai.ts`. `ai.ts` (photo check, questions, spec), `fit.ts` (matching agent ranks in-range pros), `estimate.ts` (estimate agent: there is always a price), `pricing-chat.ts`, `profile.ts` (pro interview), `website.ts` (crawl a pro's site). Every agent has a non-AI fallback (e.g. matching falls back to rating + distance) and a fake path under `fakeAi()` (`SCOPE_FAKE_AI=1`). When adding/changing an agent, keep both the fallback and the fake path working, since `test:e2e` depends on the fake. Homeowner/pro free text is passed to prompts as untrusted (see `UNTRUSTED_NOTE` in `ai.ts`).
- **Claude never prices.** Prices come from provider rates via `quote()` / rate-card helpers in `shared/scope.ts`; confidence below `HANDOFF_CONFIDENCE` routes to human review.
- **DB**: schema in `db/schema.ts`, connection singleton in `db/index.ts` (file `data/molsters.db`, WAL, FKs on; paths relative to cwd, so always run from root). Schema changes go through `npm run db:push`; data reshaping goes in `db/migrations.ts` (idempotent). Demo data in `db/seed.ts` (`DEMO_LAT`/`DEMO_LNG` move the demo location).
- **Legacy**: the older open-board API (`/api/jobs`, `lib/intake/`, `lib/jobs.ts`, `shared/types.ts`/`api-types.ts`) still exists but no screen uses it.

## Mobile app architecture

- Screens in `mobile/src/app/` (Expo Router; route groups `(auth)`, `(tabs)`); non-route code in `components/`, `hooks/`, `services/`, `domain/`, `theme/`. `@/` maps to `mobile/src/`.
- All server access goes through the `ScopeApi` interface in `mobile/src/services/api.ts`, with two implementations: `http.ts` (real server) and `mock/` (in-memory, enabled with `EXPO_PUBLIC_SCOPE_API=mock`). **Any API change must update the interface, both implementations, and usually `shared/scope.ts` + `shared/scope-client.ts` on the server side.** App-side domain types are in `mobile/src/domain/types.ts`.
- Server URL is auto-derived from the Expo host on port 3000; override with `EXPO_PUBLIC_API_URL` in `mobile/.env`. The app auto-signs in as `customer@demo.com`.
- Runs in Expo Go: only bundled native modules are available, and push notifications are local-only.
