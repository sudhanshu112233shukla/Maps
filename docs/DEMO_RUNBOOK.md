# Demo Runbook

This repo supports a user-facing demo in two modes:

1. Web demo (fastest to share).
2. Android debug demo (closest to real device behavior).

## Web Demo

1. Install dependencies:
   - `npm install`
2. Start demo:
   - `npm run demo:web`
3. Run integrity checks (optional, recommended for RC):
   - `npm run selfcheck:all`
   - `npm run selfcheck:rc-freeze`

What to demo:
- Switch regions (India/USA/UK/Europe/South Korea/Japan/Russia/Australia).
- Offline pack manager: start/pause/resume/cancel (behavior is simulated in web mode but transaction semantics are enforced).
- Search: multilingual + typo tolerance (example: `allahbad staton`).
- Routing: fastest/safest/eco/no-toll with AR HUD.

## Android Debug Demo (Windows)

1. Build web + sync Capacitor:
   - `npm run mobile:build`
2. Assemble debug APK with Gradle cache on `G:`:
   - `npm run android:assemble:debug:g`
   - APK output is copied to `artifacts/apks/` automatically.

Notes:
- For full native SDK validation, install and run on a physical device via Android Studio or `npx cap run android`.
- If you change pack manifests/catalog/readiness, re-run `npm run release:freeze`.

Troubleshooting:
- If routing says no offline route, verify the active region matches your location (region auto-infers after GPS) and that `public/data/graph/<region>.json` exists in the bundle.
