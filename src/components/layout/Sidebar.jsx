import { ChevronRight, PanelLeftClose, PanelLeftOpen, RefreshCw, Smartphone } from 'lucide-react';
import { syncManager } from '../../utils/syncManager';
import { useSystemLogo } from '../../utils/imageCompress';

export function Logo({ collapsed = false }) {
  const { logo, shopName } = useSystemLogo();
  return (
    <div className={'brand' + (collapsed ? ' collapsed' : '')}>
      <span className={'brand-mark' + (logo ? ' has-logo' : '')}>
        {logo ? (
          <img src={logo} alt={shopName || 'ZEEDAT POS'} className="brand-logo-img" />
        ) : (
          <Smartphone size={22} strokeWidth={2.4} />
        )}
      </span>
      {!collapsed && (
        <span className="brand-text">
          <strong>{shopName || 'ZEEDAT POS'}</strong>
          <small>Mobile Shop &amp; Repair</small>
        </span>
      )}
    </div>
  );
}

export function Sidebar({
  menu,
  setMenu,
  pages,
  currentPage,
  onNavigate,
  online,
  collapsed = false,
  onToggleCollapse,
}) {
  const isCompact = collapsed && !menu;
  const { logo, shopName } = useSystemLogo();

  return (
    <>
      {menu && (
        <button
          className="mobile-shade"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}

      <aside className={'sidebar' + (menu ? ' shown' : '') + (isCompact ? ' collapsed' : '')}>
        <div className="sidebar-head">
          <Logo collapsed={isCompact} />
          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={onToggleCollapse}
              title={isCompact ? 'Expand sidebar' : 'Collapse sidebar (icons only)'}
              aria-label={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCompact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}
        </div>

        <div className="side-scroll">
          {!isCompact && <div className="nav-caption">WORKSPACE</div>}
          <nav aria-label="Main navigation">
            {pages.map(([id, label, Icon]) => (
              <a
                key={id}
                href={'#' + id}
                title={isCompact ? label : undefined}
                aria-label={isCompact ? label : undefined}
                data-tooltip={isCompact ? label : undefined}
                className={currentPage === id ? 'active' : ''}
                aria-current={currentPage === id ? 'page' : undefined}
                onClick={() => onNavigate(id)}
              >
                <span className="sidebar-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.85} /></span>
                {!isCompact && <span>{label}</span>}
                {!isCompact && currentPage === id && <ChevronRight size={14} className="active-arrow" />}
              </a>
            ))}
          </nav>
        </div>

        <div className="side-sync-wrap">
          <button
            type="button"
            className="side-sync-btn"
            title={isCompact ? 'Sync Now' : undefined}
            onClick={() => syncManager.triggerSync()}
          >
            <RefreshCw size={15} />
            {!isCompact && <span>Sync Now</span>}
          </button>
        </div>

        <div className="side-footer" title={isCompact ? `${shopName || 'ZEEDAT POS'} · ${online ? 'Online' : 'Offline'}` : undefined}>
          <div className="side-footer-icon">
            {logo ? (
              <img src={logo} alt={shopName || 'ZEEDAT POS'} className="side-footer-logo-img" />
            ) : (
              <Smartphone size={19} />
            )}
            {isCompact && <span className={'dot mini-dot ' + (!online ? 'offline' : '')} />}
          </div>
          {!isCompact && (
            <>
              <div>
                <strong>{shopName || 'ZEEDAT POS'}</strong>
                <small>Retail &amp; Repair Suite</small>
              </div>
              <span className={'dot ' + (!online ? 'offline' : '')} />
            </>
          )}
        </div>
      </aside>
    </>
  );
}
