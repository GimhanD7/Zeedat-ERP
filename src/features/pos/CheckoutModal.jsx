import { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  Banknote,
  Bookmark,
  Building2,
  Calendar,
  Check,
  Coins,
  CreditCard,
  FileText,
  Landmark,
  Layers,
  Pencil,
  Percent,
  Printer,
  ReceiptText,
  Shield,
  ShoppingCart,
  Smartphone,
  Tag,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { Alert } from '../../components/feedback';
import { cents, managers, money, printThermalReceipt, rupees, today } from '../../utils';

const METHOD_KEYS = [
  { id: 'Cash', label: 'Cash', icon: Banknote },
  { id: 'Card', label: 'Card', icon: CreditCard },
  { id: 'Bank Transfer', label: 'Bank Transfer', icon: Building2 },
  { id: 'Koko', label: 'Koko', icon: Zap, isBadge: true },
  { id: 'Split', label: 'Split Payment', icon: Layers },
];

export function CheckoutModal({
  ctx,
  onClose,
  onComplete,
  onUpdateQty,
  lines = [],
  subtotal = 0,
  discount = 0,
  tax = 0,
  total = 0,
  customer = null,
  customerObj = null,
  customerName = '',
  branchName = '',
  discountBps = 0,
  draftId = null,
  settings = {},
}) {
  const walletAvailable = Number(customerObj?.wallet_balance || 0);
  const [useWallet, setUseWallet] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [method, setMethod] = useState('Cash');
  const [tender, setTender] = useState({ Cash: String(rupees(total)) });
  const [refs, setRefs] = useState({});
  const [credit, setCredit] = useState(false);
  const [due, setDue] = useState(today());
  const [printReceipt, setPrintReceipt] = useState(
    () => settings?.auto_print !== 0 && settings?.auto_print !== '0'
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const walletUsedCents = useMemo(() => {
    if (!useWallet || !customerObj || walletAvailable <= 0) return 0;
    return Math.min(walletAvailable, total, Math.max(0, cents(walletInput || 0)));
  }, [useWallet, customerObj, walletAvailable, total, walletInput]);

  const toggleWalletUse = checked => {
    setUseWallet(checked);
    const apply = checked ? Math.min(walletAvailable, total) : 0;
    setWalletInput(checked ? String(rupees(apply)) : '');
    const rem = Math.max(0, total - apply);
    if (method !== 'Split' && method !== 'Credit') {
      setTender({ [method]: rem > 0 ? String(rupees(rem)) : '' });
    }
  };

  // Generate dynamic invoice number & formatted current timestamp
  const invoiceNo = useMemo(() => {
    if (draftId) return `INV-${String(draftId).padStart(6, '0')}`;
    const hash = Math.abs(total * 31 + lines.length * 17) % 900000 + 100000;
    return `INV-${String(hash).padStart(6, '0')}`;
  }, [draftId, total, lines.length]);

  const formattedDateTime = useMemo(() => {
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
  }, []);

  const split = method === 'Split';
  const activeMethods = method === 'Credit' 
    ? [] 
    : split 
    ? ['Cash', 'Card', 'Bank Transfer', 'Koko'] 
    : [method];

  const tenderPaid = activeMethods.reduce((sum, key) => sum + cents(tender[key] || 0), 0);
  const paid = tenderPaid + walletUsedCents;
  const balance = Math.max(total - paid, 0);
  const change = Math.max(paid - total, 0);
  const pointsEarnedPreview = customer ? Math.floor(Math.max(0, total - (credit ? balance : 0)) / 100) : 0;
  const canCredit = managers.includes(ctx.user.role) && Boolean(customer);

  // Select method handler
  const selectMethod = value => {
    const rem = Math.max(0, total - walletUsedCents);
    setMethod(value);
    if (value === 'Split') {
      setTender({ Cash: rem > 0 ? String(rupees(rem)) : '', Card: '', 'Bank Transfer': '', Koko: '' });
    } else if (value === 'Credit') {
      setTender({});
      setCredit(true);
    } else {
      setTender({ [value]: rem > 0 ? String(rupees(rem)) : '' });
      setCredit(false);
    }
    setError('');
  };

  // Preset quick cash pills based on total
  const presetAmounts = useMemo(() => {
    const totalRs = rupees(total);
    const presets = [totalRs];

    const nextThousand = Math.ceil(totalRs / 1000) * 1000;
    if (nextThousand > totalRs) presets.push(nextThousand);

    const nextFiveThousand = Math.ceil(totalRs / 5000) * 5000;
    if (!presets.includes(nextFiveThousand) && nextFiveThousand > totalRs) {
      presets.push(nextFiveThousand);
    }

    const nextTenThousand = Math.ceil(totalRs / 10000) * 10000;
    if (!presets.includes(nextTenThousand) && nextTenThousand > totalRs) {
      presets.push(nextTenThousand);
    }

    [20000, 25000, 50000, 100000].forEach(val => {
      if (val > totalRs && !presets.includes(val) && presets.length < 5) {
        presets.push(val);
      }
    });

    return presets.slice(0, 5);
  }, [total]);

  // Handle preset pill click
  const handlePresetClick = val => {
    setTender(prev => ({ ...prev, Cash: String(val) }));
  };

  // Total count of items
  const totalItemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const discountPct = (discountBps / 100).toFixed(discountBps % 100 === 0 ? 0 : 1);
  const vatPct = ((ctx.branch?.tax_bps || 1800) / 100).toFixed(0);

  // Pre-settlement thermal preview print (all products print, cash drawer stays closed)
  const handlePrintPreview = async () => {
    const previewInvoice = {
      isPreview: true,
      invoiceNo,
      branch: branchName || ctx.branches?.find(b => b.id === ctx.branch)?.name || '',
      customer: customerName || 'Walk-in customer',
      items: lines.map(l => ({
        name: l.product?.name || 'Item',
        qty: l.qty,
        price: l.product?.price || 0,
        total: l.qty * (l.product?.price || 0),
      })),
      subtotal,
      discount,
      tax,
      total,
      payments: activeMethods
        .filter(key => cents(tender[key] || 0) > 0)
        .map(key => ({ method: key, amount: cents(tender[key] || 0) })),
      cashTendered: activeMethods.includes('Cash') ? cents(tender.Cash || 0) : 0,
      change,
      credit: credit ? balance : 0,
      due_date: due,
      notes: notes.trim(),
      cashier: ctx.user?.name || '',
    };
    await printThermalReceipt(previewInvoice, settings);
  };

  // Complete checkout
  const complete = async e => {
    if (e) e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const cashTendered = activeMethods.includes('Cash') ? cents(tender.Cash || 0) : 0;
      const hasCashSettlement = cashTendered > 0;

      const invoice = await ctx.mutate('sale.checkout', {
        items: lines.map(({ product_id, unit_id, qty }) => ({ product_id, unit_id, qty })),
        discount_bps: discountBps,
        customer_id: customer,
        draft_id: draftId,
        expected_total: total,
        wallet_amount: walletUsedCents,
        payments: activeMethods
          .filter(key => cents(tender[key] || 0) > 0)
          .map(key => ({
            method: key,
            amount: cents(tender[key] || 0),
            reference: refs[key] || '',
          })),
        allow_credit: credit,
        due_date: due,
        notes: notes.trim(),
      });

      onComplete({
        ...invoice,
        cashTendered,
        hasCashSettlement,
        shouldAutoPrint: printReceipt,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsCredit = () => {
    if (!customer) {
      setError('Please attach a registered customer to the sale to save as credit.');
      return;
    }
    setCredit(true);
    setMethod('Credit');
    setTender({});
  };

  // Icon helper based on item category or name
  const getItemIcon = item => {
    const text = `${item.name} ${item.category || ''}`.toLowerCase();
    if (text.includes('phone') || text.includes('iphone') || text.includes('case')) return Smartphone;
    if (text.includes('screen') || text.includes('protector') || text.includes('glass')) return Shield;
    if (text.includes('charger') || text.includes('adapter') || text.includes('power')) return Zap;
    if (text.includes('cable') || text.includes('usb') || text.includes('lightning')) return Tag;
    return ShoppingCart;
  };

  return (
    <div className="zk-checkout-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="zk-checkout-container" role="dialog" aria-modal="true" aria-label="Checkout / Payment">
        
        {/* MODAL HEADER */}
        <header className="zk-checkout-header">
          <div className="zk-header-left">
            <div className="zk-header-icon">
              <ShoppingCart size={22} />
            </div>
            <div className="zk-header-text">
              <h2>Checkout / Payment</h2>
              <p>Review the bill, receive payment, and complete the sale.</p>
            </div>
          </div>

          <div className="zk-header-right">
            <div className="zk-pill-badge">
              <FileText size={15} style={{ color: '#64748b' }} />
              <span>Invoice No.</span>
              <strong>{invoiceNo}</strong>
            </div>

            <div className="zk-pill-badge">
              <Calendar size={15} style={{ color: '#64748b' }} />
              <span>{formattedDateTime}</span>
            </div>

            <button className="zk-close-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </header>

        {/* MODAL BODY (3 COLUMNS) */}
        <div className="zk-checkout-body">
          {error && <Alert tone="red" style={{ marginBottom: '14px' }}>{error}</Alert>}

          <div className="zk-checkout-grid">
            
            {/* COLUMN 1: CURRENT BILL */}
            <div className="zk-bill-card">
              <div className="zk-card-header">
                <div className="zk-card-title">
                  <ShoppingCart size={17} style={{ color: '#0d9488' }} />
                  <span>Current Bill ({totalItemCount} Items)</span>
                </div>
                <button className="zk-edit-btn" onClick={onClose} type="button">
                  <Pencil size={12} />
                  <span>Edit Items</span>
                </button>
              </div>

              {/* Items List */}
              <div className="zk-items-list">
                {lines.map(line => {
                  const ItemIcon = getItemIcon(line.product);
                  return (
                    <div className="zk-item-row" key={line.id}>
                      <div className="zk-item-art">
                        <ItemIcon size={20} />
                      </div>

                      <div className="zk-item-info">
                        <div className="zk-item-name" title={line.product.name}>
                          {line.product.name}
                        </div>
                        <div className="zk-item-sub">
                          {line.product.category || 'Accessories'} • {line.product.brand || 'Item'}
                        </div>
                      </div>

                      <div className="zk-stepper">
                        <button
                          type="button"
                          className="zk-stepper-btn"
                          onClick={() => onUpdateQty?.(line, -1)}
                          disabled={busy}
                        >
                          −
                        </button>
                        <span className="zk-stepper-qty">{line.qty}</span>
                        <button
                          type="button"
                          className="zk-stepper-btn"
                          onClick={() => onUpdateQty?.(line, 1)}
                          disabled={busy}
                        >
                          +
                        </button>
                      </div>

                      <div className="zk-item-price">
                        {money(line.qty * line.product.price)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bill Totals */}
              <div className="zk-bill-totals">
                <div className="zk-total-line">
                  <div className="zk-total-label">
                    <Tag size={14} style={{ color: '#64748b' }} />
                    <span>Subtotal ({totalItemCount} Items)</span>
                  </div>
                  <strong>{money(subtotal)}</strong>
                </div>

                <div className="zk-total-line">
                  <div className="zk-total-label">
                    <Percent size={14} style={{ color: '#15803d' }} />
                    <span style={{ color: '#15803d' }}>Discount ({discountPct}%)</span>
                  </div>
                  <strong className="zk-discount-amount">− {money(discount)}</strong>
                </div>

                <div className="zk-total-line">
                  <div className="zk-total-label">
                    <Landmark size={14} style={{ color: '#64748b' }} />
                    <span>VAT ({vatPct}%)</span>
                  </div>
                  <strong>{money(tax)}</strong>
                </div>
              </div>

              {/* Highlight Total Payable Banner */}
              <div className="zk-total-payable-banner">
                <div className="zk-banner-label">
                  <Coins size={20} style={{ color: '#0d9488' }} />
                  <span>Total Payable</span>
                </div>
                <div className="zk-banner-value">
                  {money(total)}
                </div>
              </div>
            </div>

            {/* COLUMN 2: PAYMENT METHOD & TENDER INPUT */}
            <div className="zk-payment-col">
              <div className="zk-card-title">
                <CreditCard size={18} style={{ color: '#0d9488' }} />
                <span>Payment Method</span>
              </div>

              {/* 5 Payment Method Buttons */}
              <div className="zk-payment-methods-grid">
                {METHOD_KEYS.map(({ id, label, icon: Icon, isBadge }) => {
                  const isActive = method === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`zk-method-btn ${isActive ? 'active' : ''}`}
                      onClick={() => selectMethod(id)}
                    >
                      {isActive && (
                        <div className="zk-method-check">
                          <Check size={11} strokeWidth={3} />
                        </div>
                      )}
                      <Icon size={20} style={{ color: isActive ? '#0d9488' : '#64748b' }} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {customerObj && walletAvailable > 0 && (
                <div className="zk-wallet-checkout-card">
                  <label className="zk-wallet-chk-row">
                    <input
                      type="checkbox"
                      checked={useWallet}
                      onChange={e => toggleWalletUse(e.target.checked)}
                    />
                    <Wallet size={16} style={{ color: '#0d9488' }} />
                    <span>
                      Use Customer Wallet (Available: <strong>{money(walletAvailable)}</strong>)
                    </span>
                  </label>
                  {useWallet && (
                    <div className="zk-wallet-chk-input">
                      <span>Wallet Amount (LKR)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={rupees(Math.min(walletAvailable, total))}
                        value={walletInput}
                        onChange={e => {
                          setWalletInput(e.target.value);
                          const apply = Math.min(walletAvailable, total, Math.max(0, cents(e.target.value || 0)));
                          const rem = Math.max(0, total - apply);
                          if (method !== 'Split' && method !== 'Credit') {
                            setTender({ [method]: rem > 0 ? String(rupees(rem)) : '' });
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ACTIVE TENDER CARD */}
              <div className="zk-tender-box">
                <div className="zk-tender-header">
                  <div className="zk-tender-title">
                    {method === 'Cash' && <Banknote size={18} style={{ color: '#0d9488' }} />}
                    {method === 'Card' && <CreditCard size={18} style={{ color: '#0d9488' }} />}
                    {method === 'Bank Transfer' && <Building2 size={18} style={{ color: '#0d9488' }} />}
                    {method === 'Koko' && <Zap size={18} style={{ color: '#7c3aed' }} />}
                    {method === 'Split' && <Layers size={18} style={{ color: '#0284c7' }} />}
                    <span>{method === 'Split' ? 'Split Payment Modes' : `${method} Payment`}</span>
                  </div>

                  <div className="zk-tender-payable">
                    Total Payable: <b>{money(total)}</b>
                  </div>
                </div>

                {/* SINGLE METHOD INPUT (e.g. CASH / CARD / BANK / KOKO) */}
                {!split && (
                  <>
                    <div className="zk-paid-amount-block">
                      <label className="zk-paid-label">Paid Amount</label>
                      <div className="zk-paid-input-wrap">
                        <span className="zk-paid-prefix">LKR</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="zk-paid-input"
                          value={tender[method] ?? ''}
                          onChange={e => setTender({ ...tender, [method]: e.target.value })}
                          placeholder="0.00"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Quick Preset Amount Pills (for Cash) */}
                    {method === 'Cash' && (
                      <div className="zk-presets-row">
                        {presetAmounts.map((amt, idx) => {
                          const isSelected = cents(tender.Cash) === cents(amt);
                          return (
                            <button
                              key={idx}
                              type="button"
                              className={`zk-preset-pill ${isSelected ? 'active' : ''}`}
                              onClick={() => handlePresetClick(amt)}
                            >
                              LKR {amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Reference input for Card / Bank / Koko */}
                    {method !== 'Cash' && (
                      <div style={{ marginBottom: '14px' }}>
                        <label className="zk-paid-label">
                          {method === 'Card'
                            ? 'Card Approval / Slip Reference'
                            : method === 'Bank Transfer'
                            ? 'Bank Deposit / Transfer Reference'
                            : 'Koko Order / Merchant Reference'}
                        </label>
                        <input
                          type="text"
                          className="zk-paid-input-wrap"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                          placeholder="Enter transaction reference code..."
                          value={refs[method] || ''}
                          onChange={e => setRefs({ ...refs, [method]: e.target.value })}
                        />
                      </div>
                    )}

                    {/* Results Cards: Balance & Change */}
                    <div className="zk-results-grid">
                      <div className="zk-result-card balance">
                        <div className="zk-result-label">
                          <Wallet size={15} style={{ color: '#64748b' }} />
                          <span>Balance</span>
                        </div>
                        <div className="zk-result-val">
                          {money(balance)}
                        </div>
                      </div>

                      <div className="zk-result-card change">
                        <div className="zk-result-label">
                          <Coins size={16} style={{ color: '#2563eb' }} />
                          <span>Change (Return to Customer)</span>
                        </div>
                        <div className="zk-result-val">
                          {money(change)}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* SPLIT PAYMENT INPUTS */}
                {split && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                    {['Cash', 'Card', 'Bank Transfer', 'Koko'].map(key => (
                      <div key={key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                        <strong style={{ fontSize: '13px', color: '#334155' }}>{key}</strong>
                        <div className="zk-paid-input-wrap" style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, marginRight: '6px' }}>LKR</span>
                          <input
                            type="number"
                            step="0.01"
                            style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '14px', fontWeight: 700 }}
                            value={tender[key] || ''}
                            onChange={e => setTender({ ...tender, [key]: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        {key !== 'Cash' ? (
                          <input
                            type="text"
                            placeholder="Ref / Auth Code"
                            style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                            value={refs[key] || ''}
                            onChange={e => setRefs({ ...refs, [key]: e.target.value })}
                          />
                        ) : (
                          <small style={{ color: '#64748b' }}>Cash drawer tender</small>
                        )}
                      </div>
                    ))}

                    <div className="zk-results-grid" style={{ marginTop: '6px' }}>
                      <div className="zk-result-card balance">
                        <div className="zk-result-label">
                          <span>Remaining Balance</span>
                        </div>
                        <div className="zk-result-val" style={{ color: balance > 0 ? '#dc2626' : '#15803d' }}>
                          {money(balance)}
                        </div>
                      </div>

                      <div className="zk-result-card change">
                        <div className="zk-result-label">
                          <span>Change</span>
                        </div>
                        <div className="zk-result-val">
                          {money(change)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Split Payment Helper Banner */}
                {!split && (
                  <div className="zk-split-notice">
                    <span>
                      ℹ️ <strong>Split Payment Example:</strong> Pay using multiple methods (e.g., Card + Cash, or Koko + Cash).
                    </span>
                    <button type="button" onClick={() => selectMethod('Split')}>
                      Use Split Payment →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 3: PAYMENT SUMMARY */}
            <div className="zk-summary-card">
              <div className="zk-card-title" style={{ marginBottom: '14px' }}>
                <FileText size={17} style={{ color: '#0d9488' }} />
                <span>Payment Summary</span>
              </div>

              <div className="zk-summary-rows">
                <div className="zk-summary-row">
                  <span>Invoice No.</span>
                  <strong>{invoiceNo}</strong>
                </div>

                <div className="zk-summary-row">
                  <span>Date & Time</span>
                  <span style={{ color: '#475569', fontSize: '11.5px' }}>{formattedDateTime}</span>
                </div>

                <div className="zk-summary-row">
                  <span>Payment Method</span>
                  <strong style={{ color: '#0d9488' }}>{method === 'Split' ? 'Split Payment' : method}</strong>
                </div>

                <div className="zk-summary-divider" />

                <div className="zk-summary-row">
                  <span>Total Payable</span>
                  <strong style={{ fontSize: '13.5px' }}>{money(total)}</strong>
                </div>

                <div className="zk-summary-row">
                  <span>Paid Amount</span>
                  <strong style={{ fontSize: '13.5px' }}>{money(paid)}</strong>
                </div>

                <div className="zk-summary-row">
                  <span>Balance</span>
                  <strong style={{ color: balance > 0 ? '#dc2626' : '#0f172a' }}>{money(balance)}</strong>
                </div>

                {customerObj && (
                  <>
                    {walletUsedCents > 0 && (
                      <div className="zk-summary-row">
                        <span>Wallet Used</span>
                        <strong style={{ color: '#0f766e' }}>− {money(walletUsedCents)}</strong>
                      </div>
                    )}
                    <div className="zk-summary-row">
                      <span>Loyalty Points Earned (1 LKR = 1 pt)</span>
                      <strong style={{ color: '#b45309' }}>+{pointsEarnedPreview.toLocaleString()} pts</strong>
                    </div>
                  </>
                )}

                <div className="zk-summary-divider" />

                {/* Highlighted Change Container */}
                <div className="zk-change-highlight-row">
                  <span>Change</span>
                  <strong>{money(change)}</strong>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label className="zk-paid-label" style={{ marginBottom: '4px', display: 'block' }}>
                    Invoice / Warranty Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Add warranty note, delivery info, or remarks..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '12.5px',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* MODAL FOOTER */}
        <footer className="zk-checkout-footer">
          <div className="zk-footer-left">
            <label className="zk-receipt-checkbox-label">
              <input
                type="checkbox"
                checked={printReceipt}
                onChange={e => setPrintReceipt(e.target.checked)}
              />
              <span>Print receipt after completing sale</span>
            </label>
          </div>

          <div className="zk-footer-right">
            <button
              type="button"
              className="zk-btn-outline"
              onClick={handlePrintPreview}
              disabled={busy}
            >
              <Printer size={16} />
              <span>Print Receipt</span>
            </button>

            <button
              type="button"
              className="zk-btn-credit"
              onClick={handleSaveAsCredit}
              disabled={busy || !canCredit}
              title={!customer ? 'Select a customer first to enable credit sale' : 'Record sale as customer credit'}
            >
              <Bookmark size={16} />
              <span>Save as Credit</span>
            </button>

            <button
              type="button"
              className="zk-btn-complete"
              onClick={complete}
              disabled={busy || (balance > 0 && !credit)}
            >
              <Check size={18} strokeWidth={2.5} />
              <span>{busy ? 'Completing Sale...' : 'Complete Sale'}</span>
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
