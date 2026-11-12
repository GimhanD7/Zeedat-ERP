import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Globe,
  HardDrive,
  KeyRound,
  RefreshCw,
  Save,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge, Button, Table } from '../../components/common';
import { timeLabel } from '../../utils';

export function BackupSyncManager({ ctx }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [patchStatus, setPatchStatus] = useState(null);
  const [checkingPatch, setCheckingPatch] = useState(false);
  const [dbForm, setDbForm] = useState({
    mode: 'sqlite',
    db_host: '',
    db_port: '3306',
    db_name: '',
    db_user: '',
    db_password: '',
    has_password: false,
  });
  const [dbBusy, setDbBusy] = useState(false);
  const [dbMsg, setDbMsg] = useState(null);

  const [cloudForm, setCloudForm] = useState({
    cloud_backup_url: '',
    cloud_api_key: '',
    auto_sync_enabled: true,
    sync_interval_minutes: 15,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sum, hist] = await Promise.all([
        ctx.get('backup.summary'),
        ctx.get('backup.history'),
      ]);
      setSummary(sum || {});
      setHistory(Array.isArray(hist) ? hist : []);
      if (sum) {
        setCloudForm({
          cloud_backup_url: sum.cloud_backup_url || '',
          cloud_api_key: sum.cloud_api_key || '',
          auto_sync_enabled: sum.auto_sync_enabled !== false && sum.auto_sync_enabled !== 0,
          sync_interval_minutes: Number(sum.sync_interval_minutes || 15),
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to load backup & cloud sync status.',
      });
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;
    api.getAppInfo?.().then(info => info && setDesktopInfo(info)).catch(() => {});
    api.getUpdateStatus?.().then(st => st && setPatchStatus(st)).catch(() => {});
    api.getDatabaseConfig?.().then(cfg => {
      if (cfg) {
        setDbForm(prev => ({
          ...prev,
          mode: cfg.mode || 'sqlite',
          db_host: cfg.db_host || '',
          db_port: cfg.db_port || '3306',
          db_name: cfg.db_name || '',
          db_user: cfg.db_user || '',
          db_password: '',
          has_password: Boolean(cfg.has_password),
        }));
      }
    }).catch(() => {});
    return api.onUpdateStatus?.(st => setPatchStatus(st));
  }, []);

  const handleTestMysql = async () => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;
    try {
      setDbBusy(true);
      setDbMsg(null);
      const res = await api.testMysqlConnection(dbForm);
      if (res?.ok) {
        setDbMsg({ type: 'success', text: `Connected cleanly to MySQL (${res.serverVersion || 'verified'}).` });
      } else {
        setDbMsg({ type: 'error', text: res?.error || 'Could not reach MySQL server.' });
      }
    } catch (err) {
      setDbMsg({ type: 'error', text: err?.message || 'MySQL connection test failed.' });
    } finally {
      setDbBusy(false);
    }
  };

  const handleSaveDbConfig = async e => {
    e?.preventDefault();
    const api = window.electronAPI;
    if (!api?.isElectron) return;
    try {
      setDbBusy(true);
      setDbMsg(null);
      const res = await api.saveDatabaseConfig(dbForm);
      if (!res?.ok) {
        setDbMsg({ type: 'error', text: res?.error || 'Could not save database configuration.' });
        return;
      }
      setDbForm(prev => ({ ...prev, db_password: '', has_password: Boolean(res.config?.has_password) }));
      setDbMsg({
        type: 'restart',
        text:
          dbForm.mode === 'mysql'
            ? `Server MySQL verified (${res.serverVersion || 'connected'}) and saved! Restart app to switch active database to Server MySQL.`
            : 'Switched back to Local SQLite (Offline-First + HTTPS Sync). Restart app to apply.',
      });
    } catch (err) {
      setDbMsg({ type: 'error', text: err?.message || 'Failed saving database mode.' });
    } finally {
      setDbBusy(false);
    }
  };

  const handlePatchCheck = async (autoApply = false) => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;
    try {
      setCheckingPatch(true);
      const res = autoApply ? await api.applyUpdate() : await api.checkForUpdate(false);
      setPatchStatus(res);
      const info = await api.getAppInfo?.();
      if (info) setDesktopInfo(info);
    } catch (err) {
      setPatchStatus(prev => ({ ...(prev || {}), state: 'error', error: err?.message || 'Update check failed.' }));
    } finally {
      setCheckingPatch(false);
    }
  };

  const handleToggleAutoPatch = async enabled => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;
    const res = await api.setAutoPatch(enabled);
    setDesktopInfo(prev => (prev ? { ...prev, autoPatchEnabled: res.autoPatchEnabled } : prev));
  };

  const handleSaveCloudSettings = async e => {
    e?.preventDefault();
    try {
      setSavingSettings(true);
      setMessage(null);
      const res = await ctx.mutate('backup.save_settings', {
        cloud_backup_url: cloudForm.cloud_backup_url.trim(),
        cloud_api_key: cloudForm.cloud_api_key.trim(),
        auto_sync_enabled: cloudForm.auto_sync_enabled ? 1 : 0,
        sync_interval_minutes: parseInt(cloudForm.sync_interval_minutes, 10) || 15,
      });
      setSummary(res);
      setMessage({
        type: 'success',
        text: 'Cloud server settings saved! Offline records & backups will auto-sync whenever internet connects.',
      });
      ctx.setNotice?.('Cloud sync settings saved.');
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to save cloud settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleManualBackup = async () => {
    try {
      setSyncing(true);
      setMessage(null);
      const res = await ctx.mutate('backup.create', {});
      setMessage({
        type: res.status === 'synced' ? 'success' : 'info',
        text: res.message || 'Backup process completed.',
      });
      await loadData();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.message || 'Backup failed. Please check local database.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleTwoWaySync = async () => {
    try {
      setSyncing(true);
      setMessage(null);
      const pushRes = await ctx.mutate('sync.push', {});
      const pullRes = await ctx.mutate('sync.pull', {});
      if (pushRes?.success === false) {
        setMessage({
          type: 'error',
          text: pushRes.error || 'Push sync failed.',
        });
      } else if (pullRes?.success === false) {
        setMessage({
          type: 'error',
          text: pullRes.error || 'Pull sync from online server failed.',
        });
      } else {
        const pushedTotal = pushRes?.synced_count ??
          ((pushRes?.synced_sales ?? 0) +
            (pushRes?.synced_customers ?? 0) +
            (pushRes?.synced_repairs ?? 0) +
            (pushRes?.synced_drawers ?? 0) +
            (pushRes?.synced_cash_movements ?? 0) +
            (pushRes?.synced_returns ?? 0));
        setMessage({
          type: 'success',
          text: `Two-way sync complete. Pushed ${pushedTotal} local record(s). Pulled ${pullRes?.users_synced ?? 0} staff account(s), ${pullRes?.branches_synced ?? 0} branch(es), ${pullRes?.products_synced ?? 0} product(s), ${pullRes?.customers_synced ?? 0} customer(s), ${pullRes?.sales_synced ?? 0} sale(s), and ${pullRes?.returns_synced ?? 0} return(s).`,
        });
        window.dispatchEvent(new Event('zeedat-sync-complete'));
      }
      await loadData();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.message || 'Cloud sync error. Please check server URL.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const isOnline = summary?.is_online ?? navigator.onLine;

  return (
    <div className="zk-settings-stack">
      {/* Online / Offline Hero Banner & Primary Actions */}
      <div className={`zk-sync-hero ${isOnline ? 'online' : 'offline'}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className={`zk-kpi-icon-square ${isOnline ? 'green' : 'orange'}`}>
            {isOnline ? <Wifi size={22} /> : <WifiOff size={22} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '15px', color: isOnline ? '#065f46' : '#92400e' }}>
                {isOnline ? 'Online · Ready for Two-Way Cloud Sync' : 'Offline Mode · Local SQLite Active'}
              </strong>
              <Badge tone={isOnline ? 'green' : 'amber'}>
                {isOnline ? 'Internet Connected' : 'Offline (Local Machine)'}
              </Badge>
            </div>
            <small style={{ color: '#475569', display: 'block', marginTop: '3px' }}>
              {isOnline
                ? 'Local sales, stock, products, repairs, and SQL backups sync automatically with your server database.'
                : 'No internet detected. POS sales, products, and receipts save locally and sync automatically once connected.'}
            </small>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button icon={RefreshCw} variant="soft" onClick={handleTwoWaySync} disabled={syncing || loading}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Button icon={Download} variant="primary" onClick={handleManualBackup} disabled={syncing || loading}>
            Backup SQL Now
          </Button>
        </div>
      </div>

      {message && (
        <div className={`zk-notice-banner ${message.type === 'error' ? 'error' : message.type === 'success' ? 'success' : 'info'}`} style={{ marginBottom: 0 }}>
          {message.text}
        </div>
      )}

      {/* Sync Metrics Summary */}
      <div className="zk-sync-metrics">
        <div className="zk-sync-metric-card">
          <div className="zk-kpi-icon-square green" style={{ width: '42px', height: '42px' }}>
            <HardDrive size={19} />
          </div>
          <div>
            <small style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Active Storage Engine</small>
            <strong style={{ display: 'block', fontSize: '15px', color: '#0f172a', marginTop: '2px' }}>
              {summary?.driver === 'mysql' ? 'Server MySQL Live' : 'SQLite Offline Active'}
            </strong>
            <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block', marginTop: '3px' }}>
              {summary
                ? `${summary.unsynced_count ?? 0} pending push · ${summary.free_disk_space_mb} MB free`
                : 'Loading storage status...'}
            </small>
          </div>
        </div>

        <div className="zk-sync-metric-card">
          <div className="zk-kpi-icon-square blue" style={{ width: '42px', height: '42px' }}>
            <CheckCircle2 size={19} />
          </div>
          <div>
            <small style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Last Server Sync</small>
            <strong style={{ display: 'block', fontSize: '15px', color: '#0f172a', marginTop: '2px' }}>
              {summary?.last_synced_at ? timeLabel(summary.last_synced_at) : 'Not synced yet'}
            </strong>
            <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block', marginTop: '3px' }}>
              {cloudForm.auto_sync_enabled ? `Auto-backup every ${cloudForm.sync_interval_minutes} mins` : 'Auto-sync disabled'}
            </small>
          </div>
        </div>

        <div className="zk-sync-metric-card">
          <div className="zk-kpi-icon-square purple" style={{ width: '42px', height: '42px' }}>
            <Database size={19} />
          </div>
          <div>
            <small style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Local Snapshots Created</small>
            <strong style={{ display: 'block', fontSize: '15px', color: '#0f172a', marginTop: '2px' }}>
              {summary?.total_backups_created ?? history.length} Snapshots
            </strong>
            <small style={{ color: '#64748b', fontSize: '11.5px', display: 'block', marginTop: '3px' }}>
              Saved locally &amp; mirrored to server
            </small>
          </div>
        </div>
      </div>

      {/* Online Server HTTPS Sync Configuration */}
      <form onSubmit={handleSaveCloudSettings} className="zk-settings-card">
        <div className="zk-card-header">
          <div className="zk-card-title">
            <Globe size={17} style={{ color: '#0d9488' }} />
            <span>Online Server Sync &amp; Auto-Backup Settings</span>
          </div>
          <label className="zk-toggle-row" style={{ padding: '7px 12px', gap: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Auto-Sync When Online</span>
            <input
              type="checkbox"
              checked={cloudForm.auto_sync_enabled}
              onChange={e => setCloudForm(prev => ({ ...prev, auto_sync_enabled: e.target.checked }))}
              style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
            />
          </label>
        </div>

        <div className="zk-form-row-3" style={{ alignItems: 'end' }}>
          <div className="zk-field-wrap">
            <label className="zk-field-label">Online Server URL (Namecheap Domain)</label>
            <div className="zk-input-box">
              <Globe size={15} style={{ color: '#64748b' }} />
              <input
                type="text"
                value={cloudForm.cloud_backup_url}
                onChange={e => setCloudForm(prev => ({ ...prev, cloud_backup_url: e.target.value }))}
                placeholder="https://yourdomain.com"
              />
            </div>
          </div>

          <div className="zk-field-wrap">
            <label className="zk-field-label">Security API Key (Matching Key on Server)</label>
            <div className="zk-input-box">
              <KeyRound size={15} style={{ color: '#64748b' }} />
              <input
                type="text"
                value={cloudForm.cloud_api_key}
                onChange={e => setCloudForm(prev => ({ ...prev, cloud_api_key: e.target.value }))}
                placeholder="Enter matching sync key"
              />
            </div>
          </div>

          <div className="zk-field-wrap">
            <label className="zk-field-label">Auto Backup Interval (Minutes)</label>
            <div className="zk-input-box">
              <input
                type="number"
                min={5}
                max={1440}
                value={cloudForm.sync_interval_minutes}
                onChange={e => setCloudForm(prev => ({ ...prev, sync_interval_minutes: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="zk-form-footer">
          <Button type="submit" icon={Save} variant="primary" disabled={savingSettings}>
            {savingSettings ? 'Saving Settings...' : 'Save Cloud Settings'}
          </Button>
        </div>
      </form>

      {/* Direct Server MySQL Connection Settings (Desktop App) */}
      {desktopInfo && (
        <form onSubmit={handleSaveDbConfig} className="zk-settings-card">
          <div className="zk-card-header">
            <div>
              <div className="zk-card-title">
                <Database size={17} style={{ color: '#0d9488' }} />
                <span>Desktop App Direct Server MySQL Connection</span>
              </div>
              <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>
                Connect directly to Server MySQL while online, with automatic local SQLite fallback when offline.
              </small>
            </div>
            <Badge tone={summary?.driver === 'mysql' ? 'green' : 'blue'}>
              {summary?.driver === 'mysql' ? 'Direct Server MySQL Active' : 'Local SQLite + HTTPS Sync'}
            </Badge>
          </div>

          <div className="zk-field-wrap" style={{ marginBottom: dbForm.mode === 'mysql' ? '16px' : 0 }}>
            <label className="zk-field-label">Desktop Database Mode</label>
            <div className="zk-input-box">
              <Database size={15} style={{ color: '#64748b' }} />
              <select
                value={dbForm.mode}
                onChange={e => setDbForm(prev => ({ ...prev, mode: e.target.value }))}
              >
                <option value="sqlite">Local SQLite + HTTPS Namecheap Sync (Recommended Offline-Safe)</option>
                <option value="mysql">Direct Server MySQL (With Local SQLite Offline Fallback)</option>
              </select>
            </div>
          </div>

          {dbForm.mode === 'mysql' && (
            <div className="zk-form-row-3">
              <div className="zk-field-wrap">
                <label className="zk-field-label">MySQL Server Host / IP</label>
                <div className="zk-input-box">
                  <input
                    type="text"
                    value={dbForm.db_host}
                    onChange={e => setDbForm(prev => ({ ...prev, db_host: e.target.value }))}
                    placeholder="127.0.0.1 or server domain/IP"
                  />
                </div>
              </div>

              <div className="zk-field-wrap">
                <label className="zk-field-label">MySQL Port</label>
                <div className="zk-input-box">
                  <input
                    type="text"
                    value={dbForm.db_port}
                    onChange={e => setDbForm(prev => ({ ...prev, db_port: e.target.value }))}
                    placeholder="3306"
                  />
                </div>
              </div>

              <div className="zk-field-wrap">
                <label className="zk-field-label">Database Name</label>
                <div className="zk-input-box">
                  <input
                    type="text"
                    value={dbForm.db_name}
                    onChange={e => setDbForm(prev => ({ ...prev, db_name: e.target.value }))}
                    placeholder="zeedat_pos"
                  />
                </div>
              </div>

              <div className="zk-field-wrap">
                <label className="zk-field-label">MySQL Username</label>
                <div className="zk-input-box">
                  <input
                    type="text"
                    value={dbForm.db_user}
                    onChange={e => setDbForm(prev => ({ ...prev, db_user: e.target.value }))}
                    placeholder="cpaneluser_dbuser"
                  />
                </div>
              </div>

              <div className="zk-field-wrap">
                <label className="zk-field-label">
                  MySQL Password {dbForm.has_password ? '(Saved - leave blank to keep)' : ''}
                </label>
                <div className="zk-input-box">
                  <input
                    type="password"
                    value={dbForm.db_password}
                    onChange={e => setDbForm(prev => ({ ...prev, db_password: e.target.value }))}
                    placeholder={dbForm.has_password ? '••••••••' : 'Enter MySQL password'}
                  />
                </div>
              </div>
            </div>
          )}

          {dbMsg && (
            <div className={`zk-notice-banner ${dbMsg.type === 'error' ? 'error' : 'success'}`} style={{ marginTop: '16px', marginBottom: 0 }}>
              {dbMsg.text}
            </div>
          )}

          <div className="zk-form-footer">
            {dbForm.mode === 'mysql' && (
              <Button type="button" variant="soft" onClick={handleTestMysql} disabled={dbBusy}>
                {dbBusy ? 'Testing...' : 'Test MySQL Connection'}
              </Button>
            )}
            {dbMsg?.type === 'restart' && (
              <Button type="button" variant="primary" icon={RefreshCw} onClick={() => window.electronAPI?.restartApp?.()}>
                Restart App Now
              </Button>
            )}
            <Button type="submit" variant="primary" icon={Save} disabled={dbBusy}>
              {dbBusy ? 'Saving...' : 'Save Database Connection'}
            </Button>
          </div>
        </form>
      )}

      {/* Standalone Desktop App Auto-Patch Updater */}
      {desktopInfo && (
        <div className="zk-settings-card">
          <div className="zk-card-header" style={{ marginBottom: patchStatus?.state && patchStatus.state !== 'idle' ? '14px' : 0, borderBottom: patchStatus?.state && patchStatus.state !== 'idle' ? '1px solid #f1f5f9' : 'none', paddingBottom: patchStatus?.state && patchStatus.state !== 'idle' ? '14px' : 0 }}>
            <div>
              <div className="zk-card-title">
                <RefreshCw size={17} style={{ color: '#0d9488' }} />
                <span>Standalone Desktop App &amp; Auto-Patch Updates</span>
              </div>
              <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>
                Version <strong>{desktopInfo.version}</strong> · Patch <code>{desktopInfo.activePatchId}</code> · Source: {desktopInfo.runtimeSource}
              </small>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <label className="zk-toggle-row" style={{ padding: '7px 12px', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Auto-Download Patches</span>
                <input
                  type="checkbox"
                  checked={desktopInfo.autoPatchEnabled !== false}
                  onChange={e => handleToggleAutoPatch(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
                />
              </label>
              {patchStatus?.state === 'ready' ? (
                <Button variant="primary" icon={RefreshCw} onClick={() => window.electronAPI?.restartApp?.()}>
                  Restart &amp; Apply Patch
                </Button>
              ) : patchStatus?.state === 'available' ? (
                <Button variant="primary" icon={Download} onClick={() => handlePatchCheck(true)} disabled={checkingPatch}>
                  Download &amp; Stage Patch
                </Button>
              ) : (
                <Button variant="soft" icon={RefreshCw} onClick={() => handlePatchCheck(true)} disabled={checkingPatch || patchStatus?.state === 'downloading'}>
                  {checkingPatch || patchStatus?.state === 'checking'
                    ? 'Checking...'
                    : patchStatus?.state === 'downloading'
                      ? 'Downloading Patch...'
                      : 'Check for App Updates'}
                </Button>
              )}
            </div>
          </div>

          {patchStatus?.state && patchStatus.state !== 'idle' && (
            <div className={`zk-notice-banner ${patchStatus.state === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 0 }}>
              {patchStatus.state === 'ready' &&
                `Patch ${patchStatus.latestPatch?.patch_id || ''} downloaded & verified. Click "Restart & Apply Patch" (or reopen app) to switch cleanly.`}
              {patchStatus.state === 'up-to-date' &&
                `Standalone app is up to date (${desktopInfo.activePatchId}).`}
              {patchStatus.state === 'available' &&
                `New patch ${patchStatus.latestPatch?.patch_id || ''} available (${Math.round((patchStatus.latestPatch?.size_bytes || 0) / 1024)} KB).`}
              {patchStatus.state === 'error' && (patchStatus.error || 'Failed checking updates.')}
            </div>
          )}
        </div>
      )}

      {/* Local Backup History Table */}
      <div className="zk-settings-card">
        <div className="zk-card-header">
          <div className="zk-card-title">
            <Database size={17} style={{ color: '#0d9488' }} />
            <span>Local Backup Archive &amp; Cloud Status</span>
          </div>
          <Badge>{history.length} recent files</Badge>
        </div>

        {history.length === 0 ? (
          <p style={{ color: '#64748b', fontStyle: 'italic', margin: 0 }}>
            No backups created yet. Click &quot;Backup SQL Now&quot; to create your first snapshot.
          </p>
        ) : (
          <Table
            rows={history}
            columns={[
              ['Date & Time', r => timeLabel(r.created_at)],
              ['Branch', r => r.branch_name || 'HQ / All Branches'],
              ['File Name', r => <code style={{ fontSize: '0.8rem' }}>{r.filename}</code>],
              ['Size', r => `${(r.file_size / 1024).toFixed(1)} KB`],
              [
                'Sync Status',
                r => (
                  <Badge tone={r.status === 'synced' ? 'green' : r.status === 'failed' ? 'red' : 'blue'}>
                    {r.status === 'synced' ? 'Cloud Synced' : r.status === 'failed' ? 'Failed' : 'Local Saved'}
                  </Badge>
                ),
              ],
              [
                'Download',
                r => (
                  <a
                    href={`api/index.php?route=backup.download&file=${encodeURIComponent(r.filename)}`}
                    className="button outline small"
                    download
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem' }}
                  >
                    <Download size={14} /> Download SQL
                  </a>
                ),
              ],
            ]}
          />
        )}
      </div>
    </div>
  );
}
