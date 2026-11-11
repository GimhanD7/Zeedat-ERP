// Zeedat ERP - Background Offline Sync Manager
import { offlineStore } from './offlineStore';
import { apiClient } from '../api/client';

class SyncManager {
  constructor() {
    this.listeners = new Set();
    this.isSyncing = false;
    this.pendingCount = 0;
    this.init();
  }

  async init() {
    await this.updateCount();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.triggerSync();
      });

      // Periodic sync loop every 25 seconds
      setInterval(() => {
        if (navigator.onLine && !this.isSyncing) {
          this.triggerSync();
        }
      }, 25000);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ isSyncing: this.isSyncing, pendingCount: this.pendingCount });
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({ isSyncing: this.isSyncing, pendingCount: this.pendingCount });
      } catch (e) {
        console.error(e);
      }
    }
  }

  async updateCount() {
    try {
      this.pendingCount = await offlineStore.getPendingCount();
      this.notify();
    } catch {}
  }

  async triggerSync() {
    if (this.isSyncing || !navigator.onLine) return;
    let hadPendingSales = false;

    try {
      this.isSyncing = true;
      this.notify();

      const pending = await offlineStore.getPendingSales();
      if (pending.length === 0) {
        this.isSyncing = false;
        this.pendingCount = 0;
        this.notify();
        return;
      }

      hadPendingSales = true;
      console.log(`[SyncManager] Found ${pending.length} pending offline sales. Syncing to cloud...`);

      for (const item of pending) {
        try {
          // Replay the checkout with the server using its unique offline ID as idempotency key
          await apiClient('sale.checkout', {
            data: {
              ...item.payload,
              offline_ref: item.offline_id,
            },
            key: item.offline_id,
          });

          // Successfully uploaded to cloud! Remove from local device queue
          await offlineStore.removePendingSale(item.offline_id);
          console.log(`[SyncManager] Synced sale ${item.offline_id} successfully.`);
        } catch (err) {
          console.warn(`[SyncManager] Failed to sync sale ${item.offline_id}:`, err);
          // If network failed, abort and retry next time
          if (!navigator.onLine) break;
        }
      }
    } catch (e) {
      console.error('[SyncManager] Sync error:', e);
    } finally {
      this.isSyncing = false;
      await this.updateCount();
      if (hadPendingSales && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zeedat-sync-now'));
      }
    }
  }
}

export const syncManager = new SyncManager();
