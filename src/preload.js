'use strict';

const { ipcRenderer } = require('electron');

const TOOLBAR_ID = 'chess-desktop-mini-toolbar';
const STYLE_ID = 'chess-desktop-mini-style';
const BOARD_MARKER = 'data-chess-desktop-mini-board';
const BOARD_ONLY_CLASS = 'chess-desktop-mini-board-only';
const SETTINGS_CLASS = 'chess-mini-settings';
const DEFAULT_SHORTCUTS = Object.freeze({
  rematch: 'Control+Alt+KeyR',
  newGame: 'Control+Alt+KeyN',
  draw: 'Control+Alt+KeyD',
  resign: 'Control+Alt+KeyQ'
});
const SHORTCUT_ACTIONS = Object.freeze([
  { id: 'rematch', label: 'Revanche' },
  { id: 'newGame', label: 'Neue Partie' },
  { id: 'draw', label: 'Remis anbieten' },
  { id: 'resign', label: 'Aufgeben' }
]);

let boardModeEnabled = true;
let manuallyForced = false;
let currentBoard = null;
let refreshQueued = false;
let boardOnlyActive = false;
let shortcuts = { ...DEFAULT_SHORTCUTS };
let capturingShortcut = null;
let toastTimer = null;

function isRealUserEvent(event) {
  return event.isTrusted;
}

function sendAction(action, event) {
  if (!isRealUserEvent(event)) return;
  ipcRenderer.send('chess-mini:window-action', action);
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${TOOLBAR_ID} {
      position: fixed !important;
      z-index: 2147483647 !important;
      top: 0 !important;
      left: 50% !important;
      width: min(310px, calc(100vw - 18px)) !important;
      height: 34px !important;
      transform: translateX(-50%) translateY(-27px) !important;
      display: flex !important;
      align-items: center !important;
      gap: 3px !important;
      padding: 3px 5px !important;
      box-sizing: border-box !important;
      border-radius: 0 0 10px 10px !important;
      background: rgba(24, 24, 23, 0.93) !important;
      color: #f1f1f1 !important;
      box-shadow: 0 3px 14px rgba(0, 0, 0, 0.3) !important;
      opacity: 0.18 !important;
      transition: transform 140ms ease, opacity 140ms ease !important;
      font: 600 13px/1 system-ui, sans-serif !important;
      visibility: visible !important;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
    }

    #${TOOLBAR_ID}:hover,
    #${TOOLBAR_ID}:focus-within,
    #${TOOLBAR_ID}.chess-mini-settings-open {
      transform: translateX(-50%) translateY(0) !important;
      opacity: 1 !important;
    }

    #${TOOLBAR_ID} *,
    #${TOOLBAR_ID} *::before,
    #${TOOLBAR_ID} *::after {
      box-sizing: border-box !important;
      visibility: visible !important;
    }

    #${TOOLBAR_ID} .chess-mini-grip {
      min-width: 58px !important;
      flex: 1 !important;
      text-align: center !important;
      color: rgba(255, 255, 255, 0.64) !important;
      cursor: move !important;
      user-select: none !important;
      touch-action: none !important;
      letter-spacing: 2px !important;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
    }

    #${TOOLBAR_ID} > button {
      width: 27px !important;
      height: 27px !important;
      min-width: 27px !important;
      min-height: 27px !important;
      margin: 0 !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
      border: 0 !important;
      border-radius: 6px !important;
      background: transparent !important;
      color: #ededed !important;
      box-shadow: none !important;
      cursor: pointer !important;
      font: 600 15px/1 system-ui, sans-serif !important;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
    }

    #${TOOLBAR_ID} > button:hover {
      background: rgba(255, 255, 255, 0.13) !important;
    }

    #${TOOLBAR_ID} > button[data-active="true"] {
      color: #a8d46f !important;
      background: rgba(129, 182, 76, 0.15) !important;
    }

    #${TOOLBAR_ID} .chess-mini-close:hover {
      color: white !important;
      background: #c74242 !important;
    }

    #${TOOLBAR_ID} .${SETTINGS_CLASS} {
      position: absolute !important;
      top: 40px !important;
      left: 50% !important;
      width: min(340px, calc(100vw - 18px)) !important;
      transform: translateX(-50%) !important;
      display: none !important;
      padding: 14px !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      border-radius: 12px !important;
      background: rgba(31, 31, 29, 0.98) !important;
      color: #f4f4f3 !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45) !important;
      font: 500 13px/1.3 system-ui, sans-serif !important;
      -webkit-app-region: no-drag !important;
      app-region: no-drag !important;
    }

    #${TOOLBAR_ID}.chess-mini-settings-open .${SETTINGS_CLASS} {
      display: block !important;
    }

    #${TOOLBAR_ID} .chess-mini-settings-title {
      margin: 0 0 11px !important;
      color: #fff !important;
      font-size: 14px !important;
      font-weight: 700 !important;
    }

    #${TOOLBAR_ID} .chess-mini-shortcut-row {
      display: grid !important;
      grid-template-columns: 1fr minmax(132px, auto) !important;
      align-items: center !important;
      gap: 10px !important;
      min-height: 38px !important;
    }

    #${TOOLBAR_ID} .${SETTINGS_CLASS} button {
      width: auto !important;
      min-width: 0 !important;
      height: 29px !important;
      min-height: 29px !important;
      margin: 0 !important;
      padding: 0 9px !important;
      border: 1px solid rgba(255, 255, 255, 0.13) !important;
      border-radius: 7px !important;
      background: rgba(255, 255, 255, 0.07) !important;
      color: #f1f1f1 !important;
      box-shadow: none !important;
      cursor: pointer !important;
      font: 600 12px/1 system-ui, sans-serif !important;
    }

    #${TOOLBAR_ID} .${SETTINGS_CLASS} button:hover,
    #${TOOLBAR_ID} .${SETTINGS_CLASS} button[data-capturing="true"] {
      border-color: #86ad5d !important;
      background: rgba(118, 150, 86, 0.22) !important;
    }

    #${TOOLBAR_ID} .chess-mini-settings-footer {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 10px !important;
      margin-top: 10px !important;
      padding-top: 10px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
    }

    #${TOOLBAR_ID} .chess-mini-settings-status {
      flex: 1 !important;
      color: rgba(255, 255, 255, 0.62) !important;
      font-size: 11px !important;
    }

    #${TOOLBAR_ID} .chess-mini-settings-status[data-error="true"] {
      color: #f0a2a2 !important;
    }

    #${TOOLBAR_ID} .chess-mini-toast {
      position: absolute !important;
      top: 41px !important;
      left: 50% !important;
      max-width: min(330px, calc(100vw - 18px)) !important;
      transform: translateX(-50%) !important;
      padding: 8px 11px !important;
      border-radius: 8px !important;
      background: rgba(24, 24, 23, 0.95) !important;
      color: #f3f3f2 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 140ms ease !important;
      white-space: nowrap !important;
      font-size: 12px !important;
    }

    #${TOOLBAR_ID} .chess-mini-toast[data-visible="true"] {
      opacity: 1 !important;
    }

    body.${BOARD_ONLY_CLASS} {
      overflow: hidden !important;
      background: #20201f !important;
    }

    body.${BOARD_ONLY_CLASS} * {
      visibility: hidden !important;
    }

    body.${BOARD_ONLY_CLASS} [${BOARD_MARKER}],
    body.${BOARD_ONLY_CLASS} [${BOARD_MARKER}] *,
    body.${BOARD_ONLY_CLASS} #${TOOLBAR_ID},
    body.${BOARD_ONLY_CLASS} #${TOOLBAR_ID} * {
      visibility: visible !important;
    }

    body.${BOARD_ONLY_CLASS} [${BOARD_MARKER}] {
      position: fixed !important;
      z-index: 2147483000 !important;
      top: 50% !important;
      left: 50% !important;
      width: min(100vw, 100vh) !important;
      height: min(100vw, 100vh) !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: translate(-50%, -50%) !important;
      border: 0 !important;
    }

    body.${BOARD_ONLY_CLASS} [role="dialog"],
    body.${BOARD_ONLY_CLASS} [role="dialog"] *,
    body.${BOARD_ONLY_CLASS} [class*="promotion"],
    body.${BOARD_ONLY_CLASS} [class*="promotion"] * {
      visibility: visible !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function toolbarButton(label, title, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  if (className) button.className = className;
  return button;
}

function shortcutFromEvent(event) {
  if (['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(event.code)) {
    return null;
  }

  const parts = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  if ((!event.ctrlKey && !event.altKey && !event.metaKey) || !event.code) return null;
  parts.push(event.code);
  return parts.join('+');
}

function displayShortcut(shortcut) {
  const names = {
    Control: 'Strg',
    Alt: 'Alt',
    Shift: 'Umschalt',
    Meta: 'Super',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Leertaste'
  };

  return shortcut.split('+').map((part) => {
    if (names[part]) return names[part];
    if (part.startsWith('Key')) return part.slice(3);
    if (part.startsWith('Digit')) return part.slice(5);
    return part;
  }).join(' + ');
}

function setSettingsStatus(message, error = false) {
  const status = document.querySelector(`#${TOOLBAR_ID} .chess-mini-settings-status`);
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(error);
}

function refreshShortcutButtons() {
  for (const action of SHORTCUT_ACTIONS) {
    const button = document.querySelector(`#${TOOLBAR_ID} [data-shortcut-action="${action.id}"]`);
    if (!button || button.dataset.capturing === 'true') continue;
    button.textContent = displayShortcut(shortcuts[action.id]);
  }
}

async function saveShortcuts(nextShortcuts, message) {
  try {
    shortcuts = await ipcRenderer.invoke('chess-mini:save-shortcuts', nextShortcuts);
    refreshShortcutButtons();
    setSettingsStatus(message);
  } catch {
    setSettingsStatus('Speichern fehlgeschlagen', true);
  }
}

function beginShortcutCapture(actionId) {
  capturingShortcut = actionId;
  for (const button of document.querySelectorAll(`#${TOOLBAR_ID} [data-shortcut-action]`)) {
    const selected = button.dataset.shortcutAction === actionId;
    button.dataset.capturing = String(selected);
    button.textContent = selected ? 'Tasten drücken …' : displayShortcut(shortcuts[button.dataset.shortcutAction]);
  }
  setSettingsStatus('Neue Kombination drücken · Esc bricht ab');
}

function cancelShortcutCapture() {
  capturingShortcut = null;
  for (const button of document.querySelectorAll(`#${TOOLBAR_ID} [data-shortcut-action]`)) {
    button.dataset.capturing = 'false';
  }
  refreshShortcutButtons();
  setSettingsStatus('Kombination anklicken und neu eingeben');
}

function createSettingsPanel() {
  const panel = document.createElement('div');
  panel.className = SETTINGS_CLASS;
  panel.setAttribute('aria-label', 'Tastenkombinationen');

  const title = document.createElement('div');
  title.className = 'chess-mini-settings-title';
  title.textContent = 'Tastenkombinationen';
  panel.appendChild(title);

  for (const action of SHORTCUT_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'chess-mini-shortcut-row';

    const label = document.createElement('span');
    label.textContent = action.label;

    const shortcutButton = document.createElement('button');
    shortcutButton.type = 'button';
    shortcutButton.dataset.shortcutAction = action.id;
    shortcutButton.dataset.capturing = 'false';
    shortcutButton.textContent = displayShortcut(shortcuts[action.id]);
    shortcutButton.addEventListener('click', (event) => {
      if (isRealUserEvent(event)) beginShortcutCapture(action.id);
    });

    row.append(label, shortcutButton);
    panel.appendChild(row);
  }

  const footer = document.createElement('div');
  footer.className = 'chess-mini-settings-footer';

  const status = document.createElement('span');
  status.className = 'chess-mini-settings-status';
  status.textContent = 'Kombination anklicken und neu eingeben';

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Standard';
  reset.title = 'Standardbelegung wiederherstellen';
  reset.addEventListener('click', (event) => {
    if (!isRealUserEvent(event)) return;
    capturingShortcut = null;
    saveShortcuts({ ...DEFAULT_SHORTCUTS }, 'Standardbelegung wiederhergestellt');
  });

  footer.append(status, reset);
  panel.appendChild(footer);
  return panel;
}

function showToast(message) {
  const toast = document.querySelector(`#${TOOLBAR_ID} .chess-mini-toast`);
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.visible = 'true';
  toastTimer = setTimeout(() => {
    toast.dataset.visible = 'false';
  }, 2200);
}

function usableControl(element) {
  if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none';
}

function controlLabel(element) {
  return [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('data-tooltip'),
    element.textContent
  ].filter(Boolean).join(' ').trim();
}

function findGameControl(action) {
  const selectors = {
    rematch: [
      '[data-cy*="rematch" i]',
      '[data-testid*="rematch" i]',
      '[aria-label*="Rematch" i]',
      '[aria-label*="Revanche" i]'
    ],
    draw: [
      '#board-controls-draw',
      '[data-cy*="draw" i]',
      '[aria-label*="Offer Draw" i]',
      '[aria-label*="Remis" i]'
    ],
    resign: [
      '#board-controls-resign',
      '[data-cy*="resign" i]',
      '[aria-label*="Resign" i]',
      '[aria-label*="Aufgeben" i]'
    ]
  };
  const labels = {
    rematch: /\b(rematch|revenge|revanche|revanchieren|erneut spielen|noch einmal)\b/i,
    draw: /\b(offer draw|draw offer|remis anbieten|remis)\b/i,
    resign: /\b(resign|give up|aufgeben)\b/i
  };

  for (const selector of selectors[action] || []) {
    const match = [...document.querySelectorAll(selector)].find(usableControl);
    if (match) return match;
  }

  return [...document.querySelectorAll('button, [role="button"]')]
    .find((element) => usableControl(element) && labels[action]?.test(controlLabel(element))) || null;
}

function performShortcutAction(action) {
  if (action === 'newGame') {
    ipcRenderer.send('chess-mini:window-action', 'new-game');
    return;
  }

  const control = findGameControl(action);
  if (!control) {
    const label = SHORTCUT_ACTIONS.find((candidate) => candidate.id === action)?.label || 'Aktion';
    showToast(`${label}: Schaltfläche gerade nicht verfügbar`);
    return;
  }

  control.click();
  const messages = {
    rematch: 'Revanche angefordert',
    draw: 'Remis angeboten',
    resign: 'Aufgeben geöffnet'
  };
  showToast(messages[action]);
}

function attachManualDrag(grip) {
  let pointerId = null;
  let startClientX = 0;
  let startClientY = 0;

  const finish = () => {
    if (pointerId === null) return;
    pointerId = null;
    ipcRenderer.send('chess-mini:drag-end');
  };

  grip.addEventListener('pointerdown', (event) => {
    if (!isRealUserEvent(event) || event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    grip.setPointerCapture(pointerId);
    ipcRenderer.send('chess-mini:drag-start', { screenX: event.screenX, screenY: event.screenY });
  });

  grip.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    ipcRenderer.send('chess-mini:drag-move', {
      screenX: event.screenX,
      screenY: event.screenY,
      deltaX: event.clientX - startClientX,
      deltaY: event.clientY - startClientY
    });
  });

  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', finish);
  grip.addEventListener('lostpointercapture', finish);
}

function injectToolbar() {
  if (!document.body || document.getElementById(TOOLBAR_ID)) return;

  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_ID;
  toolbar.setAttribute('aria-label', 'Chess Desktop Mini Steuerung');

  const newGame = toolbarButton('＋', 'Neue Partie / Startseite');
  newGame.addEventListener('click', (event) => sendAction('new-game', event));

  const boardToggle = toolbarButton('▦', 'Nur Brett anzeigen (Strg+Umschalt+M)');
  boardToggle.dataset.action = 'board-toggle';
  boardToggle.addEventListener('click', (event) => {
    if (!isRealUserEvent(event)) return;
    boardModeEnabled = !document.body.classList.contains(BOARD_ONLY_CLASS);
    manuallyForced = boardModeEnabled;
    applyBoardMode();
  });

  const grip = document.createElement('div');
  grip.className = 'chess-mini-grip';
  grip.textContent = '•••';
  grip.title = 'Fenster ziehen';
  attachManualDrag(grip);

  const settingsButton = toolbarButton('⚙', 'Tastenkombinationen einstellen');
  settingsButton.dataset.action = 'settings';
  settingsButton.addEventListener('click', (event) => {
    if (!isRealUserEvent(event)) return;
    const open = toolbar.classList.toggle('chess-mini-settings-open');
    settingsButton.dataset.active = String(open);
    if (!open) cancelShortcutCapture();
  });

  const pin = toolbarButton('⌖', 'Immer im Vordergrund');
  pin.dataset.action = 'pin';
  pin.addEventListener('click', (event) => sendAction('toggle-pin', event));

  const reload = toolbarButton('↻', 'Chess.com neu laden');
  reload.addEventListener('click', (event) => sendAction('reload', event));

  const minimize = toolbarButton('−', 'Minimieren');
  minimize.addEventListener('click', (event) => sendAction('minimize', event));

  const close = toolbarButton('×', 'Schließen', 'chess-mini-close');
  close.addEventListener('click', (event) => sendAction('close', event));

  const toast = document.createElement('div');
  toast.className = 'chess-mini-toast';
  toast.dataset.visible = 'false';

  toolbar.append(
    newGame,
    boardToggle,
    grip,
    settingsButton,
    pin,
    reload,
    minimize,
    close,
    createSettingsPanel(),
    toast
  );
  document.body.appendChild(toolbar);
}

function findBoard() {
  const selectors = [
    'wc-chess-board#board-single',
    'wc-chess-board.board',
    'wc-chess-board',
    '#board-single',
    '[data-board="main-board"]',
    '.board'
  ];

  for (const selector of selectors) {
    for (const candidate of document.querySelectorAll(selector)) {
      if (candidate.id === TOOLBAR_ID || candidate.closest(`#${TOOLBAR_ID}`)) continue;
      const rect = candidate.getBoundingClientRect();
      const ratio = rect.height > 0 ? rect.width / rect.height : 0;
      if (rect.width >= 180 && rect.height >= 180 && ratio > 0.82 && ratio < 1.18) {
        return candidate;
      }
    }
  }

  return null;
}

function looksLikeActiveGame() {
  return /^\/(game|daily)\//.test(location.pathname) ||
    Boolean(document.querySelector('[class*="clock"][class*="active"], [data-cy*="clock"]'));
}

function applyBoardMode() {
  if (!document.body) return;

  const foundBoard = findBoard();
  const boardChanged = currentBoard !== foundBoard;
  if (currentBoard && currentBoard !== foundBoard) {
    currentBoard.removeAttribute(BOARD_MARKER);
  }

  currentBoard = foundBoard;
  if (currentBoard && !currentBoard.hasAttribute(BOARD_MARKER)) {
    currentBoard.setAttribute(BOARD_MARKER, '');
  }

  const active = boardModeEnabled && Boolean(currentBoard) && (manuallyForced || looksLikeActiveGame());
  document.body.classList.toggle(BOARD_ONLY_CLASS, active);

  const toggle = document.querySelector(`#${TOOLBAR_ID} [data-action="board-toggle"]`);
  if (toggle) {
    toggle.dataset.active = String(active);
    toggle.title = active ? 'Ganze Chess.com-Seite anzeigen' : 'Nur Brett anzeigen (Strg+Umschalt+M)';
  }

  if (active && (active !== boardOnlyActive || boardChanged)) {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  boardOnlyActive = active;
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    injectStyle();
    injectToolbar();
    applyBoardMode();
  });
}

async function loadShortcuts() {
  try {
    shortcuts = await ipcRenderer.invoke('chess-mini:get-shortcuts');
    refreshShortcutButtons();
  } catch {
    shortcuts = { ...DEFAULT_SHORTCUTS };
  }
}

function start() {
  injectStyle();
  injectToolbar();
  applyBoardMode();
  loadShortcuts();

  new MutationObserver(queueRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener('popstate', queueRefresh);
  document.addEventListener('keydown', (event) => {
    if (capturingShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;

      if (event.key === 'Escape') {
        cancelShortcutCapture();
        return;
      }

      const captured = shortcutFromEvent(event);
      if (!captured) {
        setSettingsStatus('Bitte mindestens Strg, Alt oder Super mit einer Taste verwenden', true);
        return;
      }

      if (captured === 'Control+Shift+KeyM' || captured === 'Shift+Meta+KeyM') {
        setSettingsStatus('Strg + Umschalt + M ist für den Brettmodus reserviert', true);
        return;
      }

      const duplicate = Object.entries(shortcuts)
        .find(([action, value]) => action !== capturingShortcut && value === captured);
      if (duplicate) {
        const label = SHORTCUT_ACTIONS.find((action) => action.id === duplicate[0])?.label;
        setSettingsStatus(`Bereits für „${label}“ belegt`, true);
        return;
      }

      const action = SHORTCUT_ACTIONS.find((candidate) => candidate.id === capturingShortcut);
      const next = { ...shortcuts, [capturingShortcut]: captured };
      capturingShortcut = null;
      for (const button of document.querySelectorAll(`#${TOOLBAR_ID} [data-shortcut-action]`)) {
        button.dataset.capturing = 'false';
      }
      saveShortcuts(next, `${action.label}: ${displayShortcut(captured)}`);
      return;
    }

    const pressedShortcut = shortcutFromEvent(event);
    const shortcutAction = Object.entries(shortcuts)
      .find(([, value]) => value === pressedShortcut)?.[0];
    if (shortcutAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) performShortcutAction(shortcutAction);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      boardModeEnabled = !document.body.classList.contains(BOARD_ONLY_CLASS);
      manuallyForced = boardModeEnabled;
      applyBoardMode();
    }
  }, true);
}

ipcRenderer.on('chess-mini:pin-state', (_event, pinned) => {
  const pin = document.querySelector(`#${TOOLBAR_ID} [data-action="pin"]`);
  if (pin) pin.dataset.active = String(Boolean(pinned));
});

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
