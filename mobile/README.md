# Scope (client app)

Customer-facing Expo app (SDK 58, Expo Router) for Scope: point your phone at a home problem, get a priced job spec, book a pro, track it. Built from `System Design.md`. There is no auth and no provider UI. Everything runs against a mock service layer.

```bash
npm install
npx expo start        # Expo Go on iOS, or press w for web
npm run typecheck
```

## Structure

| Path | What |
| --- | --- |
| `src/app/` | Screens (Expo Router): `index` (home + record), `scan/[scanId]`, `clarify/[scanId]`, `spec/[scanId]`, `track/[jobId]` |
| `src/components/` | Design system: `Text`, `Button`, `Screen`, `Sheet`, `Controls` (chips, dots, severity, stars), `States`, `Glass` |
| `src/theme/` | Colours, type, spacing, radii |
| `src/domain/` | Types plus pure logic: deterministic `pricing`, provider `matching`, formatting |
| `src/templates/` | Trade templates as JSON (`mold.json`, `plumbing_sink.json`). Add a trade by adding a file and listing it in `index.ts` |
| `src/services/api.ts` | `ScopeApi`: the only contract the UI depends on |
| `src/services/mock/` | In-memory implementation with seed data |
| `src/hooks/` | SWR hooks over `ScopeApi` (job polling every 2s) |

## Connecting the backend

Implement `ScopeApi` (`src/services/api.ts`) with real HTTP calls and change one line in `src/services/index.ts`. Screens only use `api`, the domain types and the hooks. Failures should throw `ApiError`; every screen has a retry state for it.

What the mock stands in for: the vision check (it rejects the first close-up of each scan so the retake flow is visible), the intake agent output (severity, area, confidence), and the provider accepting / driving over (job status advances with time; see `mockConfig`). Pricing and matching are real client-side code in `src/domain` and mirror the spec; the backend remains the source of truth for price.

## Runtime notes

- Camera uses `expo-camera` (included in Expo Go). On web it falls back to the browser camera; a library picker is always available.
- Liquid Glass (`expo-glass-effect`) is used only for controls floating over the camera. It renders on iOS 26+ in Expo Go and degrades to a translucent fill elsewhere (including web).
- Mock scenarios: scan a **Sink or pipe leak** and skip two shots / answer "Not sure" for a low-confidence handoff; switch to the **Georgian Bay cottage** home for the no-provider virtual-call fallback.
