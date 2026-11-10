// Zeedat ERP - Native Windows Desktop Shell (Electron)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Zeedat POS - Retail & Repair ERP',
    icon: path.join(__dirname, '../public/favicon.ico'),
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows cross-origin API calls to cloud backend
      allowRunningInsecureContent: true,
    },
  });

  // Check if running in dev mode or with custom server URL
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ZEEDAT_SERVER_URL;
  const distIndexPath = path.join(__dirname, '../dist/index.html');

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(distIndexPath)) {
    mainWindow.loadFile(distIndexPath);
  } else {
    // Default fallback to local or cloud server
    mainWindow.loadURL('http://127.0.0.1:8081');
  }

  // Keyboard shortcuts for POS cashiers
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F11: Toggle Fullscreen
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    // F5: Refresh
    if (input.key === 'F5' && input.type === 'keyDown') {
      mainWindow.reload();
      event.preventDefault();
    }
    // Ctrl+Shift+I: DevTools
    if (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Native Thermal Printer IPC handlers
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('Error fetching printers:', err);
    return [];
  }
});

// Silent Direct Print handler for POS thermal receipts
ipcMain.handle('print-receipt', async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };

  const printOptions = {
    silent: options.silent ?? true, // Silent printing for POS
    printBackground: true,
    deviceName: options.deviceName || '', // Thermal printer name or default
    margins: {
      marginType: 'none',
    },
    pageSize: options.paperWidth === 58 ? { width: 58000, height: 200000 } : { width: 80000, height: 200000 },
  };

  return new Promise(resolve => {
    mainWindow.webContents.print(printOptions, (success, failureReason) => {
      if (success) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: failureReason });
      }
    });
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
