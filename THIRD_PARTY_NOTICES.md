# Third-party notices

The deployment includes local, pruned or compiled copies of open-source browser libraries:

- **Alpine.js** — MIT License.
- **Lucide** — ISC License. The maintenance helper pins Lucide 1.43.0 and bundles only icons referenced by this application.
- **Tailwind CSS** — MIT License. The shipped CSS contains compiled output; there is no browser-time Tailwind dependency.
- **Leaflet** — BSD 2-Clause License (`assets/vendor/leaflet/LICENSE`). Loaded only when the day map is opened online.

Map data and tiles in the day map: © OpenStreetMap contributors (ODbL), loaded live from tile.openstreetmap.org and never cached for offline use. Stop coordinates were geocoded once with OpenStreetMap Nominatim, with a few taken from Wikipedia and official sources (`data/coords.json`).

Destination artwork in `assets/*.webp`, app icons, and startup screens are locally generated for this application. The itinerary’s Toolkit screen retains attribution links for the public photographs that informed the earlier photographic treatment; the deployed hero artwork itself is original vector-style artwork rather than copies of those photographs.
