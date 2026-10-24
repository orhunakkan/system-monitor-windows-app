'use strict';

// Port of gnome-system-monitor 46 LoadGraph / GsmGraph rendering.
// Constants come from the shipped binary: 4px frame, 18px indent,
// right margin = 6 * font size, labels at 0.8 * font size, 10 frames per data point.

const FRAME_WIDTH = 4;
const INDENT = 18;
const FRAMES_PER_UNIT = 10;
const FONT_SIZE = 8.0;            // 8.0 * text-scaling-factor
const RMARGIN = 6 * FONT_SIZE;
const LABEL_PX = 0.8 * FONT_SIZE * 96 / 72;
const ASCENT = 0.932;             // Ubuntu hhea metrics, per em
const LINE_HEIGHT = 1.121;
const GRID_ALPHA = 0.7;
const WINDOW_BG = '#222226';
const VIEW_BG = '#2e2e33';
const FG = '#ffffff';

const GraphType = { CPU: 0, MEM: 1, NET: 2, DISK: 3 };

function nicenum(x) {
  const expv = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, expv);
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, expv);
}

class LoadGraph {
  constructor(type, canvas, nSeries, opts) {
    this.type = type;
    this.canvas = canvas;
    this.nSeries = nSeries;
    this.opts = opts;               // { config(), colors() }
    this.renderCounter = 0;
    this.max = 1024;
    this.background = null;
    this.resize(opts.config()['graph-data-points'] + 2);
    new ResizeObserver(() => this.clearBackground()).observe(canvas);
  }

  get config() {
    return this.opts.config();
  }

  resize(numPoints) {
    const oldData = this.data || [];
    const oldValues = this.values || [];
    this.numPoints = numPoints;
    this.data = Array.from({ length: numPoints }, (_, i) => oldData[i] || new Float64Array(this.nSeries).fill(-1));
    this.values = Array.from({ length: numPoints }, (_, i) => oldValues[i] || 0);
    this.clearBackground();
  }

  queueDraw() {
    if (this.drawQueued)
      return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  pushRow(row) {
    this.data.pop();
    this.data.unshift(Float64Array.from(row));
  }

  clearBackground() {
    this.background = null;
    this.queueDraw();
  }

  isLog() {
    return this.type === GraphType.MEM && this.config['logarithmic-scale'];
  }

  numBars(height) {
    const n = Math.trunc(height / (FONT_SIZE + 14));
    const log = this.isLog();
    if (n === 0 || n === 1)
      return 1;
    if (n === 2 || n === 3)
      return 2;
    if (n === 4)
      return 4;
    if (n === 5)
      return log ? 4 : 5;
    return log ? 6 : 5;
  }

  logPartial(v) {
    if (this.isLog() && v !== 0)
      return Math.log10(v * 100) * 0.5;
    return v;
  }

  caption(i) {
    const n = this.bars;
    if (this.type === GraphType.NET || this.type === GraphType.DISK) {
      const value = this.max - i * this.max / n;
      return Format.formatRate(value, this.type === GraphType.NET && this.config['network-in-bits']);
    }
    let v = 100 - i * 100 / n;
    if (this.isLog() && v !== 0)
      v = Math.pow(100, v / 100);
    return `${v.toFixed(0)} %`;
  }

  // net_scale(): keep the axis maximum a round number with a little headroom.
  rescale(dmax) {
    this.values.pop();
    this.values.unshift(dmax);
    let newMax = dmax >= this.max ? dmax : Math.max(...this.values.slice(0, this.numPoints - 1));
    const bak = newMax;
    if (this.type === GraphType.NET && this.config['network-in-bits']) {
      const ticks = this.bars || 5;
      let bitMax = Math.max(newMax * 8, 10000);
      const d = nicenum(bitMax / ticks);
      bitMax = ticks * d;
      newMax = bitMax / 8;
    } else {
      newMax = Math.max(Math.floor(1.1 * newMax), 1024);
      const pow2 = Math.floor(Math.log2(newMax));
      const base10 = Math.floor(pow2 / 10);
      const unit = Math.pow(2, base10 * 10);
      let coef10 = Math.ceil(newMax / unit);
      const factor10 = Math.pow(10, Math.floor(Math.log10(coef10)));
      coef10 = Math.ceil(coef10 / factor10) * factor10;
      const bars = this.bars || 5;
      if (coef10 % bars !== 0)
        coef10 += bars - (coef10 % bars);
      newMax = coef10 * unit;
    }
    if (bak > newMax)
      newMax = bak;
    if (0.8 * this.max < newMax && newMax <= this.max)
      return;
    const scale = this.max / newMax;
    for (const row of this.data) {
      if (row[0] >= 0) {
        for (let j = 0; j < row.length; j++)
          row[j] *= scale;
      }
    }
    this.max = newMax;
    this.clearBackground();
  }

  geometry(width, height) {
    const bars = this.numBars(height);
    const dely = Math.trunc((height - 23) / bars);
    return { bars, dely, realHeight: dely * bars, drawWidth: width - 2 * FRAME_WIDTH };
  }

  // draw_background(): rendered into an image surface at logical size, then
  // painted onto the (possibly HiDPI) widget, exactly like the original.
  renderBackground(width, height) {
    const g = this.geometry(width, height);
    this.bars = g.bars;
    const labelBars = this.numBars(height - 8);
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    const cr = surface.getContext('2d');
    const font = `${LABEL_PX}px Ubuntu`;
    cr.font = font;
    const textHeight = LINE_HEIGHT * LABEL_PX;
    const showText = (text, x, y) => cr.fillText(text, x, y + ASCENT * LABEL_PX);

    cr.translate(FRAME_WIDTH, FRAME_WIDTH);
    const right = g.drawWidth - RMARGIN;
    const grad = cr.createLinearGradient(0, 0, 0, g.realHeight);
    grad.addColorStop(0, WINDOW_BG);
    grad.addColorStop(1, VIEW_BG);
    cr.fillStyle = grad;
    cr.fillRect(INDENT, 0, right - INDENT, g.realHeight);

    cr.fillStyle = FG;
    cr.beginPath();
    for (let i = 0; i <= labelBars; i++) {
      let y;
      let lift;
      if (i === 0) {
        y = 0.5 * FONT_SIZE + 0.5;
        lift = 0.5;
      } else if (i === labelBars) {
        y = i * g.dely + 0.5;
        lift = 1.0;
      } else {
        y = i * g.dely + 0.5 * FONT_SIZE;
        lift = 0.85;
      }
      showText(this.caption(i), width - 31 - INDENT, y - lift * textHeight);
      cr.moveTo(INDENT, i * g.dely);
      cr.lineTo(right + 4, i * g.dely);
    }

    const totalSeconds = Math.trunc((this.numPoints - 2) * this.config['graph-update-interval'] / 1000) * FRAMES_PER_UNIT;
    for (let i = 0; i < 7; i++) {
      const x = Math.ceil(i * (right - INDENT) / 6) + INDENT;
      const seconds = totalSeconds - Math.trunc(i * totalSeconds / 6);
      const caption = Format.formatTimeCaption(seconds);
      const anchor = i === 0 ? 0 : i === 6 ? 1.0 : 0.5;
      const w = cr.measureText(caption).width;
      showText(caption, 1.0 + x - anchor * w, height - 8 - textHeight);
      cr.moveTo(x, 0);
      cr.lineTo(x, g.realHeight + 4);
    }
    cr.lineWidth = 0.25;
    cr.strokeStyle = `rgba(255, 255, 255, ${GRID_ALPHA})`;
    cr.stroke();
    return surface;
  }

  draw() {
    const width = Math.floor(this.canvas.clientWidth);
    const height = Math.floor(this.canvas.clientHeight);
    if (width <= 0 || height <= 0)
      return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.background = null;
    }
    if (!this.background || this.background.width !== width || this.background.height !== height)
      this.background = this.renderBackground(width, height);

    const cr = this.canvas.getContext('2d');
    cr.setTransform(dpr, 0, 0, dpr, 0, 0);
    cr.clearRect(0, 0, width, height);
    cr.imageSmoothingEnabled = true;
    cr.drawImage(this.background, 0, 0, width, height);

    const g = this.geometry(width, height);
    const right = g.drawWidth - RMARGIN;
    const delx = (right - INDENT) / (this.numPoints - 2);
    const x0 = (1.0 - this.renderCounter / FRAMES_PER_UNIT) * delx + right + 4;
    const yOf = (v) => (1.0 - v) * g.realHeight + 4;
    const smooth = this.config['cpu-smooth-graph'];
    const stacked = this.type === GraphType.CPU && this.config['cpu-stacked-area-chart'];
    const colors = this.opts.colors();

    cr.save();
    cr.lineWidth = 1.0;
    cr.lineCap = 'round';
    cr.lineJoin = 'round';
    cr.beginPath();
    cr.rect(INDENT + 4, 4.0, right - INDENT, g.realHeight);
    cr.clip();
    for (let j = this.nSeries - 1; j >= 0; j--) {
      cr.beginPath();
      let px = x0;
      cr.moveTo(x0, yOf(this.data[0][j]));
      for (let i = 1; i < this.numPoints; i++) {
        const v = this.data[i][j];
        if (v === -1.0)
          continue;
        const x = x0 - i * delx;
        const y = yOf(v);
        if (smooth) {
          const cx = x0 - (i - 0.5) * delx;
          cr.bezierCurveTo(cx, yOf(this.data[i - 1][j]), cx, y, x, y);
        } else {
          cr.lineTo(x, y);
        }
        px = x;
      }
      if (stacked) {
        cr.fillStyle = colors[j];
        cr.lineTo(px, g.realHeight + 4 + 4);
        cr.lineTo(x0, g.realHeight + 4 + 4);
        cr.closePath();
        cr.fill();
      } else {
        cr.strokeStyle = colors[j];
        cr.stroke();
      }
    }
    cr.restore();
  }
}

window.LoadGraph = LoadGraph;
window.GraphType = GraphType;
