'use strict';

const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const START_URL = 'https://www.chess.com/play/online';
const MIN_SIZE = 300;
const DEFAULT_SIZE = 540;
const DEFAULT_SHORTCUTS = Object.freeze({
  rematch: 'Control+Alt+KeyR',
  newGame: 'Control+Alt+KeyN',
  draw: 'Control+Alt+KeyD',
  resign: 'Control+Alt+KeyQ'
});

let mainWindow = null;
let saveBoundsTimer = null;
let dragState = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function preferencesPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function sanitizeShortcuts(candidate) {
  const shortcuts = { ...DEFAULT_SHORTCUTS };
  if (!candidate || typeof candidate !== 'object') return shortcuts;

  for (const action of Object.keys(shortcuts)) {
    const value = candidate[action];
    if (typeof value === 'string' && value.length > 0 && value.length <= 80) {
      shortcuts[action] = value;
    }
  }
  return shortcuts;
}

function readShortcuts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8'));
    return sanitizeShortcuts(parsed.shortcuts);
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

function writeShortcuts(candidate) {
  const shortcuts = sanitizeShortcuts(candidate);
  fs.writeFileSync(preferencesPath(), JSON.stringify({ shortcuts }, null, 2));
  return shortcuts;
}

function readWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    const width = Number(parsed.width);
    const height = Number(parsed.height);

    if (width >= MIN_SIZE && height >= MIN_SIZE) {
      return {
        width: Math.round(width),
        height: Math.round(height),
        ...(Number.isFinite(parsed.x) ? { x: Math.round(parsed.x) } : {}),
        ...(Number.isFinite(parsed.y) ? { y: Math.round(parsed.y) } : {})
      };
    }
  } catch {
    // There is no saved window state on the first launch.
  }

  return { width: DEFAULT_SIZE, height: DEFAULT_SIZE };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(mainWindow.getBounds()));
  } catch (error) {
    console.warn('Could not save the window position:', error.message);
  }
}

function queueWindowStateSave() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveWindowState, 250);
}

function isSafeWebUrl(rawUrl) {
  try {
    return new URL(rawUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

async function runSmokeTest(win) {
  if (process.env.CHESS_MINI_SMOKE_TEST !== '1') return;

  await new Promise((resolve) => setTimeout(resolve, 1500));

  win.webContents.sendInputEvent({
    type: 'keyDown',
    keyCode: 'M',
    modifiers: ['control', 'shift']
  });
  win.webContents.sendInputEvent({
    type: 'keyUp',
    keyCode: 'M',
    modifiers: ['control', 'shift']
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

  const clockScreenshot = await win.webContents.capturePage();
  const clockScreenshotPath = path.join(app.getPath('temp'), 'chess-desktop-mini-clocks.png');
  fs.writeFileSync(clockScreenshotPath, clockScreenshot.toPNG());

  const controls = await win.webContents.executeJavaScript(`(() => {
    const toolbar = document.getElementById('chess-desktop-mini-toolbar');
    const settings = toolbar?.querySelector('[data-action="settings"]')?.getBoundingClientRect();
    const grip = toolbar?.querySelector('.chess-mini-grip')?.getBoundingClientRect();
    const point = (rect) => rect ? {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2)
    } : null;
    return { settings: point(settings), grip: point(grip) };
  })()`);

  win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(win.getContentBounds().width / 2), y: 2 });
  await new Promise((resolve) => setTimeout(resolve, 200));

  const expandedControls = await win.webContents.executeJavaScript(`(() => {
    const toolbar = document.getElementById('chess-desktop-mini-toolbar');
    const point = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null;
    };
    return {
      settings: point(toolbar?.querySelector('[data-action="settings"]')),
      grip: point(toolbar?.querySelector('.chess-mini-grip'))
    };
  })()`);

  if (expandedControls.settings) {
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...expandedControls.settings });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...expandedControls.settings });
  }

  const boundsBeforeDrag = win.getBounds();
  if (expandedControls.grip) {
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...expandedControls.grip });
    win.webContents.sendInputEvent({
      type: 'mouseMove',
      button: 'left',
      x: expandedControls.grip.x + 18,
      y: expandedControls.grip.y + 12
    });
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      button: 'left',
      clickCount: 1,
      x: expandedControls.grip.x + 18,
      y: expandedControls.grip.y + 12
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const boundsAfterDrag = win.getBounds();
  const dragMoved = boundsAfterDrag.x !== boundsBeforeDrag.x || boundsAfterDrag.y !== boundsBeforeDrag.y;
  if (dragMoved) win.setBounds(boundsBeforeDrag, false);

  const result = await win.webContents.executeJavaScript(`(() => {
    const board = document.querySelector('[data-chess-desktop-mini-board]');
    const toolbar = document.getElementById('chess-desktop-mini-toolbar');
    const clocks = [...document.querySelectorAll('#chess-desktop-mini-clocks .chess-mini-clock[data-present="true"]')]
      .map((clock) => {
        const rect = clock.getBoundingClientRect();
        const style = getComputedStyle(clock);
        return {
          position: clock.dataset.position,
          text: clock.textContent.trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
          color: style.color,
          background: style.backgroundColor
        };
      });
    const rect = board?.getBoundingClientRect();
    return {
      url: location.href,
      toolbar: Boolean(toolbar),
      settingsButton: Boolean(toolbar?.querySelector('[data-action="settings"]')),
      settingsOpen: toolbar?.classList.contains('chess-mini-settings-open') || false,
      shortcutRows: toolbar?.querySelectorAll('[data-shortcut-action]').length || 0,
      board: Boolean(board),
      boardOnly: document.body.classList.contains('chess-desktop-mini-board-only'),
      boardWidth: Math.round(rect?.width || 0),
      boardHeight: Math.round(rect?.height || 0),
      clocks,
      viewport: [innerWidth, innerHeight]
    };
  })()`);
  result.dragMoved = dragMoved;
  result.controlsFound = Boolean(controls.settings && controls.grip);

  const screenshot = await win.webContents.capturePage();
  const screenshotPath = path.join(app.getPath('temp'), 'chess-desktop-mini-smoke.png');
  fs.writeFileSync(screenshotPath, screenshot.toPNG());

  const passed = result.toolbar && result.settingsButton && result.settingsOpen &&
    result.shortcutRows === 4 && result.dragMoved && result.controlsFound &&
    result.board && result.boardOnly &&
    result.boardWidth >= 180 && Math.abs(result.boardWidth - result.boardHeight) <= 2 &&
    result.clocks.length === 2 &&
    result.clocks.every((clock) => clock.text && clock.height >= 30 && clock.visible) &&
    new Set(result.clocks.map((clock) => clock.position)).size === 2;

  console.log(`CHESS_MINI_SMOKE ${JSON.stringify({
    ...result,
    screenshotPath,
    clockScreenshotPath,
    passed
  })}`);
  app.exit(passed ? 0 : 1);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...readWindowState(),
    minWidth: MIN_SIZE,
    minHeight: MIN_SIZE,
    frame: false,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#20201f',
    title: 'Chess Desktop Mini',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:chess-desktop-mini',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  mainWindow.setAspectRatio(1);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('resize', queueWindowStateSave);
  mainWindow.on('move', queueWindowStateSave);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('blur', () => {
    dragState = null;
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isSafeWebUrl(url)) return { action: 'deny' };

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 700,
        parent: mainWindow,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:chess-desktop-mini',
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        }
      }
    };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSafeWebUrl(url)) event.preventDefault();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    runSmokeTest(mainWindow).catch((error) => {
      console.error('CHESS_MINI_SMOKE_ERROR', error);
      app.exit(1);
    });
  });

  mainWindow.loadURL(START_URL);
}

function registerIpc() {
  ipcMain.on('chess-mini:window-action', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== mainWindow) return;

    switch (action) {
      case 'close':
        win.close();
        break;
      case 'minimize':
        win.minimize();
        break;
      case 'reload':
        win.webContents.reload();
        break;
      case 'new-game':
        win.loadURL(START_URL);
        break;
      case 'toggle-pin': {
        const next = !win.isAlwaysOnTop();
        win.setAlwaysOnTop(next, 'floating');
        win.webContents.send('chess-mini:pin-state', next);
        break;
      }
      default:
        break;
    }
  });

  ipcMain.on('chess-mini:drag-start', (event, point) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== mainWindow || !point ||
      !Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return;

    dragState = {
      senderId: event.sender.id,
      screenX: point.screenX,
      screenY: point.screenY,
      bounds: win.getBounds()
    };
  });

  ipcMain.on('chess-mini:drag-move', (event, point) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== mainWindow || !dragState ||
      dragState.senderId !== event.sender.id || !point ||
      !Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return;

    const simulatedInput = dragState.screenX === 0 && dragState.screenY === 0 &&
      point.screenX === 0 && point.screenY === 0 &&
      Number.isFinite(point.deltaX) && Number.isFinite(point.deltaY);
    const deltaX = simulatedInput ? point.deltaX : point.screenX - dragState.screenX;
    const deltaY = simulatedInput ? point.deltaY : point.screenY - dragState.screenY;
    const x = Math.round(dragState.bounds.x + deltaX);
    const y = Math.round(dragState.bounds.y + deltaY);
    win.setPosition(x, y, false);
  });

  ipcMain.on('chess-mini:drag-end', (event) => {
    if (dragState?.senderId === event.sender.id) dragState = null;
  });

  ipcMain.handle('chess-mini:get-shortcuts', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win === mainWindow ? readShortcuts() : { ...DEFAULT_SHORTCUTS };
  });

  ipcMain.handle('chess-mini:save-shortcuts', (event, shortcuts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win !== mainWindow) return { ...DEFAULT_SHORTCUTS };
    return writeShortcuts(shortcuts);
  });
}

app.whenReady().then(() => {
  const chessSession = session.fromPartition('persist:chess-desktop-mini');
  chessSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
