// Zeedat ERP - Electron Preload Script
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: options => ipcRenderer.invoke('print-receipt', options),
  printReceiptHtml: options => ipcRenderer.invoke('print-receipt-html', options),
  openCashDrawer: options => ipcRenderer.invoke('open-cash-drawer', options),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdate: (autoDownload = false) => ipcRenderer.invoke('check-for-update', Boolean(autoDownload)),
  applyUpdate: () => ipcRenderer.invoke('apply-update'),
  setAutoPatch: enabled => ipcRenderer.invoke('set-auto-patch', Boolean(enabled)),
  getDatabaseConfig: () => ipcRenderer.invoke('get-database-config'),
  testMysqlConnection: config => ipcRenderer.invoke('test-mysql-connection', config),
  saveDatabaseConfig: config => ipcRenderer.invoke('save-database-config', config),
  triggerBackgroundSync: () => ipcRenderer.invoke('trigger-background-sync'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  onSyncCompleted: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sync-completed', listener);
    return () => ipcRenderer.removeListener('sync-completed', listener);
  },
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
});
