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
  details.js                Generated: verified per-stop details (npm run details)
  app.js                    Itinerary data and application behavior
  features.js               Trip tools: route, calendar, photos, flights, weather, map, checks
  ux.js                     Touch physics and ambience: sheet drag, backdrop, header title, spine, landing guard
  runtime.js                PWA registration, update hand-off, chrome state
  vendor/alpine.js          Local reactive runtime
  vendor/lucide.js          Pruned local icon runtime
  vendor/leaflet/           Leaflet 1.9.4, loaded only when the day map opens
  taipei-photo.webp         Destination photos (Wikimedia Commons, credited in Tools)
  kaohsiung-photo.webp
  hk-photo.webp
  thumbs/                   Square thumbnails of every photo for the Days list (python3 scripts/make-thumbs.py)
screenshots/                Manifest install screenshots
scripts/                    Maintenance and verification tools
```

There are no runtime CDN dependencies and no API keys. Optional network requests: the exchange-rate refresh, keyless forecasts (Open-Meteo, Hong Kong Observatory), MTR next-train times, and OpenStreetMap tiles when the day map is open. Each is cached in `localStorage` as `twhk_live_<name>_v1`, refreshed every 20 minutes (MTR times every minute, only while shown) with an 8-second timeout, and fails quietly; the itinerary never depends on them.

## Interaction model

- **Dark only.** There is no light theme or appearance setting.
- During the trip, **Today opens on a Now card**: the current or next stop, a progress bar with the minutes left, the leave-by time, what comes next, and the local and home (New York) clocks. The live capsule above the dock uses the same data.
- **Opening the app during the trip goes to today.** The Home Screen launch (`./?tab=today`) always opens on the live day with the Now card at the top; only a real deep link (`?day=…`, another tab, or the reload after an update) keeps a different place. Coming back after 10 minutes or more, or after midnight, does the same; a quick switch to Maps or a chat keeps your place, and an open sheet or search is never pulled away.
- **Tapping the Now card** (or the capsule, the locate button, or "Back to live day") lands the current stop just under the day rail and outlines it briefly.
- **Past stops** on the live day (and every stop on finished days) step back visually.
- Colour roles: neutrals; jade for actions and selection; rose for live (now, current, leave-by); amber for caution. City colours only identify places.
- Days whose city photo would mislead (Jiufen, Ten Drum, Maolin, Lion Rock, the flight day and others) have their own photo; all are credited in Tools.

- **Today** is the execution surface: selected-day hero, leave-by timing, timeline, protein cue, practical note, and always-visible backups.
- **Days** is a searchable overview of all 16 days.
- **Plan** combines bookings and administrative preparation without accordions.
- **Tools** contains hotel bases, emergency numbers, settings, operating rules, budget/FX, data backup/restore, and Reset progress (asks first; clears day, booking and prep marks, booking codes and your own items).

### Field tools (shared with the Japan app)

- **Show card.** The expand button on a hotel, a timeline stop or a booking opens a full-screen, paper-white card: the Chinese name and address (or the booking code) at counter size, with "請帶我到這裡" / "我有預約" above it. The screen is kept awake while it is open.
- **Booking codes.** Any booking can hold its confirmation code; saving one marks the booking booked. Codes copy with one tap and appear on the Show card.
- **Plan holds its order while open.** Marking a booking booked restyles it in place instead of moving it from under your finger; the list re-sorts the next time Plan is opened.
- **Your own bookings and tasks.** Plan → Add booking / Add task. Your bookings carry a day, time, code and notes, show on their day, count in Plan and the app badge, can be removed, and travel in backups.
- **Today's bookings** sit between the day hero and the timeline (the arrival-day eligibility check is a pre-trip task and stays in Plan).
- **Directions** open in Apple Maps or Google Maps (Tools → Settings); every navigate button follows the choice.
- **Tomorrow at night.** When the day's plan is done, the Now card shows tomorrow's first stop, any hotel move and the sunrise.
- **Sunrise and sunset** for each day in the weather card, at the day's place (Tamsui and Jiufen for the Day 4 and Day 5 sunsets). NOAA formula, within a minute of the Hong Kong Observatory's published times.
- **Search** highlights the matched words in results and briefly outlines the card a result opens.
- **Emergency & help** in Tools: Taiwan 110 / 119 and the 24-hour travel information hotline, Hong Kong 999 and the police hotline, as tap-to-call rows with their official sources.
- **Offline copy** status in Settings, and a persistent-storage request for the Home Screen app so iOS is less likely to evict the offline copy.
- **Preview a moment** (Tools → Settings): pick a Taipei date and time to see the Now card, countdowns and bookings as they will look then. The header says Preview; it is never saved, ends when you leave the app, and never sends alerts or changes the badge.
- Global English/Traditional Chinese search is available from the header and as the fifth item in the unified phone tab bar.
- The phone dock is one balanced five-cell material bar—Today, Days, Plan, Tools, Search—rather than a narrow tab capsule plus a detached search bubble.
- **Verified stop details.** Every timeline stop has researched hours, cost, how to get there, what to see or order, tips, a heads-up line and the sources it was checked against (with the check date). Under each stop it is one quiet row ("Hours · Cost · Getting there ›") that opens a bottom sheet, so nothing on the page ever expands in place and the timeline never changes height under your thumb. When a search matches words that only the details contain, the result lands on the stop and its sheet opens on top. The research lives in `data/details/day-XX.json`; `npm run details` rebuilds `assets/details.js`, then `npm run finalize`. A stop is matched by index and exact title, so renaming a stop drops its details until its JSON title is updated (a console warning lists unmatched stops).
- **Navigation material.** The dock, the wide-screen tabs and the Plan switch share one glass capsule with a concentric capsule lens and a specular rim (no outlines). The lens travels on a spring and briefly stretches along its path; the selected icon fills and bounces once. Tapping the current tab scrolls to the top. Scrolling down folds the dock's labels away (iOS 26 tab-bar minimise); scrolling up, reaching the end or switching tabs restores them. The day rail fades chips at whichever edge has more to scroll.
- Day chips commit on pointer-up for stationary taps, retain click/keyboard fallback, and keep drags as horizontal scrolling. The click that follows a committed tap is ignored (after the rail moves it would land on a neighbouring day). Mobile day changes avoid full-document View Transition overlays.
- **The selected day is always centred in the rail**: after a tap (including on the day already selected), when Today appears after a day was picked elsewhere, and after a rotation. The move is instant, never a smooth animation that would make iOS spend the next tap on stopping it. A chip tap near the top keeps the page still; deeper in a day it brings the new day's hero under the rail.
- The sticky day rail, keyboard behavior, safe-area spacing, and bottom scroll-edge fade are tuned for one-handed use.

### Look and motion (`assets/ux.js`, the end of `assets/app.css`)

- **A backdrop that follows the day.** One fixed layer sits behind the whole app: the city's hue lights the main glow, the day's own photo lights a second, smaller one, and each day's colours were measured from its photo (OKLab). Changing day crossfades two layers on opacity only, so no gradient is ever interpolated. On the live day the second glow takes the colour of the hour from the real sunrise and sunset (dawn, day, golden hour, dusk, night) and everything dims a little after dark. A small noise tile dithers the dark gradient so it never bands on an OLED. The top strip stays the flat page colour for the iOS status bar.
- **Sheets that behave like iOS sheets.** Every bottom sheet (stop details, booking code, add booking or task, reset, search) has a grabber, rises from below, follows your finger, and is thrown away on a flick: release velocity decides, with a critically damped spring on the way out and a little bounce on the way back if you threw it. Drag only takes over from the grabber and header, or from the content when it is scrolled to the top. The Show card stays put, and ramps its white in.
- **Large title to inline title.** When the day's heading has scrolled under the pinned bar, the brand line in the header becomes "Nov 30 · Dadaocheng · 大稻埕" and comes back at the top.
- **A day change that carries the eye.** The old photo dissolves into the new one, the heading settles in the direction you moved, and the cards rise in sequence (CSS `sibling-index()`, capped at six, skipped when you tap quickly or have Reduce Motion on).
- **A timeline that fills as the day passes.** The line down the timeline is full on finished days, empty on days to come, and on the live day its head sits at the live stop and moves down it as the stop runs.
- **Days tab.** Each day has its photo, the days sit under their city with its date range, and the live day carries a Today marker.
- **Tickets.** Flights on Plan have a boarding-pass silhouette: notches cut through the card at the perforation, with the actions on the stub.
- **Sun arc and Leave.** The weather card shows sunrise to sunset as an arc, with the sun where it is in the sky on the live day; the Leave card sets the time large.
- **Landing guard.** After the Now card, the capsule or Locate lands on a stop, the stop is held under the rail even if live content (a train card, a banner) arrives above it a moment later, until you touch the page.

### Trip tools (`assets/features.js`)

- **Today's route.** The day is split into walkable segments wherever a flight, THSR, TRA or airport train, or a jump of more than 15 km comes between stops; each segment opens in Google Maps as a walking route (parts of at most 3 waypoints, Google's limit for links), plus a car route (Apple Maps when it is the chosen provider, up to 14 stops a link). Chips are labelled with the day map's stop numbers. On the live day only the segments still ahead are shown, the one you are in starting from where you are; in a preview it starts at the current stop.
- **Add to Calendar.** The calendar-plus button on a day, or Tools → Add trip to Calendar, makes an `.ics` file: one event per timed stop in the day's own time zone (flights use their real departure and arrival zones), with a reminder 10 minutes before (30 for transport, plus 3 hours before a flight). Importing again adds duplicates.
- **Ticket photos.** The image button on any booking or flight saves photos of tickets and boarding passes on the phone (IndexedDB, shrunk to 1600 px). They show on the booking's Show card (tap for the next one), count in Settings, go into backups and come back on restore; photos whose booking no longer exists appear under Plan → Other tickets.
- **Quick convert** in the Budget card: type an amount in NT$, HK$ or US$ (or tap 100/350/500/1000) and see the other two, using the same rates as the budget.
- **Flights** at the top of Plan: the four Cathay flights with local times, a check-in countdown (opens 48 h before, or 24 h if you are not a Cathay member; 24 h for the US-bound CX840; closes 60 min before), the check-in and live-status links, and Kowloon in-town check-in rules on CX840. Within 36 hours of a flight a line under the Now card says where check-in stands.
- **Weather that changes the plan.** When the hourly forecast (Open-Meteo, keyless) gives 60 % or more rain during an evening outdoor stop, a banner names the stop and offers the rain plan. On Hong Kong days the Observatory's warnings are shown by name (never as raw codes), with what they cancel (Symphony of Lights at signal 3 or a red/black rainstorm). Every live line credits its source with "as of HH:MM" ("as of Tue 14:20" when the data is from another day) and links the official service. Old data is treated as missing, never as current: warnings after 2 hours, forecasts after 12 hours, MTR times after 3 minutes.
- **Hike check** for Qixing, Teapot, Lion Rock and Lantau, from 6 PM the evening before until the hike ends: rain chance, gusts, cloud and visibility at the summit, sunset, and a Go / Caution / No-go verdict whose thresholds are printed on the card (no-go: gusts ≥ 50 km/h, rain ≥ 70 % or a typhoon/red/black warning). No-go shows the day's fallback.
- **Last connections.** Each late day lists its last train, ferry or bus from the official timetables. On the live day, once the last stop before it has started, a countdown sits under the Now card (amber under 30 minutes, red under 15). On Hong Kong evenings the next MTR departures at Tsim Sha Tsui (and the Airport Express at Kowloon on the last morning) appear live.
- **Day map.** The map button above the timeline shows the day's stops as numbered pins on OpenStreetMap (Leaflet, bundled locally, loaded only when opened) with the hotel. Offline it draws an outline sketch instead. Tapping a pin lands on that stop.
- **Opening-hours check.** A badge on a stop says "Opens 10 AM", "Last entry 8:15 PM", "Closes …" or "Closed today" when the planned time misses the venue's hours.
- **From the previous stop.** Each stop has a transit-directions link from the stop before it (on the live day, the next stop ahead says "From here" and starts from your location), and a note where the planned gap is shorter than the usual transfer.
- **Bring today.** A short checklist under the day's facts (passports on flight days, grippy shoes and water on hike days, cash for night markets, the same Octopus for in-town check-in). Ticks are kept and go into backups.
- **Nearby.** While online, one-tap searches for a convenience store, toilet, ATM and the nearest metro station around you.

## PWA behavior

- Navigation uses a **network-first** strategy with a 2.6-second cached-shell fallback.
- Local static assets use **stale-while-revalidate**.
- Query-string routes such as `?tab=plan` share one canonical cached shell, avoiding fragmented/stale navigation entries.
- Navigation preload is enabled when supported.
- `index.html` loads its stylesheet and scripts by content-hashed URLs (`app.js?v=…`), stamped by `finalize.py`. Because assets are stale-while-revalidate, fixed URLs used to pair a freshly deployed page with the previous build's CSS and JS on the first launch after a deploy.
- A new deployment installs into a content-hashed cache, removes the legacy `twhk-2026-*` cache namespace, and takes over as soon as it is cached. The open page is never reloaded; the next launch is the new build. The **Update** action only appears if a worker is somehow left waiting.
- Icons, destination artwork, startup screens, and manifest screenshots are precached for offline use.

## Make changes

Most itinerary content is in `assets/app.js`; layout lives in `index.html`; the visual system is in `assets/app.css`.

After editing deployable files:

```bash
python3 scripts/interaction-test.py
python3 scripts/finalize.py
python3 scripts/verify.py
```

`interaction-test.py` inlines the local production assets into Chromium and exercises real Alpine touch/pointer behavior without needing a dev server. It checks rapid day switching, tap-vs-drag discrimination, keyboard fallback, dock hit testing, search focus return, phone/landscape/desktop layouts, and screenshots. `finalize.py` refreshes manifest screenshot metadata and regenerates the content-hashed service worker. `verify.py` checks local references, duplicate IDs, manifest integrity, PNG dimensions, JavaScript syntax when Node is available, offline strategy markers, and the no-accordion requirement.

### Rebuild the icon subset

The shipped icon file is already complete. When a new Lucide icon name is introduced:

```bash
npm install
npm run icons
python3 scripts/finalize.py
python3 scripts/verify.py
```

The helper scans both markup and dynamic itinerary data, then writes a pruned browser bundle to `assets/vendor/lucide.js`.

### When a destination photo changes

```bash
python3 scripts/make-thumbs.py     # square thumbnails for the Days list
python3 scripts/photo-tints.py     # dominant hue, chroma and lightness per photo
```

Copy the new numbers into `PHOTO_TINT` at the top of the atmosphere section in `assets/ux.js` (the backdrop's second glow is lit by them), then `python3 scripts/finalize.py` and `python3 scripts/verify.py`. A new photo file must also be added to the precache list in `scripts/finalize.py`.

### Regenerate icons and iPhone startup screens

Icons are full-bleed and opaque (iOS paints transparent corners black and rounds the icon itself); only the startup-screen badge is rounded. The destination banners are real photos and are not regenerated.

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

## iPhone specifics

- Search raises the keyboard from the Search tap itself (iOS ignores a later `focus()`), and the sheet follows `visualViewport` so the field and results stay above the keyboard.
- In the Home Screen app, the backup and calendar exports open the share sheet. A download there opens a preview the app cannot leave (WebKit bug 290847); Safari tabs still download.
- No `content-visibility` (Safari can leave skipped cards blank) and no `interactive-widget` viewport token.

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

- 335/335 in-app semantic checks (at a pre-trip clock and at a live-day clock)
- 63/63 static artifact checks, including a check that nothing on the page expands in place
- sheet physics (24 checks), stop sheet (18), header title, day change and spine (25), sun phases (8), sun arc (5), landing guard (3)
- no horizontal overflow, no clipped text and no target below 44×44 across 64 probes at 320, 375, 393 and 430 px
- text contrast against the pixels actually behind it: no run below AA that was not already there
- touch interaction runs at 320×700, 375×812, 390×844, and 430×932, plus 844×390 coarse-pointer landscape and 1280×800 desktop
- full rapid Day 03 → Day 16 tap sequence in dark and light appearance with zero dropped selections
- pointer-up + synthesized-click de-duplication, drag rejection, and keyboard activation
- all five bottom actions hit-test to their own button centers; no detached search control remains
- no horizontal overflow and no visible interactive target below 44×44 at tested phone widths
- worst measured automated day-selection latency: under 350 ms including Playwright input overhead
- JavaScript syntax validation, manifest validation, image-dimension validation, and content-hashed service-worker regeneration

Chromium with touch emulation was used for automated runtime testing. The previous build's dropped-tap behavior was reproduced in that harness before the fix and no longer reproduces. Safari-specific enhancements remain feature-gated; a final real-device pass on the actual iPhones is still the last acceptance step.
