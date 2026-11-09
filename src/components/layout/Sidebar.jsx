import { ChevronRight, Smartphone } from 'lucide-react';

export function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Smartphone size={25} strokeWidth={2.4} />
      </span>
      <span>
        <strong>
          ZEEDAT <em>POS</em>
        </strong>
        <small>RETAIL & REPAIR</small>
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
