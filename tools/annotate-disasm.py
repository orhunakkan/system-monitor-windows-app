#!/usr/bin/env python3
"""Annotate an objdump listing of /usr/bin/gnome-system-monitor with the
values behind RIP-relative loads, to read constants straight from the binary.

  objdump -d --no-show-raw-insn -M intel /usr/bin/gnome-system-monitor > gsm.asm
  python3 tools/annotate-disasm.py /usr/bin/gnome-system-monitor gsm.asm 30a70 31396

Prints instructions in [start, end) with ; dbl= / flt= / str= annotations.
Assumes .rodata's file offset equals its virtual address (true for the 46.0
Ubuntu/Mint build: .rodata at 0x52000); check with objdump -h for other builds.
See docs/reverse-engineering.md for the functions worth reading.
"""
import re
import struct
import sys

RODATA = (0x52000, 0x56600)

binary, listing, lo, hi = sys.argv[1], sys.argv[2], int(sys.argv[3], 16), int(sys.argv[4], 16)
data = open(binary, 'rb').read()
for line in open(listing):
    m = re.match(r'\s+([0-9a-f]+):\t(.*)', line)
    if not m:
        continue
    addr = int(m.group(1), 16)
    if not lo <= addr < hi:
        continue
    ins = m.group(2).rstrip()
    note = ''
    target = re.search(r'# ([0-9a-f]+)', ins)
    if target:
        ta = int(target.group(1), 16)
        mnemonic = ins.split()[0]
        if 'QWORD' in ins or ('xmm' in ins and mnemonic.endswith('sd')):
            note = ' ; dbl=%r' % struct.unpack('<d', data[ta:ta + 8])[0]
        elif 'DWORD' in ins or mnemonic.endswith('ss'):
            note = ' ; flt=%r' % struct.unpack('<f', data[ta:ta + 4])[0]
        if RODATA[0] <= ta < RODATA[1] and (not note or mnemonic == 'lea'):
            note += ' ; str=%r' % data[ta:ta + 60].split(b'\0')[0]
    print('%x: %s%s' % (addr, ins, note))
