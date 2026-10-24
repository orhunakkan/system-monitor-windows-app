#!/usr/bin/env python3
"""Convert a 32-bit ZPixmap xwd dump (xwd -id <win> -silent) to PNG. Needs Pillow.

Usage: python3 tools/xwd2png.py in.xwd out.png
"""
import struct
import sys

from PIL import Image

data = open(sys.argv[1], 'rb').read()
header = struct.unpack('>25I', data[:100])
header_size, width, height = header[0], header[4], header[5]
bytes_per_line, ncolors = header[12], header[19]
offset = header_size + ncolors * 12
img = Image.frombuffer('RGBX', (width, height), data[offset:offset + bytes_per_line * height],
                       'raw', 'BGRX', bytes_per_line, 1).convert('RGB')
img.save(sys.argv[2])
print(f'{width}x{height} -> {sys.argv[2]}')
