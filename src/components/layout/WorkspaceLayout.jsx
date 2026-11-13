import { useState } from 'react';
import { Store } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Alert } from '../feedback/Alert';
import { Spinner } from '../feedback/Spinner';
import { themeVars } from '../../features/profile/appearance';

export function WorkspaceLayout({
  user,
  appearance,
  branches,
  activeBranch,
  onBranchChange,
  availablePages,
  currentPage,
  onNavigate,
  online,
  menuOpen,
  setMenuOpen,
  profileOpen,
  setProfileOpen,
  onOpenProfileModal,
  onOpenSearch,
  onOpenAlerts,
  onLogout,
  allBranchPages,
  branchError,
  appError,
  children,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('zeedat_sidebar_collapsed');
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('zeedat_sidebar_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const selectedName = branches.find(b => b.id === activeBranch)?.name || 'All Branches';

  return (
    <div className={'app' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}
      style={themeVars(appearance?.accent)}
      data-accent={appearance?.accent} data-sidebar={appearance?.sidebar} data-density={appearance?.density}>
      <Sidebar
        menu={menuOpen}
        setMenu={setMenuOpen}
        pages={availablePages}
        currentPage={currentPage}
        onNavigate={onNavigate}
        online={online}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />

      <div className="workspace">
        <Header
          user={user}
          branches={branches}
          activeBranch={activeBranch}
          onBranchChange={onBranchChange}
          online={online}
          onOpenMenu={() => setMenuOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebarCollapsed}
          onOpenSearch={onOpenSearch}
          onOpenAlerts={onOpenAlerts}
          onLogout={onLogout}
          onOpenProfile={() => {
            setProfileOpen(false);
            onOpenProfileModal?.();
          }}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          allBranchPages={allBranchPages}
          currentPage={currentPage}
        />

        <main className="content">
          <Alert>{branchError || appError}</Alert>
          {branches.length || currentPage === 'profile' ? children : !branchError && <Spinner />}
        </main>

        <footer className="workspace-footer">
          <span>
            <Store size={14} /> {selectedName}
          </span>
          <span>ZEEDAT POS · Asia/Colombo · LKR</span>
        </footer>
      </div>
    </div>
  );
}
