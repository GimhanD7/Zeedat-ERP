import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Banknote,
  Barcode,
  CalendarDays,
  History,
  LockKeyhole,
  Minus,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
  UserPlus,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Empty,
  Field,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  ProductArt,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import {
  categories,
  cents,
  dateLabel,
  hasCashInPayments,
  money,
  printThermalReceipt,
  ref,
  tenders,
  today,
  triggerCashDrawerForSettlement,
} from '../../utils';
import { CheckoutModal } from './CheckoutModal';
import { ReceiptModal } from './ReceiptModal';
import {
  CashRegisterModal,
  CloseReconcileModal,
  QuickCashMovementModal,
} from '../finance/CashRegister';

const lineKey = (product, unit) => product + ':' + (unit || '');
const amountDue = (subtotal, discount, tax) => subtotal - discount + tax;

export function BillingTerminal({ ctx }) {
  const state = useData(ctx, {
    products: 'products',
    units: 'units',
    customers: 'customers',
    register: 'drawer',
    drafts: 'drafts',
    settings: 'settings',
    staffList: 'staff.lookup',
  });

  return <DataView state={state}>{data => <BillingView ctx={ctx} data={data} onRefresh={state.refresh} />}</DataView>;
}

function BillingView({ ctx, data, onRefresh }) {
  const { products, units, customers, register, drafts, settings, staffList = [] } = data;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Products');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState('');
  const [custQuery, setCustQuery] = useState('');
  const [custDropdownOpen, setCustDropdownOpen] = useState(false);
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState('0');
  const [staffIdInput, setStaffIdInput] = useState(() => String(ctx.user?.id || ''));
  const [draftId, setDraftId] = useState(null);
  const [device, setDevice] = useState(null);
  const [chosenUnit, setChosenUnit] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [held, setHeld] = useState(false);
  const [cashMoveDir, setCashMoveDir] = useState(null);
  const [cashbookOpen, setCashbookOpen] = useState(() => ctx.intent === 'cashbook');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const custPickerRef = useRef(null);

  const selectedCustomerObj = useMemo(
    () => customers.find(c => String(c.id) === String(customer)) || null,
    [customers, customer]
  );

  const popularCustomers = useMemo(() => {
    return [...customers]
      .sort(
        (a, b) =>
          Number(b.sales_count || 0) - Number(a.sales_count || 0) ||
          Number(b.total || 0) - Number(a.total || 0) ||
          Number(b.loyalty_points || 0) - Number(a.loyalty_points || 0)
      )
      .slice(0, 4);
  }, [customers]);

  const matchingCustomers = useMemo(() => {
    const qCust = custQuery.trim().toLowerCase();
    const list = qCust
      ? customers.filter(
          c =>
            String(c.phone || '').toLowerCase().includes(qCust) ||
            String(c.name || '').toLowerCase().includes(qCust)
        )
      : popularCustomers;
    return list.slice(0, 8);
  }, [customers, popularCustomers, custQuery]);

  useEffect(() => {
    const handleOutside = e => {
      if (custPickerRef.current && !custPickerRef.current.contains(e.target)) {
        setCustDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const openQuickAddCustomer = (prefillText = '') => {
    const clean = prefillText.trim();
    const looksPhone = /^[0-9+\-\s]{4,}$/.test(clean);
    ctx.setDialog({
      title: 'Add New Customer',
      description: 'Register customer for loyalty points (1 LKR = 1 pt) & wallet.',
      route: 'customer.save',
      submit: 'Save Customer',
      values: {
        branch: ctx.branch,
        name: looksPhone ? '' : clean,
        phone: looksPhone ? clean : '',
        email: '',
        notes: '',
      },
      fields: [
        { name: 'name', label: 'Customer Full Name' },
        { name: 'phone', label: 'Mobile Phone Number', type: 'tel' },
        { name: 'email', label: 'Email (Optional)', type: 'email', optional: true },
        { name: 'notes', label: 'Notes (Optional)', type: 'textarea', optional: true },
      ],
      onSuccess: created => {
        if (created?.id) {
          setCustomer(String(created.id));
          setCustQuery('');
          setCustDropdownOpen(false);
        }
        onRefresh?.();
        ctx.setNotice(`Customer "${created?.name || 'Saved'}" added & selected.`);
      },
    });
  };

  const openWalletTopupDialog = custObj => {
    if (!custObj) return;
    ctx.setDialog({
      title: `Top Up Wallet · ${custObj.name}`,
      description: `Current Balance: ${money(custObj.wallet_balance || 0)} · Points: ${Number(custObj.loyalty_points || 0).toLocaleString()} pts`,
      route: 'customer.wallet.topup',
      submit: 'Add to Wallet',
      values: { customer_id: custObj.id, amount: '', method: 'Cash', reference: '' },
      fields: v => [
        { name: 'amount', label: 'Top-Up Amount (LKR)', type: 'money', min: 1, full: true },
        { name: 'method', label: 'Payment Method', choices: tenders },
        ...(v.method !== 'Cash'
          ? [{ name: 'reference', label: 'Transaction Reference', optional: true }]
          : []),
      ],
      transform: v => ({ ...v, amount: cents(v.amount || 0) }),
      onSuccess: () => {
        onRefresh?.();
        ctx.setNotice('Customer wallet topped up successfully.');
      },
    });
  };

  useEffect(() => {
    if (ctx.intent === 'cashbook') {
      setCashbookOpen(true);
      ctx.clearIntent?.();
    }
  }, [ctx.intent]);

  const branch = ctx.branches.find(b => Number(b.id) === Number(ctx.branch));

  const branchUnits = units.filter(
    u =>
      u.state === 'Available' &&
      (!ctx.branch || Number(u.branch_id) === Number(ctx.branch))
  );

  const getBranchQty = p => {
    if (p.category === 'Services') return 0;
    if (p.serialized) {
      const unitCount = branchUnits.filter(u => Number(u.product_id) === Number(p.id)).length;
      if (units.length > 0) return unitCount;
    }
    if (ctx.branch > 0 && Array.isArray(p.branch_stocks)) {
      const hit = p.branch_stocks.find(bs => Number(bs.branch_id) === Number(ctx.branch));
      return hit ? Number(hit.qty || 0) : 0;
    }
    return Number(p.qty || 0);
  };

  const lines = cart.flatMap(line => {
    const product = products.find(p => p.id === line.product_id);
    return product ? [{ ...line, product, id: lineKey(line.product_id, line.unit_id) }] : [];
  });

  const parsedStaffId = parseInt(String(staffIdInput || '').trim(), 10) || 0;
  const resolvedStaff = useMemo(() => {
    if (!parsedStaffId) return null;
    return (
      staffList.find(s => Number(s.id) === parsedStaffId) ||
      (Number(ctx.user?.id) === parsedStaffId ? ctx.user : null)
    );
  }, [parsedStaffId, staffList, ctx.user]);
  const staffInvalid = String(staffIdInput || '').trim() !== '' && !resolvedStaff;

  const subtotal = lines.reduce((sum, r) => sum + r.qty * r.product.price, 0);
  const maxFixedDiscount =
    ctx.user.role === 'cashier' ? Math.floor((subtotal * 500 + 5000) / 10000) : subtotal;
  const rawFixedCents = Math.max(0, cents(discountValue || 0));
  const clampedFixedCents = Math.min(maxFixedDiscount, rawFixedCents);
  const discountBps =
    discountType === 'fixed'
      ? subtotal > 0
        ? Math.min(10000, Math.round((clampedFixedCents * 10000) / subtotal))
        : 0
      : Math.min(ctx.user.role === 'cashier' ? 500 : 10000, Math.max(0, cents(discountValue || 0)));
  const discount =
    discountType === 'fixed'
      ? clampedFixedCents
      : Math.floor((subtotal * discountBps + 5000) / 10000);
  const tax = Math.floor(((subtotal - discount) * settings.tax_bps + 5000) / 10000);
  const total = amountDue(subtotal, discount, tax);
  const reserved = new Set(cart.map(r => r.unit_id));

  const estimatedCommission = useMemo(() => {
    if (!lines.length) return 0;
    let processed = 0;
    let allocated = 0;
    return lines.reduce((sum, r) => {
      const extended = r.qty * r.product.price;
      processed += extended;
      const cumulative = subtotal ? Math.floor((processed * total) / subtotal) : 0;
      const lineTotal = cumulative - allocated;
      allocated = cumulative;
      const cType = r.product.commission_type || 'fixed';
      const cVal = Number(r.product.commission_value || 0);
      const lineComm =
        cType === 'percent' ? Math.floor((lineTotal * cVal + 5000) / 10000) : cVal * r.qty;
      return sum + lineComm;
    }, 0);
  }, [lines, subtotal, total]);

  const clear = () => {
    setCart([]);
    setCustomer('');
    setDiscountType('percent');
    setDiscountValue('0');
    setStaffIdInput(String(ctx.user?.id || ''));
    setDraftId(null);
    setError('');
  };

  const add = (product, unit) => {
    setError('');
    const id = product.id;
    const availQty = getBranchQty(product);
    if (product.category !== 'Services' && availQty <= 0) {
      setError(`"${product.name}" is out of stock in ${branch?.name || 'this branch'}.`);
      return;
    }
    if (product.serialized && !unit) {
      setChosenUnit('');
      setDevice(product);
      return;
    }
    const existing = cart.find(r => r.product_id === id && r.unit_id === (unit?.id || null));
    if (
      existing &&
      (unit || (product.category !== 'Services' && existing.qty >= availQty))
    ) {
      setError('No more available stock for this item.');
      return;
    }
    if (existing) {
      setCart(cart.map(r => (r === existing ? { ...r, qty: r.qty + 1 } : r)));
    } else {
      setCart([...cart, { product_id: id, unit_id: unit?.id || null, qty: 1 }]);
    }
  };

  const increment = (line, delta) => {
    if (delta > 0) {
      add(line.product);
      return;
    }
    setCart(
      cart
        .map(r => (lineKey(r.product_id, r.unit_id) === line.id ? { ...r, qty: r.qty - 1 } : r))
        .filter(r => r.qty > 0)
    );
  };

  const handleScan = e => {
    if (e.key !== 'Enter') return;
    const value = query.trim().toLowerCase();
    if (!value) return;
    const unit = branchUnits.find(
      u => [u.code, u.imei].some(s => s?.toLowerCase() === value)
    );
    const product = products.find(p =>
      unit ? p.id === unit.product_id : [p.sku, p.barcode].some(s => s?.toLowerCase() === value)
    );
    if (!product) return;
    if (getBranchQty(product) > 0 || product.category === 'Services') {
      e.preventDefault();
      add(product, unit);
      setQuery('');
    } else {
      e.preventDefault();
      setError(`"${product.name}" is out of stock in ${branch?.name || 'this branch'}.`);
    }
  };

  useEffect(() => {
    const handle = e => {
      if (device || held || checkout || receipt || cashMoveDir || cashbookOpen || reconcileOpen || document.querySelector('.modal')) return;
      if (e.key === 'F2') {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === 'F7' && lines.length && register.drawer?.business_date === today()) {
        e.preventDefault();
        setCheckout(true);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [device, held, checkout, receipt, cashMoveDir, cashbookOpen, reconcileOpen, lines.length, register.drawer]);

  const hold = async () => {
    setBusy(true);
    setError('');
    try {
      await ctx.mutate('draft.save', {
        id: draftId,
        payload: { cart, customer, discountType, discountValue, staffIdInput },
      });
      clear();
      ctx.setNotice('Bill held');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const drawer = register.drawer;
  const registerMovements = register.movements || [];
  const registerBlocked = Boolean(register.blocked);
  const shiftCashIn = registerMovements.reduce((s, r) => s + Math.max(0, r.amount), 0);
  const shiftCashOut = registerMovements.reduce((s, r) => s + Math.min(0, r.amount), 0);
  const current = drawer?.business_date === today();
  const isManager = ['owner', 'manager'].includes(ctx.user.role);

  const openCashRegisterDialog = () => {
    ctx.setDialog({
      title: 'Open Cash Register',
      description: 'Enter starting cash float to begin today’s POS shift.',
      route: 'drawer.open',
      submit: 'Open Register',
      fields: [{ name: 'opening', label: 'Opening Float (LKR)', type: 'money', full: true }],
      values: { opening: 0 },
      transform: v => ({ ...v, opening: cents(v.opening) }),
      onSuccess: () => onRefresh?.(),
    });
  };

  const handleQuickCashMovement = dir => {
    if (registerBlocked) {
      setError('Another cashier currently holds the open drawer for this branch.');
      return;
    }
    if (!drawer && !isManager) {
      ctx.setNotice('Open today’s cash register first before recording Cash In or Cash Out.');
      openCashRegisterDialog();
      return;
    }
    setCashMoveDir(dir);
  };

  const q = query.trim().toLowerCase();
  const matched = new Set(
    branchUnits
      .filter(u => [u.imei, u.code].some(v => v?.toLowerCase().includes(q)))
      .map(u => u.product_id)
  );
  const inStockCatalog = products
    .map(p => ({ ...p, branchQty: getBranchQty(p) }))
    .filter(p => p.category === 'Services' || p.branchQty > 0);
  const filtered = inStockCatalog.filter(
    p =>
      (category === 'All Products' || p.category === category) &&
      (!q ||
        [p.name, p.sku, p.barcode, p.brand].some(s => s?.toLowerCase().includes(q)) ||
        matched.has(p.id))
  );

  return (
    <div className="zk-pos-viewport">
      <Heading
        title="POS / Billing"
        description={'Create bills, sell products and record payments — ' + branch?.name}
      >
        <Button
          icon={Wallet}
          onClick={() => {
            if (!drawer && !registerBlocked && !isManager) {
              openCashRegisterDialog();
            } else {
              setCashbookOpen(true);
            }
          }}
        >
          Cashbook &amp; Register{' '}
          <Badge tone={current ? 'green' : 'red'}>{current ? 'Open' : 'Closed'}</Badge>
        </Button>
        <span className="date-chip">
          <CalendarDays size={16} />
          {dateLabel(today())}
        </span>
      </Heading>

      <Alert>{error}</Alert>

      {/* MODERN POS REGISTER & CASH IN / CASH OUT BAR */}
      <section className="zk-pos-cashbar" aria-label="Cash Register & Movements">
        <div className="zk-pos-cashbar-stats">
          <div className="zk-pos-cash-status">
            <span className={`zk-cb-status-pill ${current ? 'open' : 'closed'}`}>
              <span className="zk-cb-dot" />
              {current ? 'Register Open' : registerBlocked ? 'Active Elsewhere' : 'Register Closed'}
            </span>
            <small>{drawer ? `Cashier: ${drawer.operator || ctx.user.name}` : branch?.name}</small>
          </div>

          <div className="zk-pos-cash-metrics">
            <div className="zk-pos-cash-metric">
              <span>Float</span>
              <strong>{money(drawer?.opening || 0)}</strong>
            </div>
            <div className="zk-pos-cash-metric in">
              <span>Cash In</span>
              <strong>+ {money(shiftCashIn)}</strong>
            </div>
            <div className="zk-pos-cash-metric out">
              <span>Cash Out</span>
              <strong>− {money(-shiftCashOut)}</strong>
            </div>
            <div className="zk-pos-cash-metric total">
              <span>In Drawer</span>
              <strong>{money(drawer?.expected || 0)}</strong>
            </div>
          </div>
        </div>

        <div className="zk-pos-cashbar-actions">
          <button
            type="button"
            className="zk-pos-cash-btn in"
            disabled={registerBlocked}
            onClick={() => handleQuickCashMovement('In')}
          >
            <ArrowDownLeft size={16} />
            <span>Cash In</span>
          </button>
          <button
            type="button"
            className="zk-pos-cash-btn out"
            disabled={registerBlocked}
            onClick={() => handleQuickCashMovement('Out')}
          >
            <ArrowUpRight size={16} />
            <span>Cash Out</span>
          </button>
          <Button icon={Wallet} variant="outline" onClick={() => setCashbookOpen(true)}>
            Cashbook
          </Button>
          {drawer ? (
            <Button icon={LockKeyhole} variant="outline" onClick={() => setReconcileOpen(true)}>
              Close Shift
            </Button>
          ) : (
            !registerBlocked && (
              <Button icon={Plus} variant="primary" onClick={openCashRegisterDialog}>
                Open Register
              </Button>
            )
          )}
        </div>
      </section>

      <div className="pos-grid zk-pos-framed-grid">
        <Panel
          className="zk-pos-catalog-panel"
          title="Product Catalog"
          icon={Barcode}
          action={
            <Badge tone="green">
              {branch?.name ? `${branch.name} · ` : ''}
              {filtered.length} In Stock
            </Badge>
          }
        >
          <div className="panel-tools">
            <SearchBox
              value={query}
              onChange={setQuery}
              onKeyDown={handleScan}
              inputRef={input}
              placeholder="Search in-stock product, SKU, barcode or IMEI…"
            />
            <FilterTabs
              choices={['All Products', ...categories]}
              value={category}
              onChange={setCategory}
            />
          </div>
          <div className="catalog zk-pos-catalog-scroll">
            {filtered.map(item => (
              <article key={item.id} className="product-card">
                <div className="product-image">
                  <ProductArt item={item} />
                  <Badge
                    tone={
                      item.category === 'Services'
                        ? 'blue'
                        : 'green'
                    }
                  >
                    {item.category === 'Services' ? 'Service' : item.branchQty + ' in stock'}
                  </Badge>
                </div>
                <div className="product-info">
                  <small>{item.sku}</small>
                  <strong>{item.name}</strong>
                  <b>{money(item.price)}</b>
                </div>
                <Button
                  icon={Plus}
                  variant="soft"
                  onClick={() => add(item)}
                >
                  Add item
                </Button>
              </article>
            ))}
            {!filtered.length && (
              <Empty>
                No in-stock products found in {branch?.name || 'this branch'}.
              </Empty>
            )}
          </div>
        </Panel>

        <div className="zk-pos-bill-col">
          <Panel
            className="zk-pos-bill-panel"
            title="Current Bill"
            icon={ShoppingCart}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Badge tone={selectedCustomerObj ? 'green' : 'slate'}>
                  {selectedCustomerObj ? selectedCustomerObj.name : 'Walk-in Customer'}
                </Badge>
                <Badge tone="blue">{draftId ? ref('HLD', draftId) : 'New sale'}</Badge>
              </div>
            }
          >
            {/* CUSTOMER PHONE SEARCH / POPULAR CUSTOMERS / WALLET & POINTS */}
            <div className="zk-pos-customer-box" ref={custPickerRef}>
              {!selectedCustomerObj ? (
                <>
                  <div className="zk-pos-cust-search-row">
                    <div className="search-box" style={{ flex: 1 }}>
                      <Phone size={15} />
                      <input
                        type="text"
                        value={custQuery}
                        onFocus={() => setCustDropdownOpen(true)}
                        onChange={e => {
                          setCustQuery(e.target.value);
                          setCustDropdownOpen(true);
                        }}
                        placeholder="Search customer phone # or name (Default: Walk-in)…"
                        aria-label="Search customer by phone or name"
                      />
                    </div>
                    <Button
                      icon={UserPlus}
                      variant="soft"
                      onClick={() => openQuickAddCustomer(custQuery)}
                      title="Add new customer to database"
                    >
                      New
                    </Button>
                  </div>

                  {popularCustomers.length > 0 && !custDropdownOpen && (
                    <div className="zk-pos-pop-strip">
                      <span className="zk-pos-pop-label">Popular:</span>
                      {popularCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="zk-pos-pop-chip"
                          onClick={() => {
                            setCustomer(String(c.id));
                            setCustQuery('');
                          }}
                        >
                          <UserRound size={11} />
                          <span>{c.name}</span>
                          <small>{c.phone}</small>
                        </button>
                      ))}
                    </div>
                  )}

                  {custDropdownOpen && (
                    <div className="zk-pos-cust-dropdown">
                      <div className="zk-pos-cust-dd-head">
                        <span>{custQuery.trim() ? 'Matching Customers' : 'Popular Customers'}</span>
                        <button
                          type="button"
                          className="zk-pos-dd-close"
                          onClick={() => setCustDropdownOpen(false)}
                        >
                          Walk-in
                        </button>
                      </div>
                      {matchingCustomers.length > 0 ? (
                        matchingCustomers.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="zk-pos-cust-option"
                            onClick={() => {
                              setCustomer(String(c.id));
                              setCustQuery('');
                              setCustDropdownOpen(false);
                            }}
                          >
                            <div>
                              <strong>{c.name}</strong>
                              <small>{c.phone}</small>
                            </div>
                            <div className="zk-pos-cust-opt-meta">
                              <span className="zk-pts-pill">
                                <Award size={11} /> {Number(c.loyalty_points || 0).toLocaleString()} pts
                              </span>
                              <span className="zk-wallet-pill">
                                <Wallet size={11} /> {money(c.wallet_balance || 0)}
                              </span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="zk-pos-cust-empty">
                          <span>No customer found for "{custQuery}"</span>
                          <Button
                            icon={UserPlus}
                            variant="primary"
                            onClick={() => openQuickAddCustomer(custQuery)}
                          >
                            Add "{custQuery.trim()}" to Database
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="zk-pos-selected-cust">
                  <div className="zk-pos-sel-top">
                    <div>
                      <strong>{selectedCustomerObj.name}</strong>
                      <small>{selectedCustomerObj.phone}</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="zk-pos-topup-btn"
                        onClick={() => openWalletTopupDialog(selectedCustomerObj)}
                      >
                        + Wallet Top-Up
                      </button>
                      <button
                        type="button"
                        className="zk-pos-clear-cust"
                        title="Switch back to Walk-in customer"
                        onClick={() => setCustomer('')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="zk-pos-sel-badges">
                    <span className="zk-pts-pill">
                      <Award size={12} />
                      <span>{Number(selectedCustomerObj.loyalty_points || 0).toLocaleString()} pts</span>
                      {total >= 100 && (
                        <b style={{ color: '#047857' }}> (+{Math.floor(total / 100)} pts)</b>
                      )}
                    </span>
                    <span className="zk-wallet-pill">
                      <Wallet size={12} />
                      <span>Wallet: {money(selectedCustomerObj.wallet_balance || 0)}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="zk-pos-bill-items">
              <Table
                rows={lines}
                empty="Add a product to start a bill."
                columns={[
                  [
                    'Item',
                    r => (
                      <>
                        <strong>{r.product.name}</strong>
                        <small className="subtext">
                          {units.find(u => u.id === r.unit_id)?.code || r.product.sku}
                        </small>
                      </>
                    ),
                  ],
                  [
                    'Qty',
                    r => (
                      <span className="stepper">
                        <Button
                          icon={Minus}
                          className="icon-only"
                          aria-label={'Decrease ' + r.product.name}
                          onClick={() => increment(r, -1)}
                        />
                        <b>{r.qty}</b>
                        <Button
                          icon={Plus}
                          className="icon-only"
                          aria-label={'Increase ' + r.product.name}
                          disabled={Boolean(r.unit_id)}
                          onClick={() => increment(r, 1)}
                        />
                      </span>
                    ),
                  ],
                  ['Amount', r => <strong>{money(r.product.price * r.qty)}</strong>],
                  [
                    'Action',
                    r => (
                      <Button
                        icon={Trash2}
                        className="icon-only text-red"
                        aria-label={'Remove ' + r.product.name}
                        onClick={() =>
                          setCart(cart.filter(x => lineKey(x.product_id, x.unit_id) !== r.id))
                        }
                      />
                    ),
                  ],
                ]}
              />
            </div>

            <div className="zk-pos-bill-footer">
              <div className="bill-actions">
                <Button
                  icon={Trash2}
                  variant="outline-red"
                  disabled={!cart.length || busy}
                  onClick={clear}
                >
                  Clear cart
                </Button>
                <Button
                  icon={Archive}
                  disabled={!cart.length || busy}
                  onClick={hold}
                >
                  Hold bill
                </Button>
                <Button
                  icon={History}
                  onClick={() => setHeld(true)}
                >
                  Held ({drafts.length})
                </Button>
              </div>
              <div className="totals bill-totals">
                <div className="zk-pos-staff-row">
                  <label className="inline-field" style={{ gap: '6px' }}>
                    <UserRound size={14} />
                    <span>Staff ID</span>
                    <input
                      aria-label="Bill maker staff user ID"
                      type="number"
                      min="1"
                      step="1"
                      value={staffIdInput}
                      onChange={e => setStaffIdInput(e.target.value)}
                      placeholder={String(ctx.user?.id || '')}
                      style={{ width: '68px' }}
                    />
                  </label>
                  <div className="zk-pos-staff-status">
                    {resolvedStaff ? (
                      <Badge tone="green">
                        #{resolvedStaff.id} · {resolvedStaff.name}
                      </Badge>
                    ) : staffInvalid ? (
                      <Badge tone="red">User ID not found</Badge>
                    ) : (
                      <Badge tone="slate">
                        #{ctx.user?.id} · {ctx.user?.name} (Self)
                      </Badge>
                    )}
                    {estimatedCommission > 0 && (
                      <span className="zk-pos-comm-pill" title="Item commissions credited to identified staff">
                        <Award size={12} /> +{money(estimatedCommission)}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div>
                  <label className="inline-field" style={{ gap: '6px' }}>
                    <span>Discount</span>
                    <span className="zk-disc-toggle" role="group" aria-label="Discount type">
                      <button
                        type="button"
                        className={discountType === 'percent' ? 'active' : ''}
                        onClick={() => {
                          setDiscountType('percent');
                          setDiscountValue('0');
                        }}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={discountType === 'fixed' ? 'active' : ''}
                        onClick={() => {
                          setDiscountType('fixed');
                          setDiscountValue('0');
                        }}
                      >
                        Rs
                      </button>
                    </span>
                    <input
                      aria-label={discountType === 'fixed' ? 'Discount amount in Rupees' : 'Discount percentage'}
                      type="number"
                      min="0"
                      max={
                        discountType === 'fixed'
                          ? ctx.user.role === 'cashier'
                            ? Number((maxFixedDiscount / 100).toFixed(2))
                            : Number((subtotal / 100).toFixed(2))
                          : ctx.user.role === 'cashier'
                            ? 5
                            : 100
                      }
                      step={discountType === 'fixed' ? '1' : '.01'}
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                    />
                  </label>
                  <strong>− {money(discount)}</strong>
                </div>
                <div>
                  <span>Tax ({settings.tax_bps / 100}%)</span>
                  <strong>{money(tax)}</strong>
                </div>
                <div className="total">
                  <span>Total payable</span>
                  <strong>{money(total)}</strong>
                </div>
                {!current && <Alert>Open today’s cash register before checkout.</Alert>}
                {staffInvalid && <Alert>Enter a valid active Staff User ID (or clear to credit your own ID).</Alert>}
                <Button
                  className="checkout-button"
                  icon={Banknote}
                  variant="primary"
                  disabled={!lines.length || !current || staffInvalid || busy}
                  onClick={() => setCheckout(true)}
                >
                  Review & checkout <ArrowRight size={17} />
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {device && (
        <Modal
          title="Select a device unit"
          description={device.name}
          onClose={() => setDevice(null)}
        >
          <div className="modal-body">
            <Field label="Available serial / IMEI">
              <Select
                value={chosenUnit}
                onChange={e => setChosenUnit(e.target.value)}
                blank="Select a device"
                options={branchUnits
                  .filter(
                    u =>
                      Number(u.product_id) === Number(device.id) &&
                      !reserved.has(u.id)
                  )
                  .map(u => [
                    u.id,
                    u.code + ' · ' + u.grade + (u.imei ? ' · ' + u.imei : ''),
                  ])}
              />
            </Field>
          </div>
          <div className="modal-footer">
            <Button onClick={() => setDevice(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!chosenUnit}
              icon={Plus}
              onClick={() => {
                add(device, units.find(u => u.id === Number(chosenUnit)));
                setDevice(null);
              }}
            >
              Add device
            </Button>
          </div>
        </Modal>
      )}

      {held && (
        <Modal
          title="Held Bills"
          onClose={() => setHeld(false)}
          busy={busy}
        >
          <div className="modal-body">
            <Alert>{error}</Alert>
            <Table
              rows={drafts}
              columns={[
                ['Bill', r => ref('HLD', r.id)],
                ['Date', r => dateLabel(r.created_at)],
                [
                  'Actions',
                  r => (
                    <div className="row-actions">
                      <Button
                        disabled={busy || cart.length > 0}
                        variant="soft"
                        onClick={() => {
                          const p = JSON.parse(r.payload);
                          setCart(p.cart);
                          setCustomer(p.customer);
                          setDiscountType(p.discountType || 'percent');
                          setDiscountValue(p.discountValue ?? p.discountPct ?? '0');
                          if (p.staffIdInput) setStaffIdInput(String(p.staffIdInput));
                          setDraftId(r.id);
                          setHeld(false);
                        }}
                      >
                        Resume
                      </Button>
                      <Button
                        icon={Trash2}
                        className="icon-only text-red"
                        aria-label="Remove held bill"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await ctx.mutate('draft.remove', { id: r.id });
                          } catch (e) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </div>
                  ),
                ],
              ]}
            />
            {cart.length > 0 && (
              <p className="muted">Hold or clear the current cart to resume another bill.</p>
            )}
          </div>
        </Modal>
      )}

      {checkout && (
        <CheckoutModal
          ctx={ctx}
          onClose={() => setCheckout(false)}
          onComplete={async invoice => {
            setCheckout(false);
            clear();
            const isCash =
              invoice.hasCashSettlement ??
              hasCashInPayments(invoice.payments, invoice.cashTendered);
            const enriched = {
              ...invoice,
              hasCashSettlement: isCash,
            };
            setReceipt(enriched);
            ctx.setNotice('Sale posted');

            const tasks = [];
            tasks.push(
              triggerCashDrawerForSettlement({
                settings,
                hasCashSettlement: isCash,
              })
            );
            if (invoice.shouldAutoPrint) {
              tasks.push(printThermalReceipt(enriched, settings, { silent: true }));
            }
            const [drawerRes] = await Promise.all(tasks);
            if (drawerRes?.opened) {
              setReceipt(prev => (prev && prev.id === enriched.id ? { ...prev, drawerOpened: true } : prev));
            }
          }}
          onUpdateQty={increment}
          customerName={
            selectedCustomerObj?.name || 'Walk-in customer'
          }
          customerObj={selectedCustomerObj}
          branchName={branch?.name || ''}
          settings={settings}
          {...{
            lines,
            subtotal,
            discount,
            discountType,
            discountAmount: discount,
            tax,
            total,
            customer,
            discountBps,
            staffId: resolvedStaff ? resolvedStaff.id : ctx.user?.id,
            staffName: resolvedStaff ? resolvedStaff.name : ctx.user?.name,
            estimatedCommission,
            draftId,
          }}
        />
      )}

      {receipt && (
        <ReceiptModal
          invoice={receipt}
          settings={settings}
          onClose={() => setReceipt(null)}
        />
      )}

      {cashMoveDir && (
        <QuickCashMovementModal
          ctx={ctx}
          drawer={drawer}
          blocked={registerBlocked}
          initialDirection={cashMoveDir}
          onClose={() => setCashMoveDir(null)}
          onSuccess={onRefresh}
        />
      )}

      {cashbookOpen && (
        <CashRegisterModal
          ctx={ctx}
          registerData={register}
          onClose={() => setCashbookOpen(false)}
          onRefresh={onRefresh}
        />
      )}

      {reconcileOpen && drawer && (
        <CloseReconcileModal
          ctx={ctx}
          drawer={drawer}
          onClose={() => setReconcileOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
