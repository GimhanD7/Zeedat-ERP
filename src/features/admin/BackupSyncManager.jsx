import { useState, useEffect } from 'react';
import { 
  Cloud, 
  CheckCircle2, 
  CloudOff, 
  Database, 
  Download, 
  HardDrive, 
  RefreshCw, 
  Settings2, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import { Button, Panel, Table, Badge } from '../../components/common';
import { timeLabel } from '../../utils';

export function BackupSyncManager({ ctx }) {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sum, hist] = await Promise.all([
        ctx.api('backup.summary'),
        ctx.api('backup.history'),
      ]);
      setSummary(sum);
      setHistory(hist || []);
    } catch (err) {
      console.error('Failed to load backup data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManualBackup = async () => {
    try {
      setSyncing(true);
      setMessage(null);
      const res = await ctx.commit('backup.create', {});
      setMessage({
        type: res.status === 'synced' ? 'success' : 'info',
        text: res.message || 'Backup process completed.',
      });
      await loadData();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Backup failed. Please check local database.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleTwoWaySync = async () => {
    try {
      setSyncing(true);
      setMessage(null);
      const pushRes = await ctx.commit('sync.push', {});
      const pullRes = await ctx.commit('sync.pull', {});
      setMessage({
        type: 'success',
        text: `Sync Complete! Uploaded ${pushRes.synced_sales ?? 0} sales. Downloaded ${pullRes.products_synced ?? 0} products.`,
      });
      await loadData();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message || 'Cloud sync error. Please check server URL.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const openConfigDialog = () => {
    if (!summary) return;
    ctx.setDialog({
      title: 'Configure Auto Cloud Backup',
      route: 'backup.save_settings',
      values: {
        cloud_backup_url: summary.cloud_backup_url || '',
        cloud_api_key: summary.cloud_api_key || '',
        auto_sync_enabled: summary.auto_sync_enabled ? '1' : '0',
        sync_interval_minutes: summary.sync_interval_minutes || 15,
      },
      fields: [
        { 
          name: 'cloud_backup_url', 
          label: 'Central Cloud Server Backup URL', 
          placeholder: 'https://cloud.zeedat.com/api/index.php?route=backup.receive', 
          full: true 
        },
        { 
          name: 'cloud_api_key', 
          label: 'Security API Key / Bearer Token', 
          placeholder: 'zeedat-secret-token-xyz', 
          full: true 
        },
        { 
          name: 'auto_sync_enabled', 
          label: 'Enable Automated Cloud Sync', 
          choices: ['1', '0'] 
        },
        { 
          name: 'sync_interval_minutes', 
          label: 'Auto Sync Frequency (Minutes)', 
          type: 'number',
          min: 5,
          max: 1440
        },
      ],
      transform: v => ({
        cloud_backup_url: v.cloud_backup_url,
        cloud_api_key: v.cloud_api_key,
        auto_sync_enabled: v.auto_sync_enabled === '1' ? 1 : 0,
        sync_interval_minutes: parseInt(v.sync_interval_minutes, 10) || 15,
      }),
      onSuccess: () => loadData(),
    });
  };

  const isOnline = summary?.is_online ?? navigator.onLine;

  return (
    <div className="stack" style={{ marginTop: '1.5rem' }}>
      <Panel
        title="Local Offline Storage & Cloud Auto-Backup"
        icon={Database}
        action={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button 
              icon={Settings2} 
              variant="outline" 
              onClick={openConfigDialog}
              disabled={loading}
            >
              Cloud Settings
            </Button>
            <Button 
              icon={RefreshCw} 
              variant="outline"
              onClick={handleTwoWaySync} 
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync with Cloud'}
            </Button>
            <Button 
              icon={Download} 
              onClick={handleManualBackup} 
              disabled={syncing}
            >
              Backup SQL Now
            </Button>
          </div>
        }
      >
        {/* Offline / Online Status Alert */}
        <div 
          style={{
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            background: isOnline ? 'var(--color-green-light, #e6f4ea)' : 'var(--color-amber-light, #fef7e0)',
            border: `1px solid ${isOnline ? '#34a853' : '#f9ab00'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isOnline ? (
              <Wifi size={24} style={{ color: '#137333' }} />
            ) : (
              <WifiOff size={24} style={{ color: '#b06000' }} />
            )}
            <div>
              <strong style={{ display: 'block', color: isOnline ? '#137333' : '#b06000' }}>
                {isOnline ? 'Online: Cloud Sync is Active' : 'Offline Mode: Local Storage Active'}
              </strong>
              <small style={{ color: '#444' }}>
                {isOnline
                  ? 'All local sales and data will automatically replicate to the central cloud server.'
                  : 'No internet connection detected. Cashier selling, barcode scans, and bill printing are 100% functional and safely stored on this machine.'}
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
              background: message.type === 'error' ? '#fce8e6' : '#e8f0fe',
              color: message.type === 'error' ? '#c5221f' : '#1a73e8',
              fontSize: '0.875rem',
            }}
          >
            {message.text}
          </div>
        )}

        {/* Status Metrics Grid */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ padding: '0.875rem', background: 'var(--surface-sunken, #f8f9fa)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '0.25rem' }}>
              <HardDrive size={16} />
              <small>Local Storage State</small>
            </div>
            <strong style={{ fontSize: '1rem', color: '#137333' }}>Offline Protected</strong>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
              {summary ? `${summary.free_disk_space_mb} MB Free` : 'Checking drive...'}
            </div>
          </div>

          <div style={{ padding: '0.875rem', background: 'var(--surface-sunken, #f8f9fa)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '0.25rem' }}>
              <CloudCheck size={16} />
              <small>Last Cloud Backup</small>
            </div>
            <strong style={{ fontSize: '0.95rem' }}>
              {summary?.last_synced_at ? timeLabel(summary.last_synced_at) : 'Not synced yet'}
            </strong>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
              {summary?.auto_sync_enabled ? `Syncs every ${summary.sync_interval_minutes} mins` : 'Auto-sync disabled'}
            </div>
          </div>

          <div style={{ padding: '0.875rem', background: 'var(--surface-sunken, #f8f9fa)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '0.25rem' }}>
              <Database size={16} />
              <small>Local Snapshots Created</small>
            </div>
            <strong style={{ fontSize: '1rem' }}>
              {summary?.total_backups_created ?? history.length} Snapshots
            </strong>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
              Stored in <code>/backups/</code>
            </div>
          </div>
        </div>

        {/* Recent Backups History Table */}
        <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.95rem' }}>Local Backup Archive & Cloud Status</h4>
        {history.length === 0 ? (
          <p style={{ color: '#888', fontStyle: 'italic', margin: '0.5rem 0' }}>
            No backups created yet. Click "Backup & Sync Now" to create your first snapshot.
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
                    href={`/api/index.php?route=backup.download&file=${encodeURIComponent(r.filename)}`}
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

