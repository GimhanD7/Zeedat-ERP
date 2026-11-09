import { Bell, Building2, ChevronDown, LogOut, Menu, Search } from 'lucide-react';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { initials, roles, managers } from '../../utils';

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

      <div className="top-right">
        <span className={'connection ' + (!online ? 'offline' : '')}>
          <span className="dot" />
          {online ? 'Online' : 'Offline'}
        </span>
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
