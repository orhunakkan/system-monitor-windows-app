# Reverse-engineering notes

How the look and behaviour of the original Resources tab were recovered, and
which code in this repo each finding drives. Read this before changing
anything in `src/renderer/graph.js`, `colorbutton.js`, `format.js` or the
layout CSS. Several behaviours that look like bugs are deliberate copies.

## Target

| Item | Value |
| --- | --- |
| Package | `gnome-system-monitor` 46.0-1build1 (Linux Mint 22.3, amd64) |
| Binary | `/usr/bin/gnome-system-monitor`, stripped PIE, SHA-256 `1a8d2cb02c6883b27977f4afbbeb20e1a3615c6e4faa18ca38a4149ea6382283` |
| UI resources | `/usr/share/gnome-system-monitor/gsm.gresource`, SHA-256 `ff1bde89eb7c8eaba9e8210db4fce336e113317ff1095963cf4a90229e82f1a6` |
| Toolkit | GTK 4.14 + gtkmm, libadwaita `1.5.0-2mint3` (Mint's fork, themed by Mint-Y-Dark-Aqua) |
| Reference capture | [`reference/gsm-resources@2x.png`](reference/gsm-resources@2x.png): maximized, 2880x1720 device px = 1440x860 logical at scale 2 |

Addresses below are virtual addresses in that exact binary; other builds will differ.

## Method

1. **UI structure**: `gresource extract` on `gsm.gresource`. `data/interface.ui`
   gives the Resources box (margins 12/30/24/24, spacing 10), the four
   `GtkExpander`s, and the grid margins (CPU table start 21, mem/net/disk start 54,
   net/disk end 12). `data/preferences.ui` gives the Resources preference rows.
2. **Defaults**: `/usr/share/glib-2.0/schemas/org.gnome.gnome-system-monitor.gschema.xml`
   (colours, `graph-update-interval` 100 ms, `graph-data-points` 60, ...). These are the
   keys in `src/main/settings.js`.
3. **Exported names**: the binary exports many C++ symbols (`objdump -T`), e.g.
   `LoadGraph::get_caption(unsigned)` at `0x30760`, `procman::generate_colors` at
   `0x48e70`, `gsm_graph_get_num_bars` at `0x2d6b0`. This made it possible to find code
   without a decompiler.
4. **Constants**: `objdump -d` plus [`tools/annotate-disasm.py`](../tools/annotate-disasm.py),
   which prints the double/float/string behind each RIP-relative load.
5. **Theme**: palette from `/usr/share/themes/Mint-Y-Dark-Aqua/libadwaita-1.5/defaults-dark.css`;
   widget metrics from its `base.css`.
6. **Runtime**: window captures with `xwd`, then pixel measurement. The scroll speed was
   measured from frames taken 150 ms apart.

No Ghidra/IDA was available; everything came from symbols, disassembly and pixels.

## Graph rendering (`src/renderer/graph.js`)

The draw routine is the function at `0x30a70`–`0x31c21` (it sits right after `get_caption`).

| Finding | Evidence | Port |
| --- | --- | --- |
| Frame 4 px: `draw_width = w - 8`, content translated by (4, 4) | `lea eax,[rbx-0x8]`, `cairo_translate(4.0, 4.0)` at `0x30cc4` | `FRAME_WIDTH` |
| Indent 18 px | `mov [rax+0x48],0x12` at `0x2b1cd`; `LoadGraph+0 = 18.0` at `0x337f4` | `INDENT` |
| Font size = 8.0 × `text-scaling-factor`; right margin = 6 × font size | `0x2c7eb` (×8.0), `0x2c770` (×6.0) | `FONT_SIZE`, `RMARGIN` |
| Labels at 0.8 × font size (6.4 pt), tabular figures | `0x30c8a` (×0.8 × 1024) | `LABEL_PX` (Ubuntu digits are already tabular) |
| `num_bars(h)`: n = trunc(h / (font + 14)); 0–1→1, 2–3→2, 4→4, 5→5 (4 if log), >5→5 (6 if log) | `0x2d6b0` | `numBars()` |
| `dely = trunc((h - 23) / n)`, `real_height = dely × n` | `0x30b1a` | `geometry()` |
| **Label loop uses `num_bars(h - 8)` while captions use `num_bars(h)`.** When they differ (h = 110–117) the bottom "0 %" label is not drawn. That is why the reference has no "0 %". | second `get_num_bars` call at `0x30bfe` | `labelBars` in `renderBackground()` |
| Label x = `w - 31 - indent`; y anchored at 0.5 (top), 0.85 (middle), 1.0 (bottom) × text height | `0x30d92`, `0x30e53`, `0x3103c` | `renderBackground()` |
| Grid: horizontal + 7 vertical lines in **one** path, width 0.25, stroked once with the last alpha (0.7) | `0x30d78`, bitmask `0x41` at `0x3165c` | `GRID_ALPHA`, single `stroke()` |
| **Background (gradient, grid, labels) is painted into a `cairo_image_surface` at logical size and scaled up on HiDPI.** This gives the soft labels and the 0.0875 effective grid alpha at 2×. | `cairo_image_surface_create(allocation)` at `0x30c4b` | offscreen canvas at 1×, `drawImage` scaled |
| Background CSS embedded in the binary: `.loadgraph { background: linear-gradient(to bottom, @window_bg_color, @view_bg_color); color: @window_fg_color; }` | string at `0x541c8` | `WINDOW_BG` → `VIEW_BG` gradient |
| Time axis: total = (points − 2) × speed / 1000 × frames_per_unit; 6 divisions at `ceil(i × (W' − rmargin − indent) / 6)`; label anchored left/centre/right; text "%u hrs %u mins %u secs" joined with spaces | `0x30c21`, `0x316fa`, strings `0x52a4d`.. | `renderBackground()`, `Format.formatTimeCaption` |
| Data: line width 1, ROUND cap/join, clip to the plot; x step `(W' − rmargin − indent) / (points − 2)`; y = (1 − v) × real_height + 4; samples equal to −1 are skipped; series drawn last-to-first | `0x31095`–`0x31358` | `draw()` |
| Smooth mode: `curve_to(cx, y_prev, cx, y, x, y)` with cx at half a step | `0x31213`–`0x31252` | `bezierCurveTo` |
| Stacked mode: cumulative `usage / ncpu`, filled | `0x312fe`–`0x31353`, `0x303c5` | `updateCpu()` in `app.js` |
| Log memory scale: v → 0.5 × log10(100 v); captions use `pow(100, v / 100)` | `0x30250`, `0x30a24` | `logPartial()`, `caption()` |
| Graph minimum height 70 px | `set_size_request(-1, 0x46)` | `.load-graph { min-height: 70px }` |
| `num_points = graph-data-points + 2` | `0x3384d` | `resize()` |

### Animation

`gsm_graph_set_speed` (`0x2c950`) installs `g_timeout_add(speed)`. The tick (`0x2ce40`)
fetches data when `render_counter == frames_per_unit − 1`, queues a redraw every tick, and
wraps the counter. Measured scroll: ≈4.4 device px per 100 ms at 2× scale, i.e. one sample
per second at the default 100 ms with **frames_per_unit = 10**. The port uses one shared
clock in `app.js` and requests the sample one frame early so the async IPC reply is in
place on the frame where the scroll offset wraps.

### Network / disk axis

`net_scale` (debug strings `bak*8 %lu, ticks %d…`, `bak %lu new_max…`, `rescale dmax…`):
bytes mode uses 1.1× headroom, a minimum of 1 KiB, one significant digit in the
power-of-1024 unit, rounded up to a multiple of `num_bars`. Bits mode uses `nicenum` on
`max(8 × max, 10000) / ticks`. The axis only rescales when the new max is outside
(0.8 × max, max]. Ported as `rescale()`. Captions: `format_network_rate` for network,
`format_rate(…, false)` for disk.

## Formatting (`src/renderer/format.js`)

`procman::format_size(size, bits)` at `0x41590`: bytes → `g_format_size_full(size,
G_FORMAT_SIZE_IEC_UNITS)`; bits → `size << 3` with `G_FORMAT_SIZE_BITS` (SI: kb, Mb).
Rates append `"%s/s"` (`0x53be9`). Memory/swap call `g_format_size_full(x, iec ? 2 : 0)`
(SI "GB" by default). Strings: `"%.1f%%"` (CPU legend), `"%.0f %%"` (axis),
`"%s (%.1f%%) of %s"`, `"Cache %s"`, `"%s\n%s"`, `"not available"`.

## Colour buttons (`src/renderer/colorbutton.js`)

From `legacy/gsm_color_button.c` (draw at `0x49db0`–`0x4a5fd`, 6-way jump table at `0x49e86`):

- **CPU swatch**: fill, then 1 px `rgba(0,0,0,.5)` at 0.5 inset and `rgba(255,255,255,.4)` at 1.5 inset.
- **Pie**: centre `(w/2)+0.5`; outer radius r − 2.25, hub 4.5, stroke `rgba(0,0,0,.7)`;
  highlight `rgba(255,255,255,.45)` at r − 3.5 / 3.25 with a `1/(r − 3.75)` angular inset;
  outer ring r − 1.25 at `rgba(0,0,0,.2)`. Thresholds 0.01 / 0.03 / 0.99.
- **Arrows**: `arrow_mask.svg` filled with the colour, then `arrow_overlay.svg`. Down arrows
  (network in, disk write) use translate(16,16), rotate(π), translate(−16,−13).
- Hover: each channel +0.125.

## CPU colours beyond the 16 defaults

`procman::generate_colors` (`0x48e70`): start hue from `std::random_device`, step
0.6180339887 (mod 1), `hsv_to_rgb(h, 0.5, 0.95)`, written as `#%04x%04x%04x` (65535 scale).
The colours are saved to settings, so they stay stable. Port: `generateColors()` in
`settings.js`. GDK's 12-digit form is converted for canvas by `ColorButton.css`.

## Layout details measured from the reference

- Expander title row 15 px; legend rows 15 px with 1 px row spacing (pitch 16).
- CPU legend: `rows = (ncpu + 3) / 4`, column-major placement (`0x34734`, `idiv` at `0x34873`);
  hbox spacing 4; name label `width_chars = int(log10(n) + 5)` centred; value label
  `width_chars = 6` centred (`gtk_label_set_width_chars` at `0x3480a`, `0x3497e`).
- Expander `expanded` is bound to `vexpand` (`0x349d5`): collapsed sections give up their
  share of the height.
- Network/disk rows are 16 px each because the 32 px arrow spans both rows; values are
  centred in ≈83 px; extra width goes equally to a spacer after each value column.
- Header: 47 px, tab pill 124 × 34 at `rgba(255,255,255,.095)`, no shade line.
- Window controls (Mint-Y): 20 px circles, 6 px apart; close is `@accent_bg_color`
  (#1f9ede), or #616166 when the window is unfocused.

## Colour management

The display on the reference machine has an ICC profile on the X root window. GTK paints
raw sRGB; Chromium colour-manages and desaturated the colours (#e01b24 came out #c43530).
`main.js` passes `--force-color-profile=srgb` so colours match on calibrated displays,
including Windows machines with display profiles.

## Windows data sources (`src/main/stats/win32.js`)

| Section | API | Notes |
| --- | --- | --- |
| CPU | `os.cpus()` | libuv reports sys = KernelTime − IdleTime; irq is already inside it, so total = user + sys + idle |
| Memory | `K32GetPerformanceInfo` | used = PhysicalTotal − PhysicalAvailable; cache = SystemCache |
| Swap | `NtQuerySystemInformation(SystemPageFileInformation = 18)` | summed page files |
| Network | `GetIfTable2` | skip loopback, NDIS filter interfaces (flag bit 1), and interfaces that are not up |
| Disk | `IOCTL_DISK_PERFORMANCE` on `\\.\PhysicalDriveN` | handle opened with access 0; rescanned every 10 s |

Struct layouts are checked by `tools/check-win32-layout.js` (MIB_IF_ROW2 = 1352 bytes,
InOctets at 1208, OutOctets at 1280). Verified on Windows 11 (28 logical CPUs, two NVMe
disks) against `Get-Counter`, `Win32_OperatingSystem`, `Win32_PageFileUsage` and
`Get-NetAdapterStatistics`: per-core CPU, RAM, page file size, and adapter octets agree.
Cache (SystemCache) is Task Manager's "Cached" (standby + modified), not the `Cache Bytes`
counter. CPU readings step in 1/64 (15.6 ms clock ticks over a 1 s sample).

`GetIfTable2` rows are copied out with `koffi.decode(ptr, offset, 'uint8', len)`.
`koffi.view()` returns an external ArrayBuffer, which Electron's V8 memory cage rejects
with a fatal, uncatchable abort of the main process (it works in plain Node).
