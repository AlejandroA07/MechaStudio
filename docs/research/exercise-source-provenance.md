# Exercise catalog sources and media provenance

**Status:** Wayfinder research result

**Researched:** 2026-08-05

**Scope:** Free catalog sources suitable for a reviewed, redistributable, offline snapshot in MechaStudio. This is an engineering assessment, not legal advice.

## Decision

Use **wger as the primary v1 metadata source**, fetched only by the developer catalog tool and converted into a reviewed, versioned snapshot. Do not make the browser or Session Runner depend on wger at runtime.

Do **not import wger media in the first catalog release** until the domain and snapshot formats can preserve provenance separately for the selected translation and each media asset. After that change, admit media record by record through an allowlist and review gate. wger exposes the necessary provenance fields, but the current MechaStudio adapter discards most of them.

Keep **ExerciseAPI** as a legally straightforward, pinned metadata supplement or fallback. It is too small and has no media, mobility, or conditioning records today, so it cannot replace wger.

Use **Wikidata/Wikimedia Commons only as a manually curated supplement**, never as an automatic exercise catalog. Reject **ExerciseDB/AscendAPI** for the local-first snapshot unless the provider supplies written rights that explicitly permit persistent redistribution for the applicable free tier. Reject the bundled images in **free-exercise-db / wrkout exercises.json** because their upstream maintainer says they were scraped and advises against commercial use.

## Evidence labels

- **Confirmed** means the statement is directly supported by a current first-party source or by the live API observation described below.
- **Inference** means it is an engineering conclusion from confirmed facts.
- **Unknown** means the provider does not publish a sufficiently clear contract or guarantee.

## Comparison

| Source                    | Catalog and locale                                                                     | Media                                                       | IDs                                                                    | Rights for offline snapshot                                                                               | Operational notes                                                                                          | Decision                                      |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| wger                      | 829 base exercises and 22 represented languages observed; every base had English       | 360 images and 78 videos observed; no GIF field             | UUID present on every observed base                                    | Per-record CC BY-SA 3.0, CC BY-SA 4.0, or CC0; attribution/share-alike duties vary by component           | Public exercise endpoints are currently unthrottled; no published SLA found                                | **Primary metadata; gated media later**       |
| ExerciseAPI               | 183 English exercises; current modalities are hypertrophy and calisthenics             | None                                                        | Stable slug contract: never reused or renamed                          | CC BY 4.0 with a supplied attribution line; immutable release snapshots                                   | 100 anonymous requests/day/IP; one request can retrieve the catalog; young project, no published SLA found | **Pinned supplement/fallback**                |
| Wikidata + Commons        | Wikidata has multilingual structured data, but no turnkey or complete exercise catalog | Commons has images, GIFs, and videos with per-file licenses | Stable Wikidata entity IDs; retain file title and revision for Commons | Wikidata is CC0; Commons reuse depends on each file's license and attribution                             | Public infrastructure has usage etiquette and no MechaStudio-specific SLA                                  | **Curated supplement only**                   |
| free-exercise-db / wrkout | 800+ English strength-oriented records advertised                                      | Two JPEGs per exercise in the derived dataset               | Filename-like IDs; no immutability contract found                      | Repository says Unlicense, but upstream says the images were scraped and it does not own their copyright  | GitHub-hosted files; no versioned data contract or SLA found                                               | **Reject bundled media; do not adopt for v1** |
| ExerciseDB / AscendAPI    | Free hosted tier advertises 1,500 exercises; only en-GB is currently available         | 180p GIF per free-tier exercise                             | Provider says exercise IDs are stable                                  | Published terms prohibit persistent storage and bulk collection; free-tier applicability is not clarified | Media URLs rotate weekly; rate limit for the anonymous hosted endpoint is unclear                          | **Reject for local-first snapshot**           |

Counts in the first row are from a complete read of [`/api/v2/exerciseinfo/?limit=1000`](https://wger.de/api/v2/exerciseinfo/?limit=1000) on 2026-08-05. Provider catalogs change, so every refresh must reproduce and record the audit rather than treating these counts as permanent.

## wger: primary source

### Confirmed facts

wger is an open-source training application with a public REST API. Its documentation says the initial exercise data is additionally licensed CC BY-SA 3.0 and notes that some images came from Wikipedia with source files; current data is more granular than that provider-level statement. [wger documentation](https://wger.readthedocs.io/en/latest/)

The current `exerciseinfo` serializer exposes a base integer ID and UUID, update timestamps, category, muscles, equipment, a base license and author, translations, images, videos, and author histories. A translation has its own UUID, language, name, source and rendered descriptions, license, author URLs, derivative source URL, and history. Images and videos likewise have independent license, author/source, history, and AI-generation metadata. [wger serializer source](https://github.com/wger-project/wger/blob/master/wger/exercises/api/serializers.py)

wger's current license fixture defines CC BY-SA 3.0, CC BY-SA 4.0, CC0, CC BY 4.0, and ODbL identifiers. The live catalog observation below contained only the first three at the base-exercise level; that is an observation, not a promise that future records will use only those licenses. [wger license fixture](https://github.com/wger-project/wger/blob/master/wger/core/fixtures/licenses.json)

Official API documentation says public exercise lists are accessible without authentication, pagination has no hard maximum, and endpoints other than a listed set of authentication, registration, and ingredient endpoints are currently unthrottled. Exceeding a configured limit returns HTTP 429 with `Retry-After`. [wger API documentation](https://wger.readthedocs.io/en/latest/api/api.html)

CC BY-SA 4.0 permits sharing and adaptation, including commercially, provided attribution, a license link, change indication, and ShareAlike are satisfied; CC BY-SA 3.0 carries the corresponding attribution and ShareAlike conditions, while CC0 is a public-domain dedication. [CC BY-SA 4.0 deed](https://creativecommons.org/licenses/by-sa/4.0/), [CC BY-SA 3.0 deed](https://creativecommons.org/licenses/by-sa/3.0/), [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/)

### Live catalog audit

The audit fetched the entire public `exerciseinfo` collection once with a descriptive user agent on 2026-08-05 and computed aggregates in memory. No raw response was added to the repository.

| Audit item                                    |                            Observed result |
| --------------------------------------------- | -----------------------------------------: |
| Base exercises returned                       |                                        829 |
| Bases with UUID                               |                                        829 |
| Bases with an English translation             |                                        829 |
| Translations                                  |                  3,287 across 22 languages |
| Base licenses                                 | 128 CC BY-SA 3.0; 680 CC BY-SA 4.0; 21 CC0 |
| English translation licenses                  | 128 CC BY-SA 3.0; 681 CC BY-SA 4.0; 20 CC0 |
| English translations missing `license_author` |                                         78 |
| Images                                        |     360: 88 CC BY-SA 3.0; 272 CC BY-SA 4.0 |
| Images missing their own `license_author`     |                                         87 |
| Images missing their own `license_object_url` |                                        342 |
| Images marked AI-generated                    |                                         35 |
| Videos                                        |                       78; all CC BY-SA 4.0 |
| Videos missing author                         |                                          0 |
| Videos missing `license_object_url`           |                                         78 |

Source: live [`exerciseinfo` response](https://wger.de/api/v2/exerciseinfo/?limit=1000), observed 2026-08-05. Missing a media `license_object_url` does not by itself prove that reuse is prohibited: the object may be original wger content rather than a derivative with an external source. It does mean the importer cannot silently claim complete provenance without review.

### Inferences

- The base exercise, selected translation, and selected media must be treated as separately licensed components. Copying only the base author/license can misattribute the text or media.
- The UUID is the best available provider key because every observed base has one and the API models UUIDs explicitly. It should be stored as an opaque string. This is still weaker than an explicit provider promise of immutability.
- wger is suitable for build-time refreshes but not a runtime dependency. The unthrottled public endpoint reduces refresh friction; the absence of a published SLA, changing community data, and MechaStudio's local-first requirement still favor pinned snapshots.
- wger provides still images and videos, not a GIF/animation field. Video can demonstrate movement later, but it is a larger PWA asset and needs the same provenance and size checks as any other imported media.

### Unknowns requiring conservative handling

- No explicit UUID immutability or non-reuse guarantee was found. The API exposes deletion-related endpoints in source, so a refresh process should compare prior records and handle removal/replacement rather than assuming append-only data. [wger endpoint source](https://github.com/wger-project/wger/blob/master/wger/exercises/api/endpoints.py)
- No public availability or support SLA was found for `wger.de`.
- It is not documented whether a blank component author or source should inherit from the base record. Do not infer inheritance automatically.
- The product has no settled policy yet for catalog images marked AI-generated.

### Gap in the current MechaStudio importer

The existing [`wger-adapter.ts`](../../tools/catalog/src/wger-adapter.ts) correctly restricts pagination to the expected HTTPS origin/path, uses a descriptive user agent, selects English, strips HTML to text, and prefers the base UUID over its integer ID. Its snapshot-only shape is directionally correct.

However, the adapter currently models `translation.license` as text or an object, while the live API supplies a numeric license identifier and puts resolved license details elsewhere. It takes the author only from the base record, omits translation UUID/source/history, omits all images and videos, and synthesizes a human-facing source URL whose current route was not confirmed. The current [`Exercise` and `MediaAsset` schemas](../../packages/domain/src/model.ts) also provide only one exercise-level provenance tuple and one media-level attribution/license/source tuple; they cannot retain distinct base and translation provenance without flattening it.

These are implementation implications, not changes made by this ticket.

## ExerciseAPI: pinned metadata supplement

### Confirmed facts

ExerciseAPI dataset v1.1.0 currently contains 183 exercises: 136 hypertrophy and 47 calisthenics. It exposes stable slug IDs that its contract says are never reused or renamed, names, classifications, equipment, and short cues. Conditioning and mobility are reserved for future releases, and the schema has no image, GIF, or video fields. [ExerciseAPI documentation](https://exercise-api.com/docs)

Anonymous use is limited to 100 requests per day per IP plus a burst limit; `limit=200` retrieves the current catalog in one request. The API contract is versioned and release snapshots are immutable. Data is CC BY 4.0 with a ready-made attribution line. [ExerciseAPI documentation](https://exercise-api.com/docs)

The current GitHub release explicitly describes its artifact as an immutable, integrity-checked 183-record snapshot and recommends pinning it instead of fetching the live API at build time. [ExerciseAPI releases](https://github.com/aschenoni/exercise-api/releases)

### Inference and unknowns

The clear stable-ID and snapshot contracts make this a low-friction metadata source, but its present scope misses the warm-up, stretching, jumping-jack, high-knee, and other conditioning/mobility use cases central to MechaStudio. It is a supplement, not the primary catalog. The project is young and has no published SLA; pinning a release removes most operational risk.

## Wikidata and Wikimedia Commons: curated supplement

### Confirmed facts

Wikidata structured data is available under CC0, provides globally unique entity identifiers and multilingual labels, and can be reused through APIs or database dumps. Its access guidance asks automated clients to identify themselves and react to throttling signals. [Wikidata reuse](https://www.wikidata.org/wiki/Wikidata:Reuse), [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [database downloads](https://www.wikidata.org/wiki/Wikidata:Database_download)

Wikimedia Commons content is not covered by one universal media license. Reusers must follow the license displayed for each file, typically retaining creator, source, license, and modification information; Commons recommends downloading/rehosting files rather than hotlinking. [Commons reuse guide](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en), [Commons license guide](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/licenses/en)

### Inference and unknowns

Wikidata is useful for aliases and locale labels, while Commons can fill a small number of important visual gaps. Neither provides a complete, normalized exercise catalog with consistent coaching descriptions. Any use should be an explicit allowlist of Wikidata entity IDs and Commons file titles/revisions, with the exact downloaded file and its machine-readable attribution captured during review. Completeness and fitness-instruction quality remain unknown and must not be inferred from presence in Wikimedia.

## free-exercise-db and wrkout exercises.json: provenance conflict

### Confirmed facts

`yuhonas/free-exercise-db` advertises more than 800 English exercise records, typically with two JPEG paths, and says the repository is Unlicensed and can be used locally. It also says it restructured the earlier `wrkout/exercises.json` dataset. [free-exercise-db repository](https://github.com/yuhonas/free-exercise-db), [license](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md)

The upstream `wrkout/exercises.json` contribution guide states that its two images per exercise were scraped from the internet, that the maintainer does not own their copyright, and that it advises against using them in commercial projects. It has no videos or GIFs. [wrkout contribution guide](https://github.com/wrkout/exercises.json/blob/master/CONTRIBUTING.md)

### Inference and unknowns

A repository-level Unlicense cannot cure rights the repository did not own. Therefore, the bundled images fail MechaStudio's provenance gate. The text has no per-record author/source trail or immutable-ID contract, so it also offers less assurance than wger or ExerciseAPI. Do not adopt it for v1; individual metadata could only be reconsidered after a separate provenance audit that excludes all unverified media.

## ExerciseDB / AscendAPI: incompatible with local-first storage

### Confirmed facts

The free hosted ExerciseDB V1 tier advertises 1,500 exercises with one 180p GIF each and no authentication. Its fields include a unique exercise ID, name, GIF URL, muscles, body parts, equipment, and instructions. [ExerciseDB V1 overview](https://docs.ascendapi.com/products/edb-v1/overview)

AscendAPI says IDs are stable but media URLs rotate every Monday. Its caching guide permits storage only when the selected plan explicitly grants it and directs consumers needing persistent storage, bulk downloads, or SLA-backed availability to contact the provider. [AscendAPI caching guide](https://docs.ascendapi.com/guides/caching)

The published terms reserve rights in data and media, limit the license to a subscription, prohibit persistent local/server storage and bulk collection, and cap temporary cache at one hour. The terms are written for subscribers and do not expressly explain how they apply to the unauthenticated hosted tier. [ExerciseDB terms](https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356)

Only en-GB is currently available; other languages, including Swedish, are planned or in progress. The general free-plan documentation says 1,000 requests/hour per API key, but the advertised unauthenticated endpoint has no key, so its exact limit is unclear. [AscendAPI translations](https://docs.ascendapi.com/guides/translations), [rate limiting](https://docs.ascendapi.com/guides/ratelimiting)

### Inference and unknowns

Its GIF coverage is attractive, but the storage terms and rotating URLs conflict directly with an offline PWA snapshot. The anonymous tier's redistribution rights and exact rate limit are unresolved. It must remain excluded unless AscendAPI gives MechaStudio written, tier-specific permission for persistent download, redistribution, and offline use.

## Required implementation gates

Before the first refreshed wger snapshot is accepted:

1. **Represent component provenance.** Store provider, base UUID, base update time, base license/author, selected translation UUID/language/license/author/source, and for every media item its UUID, license, author, source/derivative URL, history or review reference, and AI-generated flag.
2. **Use an explicit license allowlist.** Map provider license IDs to canonical SPDX-like labels and canonical license URLs. Reject unknown IDs by default; never replace an unknown with a provider-wide default.
3. **Review incomplete provenance.** Exclude records or media whose required attribution cannot be established. A blank source URL is a review signal, not automatic proof of either permission or prohibition.
4. **Generate attribution from snapshot data.** The product must be able to display author, provider/source, license link, and modification notice. Preserve ShareAlike obligations for adapted CC BY-SA descriptions or media.
5. **Pin and audit every refresh.** Record fetch time, endpoint, source dataset/version when available, record counts, license distribution, exclusions and reasons, and a content hash. Diff provider UUIDs and provenance fields against the prior snapshot.
6. **Keep network access developer-only.** Ship reviewed files from `apps/web/public/catalog`; never fetch third-party catalogs or media from the browser or Session Runner.
7. **Validate media as hostile input.** Download only allowlisted HTTPS origins, reject redirects outside the allowlist, enforce the existing 15 MiB ceiling, verify MIME type by byte signature, and transform only in an isolated build step.
8. **Test denied paths.** Add fixtures for unknown licenses, missing authors, changed license IDs, off-origin pagination/media URLs, oversized or signature-mismatched files, removed exercises, and AI-generated media policy decisions.

## Recommended v1 boundary

The safest useful first release is an English wger metadata snapshot with names and plain-text descriptions, using UUIDs and complete translation-level attribution, while users add their own local images/GIFs and exercises. A later reviewed catalog release can add wger images/videos once the provenance model and media audit gates above exist. ExerciseAPI can be pinned as a supplemental strength/calisthenics metadata set if its attribution is kept distinct. No live external API is required for ordinary app use.
