'use strict';

const { el } = Widgets;
const view = new URLSearchParams(location.search).get('view') || 'main';
let config = null;
const settingsListeners = [];

function onSettingsChanged(fn) {
  settingsListeners.push(fn);
}

function setupWindowChrome() {
  for (const button of document.querySelectorAll('.wc-button'))
    button.addEventListener('click', () => sysmon.windowAction(button.dataset.action));
  const apply = ({ maximized, focused }) => {
    document.body.classList.toggle('maximized', maximized);
    document.body.classList.toggle('backdrop', !focused);
    const max = document.querySelector('.wc-button.maximize');
    max.title = maximized ? 'Restore' : 'Maximize';
  };
  sysmon.windowState().then(apply);
  sysmon.onWindowState(apply);
}

// ---------------------------------------------------------------- main view

const RES = {};

function buildHeader() {
  const title = document.querySelector('.headerbar-title');
  const switcher = el('div', 'viewswitcher');
  const page = el('button', 'viewswitcher-button checked');
  page.append(el('span', 'icon icon-speedometer'), el('span', 'viewswitcher-label', 'Resources'));
  switcher.append(page);
  title.append(switcher);

  const end = document.querySelector('.headerbar-end');
  const menuButton = el('button', 'image-button menu-button');
  menuButton.title = 'Main Menu';
  menuButton.append(el('span', 'icon icon-open-menu'));
  end.prepend(menuButton);
  const menu = Dialogs.popoverMenu(menuButton, [
    [{ label: 'Preferences', action: () => sysmon.openDialog('preferences') }],
    [
      { label: 'Keyboard Shortcuts', action: () => sysmon.openDialog('shortcuts') },
      { label: 'About System Monitor', action: () => sysmon.openDialog('about') }
    ]
  ]);
  menuButton.addEventListener('click', () => menu.toggle());
  RES.menu = menu;
}

function expander(name, title) {
  const section = el('section', 'expander expanded');
  section.dataset.name = name;
  const header = el('button', 'expander-title');
  header.append(el('span', 'expander-arrow'), el('span', 'expander-label', title));
  const content = el('div', 'expander-content');
  section.append(header, content);
  header.addEventListener('click', () => {
    section.classList.toggle('expanded');
    for (const g of Object.values(RES.graphs))
      g.clearBackground();
  });
  return { section, content };
}

function graphCanvas(content) {
  const canvas = el('canvas', 'load-graph');
  content.append(canvas);
  return canvas;
}

function pickColor(button, settingKey, index) {
  Dialogs.colorChooser(`Pick a Color for “${button.title}”`, button.color, (color) => {
    if (index === undefined) {
      sysmon.setSetting(settingKey, color);
    } else {
      const colors = config['cpu-colors'].slice();
      colors[index] = color;
      sysmon.setSetting(settingKey, colors);
    }
  });
}

function colorButton(type, settingKey, title, index) {
  const color = index === undefined ? config[settingKey] : config[settingKey][index];
  const button = new ColorButton(type, color, title, (b) => pickColor(b, settingKey, index));
  button.title = title;
  return button;
}

function buildCpu(box, ncpu) {
  const { section, content } = expander('cpu', 'CPU');
  const canvas = graphCanvas(content);
  const table = el('div', 'cpu-table');
  const rows = Math.trunc((ncpu + 3) / 4);
  const cols = Math.ceil(ncpu / rows);
  table.style.setProperty('--cols', cols);
  table.style.setProperty('--rows', rows);
  table.style.setProperty('--name-chars', Math.trunc(Math.log10(ncpu) + 1 + 4));
  RES.cpuButtons = [];
  RES.cpuLabels = [];
  for (let i = 0; i < ncpu; i++) {
    const name = ncpu === 1 ? 'CPU' : `CPU${i + 1}`;
    const item = el('div', 'cpu-item');
    const button = colorButton(ButtonType.CPU, 'cpu-colors', name, i);
    const value = el('span', 'cpu-value tnum', '0.0%');
    item.append(button.el, el('span', 'cpu-name', name), value);
    item.style.gridColumn = String(Math.trunc(i / rows) + 1);
    item.style.gridRow = String((i % rows) + 1);
    table.append(item);
    RES.cpuButtons.push(button);
    RES.cpuLabels.push(value);
  }
  content.append(table);
  box.append(section);
  return new LoadGraph(GraphType.CPU, canvas, ncpu, {
    config: () => config,
    colors: () => RES.cpuButtons.map((b) => b.css)
  });
}

function buildMem(box) {
  const { section, content } = expander('mem', 'Memory and Swap');
  const canvas = graphCanvas(content);
  const table = el('div', 'mem-table');
  const memPie = colorButton(ButtonType.PIE, 'mem-color', 'Memory');
  const swapPie = colorButton(ButtonType.PIE, 'swap-color', 'Swap');
  RES.memInfo = el('div', 'mem-info tnum');
  RES.swapInfo = el('div', 'mem-info tnum');
  const memText = el('div', 'mem-text');
  memText.append(el('div', 'mem-title', 'Memory'), RES.memInfo);
  const swapText = el('div', 'mem-text');
  swapText.append(el('div', 'mem-title', 'Swap'), RES.swapInfo);
  table.append(memPie.el, memText, swapPie.el, swapText);
  content.append(table);
  box.append(section);
  RES.memPie = memPie;
  RES.swapPie = swapPie;
  return new LoadGraph(GraphType.MEM, canvas, 2, {
    config: () => config,
    colors: () => [memPie.css, swapPie.css]
  });
}

function buildTransfer(box, name, title, spec) {
  const { section, content } = expander(name, title);
  const canvas = graphCanvas(content);
  const table = el('div', 'transfer-table');
  const sides = spec.map(([type, key, label, totalLabel]) => {
    const button = colorButton(type, key, label);
    const rate = el('div', 'transfer-value tnum');
    const total = el('div', 'transfer-value tnum');
    const names = el('div', 'transfer-names');
    names.append(el('div', null, label), el('div', null, totalLabel));
    const values = el('div', 'transfer-values');
    values.append(rate, total);
    table.append(button.el, names, values, el('div', 'transfer-spacer'));
    return { button, rate, total };
  });
  content.append(table);
  box.append(section);
  const graph = new LoadGraph(name === 'net' ? GraphType.NET : GraphType.DISK, canvas, 2, {
    config: () => config,
    colors: () => sides.map((s) => s.button.css)
  });
  return { graph, sides };
}

function buildResources(ncpu) {
  const scrolled = el('div', 'res-scrolled');
  const box = el('div', 'res-box');
  scrolled.append(box);
  document.getElementById('content').append(scrolled);

  const cpu = buildCpu(box, ncpu);
  const mem = buildMem(box);
  const net = buildTransfer(box, 'net', 'Network', [
    [ButtonType.NETWORK_IN, 'net-in-color', 'Receiving', 'Total Received'],
    [ButtonType.NETWORK_OUT, 'net-out-color', 'Sending', 'Total Sent']
  ]);
  const disk = buildTransfer(box, 'disk', 'Disk', [
    [ButtonType.DISK_READ, 'disk-read-color', 'Reading', 'Total Read'],
    [ButtonType.DISK_WRITE, 'disk-write-color', 'Writing', 'Total Written']
  ]);
  RES.graphs = { cpu, mem, net: net.graph, disk: disk.graph };
  RES.net = net.sides;
  RES.disk = disk.sides;
}

// Shared GsmGraph clock: every graph-update-interval ms one frame, every
// FRAMES_PER_UNIT frames one data point. The sample is requested one frame
// early so the shift lands on the frame where the scroll offset wraps.
const clock = { counter: 0, timer: null, last: null, pending: null };

function startClock() {
  if (clock.timer)
    clearInterval(clock.timer);
  clock.timer = setInterval(tick, config['graph-update-interval']);
}

function tick() {
  if (clock.counter === FRAMES_PER_UNIT - 2)
    sysmon.sample().then((s) => { clock.pending = s; });
  if (clock.counter === FRAMES_PER_UNIT - 1 && clock.pending) {
    applySample(clock.pending);
    clock.pending = null;
  }
  clock.counter = (clock.counter + 1) % FRAMES_PER_UNIT;
  for (const g of Object.values(RES.graphs)) {
    g.renderCounter = clock.counter;
    g.queueDraw();
  }
}

function applySample(s) {
  const prev = clock.last;
  clock.last = s;
  updateMemory(s);
  if (!prev)
    return;
  const dt = Math.max(1e-3, (s.time - prev.time) / 1000);
  updateCpu(s, prev);
  updateTransfer(RES.graphs.net, RES.net, s.net.in, s.net.out, prev.net.in, prev.net.out, dt,
    config['network-in-bits'], config['network-total-in-bits']);
  updateTransfer(RES.graphs.disk, RES.disk, s.disk.read, s.disk.write, prev.disk.read, prev.disk.write, dt,
    false, false);
}

function updateCpu(s, prev) {
  const n = s.cpu.length;
  const stacked = config['cpu-stacked-area-chart'];
  const row = new Float64Array(n);
  let acc = 0;
  s.cpu.forEach((c, i) => {
    const p = prev.cpu[i] || c;
    const total = c.total - p.total;
    const load = Math.min(1, Math.max(0, (total - (c.idle - p.idle)) / Math.max(total, 1)));
    acc += load / n;
    row[i] = stacked ? acc : load;
    RES.cpuLabels[i].textContent = `${(load * 100).toFixed(1)}%`;
  });
  RES.graphs.cpu.pushRow(row);
}

function updateMemory(s) {
  const iec = config['resources-memory-in-iec'];
  const fm = (v) => Format.formatMemory(v, iec);
  const mem = s.mem;
  const memFrac = mem.total ? mem.used / mem.total : 0;
  const swapFrac = s.swap.total ? s.swap.used / s.swap.total : 0;
  RES.memInfo.textContent =
    `${fm(mem.used)} (${(memFrac * 100).toFixed(1)}%) of ${fm(mem.total)}\nCache ${fm(mem.cache)}`;
  RES.swapInfo.textContent = s.swap.total
    ? `${fm(s.swap.used)} (${(swapFrac * 100).toFixed(1)}%) of ${fm(s.swap.total)}`
    : 'not available';
  RES.memPie.setFraction(memFrac);
  RES.swapPie.setFraction(swapFrac);
  const g = RES.graphs.mem;
  g.pushRow([g.logPartial(memFrac), g.logPartial(swapFrac)]);
}

function updateTransfer(graph, sides, a, b, pa, pb, dt, rateBits, totalBits) {
  const ra = Math.max(0, (a - pa) / dt);
  const rb = Math.max(0, (b - pb) / dt);
  graph.pushRow([ra / graph.max, rb / graph.max]);
  graph.rescale(Math.max(ra, rb));
  sides[0].rate.textContent = Format.formatRate(ra, rateBits);
  sides[1].rate.textContent = Format.formatRate(rb, rateBits);
  sides[0].total.textContent = Format.formatSize(a, totalBits);
  sides[1].total.textContent = Format.formatSize(b, totalBits);
}

function applyConfigToMain(old, next) {
  RES.cpuButtons.forEach((b, i) => b.setColor(next['cpu-colors'][i]));
  RES.memPie.setColor(next['mem-color']);
  RES.swapPie.setColor(next['swap-color']);
  RES.net[0].button.setColor(next['net-in-color']);
  RES.net[1].button.setColor(next['net-out-color']);
  RES.disk[0].button.setColor(next['disk-read-color']);
  RES.disk[1].button.setColor(next['disk-write-color']);
  if (old['graph-update-interval'] !== next['graph-update-interval'])
    startClock();
  if (old['graph-data-points'] !== next['graph-data-points'])
    for (const g of Object.values(RES.graphs))
      g.resize(next['graph-data-points'] + 2);
  for (const g of Object.values(RES.graphs))
    g.clearBackground();
}

function setupMainShortcuts() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === ',') {
      sysmon.openDialog('preferences');
    } else if (ctrl && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
      sysmon.openDialog('shortcuts');
    } else if (ctrl && e.key.toLowerCase() === 'q') {
      sysmon.quit();
    } else if (e.key === 'F10') {
      RES.menu.toggle();
    } else {
      return;
    }
    e.preventDefault();
  });
}

async function initMain() {
  buildHeader();
  const first = await sysmon.sample();
  buildResources(first.cpu.length);
  clock.last = first;
  updateMemory(first);
  for (const g of Object.values(RES.graphs))
    g.queueDraw();
  onSettingsChanged(applyConfigToMain);
  setupMainShortcuts();
  startClock();
}

async function init() {
  config = await sysmon.settings();
  sysmon.onSettings((next) => {
    const old = config;
    config = next;
    for (const fn of settingsListeners)
      fn(old, next);
  });
  document.body.classList.add(`view-${view}`);
  setupWindowChrome();
  await Promise.all(['10pt Ubuntu', 'bold 10pt Ubuntu', '500 10pt Ubuntu'].map((f) => document.fonts.load(f)));
  if (view === 'main')
    initMain();
  else
    Dialogs.initView(view, () => config, onSettingsChanged);
}

init();
