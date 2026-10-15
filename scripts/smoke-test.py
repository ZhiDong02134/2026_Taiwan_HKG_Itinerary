#!/usr/bin/env python3
"""Optional browser smoke test.

Start a local server from the repository root first:
    python3 -m http.server 8000
Then run:
    BASE_URL=http://127.0.0.1:8000/ python3 scripts/smoke-test.py

Requires Playwright for Python and a Chromium installation.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = os.environ.get('BASE_URL', 'http://127.0.0.1:8000/').rstrip('/') + '/'
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'playwright'
OUT.mkdir(parents=True, exist_ok=True)
VIEWPORTS = [(320, 700), (375, 812), (390, 844), (430, 932)]

async def one(browser, appearance: str, width: int, height: int):
    context = await browser.new_context(
        viewport={'width': width, 'height': height},
        is_mobile=True,
        has_touch=True,
        device_scale_factor=1,
    )
    page = await context.new_page()
    page_errors: list[str] = []
    console_errors: list[str] = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text)
            if message.type == 'error' and 'frankfurter' not in message.text.lower() else None)
    await page.add_init_script(
        f"localStorage.setItem('twhk_appearance_v1', JSON.stringify('{appearance}'));"
    )
    response = await page.goto(BASE_URL + '?tab=today', wait_until='networkidle', timeout=30_000)
    await page.wait_for_function('window.Alpine && window.__TWHK_QA__', timeout=20_000)
    await page.wait_for_timeout(400)
    metrics = await page.evaluate('''() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 &&
          rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      };
      const interactive = [...document.querySelectorAll(
        'button,a,input,select,textarea,[role="button"],[role="tab"]'
      )].filter(visible);
      const smallTargets = interactive.map(element => {
        const rect = element.getBoundingClientRect();
        return {
          element: element.tagName,
          className: element.className || '',
          label: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 60),
          width: rect.width,
          height: rect.height,
        };
      }).filter(target => target.width < 44 || target.height < 44);
      return {
        qa: window.__TWHK_QA__,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
        smallTargets,
      };
    }''')
    if width == 390:
        await page.screenshot(path=str(OUT / f'{appearance}-today-390x844.png'))
    await context.close()
    return {
        'appearance': appearance,
        'width': width,
        'height': height,
        'status': response.status if response else None,
        'metrics': metrics,
        'pageErrors': page_errors,
        'consoleErrors': console_errors,
    }

async def main():
    executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=executable,
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        results = [
            await one(browser, appearance, width, height)
            for appearance in ('dark', 'light')
            for width, height in VIEWPORTS
        ]
        await browser.close()

    (OUT / 'results.json').write_text(json.dumps(results, indent=2))
    failures = []
    for result in results:
        metrics = result['metrics']
        if (
            result['status'] != 200 or
            not metrics['qa'].get('passed') or
            metrics['documentWidth'] != metrics['viewportWidth'] or
            metrics['bodyWidth'] != metrics['viewportWidth'] or
            metrics['smallTargets'] or
            result['pageErrors'] or
            result['consoleErrors']
        ):
            failures.append(result)

    print(json.dumps({'runs': len(results), 'failures': failures}, indent=2))
    raise SystemExit(1 if failures else 0)

if __name__ == '__main__':
    asyncio.run(main())
