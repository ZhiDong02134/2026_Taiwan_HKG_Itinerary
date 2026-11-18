"""Square thumbnails of every hero photo for the Days list (and as a calm placeholder under the hero).
usage: python3 scripts/make-thumbs.py [assets-dir] [out-dir]   (defaults: assets, assets/thumbs)"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

FOCUS = {  # (x, y) of the subject, 0..1, so a square crop keeps what the photo is about
    'taipei-photo': (0.10, 0.5), 'kaohsiung-photo': (0.45, 0.5), 'hk-photo': (0.5, 0.5),
    'day-01-photo': (0.5, 0.5), 'day-03-photo': (0.5, 0.5), 'day-04-photo': (0.5, 0.55), 'day-05-photo': (0.5, 0.5),
    'day-07-photo': (0.5, 0.5), 'day-08-photo': (0.5, 0.5), 'day-09-photo': (0.5, 0.5), 'day-12-photo': (0.5, 0.5),
    'day-13-photo': (0.5, 0.5), 'day-14-photo': (0.5, 0.5), 'day-15-photo': (0.55, 0.5),
}
ROOT = Path(__file__).resolve().parents[1]
src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets'
out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'assets' / 'thumbs'
out.mkdir(parents=True, exist_ok=True)
total = 0
for p in sorted(src.glob('*-photo.webp')):
    im = Image.open(p).convert('RGB')
    th = ImageOps.fit(im, (192, 192), Image.LANCZOS, centering=FOCUS.get(p.stem, (0.5, 0.5)))
    dest = out / f'{p.stem}.webp'
    th.save(dest, 'WEBP', quality=76, method=6)
    total += dest.stat().st_size
    print(dest.name, dest.stat().st_size)
print('total', total)
