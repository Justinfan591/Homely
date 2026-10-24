# Scope (client app)

Customer-facing Expo app (SDK 58, Expo Router) for Scope: point your phone at a home problem, get a priced job spec, book a pro, track it. Built from `System Design.md`. There's no sign-in screen (it signs in as the demo homeowner) and no provider UI (providers use `/pro` on the server).

It talks to the API server in the repo root. Start that first (`npm run dev` or `npm run dev:fake` there); see the [main README](../README.md) for the iPhone and firewall steps.

```bash
npm install
npx expo start        # Expo Go on iOS, or press w for web
npm run typecheck
EXPO_PUBLIC_SCOPE_API=mock npx expo start   # UI work without a server
```

## Structure

| Path | What |
| --- | --- |
| `src/app/` | Screens (Expo Router): `index` (home + record), `scan/[scanId]`, `clarify/[scanId]`, `spec/[scanId]`, `track/[jobId]` |
| `src/components/` | Design system: `Text`, `Button`, `Screen`, `Sheet`, `Controls` (chips, dots, severity, stars), `States`, `Glass` |
| `src/theme/` | Colours, type, spacing, radii |
| `src/domain/` | Types plus pure logic: deterministic `pricing`, provider `matching`, formatting |
| `src/templates/` | Loads the trade templates from `../templates` (the same files the server uses). Add a trade by adding a file there and listing it in `index.ts` |
| `src/services/api.ts` | `ScopeApi`: the only contract the UI depends on |
| `src/services/http.ts` | The real implementation, over `../shared/scope-client.ts`. Signs in as the demo homeowner |
| `src/services/mock/` | In-memory implementation with seed data (`EXPO_PUBLIC_SCOPE_API=mock`) |
| `src/hooks/` | SWR hooks over `ScopeApi` (job polling every 2s) |

## The backend

`src/services/index.ts` picks the implementation: `http.ts` by default (server at the Expo host on port 3000, or `EXPO_PUBLIC_API_URL`), or the mock. Screens only use `api`, the domain types and the hooks. Failures throw `ApiError`; every screen has a retry state for it.

How the two map onto each other:

- A job id is its scan id (one job per scan on the server).
- Booking sends the chosen slot as the homeowner's requested time; the pro confirms it on `/pro`, and Track shows "Requested time" until then.
- Opening a scan the pro asked more about reopens it on the server, for just the requested shots and questions.
- Photos are converted to JPEG (long edge 1568 px) before upload (`src/services/photo.ts`).

`npm run e2e` in the repo root drives `http.ts` against a running server, together with `/pro`.

What the mock stands in for: the vision check (it rejects the first close-up of each scan so the retake flow is visible), the intake agent output (severity, area, confidence), and the provider accepting / driving over (job status advances with time; see `mockConfig`). Pricing and matching in `src/domain` mirror the server for the mock; with the real backend, the server is the source of truth.

## Runtime notes

- Camera uses `expo-camera` (included in Expo Go). On web it falls back to the browser camera; a library picker is always available.
- Liquid Glass (`expo-glass-effect`) is used only for controls floating over the camera. It renders on iOS 26+ in Expo Go and degrades to a translucent fill elsewhere (including web).
- Mock scenarios: scan a **Leaking sink**, skip both optional shots and answer "Not sure" for a low-confidence handoff; switch to the **Georgian Bay cottage** home for the no-provider virtual-call fallback. With the server, use `npm run dev:fake` and a note containing "handoff" instead.
