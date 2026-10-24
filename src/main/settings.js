'use strict';

// Persistent settings, keyed like the org.gnome.gnome-system-monitor schema.

const fs = require('fs');
const path = require('path');

const DEFAULT_CPU_COLORS = [
  '#e01b24', '#ff7800', '#f6d32d', '#33d17a', '#26a269', '#62a0ea', '#1c71d8', '#613583',
  '#9141ac', '#c061cb', '#ffbe6f', '#f9f06b', '#8ff0a4', '#2ec27e', '#1a5fb4', '#c061cb'
];

const DEFAULTS = {
  'window-width': 700,
  'window-height': 500,
  'maximized': false,
  'start-at-login': false,
  'graph-update-interval': 100,
  'graph-data-points': 60,
  'cpu-smooth-graph': true,
  'cpu-stacked-area-chart': false,
  'logarithmic-scale': false,
  'resources-memory-in-iec': false,
  'network-in-bits': false,
  'network-total-in-bits': false,
  'cpu-colors': DEFAULT_CPU_COLORS,
  'mem-color': '#e01b24',
  'swap-color': '#33d17a',
  'net-in-color': '#3584e4',
  'net-out-color': '#e66100',
  'disk-read-color': '#3584e4',
  'disk-write-color': '#e66100'
};

const RANGES = {
  'graph-update-interval': [50, 10000],
  'graph-data-points': [30, 600]
};

function hsvToRgb(h, s, v) {
  const c = v * s;
  const hp = h * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = v - c;
  const table = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = table[Math.min(5, Math.floor(hp))];
  return [r + m, g + m, b + m];
}

// procman::generate_colors: random start hue, golden-ratio hue steps, S=0.5, V=0.95,
// stored as 16-bit-per-channel "#rrrrggggbbbb" strings.
function generateColors(count) {
  const colors = [];
  let h = Math.random();
  for (let i = 0; i < count; i++) {
    const rgb = hsvToRgb(h, 0.5, 0.95);
    colors.push('#' + rgb.map((c) => Math.trunc(c * 65535).toString(16).padStart(4, '0')).join(''));
    h += 0.6180339887498949;
    if (h >= 1.0)
      h -= 1.0;
  }
  return colors;
}

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      // first run or unreadable file: keep defaults
    }
  }

  ensureCpuColors(count) {
    const colors = this.values['cpu-colors'];
    if (colors.length < count)
      this.set('cpu-colors', colors.concat(generateColors(count - colors.length)));
  }

  get(key) {
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  set(key, value) {
    if (!(key in DEFAULTS))
      return false;
    if (RANGES[key])
      value = Math.min(RANGES[key][1], Math.max(RANGES[key][0], Math.round(value)));
    this.values[key] = value;
    this.save();
    return true;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    } catch (err) {
      console.error('Could not save settings:', err.message);
    }
  }
}

module.exports = { Settings };
