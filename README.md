# MechaStudio

MechaStudio is a responsive, local-first training PWA for building Exercises, reusable Blocks, Routines, dated Plans, and guided Sessions. It runs as a normal website on Windows and macOS and can be installed from Safari on iPhone.

## Requirements

- Node.js 22 or newer
- npm 11 or newer

## Development

```powershell
npm install
npm run dev
```

The development server prints its local URL. Use the network URL to test from a phone on the same trusted network.

## Commands

- `npm run dev` — start the web application.
- `npm test` — run domain, persistence, UI, catalog, and API behavior tests.
- `npm run test:e2e` — run browser flows after Playwright browsers are installed.
- `npm run catalog:fetch` — fetch the allowlisted wger catalog into ignored `.scratch/` storage.
- `npm run catalog:build` — validate and normalize the downloaded catalog into the PWA snapshot.
- `node scripts/verify.mjs` — run the complete definition-of-done gate.

## Data

Local records and uploaded files live in IndexedDB inside the current browser profile. Refreshing or restarting normally preserves them. ZIP backup/restore moves local data between devices until a hosted Profile is enabled.

Copy `apps/api/wrangler.example.jsonc` to the ignored `apps/api/wrangler.jsonc` only when provisioning a Cloudflare development environment. Do not commit provider credentials or local configuration.
