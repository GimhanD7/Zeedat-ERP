// Zeedat ERP - Native Browser/Desktop IndexedDB Offline Store
// Zero external dependencies - uses native browser IndexedDB API built into Windows/Chrome/Electron.

const DB_NAME = 'zeedat_pos_offline';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      // Products cache (for offline barcode scanning and search)
      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'id' });
        prodStore.createIndex('barcode', 'barcode', { unique: false });
        prodStore.createIndex('sku', 'sku', { unique: false });
        prodStore.createIndex('name', 'name', { unique: false });
      }

      // Customers cache
      if (!db.objectStoreNames.contains('customers')) {
        const cusStore = db.createObjectStore('customers', { keyPath: 'id' });
        cusStore.createIndex('phone', 'phone', { unique: false });
        cusStore.createIndex('name', 'name', { unique: false });
      }

      // Pending offline sales queue (waiting to sync to cloud)
      if (!db.objectStoreNames.contains('pending_sales')) {
        const saleStore = db.createObjectStore('pending_sales', { keyPath: 'offline_id' });
        saleStore.createIndex('created_at', 'created_at', { unique: false });
        saleStore.createIndex('branch_id', 'branch_id', { unique: false });
      }

      // Metadata / Settings cache
      if (!db.objectStoreNames.contains('app_cache')) {
        db.createObjectStore('app_cache', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Generic transaction helper
async function tx(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export const offlineStore = {
  // Save products to local cache
  async cacheProducts(products) {
    if (!Array.isArray(products) || products.length === 0) return;
    try {
      const db = await openDB();
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');
      for (const p of products) {
        store.put(p);
      }
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (e) {
      console.warn('Failed to cache products offline:', e);
    }
  },

  // Get all cached products
  async getProducts() {
    try {
      return await tx('products', 'readonly', store => {
        return new Promise(resolve => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      });
    } catch {
      return [];
    }
  },

  // Find product by barcode or SKU offline
  async findProductByBarcode(code) {
    const term = String(code).trim().toLowerCase();
    const products = await this.getProducts();
    return products.find(
      p =>
        (p.barcode && String(p.barcode).trim().toLowerCase() === term) ||
        (p.sku && String(p.sku).trim().toLowerCase() === term)
    );
  },

  // Save customers to local cache
  async cacheCustomers(customers) {
    if (!Array.isArray(customers) || customers.length === 0) return;
    try {
      const db = await openDB();
      const transaction = db.transaction('customers', 'readwrite');
      const store = transaction.objectStore('customers');
      for (const c of customers) {
        store.put(c);
      }
      return new Promise(resolve => {
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('Failed to cache customers offline:', e);
    }
  },

  // Get cached customers
  async getCustomers() {
    try {
      return await tx('customers', 'readonly', store => {
        return new Promise(resolve => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      });
    } catch {
      return [];
    }
  },

  // Save an offline sale to the pending sync queue
  async savePendingSale(salePayload, receiptData) {
    const offlineId = 'OFF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const record = {
      offline_id: offlineId,
      payload: salePayload,
      receipt: {
        ...receiptData,
        id: offlineId,
        reference: offlineId,
        is_offline: true,
      },
      created_at: new Date().toISOString(),
      branch_id: salePayload.branch || 0,
      attempts: 0,
    };

    try {
      await tx('pending_sales', 'readwrite', store => {
        store.put(record);
      });
      return record;
    } catch (err) {
      console.error('Critical: Failed to save offline sale to IndexedDB:', err);
      throw new Error('Could not save sale locally on device. Please check disk space.');
    }
  },

  // Get all pending sales
  async getPendingSales() {
    try {
      return await tx('pending_sales', 'readonly', store => {
        return new Promise(resolve => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      });
    } catch {
      return [];
    }
  },

  // Remove a synced sale
  async removePendingSale(offlineId) {
    try {
      await tx('pending_sales', 'readwrite', store => {
        store.delete(offlineId);
      });
      return true;
    } catch {
      return false;
    }
  },

  // Get count of pending offline sales
  async getPendingCount() {
    const sales = await this.getPendingSales();
    return sales.length;
  },

  // Cache settings or key-value
  async setCache(key, val) {
    try {
      await tx('app_cache', 'readwrite', store => {
        store.put({ key, value: val, updatedAt: Date.now() });
      });
    } catch {}
  },

  async getCache(key) {
    try {
      return await tx('app_cache', 'readonly', store => {
        return new Promise(resolve => {
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result?.value ?? null);
          req.onerror = () => resolve(null);
        });
      });
    } catch {
      return null;
    }
  },
};
