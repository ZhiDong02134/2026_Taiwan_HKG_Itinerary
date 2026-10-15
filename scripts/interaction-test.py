#!/usr/bin/env python3
"""In-process mobile interaction regression suite.

The execution sandbox blocks localhost navigation, so this test inlines the PWA's local
assets into an about:blank document. It still exercises the real Alpine application,
CSS, touch/pointer handlers, layout, and keyboard behavior. Service-worker behavior is
covered separately by scripts/verify.py.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import shutil
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'interaction'
OUT.mkdir(parents=True, exist_ok=True)
MOBILE_VIEWPORTS = [(320, 700), (375, 812), (390, 844), (430, 932)]


def data_uri(path: Path) -> str:
    mime = 'image/webp' if path.suffix.lower() == '.webp' else 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def inline_document() -> str:
    html = (ROOT / 'index.html').read_text()
    css = (ROOT / 'assets' / 'app.css').read_text()
    html = html.replace('<link rel="stylesheet" href="./assets/app.css">', f'<style>{css}</style>')

    for src in ('assets/app.js', 'assets/vendor/lucide.js', 'assets/vendor/alpine.js', 'assets/runtime.js'):
        html = html.replace(f'<script defer src="./{src}"></script>', f'<script>{(ROOT / src).read_text()}</script>')

    for image in ('assets/taipei.webp', 'assets/kaohsiung.webp', 'assets/hk.webp'):
        html = html.replace('./' + image, data_uri(ROOT / image))

    html = re.sub(r'<link rel="(?:manifest|preload)"[^>]*>', '', html)
    # about:blank has an opaque origin. Neutralize URL-history and network-only integrations
    # so test failures represent the UI rather than the sandbox.
    harness = '''<script>
      try {
        History.prototype.replaceState = function() {};
        History.prototype.pushState = function() {};
        Object.defineProperty(navigator, 'serviceWorker', { value: null, configurable: true });
      } catch (_) {}
      window.fetch = async function(input) {
        const url = String(input && input.url ? input.url : input);
        if (url.includes('frankfurter')) {
          return new Response(JSON.stringify({ date: '2026-10-14', rates: { TWD: 31.50, HKD: 7.82 } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new TypeError('network disabled in interaction harness');
      };
    </script>'''
    return html.replace('<head>', '<head>' + harness, 1)


async def wait_for_app(page) -> None:
    await page.wait_for_function('window.Alpine && window.__TWHK_QA__ && window.__TWHK_QA__.passed', timeout=20_000)
    await page.wait_for_timeout(120)


async def app_value(page, expression: str):
    return await page.evaluate(f"Alpine.$data(document.querySelector('[x-data]')).{expression}")


async def set_appearance(page, appearance: str) -> None:
    await page.evaluate("mode => Alpine.$data(document.querySelector('[x-data]')).setAppearance(mode)", appearance)
    await page.wait_for_timeout(80)


async def tap_day(page, day_id: str) -> float:
    chip = page.locator('#chip-' + day_id)
    await chip.evaluate("el => el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })")
    await page.wait_for_timeout(12)
    box = await chip.bounding_box()
    if not box:
        raise AssertionError(f'{day_id} has no tap box')
    started = time.perf_counter()
    await page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    await page.wait_for_function(
        "day => Alpine.$data(document.querySelector('[x-data]')).activeDayId === day",
        arg=day_id,
        timeout=900,
    )
    return (time.perf_counter() - started) * 1000


async def visible_metrics(page) -> dict:
    return await page.evaluate('''() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 &&
          rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      };
      const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"]')]
        .filter(visible);
      const smallTargets = interactive.map(element => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          cls: typeof element.className === 'string' ? element.className : '',
          label: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 70),
          width: rect.width,
          height: rect.height,
        };
      }).filter(item => item.width < 44 || item.height < 44);

      const dock = document.querySelector('.mobile-dock');
      const dockRect = dock?.getBoundingClientRect();
      const navItems = [...document.querySelectorAll('.mobile-dock .mobile-nav-item')].filter(visible);
      const hitFailures = navItems.map(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return button.contains(hit) ? null : { label: button.innerText.trim(), hit: hit?.className || hit?.tagName || null };
      }).filter(Boolean);
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
        smallTargets,
        dock: dockRect ? { left: dockRect.left, right: dockRect.right, width: dockRect.width, height: dockRect.height } : null,
        navCount: navItems.length,
        navRects: navItems.map(button => {
          const rect = button.getBoundingClientRect();
          return { label: button.innerText.trim(), width: rect.width, height: rect.height };
        }),
        hitFailures,
        detachedSearch: Boolean(document.querySelector('.dock-search')),
        chipCount: document.querySelectorAll('.day-chip').length,
        chipMinHeight: Math.min(...[...document.querySelectorAll('.day-chip')].map(el => el.getBoundingClientRect().height)),
      };
    }''')


async def mobile_run(browser, html: str, appearance: str, width: int, height: int, full: bool = False) -> dict:
    context = await browser.new_context(
        viewport={'width': width, 'height': height},
        is_mobile=True,
        has_touch=True,
        device_scale_factor=1,
    )
    page = await context.new_page()
    page.set_default_timeout(3_000)
    page_errors: list[str] = []
    console_errors: list[str] = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    await page.set_content(html, wait_until='load', timeout=30_000)
    await wait_for_app(page)
    await set_appearance(page, appearance)

    metrics = await visible_metrics(page)
    assert metrics['documentWidth'] == metrics['viewportWidth'] == metrics['bodyWidth'], metrics
    assert not metrics['smallTargets'], metrics['smallTargets']
    assert metrics['navCount'] == 5, metrics
    assert not metrics['detachedSearch'], metrics
    assert metrics['dock'] and abs(metrics['dock']['left'] - (width - metrics['dock']['right'])) <= 1.5, metrics['dock']
    assert all(item['width'] >= 44 and item['height'] >= 44 for item in metrics['navRects']), metrics['navRects']
    assert not metrics['hitFailures'], metrics['hitFailures']
    assert metrics['chipCount'] == 16 and metrics['chipMinHeight'] >= 52, metrics
    assert await app_value(page, 'canUseDayViewTransition()') is False

    # A full rapid walk across the rail. The old build reproducibly dropped alternating
    # taps while a prior smooth-scroll/view-transition was still active.
    latencies: list[float] = []
    sequence = range(3, 17) if full else (3, 8, 16)
    for number in sequence:
        latencies.append(await tap_day(page, f'day-{number:02d}'))
        await page.wait_for_timeout(12)
    assert max(latencies) < 700, latencies
    assert await app_value(page, 'activeDayId') == 'day-16'

    if full:
        # One physical tap must cause exactly one reactive day change despite the later
        # synthesized click event.
        await page.evaluate('''() => {
          const app = Alpine.$data(document.querySelector('[x-data]'));
          window.__dayChangeCount = 0;
          app.$watch('activeDayId', () => window.__dayChangeCount++);
        }''')
        await tap_day(page, 'day-10')
        await page.wait_for_timeout(80)
        assert await page.evaluate('window.__dayChangeCount') == 1

        # A horizontal drag beginning on another chip remains a rail scroll, not a selection.
        drag_target = page.locator('#chip-day-11')
        await drag_target.evaluate("el => el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })")
        box = await drag_target.bounding_box()
        assert box
        event = {
            'pointerId': 77, 'pointerType': 'touch', 'isPrimary': True,
            'clientX': box['x'] + box['width'] / 2, 'clientY': box['y'] + box['height'] / 2,
            'buttons': 1,
        }
        await drag_target.dispatch_event('pointerdown', event)
        moved = {**event, 'clientX': event['clientX'] + 72}
        await drag_target.dispatch_event('pointermove', moved)
        await drag_target.dispatch_event('pointerup', {**moved, 'buttons': 0})
        await page.wait_for_timeout(80)
        assert await app_value(page, 'activeDayId') == 'day-10'

        # Keyboard/assistive click fallback still works without pointer events.
        await page.locator('#chip-day-09').focus()
        await page.keyboard.press('Enter')
        await page.wait_for_function(
            "() => Alpine.$data(document.querySelector('[x-data]')).activeDayId === 'day-09'",
            timeout=900,
        )

        # All five dock actions are single-tap controls, with search inside the same bar.
        tab_expectations = [('Today', 'today'), ('Days', 'itinerary'), ('Plan', 'plan'), ('Tools', 'toolkit')]
        for label, expected in tab_expectations:
            await page.locator('.mobile-dock').get_by_role('button', name=label, exact=True).tap()
            await page.wait_for_function(
                "tab => Alpine.$data(document.querySelector('[x-data]')).activeTab === tab",
                arg=expected,
                timeout=900,
            )
        await page.locator('.mobile-search-item').tap()
        await page.wait_for_function("() => Alpine.$data(document.querySelector('[x-data]')).showGlobalSearch === true")
        assert await page.locator('[role="dialog"]').is_visible()
        await page.locator('.global-search-close').tap()
        await page.wait_for_function("() => Alpine.$data(document.querySelector('[x-data]')).showGlobalSearch === false")
        await page.wait_for_timeout(40)
        assert await page.evaluate("document.activeElement?.classList.contains('mobile-search-item')")

    # Capture the primary install screenshots from the fixed phone geometry.
    if width == 390 and height == 844:
        await page.evaluate("() => Alpine.$data(document.querySelector('[x-data]')).switchTab('today', true)")
        await page.wait_for_timeout(80)
        await page.evaluate("() => Alpine.$data(document.querySelector('[x-data]')).selectDayFromStrip('day-02')")
        await page.wait_for_timeout(120)
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })")
        await page.wait_for_timeout(80)
        await page.screenshot(path=str(OUT / f'today-{appearance}.png'))

    filtered_errors = [error for error in page_errors if 'history state object' not in error]
    filtered_console = [error for error in console_errors if 'ERR_INTERNET_DISCONNECTED' not in error]
    await context.close()
    assert not filtered_errors, filtered_errors
    assert not filtered_console, filtered_console
    return {
        'appearance': appearance,
        'viewport': [width, height],
        'maxTapLatencyMs': round(max(latencies), 1),
        'metrics': metrics,
    }


async def landscape_run(browser, html: str) -> dict:
    context = await browser.new_context(viewport={'width': 844, 'height': 390}, is_mobile=True, has_touch=True)
    page = await context.new_page()
    await page.set_content(html, wait_until='load')
    await wait_for_app(page)
    metrics = await visible_metrics(page)
    assert metrics['documentWidth'] == metrics['viewportWidth'] == metrics['bodyWidth'], metrics
    assert metrics['navCount'] == 5 and not metrics['hitFailures'], metrics
    assert await page.locator('.mobile-dock').is_visible()
    assert not await page.locator('.desktop-tabs').is_visible()
    await context.close()
    return {'viewport': [844, 390], 'metrics': metrics}


async def desktop_run(browser, html: str) -> dict:
    context = await browser.new_context(viewport={'width': 1280, 'height': 800}, is_mobile=False, has_touch=False)
    page = await context.new_page()
    await page.set_content(html, wait_until='load')
    await wait_for_app(page)
    assert await page.locator('.desktop-tabs').is_visible()
    assert not await page.locator('.mobile-dock-shell').is_visible()
    can_transition = await app_value(page, 'canUseDayViewTransition()')
    # Rapid mouse selections must converge on the last requested day even if a view
    # transition is in flight.
    await page.locator('#chip-day-03').click()
    await page.locator('#chip-day-04').click()
    await page.wait_for_function(
        "() => Alpine.$data(document.querySelector('[x-data]')).activeDayId === 'day-04'",
        timeout=1200,
    )
    width_metrics = await page.evaluate('''() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth
    })''')
    assert width_metrics['documentWidth'] <= width_metrics['viewportWidth'] and width_metrics['bodyWidth'] <= width_metrics['viewportWidth']
    await context.close()
    return {'viewport': [1280, 800], 'viewTransitionAvailable': can_transition, 'metrics': width_metrics}


async def main() -> None:
    executable = shutil.which('chromium') or shutil.which('google-chrome')
    if not executable:
        raise SystemExit('Chromium is required for interaction tests.')
    html = inline_document()
    results: dict[str, object] = {'mobile': [], 'landscape': None, 'desktop': None}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=executable,
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        runs = [('dark', width, height, width == 390) for width, height in MOBILE_VIEWPORTS]
        runs.append(('light', 390, 844, True))
        for appearance, width, height, full in runs:
            print(f'[interaction] {appearance} {width}x{height} full={full}', flush=True)
            results['mobile'].append(await mobile_run(browser, html, appearance, width, height, full))
        print('[interaction] landscape 844x390', flush=True)
        results['landscape'] = await landscape_run(browser, html)
        results['desktop'] = await desktop_run(browser, html)
        await browser.close()

    (OUT / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps({
        'mobileRuns': len(results['mobile']),
        'maxTapLatencyMs': max(item['maxTapLatencyMs'] for item in results['mobile']),
        'landscape': 'passed',
        'desktop': 'passed',
    }, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
