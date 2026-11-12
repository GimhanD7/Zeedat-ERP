import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Package,
  Phone,
  PlusCircle,
  RefreshCw,
  Search,
  Tag,
  User,
  UserPlus,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Field, Modal, Select } from '../../components/common';
import { Alert } from '../../components/feedback';
import { useData } from '../../hooks/useData';
import { cents, money, ref } from '../../utils';
import { reservationPaymentMethods, reservationStock } from '../operations/ReservationActions';
import './posReservations.css';

const balance = row => Math.max(0, Number(row?.total || 0) - Number(row?.paid || 0));
const stage = row => {
  if (!row) return '';
  if (row.status !== 'Held') return row.status;
  return balance(row) > 0 ? 'Balance due' : 'Ready for handover';
};

function PaymentFields({ label, amount, method, limit, wallet, onAmount, onMethod }) {
  return (
    <div className="pos-reservation-fields">
      <Field label={label}>
        <input
          type="number"
          min="0.01"
          max={limit > 0 ? (limit / 100).toFixed(2) : undefined}
          step="0.01"
          required
          value={amount}
          onChange={event => onAmount(event.target.value)}
          placeholder="0.00"
        />
      </Field>
      <Field label="Payment method">
        <Select
          value={method}
          onChange={event => onMethod(event.target.value)}
          options={reservationPaymentMethods.map(name => [
            name,
            name === 'Wallet' ? 'Wallet · ' + money(wallet) : name,
          ])}
        />
      </Field>
    </div>
  );
}

function Amounts({ total, paid, paidLabel = 'Paid Deposit' }) {
  const bal = Math.max(0, Number(total || 0) - Number(paid || 0));
  return (
    <dl className="pos-reservation-amounts">
      <div>
        <dt>Total Amount</dt>
        <dd>{money(total)}</dd>
      </div>
      <div>
        <dt>{paidLabel}</dt>
        <dd style={{ color: '#047857' }}>{money(paid)}</dd>
      </div>
      <div>
        <dt>Balance Due</dt>
        <dd style={{ color: bal > 0 ? '#b45309' : '#15803d' }}>
          {money(bal)}
          {bal === 0 && <small style={{ display: 'block', color: '#15803d', fontSize: '10px' }}>Ready for pickup</small>}
        </dd>
      </div>
    </dl>
  );
}

export function PosReservations({
  ctx,
  customers = [],
  products = [],
  units = [],
  reservations: initialReservations = [],
  taxBps = 0,
  initialCustomer = null,
  initialProduct = null,
  current = true,
  shiftMessage = '',
  onClose,
  onInvoice,
  onStockRefresh,
}) {
  const branch = Number(ctx.branch);
  const state = useData(ctx, {
    allReservations: 'reservations',
  });

  const branchReservations = useMemo(() => {
    const list = state.data?.allReservations || initialReservations || [];
    return Array.isArray(list) ? list : [];
  }, [state.data?.allReservations, initialReservations]);

  const [tab, setTab] = useState(initialProduct ? 'new' : 'all');
  const [customerFilter, setCustomerFilter] = useState(initialCustomer ? String(initialCustomer) : '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active action on a reservation ('pay' | 'deliver' | 'cancel')
  const [activeAction, setActiveAction] = useState(null); // { row, type: 'pay' | 'deliver' | 'cancel' }
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');

  // Form states for New Reservation
  const [newCustId, setNewCustId] = useState(initialCustomer ? String(initialCustomer) : '');
  const [newCustSearch, setNewCustSearch] = useState('');
  const [newCustomerForm, setNewCustomerForm] = useState(null);
  const [savedCustomer, setSavedCustomer] = useState(null);
  const [productId, setProductId] = useState(initialProduct ? String(initialProduct) : '');
  const [unitId, setUnitId] = useState('');
  const [qty, setQty] = useState('1');
  const [newDeposit, setNewDeposit] = useState('');
  const [newMethod, setNewMethod] = useState('Cash');

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invoice, setInvoice] = useState(null);

  const canCancel = ['owner', 'manager'].includes(ctx.user.role);
  const canSubmit = current && !busy;

  const branchCustomers = useMemo(() => {
    const list = customers.filter(row => Number(row.branch_id) === branch || !row.branch_id);
    if (savedCustomer && !list.some(r => String(r.id) === String(savedCustomer.id))) {
      list.push(savedCustomer);
    }
    return list;
  }, [customers, branch, savedCustomer]);

  const activeCustomer = useMemo(() => {
    if (!customerFilter) return null;
    return branchCustomers.find(c => String(c.id) === String(customerFilter)) || null;
  }, [branchCustomers, customerFilter]);

  // Reservation stock for creating new holds
  const { available, availableUnits, quantity } = reservationStock(products, units, branch);
  const selectedProduct = available.find(row => String(row.id) === productId);
  const serialized = Boolean(Number(selectedProduct?.serialized));
  const count = serialized ? 1 : Number(qty);
  const subtotal = selectedProduct && Number.isInteger(count) && count > 0 ? count * Number(selectedProduct.price) : 0;
  const tax = Math.round((subtotal * Number(taxBps || 0)) / 10000);
  const total = subtotal + tax;

  // Selected customer for New Reservation tab
  const newReservationCustomer = branchCustomers.find(row => String(row.id) === newCustId);
  const newCustWallet = Number(newReservationCustomer?.wallet_balance || 0);
  const newDepositCents = cents(newDeposit);
  const newLimit = newMethod === 'Wallet' ? Math.min(newCustWallet, total) : total;
  const newPaymentValid = newDepositCents > 0 && newDepositCents <= newLimit;
  const canCreate =
    canSubmit &&
    newReservationCustomer &&
    selectedProduct &&
    newPaymentValid &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= quantity(selectedProduct) &&
    (!serialized || availableUnits(selectedProduct).some(u => String(u.id) === unitId));

  // Action execution limits
  const activeRow = activeAction?.row;
  const activeBal = activeRow ? balance(activeRow) : 0;
  const activeCust = activeRow ? branchCustomers.find(c => String(c.id) === String(activeRow.customer_id)) : null;
  const activeWallet = Number(activeCust?.wallet_balance || 0);
  const actionDeposit = cents(amount);
  const actionLimit = method === 'Wallet' ? Math.min(activeWallet, activeBal) : activeBal;
  const actionPaymentValid = actionDeposit > 0 && actionDeposit <= actionLimit;
  const canApplyAction =
    canSubmit &&
    activeRow?.status === 'Held' &&
    ((activeAction?.type === 'pay' && actionPaymentValid) ||
      (activeAction?.type === 'deliver' && activeBal === 0) ||
      (activeAction?.type === 'cancel' && canCancel));

  // KPIs
  const kpiStats = useMemo(() => {
    let heldCount = 0;
    let heldTotal = 0;
    let dueSum = 0;
    let dueCount = 0;
    let readyCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;

    for (const r of branchReservations) {
      if (r.status === 'Held') {
        heldCount++;
        heldTotal += Number(r.total || 0);
        const bal = balance(r);
        if (bal > 0) {
          dueSum += bal;
          dueCount++;
        } else {
          readyCount++;
        }
      } else if (r.status === 'Delivered') {
        deliveredCount++;
      } else if (r.status === 'Cancelled') {
        cancelledCount++;
      }
    }

    return {
      heldCount,
      heldTotal,
      dueSum,
      dueCount,
      readyCount,
      deliveredCount,
      cancelledCount,
    };
  }, [branchReservations]);

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return branchReservations.filter(r => {
      // Customer filter
      if (customerFilter && String(r.customer_id) !== String(customerFilter)) {
        return false;
      }
      // Status filter
      if (statusFilter === 'held' && r.status !== 'Held') return false;
      if (statusFilter === 'due' && (r.status !== 'Held' || balance(r) <= 0)) return false;
      if (statusFilter === 'ready' && (r.status !== 'Held' || balance(r) > 0)) return false;
      if (statusFilter === 'delivered' && r.status !== 'Delivered') return false;
      if (statusFilter === 'cancelled' && r.status !== 'Cancelled') return false;

      // Text query
      if (q) {
        const refStr = ref('RSV', r.id).toLowerCase();
        const custName = String(r.customer_name || '').toLowerCase();
        const custPhone = String(r.customer_phone || '').toLowerCase();
        const prod = String(r.product || '').toLowerCase();
        const unit = String(r.unit_code || '').toLowerCase();
        const idStr = String(r.id);
        const matched =
          refStr.includes(q) ||
          custName.includes(q) ||
          custPhone.includes(q) ||
          prod.includes(q) ||
          unit.includes(q) ||
          idStr.includes(q);
        if (!matched) return false;
      }

      return true;
    });
  }, [branchReservations, customerFilter, statusFilter, searchQuery]);

  function resetAction() {
    setActiveAction(null);
    setAmount('');
    setMethod('Cash');
    setError('');
  }

  function startAction(row, type) {
    const bal = balance(row);
    setActiveAction({ row, type });
    setError('');
    setMessage('');
    setInvoice(null);
    if (type === 'pay') {
      setAmount(bal > 0 ? (bal / 100).toFixed(2) : '');
      setMethod('Cash');
    }
  }

  async function handleActionSubmit(e) {
    e.preventDefault();
    if (!canApplyAction || !activeRow) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const type = activeAction.type;
      const result = await ctx.mutate('reservation.' + type, {
        branch,
        id: activeRow.id,
        amount: type === 'pay' ? actionDeposit : 0,
        method,
      });

      state.refresh();
      onStockRefresh?.();

      if (type === 'deliver') {
        const inv = result.invoice || null;
        setInvoice(inv);
        setMessage(`Handover complete for ${ref('RSV', activeRow.id)}. Sale invoice generated.`);
      } else if (type === 'cancel') {
        setMessage(`Reservation ${ref('RSV', activeRow.id)} cancelled. Deposit refunded to customer wallet.`);
      } else {
        const remaining = Math.max(0, activeBal - actionDeposit);
        setMessage(
          remaining === 0
            ? `Payment of ${money(actionDeposit)} recorded! Item is now ready for handover.`
            : `Payment of ${money(actionDeposit)} recorded. Remaining balance: ${money(remaining)}.`
        );
      }
      resetAction();
    } catch (err) {
      setError(err.message || 'Operation failed');
      if (err.status === 409) {
        state.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (newCustomerForm) {
      if (busy || !branch || !newCustomerForm.name.trim() || !newCustomerForm.phone.trim()) return;
      setBusy(true);
      setError('');
      try {
        const saved = await ctx.mutate('customer.save', {
          branch,
          name: newCustomerForm.name.trim(),
          phone: newCustomerForm.phone.trim(),
          email: newCustomerForm.email.trim(),
        });
        setSavedCustomer(saved);
        setNewCustId(String(saved.id));
        setNewCustomerForm(null);
        setMessage(`Customer "${saved.name}" registered and selected.`);
      } catch (err) {
        setError(err.message || 'Failed to save customer');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!canCreate) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await ctx.mutate('reservation.create', {
        branch,
        customer_id: newReservationCustomer.id,
        product_id: selectedProduct.id,
        unit_id: serialized ? unitId : null,
        qty: count,
        amount: newDepositCents,
        method: newMethod,
        expected_total: total,
      });

      state.refresh();
      onStockRefresh?.();
      setMessage(`Reservation ${ref('RSV', result.id)} created successfully with deposit ${money(newDepositCents)}.`);
      setTab('all');
      setStatusFilter('all');
      setCustomerFilter(String(newReservationCustomer.id));
      setProductId('');
      setUnitId('');
      setQty('1');
      setNewDeposit('');
      resetAction();
    } catch (err) {
      setError(err.message || 'Failed to create reservation');
      if (err.status === 409) onStockRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Store Reservations Directory & Management"
      description={`Manage customer product holds, balance collection, and handovers — Branch #${branch}`}
      wide
      xl
      busy={busy}
      onClose={onClose}
    >
      <div className="modal-body pos-reservations">
        {!current && <Alert>{shiftMessage}</Alert>}
        {error && <Alert>{error}</Alert>}
        {message && (
          <div className="pos-reservation-result" role="status">
            <span>{message}</span>
            {invoice && (
              <Button type="button" variant="primary" onClick={() => onInvoice(invoice)}>
                View & Print Invoice
              </Button>
            )}
          </div>
        )}

        {/* Top View Mode Selector */}
        <div className="pos-rsv-header-bar">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className={`pos-rsv-pill-btn ${tab === 'all' ? 'active' : ''}`}
              onClick={() => {
                setTab('all');
                resetAction();
              }}
            >
              <Archive size={14} />
              <span>All Reservations ({branchReservations.length})</span>
            </button>
            <button
              type="button"
              className={`pos-rsv-pill-btn ${tab === 'new' ? 'active' : ''}`}
              onClick={() => {
                setTab('new');
                resetAction();
              }}
            >
              <PlusCircle size={14} />
              <span>+ New Reservation</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button
              type="button"
              variant="soft"
              icon={RefreshCw}
              disabled={state.pending || busy}
              onClick={() => {
                state.refresh();
                onStockRefresh?.();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* TAB 1: ALL RESERVATIONS DIRECTORY */}
        {tab === 'all' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {/* KPI Cards */}
            <section className="pos-rsv-kpis" aria-label="Reservation Summary Metrics">
              <div className="pos-rsv-kpi-card held">
                <span className="pos-rsv-kpi-label">
                  <Archive size={12} />
                  Active Holds
                </span>
                <strong className="pos-rsv-kpi-val">{kpiStats.heldCount}</strong>
                <span className="pos-rsv-kpi-sub">Total Value {money(kpiStats.heldTotal)}</span>
              </div>
              <div className="pos-rsv-kpi-card due">
                <span className="pos-rsv-kpi-label">
                  <Clock size={12} />
                  Balance Due
                </span>
                <strong className="pos-rsv-kpi-val" style={{ color: '#b45309' }}>
                  {money(kpiStats.dueSum)}
                </strong>
                <span className="pos-rsv-kpi-sub">{kpiStats.dueCount} reservations pending payment</span>
              </div>
              <div className="pos-rsv-kpi-card ready">
                <span className="pos-rsv-kpi-label">
                  <CheckCircle2 size={12} />
                  Ready for Handover
                </span>
                <strong className="pos-rsv-kpi-val" style={{ color: '#047857' }}>
                  {kpiStats.readyCount}
                </strong>
                <span className="pos-rsv-kpi-sub">100% paid, ready to deliver</span>
              </div>
              <div className="pos-rsv-kpi-card delivered">
                <span className="pos-rsv-kpi-label">
                  <Package size={12} />
                  Completed Handover
                </span>
                <strong className="pos-rsv-kpi-val">{kpiStats.deliveredCount}</strong>
                <span className="pos-rsv-kpi-sub">Invoiced & stock deducted</span>
              </div>
            </section>

            {/* Active Action Panel (Pay / Deliver / Cancel) */}
            {activeAction && activeRow && (
              <form onSubmit={handleActionSubmit}>
                <div className={`pos-rsv-action-card ${activeAction.type}`}>
                  <div className="pos-rsv-action-head">
                    <span className="pos-rsv-action-title">
                      {activeAction.type === 'pay' && <CreditCard size={16} style={{ color: '#b45309' }} />}
                      {activeAction.type === 'deliver' && <CheckCircle2 size={16} style={{ color: '#047857' }} />}
                      {activeAction.type === 'cancel' && <XCircle size={16} style={{ color: '#dc2626' }} />}
                      {activeAction.type === 'pay' && `Collect Payment — ${ref('RSV', activeRow.id)}`}
                      {activeAction.type === 'deliver' && `Confirm Handover & Deliver Item — ${ref('RSV', activeRow.id)}`}
                      {activeAction.type === 'cancel' && `Cancel Reservation — ${ref('RSV', activeRow.id)}`}
                    </span>
                    <Button type="button" variant="soft" icon={ArrowLeft} onClick={resetAction}>
                      Back to Directory
                    </Button>
                  </div>

                  <dl className="pos-rsv-action-details">
                    <div>
                      <dt>Customer</dt>
                      <dd>
                        {activeRow.customer_name}
                        <small style={{ display: 'block', color: '#64748b' }}>{activeRow.customer_phone}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Reserved Product</dt>
                      <dd>
                        {activeRow.product}
                        <small style={{ display: 'block', color: '#64748b' }}>
                          {activeRow.unit_code ? `Serial: ${activeRow.unit_code}` : `Qty: ${activeRow.qty}`}
                        </small>
                      </dd>
                    </div>
                    <div>
                      <dt>Total / Paid</dt>
                      <dd>
                        {money(activeRow.total)}
                        <small style={{ display: 'block', color: '#047857' }}>Paid: {money(activeRow.paid)}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Remaining Balance</dt>
                      <dd style={{ color: activeBal > 0 ? '#b45309' : '#15803d' }}>
                        {money(activeBal)}
                        {activeBal === 0 && <small style={{ display: 'block', color: '#15803d' }}>Ready to deliver</small>}
                      </dd>
                    </div>
                  </dl>

                  {activeAction.type === 'pay' && (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <PaymentFields
                        label="Amount to collect (LKR)"
                        amount={amount}
                        method={method}
                        limit={actionLimit}
                        wallet={activeWallet}
                        onAmount={setAmount}
                        onMethod={setMethod}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        {activeBal > 0 && (
                          <button
                            type="button"
                            className="pos-rsv-quick-pay"
                            onClick={() => {
                              setAmount((activeBal / 100).toFixed(2));
                              setMethod('Cash');
                            }}
                          >
                            Pay Full Balance ({money(activeBal)})
                          </button>
                        )}
                        <span style={{ fontSize: '12px', color: '#475569' }}>
                          Balance after payment:{' '}
                          <strong>{money(Math.max(0, activeBal - actionDeposit))}</strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {activeAction.type === 'deliver' && (
                    <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #a7f3d0' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#065f46', lineHeight: 1.5 }}>
                        Confirm that customer <strong>{activeRow.customer_name}</strong> has received the reserved item{' '}
                        <strong>{activeRow.product}</strong> ({activeRow.unit_code || `Qty ${activeRow.qty}`}). Handing over will
                        generate the final POS invoice and deduct stock from branch #{branch}.
                      </p>
                    </div>
                  )}

                  {activeAction.type === 'cancel' && (
                    <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #fecaca' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#991b1b', lineHeight: 1.5 }}>
                        Cancelling this reservation will immediately release <strong>{activeRow.product}</strong> back to
                        available stock. The deposit of <strong>{money(activeRow.paid)}</strong> will be credited directly to
                        customer's wallet.
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <Button type="button" disabled={busy} onClick={resetAction}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={!canApplyAction}>
                      {busy
                        ? 'Processing…'
                        : activeAction.type === 'pay'
                        ? `Record Payment (${money(actionDeposit)})`
                        : activeAction.type === 'deliver'
                        ? 'Confirm Handover & Deliver Item'
                        : 'Confirm Cancellation & Refund Deposit'}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* Filter & Search Toolbar */}
            <div className="pos-rsv-toolbar">
              <div className="pos-rsv-search-box">
                <Search size={15} style={{ color: '#94a3b8' }} />
                <input
                  type="search"
                  placeholder="Search by customer name, phone, product, RSV ref #, IMEI serial…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="pos-rsv-filter-pills">
                <button
                  type="button"
                  className={`pos-rsv-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  All ({branchReservations.length})
                </button>
                <button
                  type="button"
                  className={`pos-rsv-pill-btn ${statusFilter === 'held' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('held')}
                >
                  Active Holds ({kpiStats.heldCount})
                </button>
                <button
                  type="button"
                  className={`pos-rsv-pill-btn ${statusFilter === 'due' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('due')}
                >
                  Balance Due ({kpiStats.dueCount})
                </button>
                <button
                  type="button"
                  className={`pos-rsv-pill-btn ${statusFilter === 'ready' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ready')}
                >
                  Ready for Pickup ({kpiStats.readyCount})
                </button>
                <button
                  type="button"
                  className={`pos-rsv-pill-btn ${statusFilter === 'delivered' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('delivered')}
                >
                  Delivered ({kpiStats.deliveredCount})
                </button>
                <button
                  type="button"
                  className={`pos-rsv-pill-btn ${statusFilter === 'cancelled' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('cancelled')}
                >
                  Cancelled ({kpiStats.cancelledCount})
                </button>
              </div>
            </div>

            {/* Customer Filter Notice Strip if filtered */}
            {activeCustomer && (
              <div className="pos-rsv-cust-strip">
                <span>
                  Filtering reservations for customer: <strong>{activeCustomer.name}</strong> ({activeCustomer.phone})
                  {Number(activeCustomer.wallet_balance || 0) > 0 && (
                    <span style={{ marginLeft: '8px', color: '#047857' }}>
                      · Wallet: {money(activeCustomer.wallet_balance)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="pos-rsv-clear-btn"
                  onClick={() => setCustomerFilter('')}
                >
                  Show All Store Customers
                </button>
              </div>
            )}

            {/* Reservations Table */}
            <div className="pos-rsv-table-wrap">
              <table className="pos-rsv-table">
                <thead>
                  <tr>
                    <th>Ref &amp; Date</th>
                    <th>Customer</th>
                    <th>Reserved Item</th>
                    <th>Total</th>
                    <th>Paid Deposit</th>
                    <th>Balance Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.length > 0 ? (
                    filteredReservations.map(r => {
                      const bal = balance(r);
                      const isHeld = r.status === 'Held';
                      const isReady = isHeld && bal === 0;
                      const isDue = isHeld && bal > 0;
                      return (
                        <tr key={r.id}>
                          <td>
                            <span className="pos-rsv-ref">{ref('RSV', r.id)}</span>
                            <span className="pos-rsv-date">
                              {r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '—'}
                            </span>
                          </td>
                          <td>
                            <div className="pos-rsv-customer">
                              <strong>{r.customer_name || 'Walk-in / Unknown'}</strong>
                              <small>{r.customer_phone || '—'}</small>
                            </div>
                          </td>
                          <td>
                            <div className="pos-rsv-product">
                              <strong>{r.product}</strong>
                              <small>
                                {r.unit_code ? (
                                  <span className="pos-rsv-code-tag">{r.unit_code}</span>
                                ) : (
                                  `Qty ${r.qty || 1}`
                                )}
                              </small>
                            </div>
                          </td>
                          <td>
                            <span className="pos-rsv-amt">{money(r.total)}</span>
                          </td>
                          <td>
                            <span className="pos-rsv-amt" style={{ color: '#047857' }}>
                              {money(r.paid)}
                            </span>
                          </td>
                          <td>
                            <span className={`pos-rsv-amt ${isDue ? 'due' : isReady ? 'ready' : ''}`}>
                              {money(bal)}
                            </span>
                          </td>
                          <td>
                            {isReady && <Badge tone="green">Ready for Handover</Badge>}
                            {isDue && <Badge tone="amber">Balance Due</Badge>}
                            {r.status === 'Delivered' && <Badge tone="blue">Delivered</Badge>}
                            {r.status === 'Cancelled' && <Badge tone="red">Cancelled</Badge>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="pos-rsv-table-actions" style={{ justifyContent: 'flex-end' }}>
                              {isHeld && (
                                <>
                                  {bal > 0 ? (
                                    <Button
                                      type="button"
                                      variant="primary"
                                      size="small"
                                      icon={CreditCard}
                                      disabled={!canSubmit}
                                      onClick={() => startAction(r, 'pay')}
                                    >
                                      Collect Payment
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="primary"
                                      size="small"
                                      icon={CheckCircle2}
                                      disabled={!canSubmit}
                                      onClick={() => startAction(r, 'deliver')}
                                    >
                                      Hand Over
                                    </Button>
                                  )}
                                  {canCancel && (
                                    <Button
                                      type="button"
                                      variant="soft"
                                      size="small"
                                      disabled={!canSubmit}
                                      onClick={() => startAction(r, 'cancel')}
                                      title="Cancel reservation & refund deposit to wallet"
                                    >
                                      Cancel
                                    </Button>
                                  )}
                                </>
                              )}
                              {r.status === 'Delivered' && (
                                <span style={{ fontSize: '11px', color: '#64748b' }}>Handed Over</span>
                              )}
                              {r.status === 'Cancelled' && (
                                <span style={{ fontSize: '11px', color: '#dc2626' }}>Refunded</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '36px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <Archive size={32} style={{ color: '#cbd5e1' }} />
                          <strong style={{ color: '#475569' }}>No reservations found</strong>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {searchQuery || customerFilter || statusFilter !== 'all'
                              ? 'Try adjusting your search query or status filter.'
                              : 'No customer holds currently recorded for this branch.'}
                          </span>
                          <Button
                            type="button"
                            variant="primary"
                            icon={PlusCircle}
                            style={{ marginTop: '6px' }}
                            onClick={() => {
                              setTab('new');
                              resetAction();
                            }}
                          >
                            Create New Reservation
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: CREATE NEW RESERVATION */}
        {tab === 'new' && (
          <form onSubmit={handleCreateSubmit}>
            <div style={{ display: 'grid', gap: '14px' }}>
              {!newCustomerForm ? (
                <>
                  <fieldset disabled={busy} className="pos-reservation-fields">
                    <Field label="Find customer">
                      <input
                        type="search"
                        placeholder="Search name or phone…"
                        value={newCustSearch}
                        onChange={e => setNewCustSearch(e.target.value)}
                      />
                    </Field>
                    <Field label="Selected Customer">
                      <Select
                        value={newCustId}
                        blank="Select customer"
                        options={branchCustomers
                          .filter(c => {
                            if (!newCustSearch.trim()) return true;
                            const s = newCustSearch.trim().toLowerCase();
                            return (
                              String(c.id) === newCustId ||
                              [c.name, c.phone].some(v => String(v || '').toLowerCase().includes(s))
                            );
                          })
                          .map(c => [c.id, `${c.name} · ${c.phone}`])}
                        onChange={e => {
                          setNewCustId(e.target.value);
                          setError('');
                        }}
                      />
                    </Field>
                  </fieldset>

                  <div className="pos-reservation-actions">
                    <Button
                      type="button"
                      variant="soft"
                      icon={UserPlus}
                      disabled={!branch || busy}
                      onClick={() => {
                        const q = newCustSearch.trim();
                        const isPhone = /^[+\d\s()-]+$/.test(q);
                        setNewCustomerForm({
                          name: isPhone ? '' : q,
                          phone: isPhone ? q : '',
                          email: '',
                        });
                        setError('');
                      }}
                    >
                      + Register New Customer
                    </Button>
                  </div>
                </>
              ) : (
                <fieldset disabled={busy} className="pos-reservation-body" style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong>Register New Customer</strong>
                    <Button type="button" variant="soft" size="small" onClick={() => setNewCustomerForm(null)}>
                      Cancel
                    </Button>
                  </div>
                  <Field label="Customer Full Name">
                    <input
                      autoFocus
                      required
                      maxLength={120}
                      value={newCustomerForm.name}
                      onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                      placeholder="e.g. Nimal Perera"
                    />
                  </Field>
                  <Field label="Mobile Phone Number">
                    <input
                      type="tel"
                      required
                      maxLength={30}
                      value={newCustomerForm.phone}
                      onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                      placeholder="e.g. 0771234567"
                    />
                  </Field>
                  <Field label="Email (Optional)">
                    <input
                      type="email"
                      maxLength={150}
                      value={newCustomerForm.email}
                      onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                      placeholder="customer@example.com"
                    />
                  </Field>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <Button type="submit" variant="primary" disabled={busy || !newCustomerForm.name.trim() || !newCustomerForm.phone.trim()}>
                      {busy ? 'Saving…' : 'Save & Select Customer'}
                    </Button>
                  </div>
                </fieldset>
              )}

              {/* Product Selection */}
              {newReservationCustomer && !newCustomerForm && (
                <fieldset disabled={busy} className="pos-reservation-body">
                  <Field label="Item to Reserve">
                    <Select
                      value={productId}
                      required
                      blank="Select an item in stock"
                      options={available.map(row => [row.id, `${row.name} · ${money(row.price)} (Qty: ${quantity(row)})`])}
                      onChange={e => {
                        setProductId(e.target.value);
                        setUnitId('');
                        setQty('1');
                        setNewDeposit('');
                        setError('');
                      }}
                    />
                  </Field>

                  {available.length === 0 && (
                    <p className="muted">This branch has no items available to reserve.</p>
                  )}

                  {selectedProduct && (
                    <>
                      {serialized ? (
                        <Field label="Device Serial / IMEI Unit">
                          <Select
                            value={unitId}
                            required
                            blank="Select device serial"
                            options={availableUnits(selectedProduct).map(u => [u.id, u.code])}
                            onChange={e => setUnitId(e.target.value)}
                          />
                        </Field>
                      ) : (
                        <Field label={`Quantity (${quantity(selectedProduct)} available in branch)`}>
                          <input
                            type="number"
                            required
                            min="1"
                            max={quantity(selectedProduct)}
                            step="1"
                            value={qty}
                            onChange={e => setQty(e.target.value)}
                          />
                        </Field>
                      )}

                      <PaymentFields
                        label="Deposit to Collect (LKR)"
                        amount={newDeposit}
                        method={newMethod}
                        limit={newLimit}
                        wallet={newCustWallet}
                        onAmount={setNewDeposit}
                        onMethod={setNewMethod}
                      />

                      {tax > 0 && <small className="muted">Total includes {money(tax)} tax.</small>}
                      <Amounts total={total} paid={newDepositCents} paidLabel="Deposit" />

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                        <Button type="button" disabled={busy} onClick={() => setTab('all')}>
                          Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={!canCreate}>
                          {busy ? 'Creating…' : 'Reserve & Record Deposit'}
                        </Button>
                      </div>
                    </>
                  )}
                </fieldset>
              )}
            </div>
          </form>
        )}
      </div>

      <div className="modal-footer">
        <Button type="button" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
