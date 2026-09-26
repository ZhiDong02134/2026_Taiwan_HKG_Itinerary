# Taiwan + Hong Kong PWA

A static, phone-first travel guide. The itinerary, Alpine runtime, selected Lucide icons, and compiled Tailwind styles are embedded in [index.html](index.html). GitHub Pages does not need a build step.

## Preview and Deployment

The local Pages-style preview is at <http://127.0.0.1:8789/taiwan-pwa/> while its preview server is running. This localhost address is accessible on this computer, not on a separate phone.

Deploy the updated [index.html](index.html), [sw.js](sw.js), and the complete [assets](assets/) directory alongside the existing manifest, icons, and startup images. Publish over HTTPS. The manifest identity and all application paths remain compatible with `/taiwan-pwa/` project hosting. No Git commit, push, or deployment was performed in this downloaded folder.

The service worker caches the application and three destination images. A new version is downloaded after a throttled version check; the visible Update action lets the user choose when to reload. Browser storage can still be evicted, so the existing Backup data action remains important.

## UI/UX Pass: September 25, 2026

### Direction

A practical travel field guide with clear destination identity, readable open sections, and calm controls. Apple-inspired hierarchy and interaction principles, not a reproduction of native Liquid Glass. No accordions, new framework, animation dependency, remote font requirement, or runtime CDN dependency.

- System appearance by default, with accessible Auto / Light / Dark controls in Tools and saved preferences.
- Neutral light and dark surfaces, jade for Taipei, amber for Kaohsiung, coral for Hong Kong, and blue for flight context. Color supplements labels and icons.
- Destination photography is local, optimized, dimension-reserved, and cached offline. It is illustrative, not a current/live view.
- Open day and planning summaries, flat fact rows, fewer nested frames, quieter eight-pixel itinerary cards, and more readable prose.
- Native system typography is retained for the existing Apple-oriented interface and Traditional Chinese support. Reading prose uses scalable units, with balanced/pretty wrapping and progressive CJK text spacing.
- Navigation remains visible. Brief 220ms native Web Animations respond to intentional view/day changes and are cancellable. Scrolling itself does not animate cards.
- Reduced motion, higher contrast, safe areas, and reduced transparency remain supported. Effects are enhancements, not prerequisites for using the app.

### Defects Fixed

| Issue | Resolution |
| --- | --- |
| Tab restoration inherited smooth scrolling and could jump after rapid taps | Immediate restoration, guarded against stale callbacks |
| A later scroll-driven reveal overrode the intended stationary timeline | Removed the competing scroll animation and obsolete day choreography |
| Dark-only surfaces were unsuitable for some outdoor reading conditions | Added independently checked light and dark themes |
| Secondary labels could become low contrast in light mode | Corrected rendered foreground/background pairs |
| Automatic update reloads could interrupt reading or typing | User-controlled Update action after download |
| Search left background content accessible while the modal was open | Inert background, guarded focus scheduling, and non-disruptive Escape handling |
| Opening a global search result outside Today selected a hidden day | Navigate to Today before positioning the matching activity |
| The complete icon catalog added unnecessary download and parsing work | Bundle only 71 referenced/recognized icons with Lucide's documented API |

### Performance

Measured locally, before and after this pass; values below are approximate and exclude unchanged installation icons/startup images.

| Resource | Before | After |
| --- | ---: | ---: |
| HTML, uncompressed | 1,004,593 bytes | about 606 KB |
| HTML, locally gzip-compressed | 253,148 bytes | about 159 KB |
| Embedded Lucide runtime | about 432 KB | 29,367 bytes |
| Destination WebP images | none | 245,210 bytes combined |

The HTML is about 40% smaller uncompressed and 37% smaller with gzip. Photos add a one-time cacheable download, so total compressed first-load bytes are higher than the old text-only guide. Do not interpret the HTML reduction as a measured 40% improvement in loading time. Real-device Core Web Vitals and energy use were not measured.

## Research and Technology Decisions

Primary sources were checked online on September 25, 2026. The requested UI/UX Pro Max skill was also consulted. Its broad design-system searches returned marketing-oriented Aurora/storytelling recommendations that were not a good fit for an operational travel guide; those recommendations were not adopted. Its focused accessibility and mobile guidance informed the checks.

| Source | Applied Finding |
| --- | --- |
| [Apple: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | Translucency belongs primarily in navigation; long-form content needs stable, readable surfaces |
| [Apple: Color](https://developer.apple.com/design/human-interface-guidelines/color) | Semantic color, light/dark parity, contrast, and restrained emphasis |
| [Apple: Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Brief, purposeful, optional and interruptible feedback; avoid unnecessary motion during frequent actions |
| [Apple: Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | Preserve hierarchy, support larger text, avoid excessive truncation, and retain legible CJK/system fonts |
| [Apple: Tab Bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Stable labeled destinations, persistent navigation, preserved state |
| [WebKit: Safari 27.0, September 17, 2026](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) | Reviewed current scroll anchoring, CJK spacing, image sizing, CSS and PWA capabilities and rendering fixes |
| [WebKit: Safari 26](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/) | Established compatibility context for pretty wrapping, scroll-driven animations and Home Screen web apps |
| [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) | Considered snapshot transitions; local animations better preserve responsiveness and avoid duplicating a long itinerary |
| [MDN: startViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) | Reviewed update timing and fallbacks; no dependency on newer transition variants was added |
| [MDN: @starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style) | Retained progressive entry styling where appropriate, without relying on it for state correctness |
| [Alpine: $nextTick](https://alpinejs.dev/magics/nextTick) | Wait for DOM updates before scroll restoration and local animation |
| [Lucide: Getting Started](https://lucide.dev/guide/lucide/getting-started) | Selective imports and the documented `createIcons({ icons })` interface reduce the embedded payload |
| [Lucide: Global Styling](https://lucide.dev/guide/lucide/advanced/global-styling) | Reuse the established icon family and styling API |
| [W3C: Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Account for fixed navigation and modal focus; do not confuse minimum AA with enhanced AAA requirements |
| [web.dev: PWA Updates](https://web.dev/learn/pwa/update) | Updates should not interrupt active work; preserve the installed app's identity |
| [GitHub: GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) | Keep deployment static and project-relative |

### Newer Features Considered

- Safari 27 scroll anchoring benefits the page without a polyfill. Reserved image dimensions remain necessary for older versions.
- `text-autospace: normal`, `text-wrap: pretty`, existing container queries and guarded corner shaping are progressive enhancements.
- Native Web Animations provide the required cancellation and timing without adding GSAP or a framework.
- Scroll-driven animation was deliberately removed from reading content. Browser support does not make it useful for every interaction.
- Customizable selects, 3D/model elements, WebGPU, and service-worker static routing do not solve a current need here. A three-choice appearance control works better as native radio inputs, and existing cache routing is already small.
- Alpine 3.17.3 and Lucide 1.47.0 were current in the package registry during the check. Existing Alpine 3.17.2 and Lucide 1.43.0 were retained; no required feature justified a runtime-version migration.

## Verification

Performed with Playwright-driven Chrome and WebKit 26.6. WebKit is a useful engine check, not a substitute for Safari 27 on a physical iPhone.

| Check | Result |
| --- | --- |
| Four tabs in both appearances, axe-core 4.13.0 WCAG A/AA rules through 2.2 | No automated violations in the checked views |
| All 16 days in both appearances: contrast, control names, image alternatives | 32 combinations passed |
| 320, 360, 375, 390, 430, 768, 844, 1440 and 1920px layouts across four tabs | 36 combinations passed without horizontal overflow or clipped key text |
| WebKit phone layout with measured 32px root font | Four tabs passed; verified actual computed size |
| Rapid tab/day changes and reduced motion | Correct final state, restored scroll, cancellable motion |
| Global Chinese search from every tab | Correct day opens in Today |
| Search modal | Focus trap/return passed; native focus blocked from background; Chrome accessibility tree exposes only modal search |
| Real appearance and currency controls | Preferences persisted across reload |
| Interactive touch targets in four tabs | At least 44px; inline photo-credit text links use the standard inline-text exception |
| Offline navigation under `/taiwan-pwa/`, with the actual test server stopped | Chrome and WebKit loaded a new query URL, retained completion state, and displayed cached imagery/icons |
| Simulated newer deployment | Active search survived detection; explicit Update caused reload |
| Original data integrity | All days, bookings, prep items and hotel records unchanged |
| Static integrity | All inline scripts parse, service worker parses, cache assets exist, manifest identity preserved |

Screenshots are in [output/playwright](output/playwright/), including [light phone](output/playwright/webkit-light-today.png), [dark phone](output/playwright/webkit-dark-today.png), and [desktop](output/playwright/webkit-desktop.png).

### Limits and Device Checklist

Automated checks do not establish complete WCAG conformance. The following still need a physical phone:

1. Install from the final HTTPS Pages URL and check launch artwork, status bar, notch and Home Indicator in both appearances.
2. Verify VoiceOver reading order, Larger Text, Reduce Motion and Reduce Transparency using actual iOS settings.
3. Open once online, enable airplane mode, terminate and reopen the installed PWA, then visit a different day and confirm completion state.
4. Check search with the software keyboard, Safari toolbar expansion/collapse, landscape rotation, and real scrolling inertia.
5. Confirm perceived smoothness, sunlight legibility and startup performance on the oldest phone used by the group.

Playwright WebKit's `setOffline(true)` reload produced an internal engine error in a touch-emulated context. The separate server-disconnected test passed in WebKit and Chrome. The emulation failure was not silently counted as a pass. Percentage-based root-font emulation also did not produce the expected size in WebKit, so enlarged-text verification used a measured explicit 32px root.

## Maintenance

The app is ready to serve as-is. Rebuild the embedded icon subset only when icon names change:

```sh
npm install --prefix /tmp/taiwan-pwa-build --no-save --package-lock=false esbuild@0.25.10 lucide@1.43.0 parse5@7.3.0
node scripts/build-icons.mjs /tmp/taiwan-pwa-build/node_modules
```

[scripts/build-icons.mjs](scripts/build-icons.mjs) replaces only the generated Lucide runtime. It inventories quoted icon names in authored HTML/JavaScript and verifies static names against the pinned library. Keep data-driven icon names literal; synthesized names need an explicit inventory and browser verification. Deploy a changed service-worker cache version when cached assets change.

All three image sources, authors, license links and transformation notices are available in the app under Tools > Photography. The resized image derivatives retain their original licenses; they do not change the licensing of the app code.

The original downloaded files were preserved outside the app as `/tmp/taiwan-pwa-before-20260925.html`, `/tmp/taiwan-pwa-sw-before-20260925.js`, and `/tmp/taiwan-pwa-manifest-before-20260925.webmanifest` during this pass. These are temporary local backups, not a replacement for version control.