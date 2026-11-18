window.addEventListener('load', () => {
      window.setTimeout(() => {
        const warning = document.getElementById('runtime-warning');
        if (!warning) return;
        const title = document.getElementById('runtime-warning-title');
        const copy = document.getElementById('runtime-warning-copy');
        if (!window.Alpine) {
          if (title) title.textContent = 'Interactive runtime unavailable';
          if (copy) copy.textContent = 'Reload this page. The embedded interactive runtime did not initialize, but the itinerary data remains in this file.';
          warning.hidden = false;
        } else if (!window.lucide) {
          if (title) title.textContent = 'Icon library unavailable';
          if (copy) copy.textContent = 'Core navigation still works. Reload to restore the embedded icon set.';
          warning.hidden = false;
        }
      }, 0);
    });


/* Persistent offline shell, explicit update hand-off, and low-cost chrome state. */
(() => {
  const root = document.documentElement;
  let frame = 0;
  let lastY = Math.max(0, window.scrollY || 0);
  let travel = 0;
  // WebKit bug 323322: a Home Screen app can resume with a phantom keyboard inset that pans
  // fixed bottom chrome off screen. An untransformed fixed sentinel still reports the true edge.
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;pointer-events:none;visibility:hidden';
  document.body.append(sentinel);
  let dockLift = 0;
  const syncDockLift = () => {
    const vv = window.visualViewport;
    const editing = document.activeElement?.matches?.('input, textarea, select, [contenteditable]');
    let lift = 0;
    if (!editing && (!vv || Math.abs(vv.scale - 1) < 0.01)) {
      const gap = window.innerHeight - sentinel.getBoundingClientRect().bottom;
      if (gap > 1 && gap < 600) lift = Math.round(gap);
    }
    if (lift !== dockLift) {
      dockLift = lift;
      root.style.setProperty('--dock-lift', `${lift}px`);
    }
  };
  const syncScrollState = () => {
    frame = 0;
    syncDockLift();
    const y = Math.max(0, window.scrollY || 0);
    root.classList.toggle('is-scrolled', y > 8);
    root.classList.toggle('rail-scrolled', y > 72);
    const dy = y - lastY;
    lastY = y;
    // A jump this large in one frame is a programmatic restore or landing, not reading.
    if (Math.abs(dy) > 160) { travel = 0; return; }
    travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
    const nearEnd = y + window.innerHeight >= root.scrollHeight - 48;
    if (y < 140 || nearEnd || travel < -14) root.classList.remove('dock-compact');
    else if (travel > 28) root.classList.add('dock-compact');
  };
  const scheduleScrollState = () => {
    if (frame) return;
    frame = requestAnimationFrame(syncScrollState);
  };
  addEventListener('scroll', scheduleScrollState, { passive: true });
  addEventListener('resize', scheduleScrollState, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleScrollState, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleScrollState, { passive: true });
  document.addEventListener('visibilitychange', scheduleScrollState);
  syncScrollState();

  const serviceWorkers = navigator.serviceWorker;
  if (!serviceWorkers || typeof serviceWorkers.register !== 'function') return;
  let registration = null;
  let updateReloadStarted = false;

  // New builds activate themselves once cached (sw.js calls skipWaiting), passing through
  // 'installed' on the way. Only a worker that is still waiting a moment later needs the
  // Update action; otherwise the action would linger with nothing left to install.
  const announceWaitingWorker = reg => {
    setTimeout(() => {
      if (!reg?.waiting || !navigator.serviceWorker.controller) return;
      window.dispatchEvent(new Event('twhk-update-ready'));
    }, 1500);
  };

  addEventListener('load', async () => {
    try {
      registration = await serviceWorkers.register('./sw.js', { updateViaCache: 'none' });
      announceWaitingWorker(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') announceWaitingWorker(registration);
        });
      });
      setTimeout(() => registration?.update().catch(() => {}), 1800);
    } catch (error) {
      console.warn('[offline] service worker registration failed:', error);
    }
  }, { once: true });

  window.addEventListener('twhk-apply-update', () => {
    if (updateReloadStarted || !registration?.waiting) return;
    updateReloadStarted = true;
    try { sessionStorage.setItem('twhk-just-updated', '1'); } catch {}
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  serviceWorkers.addEventListener('controllerchange', () => {
    if (!updateReloadStarted) {
      // A new build took over by itself. This page already runs a matching set of files and
      // the next launch opens the new build, so retire the Update action without reloading.
      window.dispatchEvent(new Event('twhk-update-applied'));
      return;
    }
    location.reload();
  });

  let lastCheckedAt = 0;
  const recheck = () => {
    if (!registration || !navigator.onLine || Date.now() - lastCheckedAt < 30 * 60 * 1000) return;
    lastCheckedAt = Date.now();
    registration.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheck();
  });
  addEventListener('online', recheck);
})();

/*
    Back-button + deep-link support.

    Tabs push a history entry, so Back retraces destinations. Day changes only *replace*
    the entry — 16 days would otherwise bury the app under history and make Back useless.
    Query params rather than a hash, because both documents already use hash fragments for
    in-page section anchors.
  */
  (() => {
    const DAY_PROP = 'activeDayId';
    let restoring = false;

    const readState = () => {
      const q = new URLSearchParams(location.search);
      return { tab: q.get('tab'), day: q.get('day') };
    };
    const urlFor = (tab, day) => {
      const q = new URLSearchParams();
      if (tab) q.set('tab', tab);
      if (day !== undefined && day !== null && day !== '') q.set('day', String(day));
      const s = q.toString();
      return location.pathname + (s ? '?' + s : '') + location.hash;
    };

    const boot = () => {
      const host = document.querySelector('[x-data]');
      const app = window.Alpine && host && Alpine.$data(host);
      // Alpine.$data can return a proxy shell one microtask before x-data has populated
      // its own properties. Writing through that half-ready proxy throws inside the
      // reactivity layer on fast mobile launches, so wait until the itinerary model exists.
      if (!app || !Array.isArray(app.days) || !app.days.length || typeof app.$watch !== 'function') return false;
      const restoresSmartLaunch = history.state?.smartLaunchGenerated === true;
      // The app decides a smart launch (live trip, no deep link). The Home Screen opens
      // ./?tab=today, which is a plain launch, not a request for a particular day.
      app.smartLaunchActive = restoresSmartLaunch || Boolean(app.smartLaunchActive);

      const snapshot = () => ({
        tab: app.activeTab,
        day: app[DAY_PROP],
        ...(app.smartLaunchActive ? { smartLaunchGenerated: true } : {})
      });

      // A URL is untrusted input: it can be hand-edited, stale after a rename, or a
      // shared link from an older build. Anything that is not a real tab or a real day is
      // ignored, otherwise the app lands in a state where no pane matches and the screen
      // is simply blank.
      const validTabs = (Array.isArray(app.tabs) && app.tabs.length)
        ? app.tabs.map(t => t.id)
        : [...document.querySelectorAll('[x-show]')]
            .map(el => (el.getAttribute('x-show').match(/activeTab\s*===\s*'([^']+)'/) || [])[1])
            .filter(Boolean);
      const dayIsNumeric = typeof app[DAY_PROP] === 'number';
      const dayKey = d => (dayIsNumeric ? d.dayNumber : d.id);
      const coerceDay = v => (dayIsNumeric ? Number(v) : String(v));

      const applyTab = t => {
        if (!t || (validTabs.length && !validTabs.includes(t))) return;
        if (t !== app.activeTab) app.activeTab = t;
      };
      const applyDay = v => {
        if (v === null || v === undefined || v === '') return;
        const want = coerceDay(v);
        if (dayIsNumeric && !Number.isFinite(want)) return;
        if (!(Array.isArray(app.days) && app.days.some(d => dayKey(d) === want))) return;
        if (want !== app[DAY_PROP]) app[DAY_PROP] = want;
      };

      // Restore from the URL on first load (deep link / reload / shared link).
      const initial = readState();
      restoring = true;
      if (!app.smartLaunchActive) {
        applyTab(initial.tab);
        applyDay(initial.day);
      }
      restoring = false;

      const s = snapshot();
      history.replaceState(s, '', urlFor(s.tab, s.day));

      app.$watch('activeTab', () => {
        if (restoring) return;
        const n = snapshot();
        history.pushState(n, '', urlFor(n.tab, n.day));
      });

      app.$watch(DAY_PROP, () => {
        if (restoring) return;
        const n = snapshot();
        history.replaceState(n, '', urlFor(n.tab, n.day));
      });

      window.addEventListener('popstate', event => {
        const st = event.state || readState();
        restoring = true;
        try {
          app.smartLaunchActive = st.smartLaunchGenerated === true;
          applyTab(st.tab);
          applyDay(st.day);
        } finally {
          // release after Alpine has applied the change so the watchers stay quiet
          requestAnimationFrame(() => { restoring = false; });
        }
      });
      return true;
    };

    // This script is parsed after the embedded Alpine runtime, so alpine:initialized has
    // usually already fired by now and a plain listener never runs. Try immediately, keep
    // the listener for the slow path, and poll briefly to cover both orderings.
    if (!boot()) {
      document.addEventListener('alpine:initialized', boot, { once: true });
      let tries = 0;
      const poll = setInterval(() => { if (boot() || ++tries > 60) clearInterval(poll); }, 50);
    }
  })();
