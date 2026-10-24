# Agent guide

Windows port of the **Resources tab** of GNOME System Monitor 46.0, as it looks on
Linux Mint 22.3 (Mint-Y-Dark-Aqua). The goal is a pixel-faithful copy of the look and
behaviour, shipped as a Windows x64 NSIS installer. Processes and File Systems tabs are
out of scope.

Read [docs/reverse-engineering.md](docs/reverse-engineering.md) before touching
rendering or layout. Many details that look odd are copied on purpose, for example:
- the missing "0 %" label,
- grid and labels drawn at 1× and upscaled,
- forced sRGB.

## Layout

```
src/main/main.js            Electron main: frameless windows, IPC, single instance, dialogs,
                            tray (close hides), Start at Login (--hidden)
src/main/settings.js        settings.json (gsettings keys/defaults), CPU colour generation
src/main/stats/win32.js     Windows sampler (koffi → kernel32/ntdll/iphlpapi), per-section try/catch
src/main/stats/win32-structs.js  koffi struct layouts (no DLL loading; testable anywhere)
src/main/stats/linux.js     /proc sampler used for development on Linux
src/main/stats/basic.js     os-module fallback if koffi cannot load
src/preload.js              window.sysmon bridge (contextIsolation)
src/renderer/index.html     one page for every window; ?view=main|preferences|shortcuts|about
src/renderer/app.js         main view, shared graph clock, sample → graph/labels
src/renderer/graph.js       LoadGraph: port of GSM's draw routine and axis scaling
src/renderer/colorbutton.js swatch / pie / arrow widgets
src/renderer/format.js      g_format_size_full + procman::format_* ports
src/renderer/dialogs.js     popover menu, colour chooser, preferences, shortcuts, about
src/renderer/widgets.js     switch, spin button, scale
src/renderer/styles.css     Mint-Y-Dark-Aqua libadwaita look
build/vendor/koffi-win32-x64  Windows koffi.node, shipped via extraResources
build/installer.nsh         NSIS uninstall hook: removes the Start at Login Run entry
scripts/build-win.js        installer build; scripts/wine-shim/wine replaces wine on Linux
scripts/make-icons.js       app.svg → build/icon.ico + assets/icons/app.{ico,png}
tools/                      verification tools (see below)
docs/reference/             gsm-resources@2x.png (original), port-resources@2x.png (port)
```

Data flow: renderer `tick()` every `graph-update-interval` ms → at frame 8 of 10 it calls
`sysmon.sample()` (IPC → `stats.sample()` in main) → at frame 9 it applies the sample
(deltas, labels, `pushRow`, `rescale`) → every frame each `LoadGraph` redraws.

## Running

```sh
npm install
node node_modules/electron/install.js     # npm 11 skips Electron's postinstall download
env -u ELECTRON_RUN_AS_NODE npm start     # Linux dev run, real data from /proc
env -u ELECTRON_RUN_AS_NODE npm run dist:win   # dist/System-Monitor-Setup-<version>.exe
```

## Traps

- **`ELECTRON_RUN_AS_NODE=1` is set in VS Code terminals.** Electron then acts as plain
  Node and `require('electron').app` is undefined. Unset it for `npm start`,
  `npm run icons` and the build (`build-win.js` already does).
- **Don't run `npm install --os=win32 --cpu=x64` in this tree.** It swaps the Linux koffi
  binary for the Windows one and breaks local runs. The Windows binary is vendored in
  `build/vendor/koffi-win32-x64` and shipped as `resources/koffi/win32_x64/koffi.node`,
  where koffi's loader looks. Run plain `npm install` to restore the Linux binary.
- **The Windows build needs no wine.** The shim extracts the NSIS uninstaller with
  electron-builder's own `UninstallerReader`. If real wine is on PATH it is used instead.
- **Settings during tests:** run with `XDG_CONFIG_HOME=<tmpdir>` so tests don't write
  to the user's `~/.config/System Monitor`. `tools/capture.sh` does this.
- **Classic scripts share one global scope** in the renderer. Keep helpers inside IIFEs and
  export a single global (`Widgets`, `Dialogs`, `Format`, ...). A duplicate top-level
  `const` breaks the page with a blank window.
- **Colours may be GDK 12-digit strings** (`#rrrrggggbbbb`). Use `ColorButton.css`, not the
  raw setting, for canvas styles.
- **Never use `koffi.view()` in the main process.** Electron's V8 memory cage forbids
  external ArrayBuffers and the process aborts (no exception, so `guarded()` can't catch
  it). Copy native memory with `koffi.decode(ptr, offset, 'uint8', len)` instead. Test
  native code under Electron (`ELECTRON_RUN_AS_NODE=1 electron script.js`), not plain Node.
- **The main window runs with `backgroundThrottling: false`** so graphs keep recording
  while it sits hidden in the tray. The page then always reports itself visible, so
  `app.js` skips drawing based on the `visible` field of the window state instead.
- **Start at Login writes `HKCU\...\Run\io.github.orhunakkan.SystemMonitorResources`.**
  Toggling it from a source run registers `electron.exe <repo>`, which replaces an
  installed copy's entry. Turn it off again after testing.
- **Focus changes the look.** Unfocused windows get Mint's backdrop style (grey close
  button, dimmed header). Captures taken while another window has focus show this.
- The installer is ~113 MB and over GitHub's 100 MB file limit. Never commit `dist/`;
  publish it as a release asset.

## Verifying changes

1. `node tools/check-win32-layout.js`: struct layouts still match Windows x64.
2. Visual changes (Linux/X11 with xwd and Pillow):
   ```sh
   tools/capture.sh /tmp/port.png 64       # maximized, isolated profile, full graphs
   python3 tools/compare.py /tmp/port.png --out /tmp/cmp
   ```
   At the reference size, gridline spacing must stay 17 px (5 bars). Text and swatch rows
   should be within about 1 px, and sampled colours exact. Look at the `cmp_*.png`
   side-by-side crops. Live values (CPU %, memory, rates) will differ.
3. Interactive checks: `env -u ELECTRON_RUN_AS_NODE npm start -- --remote-debugging-port=9333`,
   then drive windows with `node tools/cdp.mjs 9333 view=main shot.png "<js>"`. Use
   `sysmon.openDialog('preferences')`, click `.menu-button`, `.expander-title`,
   `.color-button`, and so on.
4. Build the installer and confirm the exe icon with any PE resource viewer.

## Open items

- **The installer has not been run.** The app has been verified on Windows 11 from
  source and from `dist/win-unpacked` (all sections match Windows counters), but the
  NSIS install/uninstall flow, shortcuts and the installed app are still untested. If a
  sampling call fails, `win32.js` logs `System Monitor: <section> sampling failed` once
  and shows zeros.
- The installer is unsigned (SmartScreen warns).
- At 2× scaling, GSM's axis labels show subpixel colour fringes; the port's labels are
  greyscale. This is a cosmetic difference that was accepted.
- Help (F1) and the original's "Search for Open Files" were intentionally left out.

## Conventions

- No frameworks or bundler: plain CommonJS in main, classic scripts in the renderer.
- Keep comments sparse and factual; cite the original behaviour when copying an oddity.
- Licence is GPL-2.0-or-later (derivative of GNOME System Monitor). Keep attributions in
  the README and About window.
