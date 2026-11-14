import { useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  Check,
  Clock3,
  Coins,
  CreditCard,
  FileText,
  Layers,
  Minus,
  Plus,
  Repeat2,
  Smartphone,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import { Alert } from '../../components/feedback';
import { Badge, Button, Modal, SearchSelect } from '../../components/common';
import { cents, money, ref, rupees, tenders } from '../../utils';
import './exchange.css';

const methodIcons = {
  Cash: Banknote,
  Card: CreditCard,
  'Bank Transfer': Building2,
  Koko: Smartphone,
};
const SPLIT = 'Split payment';

const lineTotal = (price, qty, taxBps) => {
  const subtotal = price * qty;
  return subtotal + Math.floor((subtotal * taxBps + 5000) / 10000);
};

let rowSeed = 1;
const newRow = () => ({ key: rowSeed++, product_id: '', unit_id: '', qty: 1 });

export function ExchangeModal({
  ctx,
  invoice,
  item,
  catalog,
  settings,
  refundMethods,
  onClose,
  onDone,
}) {
  const taxBps = Number(settings?.tax_bps || 0);
  const remaining = Math.max(1, Number(item.qty) - Number(item.refunded_qty));

  const [qty, setQty] = useState(1);
  const [refundMethod, setRefundMethod] = useState(refundMethods[0] || 'Cash');
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

  const products = useMemo(
    () =>
      catalog.products.filter(
        p =>
          Number(
            p.branch_stocks?.find(s => Number(s.branch_id) === Number(invoice.branch_id))
              ?.available_qty ?? p.qty
          ) > 0 && p.category !== 'Services'
      ),
    [catalog.products, invoice.branch_id]
  );

  const unitsFor = productId =>
    catalog.units.filter(
      u =>
        Number(u.product_id) === Number(productId) &&
        u.state === 'Available' &&
        !Number(u.reserved)
    );

  const patchRow = (key, patch) =>
    setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const priced = rows.map(r => {
    const product = products.find(p => Number(p.id) === Number(r.product_id));
    const q = product?.serialized ? 1 : Math.max(1, Number(r.qty) || 1);
    const subtotal = product ? Number(product.price) * q : 0;
    const total = product ? lineTotal(Number(product.price), q, taxBps) : 0;
    return { ...r, product, qty: q, subtotal, total };
  });

  const sold = Number(item.qty);
  const refunded = Number(item.refunded_qty);
  const share = n => Math.floor((Number(item.total) * n) / sold);
  const returnCredit = share(refunded + qty) - share(refunded);
  const newSubtotal = priced.reduce((sum, r) => sum + r.subtotal, 0);
  const newTotal = priced.reduce((sum, r) => sum + r.total, 0);
  const newTax = newTotal - newSubtotal;
  const difference = newTotal - returnCredit;
  const collect = difference > 0;
  const refund = difference < 0;

  const split = payMethod === SPLIT;
  const activeMethods = split ? tenders : [payMethod];

  const entered = useMemo(() => {
    if (!collect) return 0;
    if (split) {
      return tenders.reduce((sum, m) => sum + cents(amounts[m] || 0), 0);
    }
    if (payMethod === 'Cash') {
      const raw = cents(amounts.Cash || 0);
      return raw > 0 ? raw : difference;
    }
    return difference;
  }, [collect, split, payMethod, amounts, difference]);

  const cashEntered = split
    ? cents(amounts.Cash || 0)
    : payMethod === 'Cash'
      ? cents(amounts.Cash || 0) || difference
      : 0;
  const shortBy = Math.max(0, difference - entered);
  const changeDue = Math.max(0, entered - difference);

  const presetAmounts = useMemo(() => {
    if (!collect) return [];
    const dueRs = rupees(difference);
    const list = [dueRs];
    const next1k = Math.ceil(dueRs / 1000) * 1000;
    if (next1k > dueRs) list.push(next1k);
    const next5k = Math.ceil(dueRs / 5000) * 5000;
    if (next5k > dueRs && !list.includes(next5k)) list.push(next5k);
    const next10k = Math.ceil(dueRs / 10000) * 10000;
    if (next10k > dueRs && !list.includes(next10k)) list.push(next10k);
    return list.slice(0, 4);
  }, [collect, difference]);

  const setAmount = (m, v) => setAmounts(a => ({ ...a, [m]: v }));

  const fillRemainingFor = targetMethod => {
    const others = tenders
      .filter(m => m !== targetMethod)
      .reduce((sum, m) => sum + cents(amounts[m] || 0), 0);
    const rem = Math.max(0, difference - others);
    setAmount(targetMethod, rem > 0 ? (rem / 100).toFixed(2) : '');
  };

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
    if (priced.some(r => !r.product)) return 'Choose a replacement product for every item line.';
    if (priced.some(r => r.product.serialized && !r.unit_id)) {
      return 'Choose a device serial / IMEI for each serialized product.';
    }
    if (processNow && collect) {
      if (split || payMethod === 'Cash') {
        if (entered < difference) return `Payments are short by ${money(difference - entered)}.`;
        if (changeDue > cashEntered) return 'Non-cash payments exceed the amount due.';
      }
      const missingRef = (buildPayments() || []).filter(
        p => p.method !== 'Cash' && !String(p.reference || '').trim()
      );
      if (missingRef.length) {
        return `Enter a transaction reference for ${missingRef.map(p => p.method).join(', ')}.`;
      }
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
      setError(
        `Request ${ref('RET', created.id)} was saved but could not be completed: ${failure.message}. Process it from Return History.`
      );
      onDone({ id: created.id, processed: false, failed: true });
    }
  };

  return (
    <Modal
      title="New Exchange Request"
      description={`${ref('INV', invoice.id)} · ${invoice.customer || 'Walk-in Customer'} · ${invoice.branch || ''}`}
      onClose={onClose}
      xl
      busy={busy}
    >
      <form className="xm-form" onSubmit={submit}>
        <div className="modal-body xm-body">
          <Alert>{error}</Alert>

          {/* TOP SUMMARY STRIP: RETURNING ITEM */}
          <div className="xm-top-banner">
            <div className="xm-top-item">
              <span className="xm-top-icon">
                <Undo2 size={18} />
              </span>
              <div className="xm-top-meta">
                <small>Returning from {ref('INV', invoice.id)}</small>
                <strong>{item.name}</strong>
                <span>
                  {item.imei || item.code
                    ? `IMEI / Serial: ${item.imei || item.code}`
                    : `Sold: ${item.qty} · Already returned: ${item.refunded_qty} · Available to return: ${remaining}`}
                </span>
              </div>
            </div>
            <div className="xm-top-credit">
              <small>Return Credit ({qty} qty)</small>
              <strong>{money(returnCredit)}</strong>
            </div>
          </div>

          {/* 2-COLUMN WORKSPACE */}
          <div className="xm-workspace">
            {/* LEFT COLUMN: RETURN DETAILS + REPLACEMENT ITEMS */}
            <div className="xm-col">
              {/* STEP 1: RETURN ITEM DETAILS */}
              <section className="xm-panel">
                <header className="xm-panel-head">
                  <div className="xm-panel-title">
                    <FileText size={16} />
                    <span>1. Return Item Details</span>
                  </div>
                  <Badge tone="amber">Max {remaining} qty</Badge>
                </header>

                <div className="xm-grid-2">
                  <label className="xm-field">
                    <span>Quantity to Return</span>
                    <input
                      type="number"
                      min={1}
                      max={remaining}
                      value={qty}
                      onChange={ev =>
                        setQty(Math.min(remaining, Math.max(1, Number(ev.target.value) || 1)))
                      }
                    />
                  </label>
                  <label className="xm-field">
                    <span>Item Condition</span>
                    <input
                      value={condition}
                      maxLength={100}
                      placeholder="e.g. Good condition, box included"
                      onChange={ev => setCondition(ev.target.value)}
                    />
                  </label>
                </div>

                <label className="xm-field">
                  <span>Reason for Exchange</span>
                  <input
                    value={reason}
                    maxLength={500}
                    placeholder="Why is the customer exchanging this item?"
                    onChange={ev => setReason(ev.target.value)}
                  />
                </label>

                <div className="xm-return-footer">
                  <div className="xm-field">
                    <span>Original Payment Method (for any refund)</span>
                    <div className="xm-chips">
                      {refundMethods.map(m => {
                        const Icon = methodIcons[m] || Banknote;
                        return (
                          <button
                            type="button"
                            key={m}
                            className={'xm-chip' + (refundMethod === m ? ' on' : '')}
                            onClick={() => setRefundMethod(m)}
                          >
                            <Icon size={14} />
                            <span>{m}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {!item.unit_id && (
                    <label className="xm-restock-toggle">
                      <input
                        type="checkbox"
                        checked={restock}
                        onChange={ev => setRestock(ev.target.checked)}
                      />
                      <span>Sellable item — return to branch stock</span>
                    </label>
                  )}
                </div>
              </section>

              {/* STEP 2: REPLACEMENT ITEMS */}
              <section className="xm-panel">
                <header className="xm-panel-head">
                  <div className="xm-panel-title">
                    <Repeat2 size={16} />
                    <span>2. Replacement Items ({rows.length})</span>
                  </div>
                  <Button
                    type="button"
                    icon={Plus}
                    variant="soft"
                    disabled={rows.length >= 100}
                    onClick={() => setRows(list => [...list, newRow()])}
                  >
                    Add Item
                  </Button>
                </header>

                <div className="xm-rep-list">
                  {priced.map((r, index) => {
                    const availUnits = r.product?.serialized
                      ? unitsFor(r.product.id).filter(
                          u => !rows.some(x => x.key !== r.key && String(x.unit_id) === String(u.id))
                        )
                      : [];
                    return (
                      <div className="xm-rep-card" key={r.key}>
                        <div className="xm-rep-top">
                          <span className="xm-rep-index">#{index + 1}</span>
                          <div className="xm-rep-picker">
                            <SearchSelect
                              value={r.product_id}
                              aria-label={`Replacement product ${index + 1}`}
                              blank={
                                index
                                  ? `Extra item ${index} — type product name or SKU…`
                                  : 'Replacement product — type product name or SKU…'
                              }
                              options={products.map(p => [
                                p.id,
                                `${p.name} (${p.sku}) · ${money(p.price)}`,
                              ])}
                              onChange={ev =>
                                patchRow(r.key, { product_id: ev.target.value, unit_id: '', qty: 1 })
                              }
                            />
                          </div>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              className="xm-remove-btn"
                              aria-label="Remove item"
                              title="Remove item"
                              onClick={() => setRows(list => list.filter(x => x.key !== r.key))}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>

                        {r.product && (
                          <div className="xm-rep-sub">
                            {r.product.serialized ? (
                              <div className="xm-rep-unit">
                                <span className="xm-sub-label">Device IMEI / Serial:</span>
                                <SearchSelect
                                  value={r.unit_id}
                                  aria-label="Device"
                                  blank="Choose available device unit…"
                                  options={availUnits.map(u => [
                                    u.id,
                                    u.code + (u.imei ? ` · ${u.imei}` : ''),
                                  ])}
                                  onChange={ev => patchRow(r.key, { unit_id: ev.target.value })}
                                />
                              </div>
                            ) : (
                              <div className="xm-rep-qty">
                                <span className="xm-sub-label">Quantity:</span>
                                <div className="xm-stepper">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchRow(r.key, { qty: Math.max(1, Number(r.qty || 1) - 1) })
                                    }
                                  >
                                    <Minus size={13} />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    value={r.qty}
                                    onChange={ev =>
                                      patchRow(r.key, {
                                        qty: Math.max(1, Number(ev.target.value) || 1),
                                      })
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchRow(r.key, { qty: Number(r.qty || 1) + 1 })
                                    }
                                  >
                                    <Plus size={13} />
                                  </button>
                                </div>
                                <small className="muted">× {money(r.product.price)}</small>
                              </div>
                            )}
                            <div className="xm-rep-line-total">
                              <small>Line Total</small>
                              <strong>{money(r.total)}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: SETTLEMENT & ALL PAYMENT / SPLIT OPTIONS */}
            <div className="xm-col">
              <section className="xm-panel xm-settle-panel">
                <header className="xm-panel-head">
                  <div className="xm-panel-title">
                    <Coins size={16} />
                    <span>3. Settlement &amp; Payment Options</span>
                  </div>
                  <Badge tone={collect ? 'amber' : refund ? 'red' : 'green'}>
                    {collect ? 'Collect Balance' : refund ? 'Issue Refund' : 'Even Exchange'}
                  </Badge>
                </header>

                {/* CALCULATION BREAKDOWN */}
                <div className="xm-calc-box">
                  <div className="xm-calc-row">
                    <span>Returned Item Credit ({qty} qty)</span>
                    <strong className="text-green">− {money(returnCredit)}</strong>
                  </div>
                  <div className="xm-calc-row">
                    <span>Replacement Items Subtotal</span>
                    <strong>{money(newSubtotal)}</strong>
                  </div>
                  {taxBps > 0 && (
                    <div className="xm-calc-row">
                      <span>Tax ({(taxBps / 100).toFixed(taxBps % 100 === 0 ? 0 : 2)}%)</span>
                      <strong>+ {money(newTax)}</strong>
                    </div>
                  )}
                  <div className="xm-calc-row total-line">
                    <span>Replacement Items Total</span>
                    <strong>{money(newTotal)}</strong>
                  </div>
                </div>

                {/* HIGHLIGHT DIFFERENCE BANNER */}
                <div className={'xm-net-banner' + (collect ? ' due' : refund ? ' back' : ' even')}>
                  <div>
                    <small>
                      {collect
                        ? 'Net Difference — Customer Pays'
                        : refund
                          ? `Net Difference — Refund via ${refundMethod}`
                          : 'Net Difference'}
                    </small>
                    <strong>
                      {collect
                        ? money(difference)
                        : refund
                          ? money(-difference)
                          : 'Even Exchange · LKR 0.00'}
                    </strong>
                  </div>
                </div>

                {/* PROCESSING MODE TABS */}
                <div className="xm-mode-switch" role="radiogroup" aria-label="Exchange processing mode">
                  <button
                    type="button"
                    className={'xm-mode-btn' + (processNow ? ' active' : '')}
                    onClick={() => setProcessNow(true)}
                  >
                    <Zap size={15} />
                    <div>
                      <strong>Complete &amp; Print Bill Now</strong>
                      <small>Settle payment &amp; issue replacement invoice</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={'xm-mode-btn' + (!processNow ? ' active' : '')}
                    onClick={() => setProcessNow(false)}
                  >
                    <Clock3 size={15} />
                    <div>
                      <strong>Save as Pending Request</strong>
                      <small>Review &amp; settle later in Return History</small>
                    </div>
                  </button>
                </div>

                {/* PAYMENT METHODS & SPLIT OPTIONS WHEN CUSTOMER OWES DIFFERENCE */}
                {processNow && collect && (
                  <div className="xm-pay-section">
                    <span className="xm-section-label">Choose Payment Method</span>
                    <div className="xm-method-grid">
                      {[...tenders, SPLIT].map(m => {
                        const Icon = methodIcons[m] || Layers;
                        const active = payMethod === m;
                        return (
                          <button
                            type="button"
                            key={m}
                            className={'xm-method-card' + (active ? ' active' : '')}
                            onClick={() => setPayMethod(m)}
                          >
                            {active && (
                              <span className="xm-method-tick">
                                <Check size={11} strokeWidth={3} />
                              </span>
                            )}
                            <Icon size={18} />
                            <span>{m === SPLIT ? 'Split Payment' : m}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* SINGLE METHOD VIEW */}
                    {!split && (
                      <div className="xm-single-pay">
                        {payMethod === 'Cash' ? (
                          <>
                            <label className="xm-field">
                              <span>Cash Received (LKR)</span>
                              <div className="xm-money-input">
                                <span>LKR</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  placeholder={(difference / 100).toFixed(2)}
                                  value={amounts.Cash ?? ''}
                                  onChange={ev => setAmount('Cash', ev.target.value)}
                                  aria-label="Cash received"
                                />
                              </div>
                            </label>
                            {presetAmounts.length > 0 && (
                              <div className="xm-presets">
                                {presetAmounts.map(amt => (
                                  <button
                                    type="button"
                                    key={amt}
                                    className="xm-preset-pill"
                                    onClick={() => setAmount('Cash', amt.toFixed(2))}
                                  >
                                    LKR {amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="xm-noncash-box">
                            <div className="xm-noncash-due">
                              <span>Charging to {payMethod}</span>
                              <strong>{money(difference)}</strong>
                            </div>
                            <label className="xm-field">
                              <span>{payMethod} Reference / Approval Code *</span>
                              <input
                                placeholder={`Enter ${payMethod} slip or transfer reference…`}
                                maxLength={100}
                                value={refs[payMethod] || ''}
                                onChange={ev =>
                                  setRefs(r => ({ ...r, [payMethod]: ev.target.value }))
                                }
                              />
                            </label>
                          </div>
                        )}

                        <div className="xm-pay-results">
                          <div className={'xm-res-box' + (shortBy > 0 ? ' warn' : '')}>
                            <small>Remaining to Pay</small>
                            <strong>{money(shortBy)}</strong>
                          </div>
                          <div className="xm-res-box change">
                            <small>Change to Return</small>
                            <strong>{money(changeDue)}</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="xm-split-link"
                          onClick={() => setPayMethod(SPLIT)}
                        >
                          <Layers size={14} />
                          <span>Customer paying with multiple methods? Use Split Payment →</span>
                        </button>
                      </div>
                    )}

                    {/* SPLIT PAYMENT VIEW (ALL TENDERS) */}
                    {split && (
                      <div className="xm-split-box">
                        <div className="xm-split-list">
                          {tenders.map(m => {
                            const Icon = methodIcons[m] || Banknote;
                            const hasAmt = cents(amounts[m] || 0) > 0;
                            return (
                              <div
                                className={'xm-split-card' + (hasAmt ? ' active' : '')}
                                key={m}
                              >
                                <div className="xm-split-card-top">
                                  <span className="xm-split-name">
                                    <Icon size={15} />
                                    <strong>{m}</strong>
                                  </span>
                                  <button
                                    type="button"
                                    className="xm-fill-btn"
                                    onClick={() => fillRemainingFor(m)}
                                  >
                                    Fill Rest
                                  </button>
                                </div>
                                <div className="xm-split-inputs">
                                  <div className="xm-money-input compact">
                                    <span>LKR</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                      value={amounts[m] ?? ''}
                                      onChange={ev => setAmount(m, ev.target.value)}
                                      aria-label={`${m} received`}
                                    />
                                  </div>
                                  {m !== 'Cash' && (
                                    <input
                                      className="xm-ref-input"
                                      placeholder={`${m} Reference #${hasAmt ? ' *' : ''}`}
                                      maxLength={100}
                                      value={refs[m] || ''}
                                      onChange={ev =>
                                        setRefs(r => ({ ...r, [m]: ev.target.value }))
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="xm-pay-results">
                          <div className={'xm-res-box' + (shortBy > 0 ? ' warn' : ' ok')}>
                            <small>{shortBy > 0 ? 'Remaining to Pay' : 'Total Tendered'}</small>
                            <strong>{shortBy > 0 ? money(shortBy) : money(entered)}</strong>
                          </div>
                          <div className="xm-res-box change">
                            <small>Change to Return</small>
                            <strong>{money(changeDue)}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* REFUND REFERENCE WHEN CUSTOMER IS OWED MONEY */}
                {processNow && refund && refundMethod && refundMethod !== 'Cash' && (
                  <div className="xm-pay-section">
                    <label className="xm-field">
                      <span>Confirmed {refundMethod} Refund Reference *</span>
                      <input
                        placeholder={`Enter ${refundMethod} refund reference number…`}
                        value={refundRef}
                        maxLength={100}
                        onChange={ev => setRefundRef(ev.target.value)}
                      />
                    </label>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        <div className="modal-footer xm-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Repeat2} disabled={busy}>
            {busy
              ? 'Processing…'
              : processNow
                ? collect
                  ? `Complete & Collect ${money(difference)}`
                  : refund
                    ? `Complete & Refund ${money(-difference)}`
                    : 'Complete Even Exchange'
                : 'Submit Pending Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
