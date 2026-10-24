# Scope (client app)

Customer-facing Expo app (SDK 58, Expo Router) for Scope: say or show what's wrong at home, get it scoped and priced, pick a quote, book a pro. The screens follow the "Scope app flows" design (sign-up, voice intake, guided photos, questions, booking, quotes, bookings, review, profile). There's no provider UI here: pros use `/pro` on the server.

It runs in **Expo Go**: every native module it uses (camera, image picker, audio recording, secure store, haptics, notifications) ships in Expo Go.

It talks to the API server in the repo root. Start that first (`npm run dev` or `npm run dev:fake` there); see the [main README](../README.md) for the iPhone and firewall steps.

```bash
npm install
npx expo start        # scan the QR code with Expo Go, or press w for web
npm run typecheck
EXPO_PUBLIC_SCOPE_API=mock npx expo start   # UI work without a server
```

## Signing in (demo)

Enter any phone number or email, then the code **7246**. Nothing is sent: the server accepts `DEMO_LOGIN_CODE` (default 7246) for everyone. A new number or email creates a homeowner account and asks for a name and home; `customer@demo.com` signs into the seeded demo homeowner. The session token is kept in SecureStore (localStorage on web).

## The flow

1. **Home**: two ways in, either one is enough.
   - **Camera button**: take one photo.
   - **"Tell us what's wrong"**: talk. The recording (`expo-audio`) is transcribed on the server with OpenAI (`OPENAI_API_KEY`; `SCOPE_FAKE_AI=1` returns a fixed sentence).
2. **Is this right?** Claude suggests the problem ("It looks like / It sounds like Plumbing") with two alternative chips. One tap starts it; "Something else" opens the 8-trade grid.
3. **Guided photos** from the trade's template, each checked by the vision model. A photo from the camera path is reused as the shot it matches, so the guided camera starts at the next one. Then drag a dot onto the problem.
4. **Questions** one at a time ("Something else? Write it" for your own words), then an optional note.
5. **When works for you?**: a day and window. The estimate is made in the background; "Find pros" sends it to every matching pro.
6. **Finding pros** → **Quotes** as pros answer on `/pro` → tap one → **You're booked**.
7. **Jobs** tab: upcoming and past bookings, booking details (message the pro, cancel), and **Review** once the pro marks it done.

Cases the design doesn't cover keep their own screens: `spec/[scanId]` (specialist review, no pros nearby → virtual call) and `track/[jobId]` (pro asked for more, declined, cancelled, every pro passed).

## Structure

| Path | What |
| --- | --- |
| `src/app/(auth)/` | Welcome, phone/email, code |
| `src/app/setup/` | Name, home (until both are saved, Home sends you here) |
| `src/app/(tabs)/` | Home, Jobs (`bookings`), Account (`profile`) with the design's icon bar |
| `src/app/tell/` | Listening, screening photo, "Is this right?", trade picker |
| `src/app/scan`, `mark`, `questions`, `book`, `finding`, `quotes`, `booked`, `booking`, `review` | The booking flow, one route each |
| `src/components/` | `Text`, `Button`, `Screen`, `Controls` (chips, choice rows, day pills, stars), `Design` (trade art, floating icons, fields, code boxes, cards), `CameraPanel` |
| `src/theme/` | The design's tokens: warm grey ground, white cards, Inter Tight |
| `src/templates/` | Loads the trade templates from `../templates` (the same files the server uses); `art.ts` maps trades to the 3D icons in `assets/trades` |
| `src/services/api.ts` | `ScopeApi`: the only contract the UI depends on |
| `src/services/http.ts` | The real implementation, over `../shared/scope-client.ts` |
| `src/services/mock/` | In-memory implementation with seed data (`EXPO_PUBLIC_SCOPE_API=mock`) |
| `src/hooks/` | Session, SWR hooks over `ScopeApi` (job polling every 2s), and the "Tell us" hand-off |

## The backend

`src/services/index.ts` picks the implementation: `http.ts` by default (server at the Expo host on port 3000, or `EXPO_PUBLIC_API_URL`), or the mock. Failures throw `ApiError`; a rejected token signs the app out.

- A job id is its scan id (one job per scan on the server).
- The chosen window's start is sent as the homeowner's requested time; pros quote their own time and price.
- Opening a scan the pro asked more about reopens it on the server, for just the requested shots and questions.
- Photos are converted to JPEG (long edge 1568 px) before upload; recordings go up as `.m4a` (`src/services/photo.ts`).
- Home addresses are geocoded on the server (OpenStreetMap). The demo pros are seeded around `DEMO_LAT`/`DEMO_LNG` (Montreal by default), so use an address near there, or the demo location is used if the address isn't found.

`npm run e2e` in the repo root drives `http.ts` against a running server, together with `/pro`.

The mock stands in for the vision check (it rejects the first close-up of each scan), transcription and trade picking, the spec agent, and pros sending offers and showing up (see `mockConfig`).
