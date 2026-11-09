import { app, BrowserWindow, Menu, protocol, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { APP_SCHEME, APP_URL, SESSION_PARTITION, USER_DATA_DIRECTORY, WEB_PREFERENCES, isAllowedRequest } from './policy.mjs';
import { createAssetHandler } from './protocol.mjs';

app.setName('Aegis Vector');
const userData = path.join(app.getPath('appData'), USER_DATA_DIRECTORY);
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.setPath('sessionData', userData);
if (process.platform === 'win32') app.setAppUserModelId('games.aegisvector.desktop');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true,
  // No bypassCSP or service-worker privileges.
} }]);

let mainWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(async () => {
    const gameSession = session.fromPartition(SESSION_PARTITION);
    gameSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    gameSession.setPermissionCheckHandler(() => false);
    gameSession.setDevicePermissionHandler(() => false);
    gameSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    gameSession.on('will-download', (event) => event.preventDefault());
    gameSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedRequest(details.url) }));
    gameSession.protocol.handle(APP_SCHEME, createAssetHandler(fileURLToPath(new URL('../dist/', import.meta.url))));

    function openWindow() {
      mainWindow = new BrowserWindow({
        width: 1280, height: 760, minWidth: 800, minHeight: 500,
        title: 'Aegis Vector — Development Candidate', backgroundColor: '#050b19',
        show: false, webPreferences: { ...WEB_PREFERENCES },
      });
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      for (const event of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
        mainWindow.webContents.on(event, (navigation) => navigation.preventDefault());
      }
      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown' && !input.isAutoRepeat) {
          event.preventDefault();
          mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
      });
      mainWindow.once('ready-to-show', () => mainWindow.show());
      mainWindow.on('closed', () => { mainWindow = undefined; });
      mainWindow.loadURL(APP_URL);
    }
    const menu = [
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'Game', submenu: [{ role: 'quit', label: 'Quit Aegis Vector', accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Control+Q' }] },
      { label: 'View', submenu: [{ label: 'Toggle Fullscreen (F11)', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) }] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
    openWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openWindow(); });
  }).catch((error) => {
    console.error('Aegis Vector could not start:', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
