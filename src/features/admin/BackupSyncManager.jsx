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
  Settings2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge, Button, Panel, Table } from '../../components/common';
import { timeLabel } from '../../utils';

export function BackupSyncManager({ ctx }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

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
      const pendingRes = await ctx.mutate('sync.auto', {});
      if (pushRes?.success === false) {
        setMessage({
          type: 'error',
          text: pushRes.error || 'Cloud sync failed.',
        });
      } else {
        const pushedTotal =
          (pushRes?.synced_sales ?? 0) +
          (pushRes?.synced_customers ?? 0) +
          (pushRes?.synced_repairs ?? 0);
        const backupText =
          pendingRes?.backup?.status === 'synced'
            ? ' Auto-backup uploaded to server.'
            : pendingRes?.pending_backups?.uploaded > 0
              ? ` Uploaded ${pendingRes.pending_backups.uploaded} offline backup(s).`
              : '';
        setMessage({
          type: 'success',
          text: `Sync Complete! Pushed ${pushedTotal} record(s). Pulled ${pullRes?.products_synced ?? 0} product(s).${backupText}`,
        });
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

  const openConfigDialog = () => {
    ctx.setDialog({
      title: 'Configure Online Server Sync & Auto Backup',
      route: 'backup.save_settings',
      values: {
        cloud_backup_url: cloudForm.cloud_backup_url || '',
        cloud_api_key: cloudForm.cloud_api_key || '',
        auto_sync_enabled: cloudForm.auto_sync_enabled ? '1' : '0',
        sync_interval_minutes: cloudForm.sync_interval_minutes || 15,
      },
      fields: [
        {
          name: 'cloud_backup_url',
          label: 'Online Server URL (Namecheap Domain or api/index.php)',
          placeholder: 'https://yourdomain.com',
          optional: true,
          full: true,
        },
        {
          name: 'cloud_api_key',
          label: 'Security API Key / Bearer Token (optional unless set on server)',
          placeholder: 'zeedat-secret-token-xyz',
          optional: true,
          full: true,
        },
        {
          name: 'auto_sync_enabled',
          label: 'Auto-Sync & Backup When Internet Connects',
          choices: [
            ['1', 'Enabled (Recommended)'],
            ['0', 'Disabled'],
          ],
        },
        {
          name: 'sync_interval_minutes',
          label: 'Auto Backup Frequency (Minutes)',
          type: 'number',
          min: 5,
          max: 1440,
        },
      ],
      transform: v => ({
        cloud_backup_url: String(v.cloud_backup_url || '').trim(),
        cloud_api_key: String(v.cloud_api_key || '').trim(),
        auto_sync_enabled: v.auto_sync_enabled === '1' ? 1 : 0,
        sync_interval_minutes: parseInt(v.sync_interval_minutes, 10) || 15,
      }),
      onSuccess: () => loadData(),
    });
  };

  const isOnline = summary?.is_online ?? navigator.onLine;

  return (
    <div className="stack" style={{ marginTop: '0.5rem' }}>
      <Panel
        title="Local Offline Storage & Cloud Auto-Backup"
        icon={Database}
        action={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              icon={Settings2}
              variant="outline"
              onClick={openConfigDialog}
            >
              Cloud Settings
            </Button>
            <Button
              icon={RefreshCw}
              variant="outline"
              onClick={handleTwoWaySync}
              disabled={syncing || loading}
            >
              {syncing ? 'Syncing...' : 'Sync with Cloud'}
            </Button>
            <Button
              icon={Download}
              variant="primary"
              onClick={handleManualBackup}
              disabled={syncing || loading}
            >
              Backup SQL Now
            </Button>
          </div>
        }
      >
        {/* Offline / Online Status Banner */}
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            background: isOnline ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${isOnline ? '#6ee7b7' : '#fcd34d'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isOnline ? (
              <Wifi size={24} style={{ color: '#047857' }} />
            ) : (
              <WifiOff size={24} style={{ color: '#b45309' }} />
            )}
            <div>
              <strong style={{ display: 'block', color: isOnline ? '#065f46' : '#92400e' }}>
                {isOnline ? 'Online: Ready for Server Sync & Auto Backup' : 'Offline Mode: Local SQLite Storage Active'}
              </strong>
              <small style={{ color: '#475569' }}>
                {isOnline
                  ? 'Local sales, customers, repairs, and SQL backups automatically sync to your online server.'
                  : 'No internet detected. POS sales, barcode scanning, and receipts save locally and sync automatically when internet connects.'}
              </small>
            </div>
          </div>
          <Badge tone={isOnline ? 'green' : 'amber'}>
            {isOnline ? 'Internet Connected' : 'Offline (Local Machine)'}
          </Badge>
        </div>

        {message && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              background:
                message.type === 'error'
                  ? '#fef2f2'
                  : message.type === 'success'
                    ? '#f0fdfa'
                    : '#eff6ff',
              border: `1px solid ${
                message.type === 'error'
                  ? '#fecaca'
                  : message.type === 'success'
                    ? '#99f6e4'
                    : '#bfdbfe'
              }`,
              color:
                message.type === 'error'
                  ? '#b91c1c'
                  : message.type === 'success'
                    ? '#0f766e'
                    : '#1d4ed8',
              fontSize: '0.875rem',
            }}
          >
            {message.text}
          </div>
        )}

        {/* Inline Cloud Server Configuration Form */}
        <form
          onSubmit={handleSaveCloudSettings}
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <strong style={{ fontSize: '13.5px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Globe size={16} style={{ color: '#0d9488' }} />
              Online Namecheap MySQL Server Sync Settings
            </strong>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={cloudForm.auto_sync_enabled}
                onChange={e => setCloudForm(prev => ({ ...prev, auto_sync_enabled: e.target.checked }))}
              />
              Auto-Sync &amp; Backup When Internet Connects
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
              <label className="zk-field-label">Security API Key (Optional)</label>
              <div className="zk-input-box">
                <KeyRound size={15} style={{ color: '#64748b' }} />
                <input
                  type="text"
                  value={cloudForm.cloud_api_key}
                  onChange={e => setCloudForm(prev => ({ ...prev, cloud_api_key: e.target.value }))}
                  placeholder="Same key set on server (or leave blank)"
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <Button type="submit" icon={Save} variant="primary" disabled={savingSettings}>
              {savingSettings ? 'Saving Settings...' : 'Save Cloud Settings'}
            </Button>
          </div>
        </form>

        {/* Status Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.25rem' }}>
              <HardDrive size={16} />
              <small>Local Offline Database</small>
            </div>
            <strong style={{ fontSize: '1rem', color: '#0f766e' }}>
              {summary?.driver === 'sqlite' ? 'SQLite Offline Active' : 'MySQL Connected'}
            </strong>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              {summary
                ? `${summary.unsynced_count ?? 0} pending push · ${summary.free_disk_space_mb} MB free`
                : 'Loading drive status...'}
            </div>
          </div>

          <div style={{ padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.25rem' }}>
              <CheckCircle2 size={16} />
              <small>Last Cloud Backup &amp; Sync</small>
            </div>
            <strong style={{ fontSize: '0.95rem' }}>
              {summary?.last_synced_at ? timeLabel(summary.last_synced_at) : 'Not synced yet'}
            </strong>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              {cloudForm.auto_sync_enabled ? `Auto-sync every ${cloudForm.sync_interval_minutes} mins` : 'Auto-sync disabled'}
            </div>
          </div>

          <div style={{ padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.25rem' }}>
              <Database size={16} />
              <small>Local Snapshots Created</small>
            </div>
            <strong style={{ fontSize: '1rem' }}>
              {summary?.total_backups_created ?? history.length} Snapshots
            </strong>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              Stored in <code>/api/backups/</code>
            </div>
          </div>
        </div>

        {/* Recent Backups History Table */}
        <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.95rem' }}>Local Backup Archive &amp; Cloud Status</h4>
        {history.length === 0 ? (
          <p style={{ color: '#64748b', fontStyle: 'italic', margin: '0.5rem 0' }}>
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
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem' }}
                  >
                    <Download size={14} /> Download SQL
                  </a>
                ),
              ],
            ]}
          />
        )}
      </Panel>
    </div>
  );
}
