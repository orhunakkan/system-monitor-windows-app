'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
const { Settings } = require('./settings');

function loadStats() {
  if (process.platform !== 'win32')
    return require('./stats/linux');
  try {
    return require('./stats/win32');
  } catch (err) {
    console.error('System Monitor: native sampler unavailable, using fallback:', err);
    return require('./stats/basic');
  }
}

const stats = loadStats();

const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload.js');
const ICON = path.join(__dirname, '..', '..', 'assets', 'icons', process.platform === 'win32' ? 'app.ico' : 'app.png');
// Also the registry value name of the login item; build/installer.nsh removes it on uninstall.
const APP_ID = 'io.github.orhunakkan.SystemMonitorResources';
// Passed by the login item so the app starts in the tray.
const HIDDEN_ARG = '--hidden';

const DIALOGS = {
  preferences: { title: 'Preferences', width: 700, height: 700 },
  shortcuts: { title: 'Shortcuts', width: 420, height: 380 },
  about: { title: 'About System Monitor', width: 360, height: 520 }
};

// GTK paints raw sRGB values without display color management; do the same so
// graph and theme colors match the original exactly on calibrated displays.
app.commandLine.appendSwitch('force-color-profile', 'srgb');

let settings;
let mainWindow = null;
let tray = null;                  // held so the tray icon is not garbage-collected
let quitting = false;
const dialogs = new Map();

// Every view is a frameless window on the same page; callers show it on ready-to-show.
function createWindow(view, { webPreferences, ...options }) {
  const win = new BrowserWindow({
    icon: ICON,
    frame: false,
    show: false,
    webPreferences: { preload: PRELOAD, ...webPreferences },
    ...options
  });
  win.setMenu(null);
  win.loadFile(RENDERER, { query: { view } });
  return win;
}

function forwardWindowState(win, events) {
  for (const ev of events)
    win.on(ev, () => win.webContents.send('window:state', windowState(win)));
}

function createMainWindow() {
  mainWindow = createWindow('main', {
    title: 'System Monitor',
    width: settings.get('window-width'),
    height: settings.get('window-height'),
    minWidth: 620,
    minHeight: 480,
    backgroundColor: '#2e2e33',
    // Keep sampling at full rate while hidden in the tray, so the graphs have history.
    webPreferences: { backgroundThrottling: false }
  });
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes(HIDDEN_ARG))
      showMainWindow();
  });
  forwardWindowState(mainWindow,
    ['maximize', 'unmaximize', 'focus', 'blur', 'show', 'hide', 'minimize', 'restore']);
  // Closing hides to the tray; only Quit (tray menu, Ctrl+Q) exits.
  mainWindow.on('close', (e) => {
    settings.set('maximized', mainWindow.isMaximized());
    if (!mainWindow.isMaximized()) {
      const [w, h] = mainWindow.getSize();
      settings.set('window-width', w);
      settings.set('window-height', h);
    }
    if (quitting)
      return;
    e.preventDefault();
    mainWindow.hide();
  });
  // Sign-out or shutdown: let the window close instead of hiding.
  mainWindow.on('session-end', () => { quitting = true; });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

function showMainWindow() {
  if (!mainWindow)
    return;
  // A window started in the tray has never been shown; maximize() also shows it.
  if (!mainWindow.isVisible() && settings.get('maximized') && !mainWindow.isMaximized())
    mainWindow.maximize();
  if (mainWindow.isMinimized())
    mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  tray = new Tray(ICON);
  tray.setToolTip('System Monitor');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show System Monitor', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('click', showMainWindow);
}

// Windows only: registers HKCU\...\Run\<APP_ID>.
function applyLoginItem() {
  if (process.platform !== 'win32')
    return;
  // Run from source, electron.exe needs the app path before our own flag.
  const args = app.isPackaged ? [HIDDEN_ARG] : [app.getAppPath(), HIDDEN_ARG];
  app.setLoginItemSettings({
    openAtLogin: settings.get('start-at-login'),
    name: APP_ID,
    path: process.execPath,
    args
  });
}

function windowState(win) {
  return {
    maximized: win.isMaximized(),
    focused: win.isFocused(),
    visible: win.isVisible() && !win.isMinimized()
  };
}

function openDialog(name) {
  const spec = DIALOGS[name];
  if (!spec || !mainWindow)
    return;
  if (dialogs.has(name)) {
    dialogs.get(name).focus();
    return;
  }
  const win = createWindow(name, {
    title: spec.title,
    parent: mainWindow,
    modal: true,
    width: spec.width,
    height: spec.height,
    minWidth: 360,
    minHeight: 200,
    resizable: name === 'preferences',
    minimizable: false,
    maximizable: false,
    backgroundColor: name === 'preferences' ? '#2e2e33' : '#383838'
  });
  win.once('ready-to-show', () => win.show());
  forwardWindowState(win, ['focus', 'blur']);
  win.on('closed', () => dialogs.delete(name));
  dialogs.set(name, win);
}

function broadcastSettings() {
  for (const win of BrowserWindow.getAllWindows())
    win.webContents.send('settings:changed', settings.all());
}

function registerIpc() {
  ipcMain.handle('stats:sample', () => stats.sample());
  ipcMain.handle('settings:all', () => settings.all());
  ipcMain.handle('settings:set', (_e, key, value) => {
    if (!settings.set(key, value))
      return;
    if (key === 'start-at-login')
      applyLoginItem();
    broadcastSettings();
  });
  ipcMain.on('window:action', (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win)
      return;
    if (action === 'minimize')
      win.minimize();
    else if (action === 'toggle-maximize')
      win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close')
      win.close();
  });
  ipcMain.handle('window:state', (e) => windowState(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.on('app:open-dialog', (_e, name) => openDialog(name));
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('app:open-url', (_e, url) => {
    if (/^https:\/\//.test(url))
      shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!argv.includes(HIDDEN_ARG))
      showMainWindow();
  });
  app.whenReady().then(() => {
    if (process.platform === 'win32')
      app.setAppUserModelId(APP_ID);
    settings = new Settings(app.getPath('userData'));
    settings.ensureCpuColors(stats.sample().cpu.length);
    // Re-register so the Run entry follows the setting after a reinstall or move.
    if (app.isPackaged)
      applyLoginItem();
    registerIpc();
    createMainWindow();
    createTray();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => app.quit());
}
