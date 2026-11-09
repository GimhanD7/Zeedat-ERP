import { Store } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Alert } from '../feedback/Alert';
import { Spinner } from '../feedback/Spinner';

export function WorkspaceLayout({
  user,
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
  onOpenSearch,
  onOpenAlerts,
  onLogout,
  allBranchPages,
  branchError,
  appError,
  children,
}) {
  const selectedName = branches.find(b => b.id === activeBranch)?.name || 'All Branches';

  return (
    <div className="app">
      <Sidebar
        menu={menuOpen}
        setMenu={setMenuOpen}
        pages={availablePages}
        currentPage={currentPage}
        onNavigate={onNavigate}
        online={online}
      />

      <div className="workspace">
        <Header
          user={user}
          branches={branches}
          activeBranch={activeBranch}
          onBranchChange={onBranchChange}
          online={online}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenSearch={onOpenSearch}
          onOpenAlerts={onOpenAlerts}
          onLogout={onLogout}
          profileOpen={profileOpen}
          setProfileOpen={setProfileOpen}
          allBranchPages={allBranchPages}
          currentPage={currentPage}
        />

        <main className="content">
          <Alert>{branchError || appError}</Alert>
          {branches.length ? children : !branchError && <Spinner />}
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
