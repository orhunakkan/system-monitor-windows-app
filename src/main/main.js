'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
const ICON = path.join(__dirname, '..', '..', 'assets', 'icons', process.platform === 'win32' ? 'app.ico' : 'app.png');

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
const dialogs = new Map();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'System Monitor',
    icon: ICON,
    width: settings.get('window-width'),
    height: settings.get('window-height'),
    minWidth: 620,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: '#2e2e33',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') }
  });
  mainWindow.setMenu(null);
  mainWindow.loadFile(RENDERER, { query: { view: 'main' } });
  mainWindow.once('ready-to-show', () => {
    if (settings.get('maximized'))
      mainWindow.maximize();
    mainWindow.show();
  });
  const sendState = () => mainWindow.webContents.send('window:state', windowState(mainWindow));
  for (const ev of ['maximize', 'unmaximize', 'focus', 'blur'])
    mainWindow.on(ev, sendState);
  mainWindow.on('close', () => {
    settings.set('maximized', mainWindow.isMaximized());
    if (!mainWindow.isMaximized()) {
      const [w, h] = mainWindow.getSize();
      settings.set('window-width', w);
      settings.set('window-height', h);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

function windowState(win) {
  return { maximized: win.isMaximized(), focused: win.isFocused() };
}

function openDialog(name) {
  const spec = DIALOGS[name];
  if (!spec || !mainWindow)
    return;
  if (dialogs.has(name)) {
    dialogs.get(name).focus();
    return;
  }
  const win = new BrowserWindow({
    title: spec.title,
    icon: ICON,
    parent: mainWindow,
    modal: true,
    width: spec.width,
    height: spec.height,
    minWidth: 360,
    minHeight: 200,
    frame: false,
    show: false,
    resizable: name === 'preferences',
    minimizable: false,
    maximizable: false,
    backgroundColor: name === 'preferences' ? '#2e2e33' : '#383838',
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js') }
  });
  win.setMenu(null);
  win.loadFile(RENDERER, { query: { view: name } });
  win.once('ready-to-show', () => win.show());
  for (const ev of ['focus', 'blur'])
    win.on(ev, () => win.webContents.send('window:state', windowState(win)));
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
    if (settings.set(key, value))
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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized())
        mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    if (process.platform === 'win32')
      app.setAppUserModelId('io.github.orhunakkan.SystemMonitorResources');
    settings = new Settings(app.getPath('userData'));
    settings.ensureCpuColors(stats.sample().cpu.length);
    registerIpc();
    createMainWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
