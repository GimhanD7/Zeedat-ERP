import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  Building2,
  Check,
  Clock3,
  Coins,
  CreditCard,
  FileText,
  Layers,
  Minus,
  PackageCheck,
  Plus,
  Repeat2,
  RotateCcw,
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

const calcItemRefund = (line, returnQty) => {
  const sold = Math.max(1, Number(line.qty) || 1);
  const refunded = Number(line.refunded_qty) || 0;
  const total = Number(line.total) || 0;
  const share = n => Math.floor((total * n) / sold);
  return share(refunded + returnQty) - share(refunded);
};

let rowSeed = 1;
const newRow = () => ({ key: rowSeed++, product_id: '', unit_id: '', qty: 1 });

export function ExchangeModal({
  ctx,
  invoice,
  item,
  initialMode = 'exchange',
  catalog,
  settings,
  refundMethods,
  onClose,
  onDone,
}) {
  const taxBps = Number(settings?.tax_bps || 0);
  const billItems = useMemo(() => invoice?.items || [], [invoice]);

  const defaultSelectedId = useMemo(() => {
    if (item && Number(item.qty) > Number(item.refunded_qty)) return Number(item.id);
    const firstEligible = billItems.find(b => Number(b.qty) > Number(b.refunded_qty));
    return firstEligible ? Number(firstEligible.id) : Number(item?.id || 0);
  }, [item, billItems]);

  // Mode: 'exchange' (Return selected bill item(s) + Replacement item(s)) or 'return' (Return selected bill item(s) for refund only)
  const [mode, setMode] = useState(initialMode === 'return' ? 'return' : 'exchange');
  const isExchange = mode === 'exchange';

  // Map of selected bill items: { [sale_item_id]: { selected: boolean, qty: number, restock: boolean } }
  // Only the clicked item (qty: 1) is selected by default — never the whole bill!
  const [selectedMap, setSelectedMap] = useState(() => {
    const init = {};
    for (const b of billItems) {
      const avail = Math.max(0, Number(b.qty) - Number(b.refunded_qty));
      const isTarget = Number(b.id) === defaultSelectedId && avail > 0;
      init[b.id] = {
        selected: isTarget,
        qty: 1,
        restock: false,
      };
    }
    return init;
  });

  const [refundMethod, setRefundMethod] = useState(refundMethods[0] || 'Cash');
  const [condition, setCondition] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState([newRow()]);
  const [processNow, setProcessNow] = useState(true);
  const [payMethod, setPayMethod] = useState('Cash');
  const [amounts, setAmounts] = useState({});
  const [refs, setRefs] = useState({});
  const [refundRef, setRefundRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggleBillItem = (line, checked) => {
    const avail = Math.max(0, Number(line.qty) - Number(line.refunded_qty));
    if (avail <= 0) return;
    setSelectedMap(prev => ({
      ...prev,
      [line.id]: {
        ...(prev[line.id] || { qty: 1, restock: false }),
        selected: checked,
        qty: Math.min(avail, Math.max(1, Number(prev[line.id]?.qty) || 1)),
      },
    }));
  };

  const setBillItemQty = (line, nextQty) => {
    const avail = Math.max(1, Number(line.qty) - Number(line.refunded_qty));
    const clamped = Math.min(avail, Math.max(1, Number(nextQty) || 1));
    setSelectedMap(prev => ({
      ...prev,
      [line.id]: {
        ...(prev[line.id] || { selected: true, restock: false }),
        selected: true,
        qty: clamped,
      },
    }));
  };

  const setBillItemRestock = (line, restockVal) => {
    setSelectedMap(prev => ({
      ...prev,
      [line.id]: {
        ...(prev[line.id] || { selected: true, qty: 1 }),
        restock: Boolean(restockVal),
      },
    }));
  };

  const selectSingleItemOnly = targetId => {
    setSelectedMap(prev => {
      const next = {};
      for (const b of billItems) {
        const avail = Math.max(0, Number(b.qty) - Number(b.refunded_qty));
        next[b.id] = {
          selected: Number(b.id) === Number(targetId) && avail > 0,
          qty: 1,
          restock: prev[b.id]?.restock || false,
        };
      }
      return next;
    });
  };

  // Detailed breakdown of all items on the bill
  const annotatedBillItems = useMemo(
    () =>
      billItems.map(b => {
        const sold = Number(b.qty) || 0;
        const refunded = Number(b.refunded_qty) || 0;
        const avail = Math.max(0, sold - refunded);
        const entry = selectedMap[b.id] || { selected: false, qty: 1, restock: false };
        const isSelected = Boolean(entry.selected && avail > 0);
        const selQty = isSelected ? Math.min(avail, Math.max(1, Number(entry.qty) || 1)) : 0;
        const keptQty = Math.max(0, avail - selQty);
        const credit = isSelected ? calcItemRefund(b, selQty) : 0;
        return {
          ...b,
          sold,
          refunded,
          avail,
          isSelected,
          selQty,
          keptQty,
          restock: Boolean(entry.restock),
          credit,
        };
      }),
    [billItems, selectedMap]
  );

  const selectedLines = useMemo(
    () => annotatedBillItems.filter(b => b.isSelected && b.selQty > 0),
    [annotatedBillItems]
  );

  const totalSelectedQty = useMemo(
    () => selectedLines.reduce((sum, b) => sum + b.selQty, 0),
    [selectedLines]
  );

  const keptItemsCount = useMemo(
    () => annotatedBillItems.filter(b => b.keptQty > 0).length,
    [annotatedBillItems]
  );

  const keptUnitsCount = useMemo(
    () => annotatedBillItems.reduce((sum, b) => sum + b.keptQty, 0),
    [annotatedBillItems]
  );

  const returnCredit = useMemo(
    () => selectedLines.reduce((sum, b) => sum + b.credit, 0),
    [selectedLines]
  );

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

  const newSubtotal = isExchange ? priced.reduce((sum, r) => sum + r.subtotal, 0) : 0;
  const newTotal = isExchange ? priced.reduce((sum, r) => sum + r.total, 0) : 0;
  const newTax = newTotal - newSubtotal;
  const difference = isExchange ? newTotal - returnCredit : -returnCredit;
  const collect = isExchange && difference > 0;
  const refund = difference < 0;

  const split = payMethod === SPLIT;

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
    if (!selectedLines.length) {
      return `Select at least one item from bill ${ref('INV', invoice.id)} to ${isExchange ? 'exchange' : 'return'}.`;
    }
    if (!refundMethod) return 'Choose the original payment method.';
    if (!condition.trim()) return 'Describe the condition of the returned item(s).';
    if (!reason.trim()) return `Enter the reason for the ${isExchange ? 'exchange' : 'return'}.`;
    if (isExchange) {
      if (priced.some(r => !r.product)) return 'Choose a replacement product for every item line.';
      if (priced.some(r => r.product.serialized && !r.unit_id)) {
        return 'Choose a device serial / IMEI for each serialized replacement product.';
      }
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
    const [primaryReturn, ...extraReturnItems] = selectedLines;
    const [firstRep, ...extraRep] = priced;

    let created;
    try {
      const payload = {
        branch: invoice.branch_id,
        item_id: primaryReturn.id,
        qty: primaryReturn.selQty,
        method: refundMethod,
        condition_note: condition.trim(),
        reason: reason.trim(),
        restock: primaryReturn.unit_id ? undefined : primaryReturn.restock,
        extra_returns: extraReturnItems.map(er => ({
          item_id: er.id,
          qty: er.selQty,
          restock: er.unit_id ? undefined : er.restock,
        })),
      };

      if (isExchange) {
        payload.replacement_product_id = firstRep.product_id;
        payload.replacement_qty = firstRep.qty;
        payload.replacement_unit_id = firstRep.product.serialized ? firstRep.unit_id : undefined;
        payload.addons = extraRep.map(r => ({
          product_id: r.product_id,
          qty: r.qty,
          unit_id: r.product.serialized ? r.unit_id : undefined,
        }));
      }

      created = await ctx.mutate('return.request', payload);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
      return;
    }

    if (!processNow) {
      setBusy(false);
      onDone({ id: created.id, processed: false, mode });
      return;
    }

    try {
      const result = await ctx.mutate('return.resolve', {
        branch: invoice.branch_id,
        id: created.id,
        decision: 'Completed',
        payments: isExchange ? buildPayments() : undefined,
        reference: refund && refundMethod !== 'Cash' ? refundRef.trim() : undefined,
      });
      onDone({ id: created.id, processed: true, result, difference, mode });
    } catch (failure) {
      setBusy(false);
      setError(
        `Request ${ref('RET', created.id)} was saved but could not be completed: ${failure.message}. Process it from Return History.`
      );
      onDone({ id: created.id, processed: false, failed: true, mode });
    }
  };

  return (
    <Modal
      title={isExchange ? 'Bill Item Exchange Request' : 'Bill Item Return & Refund'}
      description={`${ref('INV', invoice.id)} · ${invoice.customer || 'Walk-in Customer'} · ${invoice.branch || ''} · Select specific item(s) from this bill`}
      onClose={onClose}
      xl
      className="xm-modal"
      busy={busy}
    >
      <form className="xm-form" onSubmit={submit}>
        <div className="modal-body xm-body">
          <Alert>{error}</Alert>

          {/* MODE SWITCHER + BILL ITEM SUMMARY BANNER */}
          <div className="xm-top-banner">
            <div className="xm-top-item">
              <span className="xm-top-icon">
                {isExchange ? <ArrowLeftRight size={18} /> : <Undo2 size={18} />}
              </span>
              <div className="xm-top-meta">
                <small>
                  Original Bill {ref('INV', invoice.id)} · {billItems.length} Bill Item(s) · Bill Total {money(invoice.total)}
                </small>
                <strong>
                  {selectedLines.length === 0
                    ? 'No bill items selected yet'
                    : selectedLines.length === 1
                      ? `${selectedLines[0].name} (${selectedLines[0].selQty} of ${selectedLines[0].avail} qty)`
                      : `${selectedLines.length} Bill Items Selected (${totalSelectedQty} units)`}
                </strong>
                <span>
                  {keptUnitsCount > 0
                    ? `Partial Bill ${isExchange ? 'Exchange' : 'Return'}: ${keptUnitsCount} unit(s) across ${keptItemsCount} item(s) stay on the bill (not ${isExchange ? 'exchanged' : 'returned'})`
                    : 'All remaining units on this bill are selected'}
                </span>
              </div>
            </div>

            <div className="xm-top-right">
              <div className="xm-type-tabs" role="tablist" aria-label="Action type">
                <button
                  type="button"
                  className={'xm-type-tab' + (isExchange ? ' active' : '')}
                  onClick={() => setMode('exchange')}
                >
                  <Repeat2 size={14} />
                  <span>Exchange Item(s)</span>
                </button>
                <button
                  type="button"
                  className={'xm-type-tab' + (!isExchange ? ' active' : '')}
                  onClick={() => setMode('return')}
                >
                  <RotateCcw size={14} />
                  <span>Return Only (Refund)</span>
                </button>
              </div>
              <div className="xm-top-credit">
                <small>Selected Item Credit ({totalSelectedQty} qty)</small>
                <strong>{money(returnCredit)}</strong>
              </div>
            </div>
          </div>

          {/* 2-COLUMN WORKSPACE */}
          <div className="xm-workspace">
            {/* LEFT COLUMN: BILL ITEMS SELECTION + REPLACEMENT ITEMS */}
            <div className="xm-col">
              {/* STEP 1: ALL ITEMS ON THE BILL — SELECT WHICH ITEM(S) TO EXCHANGE/RETURN */}
              <section className="xm-panel">
                <header className="xm-panel-head">
                  <div className="xm-panel-title">
                    <FileText size={16} />
                    <span>
                      1. Items on Bill {ref('INV', invoice.id)} — Select Item(s) to{' '}
                      {isExchange ? 'Exchange' : 'Return'}
                    </span>
                  </div>
                  <div className="xm-panel-badges">
                    <Badge tone="teal">
                      {selectedLines.length} Selected
                    </Badge>
                    <Badge tone="slate">
                      {keptUnitsCount} Kept on Bill
                    </Badge>
                  </div>
                </header>

                <div className="xm-bill-hint">
                  <span>
                    Check only the specific item(s) and quantity the customer is bringing back. Unchecked items remain on the bill.
                  </span>
                  {selectedLines.length > 1 && (
                    <button
                      type="button"
                      className="xm-reset-single"
                      onClick={() => selectSingleItemOnly(defaultSelectedId)}
                    >
                      Select only {item?.name || '1 item'}
                    </button>
                  )}
                </div>

                {/* BILL ITEMS LIST */}
                <div className="xm-bill-list">
                  {annotatedBillItems.map((b, idx) => {
                    const disabled = b.avail <= 0;
                    return (
                      <div
                        key={b.id}
                        className={
                          'xm-bill-card' +
                          (b.isSelected ? ' selected' : '') +
                          (disabled ? ' exhausted' : '')
                        }
                      >
                        <div className="xm-bill-row-main">
                          <label className="xm-bill-check">
                            <input
                              type="checkbox"
                              checked={b.isSelected}
                              disabled={disabled}
                              onChange={ev => toggleBillItem(b, ev.target.checked)}
                            />
                            <span className="xm-bill-idx">#{idx + 1}</span>
                          </label>

                          <div
                            className="xm-bill-info"
                            onClick={() => !disabled && toggleBillItem(b, !b.isSelected)}
                          >
                            <div className="xm-bill-name-row">
                              <strong>{b.name}</strong>
                              {b.isSelected ? (
                                <Badge tone="teal">
                                  {isExchange ? 'Exchanging' : 'Returning'} {b.selQty} of {b.avail}
                                </Badge>
                              ) : disabled ? (
                                <Badge tone="red">Already Returned</Badge>
                              ) : (
                                <Badge tone="slate">Kept on Bill</Badge>
                              )}
                              {b.isSelected && b.keptQty > 0 && (
                                <Badge tone="amber">{b.keptQty} Kept on Bill</Badge>
                              )}
                            </div>
                            <div className="xm-bill-submeta">
                              <span>Unit: {money(b.price)}</span>
                              <span>·</span>
                              <span>Sold: {b.sold}</span>
                              {b.refunded > 0 && (
                                <>
                                  <span>·</span>
                                  <span>Returned: {b.refunded}</span>
                                </>
                              )}
                              <span>·</span>
                              <span>Available: {b.avail}</span>
                              {(b.imei || b.code) && (
                                <>
                                  <span>·</span>
                                  <span className="xm-imei-tag">
                                    IMEI/SN: {b.imei || b.code}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="xm-bill-price-col">
                            <small>Bill Line Total</small>
                            <strong>{money(b.total)}</strong>
                          </div>
                        </div>

                        {/* EXPANDED CONTROLS WHEN THIS BILL ITEM IS SELECTED */}
                        {b.isSelected && (
                          <div className="xm-bill-controls">
                            <div className="xm-rep-qty">
                              <span className="xm-sub-label">
                                {isExchange ? 'Qty to Exchange:' : 'Qty to Return:'}
                              </span>
                              <div className="xm-stepper">
                                <button
                                  type="button"
                                  disabled={b.selQty <= 1}
                                  onClick={() => setBillItemQty(b, b.selQty - 1)}
                                >
                                  <Minus size={13} />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={b.avail}
                                  value={b.selQty}
                                  aria-label={`Quantity to return for ${b.name}`}
                                  onChange={ev => setBillItemQty(b, ev.target.value)}
                                />
                                <button
                                  type="button"
                                  disabled={b.selQty >= b.avail}
                                  onClick={() => setBillItemQty(b, b.selQty + 1)}
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                              <small className="muted">of {b.avail} available</small>
                            </div>

                            {!b.unit_id && (
                              <label className="xm-inline-restock">
                                <input
                                  type="checkbox"
                                  checked={b.restock}
                                  onChange={ev => setBillItemRestock(b, ev.target.checked)}
                                />
                                <span>Sellable — restock</span>
                              </label>
                            )}

                            <div className="xm-bill-line-credit">
                              <small>Item Return Credit</small>
                              <strong>− {money(b.credit)}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* CONDITION, REASON & REFUND TENDER */}
                <div className="xm-grid-2">
                  <label className="xm-field">
                    <span>Returned Item Condition *</span>
                    <input
                      value={condition}
                      maxLength={100}
                      placeholder="e.g. Good condition, box included"
                      onChange={ev => setCondition(ev.target.value)}
                    />
                  </label>
                  <label className="xm-field">
                    <span>Reason for {isExchange ? 'Exchange' : 'Return'} *</span>
                    <input
                      value={reason}
                      maxLength={500}
                      placeholder={`Why is the customer ${isExchange ? 'exchanging' : 'returning'} the selected item(s)?`}
                      onChange={ev => setReason(ev.target.value)}
                    />
                  </label>
                </div>

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
                </div>
              </section>

              {/* STEP 2: REPLACEMENT ITEMS (SHOWN IN EXCHANGE MODE) */}
              {isExchange ? (
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
                      Add Replacement Item
                    </Button>
                  </header>

                  <div className="xm-rep-list">
                    {priced.map((r, index) => {
                      const availUnits = r.product?.serialized
                        ? unitsFor(r.product.id).filter(
                            u =>
                              !rows.some(
                                x => x.key !== r.key && String(x.unit_id) === String(u.id)
                              )
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
                                  patchRow(r.key, {
                                    product_id: ev.target.value,
                                    unit_id: '',
                                    qty: 1,
                                  })
                                }
                              />
                            </div>
                            {rows.length > 1 && (
                              <button
                                type="button"
                                className="xm-remove-btn"
                                aria-label="Remove item"
                                title="Remove item"
                                onClick={() =>
                                  setRows(list => list.filter(x => x.key !== r.key))
                                }
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
                                    onChange={ev =>
                                      patchRow(r.key, { unit_id: ev.target.value })
                                    }
                                  />
                                </div>
                              ) : (
                                <div className="xm-rep-qty">
                                  <span className="xm-sub-label">Quantity:</span>
                                  <div className="xm-stepper">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        patchRow(r.key, {
                                          qty: Math.max(1, Number(r.qty || 1) - 1),
                                        })
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
              ) : (
                <section className="xm-panel xm-return-only-card">
                  <div className="xm-return-only-body">
                    <PackageCheck size={20} />
                    <div>
                      <strong>Item Return Only (No Replacement Item)</strong>
                      <p>
                        Only the selected bill item(s) ({totalSelectedQty} qty) will be returned
                        and refunded ({money(returnCredit)}). The remaining {keptUnitsCount}{' '}
                        unit(s) stay on bill {ref('INV', invoice.id)}.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="soft"
                      icon={Repeat2}
                      onClick={() => setMode('exchange')}
                    >
                      Switch to Exchange
                    </Button>
                  </div>
                </section>
              )}
            </div>

            {/* RIGHT COLUMN: SETTLEMENT & ALL PAYMENT / SPLIT OPTIONS */}
            <div className="xm-col">
              <section className="xm-panel xm-settle-panel">
                <header className="xm-panel-head">
                  <div className="xm-panel-title">
                    <Coins size={16} />
                    <span>
                      {isExchange
                        ? '3. Exchange Settlement & Payment Options'
                        : '2. Return Refund Settlement'}
                    </span>
                  </div>
                  <Badge tone={collect ? 'amber' : refund ? 'red' : 'green'}>
                    {isExchange
                      ? collect
                        ? 'Collect Balance'
                        : refund
                          ? 'Issue Refund'
                          : 'Even Exchange'
                      : `Refund via ${refundMethod}`}
                  </Badge>
                </header>

                {/* CALCULATION BREAKDOWN */}
                <div className="xm-calc-box">
                  <div className="xm-calc-row">
                    <span>Original Bill Total ({billItems.length} items)</span>
                    <strong>{money(invoice.total)}</strong>
                  </div>
                  <div className="xm-calc-row">
                    <span>Items Kept on Bill (Not {isExchange ? 'Exchanged' : 'Returned'})</span>
                    <strong>{keptUnitsCount} unit(s)</strong>
                  </div>
                  <div className="xm-calc-row">
                    <span>
                      Selected Return Item(s) Credit ({selectedLines.length} item
                      {selectedLines.length === 1 ? '' : 's'} · {totalSelectedQty} qty)
                    </span>
                    <strong className="text-green">− {money(returnCredit)}</strong>
                  </div>
                  {isExchange && (
                    <>
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
                    </>
                  )}
                </div>

                {/* HIGHLIGHT DIFFERENCE / REFUND BANNER */}
                <div className={'xm-net-banner' + (collect ? ' due' : refund ? ' back' : ' even')}>
                  <div>
                    <small>
                      {!isExchange
                        ? `Total Refund for Selected Item(s) via ${refundMethod}`
                        : collect
                          ? 'Net Difference — Customer Pays'
                          : refund
                            ? `Net Difference — Refund via ${refundMethod}`
                            : 'Net Difference'}
                    </small>
                    <strong>
                      {!isExchange
                        ? money(returnCredit)
                        : collect
                          ? money(difference)
                          : refund
                            ? money(-difference)
                            : 'Even Exchange · LKR 0.00'}
                    </strong>
                  </div>
                </div>

                {/* PROCESSING MODE TABS */}
                <div className="xm-mode-switch" role="radiogroup" aria-label="Processing mode">
                  <button
                    type="button"
                    className={'xm-mode-btn' + (processNow ? ' active' : '')}
                    onClick={() => setProcessNow(true)}
                  >
                    <Zap size={15} />
                    <div>
                      <strong>Complete &amp; Print Bill Now</strong>
                      <small>
                        {isExchange
                          ? 'Settle payment & issue replacement bill'
                          : 'Process refund & print return bill immediately'}
                      </small>
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
          <div className="xm-footer-meta">
            <span>
              <strong>{selectedLines.length}</strong> of <strong>{billItems.length}</strong> bill
              item(s) selected ({totalSelectedQty} qty) ·{' '}
              <strong>{keptUnitsCount}</strong> unit(s) kept on bill
            </span>
          </div>
          <div className="xm-footer-actions">
            <Button type="button" onClick={onClose} disabled={busy}>
              Back to Bill
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={isExchange ? Repeat2 : RotateCcw}
              disabled={busy || !selectedLines.length}
            >
              {busy
                ? 'Processing…'
                : processNow
                  ? !isExchange
                    ? `Complete Return & Refund ${money(returnCredit)}`
                    : collect
                      ? `Complete & Collect ${money(difference)}`
                      : refund
                        ? `Complete & Refund ${money(-difference)}`
                        : 'Complete Even Exchange'
                  : 'Submit Pending Request'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
