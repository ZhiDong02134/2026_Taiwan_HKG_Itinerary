#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
import struct
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
issues: list[str] = []
checks = 0

def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        issues.append(message)

class AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[str] = []
        self.tags: list[str] = []
    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        values = dict(attrs)
        if values.get('id'): self.ids.append(values['id'])
        for key in ('src', 'href'):
            if values.get(key): self.refs.append(values[key])

html_path = ROOT / 'index.html'
html = html_path.read_text()
parser = AuditParser(); parser.feed(html)
check('<details' not in html.lower() and '<summary' not in html.lower(), 'Accordion markup found.')
check(len(parser.ids) == len(set(parser.ids)), 'Duplicate HTML IDs found.')
check('viewport-fit=cover' in html, 'Safe-area viewport-fit=cover is missing.')
check('./manifest.webmanifest' in parser.refs, 'Manifest link is missing.')
check('./sw.js' in (ROOT / 'assets' / 'runtime.js').read_text(), 'Service worker registration is missing.')

for ref in parser.refs:
    parsed = urlparse(ref)
    if parsed.scheme or ref.startswith(('#', 'data:', 'mailto:', 'tel:', 'javascript:')):
        continue
    clean = parsed.path
    if not clean or clean == '.':
        continue
    check((ROOT / clean.lstrip('./')).exists(), f'Missing local HTML reference: {ref}')

manifest = json.loads((ROOT / 'manifest.webmanifest').read_text())
check(manifest.get('start_url', '').startswith('./'), 'Manifest start_url is not project-path safe.')
check(manifest.get('scope') == './', 'Manifest scope should be ./ for GitHub project Pages.')
check(manifest.get('display') == 'standalone', 'Manifest display should be standalone.')
check(len(manifest.get('icons', [])) >= 4, 'Manifest icon inventory is incomplete.')
check(len(manifest.get('screenshots', [])) >= 2, 'Manifest screenshots are missing.')

def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError(f'Not a PNG: {path}')
    return struct.unpack('>II', data[16:24])

for entry in manifest.get('icons', []) + manifest.get('screenshots', []):
    src = entry['src'].lstrip('./')
    path = ROOT / src
    check(path.is_file(), f'Manifest file missing: {src}')
    if path.suffix.lower() == '.png' and path.is_file():
        expected = tuple(map(int, entry['sizes'].split('x')))
        check(png_size(path) == expected, f'Wrong PNG dimensions for {src}: {png_size(path)} != {expected}')

css = (ROOT / 'assets' / 'app.css').read_text()
for match in re.finditer(r'url\((?:["\']?)([^)"\']+)', css):
    ref = match.group(1).strip()
    if ref.startswith(('data:', 'http:', 'https:', '#')):
        continue
    target = (ROOT / 'assets' / ref).resolve() if not ref.startswith('/') else ROOT / ref.lstrip('/')
    check(target.exists(), f'Missing CSS asset: {ref}')

for name in ('assets/app.js', 'assets/runtime.js', 'assets/vendor/lucide.js', 'assets/vendor/alpine.js', 'sw.js'):
    check((ROOT / name).is_file(), f'Missing JavaScript asset: {name}')

node = shutil.which('node')
if node:
    for name in ('assets/app.js', 'assets/runtime.js', 'sw.js'):
        result = subprocess.run([node, '--check', str(ROOT / name)], capture_output=True, text=True)
        check(result.returncode == 0, f'JavaScript syntax error in {name}: {result.stderr.strip()}')

sw = (ROOT / 'sw.js').read_text()
check("twhk-field-bootstrap" not in sw, 'Service worker still uses the bootstrap cache name.')
check('navigationPreload.enable()' in sw, 'Navigation preload is not enabled.')
check("'twhk-2026-'" in sw, 'Legacy cache namespace cleanup is missing.')
check('networkFirstNavigation' in sw and 'staleWhileRevalidate' in sw, 'Expected cache strategies are missing.')

if issues:
    print(f'{checks - len(issues)}/{checks} static checks passed.')
    for issue in issues: print(f'ERROR: {issue}')
    sys.exit(1)
print(f'{checks}/{checks} static checks passed.')
