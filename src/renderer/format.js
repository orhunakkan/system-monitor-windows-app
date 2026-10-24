'use strict';

// Port of glib's g_format_size_full() and gnome-system-monitor's procman::format_* helpers.

const FORMAT_IEC = 2;
const FORMAT_BITS = 4;

const UNITS = {
  0: { base: 1000, names: ['kB', 'MB', 'GB', 'TB', 'PB', 'EB'] },
  [FORMAT_IEC]: { base: 1024, names: ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'] },
  [FORMAT_BITS]: { base: 1000, names: ['kb', 'Mb', 'Gb', 'Tb', 'Pb', 'Eb'] },
  [FORMAT_BITS | FORMAT_IEC]: { base: 1024, names: ['Kib', 'Mib', 'Gib', 'Tib', 'Pib', 'Eib'] }
};

function formatSizeFull(size, flags) {
  size = Math.max(0, Math.floor(size));
  const { base, names } = UNITS[flags & (FORMAT_IEC | FORMAT_BITS)];
  if (size < base) {
    if (flags & FORMAT_BITS)
      return size === 1 ? '1 bit' : `${size} bits`;
    return size === 1 ? '1 byte' : `${size} bytes`;
  }
  let factor = base;
  let i = 0;
  while (i < names.length - 1 && size >= factor * base) {
    factor *= base;
    i++;
  }
  return `${(size / factor).toFixed(1)} ${names[i]}`;
}

// procman::format_size: bytes are IEC, bits are SI.
function formatSize(size, wantBits) {
  return wantBits ? formatSizeFull(size * 8, FORMAT_BITS) : formatSizeFull(size, FORMAT_IEC);
}

function formatRate(rate, wantBits) {
  return `${formatSize(rate, wantBits)}/s`;
}

// Memory and swap use plain g_format_size_full with IEC only when configured.
function formatMemory(size, iec) {
  return formatSizeFull(size, iec ? FORMAT_IEC : 0);
}

function formatTimeCaption(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (hrs)
    parts.push(hrs === 1 ? '1 hr' : `${hrs} hrs`);
  if (mins)
    parts.push(mins === 1 ? '1 min' : `${mins} mins`);
  if (secs)
    parts.push(secs === 1 ? '1 sec' : `${secs} secs`);
  return parts.join(' ');
}

window.Format = { formatSizeFull, formatSize, formatRate, formatMemory, formatTimeCaption };
