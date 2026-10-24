# Molsters mobile app

The Expo (SDK 58) app for Molsters. It needs the API server from the repo root running on your computer.

```bash
npm install
npx expo start      # scan the QR code with your iPhone camera to open it in Expo Go
npm run typecheck
```

See the [main README](../README.md) for the full setup, including the iPhone and firewall steps.

- Screens: `src/app/` (Expo Router; one folder per role)
- Components: `src/components/`
- API client, sign-in, photos: `src/lib/`
- Shared types from the server: `../shared/` (imported as `@shared/...`)
