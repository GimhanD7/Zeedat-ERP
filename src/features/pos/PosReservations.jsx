import { useState } from 'react';
import { Badge, Button, Field, FilterTabs, Modal, Select } from '../../components/common';
import { Alert } from '../../components/feedback';
import { useData } from '../../hooks/useData';
import { cents, money, ref } from '../../utils';
import { reservationPaymentMethods, reservationStock } from '../operations/ReservationActions';
import './posReservations.css';

const balance = row => Math.max(0, Number(row.total) - Number(row.paid));
const stage = row => row.status !== 'Held' ? row.status : balance(row) > 0 ? 'Balance due' : 'Ready for handover';

function PaymentFields({ label, amount, method, limit, wallet, onAmount, onMethod }) {
  return (
    <div className="pos-reservation-fields">
      <Field label={label}>
        <input type="number" min="0.01" max={limit / 100} step="0.01" required
          value={amount} onChange={event => onAmount(event.target.value)} />
      </Field>
      <Field label="Payment method">
        <Select value={method} onChange={event => onMethod(event.target.value)}
          options={reservationPaymentMethods.map(name => [name, name === 'Wallet' ? 'Wallet · ' + money(wallet) : name])} />
      </Field>
    </div>
  );
}

function Amounts({ total, paid, paidLabel = 'Paid' }) {
  return (
    <dl className="pos-reservation-amounts">
      <div><dt>Total</dt><dd>{money(total)}</dd></div>
      <div><dt>{paidLabel}</dt><dd>{money(paid)}</dd></div>
      <div><dt>Balance due</dt><dd>{money(Math.max(0, total - paid))}</dd></div>
    </dl>
  );
}

export function PosReservations({
  ctx, customers, products, units, taxBps, initialCustomer, initialProduct,
  current, shiftMessage, onClose, onInvoice, onStockRefresh,
}) {
  const [tab, setTab] = useState(initialProduct ? 'new' : 'manage');
  const [customerId, setCustomerId] = useState(String(initialCustomer || ''));
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState(null);
  const [savedCustomer, setSavedCustomer] = useState(null);
  const [productId, setProductId] = useState(String(initialProduct || ''));
  const [unitId, setUnitId] = useState('');
  const [qty, setQty] = useState('1');
  const [selectedId, setSelectedId] = useState(null);
  const [action, setAction] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const branch = Number(ctx.branch);
  const branchCustomers = customers.filter(row => Number(row.branch_id) === branch);
  if (savedCustomer && !branchCustomers.some(row => String(row.id) === String(savedCustomer.id))) {
    branchCustomers.push(savedCustomer);
  }
  const customer = branchCustomers.find(row => String(row.id) === customerId);
  const { available, availableUnits, quantity } = reservationStock(products, units, branch);
  const product = available.find(row => String(row.id) === productId);
  const serialized = Boolean(Number(product?.serialized));
  const count = serialized ? 1 : Number(qty);
  const subtotal = product && Number.isInteger(count) && count > 0 ? count * Number(product.price) : 0;
  const tax = Math.round(subtotal * Number(taxBps || 0) / 10000);
  const total = subtotal + tax;
  const deposit = cents(amount);

  const state = useData(ctx, customer ? {
    ledger: ['customer.ledger', { branch, customer_id: customer.id }],
  } : {});
  const ledger = String(state.data?.ledger?.customer?.id) === customerId ? state.data.ledger : null;
  const reservations = ledger?.reservations || [];
  const selected = reservations.find(row => String(row.id) === String(selectedId));
  const due = selected ? balance(selected) : 0;
  const wallet = Number(ledger?.customer?.wallet_balance ?? customer?.wallet_balance ?? 0);
  const limit = method === 'Wallet' ? Math.min(wallet, tab === 'new' ? total : due) : tab === 'new' ? total : due;
  const paymentValid = deposit > 0 && deposit <= limit;
  const canSubmit = current && !busy;
  const canCreate = canSubmit && customer && product && paymentValid && Number.isInteger(count) &&
    count >= 1 && count <= quantity(product) &&
    (!serialized || availableUnits(product).some(unit => String(unit.id) === unitId));
  const canCancel = ['owner', 'manager'].includes(ctx.user.role);
  const canApplyAction = canSubmit && selected?.status === 'Held' && !state.pending && !state.error &&
    ((action === 'pay' && paymentValid) || (action === 'deliver' && due === 0) || (action === 'cancel' && canCancel));
  const search = customerSearch.trim().toLowerCase();
  const customerChoices = branchCustomers.filter(row =>
    String(row.id) === customerId || [row.name, row.phone].some(value => String(value ?? '').toLowerCase().includes(search)));

  function resetAction() {
    setAction('');
    setAmount('');
    setMethod('Cash');
    setError('');
    setMessage('');
    setInvoice(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (newCustomer) {
      if (busy || !branch || !newCustomer.name.trim() || !newCustomer.phone.trim()) return;
      setBusy(true);
      setError('');
      try {
        const saved = await ctx.mutate('customer.save', {
          branch,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
          email: newCustomer.email.trim(),
        });
        setSavedCustomer(saved);
        setCustomerId(String(saved.id));
        setCustomerSearch('');
        setSelectedId(null);
        setNewCustomer(null);
        setTab('new');
        setMessage('Customer registered and selected.');
      } catch (failure) {
        setError(failure.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!canSubmit || !customer) return;
    const creating = tab === 'new';
    if (creating ? !canCreate : !canApplyAction) return;

    setBusy(true);
    setError('');
    try {
      const result = await ctx.mutate(creating ? 'reservation.create' : 'reservation.' + action, creating ? {
        branch, customer_id: customer.id, product_id: product.id,
        unit_id: serialized ? unitId : null, qty: count, amount: deposit, method, expected_total: total,
      } : { branch, id: selected.id, amount: action === 'pay' ? deposit : 0, method });
      resetAction();
      setTab('manage');
      setSelectedId(result.id);
      setInvoice(result.invoice || null);
      setMessage(creating ? 'Reservation created and deposit recorded.' : action === 'deliver'
        ? 'Item handed over. Invoice created.' : action === 'cancel'
          ? 'Reservation cancelled. Deposit returned to the customer wallet.'
          : result.balance === 0 ? 'Payment recorded. The item is ready for handover.' : 'Payment recorded.');
      state.refresh();
      if (creating) {
        setProductId('');
        setUnitId('');
        setQty('1');
      }
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 409) {
        if (creating) onStockRefresh();
        else state.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reservations" wide busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body pos-reservations">
          {!current && <Alert>{shiftMessage}</Alert>}
          {!newCustomer && (
            <FilterTabs value={tab} choices={[[ 'manage', 'Find reservation' ], [ 'new', 'New reservation' ]]}
              onChange={value => { if (!busy && value !== tab) { setTab(value); resetAction(); } }} />
          )}
          {!newCustomer && <fieldset disabled={busy} className="pos-reservation-fields">
            <Field label="Find customer">
              <input type="search" placeholder="Name or phone" value={customerSearch}
                onChange={event => setCustomerSearch(event.target.value)} />
            </Field>
            <Field label="Customer">
              <Select value={customerId} blank="Select customer" options={customerChoices.map(row => [row.id, row.name + ' · ' + row.phone])}
                onChange={event => { setCustomerId(event.target.value); setSelectedId(null); resetAction(); }} />
            </Field>
          </fieldset>}
          {!newCustomer && <div className="pos-reservation-actions">
            <Button type="button" variant="soft" disabled={!branch || busy} onClick={() => {
              const query = customerSearch.trim();
              const isPhone = /^[+\d\s()-]+$/.test(query);
              setNewCustomer({ name: isPhone ? '' : query, phone: isPhone ? query : '', email: '' });
              resetAction();
            }}>Add New Customer</Button>
          </div>}
          {error && <Alert>{error}</Alert>}
          {newCustomer && (
            <fieldset disabled={busy} className="pos-reservation-body">
              <legend>New customer</legend>
              <Field label="Full name">
                <input autoFocus required maxLength={120} autoComplete="name" value={newCustomer.name}
                  onChange={event => setNewCustomer({ ...newCustomer, name: event.target.value })} />
              </Field>
              <Field label="Phone number">
                <input type="tel" required maxLength={30} autoComplete="tel" value={newCustomer.phone}
                  onChange={event => setNewCustomer({ ...newCustomer, phone: event.target.value })} />
              </Field>
              <Field label="Email (optional)">
                <input type="email" maxLength={150} autoComplete="email" value={newCustomer.email}
                  onChange={event => setNewCustomer({ ...newCustomer, email: event.target.value })} />
              </Field>
            </fieldset>
          )}
          {message && <div className="pos-reservation-result" role="status">{message}
            {invoice && <Button type="button" variant="soft" onClick={() => onInvoice(invoice)}>View Invoice</Button>}
          </div>}
          {!newCustomer && customer && tab === 'new' && (
            <fieldset disabled={busy} className="pos-reservation-body">
              <Field label="Item">
                <Select value={productId} required blank="Select an item"
                  options={available.map(row => [row.id, row.name + ' · ' + money(row.price)])}
                  onChange={event => { setProductId(event.target.value); setUnitId(''); setQty('1'); setAmount(''); setError(''); }} />
              </Field>
              {available.length === 0 && <p className="muted">This branch has no items available to reserve.</p>}
              {product && <>
                {serialized ? <Field label="Device serial">
                  <Select value={unitId} required blank="Select a device" options={availableUnits(product).map(unit => [unit.id, unit.code])}
                    onChange={event => setUnitId(event.target.value)} />
                </Field> : <Field label={`Quantity (${quantity(product)} available)`}>
                  <input type="number" required min="1" max={quantity(product)} step="1" value={qty} onChange={event => setQty(event.target.value)} />
                </Field>}
                <PaymentFields label="Deposit (LKR)" amount={amount} method={method} limit={limit} wallet={wallet}
                  onAmount={setAmount} onMethod={setMethod} />
                {tax > 0 && <small className="muted">Total includes {money(tax)} tax.</small>}
                <Amounts total={total} paid={deposit} paidLabel="Deposit" />
              </>}
            </fieldset>
          )}
          {!newCustomer && customer && tab === 'manage' && (
            <section className="pos-reservation-body" aria-label="Customer reservations">
              {state.error ? <Alert>{state.error} <Button type="button" onClick={state.refresh}>Retry</Button></Alert>
                : state.pending || !ledger ? <p role="status" className="muted">Loading reservations…</p>
                  : reservations.length === 0 ? <p className="muted">This customer has no reservations.</p>
                    : <Field label="Reservation">
                      <Select value={selectedId ?? ''} disabled={busy} blank="Select a reservation"
                        options={reservations.map(row => [row.id, ref('RSV', row.id) + ' · ' + row.product + ' · ' + stage(row)])}
                        onChange={event => { setSelectedId(event.target.value); resetAction(); }} />
                    </Field>}
              {selected && !state.pending && !state.error && (
                <div className="pos-reservation-body">
                  <div className="pos-reservation-item">
                    <div><strong>{selected.product}</strong><small>{selected.unit_code || `Qty ${selected.qty}`}</small></div>
                    <Badge tone={due > 0 && selected.status === 'Held' ? 'amber' : 'green'}>{stage(selected)}</Badge>
                  </div>
                  <Amounts total={Number(selected.total)} paid={Number(selected.paid)} />
                  {selected.status === 'Held' && !action && (
                    <div className="pos-reservation-actions">
                      <Button type="button" variant="primary" disabled={!canSubmit} onClick={() => {
                        setAction(due > 0 ? 'pay' : 'deliver');
                        setAmount(due > 0 ? (due / 100).toFixed(2) : '');
                        setMethod('Cash');
                      }}>{due > 0 ? 'Collect Payment' : 'Hand Over'}</Button>
                      {canCancel && <Button type="button" disabled={!canSubmit} onClick={() => setAction('cancel')}>Cancel reservation</Button>}
                    </div>
                  )}
                  {action === 'pay' && <fieldset disabled={busy} className="pos-reservation-body">
                    <PaymentFields label="Collect now (LKR)" amount={amount} method={method} limit={limit} wallet={wallet}
                      onAmount={setAmount} onMethod={setMethod} />
                    <small className="muted">Balance after payment {money(Math.max(0, due - deposit))}</small>
                  </fieldset>}
                  {action === 'deliver' && <p>Confirm once the customer has received the item. This creates the invoice and deducts stock.</p>}
                  {action === 'cancel' && <p>Confirm cancellation to release the item and return {money(selected.paid)} to the customer wallet.</p>}
                </div>
              )}
            </section>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" disabled={busy} onClick={newCustomer ? () => { setNewCustomer(null); setError(''); } : action ? resetAction : onClose}>
            {newCustomer || action ? 'Back' : 'Close'}
          </Button>
          {newCustomer && <Button type="submit" variant="primary" disabled={busy || !newCustomer.name.trim() || !newCustomer.phone.trim()}>
            {busy ? 'Saving…' : 'Save & Select Customer'}
          </Button>}
          {!newCustomer && tab === 'new' && <Button type="submit" variant="primary" disabled={!canCreate}>
            {busy ? 'Saving…' : 'Reserve & Record Deposit'}
          </Button>}
          {!newCustomer && tab === 'manage' && action && <Button type="submit" variant="primary" disabled={!canApplyAction}>
            {busy ? 'Saving…' : { pay: 'Record Payment', deliver: 'Confirm Handover', cancel: 'Confirm Cancellation' }[action]}
          </Button>}
        </div>
      </form>
    </Modal>
  );
}
