import { useState, useEffect } from 'react';
import { Bell, Building2, ChevronDown, LogOut, Menu, RefreshCw, Search } from 'lucide-react';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { initials, roles, managers, setServerImageState } from '../../utils';
import { syncManager } from '../../utils/syncManager';
import { apiClient } from '../../api/client';

export function Header({
  user,
  branches,
  activeBranch,
  onBranchChange,
  online,
  onOpenMenu,
  onOpenSearch,
  onOpenAlerts,
  onLogout,
  profileOpen,
  setProfileOpen,
  allBranchPages,
  currentPage,
}) {
  const [syncInfo, setSyncInfo] = useState({ isSyncing: false, pendingCount: 0 });
  const [serverDbState, setServerDbState] = useState(null);
  const [desktopUpdate, setDesktopUpdate] = useState(null);

  useEffect(() => {
    return syncManager.subscribe(setSyncInfo);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshDbStatus = () => {
      apiClient('sync.status')
        .then(st => {
          if (active && st) {
            setServerDbState(st);
            setServerImageState({
              driver: st.driver || null,
              fallbackActive: Boolean(st.fallback_active),
            });
          }
        })
        .catch(() => {});
    };
    refreshDbStatus();
    const timer = setInterval(refreshDbStatus, 15000);
    window.addEventListener('zeedat-sync-complete', refreshDbStatus);
    window.addEventListener('zeedat-local-write', refreshDbStatus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('zeedat-sync-complete', refreshDbStatus);
      window.removeEventListener('zeedat-local-write', refreshDbStatus);
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;
    api.getUpdateStatus?.().then(st => st && setDesktopUpdate(st)).catch(() => {});
    return api.onUpdateStatus?.(st => setDesktopUpdate(st));
  }, []);
  return (
    <header className="topbar">
      <div className="top-left">
        <Button
          icon={Menu}
          className="icon-only mobile-menu"
          aria-label="Open menu"
          onClick={onOpenMenu}
        />
        <div className="branch-control">
          <Building2 size={18} />
          <Select
            aria-label="Active branch"
            value={activeBranch}
            options={[
              ...(user.role === 'owner' && allBranchPages.includes(currentPage)
                ? [[0, 'All Branches']]
                : []),
              ...branches.map(b => [b.id, b.name]),
            ]}
            onChange={e => onBranchChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="top-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {desktopUpdate?.state === 'ready' && (
          <button
            onClick={() => window.electronAPI?.restartApp?.()}
            title="New update patch downloaded. Click to restart and apply."
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0f766e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} />
            <span>Restart to Update</span>
          </button>
        )}

        {desktopUpdate?.state === 'downloading' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <RefreshCw size={13} className="spin" />
            <span>Downloading Patch...</span>
          </div>
        )}

        {/* Status Pill: Online */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: online ? '#059669' : '#dc2626',
            color: '#ffffff',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffffff' }} />
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>

        {/* Sync Pill: Live Server DB / Local Offline SQLite Status */}
        {(() => {
          const totalPending = (syncInfo.pendingCount || 0) + (serverDbState?.total_pending || 0);
          const isDirectMysql = serverDbState?.driver === 'mysql';
          const isFallback = Boolean(serverDbState?.fallback_active);
          const bg = totalPending > 0 || isFallback ? '#fffbeb' : '#f0fdf4';
          const border = totalPending > 0 || isFallback ? '#fde68a' : '#bbf7d0';
          const textColor = totalPending > 0 || isFallback ? '#b45309' : '#15803d';
          const label = syncInfo.isSyncing
            ? `Syncing (${totalPending})...`
            : isFallback
              ? `Offline SQLite${totalPending > 0 ? ` · ${totalPending} Pending` : ''}`
              : totalPending > 0
                ? `${totalPending} Pending Sync`
                : isDirectMysql
                  ? 'Server MySQL Live'
                  : 'Cloud Synced';
          return (
            <button
              onClick={() => {
                if (online) {
                  syncManager.triggerSync();
                  window.dispatchEvent(new Event('zeedat-sync-now'));
                }
              }}
              title="Click to sync local SQLite with server database"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '12px',
                color: textColor,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} className={syncInfo.isSyncing ? 'spin' : ''} />
              <span>{label}</span>
            </button>
          );
        })()}

        <Button
          icon={Search}
          className="icon-only header-icon"
          aria-label="Find a module"
          onClick={onOpenSearch}
        />
        <Button
          icon={Bell}
          className="icon-only header-icon"
          aria-label="Open alerts"
          onClick={onOpenAlerts}
        />
        <div className="profile-wrap">
          <button
            className="profile"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <span className="avatar">{initials(user.name)}</span>
            <span className="profile-text">
              <strong>{user.name}</strong>
              <small>{roles[user.role]}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <small>{user.email}</small>
              <Button icon={LogOut} onClick={onLogout}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
