import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Banknote,
  CheckCircle2,
  PackageCheck,
  Plus,
  Printer,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { Badge, Button, Field, FilterTabs, Modal, Select } from '../../components/common';
import { Alert } from '../../components/feedback';
import { useData } from '../../hooks/useData';
import {
  cents,
  dateLabel,
  money,
  printBill,
  printThermalReceipt,
  ref,
  reservationToBill,
  timeLabel,
  triggerCashDrawerForSettlement,
} from '../../utils';
import { reservationPaymentMethods, reservationStock } from '../operations/ReservationActions';
import './posReservations.css';

const balance = row => Math.max(0, Number(row?.total || 0) - Number(row?.paid || 0));
const stage = row =>
  row?.status === 'Delivered'
    ? 'Handed Over'
    : row?.status !== 'Held'
      ? row?.status || 'Held'
      : balance(row) > 0
        ? 'Balance Due'
        : 'Ready for Handover';

const stageTone = row => {
  if (row?.status === 'Delivered') return 'green';
  if (row?.status === 'Cancelled') return 'slate';
  return balance(row) > 0 ? 'amber' : 'blue';
};

function PaymentFields({ label, amount, method, limit, wallet, onAmount, onMethod, presets = [] }) {
  return (
    <div className="pos-rsv-pay-box">
      <div className="pos-reservation-fields">
        <Field label={label}>
          <input
            type="number"
            min="0.01"
            max={limit > 0 ? (limit / 100).toFixed(2) : undefined}
            step="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={event => onAmount(event.target.value)}
          />
        </Field>
        <Field label="Payment Method">
          <Select
            value={method}
            onChange={event => onMethod(event.target.value)}
            options={reservationPaymentMethods.map(name => [
              name,
              name === 'Wallet' ? `Wallet (${money(wallet)} available)` : name,
            ])}
          />
        </Field>
      </div>
      {presets.length > 0 && (
        <div className="pos-rsv-preset-row">
          <span className="pos-rsv-preset-label">Quick amount:</span>
          {presets.map(p => (
            <button
              key={p.label}
              type="button"
              className="pos-rsv-quick-pay"
              onClick={() => onAmount((p.cents / 100).toFixed(2))}
            >
              {p.label} ({money(p.cents)})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Amounts({ total, paid, paidLabel = 'Deposit / Paid' }) {
  const rem = Math.max(0, Number(total || 0) - Number(paid || 0));
  return (
    <dl className="pos-reservation-amounts">
      <div>
        <dt>Reservation Total</dt>
        <dd>{money(total)}</dd>
      </div>
      <div>
        <dt>{paidLabel}</dt>
        <dd className="text-green">{money(paid)}</dd>
      </div>
      <div>
        <dt>Remaining Balance Due</dt>
        <dd className={rem > 0 ? 'text-amber' : 'text-green'}>{money(rem)}</dd>
      </div>
    </dl>
  );
}

export function PosReservations({
  ctx,
  customers = [],
  products = [],
  units = [],
  reservations: propReservations = [],
  settings = {},
  taxBps,
  initialCustomer,
  initialProduct,
  current,
  shiftMessage,
  onClose,
  onInvoice,
  onStockRefresh,
}) {
  const [tab, setTab] = useState(initialProduct ? 'new' : 'manage');
  const [customerId, setCustomerId] = useState(String(initialCustomer || ''));
  const [newCustomer, setNewCustomer] = useState(null);
  const [savedCustomers, setSavedCustomers] = useState([]);
  const [productId, setProductId] = useState(String(initialProduct || ''));
  const [unitId, setUnitId] = useState('');
  const [qty, setQty] = useState('1');
  const [selectedId, setSelectedId] = useState(null);
  const [action, setAction] = useState('');
  const [deliverAfterPay, setDeliverAfterPay] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [rsvSearch, setRsvSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState(null);

  const rawBranch = Number(ctx.branch || 0);
  const activeBranch =
    rawBranch > 0
      ? rawBranch
      : Number(ctx.user?.branch_id) || Number(ctx.branches?.[0]?.id) || 1;

  // Include all customers so customer search always works across branches
  const allCustomers = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      if (c && c.id != null) map.set(String(c.id), c);
    }
    for (const c of savedCustomers) {
      if (c && c.id != null) map.set(String(c.id), c);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aInBranch = rawBranch > 0 && Number(a.branch_id) === rawBranch ? 0 : 1;
      const bInBranch = rawBranch > 0 && Number(b.branch_id) === rawBranch ? 0 : 1;
      if (aInBranch !== bInBranch) return aInBranch - bInBranch;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [customers, savedCustomers, rawBranch]);

  const customer = useMemo(
    () => allCustomers.find(row => String(row.id) === String(customerId)) || null,
    [allCustomers, customerId]
  );

  // Stock & available products for reservation
  const { available, availableUnits, quantity } = useMemo(
    () => reservationStock(products, units, rawBranch),
    [products, units, rawBranch]
  );

  const product = useMemo(
    () =>
      available.find(row => String(row.id) === String(productId)) ||
      products.find(row => String(row.id) === String(productId)) ||
      null,
    [available, products, productId]
  );

  const serialized = Boolean(Number(product?.serialized));
  const productUnits = useMemo(
    () => (product && serialized ? availableUnits(product) : []),
    [product, serialized, availableUnits]
  );

  // Auto-select first available unit when a serialized product is chosen
  useEffect(() => {
    if (serialized && productUnits.length > 0 && !productUnits.some(u => String(u.id) === String(unitId))) {
      setUnitId(String(productUnits[0].id));
    } else if (!serialized && unitId) {
      setUnitId('');
    }
  }, [serialized, productUnits, unitId]);

  const count = serialized ? 1 : Math.max(1, parseInt(qty, 10) || 1);
  const subtotal = product && Number.isInteger(count) && count > 0 ? count * Number(product.price || 0) : 0;
  const tax = Math.round((subtotal * Number(taxBps || 0)) / 10000);
  const total = subtotal + tax;
  const deposit = cents(amount);

  // Pre-fill deposit when product is initially selected or changed in New Reservation tab
  useEffect(() => {
    if (tab === 'new' && product && total > 0 && amount === '') {
      const halfCents = Math.max(100, Math.round(total / 2));
      setAmount((halfCents / 100).toFixed(2));
    }
  }, [tab, product?.id, total]);

  // Fetch all reservations + selected customer's ledger
  const state = useData(ctx, {
    allReservations: 'reservations',
    ...(customer
      ? { ledger: ['customer.ledger', { branch: customer.branch_id || activeBranch, customer_id: customer.id }] }
      : {}),
  });

  const ledger =
    customer && String(state.data?.ledger?.customer?.id) === String(customer.id)
      ? state.data.ledger
      : null;

  // Combine reservations from API and props, enriched with customer name & phone
  const mergedReservations = useMemo(() => {
    const byId = new Map();
    const custById = new Map(allCustomers.map(c => [Number(c.id), c]));
    const prodById = new Map(products.map(p => [Number(p.id), p]));

    const ingest = list => {
      if (!Array.isArray(list)) return;
      for (const r of list) {
        if (!r || r.id == null) continue;
        const cObj = custById.get(Number(r.customer_id));
        const pObj = prodById.get(Number(r.product_id));
        const prev = byId.get(Number(r.id)) || {};
        byId.set(Number(r.id), {
          ...prev,
          ...r,
          product: r.product || prev.product || pObj?.name || 'Reserved Item',
          product_sku: r.product_sku || r.sku || prev.product_sku || pObj?.sku || '',
          customer_name: r.customer_name || prev.customer_name || cObj?.name || 'Customer',
          customer_phone: r.customer_phone || prev.customer_phone || cObj?.phone || '',
        });
      }
    };

    ingest(propReservations);
    ingest(state.data?.allReservations);
    if (ledger?.reservations) {
      ingest(
        ledger.reservations.map(r => ({
          ...r,
          customer_id: r.customer_id || customer?.id,
          customer_name: r.customer_name || customer?.name,
          customer_phone: r.customer_phone || customer?.phone,
        }))
      );
    }

    return Array.from(byId.values()).sort((a, b) => Number(b.id) - Number(a.id));
  }, [propReservations, state.data?.allReservations, ledger?.reservations, allCustomers, products, customer]);

  // KPI metrics across reservations
  const rsvMetrics = useMemo(() => {
    let heldCount = 0;
    let heldValue = 0;
    let dueCount = 0;
    let dueTotal = 0;
    let readyCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;

    for (const r of mergedReservations) {
      const rem = balance(r);
      if (r.status === 'Held') {
        heldCount++;
        heldValue += Number(r.total || 0);
        if (rem > 0) {
          dueCount++;
          dueTotal += rem;
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
      totalCount: mergedReservations.length,
      heldCount,
      heldValue,
      dueCount,
      dueTotal,
      readyCount,
      deliveredCount,
      cancelledCount,
    };
  }, [mergedReservations]);

  // Filtered reservations for Find Reservation table
  const filteredReservations = useMemo(() => {
    const q = rsvSearch.trim().toLowerCase();
    return mergedReservations.filter(r => {
      if (customer && String(r.customer_id) !== String(customer.id)) return false;
      const rem = balance(r);
      if (statusFilter === 'held' && r.status !== 'Held') return false;
      if (statusFilter === 'due' && !(r.status === 'Held' && rem > 0)) return false;
      if (statusFilter === 'ready' && !(r.status === 'Held' && rem === 0)) return false;
      if (statusFilter === 'delivered' && r.status !== 'Delivered') return false;
      if (statusFilter === 'cancelled' && r.status !== 'Cancelled') return false;

      if (q) {
        const hay = `${ref('RSV', r.id)} ${r.customer_name || ''} ${r.customer_phone || ''} ${r.product || ''} ${r.product_sku || ''} ${r.unit_code || ''} ${r.sale_invoice_no || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedReservations, customer, statusFilter, rsvSearch]);

  const selected = useMemo(
    () => mergedReservations.find(row => String(row.id) === String(selectedId)) || null,
    [mergedReservations, selectedId]
  );

  const selectedCustomerObj = useMemo(() => {
    if (selected?.customer_id) {
      return allCustomers.find(c => String(c.id) === String(selected.customer_id)) || customer;
    }
    return customer;
  }, [selected, allCustomers, customer]);

  const due = selected ? balance(selected) : 0;
  const wallet = Number(
    ledger?.customer?.wallet_balance ?? selectedCustomerObj?.wallet_balance ?? customer?.wallet_balance ?? 0
  );
  const rawMax = tab === 'new' ? total : due;
  const limit = method === 'Wallet' ? Math.min(wallet, rawMax) : rawMax;
  const paymentValid = deposit > 0 && deposit <= limit;
  const canSubmit = current && !busy;
  const availStock = product ? quantity(product) : 0;
  const canCreate =
    canSubmit &&
    Boolean(customer) &&
    Boolean(product) &&
    paymentValid &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= availStock &&
    (!serialized || productUnits.some(unit => String(unit.id) === String(unitId)));
  const canCancel = ['owner', 'manager'].includes(ctx.user.role);
  const canApplyAction =
    canSubmit &&
    selected?.status === 'Held' &&
    ((action === 'pay' && paymentValid) ||
      (action === 'deliver' && due === 0) ||
      (action === 'cancel' && canCancel));

  function resetAction() {
    setAction('');
    setDeliverAfterPay(false);
    setAmount('');
    setMethod('Cash');
    setError('');
  }

  function startRowAction(row, nextAction, autoDeliver = false) {
    setSelectedId(row.id);
    setAction(nextAction);
    setDeliverAfterPay(autoDeliver);
    const rowDue = balance(row);
    if (nextAction === 'pay') {
      setAmount(rowDue > 0 ? (rowDue / 100).toFixed(2) : '');
    } else {
      setAmount('');
    }
    setMethod('Cash');
    setError('');
    setMessage('');
  }

  async function handlePrintReservation(row) {
    const rowBranch = Number(row.branch_id) || activeBranch;
    const brName =
      row.branch_name || ctx.branches?.find(b => Number(b.id) === rowBranch)?.name || '';
    if (row.status === 'Delivered' && row.sale_id) {
      try {
        const fullInv = await ctx.get('invoice', { id: row.sale_id, branch: rowBranch });
        printThermalReceipt(
          {
            ...fullInv,
            billTitle: 'Reservation Handover Invoice',
            reservation_ref: ref('RSV', row.id),
          },
          settings,
          { silent: true, reprint: true }
        );
        setMessage(`Handover invoice ${fullInv.invoice_no || ref('INV', row.sale_id)} sent to printer.`);
        return;
      } catch {
        // Fallback to reservation bill if invoice lookup fails
      }
    }
    printBill(
      reservationToBill(
        {
          ...row,
          customer_name: row.customer_name || customer?.name || 'Customer',
          customer_phone: row.customer_phone || customer?.phone || '',
        },
        settings,
        brName
      ),
      settings,
      { silent: true, reprint: true }
    );
    setMessage(`Reservation bill ${ref('RSV', row.id)} sent to printer.`);
  }

  async function executeSubmit(overrideDeliverAfterPay = null) {
    if (newCustomer) {
      if (busy || !newCustomer.name.trim() || !newCustomer.phone.trim()) return;
      setBusy(true);
      setError('');
      try {
        const saved = await ctx.mutate('customer.save', {
          branch: activeBranch,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
          email: (newCustomer.email || '').trim(),
        });
        setSavedCustomers(prev => [saved, ...prev]);
        setCustomerId(String(saved.id));
        setNewCustomer(null);
        setMessage(`Customer "${saved.name}" registered and selected.`);
        onStockRefresh?.();
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    const creating = tab === 'new';
    if (creating) {
      if (!customer) {
        setError('Please select a customer (or click "+ Add New Customer") before reserving.');
        return;
      }
      if (!product) {
        setError('Please select a product to reserve.');
        return;
      }
      if (!paymentValid) {
        setError('Please enter a valid deposit amount greater than 0 and up to the item total.');
        return;
      }
      if (!canCreate) return;
    } else {
      if (!canApplyAction || !selected) return;
    }

    const shouldDeliverWithPay =
      overrideDeliverAfterPay !== null ? overrideDeliverAfterPay : deliverAfterPay;
    const targetBranch = creating
      ? activeBranch
      : Number(selected?.branch_id) || activeBranch;

    setBusy(true);
    setError('');
    try {
      const result = await ctx.mutate(
        creating ? 'reservation.create' : 'reservation.' + action,
        creating
          ? {
              branch: targetBranch,
              customer_id: customer.id,
              product_id: product.id,
              unit_id: serialized ? unitId : null,
              qty: count,
              amount: deposit,
              method,
              expected_total: total,
            }
          : {
              branch: targetBranch,
              id: selected.id,
              amount: action === 'pay' ? deposit : 0,
              method,
              ...(action === 'pay' && shouldDeliverWithPay && deposit === due
                ? { deliver_after_pay: true }
                : {}),
            }
      );

      const wasCreating = creating;
      const prevAction = action;
      resetAction();
      setTab('manage');
      setSelectedId(result.id);
      setInvoice(result.invoice || null);

      const brName =
        result.reservation?.branch_name ||
        ctx.branches?.find(b => Number(b.id) === targetBranch)?.name ||
        '';

      if ((wasCreating || prevAction === 'pay') && method === 'Cash' && deposit > 0) {
        triggerCashDrawerForSettlement(ref('RSV', result.id), settings);
      }

      if (result.invoice) {
        printThermalReceipt(
          {
            ...result.invoice,
            billTitle: 'Reservation Handover Invoice',
            reservation_ref: ref('RSV', result.id),
          },
          settings,
          { silent: true }
        );
      } else {
        const custName =
          result.reservation?.customer_name ||
          (wasCreating ? customer?.name : selected?.customer_name) ||
          'Customer';
        const custPhone =
          result.reservation?.customer_phone ||
          (wasCreating ? customer?.phone : selected?.customer_phone) ||
          '';
        printBill(
          reservationToBill(
            {
              id: result.id,
              product: wasCreating ? product?.name : selected?.product,
              sku: wasCreating ? product?.sku : selected?.product_sku || selected?.sku,
              unit_code: wasCreating
                ? productUnits.find(u => String(u.id) === String(unitId))?.code
                : selected?.unit_code,
              qty: wasCreating ? count : selected?.qty,
              total: wasCreating ? total : selected?.total,
              paid: wasCreating
                ? deposit
                : Number(selected?.paid || 0) + (prevAction === 'pay' ? deposit : 0),
              status: prevAction === 'cancel' ? 'Cancelled' : result.status || 'Held',
              points_earned: result.points_earned ?? selected?.points_earned ?? 0,
              ...(result.reservation || {}),
              last_payment_amount: wasCreating || prevAction === 'pay' ? deposit : 0,
              last_payment_method: method,
              customer_name: custName,
              customer_phone: custPhone,
            },
            settings,
            brName
          ),
          settings,
          { silent: true }
        );
      }

      const notice = wasCreating
        ? `Reservation ${ref('RSV', result.id)} created · Deposit bill printed & SMS sent.`
        : prevAction === 'deliver' || result.invoice
          ? `Reserved item ${ref('RSV', result.id)} handed over · Handover invoice printed & SMS sent.`
          : prevAction === 'cancel'
            ? `Reservation ${ref('RSV', result.id)} cancelled. Deposit refunded to customer wallet & receipt printed.`
            : result.balance === 0
              ? `Payment recorded for ${ref('RSV', result.id)} · Bill printed & SMS sent. Ready for handover!`
              : `Payment recorded for ${ref('RSV', result.id)} · Bill printed & SMS sent.`;

      setMessage(
        result.points_earned > 0 ? `${notice} (+${result.points_earned} loyalty pts)` : notice
      );
      state.refresh();
      onStockRefresh?.();
      if (wasCreating) {
        setProductId('');
        setUnitId('');
        setQty('1');
        setAmount('');
      }
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 409) {
        onStockRefresh?.();
        state.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    executeSubmit(null);
  }

  const depositPresets = useMemo(() => {
    if (total <= 0) return [];
    const p25 = Math.max(100, Math.round(total * 0.25));
    const p50 = Math.max(100, Math.round(total * 0.5));
    const p75 = Math.max(100, Math.round(total * 0.75));
    return [
      { label: '25%', cents: p25 },
      { label: '50%', cents: p50 },
      { label: '75%', cents: p75 },
      { label: '100% Full', cents: total },
    ];
  }, [total]);

  const payBalancePresets = useMemo(() => {
    if (due <= 0) return [];
    const half = Math.max(100, Math.round(due * 0.5));
    return [
      ...(half < due ? [{ label: '50% of Balance', cents: half }] : []),
      { label: 'Full Balance', cents: due },
    ];
  }, [due]);

  return (
    <Modal title="Reservations & Item Handover" xl busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body pos-reservations">
          {!current && <Alert>{shiftMessage}</Alert>}
          {error && <Alert>{error}</Alert>}

          {message && (
            <div className="pos-reservation-result" role="status">
              <span>{message}</span>
              <div className="pos-reservation-actions">
                {selected && (
                  <Button
                    type="button"
                    size="sm"
                    icon={Printer}
                    variant="outline"
                    onClick={() => handlePrintReservation(selected)}
                  >
                    Reprint Bill
                  </Button>
                )}
                {invoice && (
                  <Button type="button" size="sm" variant="soft" onClick={() => onInvoice(invoice)}>
                    View Invoice
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* TOP NAVIGATION TABS */}
          {!newCustomer && (
            <div className="pos-rsv-header-bar">
              <FilterTabs
                value={tab}
                choices={[
                  ['manage', `Find Reservations (${mergedReservations.length})`],
                  ['new', 'New Reservation'],
                ]}
                onChange={value => {
                  if (!busy && value !== tab) {
                    setTab(value);
                    resetAction();
                  }
                }}
              />
              {tab === 'manage' && (
                <Button
                  type="button"
                  icon={Plus}
                  variant="primary"
                  onClick={() => {
                    setTab('new');
                    resetAction();
                  }}
                >
                  New Item Reservation
                </Button>
              )}
            </div>
          )}

          {/* UNIFIED SINGLE CUSTOMER SELECTOR + ADD NEW CUSTOMER */}
          {!newCustomer ? (
            <div className="pos-rsv-customer-bar">
              <div className="pos-rsv-customer-select-col">
                <Field
                  label={
                    tab === 'new'
                      ? 'Customer (Type name, phone number or CUS ID)'
                      : 'Filter by Customer (Optional — leave blank to see all reservations)'
                  }
                >
                  <Select
                    searchable
                    value={customerId}
                    blank={
                      tab === 'new'
                        ? 'Search & select customer by name or phone…'
                        : 'All Customers — type name or phone to filter…'
                    }
                    options={allCustomers.map(row => [
                      row.id,
                      `${row.name} · ${row.phone || 'No phone'} (${ref('CUS', row.id)})`,
                    ])}
                    onChange={event => {
                      setCustomerId(event.target.value);
                      resetAction();
                    }}
                  />
                </Field>
              </div>
              <div className="pos-rsv-customer-btn-col">
                {customer && (
                  <Button
                    type="button"
                    variant="ghost"
                    icon={X}
                    onClick={() => {
                      setCustomerId('');
                      resetAction();
                    }}
                  >
                    Clear Customer
                  </Button>
                )}
                <Button
                  type="button"
                  variant="soft"
                  icon={UserPlus}
                  disabled={busy}
                  onClick={() => {
                    setNewCustomer({ name: '', phone: '', email: '' });
                    resetAction();
                  }}
                >
                  Add New Customer
                </Button>
              </div>
            </div>
          ) : (
            <fieldset disabled={busy} className="pos-rsv-new-cust-card">
              <div className="pos-rsv-action-head">
                <div className="pos-rsv-action-title">
                  <UserPlus size={16} />
                  <span>Register New Customer</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewCustomer(null);
                    setError('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              <div className="pos-rsv-new-cust-grid">
                <Field label="Customer Full Name *">
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    placeholder="e.g. Kasun Perera"
                    value={newCustomer.name}
                    onChange={event => setNewCustomer({ ...newCustomer, name: event.target.value })}
                  />
                </Field>
                <Field label="Mobile Phone Number *">
                  <input
                    type="tel"
                    required
                    maxLength={30}
                    placeholder="e.g. 0771234567"
                    value={newCustomer.phone}
                    onChange={event => setNewCustomer({ ...newCustomer, phone: event.target.value })}
                  />
                </Field>
                <Field label="Email Address (Optional)">
                  <input
                    type="email"
                    maxLength={150}
                    placeholder="customer@email.com"
                    value={newCustomer.email}
                    onChange={event => setNewCustomer({ ...newCustomer, email: event.target.value })}
                  />
                </Field>
              </div>
            </fieldset>
          )}

          {/* SELECTED CUSTOMER SUMMARY STRIP */}
          {!newCustomer && customer && (
            <div className="pos-rsv-cust-strip">
              <div>
                <strong>{customer.name}</strong> · <span>{customer.phone}</span> ·{' '}
                <span>Wallet: {money(wallet)}</span> ·{' '}
                <span>Loyalty: {Number(customer.loyalty_points || 0).toLocaleString()} pts</span>
              </div>
              {tab === 'manage' && (
                <button
                  type="button"
                  className="pos-rsv-clear-btn"
                  onClick={() => setCustomerId('')}
                >
                  Show All Customers ({mergedReservations.length})
                </button>
              )}
            </div>
          )}

          {/* =========================================================
              TAB 1: NEW RESERVATION (ALWAYS VISIBLE WHEN TAB === 'new')
          ========================================================= */}
          {!newCustomer && tab === 'new' && (
            <fieldset disabled={busy} className="pos-rsv-form-card">
              <div className="pos-rsv-form-grid">
                <Field label="Select Item to Reserve">
                  <Select
                    searchable
                    value={productId}
                    required
                    blank="Search & select an in-stock item by name or SKU…"
                    options={available.map(row => [
                      row.id,
                      `${row.name}${row.sku ? ` (${row.sku})` : ''} · ${money(row.price)} · ${quantity(row)} in stock`,
                    ])}
                    onChange={event => {
                      const nextId = event.target.value;
                      setProductId(nextId);
                      setUnitId('');
                      setQty('1');
                      const nextProd = available.find(p => String(p.id) === String(nextId));
                      if (nextProd) {
                        const nextSub = Number(nextProd.price || 0);
                        const nextTot = nextSub + Math.round((nextSub * Number(taxBps || 0)) / 10000);
                        setAmount((Math.max(100, Math.round(nextTot / 2)) / 100).toFixed(2));
                      } else {
                        setAmount('');
                      }
                      setError('');
                    }}
                  />
                </Field>

                {product && serialized ? (
                  <Field label={`Device Serial / IMEI (${productUnits.length} available)`}>
                    <Select
                      searchable
                      value={unitId}
                      required
                      blank="Select device serial / IMEI…"
                      options={productUnits.map(unit => [
                        unit.id,
                        `${unit.code}${unit.imei ? ` · IMEI ${unit.imei}` : ''}${unit.grade ? ` (${unit.grade})` : ''}`,
                      ])}
                      onChange={event => setUnitId(event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field
                    label={
                      product
                        ? `Quantity (${availStock} available in stock)`
                        : 'Quantity'
                    }
                  >
                    <input
                      type="number"
                      required
                      min="1"
                      max={product ? Math.max(1, availStock) : 1000}
                      step="1"
                      value={qty}
                      onChange={event => setQty(event.target.value)}
                    />
                  </Field>
                )}
              </div>

              {available.length === 0 && (
                <Alert>There are currently no in-stock items available to reserve in this branch.</Alert>
              )}

              {product && (
                <div className="pos-rsv-selected-item-banner">
                  <div>
                    <span className="pos-rsv-code-tag">{product.sku || ref('PRD', product.id)}</span>{' '}
                    <strong>{product.name}</strong>
                    <small>
                      Unit Price: {money(product.price)} · Available Stock: {availStock}
                      {tax > 0 ? ` · Tax: ${money(tax)}` : ''}
                    </small>
                  </div>
                  <Badge tone="green">Total: {money(total)}</Badge>
                </div>
              )}

              <PaymentFields
                label="Reservation Deposit Amount (LKR)"
                amount={amount}
                method={method}
                limit={limit}
                wallet={wallet}
                onAmount={setAmount}
                onMethod={setMethod}
                presets={depositPresets}
              />

              <Amounts total={total} paid={deposit} paidLabel="Deposit Paying Now" />

              {!customer && (
                <div className="pos-rsv-hint-banner">
                  Please select a customer above (or click <strong>Add New Customer</strong>) to complete this reservation.
                </div>
              )}
            </fieldset>
          )}

          {/* =========================================================
              TAB 2: FIND & MANAGE ALL RESERVATIONS
          ========================================================= */}
          {!newCustomer && tab === 'manage' && (
            <section className="pos-reservation-body" aria-label="All Reservations">
              {/* 4 KPI SUMMARY CARDS */}
              <div className="pos-rsv-kpis">
                <div
                  className={`pos-rsv-kpi-card held ${statusFilter === 'all' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('all')}
                  role="button"
                  tabIndex={0}
                >
                  <span className="pos-rsv-kpi-label">All Reservations</span>
                  <strong className="pos-rsv-kpi-val">{rsvMetrics.totalCount}</strong>
                  <span className="pos-rsv-kpi-sub">
                    {rsvMetrics.heldCount} active ({money(rsvMetrics.heldValue)})
                  </span>
                </div>

                <div
                  className={`pos-rsv-kpi-card due ${statusFilter === 'due' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('due')}
                  role="button"
                  tabIndex={0}
                >
                  <span className="pos-rsv-kpi-label">Balance Due</span>
                  <strong className="pos-rsv-kpi-val">{rsvMetrics.dueCount}</strong>
                  <span className="pos-rsv-kpi-sub">Due: {money(rsvMetrics.dueTotal)}</span>
                </div>

                <div
                  className={`pos-rsv-kpi-card ready ${statusFilter === 'ready' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('ready')}
                  role="button"
                  tabIndex={0}
                >
                  <span className="pos-rsv-kpi-label">Ready for Handover</span>
                  <strong className="pos-rsv-kpi-val">{rsvMetrics.readyCount}</strong>
                  <span className="pos-rsv-kpi-sub">Paid in full · Awaiting pickup</span>
                </div>

                <div
                  className={`pos-rsv-kpi-card delivered ${statusFilter === 'delivered' ? 'selected' : ''}`}
                  onClick={() => setStatusFilter('delivered')}
                  role="button"
                  tabIndex={0}
                >
                  <span className="pos-rsv-kpi-label">Handed Over</span>
                  <strong className="pos-rsv-kpi-val">{rsvMetrics.deliveredCount}</strong>
                  <span className="pos-rsv-kpi-sub">Completed &amp; invoiced</span>
                </div>
              </div>

              {/* SEARCH & FILTER PILLS */}
              <div className="pos-rsv-toolbar">
                <div className="pos-rsv-search-box">
                  <Search size={15} />
                  <input
                    type="search"
                    placeholder="Search reservation RSV #, customer name, phone, item name, SKU or serial…"
                    value={rsvSearch}
                    onChange={e => setRsvSearch(e.target.value)}
                  />
                  {rsvSearch && (
                    <button
                      type="button"
                      className="pos-rsv-clear-btn"
                      onClick={() => setRsvSearch('')}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="pos-rsv-filter-pills">
                  {[
                    ['all', `All (${rsvMetrics.totalCount})`],
                    ['held', `Active Held (${rsvMetrics.heldCount})`],
                    ['due', `Balance Due (${rsvMetrics.dueCount})`],
                    ['ready', `Ready for Handover (${rsvMetrics.readyCount})`],
                    ['delivered', `Handed Over (${rsvMetrics.deliveredCount})`],
                    ['cancelled', `Cancelled (${rsvMetrics.cancelledCount})`],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`pos-rsv-pill-btn ${statusFilter === id ? 'active' : ''}`}
                      onClick={() => setStatusFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ACTIVE ACTION CARD (COLLECT PAYMENT / HAND OVER / CANCEL) */}
              {selected && action && (
                <div className={`pos-rsv-action-card ${action}`}>
                  <div className="pos-rsv-action-head">
                    <div className="pos-rsv-action-title">
                      {action === 'pay' && <Banknote size={18} />}
                      {action === 'deliver' && <PackageCheck size={18} />}
                      {action === 'cancel' && <Ban size={18} />}
                      <span>
                        {action === 'pay'
                          ? deliverAfterPay
                            ? `Pay Remaining Balance & Hand Over Item · ${ref('RSV', selected.id)}`
                            : `Collect Reservation Payment · ${ref('RSV', selected.id)}`
                          : action === 'deliver'
                            ? `Confirm Item Handover · ${ref('RSV', selected.id)}`
                            : `Cancel Reservation · ${ref('RSV', selected.id)}`}
                      </span>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={resetAction}>
                      Cancel Action
                    </Button>
                  </div>

                  <dl className="pos-rsv-action-details">
                    <div>
                      <dt>Customer</dt>
                      <dd>
                        {selected.customer_name || 'Customer'}{' '}
                        {selected.customer_phone ? `(${selected.customer_phone})` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Reserved Item</dt>
                      <dd>
                        {selected.product} ({selected.unit_code || `Qty ${selected.qty}`})
                      </dd>
                    </div>
                    <div>
                      <dt>Total / Paid So Far</dt>
                      <dd>
                        {money(selected.total)} / <span className="text-green">{money(selected.paid)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Remaining Balance Due</dt>
                      <dd className={due > 0 ? 'text-amber' : 'text-green'}>{money(due)}</dd>
                    </div>
                  </dl>

                  {action === 'pay' && (
                    <fieldset disabled={busy} className="pos-reservation-body">
                      <PaymentFields
                        label="Payment Amount to Collect Now (LKR)"
                        amount={amount}
                        method={method}
                        limit={limit}
                        wallet={wallet}
                        onAmount={setAmount}
                        onMethod={setMethod}
                        presets={payBalancePresets}
                      />
                      <div className="pos-rsv-item-footer">
                        <small className="muted">
                          Remaining balance after this payment:{' '}
                          <strong>{money(Math.max(0, due - deposit))}</strong>
                        </small>
                        <div className="pos-reservation-actions">
                          <Button
                            type="button"
                            variant="primary"
                            icon={Banknote}
                            disabled={!canApplyAction}
                            onClick={() => executeSubmit(false)}
                          >
                            {busy ? 'Processing…' : 'Record Payment & Print Bill'}
                          </Button>
                          {deposit === due && due > 0 && (
                            <Button
                              type="button"
                              variant="soft"
                              icon={PackageCheck}
                              disabled={!canApplyAction}
                              onClick={() => executeSubmit(true)}
                            >
                              {busy ? 'Processing…' : 'Pay Balance, Hand Over & Print Invoice'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </fieldset>
                  )}

                  {action === 'deliver' && (
                    <div className="pos-rsv-item-footer">
                      <p style={{ margin: 0 }}>
                        Confirm that <strong>{selected.customer_name}</strong> has received{' '}
                        <strong>{selected.product}</strong>. This completes the handover, deducts stock, prints the{' '}
                        <strong>Reservation Handover Invoice</strong>, and sends an SMS confirmation.
                      </p>
                      <Button
                        type="submit"
                        variant="primary"
                        icon={PackageCheck}
                        disabled={!canApplyAction}
                      >
                        {busy ? 'Handing Over…' : 'Confirm Handover & Print Invoice'}
                      </Button>
                    </div>
                  )}

                  {action === 'cancel' && (
                    <div className="pos-rsv-item-footer">
                      <p style={{ margin: 0 }}>
                        Confirm cancellation of <strong>{ref('RSV', selected.id)}</strong>. The reserved item will be
                        released back to stock and <strong>{money(selected.paid)}</strong> will be refunded to{' '}
                        <strong>{selected.customer_name}</strong>’s customer wallet.
                      </p>
                      <Button
                        type="submit"
                        variant="outline-red"
                        icon={Ban}
                        disabled={!canApplyAction}
                      >
                        {busy ? 'Cancelling…' : 'Confirm Cancel & Refund to Wallet'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ALL RESERVATIONS TABLE */}
              <div className="pos-rsv-table-wrap">
                <table className="pos-rsv-table">
                  <thead>
                    <tr>
                      <th>Reservation #</th>
                      <th>Customer</th>
                      <th>Reserved Item</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Balance Due</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReservations.length > 0 ? (
                      filteredReservations.map(row => {
                        const rowDue = balance(row);
                        const isSelected = String(row.id) === String(selectedId);
                        return (
                          <tr key={row.id} className={isSelected ? 'active-row' : ''}>
                            <td>
                              <span className="pos-rsv-ref">{ref('RSV', row.id)}</span>
                              <span className="pos-rsv-date">
                                {row.created_at ? timeLabel(row.created_at) : dateLabel(row.created_at)}
                              </span>
                            </td>
                            <td>
                              <div className="pos-rsv-customer">
                                <strong>{row.customer_name || 'Customer'}</strong>
                                <small>{row.customer_phone || ref('CUS', row.customer_id)}</small>
                              </div>
                            </td>
                            <td>
                              <div className="pos-rsv-product">
                                <strong>{row.product}</strong>
                                <small>
                                  {row.unit_code ? (
                                    <span className="pos-rsv-code-tag">{row.unit_code}</span>
                                  ) : (
                                    `Qty: ${row.qty}`
                                  )}
                                  {row.product_sku ? ` · ${row.product_sku}` : ''}
                                </small>
                              </div>
                            </td>
                            <td className="pos-rsv-amt">{money(row.total)}</td>
                            <td className="pos-rsv-amt ready">{money(row.paid)}</td>
                            <td className={`pos-rsv-amt ${rowDue > 0 ? 'due' : 'ready'}`}>
                              {money(rowDue)}
                            </td>
                            <td>
                              <Badge tone={stageTone(row)}>{stage(row)}</Badge>
                              {row.sale_invoice_no && (
                                <span className="pos-rsv-date">{row.sale_invoice_no}</span>
                              )}
                            </td>
                            <td>
                              <div className="pos-rsv-table-actions">
                                {row.status === 'Held' && rowDue > 0 && (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="primary"
                                      icon={Banknote}
                                      disabled={!canSubmit}
                                      onClick={() => startRowAction(row, 'pay', false)}
                                    >
                                      Collect Payment
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="soft"
                                      icon={PackageCheck}
                                      disabled={!canSubmit}
                                      onClick={() => startRowAction(row, 'pay', true)}
                                    >
                                      Pay &amp; Hand Over
                                    </Button>
                                  </>
                                )}
                                {row.status === 'Held' && rowDue === 0 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="primary"
                                    icon={CheckCircle2}
                                    disabled={!canSubmit}
                                    onClick={() => startRowAction(row, 'deliver', false)}
                                  >
                                    Hand Over Item
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  icon={Printer}
                                  onClick={() => handlePrintReservation(row)}
                                >
                                  Print Bill
                                </Button>
                                {row.status === 'Held' && canCancel && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    icon={Ban}
                                    disabled={!canSubmit}
                                    onClick={() => startRowAction(row, 'cancel', false)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '28px 16px' }}>
                          <div className="muted">
                            {mergedReservations.length === 0
                              ? 'No reservations have been recorded yet. Click "New Reservation" to reserve an item.'
                              : 'No reservations match your current search or filter.'}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="modal-footer">
          <Button
            type="button"
            disabled={busy}
            onClick={
              newCustomer
                ? () => {
                    setNewCustomer(null);
                    setError('');
                  }
                : action
                  ? resetAction
                  : onClose
            }
          >
            {newCustomer || action ? 'Back' : 'Close'}
          </Button>
          {newCustomer && (
            <Button
              type="submit"
              variant="primary"
              icon={UserPlus}
              disabled={busy || !newCustomer.name.trim() || !newCustomer.phone.trim()}
            >
              {busy ? 'Saving…' : 'Save & Select Customer'}
            </Button>
          )}
          {!newCustomer && tab === 'new' && (
            <Button type="submit" variant="primary" icon={Printer} disabled={!canCreate}>
              {busy ? 'Saving…' : 'Reserve, Record Deposit & Print Bill'}
            </Button>
          )}
          {!newCustomer && tab === 'manage' && action && (
            <Button
              type="submit"
              variant="primary"
              icon={Printer}
              disabled={!canApplyAction}
            >
              {busy
                ? 'Saving…'
                : {
                    pay: deliverAfterPay
                      ? 'Pay Balance, Hand Over & Print Invoice'
                      : 'Record Payment & Print Bill',
                    deliver: 'Confirm Handover & Print Invoice',
                    cancel: 'Confirm Cancellation & Print Receipt',
                  }[action]}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
