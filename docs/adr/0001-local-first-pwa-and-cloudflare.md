# 0001: Local-first PWA with a staged Cloudflare backend

- Status: Accepted
- Date: 2026-08-01

## Context

MechaStudio must be usable in browsers on iPhone, macOS, and Windows, remain inexpensive for family use, and provide a working Routine and Session experience before identity and synchronization are introduced. Local browser data must later migrate into private Profiles without replacing the Session Runner or domain model.

## Decision

Build a Vite and React progressive web application whose local adapter stores editable data and uploaded media in IndexedDB through Dexie. Keep Routine compilation and Session Runner state in a framework-independent TypeScript module. Use versioned ZIP backups for local device transfer.

Add a same-origin Cloudflare Worker only for the hosted phase. Use D1 for Profiles and structured records and private R2 objects for uploaded media. IndexedDB remains the offline playback cache after profiles are enabled.

## Consequences

- The first release needs no runtime server and can be hosted as static assets.
- Browser storage is isolated by browser profile and device; manual backup is required before synchronization ships.
- Storage and cloud implementations meet at repository interfaces instead of leaking into the domain or Session Runner.
- Cloudflare free allowances are operational constraints, not permanent guarantees. Application quotas must fail closed rather than create unexpected charges.
- Safari background execution remains best-effort; the foreground Session pauses when the application becomes hidden.
