import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
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
  Wrench,
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
import { PosReservations } from './PosReservations';
import {
  CashRegisterModal,
  CloseReconcileModal,
  OpenRegisterModal,
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
    repairs: 'repairs',
    reservations: 'reservations',
  });

  return <DataView state={state}>{data => <BillingView ctx={ctx} data={data} onRefresh={state.refresh} />}</DataView>;
}

function BillingView({ ctx, data, onRefresh }) {
  const { products, units, customers, register, drafts, settings, staffList = [], repairs = [], reservations = [] } = data;
  const drawer = register.drawer;
  const registerBlocked = Boolean(register.blocked);
  const current = register.can_checkout !== false && drawer?.business_date === today();
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
  const [reservationEntry, setReservationEntry] = useState(null);
  const [held, setHeld] = useState(false);
  const [cashMoveDir, setCashMoveDir] = useState(null);
  const [cashbookOpen, setCashbookOpen] = useState(() => ctx.intent === 'cashbook');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [openRegisterOpen, setOpenRegisterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const custPickerRef = useRef(null);

  const selectedCustomerObj = useMemo(
    () => customers.find(c => String(c.id) === String(customer)) || null,
    [customers, customer]
  );
  const canReserve = ['cashier', 'manager', 'owner'].includes(ctx.user.role);

  const reserveFromPos = (productId = null) => {
    setReservationEntry({ customerId: selectedCustomerObj?.id, productId });
  };

  const customerUnpaidRepairs = useMemo(() => {
    if (!selectedCustomerObj) return [];
    return (repairs || [])
      .filter(j => {
        if (String(j.customer_id) !== String(selectedCustomerObj.id)) return false;
        if (j.status === 'Cancelled') return false;
        const charge = Number(j.final_charge || j.estimate || 0);
        const paidAmt = Number(j.paid_amount ?? j.advance_paid ?? 0);
        return charge > paidAmt;
      })
      .map(j => {
        const charge = Number(j.final_charge || j.estimate || 0);
        const paidAmt = Number(j.paid_amount ?? j.advance_paid ?? 0);
        return { ...j, balance: Math.max(0, charge - paidAmt) };
      });
  }, [repairs, selectedCustomerObj]);

  const customerActiveReservations = useMemo(() => {
    if (!selectedCustomerObj) return [];
    const custPhone = String(selectedCustomerObj.phone || '').replace(/\D/g, '');
    return (reservations || []).filter(r => {
      if (r.status !== 'Held') return false;
      if (String(r.customer_id) === String(selectedCustomerObj.id)) return true;
      if (custPhone && r.customer_phone) {
        const rPhone = String(r.customer_phone).replace(/\D/g, '');
        if (rPhone && (rPhone.endsWith(custPhone) || custPhone.endsWith(rPhone))) return true;
      }
      return false;
    });
  }, [reservations, selectedCustomerObj]);

  const customerReservationCount = useMemo(() => {
    if (customerActiveReservations.length > 0) return customerActiveReservations.length;
    return Number(selectedCustomerObj?.reservation_count || 0);
  }, [customerActiveReservations, selectedCustomerObj]);

  const customerReservationTotal = useMemo(() => {
    if (customerActiveReservations.length > 0) {
      return customerActiveReservations.reduce((sum, r) => sum + Number(r.total || 0), 0);
    }
    return Number(selectedCustomerObj?.reservation_total || 0);
  }, [customerActiveReservations, selectedCustomerObj]);

  const customerReservationBalance = useMemo(() => {
    if (customerActiveReservations.length > 0) {
      return customerActiveReservations.reduce(
        (sum, r) => sum + Math.max(0, Number(r.total || 0) - Number(r.paid || 0)),
        0
      );
    }
    return Number(selectedCustomerObj?.reservation_balance || 0);
  }, [customerActiveReservations, selectedCustomerObj]);

  const buildRepairCartLine = job => ({
    repair_id: job.id,
    product_id: null,
    unit_id: null,
    qty: 1,
    repairProduct: {
      id: null,
      name: `Repair ${job.job_number || ref('RJ', job.id)} · ${job.device}${job.issue ? ` (${job.issue})` : ''}`,
      sku: job.job_number || ref('RJ', job.id),
      price: job.balance,
      category: 'Services',
    },
  });

  const selectCustomer = custId => {
    const idStr = custId ? String(custId) : '';
    setCustomer(idStr);
    setCustQuery('');
    setCustDropdownOpen(false);
    setCart(prev => prev.filter(item => !item.repair_id));
  };

  const toggleRepairInCart = job => {
    setCart(prev => {
      const exists = prev.some(item => Number(item.repair_id) === Number(job.id));
      if (exists) {
        return prev.filter(item => Number(item.repair_id) !== Number(job.id));
      }
      return [buildRepairCartLine(job), ...prev];
    });
  };

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

  useEffect(() => {
    if (ctx.dialog) {
      setCustDropdownOpen(false);
    }
  }, [ctx.dialog]);

  const openQuickAddCustomer = (prefillText = '') => {
    setCustDropdownOpen(false);
    setCustQuery('');
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
          selectCustomer(created.id);
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
      u.state === 'Available' && !Number(u.reserved) &&
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
      return hit ? Number(hit.available_qty ?? hit.qty ?? 0) : 0;
    }
    return Number(p.qty || 0);
  };

  const lines = cart.flatMap(line => {
    if (line.repair_id && line.repairProduct) {
      return [{ ...line, product: line.repairProduct, id: 'repair:' + line.repair_id }];
    }
    const product = products.find(p => p.id === line.product_id);
    return product ? [{ ...line, product, id: lineKey(line.product_id, line.unit_id) }] : [];
  });

  const getStaffBadgeCode = s => {
    const clean = String(s?.badge_code || '').trim().toUpperCase();
    if (clean) return clean;
    const idNum = Number(s?.id || 0);
    return idNum > 0 ? `STF${String(idNum).padStart(5, '0')}` : '';
  };

  const rawStaffQuery = String(staffIdInput || '').trim();
  const resolvedStaff = useMemo(() => {
    if (!rawStaffQuery) return null;
    const upper = rawStaffQuery.toUpperCase();
    const numericMatch = upper.match(/^#?(\d+)$/);
    if (numericMatch) {
      const pid = Number(numericMatch[1]);
      return (
        staffList.find(s => Number(s.id) === pid) ||
        (Number(ctx.user?.id) === pid ? ctx.user : null)
      );
    }
    const badgeHit = staffList.find(s => getStaffBadgeCode(s) === upper);
    if (badgeHit) return badgeHit;
    if (ctx.user && getStaffBadgeCode(ctx.user) === upper) return ctx.user;
    const stfDigits = upper.match(/^STF0*(\d+)$/);
    if (stfDigits) {
      const pid = Number(stfDigits[1]);
      return (
        staffList.find(s => Number(s.id) === pid) ||
        (Number(ctx.user?.id) === pid ? ctx.user : null)
      );
    }
    return null;
  }, [rawStaffQuery, staffList, ctx.user]);
  const staffInvalid = rawStaffQuery !== '' && !resolvedStaff;

  const subtotal = lines.reduce((sum, r) => sum + r.qty * r.product.price, 0);
  const repairSubtotal = lines.reduce((sum, r) => sum + (r.repair_id ? r.product.price : 0), 0);
  const retailSubtotal = subtotal - repairSubtotal;
  const maxFixedDiscount =
    ctx.user.role === 'cashier' ? Math.floor((retailSubtotal * 500 + 5000) / 10000) : retailSubtotal;
  const rawFixedCents = Math.max(0, cents(discountValue || 0));
  const clampedFixedCents = Math.min(maxFixedDiscount, rawFixedCents);
  const discountBps =
    discountType === 'fixed'
      ? retailSubtotal > 0
        ? Math.min(10000, Math.round((clampedFixedCents * 10000) / retailSubtotal))
        : 0
      : Math.min(ctx.user.role === 'cashier' ? 500 : 10000, Math.max(0, cents(discountValue || 0)));
  const discount =
    discountType === 'fixed'
      ? clampedFixedCents
      : Math.floor((retailSubtotal * discountBps + 5000) / 10000);
  const tax = Math.floor(((retailSubtotal - discount) * settings.tax_bps + 5000) / 10000);
  const total = amountDue(subtotal, discount, tax);
  const reserved = new Set(cart.map(r => r.unit_id));

  const estimatedCommission = useMemo(() => {
    if (!lines.length) return 0;
    let processed = 0;
    let allocated = 0;
    return lines.reduce((sum, r) => {
      if (r.repair_id) return sum;
      const extended = r.qty * r.product.price;
      processed += extended;
      const cumulative = retailSubtotal ? Math.floor((processed * (total - repairSubtotal)) / retailSubtotal) : 0;
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
    if (line.repair_id) {
      if (delta < 0) {
        setCart(cart.filter(r => Number(r.repair_id) !== Number(line.repair_id)));
      }
      return;
    }
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

    const upper = value.toUpperCase();
    const matchedStaff =
      staffList.find(s => getStaffBadgeCode(s) === upper) ||
      (ctx.user && getStaffBadgeCode(ctx.user) === upper ? ctx.user : null);
    if (matchedStaff) {
      e.preventDefault();
      setStaffIdInput(getStaffBadgeCode(matchedStaff));
      setQuery('');
      ctx.setNotice(`Bill maker set to #${matchedStaff.id} · ${matchedStaff.name} (${getStaffBadgeCode(matchedStaff)})`);
      return;
    }

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
      if (device || held || checkout || receipt || cashMoveDir || cashbookOpen || reconcileOpen || openRegisterOpen || document.querySelector('.modal')) return;
      if (e.key === 'F2') {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === 'F7' && lines.length && current) {
        e.preventDefault();
        setCheckout(true);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [device, held, checkout, receipt, cashMoveDir, cashbookOpen, reconcileOpen, openRegisterOpen, lines.length, current]);

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

  const registerMovements = register.movements || [];
  const shiftCashIn = registerMovements.reduce((s, r) => s + Math.max(0, r.amount), 0);
  const shiftCashOut = registerMovements.reduce((s, r) => s + Math.min(0, r.amount), 0);
  const isManager = ['owner', 'manager'].includes(ctx.user.role);
  const shiftMessage = registerBlocked
    ? 'Another cashier has an open shift at this branch.'
    : drawer
      ? 'Close the previous shift, then open today’s register to sell.'
      : 'Open your register and enter the starting cash for this branch to sell.';

  const openCashRegisterDialog = () => {
    setOpenRegisterOpen(true);
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
        {canReserve && <Button icon={Archive} onClick={() => reserveFromPos()}>Reservations</Button>}
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
                  Open Shift
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
                {canReserve && item.category !== 'Services' && (
                  <Button onClick={() => reserveFromPos(item.id)}>Reserve</Button>
                )}
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
                      onClick={e => {
                        e.stopPropagation();
                        setCustDropdownOpen(false);
                        openQuickAddCustomer(custQuery);
                      }}
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
                          onClick={() => selectCustomer(c.id)}
                        >
                          <UserRound size={11} />
                          <span>{c.name}</span>
                          <small>{c.phone}</small>
                        </button>
                      ))}
                    </div>
                  )}

                  {custDropdownOpen && !ctx.dialog && (
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
                            onClick={() => selectCustomer(c.id)}
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
                              {Number(c.reservation_count || 0) > 0 && (
                                <span className="zk-rsv-pill" title={`${c.reservation_count} active reservation(s)`}>
                                  <Archive size={11} /> {c.reservation_count} RSV ({money(c.reservation_total || 0)})
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="zk-pos-cust-empty">
                          <span>No customer found for "{custQuery}"</span>
                          <Button
                            icon={UserPlus}
                            variant="primary"
                            onClick={e => {
                              e.stopPropagation();
                              setCustDropdownOpen(false);
                              openQuickAddCustomer(custQuery);
                            }}
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
                        onClick={() => selectCustomer('')}
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
                    <Badge tone="green">Credits +{money(selectedCustomerObj.wallet_credits || 0)}</Badge>
                    <Badge tone="red">Debits −{money(selectedCustomerObj.wallet_debits || 0)}</Badge>
                    {customerReservationCount > 0 ? (
                      <button
                        type="button"
                        className="zk-pos-rsv-badge"
                        onClick={() => reserveFromPos()}
                        title="Customer has active reservations. Click to view, collect payment, or handover."
                      >
                        <Archive size={12} />
                        <span>
                          Reservations ({customerReservationCount}): {money(customerReservationTotal)}
                        </span>
                        {customerReservationBalance > 0 ? (
                          <b style={{ color: '#dc2626' }}> (Due {money(customerReservationBalance)})</b>
                        ) : (
                          <b style={{ color: '#047857' }}> (Ready)</b>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="zk-pos-rsv-badge no-rsv"
                        onClick={() => reserveFromPos()}
                        title="No active reservations for this customer. Click to create a new reservation."
                      >
                        <Archive size={12} />
                        <span>No Reservations (+ Reserve)</span>
                      </button>
                    )}
                    {(Number(selectedCustomerObj.credit || 0) > 0 ||
                      Number(selectedCustomerObj.repair_due || 0) > 0) && (() => {
                      const creditDue = Number(selectedCustomerObj.credit || 0);
                      const repairDue = Number(selectedCustomerObj.repair_due || 0);
                      const totalDue = creditDue + repairDue;
                      const isOverdue =
                        (creditDue > 0 &&
                          selectedCustomerObj.next_due_date &&
                          String(selectedCustomerObj.next_due_date).slice(0, 10) < today()) ||
                        (repairDue > 0 &&
                          selectedCustomerObj.repair_next_due_date &&
                          String(selectedCustomerObj.repair_next_due_date).slice(0, 10) < today());
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: isOverdue ? '#fef2f2' : '#fffbeb',
                            color: isOverdue ? '#dc2626' : '#b45309',
                            border: `1px solid ${isOverdue ? '#fecaca' : '#fde68a'}`,
                          }}
                        >
                          <AlertTriangle size={11} />
                          <span>
                            {isOverdue ? 'Overdue Due:' : 'Total Due:'} {money(totalDue)}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                  {customerActiveReservations.length > 0 && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#1e40af',
                          marginBottom: '6px',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Archive size={12} style={{ color: '#2563eb' }} />
                          Active Customer Reservations ({customerActiveReservations.length}) · Total {money(customerReservationTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => reserveFromPos()}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#2563eb',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          View / Handover →
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {customerActiveReservations.map(rsv => {
                          const bal = Math.max(0, Number(rsv.total || 0) - Number(rsv.paid || 0));
                          return (
                            <button
                              key={rsv.id}
                              type="button"
                              onClick={() => reserveFromPos()}
                              title="Click to view & manage this reservation"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 9px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: '1px solid #93c5fd',
                                background: '#ffffff',
                                color: '#1e3a8a',
                              }}
                            >
                              <span>{ref('RSV', rsv.id)} · {rsv.product}</span>
                              <span style={{ color: '#64748b' }}>({rsv.unit_code || `Qty ${rsv.qty}`})</span>
                              <strong>{money(rsv.total)}</strong>
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: bal > 0 ? '#fef3c7' : '#dcfce7',
                                  color: bal > 0 ? '#b45309' : '#15803d',
                                  fontWeight: 700,
                                }}
                              >
                                {bal > 0 ? `Due ${money(bal)}` : 'Ready to Deliver'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {customerUnpaidRepairs.length > 0 && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#334155',
                          marginBottom: '6px',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Wrench size={12} style={{ color: '#0d9488' }} />
                          Pending Repair Services ({customerUnpaidRepairs.length})
                        </span>
                        <span style={{ color: '#64748b', fontWeight: 500 }}>
                          Click to include/skip in this bill
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {customerUnpaidRepairs.map(job => {
                          const inCart = cart.some(c => Number(c.repair_id) === Number(job.id));
                          return (
                            <button
                              key={job.id}
                              type="button"
                              onClick={() => toggleRepairInCart(job)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 9px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: `1px solid ${inCart ? '#0d9488' : '#cbd5e1'}`,
                                background: inCart ? '#f0fdfa' : '#fff',
                                color: inCart ? '#0f766e' : '#475569',
                              }}
                            >
                              <span>{inCart ? '✓' : '+'}</span>
                              <span>
                                {job.job_number || ref('RJ', job.id)} · {job.device}
                              </span>
                              <strong>{money(job.balance)}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                          disabled={Boolean(r.unit_id || r.repair_id)}
                          onClick={() => increment(r, 1)}
                        />
                      </span>
                    ),
                  ],
                  [
                    'Amount',
                    r => <strong>{money(r.product.price * r.qty)}</strong>,
                  ],
                  [
                    'Action',
                    r => (
                      <Button
                        icon={Trash2}
                        className="icon-only text-red"
                        aria-label={'Remove ' + r.product.name}
                        onClick={() =>
                          setCart(
                            cart.filter(
                              x =>
                                (x.repair_id
                                  ? 'repair:' + x.repair_id
                                  : lineKey(x.product_id, x.unit_id)) !== r.id
                            )
                          )
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
                    <span>Staff ID / Badge</span>
                    <input
                      aria-label="Bill maker staff ID or barcode badge"
                      type="text"
                      value={staffIdInput}
                      onChange={e => setStaffIdInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.preventDefault();
                      }}
                      placeholder={`${ctx.user?.id || '1'} or STF00001`}
                      style={{ width: '108px' }}
                    />
                  </label>
                  <div className="zk-pos-staff-status">
                    {resolvedStaff ? (
                      <Badge tone="green">
                        #{resolvedStaff.id} · {resolvedStaff.name} ({getStaffBadgeCode(resolvedStaff)})
                      </Badge>
                    ) : staffInvalid ? (
                      <Badge tone="red">Staff ID / Badge not found</Badge>
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
                {!current && <Alert>{shiftMessage}</Alert>}
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

      {checkout && current && (
        <CheckoutModal
          ctx={ctx}
          onClose={() => setCheckout(false)}
          onComplete={async invoice => {
            setCheckout(false);
            clear();
            onRefresh?.();
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

      {reservationEntry && (
        <PosReservations
          ctx={ctx}
          customers={customers}
          products={products}
          units={units}
          reservations={reservations}
          taxBps={settings.tax_bps}
          initialCustomer={reservationEntry.customerId}
          initialProduct={reservationEntry.productId}
          current={current}
          shiftMessage={shiftMessage}
          onClose={() => setReservationEntry(null)}
          onStockRefresh={onRefresh}
          onInvoice={invoice => {
            setReservationEntry(null);
            setReceipt(invoice);
          }}
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

      {openRegisterOpen && (
        <OpenRegisterModal
          ctx={ctx}
          onClose={() => setOpenRegisterOpen(false)}
          onSuccess={onRefresh}
        />
      )}

      {reconcileOpen && drawer && (
        <CloseReconcileModal
          ctx={ctx}
          drawer={drawer}
          paymentBreakdown={register.payment_breakdown || []}
          onClose={() => setReconcileOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
