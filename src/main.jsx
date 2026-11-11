import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeftRight,
  ArrowRight,
  Barcode,
  Boxes,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Package,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  Wrench,
  ChartNoAxesCombined,
  Settings,
} from 'lucide-react';

import { Button, Modal } from './components/common';
import {
  Alert,
  FormDialog,
  Spinner,
  Toast,
} from './components/feedback';
import { WorkspaceLayout, Logo } from './components/layout';
import { apiClient, requestKey } from './api/client';
import { offlineStore } from './utils/offlineStore';
import { syncManager } from './utils/syncManager';
import {
  allBranchPages,
  firstPage,
  managers,
  sellers,
  stockRoles,
} from './utils';

import './styles/style.css';

const dashboard = () => import('./features/dashboard');
const pos = () => import('./features/pos');
const operations = () => import('./features/operations');
const finance = () => import('./features/finance');
const admin = () => import('./features/admin');
const lazyPage = (load, name) => lazy(async () => ({ default: (await load())[name] }));
const DashboardPage = lazyPage(dashboard, 'DashboardPage');

const pages = [
  ['dashboard', 'Dashboard', LayoutDashboard, 'dashboard', DashboardPage],
  ['pos', 'POS / Sales', ShoppingCart, 'pos', lazyPage(pos, 'BillingTerminal')],
  ['repairs', 'Repairs', Wrench, 'repairs', lazyPage(operations, 'Repairs')],
  ['inventory', 'Inventory', Package, 'inventory', lazyPage(operations, 'Inventory')],
  ['barcodes', 'Barcode', Barcode, 'inventory', lazyPage(operations, 'BarcodesPage')],
  ['drawer', 'Cashbook & Register', Wallet, 'drawer', lazyPage(finance, 'CashRegister')],
  ['returns', 'Returns', ArrowLeftRight, 'returns', lazyPage(finance, 'Returns')],
  ['purchases', 'Purchases', ClipboardList, 'purchases', lazyPage(finance, 'Purchases')],
  ['transfers', 'Stock Transfers', Boxes, 'transfers', lazyPage(finance, 'StockTransfers')],
  ['customers', 'Customers', Users, 'customers', lazyPage(operations, 'Customers')],
  ['reports', 'Reports', ChartNoAxesCombined, 'reports', lazyPage(dashboard, 'ReportsPage')],
  ['sales', 'Sales History', ChartNoAxesCombined, 'sales', lazyPage(pos, 'SalesHistory')],
  ['staff', 'Staff & Permissions', ShieldCheck, 'staff', lazyPage(admin, 'StaffPage')],
  ['settings', 'Settings', Settings, 'settings', lazyPage(admin, 'SettingsPage')],
];

function Login({ onLogin, error: initialError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await apiClient('login', { data: { email, password } });
      onLogin(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <aside className="login-aside">
        <Logo />
        <div className="login-message">
          <span className="eyebrow">
            <span className="dot" /> ZEEDAT WORKSPACE
          </span>
          <h1>One workspace for your shop.</h1>
          <p>Sell products, track repairs, and manage stock across branches.</p>
          <div className="login-visual" aria-hidden="true">
            <div className="visual-grid" />
            <span className="visual-orb one" />
            <span className="visual-orb two" />
            <div className="visual-card card-a">
              <ShoppingCart />
              <span>POINT OF SALE</span>
              <b>Checkout</b>
              <div className="visual-line" />
            </div>
            <div className="visual-card card-b">
              <Wrench />
              <span>REPAIR DESK</span>
              <b>Track every job</b>
              <div className="visual-line" />
            </div>
            <div className="visual-card card-c">
              <Package />
              <span>INVENTORY</span>
              <b>Branch stock</b>
              <div className="visual-line" />
            </div>
          </div>
        </div>
        <div className="login-bottom">
          <ShieldCheck size={17} /> Secure branch access
        </div>
      </aside>

      <section className="login-main">
        <div className="login-form">
          <span className="login-icon">
            <ShieldCheck size={26} />
          </span>
          <h2>Sign in to ZEEDAT POS</h2>
          <p>Use your staff account to open the workspace.</p>
          <form onSubmit={submit}>
            <Alert>{error}</Alert>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourshop.lk"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
              <ArrowRight size={18} />
            </Button>
          </form>
          <div className="login-support">
            <CircleHelp size={17} /> Contact your shop administrator for account access.
          </div>
        </div>
      </section>
    </main>
  );
}

function Workspace({ session, onLogout }) {
  const { user: initialUser, csrf } = session;
  const [user, setUser] = useState(initialUser);

  const hasPermission = useCallback(
    perm => user.role === 'owner' || (user.permissions || []).includes(perm),
    [user]
  );

  const available = useMemo(
    () => pages.filter(page => hasPermission(page[3])),
    [hasPermission]
  );

  const getPage = useCallback(() => {
    const current = location.hash.slice(1);
    if (available.some(p => p[0] === current)) return current;
    return available.find(p => p[0] === firstPage[user.role])?.[0] || available[0]?.[0] || 'pos';
  }, [available, user.role]);

  const [page, setPage] = useState(getPage);
  const [branch, setBranch] = useState(user.branch_id || 0);
  const [branches, setBranches] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [branchError, setBranchError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [quick, setQuick] = useState('');
  const [search, setSearch] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [intent, setIntent] = useState('');
  const [appError, setAppError] = useState('');
  const [mutationKeys] = useState(() => new Map());

  const activeBranch = branch || (allBranchPages.includes(page) ? 0 : branches[0]?.id || 0);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient('session');
      if (data?.user) {
        setUser(data.user);
      }
    } catch {}
  }, []);

  useEffect(() => {
    apiClient('branches')
      .then(setBranches)
      .catch(e => setBranchError(e.message));

    if (hasPermission('transfers') || hasPermission('inventory')) {
      apiClient('destinations')
        .then(setDestinations)
        .catch(e => setBranchError(e.message));
    }

    let autoSyncPending = false;
    const runServerAutoSync = async () => {
      if (!navigator.onLine || autoSyncPending) return;
      autoSyncPending = true;
      try {
        const res = await apiClient('sync.auto', { data: {}, csrf, key: requestKey(), background: true });
        const pushedCount =
          res?.push?.synced_count ??
          ((res?.push?.synced_sales ?? 0) +
            (res?.push?.synced_customers ?? 0) +
            (res?.push?.synced_repairs ?? 0));
        const pulledCount =
          (res?.pull?.products_synced ?? 0) +
          (res?.pull?.stock_synced ?? 0) +
          (res?.pull?.customers_synced ?? 0) +
          (res?.pull?.sales_synced ?? 0) +
          (res?.pull?.drawers_synced ?? 0) +
          (res?.pull?.cash_movements_synced ?? 0) +
          (res?.pull?.returns_synced ?? 0) +
          (res?.pull?.supplier_payments_synced ?? 0) +
          (res?.pull?.barcode_logs_synced ?? 0) +
          (res?.pull?.audit_logs_synced ?? 0);
        const backedUp =
          res?.backup?.status === 'synced' || (res?.pending_backups?.uploaded ?? 0) > 0;
        if (res?.ran && (pushedCount > 0 || pulledCount > 0 || backedUp)) {
          setNotice('Online: synced all branch & cashbook data.');
          window.dispatchEvent(new Event('zeedat-sync-complete'));
        }
      } catch {
        // Silent background retry when offline or cloud URL not configured
      } finally {
        autoSyncPending = false;
      }
    };

    const changed = () => {
      setPage(getPage());
      setMenu(false);
    };
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        runServerAutoSync();
      }
    };

    const triggerAllSyncs = () => {
      syncManager.triggerSync();
      runServerAutoSync();
    };

    let writeDebounceTimer = null;
    const onLocalWrite = () => {
      if (!navigator.onLine) return;
      clearTimeout(writeDebounceTimer);
      writeDebounceTimer = setTimeout(runServerAutoSync, 2500);
    };

    const initialSyncTimer = setTimeout(triggerAllSyncs, 3000);
    const periodicSyncTimer = setInterval(triggerAllSyncs, 25000);

    const onSyncComplete = () => {
      setRevision(v => v + 1);
      apiClient('branches').then(setBranches).catch(() => {});
    };

    window.addEventListener('hashchange', changed);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener('zeedat-sync-now', runServerAutoSync);
    window.addEventListener('zeedat-local-write', onLocalWrite);
    window.addEventListener('zeedat-sync-complete', onSyncComplete);

    return () => {
      clearTimeout(initialSyncTimer);
      clearTimeout(writeDebounceTimer);
      clearInterval(periodicSyncTimer);
      window.removeEventListener('hashchange', changed);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('zeedat-sync-now', runServerAutoSync);
      window.removeEventListener('zeedat-local-write', onLocalWrite);
      window.removeEventListener('zeedat-sync-complete', onSyncComplete);
    };
  }, [getPage, hasPermission, csrf]);

  const navigate = (target, mode = '') => {
    setIntent(mode);
    setPage(target);
    location.hash = target;
    setQuick('');
    setMenu(false);
  };

  const get = useCallback(
    async (route, query = {}) => {
      try {
        const res = await apiClient(route, { query: { branch: activeBranch, ...query } });
        if (route === 'products' && Array.isArray(res)) {
          offlineStore.cacheProducts(res);
        } else if (route === 'customers' && Array.isArray(res)) {
          offlineStore.cacheCustomers(res);
        }
        return res;
      } catch (e) {
        if (e.status === 401) onLogout();

        if (route === 'products') {
          const cached = await offlineStore.getProducts();
          if (cached && cached.length > 0) return cached;
        }
        if (route === 'customers') {
          const cached = await offlineStore.getCustomers();
          if (cached && cached.length > 0) return cached;
        }

        throw e;
      }
    },
    [activeBranch, onLogout]
  );

  const mutate = async (route, values) => {
    const data = { branch: activeBranch, ...values };
    const signature = JSON.stringify([route, data]);
    const key = mutationKeys.get(signature) || requestKey();
    mutationKeys.set(signature, key);

    try {
      const result = await apiClient(route, { data, csrf, key });
      mutationKeys.delete(signature);
      setRevision(v => v + 1);
      setNotice('Changes saved');
      return result;
    } catch (e) {
      if (route === 'sale.checkout' && (!navigator.onLine || !e.status || e.status >= 500)) {
        mutationKeys.delete(signature);
        const cachedProducts = await offlineStore.getProducts();
        const currentBranch = branches.find(b => b.id === activeBranch);
        const branchName = currentBranch ? currentBranch.name : 'Shop';
        const offlineId = 'OFF-' + Date.now();
        const offlineInvoice = {
          id: offlineId,
          reference: 'OFF-' + String(Date.now()).slice(-4),
          created_at: new Date().toISOString(),
          items: (values.items || []).map((it, idx) => {
            const prod = cachedProducts.find(p => p.id === it.product_id) || {};
            return {
              id: idx + 1,
              product_id: it.product_id,
              name: prod.name || 'Product',
              price: prod.price || 0,
              qty: it.qty,
              total: (prod.price || 0) * it.qty,
            };
          }),
          subtotal: values.expected_total,
          discount: 0,
          tax: 0,
          total: values.expected_total,
          payments: values.payments || [],
          change: 0,
          customer_id: values.customer_id,
          branch_name: branchName,
          cashier: user.name,
          is_offline: true,
        };

        await offlineStore.savePendingSale(data, offlineInvoice);
        await syncManager.updateCount();
        setNotice('Offline sale saved on device. Receipt ready.');
        return offlineInvoice;
      }

      if (e.status && e.status < 500) mutationKeys.delete(signature);
      if (e.status === 401) onLogout();
      throw e;
    }
  };

  const context = {
    user,
    setUser,
    hasPermission,
    refreshUser,
    branches,
    destinations,
    branch: activeBranch,
    get,
    mutate,
    revision,
    navigate,
    setDialog,
    setNotice,
    intent,
    clearIntent: () => setIntent(''),
  };

  const Page = available.find(item => item[0] === page)?.[4] || DashboardPage;

  return (
    <>
      <WorkspaceLayout
        user={user}
        branches={branches}
        activeBranch={activeBranch}
        onBranchChange={setBranch}
        availablePages={available}
        currentPage={page}
        onNavigate={navigate}
        online={online}
        menuOpen={menu}
        setMenuOpen={setMenu}
        profileOpen={profile}
        setProfileOpen={setProfile}
        onOpenSearch={() => {
          setSearch('');
          setQuick('search');
        }}
        onOpenAlerts={() =>
          managers.includes(user.role) ? navigate('dashboard', 'alerts') : setQuick('notices')
        }
        onLogout={async () => {
          try {
            await apiClient('logout', { data: {}, csrf });
            onLogout();
          } catch (e) {
            setAppError(e.message);
            setProfile(false);
          }
        }}
        allBranchPages={allBranchPages}
        branchError={branchError}
        appError={appError}
      >
        <Suspense fallback={<Spinner />}>
          <Page key={page + '-' + activeBranch} ctx={context} />
        </Suspense>
      </WorkspaceLayout>

      {dialog && (
        <FormDialog
          key={dialog.title}
          spec={dialog}
          close={() => setDialog(null)}
          mutate={mutate}
        />
      )}

      {notice && <Toast notice={notice} onClose={() => setNotice('')} />}

      {quick && (
        <Modal
          title={quick === 'search' ? 'Find a module' : 'Notifications'}
          onClose={() => setQuick('')}
        >
          <div className="modal-body">
            {quick === 'search' ? (
              <>
                <input
                  className="quick-input"
                  autoFocus
                  type="search"
                  aria-label="Search modules"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search modules…"
                />
                <div className="quick-results">
                  {available
                    .filter(p => p[1].toLowerCase().includes(search.toLowerCase()))
                    .map(([id, label, Icon]) => (
                      <Button key={id} icon={Icon} onClick={() => navigate(id)}>
                        {label}
                        <ArrowRight size={15} />
                      </Button>
                    ))}
                </div>
              </>
            ) : (
              <p>No new notifications.</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [webUpdate, setWebUpdate] = useState(false);

  const logout = useCallback(() => {
    setSession(null);
    location.hash = '';
  }, []);

  useEffect(() => {
    apiClient('session')
      .then(data => setSession(data.user ? data : null))
      .catch(e => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (location.protocol !== 'https:' || webUpdate) return;
    const entry = document.querySelector('script[type="module"][src]')?.getAttribute('src');
    if (!entry) return;
    const abort = new AbortController();
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(location.pathname, { cache: 'no-store', signal: abort.signal });
        if (!response.ok) return;
        const latest = new DOMParser().parseFromString(await response.text(), 'text/html')
          .querySelector('script[type="module"][src]')?.getAttribute('src');
        if (latest && latest !== entry && !abort.signal.aborted) setWebUpdate(true);
      } catch {
        // Try again after the browser comes online or at the next scheduled check.
      }
    };
    const timer = setInterval(check, 120000);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [webUpdate]);

  if (!loaded) return <Spinner />;

  const page = session ? (
    <Workspace session={session} onLogout={logout} />
  ) : (
    <Login
      onLogin={data => {
        location.hash = firstPage[data.user.role] || 'dashboard';
        setSession(data);
      }}
      error={error}
    />
  );
  return (
    <>
      {page}
      {webUpdate && (
        <div className="toast" role="status">
          <span>Update available. Finish your current work before reloading.</span>
          <Button onClick={() => location.reload()}>Reload</Button>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
