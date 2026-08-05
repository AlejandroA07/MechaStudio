# Cross-platform browser and PWA constraints

- Research date: 2026-08-05
- Wayfinder ticket: Validate the cross-platform browser and PWA constraints
- Target surfaces: iPhone Safari and Home Screen, macOS Safari and Chrome, Windows Chrome and Edge
- Evidence policy: standards and first-party browser/tool documentation only

## Executive conclusion

The approved local-first PWA architecture is viable for MechaStudio. IndexedDB is the appropriate editable-data store, a service worker is the appropriate application-shell/offline layer, and the normal HTTPS website can provide the complete authoring and foreground Session Runner experience on all target desktop browsers. Installation is an optional presentation and retention advantage, not a different application build. Microsoft documents Edge PWAs as installable Windows apps, and Apple supports Safari web apps on Mac and Home Screen web apps on iPhone. [Microsoft Edge PWA UX](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux) [Apple: web apps on Mac](https://support.apple.com/en-mide/104996) [Apple: web apps on iPhone](https://support.apple.com/en-ie/guide/iphone/iphea86e5236/ios)

The architecture cannot guarantee an uninterrupted Session while the page is hidden, the phone is locked, or the operating system suspends it. HTML timers are not exact, Chromium throttles background timers, and a screen wake lock is visibility-dependent and advisory. The approved behaviorâ€”derive remaining time from an absolute deadline, interrupt when hidden, and require explicit Resumeâ€”is therefore the correct product contract. [HTML timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers) [Chrome background timer policy](https://developer.chrome.com/blog/background_tabs) [Screen Wake Lock specification](https://w3c.github.io/screen-wake-lock/)

One material correction is required: an Apple Home Screen/Dock web app is a separate storage container. On iOS/iPadOS 17.2 and later, installation copies cookies but no other local storage; afterward no website data is shared. The same separation applies to a Safari web app added to the Dock on macOS. Work created in Safari before installation will therefore not appear in the installed app's IndexedDB. MechaStudio must tell users to install before authoring, or export/import a ZIP (and later use Profile sync) to move that data. [WebKit Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) [WebKit Safari 17.0](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/) [Apple: web apps on Mac](https://support.apple.com/en-mide/104996)

## Decision implications

1. **Keep the PWA/IndexedDB architecture.** It matches the platform storage model and does not require a native wrapper for the approved foreground experience. IndexedDB, Cache Storage, and service-worker registrations share an origin-keyed storage bucket but remain separate storage endpoints. [WHATWG Storage Standard](https://storage.spec.whatwg.org/)
2. **Treat Apple installation as a new local workspace.** Add onboarding language before installation and after first launch: install first, or make a ZIP backup in the browser version and import it into the Home Screen/Dock app. Cloud Profile sync later removes this manual step. [WebKit Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
3. **Keep background execution out of the guarantee.** Pause on `visibilitychange`, persist the runtime snapshot, and resume only after the user returns. Never advance a workout merely because delayed interval callbacks eventually fire. [Page Visibility Level 2](https://www.w3.org/TR/page-visibility-2/) [HTML timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)
4. **Make Wake Lock progressive enhancement.** Request it only for a visible active Session, observe `release`, and reacquire it after an explicit Resume/visible transition. Continue normally when unsupported or denied. Home Screen support on iPhone/iPad arrived in 18.4, later than Safari-tab support. [WebKit Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) [Screen Wake Lock specification](https://w3c.github.io/screen-wake-lock/)
5. **Unlock audio from a user gesture.** Create or resume one reusable `AudioContext` directly from Start/Resume and handle a rejected/suspended context. Keep visual warnings because sound can be blocked, muted, or unavailable. [Web Audio 1.1](https://www.w3.org/TR/webaudio-1.1/) [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/)
6. **Defer application updates during a Session.** Let a new service worker wait, show an update prompt only outside an active Session, then activate and reload deliberately. Do not unconditionally call `skipWaiting()` while a Session is open. [Workbox update guidance](https://developer.chrome.com/docs/workbox/handling-service-worker-updates)
7. **Keep ZIP backup as a first-class safety feature even after requesting persistence.** Persistence protects against automatic eviction, not explicit clearing by the user, origin changes, separate browser profiles, or separate Apple web-app containers. [WHATWG Storage Standard](https://storage.spec.whatwg.org/) [Chrome persistent storage](https://web.dev/articles/persistent-storage) [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
8. **Require physical Apple acceptance tests.** Windows Playwright WebKit and mobile emulation are useful regression signals, but they do not run branded Safari or reproduce an iPhone's OS integration. [Playwright browsers](https://playwright.dev/docs/browsers) [Chrome Device Mode limitations](https://developer.chrome.com/docs/devtools/device-mode) [Apple device inspection](https://developer.apple.com/documentation/safari-developer-tools/inspect-apps-and-devices)

## Platform behavior matrix

| Surface        | Normal website                     | Installed form                                                                                  | Local-data boundary                                                                                                                        | Material constraints                                                                                                                                        |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone Safari  | Full foreground web app over HTTPS | Add to Home Screen, with â€œOpen as Web Appâ€; iOS 26 permits any site to be added as a web app | The Home Screen app receives cookies at installation on iOS 17.2+, but not IndexedDB or other local storage; no later website-data sharing | Wake Lock in Home Screen web apps requires iOS 18.4+; hidden/locked execution is not guaranteed; safe-area CSS is required                                  |
| macOS Safari   | Full foreground web app            | Safari â€œAdd to Dock,â€ available from macOS Sonoma 14                                         | Dock web app is separate from Safari; initial cookies may be copied, but no other local storage is copied or subsequently shared           | Test Safari and the Dock web app separately; installation is optional                                                                                       |
| macOS Chrome   | Full foreground web app            | Chrome desktop PWA install                                                                      | Storage remains browser-profile/origin scoped; it is not shared with Safari or Safari Dock web apps                                        | Chromium autoplay, background timer, persistence, and service-worker lifecycle rules apply                                                                  |
| Windows Chrome | Full foreground web app            | Chrome desktop PWA install                                                                      | Chrome profile/origin scoped; not shared with Edge                                                                                         | Chromium rules apply; installed status can improve the chance that `persist()` is granted                                                                   |
| Windows Edge   | Full foreground web app            | Edge install integrates with Start, taskbar, and Alt+Tab                                        | Edge profile/origin scoped; not shared with Chrome                                                                                         | Production PWA APIs require HTTPS; a service worker is recommended for real offline behavior but is no longer mandatory for installation from the Edge menu |

The iPhone installation behavior is documented by Apple and WebKit. iOS 26 makes â€œOpen as Web Appâ€ the default for every site added to the Home Screen, while a manifest still supplies identity and presentation metadata. [Apple iPhone guide](https://support.apple.com/en-ie/guide/iphone/iphea86e5236/ios) [WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

The macOS behavior is documented by Apple: Safari web apps require macOS Sonoma 14 or later, live separately from Safari, and are launched from the Dock or Spotlight. [Apple: use Safari web apps on Mac](https://support.apple.com/en-mide/104996)

The Windows behavior is documented by Microsoft: an installed Edge PWA appears in the taskbar, Start menu, Alt+Tab, and Windows app settings. Microsoft also documents that production PWA capabilities such as service workers require HTTPS, while `localhost` is allowed for development. [Microsoft Edge PWA UX](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux) [Microsoft Edge PWA development](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/)

## IndexedDB persistence, quota, and eviction

IndexedDB is a local storage endpoint in the browser's origin-keyed storage bucket. Cache Storage and service-worker registrations are different endpoints in that same bucket, so the approved splitâ€”service worker for deployable application resources, IndexedDB for editable records and uploaded mediaâ€”is consistent with the web storage model. A changed scheme, host, or port changes the origin and therefore the storage key. [WHATWG Storage Standard](https://storage.spec.whatwg.org/)

Local buckets begin as `best-effort`. Under storage pressure a browser may clear best-effort buckets; when clearing a bucket, it clears the bucket in its entirety. A granted `navigator.storage.persist()` request changes the bucket to persistent, which prevents user-agent clearing without involvement from the origin or user. `estimate()` reports approximate usage and quota, not guaranteed capacity. [WHATWG Storage Standard](https://storage.spec.whatwg.org/)

Chromium grants or silently denies persistence using heuristics such as site engagement, installation/bookmarking, and notification permission. Even persisted data remains removable through site settings. MechaStudio should show the returned persistence status rather than promise that pressing the button succeeded. [Chrome persistent storage](https://web.dev/articles/persistent-storage)

WebKit 17+ calculates browser-origin quota at up to 60% of total disk and overall browser quota at up to 80%; standalone Home Screen/Dock web apps receive browser-app quota treatment. These are upper limits, not promises. WebKit may evict an origin under overall quota pressure, system storage pressure, or inactivity, and its persistence request is decided by heuristics such as Home Screen installation. Every write still needs `QuotaExceededError` handling. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

Consequently, refresh and ordinary browser restarts should preserve IndexedDB, but the product must continue to warn about site-data clearing, browser/profile deletion, Apple web-app separation, storage pressure, and domain migration. ZIP backup remains the only device-independent local recovery artifact before cloud sync. [WHATWG Storage Standard](https://storage.spec.whatwg.org/) [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

## Service workers, offline behavior, and updates

A service worker can intercept requests and serve a precached application shell, enabling repeat launches without a network connection. The first visit still needs the network because no service worker or cache exists yet. Offline acceptance must therefore test: first online load, successful worker activation and data/catalog preparation, browser close, network disabled, and a fresh relaunch. [Workbox application-shell model](https://developer.chrome.com/docs/workbox/app-shell-model)

Service-worker registration and caches are origin scoped. A worker only controls clients within its registered scope, and production registration requires a secure context. The app should keep a stable HTTPS origin and a root scope; changing the deployment origin creates a new local storage and service-worker boundary. [Service Workers specification](https://www.w3.org/TR/service-workers/) [Microsoft Edge PWA development](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/)

When an updated worker installs while the old worker controls open pages, the new worker normally waits until the old clients unload. Workbox's default generated-worker behavior supports an explicit `SKIP_WAITING` message rather than unconditional activation. This is exactly the seam needed to postpone activation until the Session Runner is no longer active. [Workbox update guidance](https://developer.chrome.com/docs/workbox/handling-service-worker-updates) [Workbox build options](https://developer.chrome.com/docs/workbox/modules/workbox-build)

Implementation comparison: the current Vite configuration uses `registerType: "prompt"`, but no application-level `virtual:pwa-register` update callback or user prompt was found. This is a code inspection inference, not a browser claim. The update-deferral acceptance test must prove that an update found during a Session stays waiting and does not reload or replace assets until the Session exits.

Cache Storage is not a backup for user data. It should contain versioned app/catalog resources and replaceable fetched media; authored records and uploaded blobs belong in IndexedDB and the ZIP/cloud data path. Both endpoints still count toward the origin's quota and can be cleared together. [WHATWG Storage Standard](https://storage.spec.whatwg.org/)

## Installability and application identity

Chrome and Edge permit installation from their desktop menus. Chrome removed the service-worker `fetch()` requirement for menu installation in Chrome 112 desktop, but still strongly recommends a manifest with `name`/`short_name`, icons, `start_url`, and `display`; a service worker remains necessary for a controlled offline experience. [Chrome installability criteria](https://developer.chrome.com/blog/update-install-criteria) [Microsoft Edge PWA development](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/)

Safari does not use Chromium's installability gate. Safari on macOS Sonoma can add any page to the Dock, and iOS/iPadOS 26 can add any site as a Home Screen web app. A standards manifest still controls app identity and presentation where supported. [Apple: web apps on Mac](https://support.apple.com/en-mide/104996) [WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

The current manifest has a name, start URL, standalone display, colors, and only one SVG icon. For predictable cross-browser presentation, add an explicit stable `id`, `scope`, raster 192Ã—192 and 512Ã—512 icons (with a separately tested maskable asset), and an Apple touch icon. Chrome's documented manifest audit expects 192Ã—192 and 512Ã—512 icons, while WebKit documents that `apple-touch-icon` takes precedence over manifest icons on Apple platforms. [Chrome manifest audit](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest) [WebKit Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)

Installability must be tested in each branded browser rather than inferred from a successful build. The normal website must remain fully functional because enterprise browser policy, user preference, or platform version can remove or hide installation UI. Edge explicitly supports policy control over user web-app installation. [Microsoft Edge web-app install policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/webappinstallbyuserenabled)

## Timers and backgrounding

The HTML standard explicitly does not guarantee exact timer scheduling. Chrome aligns and budget-throttles background timers, and stops `requestAnimationFrame()` for background pages. Page Visibility reports a document hidden when the OS lock screen covers the browser. A callback counter is therefore unsuitable as workout timekeeping. [HTML timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers) [Chrome background tabs](https://developer.chrome.com/blog/background_tabs) [Page Visibility Level 2](https://www.w3.org/TR/page-visibility-2/)

The approved absolute-deadline state machine is correct for foreground timing: each render/tick computes `deadline - Date.now()` rather than assuming an interval elapsed. When visibility becomes hidden, the Session should atomically persist an interrupted snapshot and stop advancement. When visible again, it should show Resume/Abandon; it must not silently count locked-screen time as completed exercise time. This is an application decision derived from the documented lack of timer guarantees.

Reload, crash, and OS termination cannot depend on `beforeunload`. The durable Session snapshot needs to be saved after every state transition and must be normalized to `interrupted` on startup before rendering the prompt. The current application already normalizes a saved non-completed Session to interrupted on load; a physical-device test still needs to cover force-quit and low-power interruption.

If uninterrupted locked-screen workouts, reliable background tones, or elapsed-time continuation while the app is suspended becomes mandatory in the future, that requirement should trigger a separate native-app feasibility decision. It should remain a future suggestion under the current foreground-only contract.

## Web Audio activation

The Web Audio specification allows browsers to keep a new `AudioContext` suspended until the document has sticky user activation. Chrome documents that an `AudioContext` created before a user gesture starts suspended and must be resumed after user interaction. Audible output must therefore be initialized from a deliberate Start/Resume tap and its state/rejection handled. [Web Audio 1.1](https://www.w3.org/TR/webaudio-1.1/) [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/)

Implementation comparison: the current Session Runner creates a fresh `AudioContext` only when an effect notices the three-second threshold or completion. That asynchronous moment is not the explicit Start/Resume handler, and a suspended context does not necessarily throw. Reuse one context unlocked in the Start/Resume interaction, call `resume()`, observe `state`, and retain visual countdown/transition cues when audio is unavailable.

Audio acceptance must cover a first-ever launch with no prior site engagement, muted hardware, a denied/suspended context, pause/resume, Home Screen mode, Safari tab mode, and Bluetooth/no-Bluetooth output. Automated tests can validate state handling, but audible output requires observation on the real devices because codecs and platform media behavior vary. [Playwright browsers](https://playwright.dev/docs/browsers)

## Screen Wake Lock

The Screen Wake Lock API is available only in secure contexts, only visible documents can acquire it, and a user agent may deny or release it for platform settings, low battery, power-saving mode, or other implementation reasons. The lock is released when the document becomes hidden and must be requested again after visibility returns. It is advisory rather than a guarantee against manual locking. [Screen Wake Lock specification](https://w3c.github.io/screen-wake-lock/) [Chrome Wake Lock guidance](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock)

WebKit added the API in Safari 16.4, but only added support inside iOS/iPadOS Home Screen web apps in 18.4. MechaStudio must feature-detect it and must not describe wake lock as available on every supported iPhone version or in every launch mode. [WebKit Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/) [WebKit Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)

Implementation comparison: the current Runner requests a lock when status becomes running and ignores request failure, which is a sound fallback. It does not retain a typed sentinel with a `release` listener or expose whether the lock was lost. Add release observation and reacquisition on explicit Resume; do not automatically resume the workout merely because visibility returned.

## iPhone safe areas and responsive layout

With `viewport-fit=cover`, content can extend edge-to-edge and must use the four `env(safe-area-inset-*)` values to keep interactive controls clear of rounded corners, sensor areas, and the Home indicator. WebKit recommends combining safe-area values with ordinary minimum padding rather than using them as the only margin. [WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)

The current page declares `viewport-fit=cover` and uses safe-area environment values in the shell, navigation, dialogs, and Runner. Physical tests must still cover portrait and landscape, browser chrome shown/hidden, Home Screen mode, text zoom, and both compact and larger iPhone viewports. Safe-area correctness cannot be established by source inspection alone.

Touch targets and safe areas are separate concerns. Keep the approved minimum 44Ã—44 CSS-pixel interactive targets and verify that fixed bottom controls remain reachable above the Home indicator with the on-screen keyboard closed and open.

## Testing limits and required matrix

Playwright's WebKit build is patched and derived from WebKit main, often ahead of Safari; Playwright explicitly does not run branded Safari. Its â€œMobile Safariâ€ device descriptor emulates user agent, viewport, touch, and related parametersâ€”it is not iOS or an iPhone. Platform-dependent features and media codecs differ by operating system. [Playwright browsers](https://playwright.dev/docs/browsers) [Playwright emulation](https://playwright.dev/docs/emulation)

Chrome likewise describes desktop Device Mode as a first-order approximation and directs developers to run on a physical mobile device when behavior matters. Apple provides Web Inspector for Safari pages, service workers, and Home Screen web apps on connected iPhones and simulators. [Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode) [Apple device inspection](https://developer.apple.com/documentation/safari-developer-tools/inspect-apps-and-devices) [Apple iOS inspection](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios)

The minimum release matrix is:

| Environment                       | Automated or manual                             | Required checks                                                                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows current stable Chrome     | Both                                            | Website and installed PWA, authoring, ZIP, clean offline relaunch, update waiting, audio activation, hidden-tab interruption, keyboard navigation                                                                                                                  |
| Windows current stable Edge       | Both                                            | Same core flows, branded install UI, Start/taskbar launch, separate browser storage, persistence status                                                                                                                                                            |
| Windows Playwright Chromium       | Automated                                       | Mobile/desktop layouts, builders, fake-clock Runner transitions, offline routes, update-state integration                                                                                                                                                          |
| Windows Playwright WebKit         | Automated signal only                           | DOM/layout regressions and supported Runner flows; never counted as Safari acceptance                                                                                                                                                                              |
| MacBook Air current stable Safari | Manual, with Safari WebDriver where practical   | Website, Add to Dock, separate IndexedDB onboarding, ZIP transfer, offline relaunch, update, audio, Wake Lock, keyboard and VoiceOver smoke test                                                                                                                   |
| MacBook Air current stable Chrome | Manual smoke + branded automation if configured | Website/install parity, separate Chrome storage, audio and offline relaunch                                                                                                                                                                                        |
| Actual iPhone current iOS         | Manual                                          | Safari and Home Screen as separate modes; install-before-authoring/ZIP path; portrait/landscape safe areas; Home indicator; audio first-use; Wake Lock and release; lock/app-switch/force-quit; offline cold launch; update deferral; storage clearing and restore |

Do not call the cross-platform ticket complete from Windows CI alone. Apple acceptance needs a Mac and physical iPhone because the distinctive risksâ€”Home Screen storage isolation, OS suspension, safe areas, audio routing, Wake Lock integration, and branded Safari service-worker behaviorâ€”are outside Playwright-on-Windows fidelity.

## Acceptance criteria derived from this research

- The same hosted HTTPS URL completes all core authoring and foreground Session Runner flows in current Chrome, Edge, and Safari without requiring installation.
- A clean first online visit can subsequently relaunch offline after closing the browser/app; offline behavior is tested independently in Safari tab, Safari Dock app, iPhone Safari, and iPhone Home Screen modes.
- Installing on iPhone or Mac displays a clear new-workspace message. Existing local data can be transferred by validated ZIP, and documentation never implies IndexedDB is copied into the Apple web app.
- The app reports `persisted()`/`persist()` results honestly, displays approximate usage/quota, catches quota failures, and keeps backup guidance visible even after persistence is granted.
- An active timed Step derives its display from an absolute deadline while visible. Hidden/locked transitions interrupt and persist; returning requires Resume; delayed callbacks never auto-complete hidden time.
- Start/Resume unlocks and resumes a reusable audio context. Failure leaves all visual cues intact and does not block the Session.
- Wake Lock is feature-detected, requested only while visible/running, observed for release, and reacquired only in conjunction with explicit Resume. Unsupported/denied Wake Lock is non-fatal.
- A deployed update discovered during an active Session remains waiting. It activates and reloads only after the Session ends and the user accepts the update.
- The manifest has stable identity/scope and tested raster/maskable/Apple icon assets in addition to any SVG asset. Install UI and launch identity are manually verified in each branded target browser.
- Fixed and full-screen UI respects `viewport-fit=cover`, safe-area insets, at least 44Ã—44 touch targets, portrait/landscape rotation, reduced motion, keyboard navigation, and visible cues without sound.
- Windows CI includes Chromium and WebKit regression suites, but release evidence also records manual current Safari, Safari Dock, iPhone Safari, and iPhone Home Screen results.

## Assessment against the approved plan

**Validated:** local-first IndexedDB plus service-worker cache; browser website as the primary cross-platform delivery; installation optional on desktop; absolute-deadline timers; pause-on-hidden; Wake Lock as optional enhancement; manual ZIP until Profile sync; physical Mac/iPhone acceptance; background timing and audio as best effort.

**Needs refinement:** â€œeach browser has separate dataâ€ is directionally correct but incomplete. Apple Home Screen/Dock installations are also separate local containers from the browser that created them, and only cookiesâ€”not IndexedDBâ€”are copied at installation. This must be explicit in onboarding, backup documentation, and tests. [WebKit Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)

**Implementation risks to resolve before claiming the plan complete:** no demonstrated Session-aware service-worker update prompt; audio is not explicitly unlocked in Start/Resume; Wake Lock release is not observed; the manifest has only an SVG icon and no explicit `id`/`scope`; physical Mac/iPhone results are still required. These are implementation-audit observations informed by the platform findings, not reasons to replace the architecture.

## Future suggestions retained, not required by this ticket

- Reconsider a native iPhone companion only if locked-screen continuity, reliable background audio, HealthKit, Watch integration, or App Store distribution becomes a mandatory product promise.
- After Profile sync ships, use the Profile as the recommended migration path between browser and Apple web-app containers while retaining ZIP as user-controlled recovery.
- Add remote Safari device testing if it can run branded Safari on real Apple hardware, but retain a periodic physical iPhone acceptance pass for Wake Lock, audio, safe areas, interruption, and installation behavior.
