# MechaStudio — Agent Guide

MechaStudio is a responsive, local-first training PWA for family and friends. It builds Exercises, reusable Blocks, Routines, dated Plans, and guided Sessions. The stack is TypeScript, Vite, React, Dexie/IndexedDB, and a staged Cloudflare Worker/D1/R2 backend. The web application runs on Windows, macOS, and iPhone browsers.

This file is the project's source of truth. Keep commands, boundaries, and the definition of done current.

## Architecture

- `packages/domain`: framework-independent schemas, Routine compiler, and Session Runner state machine. It depends only on Zod.
- `apps/web`: React PWA, IndexedDB adapter, authoring flows, backup/restore, responsive UI, and PWA configuration. It may depend on `packages/domain`; domain must never depend on the web app.
- `tools/catalog`: developer-only, allowlisted external catalog adapters and snapshot generation. Raw responses belong in ignored `.scratch/` storage.
- `apps/api`: same-origin Cloudflare Worker, D1 adapters, private R2 media handling, authentication, authorization, and moderation. It may depend on `packages/domain`; domain must never depend on the API.
- `apps/web/public/catalog`: generated, reviewed catalog snapshots. Do not edit imported records manually; change the adapter or reviewed source and rebuild.
- `apps/api/migrations`: append-only D1 migrations. Never edit an applied migration.
- `apps/api/wrangler.jsonc`, `.env*`, `.dev.vars`, and `.scratch/` are local/sensitive and must remain uncommitted.

## Commands

- Start: `npm run dev`
- Focused test: `npx vitest run <test-path> --pool=threads --maxWorkers=1`
- Unit/integration tests: `npm test`
- Browser tests: `npm run test:e2e`
- Type checking: `npm run typecheck`
- Catalog fetch/build: `npm run catalog:fetch` / `npm run catalog:build`
- Full verification: `node scripts/verify.mjs`

Use npm workspaces and commit `package-lock.json`. IndexedDB schema versions live in the Dexie adapter. D1 migrations are ordered SQL files and append-only. Prettier owns formatting; ESLint owns static analysis.

## Invariants

- Treat every external boundary as attacker-reachable: authorize explicitly, validate untrusted input, protect secrets, and test denied paths.
- Never read, print, hardcode, or commit secrets. Use ignored `.dev.vars` locally and Cloudflare encrypted secrets when deployed.
- Never weaken, delete, or skip a check to make verification pass.
- Work on `feature/<topic>`, never directly on the default branch. Do not use tool-branded branch prefixes. A temporary `research/<topic>` branch is the explicit exception for an approved Wayfinder research task.
- Local commits are allowed after verification. Stage only intended paths, use a human-style message with zero AI attribution, and report the SHA.
- Never push feature branches. A `research/*` push to `origin` requires separate explicit approval and may not force, delete, mirror, push tags, or include another refspec.
- Agents must not run destructive Git operations that discard user work: `reset --hard|--merge|--keep`, forced clean/branch/worktree removal, whole-worktree checkout/restore/`git rm`, or `stash clear`.

## Workflow

- Read `CONTEXT.md` and relevant `docs/adr/` entries when they exist.
- Follow the matching installed skill for nontrivial workflows. Project-specific skill sources live in `.harness/skills/`; `.claude/skills/` and `.agents/skills/` are generated adapters and must not be edited by hand.
- Keep changes within the approved specification. Do not add speculative abstractions or unrelated cleanup.
- Prefer the nearest existing pattern. If a decision is missing and materially changes scope, stop and ask.

## Definition of done

`node scripts/verify.mjs` must exit `0`. It is the final vote and runs the same restore, build, analysis, format, test, and security gates as CI.

Before calling work complete, also confirm that new behavior is tested, applicable security-checklist items pass, the staged patch contains only intended files, and documentation reflects any durable project truth that changed.

## Project conventions

- Use the glossary in `CONTEXT.md`; the guided execution interface is always “Session Runner,” never “player.”
- External input is validated at the seam with Zod or an explicit binary signature allowlist. Descriptions render as text, never raw HTML.
- Profile-owned identifiers are authorized server-side. Every authenticated mutation requires the CSRF header and cookie to match the server-side Session value.
- Uploaded objects use server-generated keys, a 15 MiB limit, allowlisted MIME types, byte-signature checks, quarantine intent state, and private reads.
- Timers derive remaining time from an absolute deadline. Hidden or locked applications pause and require an explicit resume.
- Copy Block Templates into Routines and Routines into Plans; never introduce live-linked templates or recursive Blocks.
- New code follows vertical red-green slices through public interfaces. Mock only browser, time, network, D1, or R2 seams.
