"""Dominant hue / chroma / lightness of every hero photo, in OKLab (chroma²-weighted hue histogram:
a plain a/b mean muddies mixed scenes into lavender). Prints JSON. usage: python3 scripts/photo-tints.py [assets-dir]   (default: assets)"""
import json, sys, math
from pathlib import Path
import numpy as np
from PIL import Image

def srgb_to_oklab(rgb):
    c = rgb / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = np.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = np.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = np.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, a, bb

def analyse(path):
    im = Image.open(path).convert('RGB')
    im.thumbnail((64, 64), Image.LANCZOS)
    arr = np.asarray(im, dtype=np.float64).reshape(-1, 3)
    L, a, b = srgb_to_oklab(arr)
    C = np.hypot(a, b)
    H = (np.degrees(np.arctan2(b, a)) + 360) % 360
    keep = (L > 0.15) & (L < 0.95) & (C > 0.015)
    if keep.sum() < 20:
        return dict(h=190, c=0.03, l=float(L.mean()), n=int(keep.sum()))
    w = C[keep] ** 2
    hist, _ = np.histogram(H[keep], bins=72, range=(0, 360), weights=w)
    # circular smoothing over ±15°
    k = np.array([1, 2, 3, 2, 1], dtype=float); k /= k.sum()
    sm = np.convolve(np.r_[hist[-2:], hist, hist[:2]], k, mode='valid')
    peak = (np.argmax(sm) + 0.5) * 5.0
    near = keep & (np.abs(((H - peak + 180) % 360) - 180) < 25)
    c_near = float(np.average(C[near], weights=C[near])) if near.sum() else float(C[keep].mean())
    return dict(h=round(peak, 1), c=round(c_near, 3), l=round(float(L[keep].mean()), 3), n=int(keep.sum()),
                share=round(float(w[near[keep]].sum() / w.sum()), 2))

if __name__ == '__main__':
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'assets'
    out = {}
    for p in sorted(root.glob('*-photo.webp')):
        out[p.stem] = analyse(p)
    print(json.dumps(out, indent=1))
