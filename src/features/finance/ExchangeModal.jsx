import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Building2,
  CreditCard,
  Plus,
  Repeat2,
  Smartphone,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Alert } from '../../components/feedback';
import { Button, Modal } from '../../components/common';
import { cents, money, ref, tenders } from '../../utils';
import './exchange.css';

const methodIcons = { Cash: Banknote, Card: CreditCard, 'Bank Transfer': Building2, Koko: Smartphone };
const SPLIT = 'Split payment';

const lineTotal = (price, qty, taxBps) => {
  const subtotal = price * qty;
  return subtotal + Math.floor((subtotal * taxBps + 5000) / 10000);
};

let rowSeed = 1;
const newRow = () => ({ key: rowSeed++, product_id: '', unit_id: '', qty: 1 });

export function ExchangeModal({ ctx, invoice, item, catalog, settings, refundMethods, onClose, onDone }) {
  const taxBps = Number(settings?.tax_bps || 0);
  const remaining = Number(item.qty) - Number(item.refunded_qty);

  const [qty, setQty] = useState(1);
  const [refundMethod, setRefundMethod] = useState(refundMethods[0] || '');
  const [condition, setCondition] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [rows, setRows] = useState([newRow()]);
  const [processNow, setProcessNow] = useState(true);
  const [payMethod, setPayMethod] = useState('Cash');
  const [amounts, setAmounts] = useState({});
  const [refs, setRefs] = useState({});
  const [refundRef, setRefundRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const products = useMemo(() => catalog.products.filter(p =>
    Number(p.branch_stocks?.find(s => Number(s.branch_id) === Number(invoice.branch_id))?.available_qty ?? p.qty) > 0
    && p.category !== 'Services'), [catalog.products, invoice.branch_id]);

  const unitsFor = productId => catalog.units.filter(u =>
    Number(u.product_id) === Number(productId) && u.state === 'Available' && !Number(u.reserved));

  const patchRow = (key, patch) => setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const priced = rows.map(r => {
    const product = products.find(p => Number(p.id) === Number(r.product_id));
    const q = product?.serialized ? 1 : Math.max(1, Number(r.qty) || 1);
    return { ...r, product, qty: q, total: product ? lineTotal(Number(product.price), q, taxBps) : 0 };
  });

  const sold = Number(item.qty);
  const refunded = Number(item.refunded_qty);
  const share = (n) => Math.floor((Number(item.total) * n) / sold);
  const returnCredit = share(refunded + qty) - share(refunded);
  const newTotal = priced.reduce((sum, r) => sum + r.total, 0);
  const difference = newTotal - returnCredit;
  const collect = difference > 0;
  const refund = difference < 0;

  const split = payMethod === SPLIT;
  const activeMethods = split ? tenders : [payMethod];
  const entered = activeMethods.reduce((sum, m) => sum + (split || m === 'Cash' ? cents(amounts[m] || 0) : difference), 0);
  const cashEntered = cents(amounts.Cash || 0);
  const shortBy = split || payMethod === 'Cash' ? difference - entered : 0;
  const changeDue = split || payMethod === 'Cash' ? Math.max(0, entered - difference) : 0;

  const buildPayments = () => {
    if (!collect) return undefined;
    if (!split && payMethod !== 'Cash') {
      return [{ method: payMethod, amount: difference, reference: refs[payMethod] }];
    }
    const list = split ? tenders : ['Cash'];
    return list.flatMap(m => {
      const raw = cents(amounts[m] || 0);
      const amount = !split && m === 'Cash' && !raw ? difference : raw;
      return amount > 0 ? [{ method: m, amount, reference: refs[m] }] : [];
    });
  };

  const validate = () => {
    if (!refundMethod) return 'Choose the original payment method.';
    if (!condition.trim()) return 'Describe the condition of the returned item.';
    if (!reason.trim()) return 'Enter the reason for the exchange.';
    if (priced.some(r => !r.product)) return 'Choose a replacement product for every line.';
    if (priced.some(r => r.product.serialized && !r.unit_id)) return 'Choose a device for each serialized product.';
    if (processNow && collect) {
      if (split || payMethod === 'Cash') {
        if (entered < difference) return `Payments are short by ${money(difference - entered)}.`;
        if (changeDue > cashEntered) return 'Non-cash payments exceed the amount due.';
      }
      const used = payments => payments.filter(p => p.method !== 'Cash' && !String(p.reference || '').trim());
      if (used(buildPayments()).length) return 'Enter a payment reference for each non-cash method.';
    }
    if (processNow && refund && refundMethod !== 'Cash' && !refundRef.trim()) {
      return `Enter the confirmed ${refundMethod} refund reference.`;
    }
    return '';
  };

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    const [first, ...extra] = priced;
    let created;
    try {
      created = await ctx.mutate('return.request', {
        branch: invoice.branch_id,
        item_id: item.id,
        qty,
        method: refundMethod,
        condition_note: condition.trim(),
        reason: reason.trim(),
        restock: item.unit_id ? undefined : restock,
        replacement_product_id: first.product_id,
        replacement_qty: first.qty,
        replacement_unit_id: first.product.serialized ? first.unit_id : undefined,
        addons: extra.map(r => ({
          product_id: r.product_id,
          qty: r.qty,
          unit_id: r.product.serialized ? r.unit_id : undefined,
        })),
      });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
      return;
    }

    if (!processNow) {
      setBusy(false);
      onDone({ id: created.id, processed: false });
      return;
    }

    try {
      const result = await ctx.mutate('return.resolve', {
        branch: invoice.branch_id,
        id: created.id,
        decision: 'Completed',
        payments: buildPayments(),
        reference: refund && refundMethod !== 'Cash' ? refundRef.trim() : undefined,
      });
      onDone({ id: created.id, processed: true, result, difference });
    } catch (failure) {
      setBusy(false);
      setError(`Request ${ref('RET', created.id)} was saved but could not be completed: ${failure.message}. Process it from Return History.`);
      onDone({ id: created.id, processed: false, failed: true });
    }
  };

  const setAmount = (m, v) => setAmounts(a => ({ ...a, [m]: v }));

  return (
    <Modal
      title="New exchange request"
      description={`${ref('INV', invoice.id)} · ${item.name}`}
      onClose={onClose}
      xl
      busy={busy}
    >
      <form className="xm" onSubmit={submit}>
        <div className="modal-body xm-body">
          <div className="xm-flow">
            <section className="xm-card xm-out">
              <header><Undo2 size={16} /> Returned item</header>
              <div className="xm-item">
                <strong>{item.name}</strong>
                <small>{item.imei || item.code ? `IMEI / serial ${item.imei || item.code}` : `Sold ${item.qty} · returned ${item.refunded_qty}`}</small>
                <b>{money(item.total)}</b>
              </div>
              <label className="xm-field">
                <span>Quantity to return</span>
                <input type="number" min={1} max={remaining} value={qty}
                  onChange={ev => setQty(Math.min(remaining, Math.max(1, Number(ev.target.value) || 1)))} />
              </label>
              <label className="xm-field">
                <span>Item condition</span>
                <input value={condition} maxLength={100} placeholder="e.g. Screen scratched, box included"
                  onChange={ev => setCondition(ev.target.value)} />
              </label>
              <label className="xm-field">
                <span>Reason for exchange</span>
                <textarea rows={3} value={reason} maxLength={500} placeholder="Why is the customer exchanging this item?"
                  onChange={ev => setReason(ev.target.value)} />
              </label>
              {!item.unit_id && (
                <label className="xm-check">
                  <input type="checkbox" checked={restock} onChange={ev => setRestock(ev.target.checked)} />
                  Item is sellable and can return to stock
                </label>
              )}
              <div className="xm-field">
                <span>Original payment method (for any refund)</span>
                <div className="xm-chips">
                  {refundMethods.map(m => {
                    const Icon = methodIcons[m] || Banknote;
                    return (
                      <button type="button" key={m} className={'xm-chip' + (refundMethod === m ? ' on' : '')}
                        onClick={() => setRefundMethod(m)}><Icon size={14} /> {m}</button>
                    );
                  })}
                </div>
              </div>
            </section>

            <span className="xm-arrow" aria-hidden="true"><ArrowRight size={20} /></span>

            <section className="xm-card xm-in">
              <header><Repeat2 size={16} /> Replacement items</header>
              {priced.map((r, index) => (
                <div className="xm-line" key={r.key}>
                  <div className="xm-line-top">
                    <select value={r.product_id} aria-label={`Replacement product ${index + 1}`}
                      onChange={ev => patchRow(r.key, { product_id: ev.target.value, unit_id: '' })}>
                      <option value="">{index ? `Extra item ${index}` : 'Replacement product'}…</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>
                      ))}
                    </select>
                    {rows.length > 1 && (
                      <button type="button" className="xm-icon-btn" aria-label="Remove item"
                        onClick={() => setRows(list => list.filter(x => x.key !== r.key))}><Trash2 size={15} /></button>
                    )}
                  </div>
                  {r.product && (
                    <div className="xm-line-bottom">
                      {r.product.serialized ? (
                        <select value={r.unit_id} aria-label="Device"
                          onChange={ev => patchRow(r.key, { unit_id: ev.target.value })}>
                          <option value="">Choose device…</option>
                          {unitsFor(r.product.id)
                            .filter(u => !rows.some(x => x.key !== r.key && String(x.unit_id) === String(u.id)))
                            .map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
                        </select>
                      ) : (
                        <label className="xm-qty">Qty
                          <input type="number" min={1} value={r.qty}
                            onChange={ev => patchRow(r.key, { qty: ev.target.value })} />
                        </label>
                      )}
                      <b>{money(r.total)}</b>
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" icon={Plus} variant="soft" disabled={rows.length >= 100}
                onClick={() => setRows(list => [...list, newRow()])}>Add another item</Button>
            </section>
          </div>

          <section className={'xm-summary' + (collect ? ' due' : refund ? ' back' : '')}>
            <div><small>Return credit</small><strong>{money(returnCredit)}</strong></div>
            <div><small>New items{taxBps ? ' (incl. tax)' : ''}</small><strong>{money(newTotal)}</strong></div>
            <div className="xm-diff">
              <small>{collect ? 'Customer pays' : refund ? 'Refund to customer' : 'Settlement'}</small>
              <strong>{collect ? money(difference) : refund ? money(-difference) : 'Even exchange'}</strong>
            </div>
          </section>

          <label className="xm-check xm-now">
            <input type="checkbox" checked={processNow} onChange={ev => setProcessNow(ev.target.checked)} />
            Approve &amp; complete the exchange now (collect payment, print bill)
          </label>

          {processNow && collect && (
            <section className="xm-card xm-pay">
              <header><Banknote size={16} /> Collect {money(difference)}</header>
              <div className="xm-chips">
                {[...tenders, SPLIT].map(m => {
                  const Icon = methodIcons[m] || SplitSquareHorizontal;
                  return (
                    <button type="button" key={m} className={'xm-chip' + (payMethod === m ? ' on' : '')}
                      onClick={() => setPayMethod(m)}><Icon size={14} /> {m}</button>
                  );
                })}
              </div>
              <div className="xm-pay-grid">
                {activeMethods.map(m => (
                  <div className="xm-pay-row" key={m}>
                    <span className="xm-pay-label">{m}</span>
                    {(split || m === 'Cash') && (
                      <input type="number" min={0} step="0.01" inputMode="decimal"
                        placeholder={split ? '0.00' : (difference / 100).toFixed(2)}
                        value={amounts[m] ?? ''} onChange={ev => setAmount(m, ev.target.value)}
                        aria-label={`${m} received`} />
                    )}
                    {m !== 'Cash' && (!split || cents(amounts[m] || 0) > 0) && (
                      <input placeholder={`${m} reference`} maxLength={100}
                        value={refs[m] || ''} onChange={ev => setRefs(r => ({ ...r, [m]: ev.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
              {(split || payMethod === 'Cash') && (
                <p className={'xm-balance' + (shortBy > 0 ? ' short' : '')}>
                  {shortBy > 0 ? `Remaining to pay: ${money(shortBy)}`
                    : changeDue > 0 ? `Change to give: ${money(changeDue)}` : 'Fully covered'}
                </p>
              )}
            </section>
          )}

          {processNow && refund && refundMethod && refundMethod !== 'Cash' && (
            <label className="xm-field">
              <span>Confirmed {refundMethod} refund reference</span>
              <input value={refundRef} maxLength={100} onChange={ev => setRefundRef(ev.target.value)} />
            </label>
          )}

          <Alert>{error}</Alert>
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Repeat2} disabled={busy}>
            {busy ? 'Saving…' : processNow
              ? collect ? `Complete & collect ${money(difference)}` : refund ? `Complete & refund ${money(-difference)}` : 'Complete exchange'
              : 'Submit request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
