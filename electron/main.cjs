// Zeedat POS - Standalone Windows Desktop Shell (Electron + Local PHP/SQLite + Auto-Patch)
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
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
let syncTimer = null;
let isShuttingDown = false;
let patchBusy = false;
let syncBusy = false;

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

ipcMain.handle('print-receipt-html', async (_event, options = {}) => {
  const html = String(options.html || '');
  if (!html) return { success: false, error: 'Empty receipt content' };

  const paperWidth = Number(options.paperWidth) === 210 ? 210 : Number(options.paperWidth) === 58 ? 58 : 80;
  const printWin = new BrowserWindow({
    show: false,
    width: paperWidth === 210 ? 820 : paperWidth === 58 ? 240 : 320,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    if (paperWidth === 210 || options.silent === false) {
      return await new Promise(resolve => {
        printWin.webContents.print({
          silent: false,
          printBackground: true,
          ...(paperWidth === 210 ? { pageSize: 'A4' } : {}),
        }, (success, error) => {
          if (!printWin.isDestroyed()) printWin.close();
          resolve({ success, error });
        });
      });
    }
    const heightPx = await printWin.webContents.executeJavaScript(
      'Math.max(document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0, 200)'
    );
    const heightMicrons = Math.max(60000, Math.ceil(Number(heightPx || 400) * 264.583) + 15000);

    let deviceName = String(options.deviceName || '').trim();
    const printers =
      mainWindow && !mainWindow.isDestroyed()
        ? await mainWindow.webContents.getPrintersAsync().catch(() => [])
        : [];
    if (!deviceName) {
      const physical = printers.find(p => !/OneNote|Fax|XPS|PDF/i.test(p.name));
      const def = physical || printers.find(p => p.isDefault) || printers[0];
      if (def?.name) deviceName = def.name;
    }

    if (!deviceName || /OneNote|Fax|XPS|PDF/i.test(deviceName)) {
      const pdfBuf = await printWin.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize: {
          width: paperWidth === 58 ? 2.283 : 3.15,
          height: Math.max(2.4, Number(heightPx || 400) / 96 + 0.6),
        },
      });
      const spoolDir = path.join(__dirname, '..', 'api', 'storage', 'printed-bills');
      fs.mkdirSync(spoolDir, { recursive: true });
      const file = path.join(spoolDir, `bill-${Date.now()}.pdf`);
      fs.writeFileSync(file, pdfBuf);
      if (!printWin.isDestroyed()) printWin.close();
      return { success: true, silent: true, deviceName: deviceName || 'Silent Spool', file };
    }

    return await new Promise(resolve => {
      printWin.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName,
          margins: { marginType: 'none' },
          pageSize: {
            width: paperWidth === 58 ? 58000 : 80000,
            height: heightMicrons,
          },
        },
        (success, failureReason) => {
          if (success) {
            if (!printWin.isDestroyed()) printWin.close();
            resolve({ success: true, silent: true, deviceName });
            return;
          }
          printWin.webContents.print(
            {
              silent: true,
              printBackground: true,
              deviceName,
              margins: { marginType: 'none' },
            },
            (retryOk, retryErr) => {
              if (!printWin.isDestroyed()) printWin.close();
              resolve(
                retryOk
                  ? { success: true, silent: true, deviceName }
                  : { success: false, error: retryErr || failureReason }
              );
            }
          );
        }
      );
    });
  } catch (err) {
    if (!printWin.isDestroyed()) printWin.close();
    return { success: false, error: err?.message || 'Thermal print failed.' };
  }
});

ipcMain.handle('open-cash-drawer', async (_event, options = {}) => {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Cash drawer kick is only supported on Windows.' };
  }

  let printerName = String(options?.deviceName || options?.printerName || '').trim();
  if (!printerName && mainWindow && !mainWindow.isDestroyed()) {
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      const def = printers.find(p => p.isDefault) || printers[0];
      printerName = def?.name || '';
    } catch {
      printerName = '';
    }
  }

  if (!printerName) {
    return { ok: false, error: 'No Windows printer configured or detected for cash drawer.' };
  }

  // Standard ESC/POS drawer kick pulses for Pin 2 (0x00) and Pin 5 (0x01)
  const kickB64 = Buffer.from([
    0x1b, 0x70, 0x00, 0x19, 0xfa,
    0x1b, 0x70, 0x01, 0x19, 0xfa,
  ]).toString('base64');

  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    "$code = @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class ZeedatRawSpooler {',
    '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    '  public class DOCINFOW {',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;',
    '    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;',
    '  }',
    '  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);',
    '  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]',
    '  public static extern bool ClosePrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOW di);',
    '  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]',
    '  public static extern bool EndDocPrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]',
    '  public static extern bool StartPagePrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]',
    '  public static extern bool EndPagePrinter(IntPtr hPrinter);',
    '  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]',
    '  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);',
    '  public static void SendRaw(string printerName, byte[] data) {',
    '    IntPtr hPrinter;',
    '    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());',
    '    try {',
    '      var di = new DOCINFOW { pDocName = "Zeedat Cash Drawer", pDataType = "RAW" };',
    '      if (StartDocPrinter(hPrinter, 1, di) <= 0) throw new Exception("StartDocPrinter failed");',
    '      try {',
    '        if (StartPagePrinter(hPrinter)) {',
    '          IntPtr unmanaged = Marshal.AllocCoTaskMem(data.Length);',
    '          try {',
    '            Marshal.Copy(data, 0, unmanaged, data.Length);',
    '            int written;',
    '            WritePrinter(hPrinter, unmanaged, data.Length, out written);',
    '          } finally { Marshal.FreeCoTaskMem(unmanaged); }',
    '          EndPagePrinter(hPrinter);',
    '        }',
    '      } finally { EndDocPrinter(hPrinter); }',
    '    } finally { ClosePrinter(hPrinter); }',
    '  }',
    '}',
    "'@",
    'Add-Type -TypeDefinition $code',
    '$bytes = [Convert]::FromBase64String($env:ZEEDAT_RAW_B64)',
    '[ZeedatRawSpooler]::SendRaw($env:ZEEDAT_PRINTER, $bytes)',
  ].join('\n');

  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      {
        env: { ...process.env, ZEEDAT_PRINTER: printerName, ZEEDAT_RAW_B64: kickB64 },
        windowsHide: true,
        timeout: 6000,
      },
      (err, _stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: (stderr || err.message || 'Drawer kick failed').trim() });
          return;
        }
        resolve({ ok: true, printerName });
      }
    );
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

function runBackgroundDataSync() {
  if (syncBusy || isShuttingDown || !phpHandle || !runtimeInfo?.activeRoot) {
    return Promise.resolve({ ran: false, busy: syncBusy });
  }
  const scriptPath = path.join(runtimeInfo.activeRoot, 'scripts', 'auto_sync_sqlite.php');
  if (!fs.existsSync(scriptPath)) {
    return Promise.resolve({ ran: false, reason: 'missing_script' });
  }

  syncBusy = true;
  return new Promise(resolve => {
    const child = spawn(phpHandle.phpExe, [scriptPath, '--auto', '0'], {
      cwd: runtimeInfo.activeRoot,
      env: phpHandle.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
    });

    const killTimer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, 60000);

    child.once('close', () => {
      clearTimeout(killTimer);
      syncBusy = false;
      let parsed = { ran: false };
      try {
        const lastLine = stdout.trim().split(/\r?\n/).pop() || '';
        if (lastLine.startsWith('{')) parsed = JSON.parse(lastLine);
      } catch {
        parsed = { ran: false };
      }
      if (parsed?.ran && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-completed', parsed);
      }
      resolve(parsed);
    });

    child.once('error', () => {
      clearTimeout(killTimer);
      syncBusy = false;
      resolve({ ran: false });
    });
  });
}

ipcMain.handle('trigger-background-sync', () => runBackgroundDataSync());

ipcMain.handle('restart-app', () => {
  if (patchTimer) {
    clearInterval(patchTimer);
    patchTimer = null;
  }
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
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

      // Background two-way data & cashbook sync (5s after launch + every 20s)
      setTimeout(() => {
        if (!isShuttingDown) runBackgroundDataSync();
      }, 5000);

      syncTimer = setInterval(() => {
        if (!isShuttingDown) runBackgroundDataSync();
      }, 20 * 1000);
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
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  stopPhpServer(phpHandle);
  phpHandle = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
