# Taiwan + Hong Kong 2026 PWA

A phone-first, offline-capable field guide for a 16-day Taiwan and Hong Kong trip. It is a static web app designed for GitHub Pages and iPhone Home Screen use. The complete itinerary, booking tracker, preparation checklist, live day execution tools, search, hotels, budget, and backup plans are local to the bundle.

## Deploy to GitHub Pages

1. Copy **the contents of this directory** into the root of the repository. Do not add an extra wrapper folder unless that folder is the configured Pages publishing root.
2. Commit and push.
3. In **Repository Settings → Pages**, publish from the repository root or the appropriate branch/folder.
4. Keep HTTPS enabled. Service workers and installation require a secure context; localhost is the development exception.
5. Open the deployed page once online, then use Safari’s **Share → Add to Home Screen**.

Every runtime URL is relative, so the same bundle works at either a user-site root or a project path such as `https://account.github.io/taiwan-pwa/`.

## Production layout

```text
index.html                  Semantic shell and rendered UI
manifest.webmanifest        Install metadata, icons, shortcuts, screenshots
sw.js                       Offline shell and update lifecycle
assets/
  app.css                   Compiled visual system
  app.js                    Itinerary data and application behavior
  runtime.js                PWA registration, update hand-off, chrome state
  vendor/alpine.js          Local reactive runtime
  vendor/lucide.js          Pruned local icon runtime
  taipei.webp               Local destination artwork
  kaohsiung.webp
  hk.webp
screenshots/                Manifest install screenshots
scripts/                    Maintenance and verification tools
```

There are no runtime CDN dependencies. The only normal network request made by the application is the optional exchange-rate refresh; cached/fallback rates keep the budget usable offline.

## Interaction model

- **Today** is the execution surface: selected-day hero, leave-by timing, timeline, protein cue, practical note, and always-visible backups.
- **Days** is a searchable overview of all 16 days.
- **Plan** combines bookings and administrative preparation without accordions.
- **Tools** contains hotel bases, operating rules, budget/FX, appearance, and data backup/restore.
- Global English/Traditional Chinese search is available from the header and the phone dock.
- The phone dock, sticky day rail, keyboard behavior, and safe-area spacing are tuned for one-handed use.

## PWA behavior

- Navigation uses a **network-first** strategy with a 2.6-second cached-shell fallback.
- Local static assets use **stale-while-revalidate**.
- Query-string routes such as `?tab=plan` share one canonical cached shell, avoiding fragmented/stale navigation entries.
- Navigation preload is enabled when supported.
- A new deployment installs into a content-hashed cache and removes the legacy `twhk-2026-*` cache namespace. The running app exposes an explicit **Update** action when the next worker is waiting, so a user is never reloaded in the middle of a trip task.
- Icons, destination artwork, startup screens, and manifest screenshots are precached for offline use.

## Make changes

Most itinerary content is in `assets/app.js`; layout lives in `index.html`; the visual system is in `assets/app.css`.

After editing deployable files:

```bash
python3 scripts/finalize.py
python3 scripts/verify.py
```

`finalize.py` refreshes manifest screenshot metadata and regenerates the content-hashed service worker. `verify.py` checks local references, duplicate IDs, manifest integrity, PNG dimensions, JavaScript syntax when Node is available, offline strategy markers, and the no-accordion requirement.

### Rebuild the icon subset

The shipped icon file is already complete. When a new Lucide icon name is introduced:

```bash
npm install
npm run icons
python3 scripts/finalize.py
python3 scripts/verify.py
```

The helper scans both markup and dynamic itinerary data, then writes a pruned browser bundle to `assets/vendor/lucide.js`.

### Regenerate artwork, icons, and iPhone startup screens

```bash
python3 -m pip install Pillow
python3 scripts/generate-assets.py
python3 scripts/finalize.py
python3 scripts/verify.py
```

### Optional browser smoke test

```bash
python3 -m pip install playwright
playwright install chromium
python3 -m http.server 8000
# In another terminal:
BASE_URL=http://127.0.0.1:8000/ python3 scripts/smoke-test.py
```

The test runs dark and light appearance at 320, 375, 390, and 430 CSS pixels. It checks the in-app semantic QA result, horizontal overflow, visible 44×44 minimum touch targets, runtime errors, and console errors. Screenshots and JSON results are written under `output/playwright/`.

## Accessibility and resilience

- 44×44 minimum phone targets and 16px editable controls
- Dynamic viewport and safe-area support
- keyboard-accessible tabs, search focus trapping, skip link, and visible focus treatment
- Reduced Motion, Reduced Transparency, Increased Contrast, and forced-colors fallbacks
- semantic labels for live timing and route state
- no disclosure accordions; the information hierarchy remains visible
- state export/import for moving progress between devices
- offline launch and query-route reload support

Modern CSS features—OKLCH color mixing, registered custom properties, `@starting-style`, View Transitions, scroll-state/container queries, `corner-shape`, `text-box-trim`, and scroll-driven effects—are progressive enhancements. Core navigation and itinerary rendering do not depend on them.

## Privacy note

GitHub Pages repositories and deployed pages may be public. This itinerary contains hotel names/addresses and detailed travel dates. `robots.txt` and the page’s `noindex` metadata discourage indexing but are **not access control**. Use a private deployment product or authentication layer if public availability is unacceptable.

## Release checks performed on this bundle

- 233/233 in-app semantic checks
- 53/53 static artifact checks
- dark and light rendering at 320, 375, 390, and 430 CSS-pixel widths
- no horizontal overflow at tested phone widths
- no visible interactive target below 44×44 at tested phone widths
- JavaScript syntax validation
- manifest and image-dimension validation
- installed service-worker control and offline reload of a query route

Chromium was used for automated runtime testing. Safari-specific enhancements are guarded by feature queries and have functional fallbacks; final device acceptance testing should still be done on the iPhones that will be used during the trip.
