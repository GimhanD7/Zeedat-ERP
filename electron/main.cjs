// Zeedat POS - Standalone Windows Desktop Shell (Electron + Local PHP/SQLite + Auto-Patch)
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  getAppDataBase,
  getPublicDbConfig,
  saveDbConfig,
  startPhpServer,
  stopPhpServer,
  testMysqlConnection,
} = require('./phpServer.cjs');
const {
  checkForPatch,
  downloadAndStagePatch,
  resolveActiveRuntime,
  setAutoPatchEnabled,
} = require('./patchManager.cjs');

let mainWindow = null;
let phpHandle = null;
let runtimeInfo = null;
let patchTimer = null;
let isShuttingDown = false;
let patchBusy = false;

let updateStatus = {
  state: 'idle',
  currentPatchId: '',
  latestPatch: null,
  error: '',
  checkedAt: '',
};

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function windowStatePath() {
  return path.join(getAppDataBase(), 'window-state.json');
}

function loadWindowBounds() {
  try {
    const raw = fs.readFileSync(windowStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Number(parsed.width) >= 800 && Number(parsed.height) >= 600) {
      return parsed;
    }
  } catch {
    // Use defaults on first boot
  }
  return { width: 1280, height: 800, isMaximized: false };
}

function saveWindowBounds(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({ ...bounds, isMaximized }, null, 2),
      'utf8'
    );
  } catch {
    // Ignore window state persistence errors
  }
}

function publishUpdateStatus(partial) {
  updateStatus = {
    ...updateStatus,
    ...partial,
    currentPatchId: runtimeInfo?.activePatchId || updateStatus.currentPatchId,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
}

function resolveUpdateServerUrl() {
  if (app.isPackaged) return 'https://zeedat.vortexdigitallabs.org';
  const envUrl = process.env.ZEEDAT_UPDATE_URL;
  if (envUrl) return envUrl;
  const dbUrl = phpHandle ? phpHandle.readCloudUrl() : '';
  return dbUrl || '';
}

async function runPatchCheck({ autoDownload = false, silent = false } = {}) {
  if (patchBusy) return updateStatus;
  if (!runtimeInfo) return updateStatus;

  const serverUrl = resolveUpdateServerUrl();
  if (!serverUrl) {
    if (!silent) {
      publishUpdateStatus({
        state: 'error',
        error: 'Online server URL is not set in Cloud Sync settings.',
        checkedAt: new Date().toISOString(),
      });
    }
    return updateStatus;
  }

  patchBusy = true;
  try {
    publishUpdateStatus({ state: 'checking', error: '' });
    const result = await checkForPatch(serverUrl, runtimeInfo);

    if (result.alreadyStaged) {
      publishUpdateStatus({
        state: 'ready',
        latestPatch: result.latestPatch,
        error: '',
        checkedAt: new Date().toISOString(),
      });
      return updateStatus;
    }

    if (!result.updateAvailable) {
      publishUpdateStatus({
        state: 'up-to-date',
        latestPatch: result.latestPatch,
        error: '',
        checkedAt: new Date().toISOString(),
      });
      return updateStatus;
    }

    if (autoDownload) {
      publishUpdateStatus({
        state: 'downloading',
        latestPatch: result.latestPatch,
        error: '',
      });
      await downloadAndStagePatch(serverUrl, result.latestPatch, runtimeInfo);
      publishUpdateStatus({
        state: 'ready',
        latestPatch: result.latestPatch,
        error: '',
        checkedAt: new Date().toISOString(),
      });
    } else {
      publishUpdateStatus({
        state: 'available',
        latestPatch: result.latestPatch,
        error: '',
        checkedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    if (!silent || updateStatus.state === 'downloading') {
      publishUpdateStatus({
        state: 'error',
        error: err?.message || 'Update check failed.',
        checkedAt: new Date().toISOString(),
      });
    } else {
      publishUpdateStatus({
        state: 'idle',
        checkedAt: new Date().toISOString(),
      });
    }
  } finally {
    patchBusy = false;
  }
  return updateStatus;
}

function createWindow(startUrl) {
  const saved = loadWindowBounds();
  const iconPath = path.join(__dirname, '../public/favicon.ico');

  mainWindow = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 800,
    x: typeof saved.x === 'number' ? saved.x : undefined,
    y: typeof saved.y === 'number' ? saved.y : undefined,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Zeedat POS - Retail & Repair ERP',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (saved.isMaximized) mainWindow.maximize();
    mainWindow.show();
  });

  // Never open external browser tabs silently inside the POS shell
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(startUrl);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F5' && input.type === 'keyDown') {
      mainWindow.reload();
      event.preventDefault();
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('close', () => saveWindowBounds(mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Printing handlers
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('Error fetching printers:', err);
    return [];
  }
});

ipcMain.handle('print-receipt', async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };

  const printOptions = {
    silent: options.silent ?? true,
    printBackground: true,
    deviceName: options.deviceName || '',
    margins: { marginType: 'none' },
    pageSize:
      options.paperWidth === 58
        ? { width: 58000, height: 200000 }
        : { width: 80000, height: 200000 },
  };

  return new Promise(resolve => {
    mainWindow.webContents.print(printOptions, (success, failureReason) => {
      resolve(success ? { success: true } : { success: false, error: failureReason });
    });
  });
});

// Standalone desktop app info & auto-patch IPC handlers
ipcMain.handle('get-app-info', () => ({
  isPackaged: app.isPackaged,
  version: app.getVersion(),
  activePatchId: runtimeInfo?.activePatchId || '',
  bundledPatchId: runtimeInfo?.bundledPatchId || '',
  builtAt: runtimeInfo?.builtAt || '',
  runtimeSource: runtimeInfo?.runtimeSource || 'workspace',
  autoPatchEnabled: runtimeInfo?.autoPatchEnabled !== false,
  serverUrl: resolveUpdateServerUrl(),
  localPort: phpHandle?.port || 0,
  dataDir: phpHandle?.dataDir || getAppDataBase(),
}));

ipcMain.handle('get-update-status', () => updateStatus);

ipcMain.handle('check-for-update', (_event, autoDownload = false) =>
  runPatchCheck({ autoDownload: Boolean(autoDownload), silent: false })
);

ipcMain.handle('apply-update', () => runPatchCheck({ autoDownload: true, silent: false }));

ipcMain.handle('set-auto-patch', (_event, enabled) => {
  const next = setAutoPatchEnabled(enabled);
  if (runtimeInfo) runtimeInfo.autoPatchEnabled = next;
  return { autoPatchEnabled: next };
});

ipcMain.handle('get-database-config', () => getPublicDbConfig());

ipcMain.handle('test-mysql-connection', (_event, config) => testMysqlConnection(config || {}));

ipcMain.handle('save-database-config', (_event, config = {}) => {
  if (config.mode === 'mysql') {
    const check = testMysqlConnection(config);
    if (!check.ok) {
      return { ok: false, error: check.error || 'MySQL connection failed.' };
    }
    const saved = saveDbConfig(config);
    return { ok: true, config: saved, serverVersion: check.serverVersion, restartRequired: true };
  }
  const saved = saveDbConfig({ ...config, mode: 'sqlite' });
  return { ok: true, config: saved, restartRequired: true };
});

ipcMain.handle('restart-app', () => {
  if (patchTimer) {
    clearInterval(patchTimer);
    patchTimer = null;
  }
  isShuttingDown = true;
  stopPhpServer(phpHandle);
  phpHandle = null;
  app.relaunch();
  app.exit(0);
});

app.whenReady().then(async () => {
  if (!gotLock) return;

  try {
    runtimeInfo = resolveActiveRuntime();
    updateStatus.currentPatchId = runtimeInfo.activePatchId;

    const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ZEEDAT_SERVER_URL;
    if (devServerUrl) {
      createWindow(devServerUrl);
    } else {
      phpHandle = await startPhpServer(runtimeInfo.activeRoot);
      createWindow(phpHandle.url);
    }

    // Background auto-patch polling (8s after launch + every 15 minutes)
    if (app.isPackaged) {
      setTimeout(() => {
        if (!isShuttingDown && runtimeInfo?.autoPatchEnabled !== false) {
          runPatchCheck({ autoDownload: true, silent: true });
        }
      }, 8000);

      patchTimer = setInterval(() => {
        if (!isShuttingDown && runtimeInfo?.autoPatchEnabled !== false) {
          runPatchCheck({ autoDownload: true, silent: true });
        }
      }, 15 * 60 * 1000);
    }
  } catch (err) {
    dialog.showErrorBox(
      'Zeedat POS - Startup Error',
      `Failed to start the standalone desktop application:\n\n${err?.message || err}`
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && phpHandle) {
      createWindow(phpHandle.url);
    }
  });
});

app.on('will-quit', () => {
  isShuttingDown = true;
  if (patchTimer) {
    clearInterval(patchTimer);
    patchTimer = null;
  }
  stopPhpServer(phpHandle);
  phpHandle = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
