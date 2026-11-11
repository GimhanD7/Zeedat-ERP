import { useState, useEffect } from 'react';
import { Bell, Building2, ChevronDown, LogOut, Menu, RefreshCw, Search } from 'lucide-react';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { initials, roles, managers } from '../../utils';
import { syncManager } from '../../utils/syncManager';

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
  const [desktopUpdate, setDesktopUpdate] = useState(null);

  useEffect(() => {
    return syncManager.subscribe(setSyncInfo);
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

        {/* Sync Pill: Synced */}
        <button
          onClick={() => online && syncManager.triggerSync()}
          title="Click to trigger cloud synchronization"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '12px',
            color: '#15803d',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} className={syncInfo.isSyncing ? 'spin' : ''} />
          <span>
            {syncInfo.isSyncing
              ? `Syncing (${syncInfo.pendingCount})...`
              : syncInfo.pendingCount > 0
              ? `${syncInfo.pendingCount} Pending Sync`
              : 'Synced Today'}
          </span>
        </button>

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
