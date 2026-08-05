# Cloudflare synchronization and operations boundary

- **Research date:** 2026-08-05
- **Wayfinder ticket:** Validate the Cloudflare synchronization and operations boundary
- **Scope:** Workers, static hosting, D1, R2, authentication/session support, quotas, synchronization guarantees, migrations, cleanup, observability, and recovery
- **Sources:** Current first-party Cloudflare documentation only

## Executive verdict

Cloudflare Workers, D1, and R2 are a suitable hosted foundation for MechaStudio's intended family-and-friends scale, but the boundary needs to be narrower and more explicit than the current plan and prototype imply.

The recommended hosted shape is one **Cloudflare Worker with Static Assets** serving the Vite SPA and handling `/api/*`, with D1 and a private R2 bucket bound to the same Worker. Cloudflare now documents this as a full-stack deployment model, supports SPA fallback and selective Worker-first routing for `/api/*`, and provides broader features than Pages, including Cron Triggers and fuller observability. Static asset requests remain free while API invocations are billed as Workers requests. This should replace the planned split between a Pages deployment and a separately operated API Worker unless an existing Pages deployment creates a migration constraint. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [Pages-to-Workers comparison](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)

The hosted product can safely promise:

- server-authoritative online authoring with revision checks;
- foreground synchronization of acknowledged changes;
- offline execution of previously cached immutable Session snapshots;
- idempotent upload of Session completion events when connectivity returns; and
- private, authorized media reads through the Worker.

It must **not** promise real-time synchronization, reliable background synchronization on mobile, conflict-free multi-device offline editing, atomic commits spanning D1 and R2, uninterrupted availability on the free tier, or a guaranteed zero-dollar Cloudflare bill. Those are either outside the chosen product boundary or not provided by the documented platform primitives.

The current cloud code should be treated as a prototype, not the implementation-ready synchronization contract. Its record-by-record push/download merge has no revisions, change cursor, tombstones, batch import transaction, or idempotent completion queue. Its media quota reservation and one-time upload consumption also contain concurrency windows. These are application design issues, not Cloudflare limitations.

## Evidence labels

- **Confirmed** means Cloudflare documentation directly states the fact.
- **Inference** means the conclusion follows from confirmed platform facts plus this application's requirements.
- **Unknown** means the documentation does not settle the issue or the result depends on production measurement or a product decision.

## 1. Hosting and same-origin routing

### Confirmed facts

Workers Static Assets can deploy a full-stack application with static files and a Worker API in one project. `assets.not_found_handling = "single-page-application"` provides SPA navigation fallback, and `assets.run_worker_first = ["/api/*"]` can selectively invoke Worker code for API paths while static assets use the asset path. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

Static asset requests are free; Workers Free currently includes 100,000 dynamic invocations per day and 10 ms of CPU per invocation. Workers Paid has a USD 5 monthly minimum, 10 million included requests per month, and metered request and CPU overage. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

Pages Functions is also a viable same-origin model. Pages can bind D1 and R2, `_routes.json` can exclude static routes from Functions invocation, and Pages can be configured to fail closed when its Free Functions allowance is exhausted. Pages Functions invocations share the Workers quota. [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Pages Functions routing and fail mode](https://developers.cloudflare.com/pages/functions/routing/), [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)

Cloudflare's current migration guidance describes Workers as having broader features than Pages, including Cron Triggers and more comprehensive observability, while retaining a similar cost structure for static assets and dynamic invocations. [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)

### Decision implication

Use a **single Worker deployment** with:

```jsonc
{
  "main": "apps/api/src/index.ts",
  "assets": {
    "directory": "apps/web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"],
  },
}
```

The exact monorepo build path may differ, but `/api/*` must never fall through to the SPA. **Inference:** this shape removes CORS from the normal application flow and keeps authentication on one host, but same origin does not remove CSRF risk; authenticated mutations still require an anti-CSRF value and origin checks.

If a Worker Route is used, configure it to **fail closed** when the free request allowance is exhausted. Cloudflare documents that fail-open route behavior bypasses the Worker, whereas fail-closed returns an error; bypassing authentication or authorization is unacceptable. A Worker Custom Domain is itself the origin rather than a proxy route, so its exhausted-limit behavior must also be verified in staging and must never have an API-to-static fallback. [Workers daily-request fail modes](https://developers.cloudflare.com/workers/platform/limits/#daily-requests), [Workers routes and custom domains](https://developers.cloudflare.com/workers/configuration/routing/)

## 2. Platform limits and cost boundary

### Confirmed limits as of the research date

| Service              | Free allowance or hard limit                                                                                                                                                | Operational consequence                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workers              | 100,000 requests/day; 10 ms CPU/request; 128 MB/isolate; 50 subrequests/request; six simultaneous outgoing connections; five Cron Triggers/account                          | Suitable for small JSON APIs, but authentication plus large-body processing must be measured on a deployed Free Worker. Exceeding the request allowance returns an error when fail-closed. |
| Worker HTTP          | 100 MB incoming body on a Cloudflare Free zone; 128 KB request headers; no enforced response-body limit                                                                     | The application's 15 MiB media limit is below the network body limit, but must still be enforced by application code.                                                                      |
| Worker static assets | 20,000 files/version and 25 MiB/file on Free                                                                                                                                | Compatible with the current PWA if generated catalog/media assets stay below the per-file limit.                                                                                           |
| D1                   | 10 databases/account; 500 MB/database; 5 GB/account; 50 D1 queries per Free Worker invocation; 2 MB maximum row/string/BLOB; 100 KB SQL statement; 30-second query duration | Store structured records and metadata, not uploaded media. Cap application JSON well below 2 MB and paginate/batch work.                                                                   |
| D1 usage             | 5 million rows read/day, 100,000 rows written/day, 5 GB total storage on Free                                                                                               | Free usage fails closed: once a daily read/write limit is reached, D1 queries return errors until reset at 00:00 UTC.                                                                      |
| R2                   | 10 GB-month Standard storage, 1 million Class A operations/month, 10 million Class B operations/month, free egress                                                          | Usage beyond the included amount is metered; these are not documented as a hard spending cap.                                                                                              |
| R2 object API        | 5 TiB object limit, 5 GiB single-part upload, effectively unlimited objects/storage per bucket                                                                              | Platform limits are far above application limits; application quotas are the actual safety boundary.                                                                                       |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### Billing risk

**Confirmed:** R2 is usage-based billing. Its monthly free tier is deducted before storage and operation charges, and Cloudflare rounds billable usage up to the next billing unit. R2 egress itself is free. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

**Confirmed:** Cloudflare budget alerts are informational only. They do not pause or cap usage. [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)

**Inference:** The roadmap's phrase â€œfail closed rather than requiring a paid planâ€ is achievable for application admissions, but not as an absolute platform billing guarantee. An application can reject new profiles, writes, uploads, and media reads before configured budgets are reached; it cannot turn Cloudflare's budget alert into a spending cap or protect against every operator mistake, credential leak, or software defect.

### Required quota policy

Use Standard R2 storage only during this phase because the free tier does not apply to Infrequent Access storage. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Enforce all of the following in D1 transactions before R2 work begins:

- 15 MiB per uploaded file;
- 250 MiB reserved-plus-ready bytes per Profile;
- a hard active Profile count or account-wide media reservation cap;
- an account-wide ceiling no higher than **8 GiB** for ready plus reserved media, leaving margin below the 10 GB-month free allowance;
- bounded JSON request size (recommended 256 KiB) and bounded resource counts; and
- per-Profile and account-wide request/operation budgets for uploads and private media reads.

The 8 GiB figure is an application policy, not a Cloudflare limit. At 250 MiB per Profile, 32 fully utilized Profiles equal 8 GiB. The cap must include unexpired upload reservations so concurrent intents cannot over-admit storage.

Do not expose R2 S3 credentials, enable `r2.dev`, or attach a public custom domain to the private media bucket. Unauthorized R2 requests are not billed, but authorized abusive or defective application traffic can consume operations. [R2 pricing FAQ](https://developers.cloudflare.com/r2/pricing/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## 3. D1 transaction and consistency semantics

### Confirmed facts

D1 runs in auto-commit. `db.batch()` executes prepared statements sequentially as a SQL transaction; a failing statement aborts or rolls back the entire sequence. [D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

Each D1 database is single-threaded and processes queries one at a time. Excess concurrency is queued until the queue fills, at which point D1 returns an overloaded error. Query duration determines throughput, and Cloudflare recommends indexes and chunked migrations for large operations. [D1 limits and throughput](https://developers.cloudflare.com/d1/platform/limits/)

Read replication is asynchronous. When enabled, unconstrained replica reads may be stale. The D1 Sessions API attaches bookmarks and provides sequential consistency; `first-primary` starts with the latest primary state, and a supplied bookmark guarantees a later session starts from a database version at least as recent as that bookmark. Writes still go to the primary. [D1 read replication and Sessions API](https://developers.cloudflare.com/d1/best-practices/read-replication/)

### Decision implication

Keep read replication **disabled initially**. It is unnecessary at family scale and avoiding it simplifies read-after-write behavior. If it is enabled later, all sync operations must use D1 Sessions, return a bookmark to the client, and accept the client's last bookmark on its next sync. Use `first-primary` for authentication-sensitive or post-mutation reads.

Model resource mutation as one D1 transaction with these fields:

- server-controlled `revision`;
- server-controlled monotonically increasing per-Profile `change_sequence`;
- `updated_at` generated by the server;
- nullable `deleted_at` tombstone; and
- client-generated `mutation_id` under a unique constraint for idempotency.

A mutation supplies `base_revision`. The transaction applies it only if the current revision matches, increments the Profile change sequence, and records the mutation ID. A mismatch returns `409 Conflict`; it must never silently overwrite another device's acknowledged edit.

**Inference:** D1 `batch()` can make changes to D1 records atomic, but it cannot provide an atomic transaction across D1 and R2 because those are separate bindings with separate commit APIs. Media handling therefore needs an explicit saga/state machine and reconciliation rather than a claimed distributed transaction.

## 4. Private media boundary

### Confirmed facts

R2 buckets are private by default. A Worker accesses a bucket through an R2 binding and must implement authorization before exposing operations to incoming requests. [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Use R2 from Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)

R2 object writes, metadata changes, deletes, and listings are strongly consistent when accessed directly through the Workers or S3 APIs. Caching through a public custom domain relaxes those guarantees and can serve stale or deleted objects until expiry or purge. [R2 consistency model](https://developers.cloudflare.com/r2/reference/consistency/)

R2 presigned URLs are bearer tokens. They support `PUT` but not HTML-form `POST`; anyone holding a URL may use it until expiry. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

R2's S3 compatibility table lists bucket versioning APIs as unimplemented. Bucket locks can prevent overwrite and deletion for a period, but they are retention controls, not object versioning. [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

### Decision implication

Serve private media only through `GET /api/media/:id` after session authentication and Profile ownership authorization. Return `Cache-Control: private, no-store` from the network API. Cache offline media deliberately in a Profile-scoped IndexedDB store; do not let the service worker's general runtime caching rules cache `/api/*` responses.

Do not use direct presigned uploads in the first hosted version. **Inference:** a presigned `PUT` is a bearer capability and the documented API offers no POST policy mechanism to impose the application's 15 MiB condition before storage. Proxying a maximum 15 MiB upload through the Worker preserves size, signature, one-time-intent, quota, and authorization checks in one application boundary.

The upload protocol must be a saga:

1. An authenticated, CSRF-protected request atomically reserves both Profile and account bytes in D1 and creates a short-lived intent.
2. Upload redemption atomically claims the unused intent before writing to R2 and creates a D1 asset in `uploading` or `quarantine` state.
3. The Worker validates declared length, MIME allowlist, and file signature, then streams the bounded body to a server-generated, immutable R2 key.
4. A D1 transaction marks the asset `ready` and moves bytes from reserved to used.
5. Any failure records a retryable/rejected state and releases reservation exactly once. A scheduled reconciler deletes orphaned R2 objects and expires abandoned intents.

Never overwrite a ready media key. Create a new key when replacing Exercise media and soft-delete the old metadata before eventual object deletion. This prevents last-writer-wins corruption and makes recovery possible without object versioning.

The Worker limit is 128 MB per isolate, and Cloudflare explicitly recommends streaming rather than buffering large bodies. The Free CPU limit is 10 ms; Cloudflare notes that authentication and large-payload work can exceed 10 ms. The current full-`ArrayBuffer` implementation must be benchmarked on a deployed Free Worker, and streaming should be the target design. [Workers CPU and memory limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)

## 5. Authentication, sessions, throttling, and cleanup

### Confirmed primitives

Workers implements Web Crypto, including `crypto.getRandomValues()` and `crypto.subtle`, and supports encrypted Worker secrets. Cloudflare explicitly says sensitive values must use secrets rather than plaintext Wrangler variables. [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

Workers does not supply an application session abstraction; it treats the `Cookie` header like any other header. Workers can emit multiple `Set-Cookie` headers, so secure cookie lifecycle remains application code. [Workers Request and cookies](https://developers.cloudflare.com/workers/runtime-apis/request/), [Workers Headers](https://developers.cloudflare.com/workers/runtime-apis/headers/)

The Workers Rate Limiting binding is local to a Cloudflare location, permissive, eventually consistent, and explicitly not an accurate accounting system. Its supported windows are 10 or 60 seconds. [Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Cron Triggers run a Worker's `scheduled()` handler on UTC schedules. Workers Free currently permits five Cron Triggers, with 10 ms CPU per scheduled invocation. [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

### Decision implication

The current high-entropy code approach is compatible with Workers. Generate invite, recovery, session, upload-intent, and CSRF values with Web Crypto; store only hashes for bearer credentials; return an invite/recovery secret only at its intended one-time display boundary. Keep the session token in a `Secure; HttpOnly; SameSite=Strict; Path=/` cookie and the CSRF value in a separate same-origin cookie/header scheme. Add an exact `Origin`/`Sec-Fetch-Site` check to authenticated mutations as defense in depth.

The Rate Limiting binding is a fast first layer, not the entire login-throttling promise. Add durable D1 cooldown/attempt state for invite and recovery credential hashes, bounded by an earlier per-IP Rate Limiting check. Return generic authentication errors. Because invalid-attempt writes can themselves exhaust D1 Free writes, set strict local limits before reaching D1 and consider a human challenge if public exposure attracts automated abuse.

Expired/revoked status must be checked on every authentication or redemption request. Scheduled cleanup only removes expired sessions, used invites, abandoned upload intents, tombstones, and rejected media in small indexed batches; cleanup failure must not make an expired credential valid. One daily Cron Trigger is enough for the initial workload.

Recovery requires explicit product operations that are not optional: list active devices/sessions, revoke a session, rotate the recovery code, revoke a lost recovery code, and define what an administrator can do when all recovery material is lost. Cloudflare does not provide these application semantics.

## 6. Synchronization contract that can safely be promised

### Server authority and initial import

After a Profile is created, D1 is authoritative for Profile-owned Exercises, Blocks, Routines, Plans, and authored Session metadata. IndexedDB is the device cache and offline Session runtime store.

First sign-in may import existing local data, but the import must be versioned, previewed, and submitted with an import ID. Structured records should be validated completely, then committed in bounded D1 transactions with the import ID under a uniqueness constraint. Media uploads occur as separate resumable sagas. The original local database is not deleted automatically.

### Change feed

Expose a cursor protocol, for example:

- `GET /api/sync?after=<sequence>&limit=<bounded>` returns ordered changes, tombstones, the next cursor, and `hasMore`;
- online resource mutation supplies `baseRevision` and `mutationId`;
- the server returns the authoritative record, revision, and change sequence; and
- cursors and revisions are opaque to product UI.

This is simpler and safer than repeatedly downloading entire collections. It supports bounded D1 reads, deletion propagation, retries, and deterministic convergence without claiming offline conflict resolution.

### Online authoring

Profile authoring requires connectivity, as the plan already proposes. The UI may be optimistic, but it must distinguish â€œsavingâ€ from â€œsavedâ€; a change is durable across devices only after the server acknowledges it. Concurrent online edits use `baseRevision`; a conflict causes refresh and an explicit user choice rather than last-writer-wins.

### Offline Session execution

Before a planned Session is shown as offline-ready, cache its immutable runtime snapshot, required Exercise text, and required private media in IndexedDB. Starting and running that snapshot requires no server. A browser refresh or visibility interruption continues to use the existing local Session Runner behavior.

Session completion is an append-only event with a client-generated UUID. The client queues it locally and retries in the foreground when online. D1 stores the UUID under a unique constraint, so a retry returns the existing acknowledgement rather than creating a duplicate. A completion acknowledgement can safely promise eventual upload while the browser data remains present; it cannot promise upload after the user deletes browser storage.

### Explicit non-promises

The hosted phase does not promise:

- background synchronization while iOS suspends the PWA;
- real-time updates between open devices;
- authoring on multiple offline devices;
- automatic merging of concurrent edits;
- atomic D1-plus-R2 mutation;
- offline access to media that was never cached successfully; or
- uninterrupted cloud authoring when Workers or D1 free allowances are exhausted.

These limits must appear in product copy and acceptance tests, not only architecture documentation.

## 7. Migrations, deployment, observability, and recovery

### Migrations and releases

D1's Wrangler migration system stores ordered SQL files and records applied migrations in a migrations table. It can list and apply remaining migrations. [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

Keep migrations append-only. Use separate preview/staging bindings, apply production migrations before code that requires them, and use expand/contract changes so the previous and next Worker versions can both operate during a rollback window. Capture a D1 Time Travel bookmark immediately before production migration and record the deployed Worker version.

Cloudflare does not document migration files as an automatic application rollout transaction. Therefore destructive schema changes need an explicit runbook, verified backup point, bounded migration, health check, and rollback decision.

### Observability

Workers Logs captures invocation logs, custom logs, errors, and uncaught exceptions. On Workers Free, the included allowance is currently 200,000 log events/day with three-day retention; a log event is capped at 256 KB. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

Workers metrics are retained for up to three months. D1 and R2 expose per-database/per-bucket metrics through the dashboard and GraphQL; D1 and R2 analytics are retained for 31 days. D1 metrics include rows read/written, query latency, response bytes, and storage; R2 metrics include operation status, object count, pending multipart uploads, and storage bytes. [Workers metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/), [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [R2 metrics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)

Enable structured, sampled logs with request ID, route name, result class, latency, CPU time, D1 row counts, and retry/reconciliation outcome. Never log cookies, invite/recovery/upload tokens, CSRF values, full Profile payloads, or private media keys. Add a D1 application audit table for administrator actions; platform invocation logs are not a substitute for product audit history.

Monitor at minimum:

- 5xx/429/CPU-limit rate;
- failed authentication and recovery result counts without credential values;
- D1 rows read/written versus daily allowance;
- R2 ready/reserved bytes and Class A/B operations versus application budgets;
- orphaned/uploading media age;
- sync conflicts and completion-event retry age; and
- Cron cleanup/reconciliation last success.

Create a low Cloudflare budget alert, but treat it as delayed notification, not enforcement. [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)

### Backups and recovery

D1 Time Travel is always on for production-backend databases. It supports point-in-time restore to any minute within seven days on Workers Free and 30 days on Workers Paid, at no additional restore/storage cost. A restore overwrites the database in place and cancels in-flight work. Cloudflare also documents exporting D1 to R2 for retention beyond the Time Travel window. [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)

R2 is designed for eleven-nines durability, but Cloudflare explicitly distinguishes durability from protection against intentional or accidental deletion. R2 does not implement S3 bucket versioning; bucket locks can prevent deletion/overwrite for a configured retention period. [R2 durability](https://developers.cloudflare.com/r2/reference/durability/), [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

Required recovery policy:

- rely on D1 Time Travel for short-window database recovery;
- export D1 periodically to a separately permissioned, retention-locked R2 backup prefix for a longer window if the product needs more than seven days;
- use immutable media keys and delayed hard deletion;
- if media recovery is required, copy media to a separately permissioned backup bucket/prefix before source deletion, because ordinary R2 delete is irreversible;
- retain user ZIP export/import even after profiles launch; and
- perform and document restore drills for both structured records and media references.

Retention locks conflict with immediate user-requested deletion. The retention period and deletion promise are product/legal decisions that must be resolved before enabling locks on private media.

## 8. Current implementation comparison

The following observations are based on the research worktree at the start of this ticket.

| Current behavior                                                                                                                            | Finding                                                                                                                                                        | Required decision/change                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`cloud-client.ts`](../../apps/web/src/cloud/cloud-client.ts) uploads each local record, downloads five whole collections, and merges by ID | No revision, change cursor, tombstone, pagination loop, import transaction, or safe concurrent-edit policy. A mid-sync failure leaves a partial server update. | Replace with versioned initial import plus cursor-based changes, base revisions, mutation IDs, tombstones, and bounded pagination. |
| [`D1ResourceStore.put`](../../apps/api/src/d1-stores.ts) reads ownership and then performs an unconditional upsert                          | The authorization read and write are separate; edits silently overwrite the current payload.                                                                   | Put ownership, revision comparison, mutation idempotency, and change-sequence insertion in one D1 transaction.                     |
| [`R2MediaStore.createUploadIntent`](../../apps/api/src/r2-media-store.ts) calculates usage and inserts a reservation in separate queries    | Concurrent requests can both observe capacity and over-reserve the Profile quota; there is no account-wide cap.                                                | Add transactional Profile/account usage rows or database constraints/triggers that make quota reservation atomic.                  |
| [`R2MediaStore.upload`](../../apps/api/src/r2-media-store.ts) reads an unused intent, writes R2, then consumes the intent                   | Two redemptions can race. A losing redemption's cleanup can delete an object made ready by the winner. D1 and R2 state has no reconciler.                      | Claim the intent before R2, use explicit upload states, immutable keys, idempotency, and scheduled orphan reconciliation.          |
| Media upload calls `arrayBuffer()` for as much as 15 MiB                                                                                    | Within the documented 128 MB ceiling, but Free CPU behavior is unverified and Cloudflare recommends streams for large bodies.                                  | Implement bounded streaming and benchmark signature validation/upload on a deployed Free Worker.                                   |
| Private media responses use `private, max-age=3600`                                                                                         | Browser HTTP caching can outlive the authenticated request and is not explicitly Profile-scoped by application state.                                          | Return `private, no-store`; populate Profile-scoped IndexedDB explicitly for offline use.                                          |
| Sessions and expired upload intents are checked for validity but never cleaned                                                              | Correctness survives expiry, but storage grows indefinitely.                                                                                                   | Add one bounded daily cleanup/reconciliation Cron and monitor its last success.                                                    |
| Recovery credentials are reusable with no expiry/rotation endpoints                                                                         | Does not meet the roadmap's recovery rotation/revocation operations.                                                                                           | Add recovery lifecycle and device/session management before calling hosted access complete.                                        |
| Moderation only changes recommendation status                                                                                               | Approval does not yet create the separate shared-catalog Exercise required by the plan.                                                                        | Make approval transactionally create a new catalog record and retain provenance without exposing the private source record.        |
| `wrangler.example.jsonc` defines an API-only Worker                                                                                         | Does not yet establish the same-origin static asset/API deployment or production fail mode.                                                                    | Replace the example with one deployable Worker Static Assets configuration after the hosting decision is recorded.                 |

## 9. Confirmed conclusions, inferences, and unknowns

### Confirmed

- Workers Static Assets can host this SPA and API at one origin, and static requests are free. [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- D1 batches provide database-local transactional rollback, and Sessions bookmarks provide sequential consistency if read replication is used. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- R2 is private by default and strongly consistent through direct APIs, but S3 bucket versioning is not implemented. [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- D1 Free allowances fail with errors when exhausted; R2 overage is usage-based billing, and budget alerts do not cap it. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
- The Workers Rate Limiting binding is approximate and location-local, so it cannot alone establish a globally strict login-attempt counter. [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

### Inferences

- One Worker is the lowest-complexity same-origin deployment for this roadmap because it combines assets, API, Cron, observability, D1, and R2 bindings without a second routing/deployment surface.
- Disabling D1 read replication initially is safer than paying the consistency complexity for a workload that does not need read scaling.
- R2 writes and D1 metadata changes require a saga because no documented binding offers a shared transaction.
- Absolute â€œno paid plan/no billâ€ wording is unsafe; â€œthe application stops admitting new usage before configured free-tier budgetsâ€ is testable and honest.
- Foreground, cursor-based sync plus offline immutable Session execution matches the roadmap; full-record push/pull does not.

### Unknowns requiring validation or a product decision

- Whether the complete authentication plus streaming 15 MiB validation path stays below 10 ms CPU on Workers Free. This needs a deployed benchmark with JPEG, GIF, MP4, and WebM samples.
- Expected Profile count, media utilization, and monthly private-media reads. These determine whether 250 MiB/Profile and an 8 GiB account ceiling are appropriate.
- Required cloud availability. The Free plan deliberately fails after daily limits; if uninterrupted authoring is required, Workers Paid becomes an operational requirement.
- Retention and deletion policy for private media, especially whether a recovery window may delay permanent deletion.
- Recovery policy when a member loses every signed-in device and the recovery code. This is an application trust decision, not a Cloudflare capability.
- Whether long-term D1 exports and copied media backups may live in the same Cloudflare account or require an independently controlled destination.
- The documented Rate Limiting binding page does not state a separate price or plan entitlement. Confirm the deployed account accepts the binding before making it part of the launch gate.

## 10. Wayfinder decision recommendation

Record or revise the hosted architecture decision as follows:

> MechaStudio's hosted phase uses one same-origin Cloudflare Worker with Static Assets. D1 is authoritative for Profile-owned structured records and synchronization metadata. A private R2 bucket stores immutable uploaded media. IndexedDB remains the offline cache and Session runtime store. Online authoring uses revision-checked, idempotent mutations and a cursor change feed. Offline work is limited to immutable Session execution plus an idempotent completion-event outbox. Media uses a quota-reserved D1/R2 saga and reconciliation; the system does not claim a cross-service transaction. Application Profile and account quotas stop admitting usage below free-tier allowances, while Cloudflare budget alerts provide notification rather than a spending cap.

Before the hosted phase can be called implementation-ready, acceptance criteria must cover:

1. concurrent edits returning `409` rather than overwriting;
2. retrying the same mutation/completion/import without duplication;
3. deletion propagation through tombstones;
4. cursor pagination and interrupted-sync resume;
5. concurrent media intents never exceeding Profile or account caps;
6. concurrent redemption of one upload token storing at most one ready asset without deleting the winner;
7. R2 success followed by D1 failure, and D1 claim followed by R2 failure, both reconciled;
8. authenticated media denial across Profiles and after logout;
9. Free CPU benchmarks for maximum media uploads;
10. fail-closed API behavior at quotas and platform errors while the cached local Session remains usable;
11. expired credentials remaining denied even when cleanup has not run;
12. migration rollback from a captured Time Travel point;
13. D1 and media restore drill; and
14. observability proving quotas, reconciliation, sync lag, denied paths, and cleanup health without logging secrets.
