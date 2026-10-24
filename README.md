# System Monitor (Resources) for Windows

A Windows port of the **Resources** tab of GNOME System Monitor 46.0, matching how it
looks on Linux Mint 22.3 with the Mint-Y-Dark-Aqua theme. The Processes and File Systems
tabs are not included.

## Install

Run `dist/System-Monitor-Setup-1.0.0.exe` on Windows 10/11 x64. It installs per-user
(no admin rights needed) and creates Start menu and desktop shortcuts. The installer is
unsigned, so SmartScreen may ask you to confirm ("More info" → "Run anyway").

## What it does

- **CPU**: per-core history graph (smooth Bézier or straight lines, optional stacked area),
  legend with color swatches and live percentages.
- **Memory and Swap**: history graph, pie indicators, used / total / cache. On Windows,
  swap is the page file and "Cache" is the system cache (standby list plus system working set).
- **Network**: receive/send rates and totals for non-loopback interfaces that are up.
- **Disk**: read/write rates and totals summed across physical drives.
- Preferences (Ctrl+,): update interval, chart data points, smooth graphs, stacked CPU,
  IEC units, logarithmic memory scale, network bits. Settings are stored in
  `%APPDATA%\System Monitor\settings.json`.
- Click any swatch, pie or arrow to change that graph's color.
- Shortcuts: F10 menu, Ctrl+, preferences, Ctrl+? shortcuts, Ctrl+Q quit.

## Build

Requires Node.js 24. The build works on Linux without wine.

```sh
npm install
node node_modules/electron/install.js   # fetches the Electron binary (npm 11 skips install scripts)
npm start                               # run locally (Linux uses /proc for data)
npm run icons                           # regenerate build/icon.ico from assets/icons/app.svg
npm run dist:win                        # writes dist/System-Monitor-Setup-<version>.exe
```

`build/vendor/koffi-win32-x64` holds the Windows koffi native module, which is shipped
as `resources/koffi/win32_x64/koffi.node` so the installer can be built on any host.
To refresh it after a koffi upgrade, run
`npm install --os=win32 --cpu=x64` and copy `node_modules/@koromix/koffi-win32-x64`.

Working on the code (human or agent)? Start with [AGENTS.md](AGENTS.md): layout, traps
(such as `ELECTRON_RUN_AS_NODE` in VS Code terminals) and how to verify visual changes
against [the reference capture](docs/reference/gsm-resources@2x.png) using `tools/`.

## How it was derived

Layout, drawing and formatting were recovered from the installed binary
(`/usr/bin/gnome-system-monitor` 46.0) and its GResource UI files. That includes graph
geometry (4 px frame, 18 px indent, right margin 6× font size, labels at 0.8× font size),
grid alphas, the 10-frames-per-sample scroll animation, the network axis rounding, the
colour-button drawing, GLib size formatting and the colour generation for CPUs beyond
the 16 defaults. The result was then checked pixel by pixel against screenshots of the
original.

## Licence and credits

GPL-2.0-or-later (see `LICENSE`), as a derivative of
[GNOME System Monitor](https://apps.gnome.org/SystemMonitor/).
Arrow pixmaps and the app icon come from GNOME System Monitor, symbolic icons from the
Adwaita, Mint-Y and Yaru icon themes, and fonts from the Ubuntu Font Family
(Ubuntu Font Licence 1.0).
