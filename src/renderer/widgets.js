'use strict';

// Minimal libadwaita-style widgets.

(() => {

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className)
    node.className = className;
  if (text !== undefined)
    node.textContent = text;
  return node;
}

function makeSwitch(active, onChange) {
  const sw = el('button', 'switch');
  sw.setAttribute('role', 'switch');
  sw.append(el('span', 'switch-slider'));
  const set = (value) => {
    sw.classList.toggle('checked', value);
    sw.setAttribute('aria-checked', String(value));
  };
  set(active);
  sw.addEventListener('click', () => {
    const value = !sw.classList.contains('checked');
    set(value);
    onChange(value);
  });
  return { el: sw, set };
}

function makeSpinButton({ value, lower, upper, step, digits }, onChange) {
  const box = el('div', 'spinbutton');
  const entry = el('input', 'spin-entry');
  entry.type = 'text';
  const minus = el('button', 'spin-button minus');
  const plus = el('button', 'spin-button plus');
  minus.append(el('span', 'icon icon-minus'));
  plus.append(el('span', 'icon icon-plus'));
  box.append(entry, minus, plus);
  let current = value;
  const clamp = (v) => Math.min(upper, Math.max(lower, v));
  const show = () => {
    entry.value = current.toFixed(digits);
    minus.disabled = current <= lower;
    plus.disabled = current >= upper;
  };
  const commit = (v) => {
    const next = clamp(Math.round(v / step) * step);
    if (Number.isFinite(next) && Math.abs(next - current) > 1e-9) {
      current = next;
      onChange(current);
    }
    show();
  };
  minus.addEventListener('click', () => commit(current - step));
  plus.addEventListener('click', () => commit(current + step));
  entry.addEventListener('change', () => commit(parseFloat(entry.value)));
  entry.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { commit(current + step); e.preventDefault(); }
    if (e.key === 'ArrowDown') { commit(current - step); e.preventDefault(); }
  });
  show();
  return { el: box, set: (v) => { current = v; show(); } };
}

function makeScale({ value, lower, upper, step }, onChange) {
  const box = el('div', 'scale');
  const input = el('input', 'scale-range');
  input.type = 'range';
  input.min = lower;
  input.max = upper;
  input.step = step;
  input.value = value;
  const label = el('span', 'scale-value', String(value));
  const paint = () => {
    const pct = (input.value - lower) / (upper - lower) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    label.textContent = input.value;
  };
  input.addEventListener('input', paint);
  input.addEventListener('change', () => onChange(Number(input.value)));
  box.append(input, label);
  paint();
  return { el: box, set: (v) => { input.value = v; paint(); } };
}

window.Widgets = { el, makeSwitch, makeSpinButton, makeScale };

})();
