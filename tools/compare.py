#!/usr/bin/env python3
"""Compare a capture of the port against the GNOME System Monitor reference.

Usage: python3 tools/compare.py candidate.png [--ref reference.png] [--out dir]

Both images must be full-resolution captures of a maximized window at the
same size (the reference is 2880x1720, i.e. 1440x860 logical at scale 2).
Prints, in logical pixels:
  - horizontal gridline rows per graph (dely should be 17 at the reference size)
  - text rows in the left column (section titles, legend and info lines)
  - CPU swatch rows
  - colours at fixed sample points
and writes side-by-side crops (cmp_*.png) to outdir for visual review.
Values that differ only in live data (CPU %, memory) are expected to differ.
"""
import argparse
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REF = os.path.join(HERE, '..', 'docs', 'reference', 'gsm-resources@2x.png')
BG = (0x2e, 0x2e, 0x33)
SCALE = 2

GRAPHS = {'cpu': (150, 360), 'mem': (600, 810), 'net': (990, 1200), 'disk': (1350, 1560)}
SAMPLES = {
    'cpu1 swatch': (120, 404), 'background': (40, 500), 'graph top': (700, 170),
    'rx arrow': (186, 1250), 'close button': (2842, 30), 'tab pill': (1330, 30),
}
CROPS = {
    'cpu_ylabels': (2560, 150, 2880, 400), 'mem_ylabels': (2560, 600, 2880, 840),
    'net_ylabels': (2560, 990, 2880, 1240), 'cpu_legend': (0, 330, 700, 560),
    'mem_row': (100, 820, 1000, 960), 'net_row': (100, 1200, 1000, 1320), 'header': (1080, 0, 2880, 90),
}


def gridlines(im, y0, y1, x=1100):
    # A gridline is a local maximum well above the gradient around it; comparing
    # with the +/-6 row minimum tolerates Chromium's +/-1 gradient dithering.
    lum = [sum(im.getpixel((x, y))) for y in range(y0, y1)]
    rows = []
    for i in range(6, len(lum) - 6):
        window = lum[i - 6:i + 7]
        if lum[i] == max(window) and lum[i] > min(window) + 15 and (not rows or i - rows[-1] > 4):
            rows.append(i)
    return [(y0 + i) / SCALE for i in rows]


def text_rows(im, x0=90, x1=300):
    rows = [y for y in range(90, im.height) if any(min(im.getpixel((x, y))) > 200 for x in range(x0, x1))]
    groups = []
    for y in rows:
        if groups and y - groups[-1][1] <= 2:
            groups[-1][1] = y
        else:
            groups.append([y, y])
    return [(a / SCALE, b / SCALE) for a, b in groups]


def runs(im, x, y0, y1):
    out, start = [], None
    for y in range(y0, y1):
        hit = im.getpixel((x, y)) != BG
        if hit and start is None:
            start = y
        elif not hit and start is not None:
            out.append((start / SCALE, (y - 1) / SCALE))
            start = None
    return out


def report(name, im):
    print(f'== {name} ({im.width}x{im.height})')
    for g, (y0, y1) in GRAPHS.items():
        print(f'  {g:5} gridlines {gridlines(im, y0, y1)}')
    print(f'  text rows {text_rows(im)}')
    print(f'  swatch rows {runs(im, 120, 380, 560)[:6]}')
    print('  colours ' + ', '.join(f'{k} #%02x%02x%02x' % im.getpixel(p) for k, p in SAMPLES.items()))


def main():
    parser = argparse.ArgumentParser(description='Compare a port capture with the GSM reference.')
    parser.add_argument('candidate')
    parser.add_argument('--ref', default=DEFAULT_REF)
    parser.add_argument('--out', default='.')
    args = parser.parse_args()
    ref_path, cand_path, outdir = args.ref, args.candidate, args.out
    ref = Image.open(ref_path).convert('RGB')
    cand = Image.open(cand_path).convert('RGB')
    if ref.size != cand.size:
        print(f'warning: sizes differ {ref.size} vs {cand.size}; compare at the same window size')
    report('reference', ref)
    report('candidate', cand)
    os.makedirs(outdir, exist_ok=True)
    for name, box in CROPS.items():
        w, h = box[2] - box[0], box[3] - box[1]
        pair = Image.new('RGB', (w * 2 + 10, h), (255, 0, 255))
        pair.paste(ref.crop(box), (0, 0))
        pair.paste(cand.crop(box), (w + 10, 0))
        pair.save(os.path.join(outdir, f'cmp_{name}.png'))
    print(f'side-by-side crops (reference left, candidate right) written to {outdir}/cmp_*.png')


if __name__ == '__main__':
    main()
