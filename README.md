# Chess Desktop Mini

A small, frameless desktop window for Chess.com. During a game, the app hides the surrounding website and displays only the chessboard. The window is movable and resizable, and your Chess.com session is kept in a separate persistent app profile.

## Downloads

Prebuilt downloads are available on the [GitHub Releases page](https://github.com/DevGnott/ChessDesktopMini/releases):

- Windows installer: `Chess-Desktop-Mini-Setup-<version>.exe`
- Windows portable: `Chess-Desktop-Mini-Portable-<version>.exe`
- Linux AppImage: `Chess-Desktop-Mini-<version>.AppImage`

The Windows portable edition runs without installation. Windows builds are currently unsigned, so Microsoft Defender SmartScreen may show an “unknown publisher” warning.

## Run from source

```bash
npm install
npm start
```

## Build packages

```bash
# Linux AppImage
npm run dist:linux

# Windows installer and portable executable
npm run dist:windows
```

Build output is written to `dist/`.

On the first launch, the full Chess.com play page is shown so you can sign in and select a game. Once a game starts, the app automatically switches to board-only mode.

## Controls

- Move the pointer to the top edge: reveal the mini toolbar
- `•••`: move the window
- `▦`: switch between board-only mode and the full Chess.com page
- `⌖`: keep the window always on top
- `⚙`: configure keyboard shortcuts
- `＋`: return to the new-game page
- Drag a window edge: resize the window
- `Ctrl+Shift+M`: toggle board-only mode

Action shortcuts work while the mini window has focus. The defaults are:

- Rematch: `Ctrl+Alt+R`
- New game: `Ctrl+Alt+N`
- Offer draw: `Ctrl+Alt+D`
- Resign: `Ctrl+Alt+Q`

Select `⚙`, click a shortcut, and press a new key combination to replace it. Changes are saved immediately. Any confirmation requested by Chess.com for draw or resign actions is preserved.

## Privacy and trademark

The app loads the original Chess.com website and does not collect or store credentials itself. The embedded browser keeps the Chess.com session in Electron's local application data directory.

Chess.com is a trademark of Chess.com LLC. This project is independent and is not affiliated with or endorsed by Chess.com.
