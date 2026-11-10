import { ChevronRight, RefreshCw, Smartphone } from 'lucide-react';
import { syncManager } from '../../utils/syncManager';

export function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark" style={{ background: '#0d9488', color: '#ffffff' }}>
        <Smartphone size={24} strokeWidth={2.4} />
      </span>
      <span>
        <strong>ZEEDAT POS</strong>
        <small style={{ color: '#0d9488', fontWeight: 600 }}>Mobile Shop & Repair</small>
      </span>
    </div>
  );
}

export function Sidebar({ menu, setMenu, pages, currentPage, onNavigate, online }) {
  return (
    <>
      {menu && (
        <button
          className="mobile-shade"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}

      <aside className={'sidebar ' + (menu ? 'shown' : '')}>
        <Logo />
        <div className="side-scroll">
          <div className="nav-caption">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {pages.map(([id, label, Icon]) => (
              <a
                key={id}
                href={'#' + id}
                className={currentPage === id ? 'active' : ''}
                aria-current={currentPage === id ? 'page' : undefined}
                onClick={() => onNavigate(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {currentPage === id && <ChevronRight size={14} className="active-arrow" />}
              </a>
            ))}
          </nav>
        </div>

        <div style={{ padding: '10px 14px 4px' }}>
          <button
            type="button"
            onClick={() => syncManager.triggerSync()}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1.5px solid #0d9488',
              background: '#f0fdfa',
              color: '#0f766e',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw size={15} />
            <span>Sync Now</span>
          </button>
        </div>

        <div className="side-footer">
          <div className="side-footer-icon">
            <Smartphone size={20} />
          </div>
          <div>
            <strong>ZEEDAT POS</strong>
            <small>Retail & Repair Suite</small>
          </div>
          <span className={'dot ' + (!online ? 'offline' : '')} />
        </div>
      </aside>
    </>
  );
}
