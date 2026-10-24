'use strict';

(() => {
  const { el, makeSwitch, makeSpinButton, makeScale } = Widgets;

  // GTK 4 default color chooser palette (GNOME HIG colors), one hue per column.
  const PALETTE = [
    ['#99c1f1', '#62a0ea', '#3584e4', '#1c71d8', '#1a5fb4'],
    ['#8ff0a4', '#57e389', '#33d17a', '#2ec27e', '#26a269'],
    ['#f9f06b', '#f8e45c', '#f6d32d', '#f5c211', '#e5a50a'],
    ['#ffbe6f', '#ffa348', '#ff7800', '#e66100', '#c64600'],
    ['#f66151', '#ed333b', '#e01b24', '#c01c28', '#a51d2d'],
    ['#dc8add', '#c061cb', '#9141ac', '#813d9c', '#613583'],
    ['#cdab8f', '#b5835a', '#986a44', '#865e3c', '#63452c'],
    ['#ffffff', '#f6f5f4', '#deddda', '#c0bfbc', '#9a9996'],
    ['#77767b', '#5e5c64', '#3d3846', '#241f31', '#000000']
  ];

  function popoverMenu(anchor, sections) {
    const popover = el('div', 'popover menu');
    for (const items of sections) {
      const section = el('div', 'menu-section');
      for (const item of items) {
        const button = el('button', 'modelbutton', item.label);
        button.addEventListener('click', () => {
          hide();
          item.action();
        });
        section.append(button);
      }
      popover.append(section);
    }
    document.body.append(popover);
    const onDocDown = (e) => {
      if (!popover.contains(e.target) && !anchor.contains(e.target))
        hide();
    };
    const onKey = (e) => {
      if (e.key === 'Escape')
        hide();
    };
    function show() {
      const r = anchor.getBoundingClientRect();
      popover.classList.add('visible');
      const w = popover.offsetWidth;
      const left = Math.min(window.innerWidth - w - 6, Math.max(6, r.left + r.width / 2 - w / 2));
      popover.style.left = `${left}px`;
      popover.style.top = `${r.bottom + 4}px`;
      popover.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
      anchor.classList.add('active');
      document.addEventListener('mousedown', onDocDown);
      document.addEventListener('keydown', onKey);
      window.addEventListener('blur', hide);
    }
    function hide() {
      popover.classList.remove('visible');
      anchor.classList.remove('active');
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', hide);
    }
    return { toggle: () => (popover.classList.contains('visible') ? hide() : show()), hide };
  }

  function colorChooser(title, current, onSelect) {
    const backdrop = el('div', 'dialog-backdrop');
    const dialog = el('div', 'dialog color-chooser');
    const header = el('div', 'dialog-header');
    const cancel = el('button', 'text-button', 'Cancel');
    const select = el('button', 'text-button suggested', 'Select');
    header.append(cancel, el('div', 'dialog-title', title), select);
    let chosen = current.length > 7 ? current : current.toLowerCase();
    const swatches = [];
    const mark = () => swatches.forEach(([s, c]) => s.classList.toggle('selected', c === chosen));
    const swatch = (color) => {
      const s = el('button', 'color-swatch');
      s.style.setProperty('--swatch', color);
      s.title = color;
      s.addEventListener('click', () => { chosen = color; mark(); });
      s.addEventListener('dblclick', () => { chosen = color; finish(true); });
      swatches.push([s, color]);
      return s;
    };
    const palette = el('div', 'palette');
    PALETTE.forEach((column, x) => column.forEach((color, y) => {
      const s = swatch(color);
      s.style.gridColumn = String(x + 1);
      s.style.gridRow = String(y + 1);
      palette.append(s);
    }));
    const customRow = el('div', 'palette custom');
    const add = el('button', 'color-swatch add');
    add.title = 'Custom';
    add.append(el('span', 'icon icon-plus'));
    const picker = el('input', 'native-color');
    picker.type = 'color';
    add.addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => {
      chosen = picker.value;
      customRow.append(swatch(chosen));
      mark();
    });
    customRow.append(add);
    if (!PALETTE.flat().includes(chosen))
      customRow.append(swatch(chosen));
    const body = el('div', 'dialog-body');
    body.append(palette, el('div', 'palette-heading', 'Custom'), customRow, picker);
    dialog.append(header, body);
    backdrop.append(dialog);
    document.body.append(backdrop);
    mark();
    const onKey = (e) => {
      if (e.key === 'Escape')
        finish(false);
      if (e.key === 'Enter')
        finish(true);
    };
    function finish(ok) {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (ok)
        onSelect(chosen);
    }
    cancel.addEventListener('click', () => finish(false));
    select.addEventListener('click', () => finish(true));
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop)
        finish(false);
    });
    document.addEventListener('keydown', onKey);
  }

  function setTitle(text) {
    document.querySelector('.headerbar-title').append(el('div', 'title-label', text));
    document.title = text;
  }

  function group(page, title) {
    const g = el('div', 'preferences-group');
    g.append(el('div', 'group-title', title));
    const list = el('div', 'boxed-list');
    g.append(list);
    page.append(g);
    return list;
  }

  function row(list, title, widget, activatable) {
    const r = el('div', 'action-row');
    r.append(el('div', 'row-title', title), widget.el);
    if (activatable) {
      r.classList.add('activatable');
      r.addEventListener('click', (e) => {
        if (!widget.el.contains(e.target))
          widget.el.click();
      });
    }
    list.append(r);
    return widget;
  }

  function preferences(getConfig, onSettingsChanged) {
    setTitle('Preferences');
    const config = getConfig();
    const page = el('div', 'preferences-page');
    const clamp = el('div', 'clamp');
    clamp.append(page);
    document.getElementById('content').append(clamp);

    const set = (key) => (value) => sysmon.setSetting(key, value);
    const switches = {};
    const switchRow = (list, title, key) => {
      switches[key] = row(list, title, makeSwitch(config[key], set(key)), true);
    };

    const behavior = group(page, 'Behavior');
    const interval = row(behavior, 'Update Interval in Seconds', makeSpinButton(
      { value: config['graph-update-interval'] / 1000, lower: 0.05, upper: 10.0, step: 0.05, digits: 2 },
      (v) => sysmon.setSetting('graph-update-interval', Math.round(v * 1000))));
    const points = el('div', 'action-row scale-row');
    const scale = makeScale({ value: config['graph-data-points'], lower: 30, upper: 600, step: 10 },
      set('graph-data-points'));
    points.append(el('div', 'row-title', 'Chart Data Points'), scale.el);
    behavior.append(points);
    switchRow(behavior, 'Draw Charts as Smooth Graphs', 'cpu-smooth-graph');

    switchRow(group(page, 'CPU'), 'Draw CPU Chart as Stacked Area Chart', 'cpu-stacked-area-chart');
    const mem = group(page, 'Memory and Swap');
    switchRow(mem, 'Show Memory and Swap in IEC', 'resources-memory-in-iec');
    switchRow(mem, 'Show Memory in Logarithmic Scale', 'logarithmic-scale');
    const net = group(page, 'Network');
    switchRow(net, 'Show Network Speed in Bits', 'network-in-bits');
    switchRow(net, 'Show Network Totals in Bits', 'network-total-in-bits');

    onSettingsChanged((_old, next) => {
      interval.set(next['graph-update-interval'] / 1000);
      scale.set(next['graph-data-points']);
      for (const [key, sw] of Object.entries(switches))
        sw.set(next[key]);
    });
  }

  function keycaps(accel) {
    const box = el('div', 'accel');
    accel.split('+').forEach((key, i) => {
      if (i)
        box.append(el('span', 'accel-plus', '+'));
      box.append(el('kbd', 'keycap', key));
    });
    return box;
  }

  function shortcuts() {
    setTitle('Shortcuts');
    const page = el('div', 'shortcuts-page');
    page.append(el('div', 'shortcuts-heading', 'General'));
    for (const [title, accel] of [
      ['Open menu', 'F10'],
      ['Show preferences', 'Ctrl+,'],
      ['Keyboard shortcuts', 'Ctrl+?'],
      ['Quit', 'Ctrl+Q']
    ]) {
      const r = el('div', 'shortcut-row');
      r.append(keycaps(accel), el('div', 'shortcut-title', title));
      page.append(r);
    }
    document.getElementById('content').append(page);
  }

  function about() {
    const page = el('div', 'about-page');
    const icon = el('img', 'about-icon');
    icon.src = '../../assets/icons/app.svg';
    icon.alt = '';
    const version = el('button', 'about-version', '1.0.0');
    page.append(
      icon,
      el('div', 'about-name', 'System Monitor'),
      el('div', 'about-developer', 'Resources view of GNOME System Monitor 46.0, ported to Windows'),
      version);
    const list = el('div', 'boxed-list');
    for (const [title, url] of [
      ['Original Project', 'https://apps.gnome.org/SystemMonitor/'],
      ['License: GNU GPL v2.0 or later', 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html']
    ]) {
      const r = el('button', 'action-row activatable link-row');
      r.append(el('div', 'row-title', title), el('span', 'icon icon-external'));
      r.addEventListener('click', () => sysmon.openUrl(url));
      list.append(r);
    }
    page.append(list, el('div', 'about-legal',
      'This program comes with absolutely no warranty. Uses the Ubuntu Font Family under the Ubuntu Font Licence 1.0.'));
    document.getElementById('content').append(page);
  }

  function initView(view, getConfig, onSettingsChanged) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.querySelector('.dialog-backdrop'))
        sysmon.windowAction('close');
    });
    if (view === 'preferences')
      preferences(getConfig, onSettingsChanged);
    else if (view === 'shortcuts')
      shortcuts();
    else if (view === 'about')
      about();
  }

  window.Dialogs = { popoverMenu, colorChooser, initView };
})();
