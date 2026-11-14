#!/usr/bin/env python3
"""Validate + optimise token-radar-01 screenshots.

Rules (gate): 3-4 images, each <=512 KiB, PNG or JPEG, long side <=1440,
short side >=800. Target: 1440x900, 150-350 KiB each.
- PNG over 512 KiB is re-encoded to JPEG quality 82 (same stem, .jpg).
- A shot is 'blank' if the greyscale stddev of a downscaled copy is < 5.
Usage: python3 validate-shots.py <shots_dir>
"""
import os
import statistics
import sys

from PIL import Image

MAX_BYTES = 512 * 1024
EXPECTED = {'1-board', '2-detail', '3-filtered'}


def stats(path):
    im = Image.open(path)
    im.load()
    small = im.convert('L').resize((72, 45))
    px = list(small.getdata())
    return im, statistics.mean(px), statistics.pstdev(px)


def main():
    d = sys.argv[1]
    files = sorted(f for f in os.listdir(d) if f.rsplit('.', 1)[0] in EXPECTED)
    stems = {f.rsplit('.', 1)[0] for f in files}
    missing = EXPECTED - stems
    ok = True
    print(f'shots dir: {d}')
    for f in files:
        p = os.path.join(d, f)
        size = os.path.getsize(p)
        try:
            im, mean, sd = stats(p)
        except Exception as e:  # noqa: BLE001
            print(f'  {f}: CORRUPT ({e})')
            ok = False
            continue
        note = ''
        if size > MAX_BYTES and im.format == 'PNG':
            jpg = os.path.splitext(p)[0] + '.jpg'
            im.convert('RGB').save(jpg, 'JPEG', quality=82, optimize=True)
            new_size = os.path.getsize(jpg)
            if new_size <= MAX_BYTES:
                os.remove(p)
                note = f' -> re-encoded JPEG q82: {new_size} B (PNG {size} B removed)'
                size, p, f = new_size, jpg, os.path.basename(jpg)
                im = Image.open(p)
            else:
                print(f'  {f}: STILL {new_size} B after JPEG q82 — needs manual fix')
                ok = False
        long_side = max(im.size)
        short_side = min(im.size)
        checks = []
        if size > MAX_BYTES:
            checks.append(f'SIZE {size} B > 512 KiB')
        if long_side > 1440:
            checks.append(f'long side {long_side} > 1440')
        if short_side < 800:
            checks.append(f'short side {short_side} < 800')
        if sd < 5:
            checks.append(f'BLANK? stdev {sd:.1f}')
        if checks:
            ok = False
        print(f"  {f}: {im.format} {im.size[0]}x{im.size[1]} {size} B "
              f"({size/1024:.0f} KiB) mean={mean:.1f} stdev={sd:.1f}"
              f"{note}{' *** ' + '; '.join(checks) if checks else ' OK'}")
    if missing:
        print(f'  MISSING: {sorted(missing)}')
        ok = False
    print('RESULT:', 'PASS' if ok and not missing else 'FAIL')
    return 0 if ok and not missing else 1


if __name__ == '__main__':
    raise SystemExit(main())
