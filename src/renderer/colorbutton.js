'use strict';

// Port of gnome-system-monitor's legacy GsmColorButton drawing.

const ButtonType = { CPU: 0, PIE: 1, NETWORK_IN: 2, NETWORK_OUT: 3, DISK_READ: 4, DISK_WRITE: 5 };

const arrowImages = (() => {
  const load = (name) => {
    const img = new Image();
    img.src = `../../assets/pixmaps/${name}.svg`;
    return img;
  };
  return { mask: load('arrow_mask'), overlay: load('arrow_overlay') };
})();

function parseColor(hex) {
  const h = hex.replace('#', '');
  const step = h.length / 3;
  const max = Math.pow(16, step) - 1;
  return [0, 1, 2].map((i) => parseInt(h.substr(i * step, step), 16) / max);
}

function cssColor([r, g, b], a = 1) {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

class ColorButton {
  constructor(type, color, title, onPick) {
    this.type = type;
    this.color = color;
    this.title = title;
    this.fraction = 0;
    this.hover = false;
    this.el = document.createElement('canvas');
    this.el.className = `color-button type-${type}`;
    this.el.title = 'Click to set graph colors';
    this.el.addEventListener('mouseenter', () => { this.hover = true; this.draw(); });
    this.el.addEventListener('mouseleave', () => { this.hover = false; this.draw(); });
    this.el.addEventListener('click', () => onPick(this));
    new ResizeObserver(() => this.draw()).observe(this.el);
    for (const img of Object.values(arrowImages))
      img.addEventListener('load', () => this.draw());
  }

  // Settings may hold GDK's 16-bit-per-channel "#rrrrggggbbbb" form.
  get css() {
    return cssColor(parseColor(this.color));
  }

  setColor(color) {
    this.color = color;
    this.draw();
  }

  setFraction(fraction) {
    if (fraction === this.fraction)
      return;
    this.fraction = fraction;
    this.draw();
  }

  draw() {
    const width = Math.floor(this.el.clientWidth);
    const height = Math.floor(this.el.clientHeight);
    if (!width || !height)
      return;
    const dpr = window.devicePixelRatio || 1;
    this.el.width = Math.round(width * dpr);
    this.el.height = Math.round(height * dpr);
    const cr = this.el.getContext('2d');
    cr.setTransform(dpr, 0, 0, dpr, 0, 0);
    cr.clearRect(0, 0, width, height);

    let rgb = parseColor(this.color);
    if (this.hover)
      rgb = rgb.map((c) => Math.min(1.0, c + 0.125));
    const color = cssColor(rgb);

    switch (this.type) {
    case ButtonType.CPU:
      this.drawSwatch(cr, width, height, color);
      break;
    case ButtonType.PIE:
      this.drawPie(cr, width, height, color);
      break;
    case ButtonType.NETWORK_IN:
    case ButtonType.DISK_WRITE:
      this.drawArrow(cr, color, true);
      break;
    default:
      this.drawArrow(cr, color, false);
    }
  }

  drawSwatch(cr, width, height, color) {
    cr.fillStyle = color;
    cr.fillRect(0, 0, width, height);
    cr.lineWidth = 1;
    cr.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    cr.strokeRect(0.5, 0.5, width - 1, height - 1);
    cr.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    cr.strokeRect(1.5, 1.5, width - 3, height - 3);
  }

  drawPie(cr, width, height, color) {
    const cx = Math.trunc(width / 2) + 0.5;
    const cy = Math.trunc(height / 2) + 0.5;
    const radius = Math.trunc(Math.min(width, height) / 2);
    const f = this.fraction;
    const arcStart = -Math.PI / 2 + 2 * Math.PI * f;
    const arcEnd = -Math.PI / 2;
    cr.lineWidth = 1;

    cr.beginPath();
    if (f < 0.01) {
      cr.arc(cx, cy, 4.5, 0, 2 * Math.PI);
    } else if (f > 0.99) {
      cr.arc(cx, cy, radius - 2.25, 0, 2 * Math.PI);
    } else {
      cr.arc(cx, cy, radius - 2.25, arcStart, arcEnd, true);
      cr.arc(cx, cy, 4.5, arcEnd, arcStart, true);
      cr.arc(cx, cy, radius - 2.25, arcStart, arcStart, true);
    }
    cr.fillStyle = color;
    cr.fill();
    cr.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    cr.stroke();

    cr.beginPath();
    cr.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    if (f < 0.03) {
      cr.arc(cx, cy, 3.25, 0, 2 * Math.PI);
    } else if (f > 0.99) {
      cr.arc(cx, cy, radius - 3.5, 0, 2 * Math.PI);
    } else {
      const d = 1 / (radius - 3.75);
      cr.arc(cx, cy, radius - 3.5, arcStart + d, arcEnd - d, true);
      cr.arc(cx, cy, 3.25, arcEnd - d, arcStart + d, true);
      cr.arc(cx, cy, radius - 3.5, arcStart + d, arcStart + d, true);
    }
    cr.stroke();

    cr.beginPath();
    cr.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    cr.arc(cx, cy, radius - 1.25, 0, 2 * Math.PI);
    cr.stroke();
  }

  drawArrow(cr, color, down) {
    const { mask, overlay } = arrowImages;
    if (!mask.complete || !overlay.complete)
      return;
    const layer = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    layer.width = layer.height = Math.round(32 * dpr);
    const lc = layer.getContext('2d');
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.drawImage(mask, 0, 0, 32, 32);
    lc.globalCompositeOperation = 'source-in';
    lc.fillStyle = color;
    lc.fillRect(0, 0, 32, 32);
    lc.globalCompositeOperation = 'source-over';
    lc.drawImage(overlay, 0, 0, 32, 32);

    cr.save();
    if (down) {
      cr.translate(16, 16);
      cr.rotate(Math.PI);
      cr.translate(-16, -13);
    }
    cr.drawImage(layer, 0, 0, 32, 32);
    cr.restore();
  }
}

window.ColorButton = ColorButton;
window.ButtonType = ButtonType;
