/* Interaction layer: touch physics, the backdrop, and the small helpers the newer templates call
   (dayGroup, dayThumb, sunArc, leaveSplit, condensedTitle). Loaded after features.js and before Alpine
   starts, and shipped, hashed and precached with the page. Each behaviour is wrapped, so one that cannot
   run (an old WebKit, a missing API) leaves the rest of the app exactly as it was. */
(() => {
  'use strict';
  const core = window.travelOS;
  if (typeof core !== 'function') return;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);

  // UIScrollView's constants (WWDC18 "Designing Fluid Interfaces"): where a flick coasts to, and the
  // resistance curve past an edge. v is in px/s.
  const RATE = 0.998;
  const project = v => (v / 1000) * RATE / (1 - RATE);
  const rubber = (x, range) => (1 - 1 / ((x * 0.55) / range + 1)) * range;

  // An analytic spring (Apple's duration/bounce: ω = 2π/duration, ζ = 1 − bounce) that starts with the finger's own velocity,
  // so a flick carries on at the speed it was thrown and a retargeted motion never restarts from rest. v0 is px/s.
  function spring({ from, to, v0 = 0, duration = 0.5, bounce = 0, step, done }) {
    const w = (2 * Math.PI) / duration, z = Math.min(1, 1 - bounce), A = from - to;
    const wd = w * Math.sqrt(Math.max(1e-9, 1 - z * z));
    const B = z < 1 ? (v0 + z * w * A) / wd : 0, t0 = performance.now();
    let raf = 0, stopped = false;
    const tick = now => {
      if (stopped) return;
      const t = Math.max(0, (now - t0) / 1000), e = Math.exp(-z * w * t);
      let x, vx;
      if (z < 1) {
        const c = Math.cos(wd * t), s = Math.sin(wd * t);
        x = e * (A * c + B * s);
        vx = e * ((B * wd - z * w * A) * c - (z * w * B + A * wd) * s);
      } else {
        x = e * (A + (v0 + w * A) * t);
        vx = e * ((v0 + w * A) - w * (A + (v0 + w * A) * t));
      }
      if (t > 1.6 || (t > 0.08 && Math.abs(x) < 0.3 && Math.abs(vx) < 8)) { step(to); if (done) done(); return; }
      step(to + x);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }

  /* ---------------------------------------------------------------------------------------------
     Drag-to-dismiss for a bottom panel. A small state machine fed by touch events, so the physics
     can be tested without a finger:
       begin → pending (7px slop) → drag (follows the finger, rubber-bands upward) → release.
     Release decides from where the panel would coast to, not from where it is: a short fast flick
     dismisses, a slow long pull that stops half way springs back.
     --------------------------------------------------------------------------------------------- */
  function createSheetDrag({ panel, backdrop, handle, close, enabled }) {
    const SLOP = 7;
    let s = null;            // the gesture in progress
    let settle = null;       // the settle in progress: { token, from }
    let suppressClickUntil = 0;

    const height = () => panel.getBoundingClientRect().height || 1;
    const offsetNow = () => {
      const m = getComputedStyle(panel).transform;
      if (!m || m === 'none') return 0;
      const nums = m.match(/-?[\d.]+(?:e-?\d+)?/g);
      return nums && nums.length >= 6 ? parseFloat(nums[5]) : 0;
    };
    // Inline declarations are marked important: the search panel's stylesheet pins its transform
    // with !important, which would otherwise beat the finger.
    const put = (el, name, value) => el.style.setProperty(name, value, 'important');
    const paint = off => {
      put(panel, 'transform', `translate3d(0, ${off.toFixed(2)}px, 0)`);
      if (backdrop) put(backdrop, 'opacity', String(1 - clamp(off / height(), 0, 1) * 0.9));
    };
    const reset = () => {
      settle = null;
      panel.style.removeProperty('transition');
      panel.style.removeProperty('transform');
      if (backdrop) { backdrop.style.removeProperty('transition'); backdrop.style.removeProperty('opacity'); }
    };
    const freeze = () => {
      if (!settle) return;
      const y = offsetNow();
      if (settle.cancel) settle.cancel();
      settle = null;
      put(panel, 'transition', 'none');
      if (backdrop) put(backdrop, 'transition', 'none');
      paint(y);
    };
    // The settle is a spring that starts at the finger's velocity. `settle` holds its cancel function.
    const settleTo = (target, { v0, bounce, duration, done }) => {
      const token = {};
      settle = token;
      put(panel, 'transition', 'none');
      if (backdrop) put(backdrop, 'transition', 'none');
      const y0 = offsetNow();
      const cancel = spring({
        from: y0, to: target, v0, bounce, duration,
        step: y => { if (settle === token) paint(y); },
        done: () => { if (settle !== token) return; done(); }
      });
      token.cancel = cancel;
    };

    const api = {
      reset,
      get active() { return !!s && s.mode === 'drag'; },
      get settling() { return !!settle; },
      begin(x, y, t, target) {
        // A new touch means the last one is over. iOS can end a touch stream without a touchend (WebKit 322561), which would
        // otherwise leave a stale gesture blocking every later one; spring a half-finished drag home instead.
        if (s) api.end(t, true);
        if (!enabled()) return false;
        const el = target && target.closest ? target : null;
        if (el && el.closest('input, textarea, select, [contenteditable="true"], [data-no-sheet-drag]')) return false;
        const onHandle = !!(el && handle && el.closest(handle));
        // Mid-scroll content keeps the gesture: the panel itself, or any scroller between the finger and the panel
        // (the search results scroll inside the panel, not the panel itself).
        const scrolled = () => { for (let n = el; n; n = n.parentElement) { if (n.scrollTop > 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return true; if (n === panel) break; } return panel.scrollTop > 1; };
        if (!onHandle && scrolled()) return false;
        freeze();
        s = { x0: x, y0: y, origin: y, lastY: y, lastT: t, v: 0, mode: 'pending', onHandle, base: offsetNow(), off: offsetNow() };
        return true;
      },
      /** Returns true when the event should be cancelled (the sheet owns the gesture). */
      move(x, y, t) {
        if (!s) return false;
        if (s.mode === 'pending') {
          const dy = y - s.y0, dx = x - s.x0;
          if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return false;
          // Sideways, or upward from rest on the body: leave it to the page.
          if (Math.abs(dx) > Math.abs(dy) || (dy < 0 && !s.onHandle && s.base <= 0.5)) { s = null; return false; }
          s.mode = 'drag';
          s.origin = y;                       // measure from where the sheet took over: no jump
          put(panel, 'transition', 'none');
          if (backdrop) put(backdrop, 'transition', 'none');
        }
        let off = s.base + (y - s.origin);
        off = off >= 0 ? off : -rubber(-off, 56);
        s.off = off;
        const dt = Math.max(1, t - s.lastT);
        s.v = s.v * 0.55 + ((y - s.lastY) / dt) * 1000 * 0.45;
        s.lastY = y; s.lastT = t;
        paint(off);
        return true;
      },
      end(t, cancelled = false) {
        if (!s) return null;
        const st = s; s = null;
        if (st.mode !== 'drag') return null;
        suppressClickUntil = performance.now() + 380;
        const H = height();
        // touchmove stops firing while the finger rests, so the last velocity is stale by then.
        const idle = Math.max(0, t - st.lastT);
        const v = idle > 110 ? 0 : st.v * (1 - idle / 110);
        const coast = st.off + project(clamp(v, -2500, 2500));
        const flick = v > 650 && st.off > 12;
        const dismiss = !cancelled && (coast > H * 0.5 || flick) && v > -250;
        const reduced = prefersReduced();
        if (dismiss) {
          // Critically damped (no bounce: it is leaving) and carrying the throw's own velocity.
          settleTo(H + 40, {
            v0: Math.max(v, 0), bounce: 0, duration: reduced ? 0.18 : 0.34,
            // The panel stays off screen until the next open clears these inline styles.
            done: () => { settle = null; panel.style.removeProperty('transition'); if (backdrop) { backdrop.style.removeProperty('transition'); backdrop.style.removeProperty('opacity'); } close(); }
          });
          return 'dismiss';
        }
        // Back home: 100% damping for a plain release; a little bounce when it was thrown (WWDC18: reward momentum).
        settleTo(0, { v0: v, bounce: reduced ? 0 : Math.abs(v) > 300 ? 0.2 : 0, duration: reduced ? 0.18 : 0.5, done: reset });
        return 'return';
      }
    };

    // The click a lifted finger can still produce must not reach the backdrop's close handler.
    document.addEventListener('click', e => {
      if (performance.now() < suppressClickUntil && panel.closest('[x-show], .sheet-backdrop, .global-search-backdrop')?.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    const point = e => { const t = e.touches[0] || e.changedTouches[0]; return t ? [t.clientX, t.clientY] : null; };
    panel.addEventListener('touchstart', e => { if (e.touches.length !== 1) { api.end(e.timeStamp, true); return; } const p = point(e); if (p) api.begin(p[0], p[1], e.timeStamp, e.target); }, { passive: true });
    panel.addEventListener('touchmove', e => { const p = point(e); if (p && api.move(p[0], p[1], e.timeStamp) && e.cancelable) e.preventDefault(); }, { passive: false });
    panel.addEventListener('touchend', e => { api.end(e.timeStamp); }, { passive: true });
    panel.addEventListener('touchcancel', e => { api.end(e.timeStamp, true); }, { passive: true });
    return api;
  }

  /* ---------------------------------------------------------------------------------------------
     Atmosphere. Each hero photo's dominant hue, chroma and lightness (OKLab, chroma²-weighted; computed
     offline by scripts/photo_tints.py) lights the backdrop; the city keeps a say so a place still reads as
     itself. Two layers crossfade on opacity.
     --------------------------------------------------------------------------------------------- */
  const PHOTO_TINT = {
    'day-01-photo': [92.5, .051, .501], 'day-03-photo': [42.5, .069, .528], 'day-04-photo': [67.5, .065, .619],
    'day-05-photo': [27.5, .112, .318], 'day-07-photo': [247.5, .089, .72], 'day-08-photo': [72.5, .076, .504],
    'day-09-photo': [252.5, .067, .555], 'day-12-photo': [57.5, .036, .548], 'day-13-photo': [252.5, .069, .583],
    'day-14-photo': [257.5, .049, .728], 'day-15-photo': [27.5, .135, .765], 'hk-photo': [252.5, .071, .486],
    'kaohsiung-photo': [87.5, .038, .635], 'taipei-photo': [242.5, .037, .703]
  };
  // The city's identity hue lights the main glow; the photo's own hue lights the second, smaller one. Blending
  // the two angles would invent muddy in-between colours (teal and brick average to olive), so they stay apart.
  const CITY_HUE = { taipei: 200, kaohsiung: 78, hk: 300, flight: 245 };
  const wrapDelta = (a, b) => ((a - b + 540) % 360) - 180;                 // shortest signed distance a→b
  // The sky over the live day changes the mood of the backdrop: its second glow takes the colour of the hour (amber at golden
  // hour, ember at dusk, indigo at night) and everything dims a little after dark. Other days keep their photo's tint.
  const PHASE = {
    day: { l: 1, c: 1, h2: null, c2: 1 },
    dawn: { l: .97, c: .95, h2: 12, c2: .85 },
    golden: { l: 1.02, c: 1.12, h2: 68, c2: 1.1 },
    dusk: { l: .96, c: 1.05, h2: 22, c2: .95 },
    night: { l: .86, c: .92, h2: 268, c2: .9 }
  };
  function phaseOf(nowMin, sun) {
    if (!sun || !Number.isFinite(nowMin)) return 'day';
    const { riseMin: r, setMin: s } = sun;
    if (nowMin < r - 45 || nowMin >= s + 40) return 'night';
    if (nowMin < r + 40) return 'dawn';
    if (nowMin < s - 70) return 'day';
    if (nowMin < s) return 'golden';
    return 'dusk';
  }
  function tintFor(photoKey, city, phase = 'day') {
    const h1 = CITY_HUE[city] ?? 205;
    const [ph, pc] = PHOTO_TINT[photoKey] || [h1, .04];
    const mod = PHASE[phase] || PHASE.day;
    const h2 = mod.h2 == null ? ph : mod.h2;
    // Reds sit on the live rose: keep them an ember rather than a glow.
    const rose = Math.max(0, 1 - Math.abs(wrapDelta(h2, 32)) / 28);
    const base2 = mod.h2 == null ? clamp(0.02 + pc * 0.3, 0.03, 0.062) : 0.05;
    const c2 = base2 * mod.c2 * (1 - 0.45 * rose);
    const c1 = (city === 'kaohsiung' || city === 'flight' ? 0.036 : 0.042) * mod.c;
    return { h1, c1: Math.round(c1 * 1000) / 1000, l1: Math.round(0.315 * mod.l * 1000) / 1000, h2: Math.round(h2 * 10) / 10, c2: Math.round(c2 * 1000) / 1000 };
  }
  function seedNoise(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeGrain(root) {
    // A blob: URL is decoded once; a data: URL background repaints whenever its element restyles (WebKit 327573).
    try {
      const size = 192, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const g = canvas.getContext('2d');
      const img = g.createImageData(size, size), rnd = seedNoise(0x7A1D);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = (rnd() * 10) | 0; }
      g.putImageData(img, 0, 0);
      canvas.toBlob(blob => { if (blob) root.style.setProperty('--atmos-grain', `url(${URL.createObjectURL(blob)})`); }, 'image/png');
    } catch (_) { /* no grain: the gradient simply bands a little */ }
  }
  function atmosphere(app) {
    const root = document.querySelector('.atmos');
    if (!root) return;
    const layers = [...root.querySelectorAll('.atmos-layer')];
    if (layers.length < 2) return;
    let active = 0, applied = '';
    const currentPhase = () => {
      const day = app.currentDay;
      if (!day || !app.liveTripDayId || app.liveTripDayId !== day.id) return 'day';
      const nowMin = app.getScheduleMinutes(app.nowTick, day.timeZone);
      return phaseOf(nowMin, app.sunForDay(day));
    };
    const apply = first => {
      const photoKey = String(app.destinationPhoto?.src || '').split('/').pop().replace(/\.webp.*$/, '');
      const city = app.currentCityTheme;
      const phase = currentPhase();
      const key = photoKey + '|' + city + '|' + phase;
      if (key === applied) return;
      applied = key;
      const t = tintFor(photoKey, city, phase);
      const next = layers[first ? active : active ^ 1], prev = layers[active];
      next.style.setProperty('--ah', t.h1);
      next.style.setProperty('--ac', t.c1);
      next.style.setProperty('--al', t.l1);
      next.style.setProperty('--ah2', t.h2);
      next.style.setProperty('--ac2', t.c2);
      root.dataset.phase = phase;
      if (first) { next.style.transition = 'none'; next.classList.add('is-on'); void next.offsetWidth; next.style.removeProperty('transition'); return; }
      next.classList.add('is-on');
      prev.classList.remove('is-on');
      active ^= 1;
    };
    makeGrain(root);
    apply(true);
    app.$watch('activeDayId', () => apply(false));
    app.$watch('nowTick', () => apply(false));
    hooks_atmosphere = { apply, tintFor, phaseOf, currentPhase };
  }
  let hooks_atmosphere = null;

  /* ---------------------------------------------------------------------------------------------
     Large title → inline title. When the day's own heading has scrolled under the pinned chrome, the brand line in
     the header gives way to the day. An IntersectionObserver on the heading: no scroll listener, no layout reads.
     --------------------------------------------------------------------------------------------- */
  function condensedHeader(app) {
    const root = document.documentElement;
    let io = null, observed = null, hidden = false;
    const set = on => { if (on !== root.hasAttribute('data-condensed')) root.toggleAttribute('data-condensed', on); };
    const attach = () => {
      const target = document.querySelector('.day-hero .day-title');
      if (!target || target === observed) return;
      if (io) io.disconnect();
      observed = target;
      const barH = Math.round(parseFloat(getComputedStyle(root).getPropertyValue('--phone-day-rail-base')) || 0) + 64;
      io = new IntersectionObserver(([entry]) => { hidden = !entry.isIntersecting && entry.boundingClientRect.top < barH; set(app.activeTab === 'today' && hidden); },
        { rootMargin: `-${barH}px 0px 0px 0px`, threshold: 0 });
      io.observe(target);
    };
    attach();
    app.$watch('activeTab', tab => { if (tab !== 'today') set(false); else { attach(); set(hidden); } });
    app.$watch('activeDayId', () => app.$nextTick(attach));
  }

  /* ---------------------------------------------------------------------------------------------
     Spine fill. The timeline's line fills to "now": a finished day is full, a day to come is empty, and on the live
     day the head sits at the live stop and glides down it as the stop runs. Written once per update on the stack
     element (never :root), transform-only in CSS.
     --------------------------------------------------------------------------------------------- */
  function spineFill(app) {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const stack = document.querySelector('.timeline-stack');
      if (!stack || !stack.getClientRects().length) return;
      const cards = [...stack.children].filter(el => el.classList && el.classList.contains('timeline-card'));
      if (!cards.length) { stack.style.setProperty('--spine-fill', '0'); return; }
      const dot = el => el.offsetTop + 30;
      const spineTop = 24, total = Math.max(1, stack.offsetHeight - spineTop - 30);
      const k = cards.findIndex((_, i) => !app.timelineItemPast(i));       // first card not yet done
      const live = !!app.liveTripDayId && app.liveTripDayId === app.activeDayId;
      let head = null;
      if (k === -1) head = dot(cards[cards.length - 1]);
      else if (live && k > 0 && app.relevantPlan?.state !== 'current') head = dot(cards[k]);
      else if (live && app.relevantPlan?.state === 'current') {
        const p = Math.max(0, Math.min(1, Number(app.nowCard?.progress) || 0)), next = cards[k + 1];
        head = dot(cards[k]) + p * (next ? dot(next) - dot(cards[k]) : 24);
      } else if (live && k === 0) head = null;
      const ratio = head == null ? 0 : Math.max(0, Math.min(1, (head - spineTop) / total));
      stack.style.setProperty('--spine-fill', ratio.toFixed(4));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => requestAnimationFrame(compute)); };
    ['activeDayId', 'activeTab', 'relevantPlan', 'nowTick'].forEach(key => app.$watch(key, schedule));
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    schedule();
    return { schedule, compute };
  }

  /* ---------------------------------------------------------------------------------------------
     Wire-up: the component's init is wrapped, as features.js does.
     --------------------------------------------------------------------------------------------- */
  window.travelOS = function travelOSWithUx() {
    const data = core();
    // Days tab: a photo per day, and the days grouped under their city.
    const shortDate = text => (String(text || '').match(/[A-Z][a-z]{2} \d{1,2}/) || [''])[0];
    const GROUP_NAME = { flight: 'Flight · 飛行', taipei: 'Taipei · 台北', kaohsiung: 'Kaohsiung · 高雄', hk: 'Hong Kong · 香港' };
    data.dayGroup = function (idx) {
      const list = this.filteredDays, day = list[idx];
      if (!day) return null;
      const theme = this.getDayTheme(day);
      if (idx > 0 && this.getDayTheme(list[idx - 1]) === theme) return null;
      let end = idx;
      while (list[end + 1] && this.getDayTheme(list[end + 1]) === theme) end++;
      const first = shortDate(day.dateString), last = shortDate(list[end].dateString);
      return { name: GROUP_NAME[theme] || day.city, meta: end === idx ? first : `${first} – ${last}` };
    };
    data.dayThumb = function (day) {
      const theme = this.getDayTheme(day);
      const city = theme === 'flight' ? (Number(day.dayNum) > 8 ? 'hk' : 'taipei') : theme;
      const photo = this.dayPhotos[day.id] || this.destinationPhotos[city] || this.destinationPhotos.taipei;
      return String(photo.src).replace('./assets/', './assets/thumbs/');
    };
    // Where the sun is between sunrise and sunset, on the weather card's arc: the live day follows the clock, any other
    // day stands at noon. (p runs 0 at sunrise to 1 at sunset; before or after, it rests on the horizon.)
    data.sunArc = function (day) {
      const sun = this.sunForDay(day);
      if (!sun) return { x: 60, y: 4, lit: 0, night: false };
      const live = !!this.liveTripDayId && this.liveTripDayId === day.id;
      let p = 0.5, night = false;
      if (live) {
        const nowMin = this.getScheduleMinutes(this.nowTick, day.timeZone);
        p = (nowMin - sun.riseMin) / Math.max(1, sun.setMin - sun.riseMin);
        night = p < 0 || p > 1;
        p = Math.max(0, Math.min(1, p));
      }
      const r2 = v => Math.round(v * 100) / 100;
      return { x: r2(60 - 56 * Math.cos(Math.PI * p)), y: r2(28 - 24 * Math.sin(Math.PI * p)), lit: live ? (night && p >= 1 ? 100 : Math.round(p * 1000) / 10) : 100, night };
    };
    // "8:30 AM from hotel" → a large time and what it is for. Anything that does not start with a clock time stays as it was.
    data.leaveSplit = function (text) {
      const t = String(text || '').trim();
      const m = t.match(/^(~?\d{1,2}:\d{2}\s?[AP]M)\s*(.*)$/i);
      return m ? { time: m[1], rest: m[2], plain: false } : { time: t, rest: '', plain: true };
    };
    // The brand line becomes the day once its own title has scrolled away (see condensedHeader).
    Object.defineProperty(data, 'condensedTitle', { configurable: true, enumerable: true, get() {
      const day = this.currentDay;
      if (!day) return '';
      return `${shortDate(day.dateString)} · ${this.destinationPhoto?.label || day.city}`;
    } });
    // A day change carries the eye: the old photo dissolves into the new one, the heading settles, the cards rise in order.
    let lastDayChange = 0;
    data.playDayChange = function () {
      const reduce = this.prefersReducedMotion();
      const now = performance.now();
      const rapid = now - lastDayChange < 480;
      lastDayChange = now;
      const dir = this.motionDirection === 'backward' ? -1 : 1;
      const figure = document.querySelector('.destination-photo');
      const img = figure && figure.querySelector('img:not(.photo-ghost)');
      let ghost = null;
      if (!reduce && img && img.complete && img.naturalWidth && figure.animate) {
        figure.querySelectorAll('.photo-ghost').forEach(g => g.remove());
        ghost = new Image();
        ghost.className = (img.className + ' photo-ghost').trim();
        ghost.alt = '';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.decoding = 'sync';
        ghost.src = img.currentSrc || img.src;
        img.insertAdjacentElement('afterend', ghost);
      }
      this.$nextTick(() => {
        const hero = document.querySelector('.hero-head'), grid = document.querySelector('.today-content-grid'), stack = document.querySelector('.timeline-stack');
        if (!reduce) {
          if (hero && hero.animate) hero.animate([{ opacity: .3, transform: `translate3d(${dir * 10}px, 0, 0)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' });
          if (grid && grid.animate) grid.animate([{ opacity: .6 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
          if (stack && !rapid) { stack.classList.add('day-enter'); window.setTimeout(() => stack.classList.remove('day-enter'), 760); }
        }
        const fresh = figure && figure.querySelector('img:not(.photo-ghost)');
        if (ghost) {
          const finish = () => ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 440, easing: 'ease-out', fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
          if (!fresh || fresh.currentSrc === ghost.src || fresh.src === ghost.src) ghost.remove();
          else Promise.race([fresh.decode ? fresh.decode() : Promise.resolve(), new Promise(r => setTimeout(r, 320))]).catch(() => {}).then(finish);
        } else if (img && !reduce && img.animate) {
          img.animate([{ opacity: .5 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
        }
      });
    };
    // A stop landed on from the Now card must stay under the rail even if live content (a train card, a banner) is
    // inserted above it a moment later. Safari 27 re-anchors such shifts itself; Safari 26 does not. After the app's own
    // settle loop (up to 1.6 s) this keeps watching for 2.6 s more, and gives way the moment the reader touches the page.
    const coreLandOn = data.landOn;
    let guardSeq = 0;
    data.landOn = function (plan, jump) {
      const landed = coreLandOn.apply(this, arguments);
      const app = this, mine = ++guardSeq, t0 = performance.now();
      const watch = () => {
        if (mine !== guardSeq || performance.now() - t0 > 4300) return;
        if ((app._userScrolledAt || 0) > t0 + 40 || app.showSheet || app.showGlobalSearch || app.activeTab !== 'today') return;
        try {
          const target = app.planTarget(plan);
          if (target && target.getClientRects().length) {
            const wanted = target.getBoundingClientRect().top + window.scrollY - app.pinnedChromeBottom() - 12;
            const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const goal = Math.max(0, Math.min(max, wanted));
            if (Math.abs(goal - window.scrollY) > 3) app.positionRelevantPlan(plan, 'auto');
          }
        } catch (_) { return; }
        window.setTimeout(watch, 160);
      };
      window.setTimeout(watch, 1700);
      return landed;
    };
    const coreInit = data.init;
    data.init = function () {
      coreInit.call(this);
      try { uxInit(this); } catch (error) { console.warn('[ux] interaction layer unavailable', error); }
    };
    return data;
  };

  function uxInit(app) {
    // iOS only paints :active when something on the page listens for touches.
    document.body.addEventListener('touchstart', () => {}, { passive: true });

    const hooks = window.__TWHK_UX__ = window.__TWHK_UX__ || {};
    try { atmosphere(app); hooks.atmosphere = hooks_atmosphere; } catch (error) { console.warn('[ux] atmosphere unavailable', error); }
    try { condensedHeader(app); } catch (error) { console.warn('[ux] header title unavailable', error); }
    try { hooks.spine = spineFill(app); } catch (error) { console.warn('[ux] spine unavailable', error); }

    const sheetBackdrop = document.querySelector('.sheet-backdrop');
    const sheetPanel = sheetBackdrop && sheetBackdrop.querySelector('[data-modal-panel="sheet"]');
    if (sheetPanel) {
      const drag = createSheetDrag({
        panel: sheetPanel, backdrop: sheetBackdrop,
        handle: '.sheet-grabber, .stop-sheet-head, .sheet-title',
        close: () => app.closeSheet(),
        enabled: () => isPhone() && !!app.showSheet && app.showSheet !== 'show'
      });
      hooks.sheet = drag;
      // A fresh open always starts from the CSS state, never from a previous dismissal.
      app.$watch('showSheet', value => { if (value) drag.reset(); });
    }

    const searchBackdrop = document.querySelector('.global-search-backdrop');
    const searchPanel = searchBackdrop && searchBackdrop.querySelector('[data-modal-panel="search"]');
    if (searchPanel) {
      const drag = createSheetDrag({
        panel: searchPanel, backdrop: searchBackdrop,
        handle: '.global-search-head',
        close: () => app.closeGlobalSearch(),
        enabled: () => isPhone() && !!app.showGlobalSearch
      });
      hooks.search = drag;
      app.$watch('showGlobalSearch', value => { if (value) drag.reset(); });
    }
  }
})();
