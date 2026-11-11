import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Layers,
  LockKeyhole,
  Plus,
  Printer,
  RefreshCw,
  Tag,
  Wallet,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Modal,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import {
  cents,
  dateLabel,
  managers,
  money,
  printHtmlDocument,
  rupees,
  timeLabel,
  today,
} from '../../utils';

const canManage = ctx => managers.includes(ctx.user.role);

export const EXPENSE_CATEGORIES = [
  ['Tea & Refreshments', 'Tea & Refreshments / Food'],
  ['Shop Utilities', 'Shop Utilities (Electricity, Water, Net)'],
  ['Transport & Courier', 'Transport & Courier / Delivery'],
  ['Staff Advance', 'Staff Advance / Daily Wages'],
  ['Supplier Payment', 'Supplier Payment (Cash)'],
  ['Owner Drawings', 'Owner Drawings / Personal'],
  ['Bank Remittance', 'Bank Deposit / Cash to Bank'],
  ['Shop Maintenance', 'Shop Maintenance & Repairs'],
  ['General Expense', 'Other General Expense'],
];

export const INFLOW_CATEGORIES = [
  ['Owner Capital', 'Owner Capital / Cash Injection'],
  ['Bank Withdrawal', 'Bank Cash Withdrawal into Register'],
  ['Customer Settlement', 'Customer Debt / Credit Settlement'],
  ['Other Income', 'Other Cash Inflow'],
];

const LKR_DENOMS = [5000, 1000, 500, 100, 50, 20, 10];

function CashMovementForm({
  ctx,
  drawer,
  blocked,
  initialDirection = 'Out',
  onSuccess,
  onCancel,
  compact = false,
}) {
  const [direction, setDirection] = useState(initialDirection);
  const [category, setCategory] = useState(
    initialDirection === 'Out' ? EXPENSE_CATEGORIES[0][0] : INFLOW_CATEGORIES[0][0]
  );
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDirection(initialDirection);
    setCategory(initialDirection === 'Out' ? EXPENSE_CATEGORIES[0][0] : INFLOW_CATEGORIES[0][0]);
    setError('');
  }, [initialDirection]);

  const handleDirectionSwitch = dir => {
    setDirection(dir);
    setCategory(dir === 'Out' ? EXPENSE_CATEGORIES[0][0] : INFLOW_CATEGORIES[0][0]);
    setError('');
  };

  const amountCents = cents(amount);
  const currentExpected = drawer?.expected ?? 0;
  const projectedExpected =
    amountCents > 0
      ? direction === 'Out'
        ? currentExpected - amountCents
        : currentExpected + amountCents
      : currentExpected;

  const submit = async e => {
    e.preventDefault();
    setError('');

    if (!ctx.branch) {
      setError('Select a specific branch from the top bar before recording a cash entry.');
      return;
    }
    if (amountCents <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!reason.trim()) {
      setError('Please enter a description or bill reference.');
      return;
    }
    if (!drawer && !canManage(ctx)) {
      setError('Open today’s cash register before recording Cash In or Cash Out.');
      return;
    }

    setBusy(true);
    try {
      await ctx.mutate('drawer.movement', {
        direction,
        category,
        amount: amountCents,
        reason: reason.trim(),
        auto_open: canManage(ctx),
      });
      ctx.setNotice(
        direction === 'Out'
          ? `Cash Out (${category}) of ${money(amountCents)} recorded.`
          : `Cash In (${category}) of ${money(amountCents)} recorded.`
      );
      setAmount('');
      setReason('');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to record cash movement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="zk-cb-form-stack">
      {error && <Alert tone="red">{error}</Alert>}

      <div className="zk-cb-direction-switch">
        <button
          type="button"
          className={`zk-cb-dir-btn ${direction === 'Out' ? 'active-out' : ''}`}
          onClick={() => handleDirectionSwitch('Out')}
        >
          <ArrowUpRight size={15} />
          <span>Cash Out / Expense</span>
        </button>
        <button
          type="button"
          className={`zk-cb-dir-btn ${direction === 'In' ? 'active-in' : ''}`}
          onClick={() => handleDirectionSwitch('In')}
        >
          <ArrowDownLeft size={15} />
          <span>Cash In / Top-Up</span>
        </button>
      </div>

      {drawer && (
        <div className="zk-cb-balance-preview">
          <div>
            <small>Current Drawer</small>
            <strong>{money(currentExpected)}</strong>
          </div>
          <span className="zk-cb-preview-arrow">→</span>
          <div>
            <small>After Entry</small>
            <strong style={{ color: direction === 'Out' ? '#dc2626' : '#0f766e' }}>
              {money(projectedExpected)}
            </strong>
          </div>
        </div>
      )}

      <div className="zk-field-wrap">
        <label className="zk-field-label">
          {direction === 'Out' ? 'Expense Category' : 'Inflow Source'}
        </label>
        <div className="zk-input-box">
          <Tag size={15} style={{ color: '#64748b', flexShrink: 0 }} />
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {(direction === 'Out' ? EXPENSE_CATEGORIES : INFLOW_CATEGORIES).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="zk-field-wrap">
        <label className="zk-field-label">Amount (LKR)</label>
        <div className="zk-input-box">
          <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#475569' }}>LKR</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            autoFocus={!compact}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="zk-cb-amount-chips">
          {[500, 1000, 2000, 5000, 10000].map(amt => (
            <button
              key={amt}
              type="button"
              className="zk-cb-chip"
              onClick={() => setAmount(String(amt))}
            >
              {amt.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div className="zk-field-wrap">
        <label className="zk-field-label">Description / Bill Reference</label>
        <div className="zk-textarea-box">
          <textarea
            rows={2}
            maxLength={150}
            placeholder={
              direction === 'Out'
                ? 'e.g. Staff tea & snacks, Courier fee, Shop bill...'
                : 'e.g. Morning float added from bank, Owner capital...'
            }
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
          />
        </div>
      </div>

      {!drawer && ctx.branch > 0 && canManage(ctx) && (
        <small style={{ color: '#64748b', fontSize: '11.5px', textAlign: 'center' }}>
          Register is closed — submitting will automatically open today’s cash drawer.
        </small>
      )}

      <div className="zk-cb-form-actions">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <button
          type="submit"
          disabled={busy || blocked}
          className="zk-btn-complete"
          style={{
            flex: 1,
            justifyContent: 'center',
            background: direction === 'Out' ? '#dc2626' : '#0d9488',
          }}
        >
          {direction === 'Out' ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}
          <span>
            {busy
              ? 'Recording...'
              : direction === 'Out'
                ? 'Record Cash Out'
                : 'Record Cash In'}
          </span>
        </button>
      </div>
    </form>
  );
}

export function QuickCashMovementModal({
  ctx,
  drawer,
  blocked,
  initialDirection = 'Out',
  onClose,
  onSuccess,
}) {
  return (
    <Modal
      title={initialDirection === 'Out' ? 'Cash Out / Expense Entry' : 'Cash In / Drawer Top-Up'}
      description="Post cash movement directly to the active POS register drawer."
      onClose={onClose}
    >
      <div className="modal-body">
        <CashMovementForm
          ctx={ctx}
          drawer={drawer}
          blocked={blocked}
          initialDirection={initialDirection}
          onCancel={onClose}
          onSuccess={() => {
            onSuccess?.();
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}

export function CloseReconcileModal({ ctx, drawer, onClose, onSuccess }) {
  const [denoms, setDenoms] = useState({});
  const [coinsAmount, setCoinsAmount] = useState('');
  const [manualCounted, setManualCounted] = useState(String(rupees(drawer?.expected || 0)));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const denomTotalCents = useMemo(() => {
    let sumRupees = 0;
    for (const note of LKR_DENOMS) {
      const count = parseInt(denoms[note] || '0', 10);
      if (count > 0) sumRupees += note * count;
    }
    const coins = parseFloat(coinsAmount || '0');
    if (coins > 0) sumRupees += coins;
    return Math.round(sumRupees * 100);
  }, [denoms, coinsAmount]);

  const hasDenomInputs =
    Object.values(denoms).some(v => Number(v) > 0) || Number(coinsAmount) > 0;
  const effectiveCountedCents = hasDenomInputs ? denomTotalCents : cents(manualCounted || 0);
  const expectedCents = drawer?.expected || 0;
  const diff = effectiveCountedCents - expectedCents;

  const handleDenomChange = (note, val) => {
    setDenoms(prev => ({ ...prev, [note]: val.replace(/[^0-9]/g, '') }));
  };

  const submit = async e => {
    e.preventDefault();
    if (!drawer) return;
    setBusy(true);
    setError('');
    try {
      const res = await ctx.mutate('drawer.close', {
        counted: effectiveCountedCents,
        notes: notes.trim(),
      });
      const variance = res.variance;
      const msg =
        variance === 0
          ? 'Drawer balanced perfectly with 0.00 variance.'
          : variance > 0
            ? `Drawer closed with cash SURPLUS of ${money(variance)}`
            : `Drawer closed with cash SHORTAGE of ${money(Math.abs(variance))}`;
      ctx.setNotice(msg);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to close drawer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Reconcile & Close Cash Drawer"
      description={`Operator: ${drawer?.operator || 'Active Cashier'} · Expected Cash: ${money(expectedCents)}`}
      onClose={() => !busy && onClose()}
      wide={true}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          {error && (
            <Alert tone="red" style={{ marginBottom: '12px' }}>
              {error}
            </Alert>
          )}

          <div className="zk-recon-summary">
            <div className="zk-recon-box">
              <small>System Expected</small>
              <strong>{money(expectedCents)}</strong>
            </div>
            <div className="zk-recon-box" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
              <small style={{ color: '#0f766e' }}>Actual Counted</small>
              <strong style={{ color: '#0d9488' }}>{money(effectiveCountedCents)}</strong>
            </div>
            <div
              className="zk-recon-box"
              style={{
                background: diff === 0 ? '#f0fdf4' : diff > 0 ? '#eff6ff' : '#fef2f2',
                borderColor: diff === 0 ? '#bbf7d0' : diff > 0 ? '#bfdbfe' : '#fecaca',
              }}
            >
              <small>Variance</small>
              <strong
                style={{
                  color: diff === 0 ? '#15803d' : diff > 0 ? '#1d4ed8' : '#dc2626',
                }}
              >
                {diff === 0
                  ? 'Balanced (0.00)'
                  : diff > 0
                    ? `+ ${money(diff)} (Surplus)`
                    : `− ${money(Math.abs(diff))} (Short)`}
              </strong>
            </div>
          </div>

          <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>
              LKR Note &amp; Coin Counter
            </strong>
            <button
              type="button"
              className="zk-edit-btn"
              onClick={() => {
                setDenoms({});
                setCoinsAmount('');
              }}
            >
              <RefreshCw size={11} />
              <span>Clear Notes</span>
            </button>
          </div>

          <div className="zk-denom-grid">
            {LKR_DENOMS.map(note => {
              const qty = parseInt(denoms[note] || '0', 10) || 0;
              return (
                <div className="zk-denom-row" key={note}>
                  <span className="zk-denom-note">Rs. {note.toLocaleString()}</span>
                  <span style={{ color: '#94a3b8' }}>×</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="zk-denom-input"
                    placeholder="0"
                    value={denoms[note] || ''}
                    onChange={e => handleDenomChange(note, e.target.value)}
                  />
                  <span className="zk-denom-sub">{(note * qty).toLocaleString()}</span>
                </div>
              );
            })}
            <div className="zk-denom-row">
              <span className="zk-denom-note">Coins (LKR)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="zk-denom-input"
                style={{ width: '100%', textAlign: 'right' }}
                placeholder="0.00"
                value={coinsAmount}
                onChange={e => setCoinsAmount(e.target.value)}
              />
            </div>
          </div>

          {!hasDenomInputs && (
            <div className="zk-field-wrap" style={{ marginBottom: '12px' }}>
              <label className="zk-field-label">Or Enter Total Counted Cash Manually (LKR)</label>
              <div className="zk-input-box">
                <span style={{ fontWeight: 700, color: '#475569' }}>LKR</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualCounted}
                  onChange={e => setManualCounted(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="zk-field-wrap">
            <label className="zk-field-label">
              Closing &amp; Variance Notes{' '}
              {diff !== 0 && <span style={{ color: '#dc2626' }}>(Recommended for variance)</span>}
            </label>
            <div className="zk-textarea-box">
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Note any cash discrepancy, coin rounding, or handover details..."
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={LockKeyhole} variant="primary" disabled={busy}>
            {busy ? 'Closing Drawer...' : 'Confirm & Close Drawer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CashbookWorkspace({ ctx, registerData, onRefresh, defaultTab = 'register' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [sessionModal, setSessionModal] = useState(null);
  const [closeModalDrawer, setCloseModalDrawer] = useState(null);

  const {
    drawer = null,
    movements = [],
    payment_breakdown = [],
    history = [],
    ledger = [],
    categories = [],
    blocked = false,
  } = registerData || {};

  const inflow = useMemo(() => movements.reduce((s, r) => s + Math.max(0, r.amount), 0), [movements]);
  const outflow = useMemo(() => movements.reduce((s, r) => s + Math.min(0, r.amount), 0), [movements]);
  const current = drawer?.business_date === today();
  const currentBranchName = ctx.branches.find(b => b.id === ctx.branch)?.name || 'All Branches';

  const movementsWithBalance = useMemo(() => {
    const asc = [...movements].reverse();
    let runBal = drawer?.opening || 0;
    const mapped = asc.map(m => {
      runBal += m.amount;
      return { ...m, running_balance: runBal };
    });
    return mapped.reverse().filter(m => {
      if (shiftFilter === 'in' && m.amount <= 0) return false;
      if (shiftFilter === 'out' && m.amount >= 0) return false;
      if (shiftFilter === 'sales' && !m.kind?.toLowerCase().includes('sale')) return false;
      return true;
    });
  }, [movements, drawer?.opening, shiftFilter]);

  const filteredLedger = useMemo(() => {
    return ledger.filter(item => {
      if (ledgerFilter === 'in' && item.amount <= 0) return false;
      if (ledgerFilter === 'out' && item.amount >= 0) return false;
      if (
        ledgerFilter === 'sales' &&
        !item.kind?.toLowerCase().includes('sale') &&
        !item.reference?.toLowerCase().includes('inv-')
      ) {
        return false;
      }
      if (
        ledgerFilter === 'expenses' &&
        (item.amount >= 0 || item.kind?.toLowerCase().includes('return'))
      ) {
        return false;
      }
      const itemDate = (item.created_at || '').substring(0, 10);
      if (fromDate && itemDate < fromDate) return false;
      if (toDate && itemDate > toDate) return false;
      if (ledgerSearch) {
        const q = ledgerSearch.toLowerCase();
        const hit =
          (item.kind || '').toLowerCase().includes(q) ||
          (item.reference || '').toLowerCase().includes(q) ||
          (item.operator_name || '').toLowerCase().includes(q) ||
          (item.branch_name || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [ledger, ledgerFilter, fromDate, toDate, ledgerSearch]);

  const ledgerIn = useMemo(
    () => filteredLedger.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0),
    [filteredLedger]
  );
  const ledgerOut = useMemo(
    () => filteredLedger.reduce((sum, item) => sum + (item.amount < 0 ? Math.abs(item.amount) : 0), 0),
    [filteredLedger]
  );
  const ledgerNet = ledgerIn - ledgerOut;
  const maxCatVal = Math.max(1, ...categories.map(c => Math.abs(c.total)));

  const openDrawerModal = () => {
    if (!ctx.branch) {
      ctx.setNotice('Please select a specific branch from the top bar before opening a cash drawer.');
      return;
    }
    ctx.setDialog({
      title: 'Open Cash Register',
      description: 'Enter starting cash float to begin today’s business shift.',
      route: 'drawer.open',
      submit: 'Open Register',
      fields: [{ name: 'opening', label: 'Opening Float (LKR)', type: 'money', full: true }],
      values: { opening: 0 },
      transform: v => ({ ...v, opening: cents(v.opening) }),
      onSuccess: () => onRefresh?.(),
    });
  };

  const applyDatePreset = preset => {
    setDatePreset(preset);
    const now = new Date();
    const fmt = d => d.toISOString().substring(0, 10);
    if (preset === 'today') {
      const t = fmt(now);
      setFromDate(t);
      setToDate(t);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yd = fmt(y);
      setFromDate(yd);
      setToDate(yd);
    } else if (preset === '7days') {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      setFromDate(fmt(s));
      setToDate(fmt(now));
    } else if (preset === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(fmt(s));
      setToDate(fmt(now));
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const exportCsv = rows => {
    const headers = ['ID', 'Date & Time', 'Branch', 'Category / Kind', 'Operator', 'Reference', 'Inflow (LKR)', 'Outflow (LKR)'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => {
        const inflowVal = r.amount > 0 ? (r.amount / 100).toFixed(2) : '0.00';
        const outflowVal = r.amount < 0 ? (Math.abs(r.amount) / 100).toFixed(2) : '0.00';
        const clean = v => `"${String(v || '').replace(/"/g, '""')}"`;
        return [
          r.id,
          clean(r.created_at),
          clean(r.branch_name || currentBranchName),
          clean(r.kind),
          clean(r.operator_name || 'Staff'),
          clean(r.reference),
          inflowVal,
          outflowVal,
        ].join(',');
      }),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zeedat-cashbook-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const visibleTabs = [
    ['register', "Today's Register"],
    ['ledger', 'Cashbook Ledger'],
    ['categories', 'Categories'],
    ['sessions', 'Closed Shifts'],
  ];

  return (
    <div className="zk-cb-modern-shell">
      {/* HERO HEADER STRIP */}
      <div className="zk-cb-hero-bar">
        <div className="zk-cb-hero-meta">
          <div className="zk-cb-hero-badge-row">
            <span className={`zk-cb-status-pill ${drawer ? 'open' : 'closed'}`}>
              <span className="zk-cb-dot" />
              {drawer ? 'Register Open' : blocked ? 'Active Elsewhere' : 'Register Closed'}
            </span>
            <span className="zk-cb-branch-chip">
              <CalendarDays size={13} />
              {currentBranchName} · {dateLabel(today())}
            </span>
          </div>
          <h3>{drawer ? `Active Operator: ${drawer.operator || ctx.user?.name}` : 'Cashbook & Register Control'}</h3>
        </div>

        <div className="zk-cb-hero-actions">
          <Button icon={Download} variant="outline" onClick={() => exportCsv(filteredLedger)}>
            Export CSV
          </Button>
          <Button icon={Printer} variant="outline" onClick={() => setPrintModalOpen(true)}>
            Print Statement
          </Button>
          {drawer ? (
            <Button icon={LockKeyhole} variant="primary" onClick={() => setCloseModalDrawer(drawer)}>
              Reconcile &amp; Close
            </Button>
          ) : (
            ctx.branch > 0 && (
              <Button icon={Plus} variant="primary" disabled={blocked} onClick={openDrawerModal}>
                Open Register
              </Button>
            )
          )}
        </div>
      </div>

      {blocked && (
        <Alert>
          This branch already has an active cash drawer session assigned to another cashier.
        </Alert>
      )}

      {drawer && !current && (
        <Alert>
          The previous shift ({dateLabel(drawer.business_date)}) is still open. Please reconcile and
          close it before starting today’s transactions.
        </Alert>
      )}

      {/* MODERN 4-CARD KPI STRIP */}
      <div className="zk-cb-kpi-grid">
        <div className="zk-cb-kpi-tile slate">
          <div className="zk-cb-kpi-top">
            <span>Opening Float</span>
            <Wallet size={17} />
          </div>
          <strong>{money(drawer?.opening || 0)}</strong>
          <small>{drawer ? `Shift #${drawer.id}` : 'No open register'}</small>
        </div>

        <div className="zk-cb-kpi-tile green">
          <div className="zk-cb-kpi-top">
            <span>{drawer ? 'Shift Cash In' : 'Ledger Cash In'}</span>
            <ArrowDownLeft size={17} />
          </div>
          <strong>+ {money(drawer ? inflow : ledgerIn)}</strong>
          <small>Cash sales &amp; inflows</small>
        </div>

        <div className="zk-cb-kpi-tile red">
          <div className="zk-cb-kpi-top">
            <span>{drawer ? 'Shift Cash Out' : 'Ledger Outflow'}</span>
            <ArrowUpRight size={17} />
          </div>
          <strong>− {money(drawer ? -outflow : ledgerOut)}</strong>
          <small>Expenses, payouts &amp; refunds</small>
        </div>

        <div className="zk-cb-kpi-tile teal">
          <div className="zk-cb-kpi-top">
            <span>{drawer ? 'Expected Cash in Drawer' : 'Net Cash Flow'}</span>
            <Banknote size={17} />
          </div>
          <strong>{money(drawer ? drawer.expected : ledgerNet)}</strong>
          <small>{drawer ? 'Live drawer balance' : `${filteredLedger.length} ledger records`}</small>
        </div>
      </div>

      {/* MODERN SEGMENTED NAV */}
      <div className="zk-cb-nav-bar">
        <div className="zk-cb-tab-pills">
          {visibleTabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`zk-cb-tab-pill ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {id === 'register' && <Wallet size={14} />}
              {id === 'ledger' && <FileSpreadsheet size={14} />}
              {id === 'categories' && <Layers size={14} />}
              {id === 'sessions' && <LockKeyhole size={14} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: TODAY'S REGISTER (CASHBOOK ONLY, NO QUICK CASH IN/OUT CARD) */}
      {activeTab === 'register' && (
        <div className="zk-cb-main-card">
          {drawer && (
            <div className="zk-pay-strip">
              {['Cash', 'Card', 'Bank Transfer', 'Koko'].map(method => {
                const found = payment_breakdown.find(p => p.method === method);
                return (
                  <div className="zk-pay-pill" key={method}>
                    <small>{method}</small>
                    <strong>{money(found?.total || 0)}</strong>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      {found?.count || 0} txns
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="zk-cb-section-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '14px' }}>Shift Cash Movements</strong>
              <Badge tone={drawer ? 'green' : 'amber'}>
                {drawer ? `${movements.length} Entries` : 'Closed'}
              </Badge>
            </div>
            <FilterTabs
              choices={[
                ['all', 'All'],
                ['in', 'Cash In'],
                ['out', 'Cash Out'],
                ['sales', 'Sales'],
              ]}
              value={shiftFilter}
              onChange={setShiftFilter}
            />
          </div>

          <Table
            rows={movementsWithBalance}
            empty="No cash movements recorded in this shift yet."
            columns={[
              ['Time', r => timeLabel(r.created_at)],
              [
                'Category / Type',
                r => (
                  <Badge tone={r.amount < 0 ? 'red' : 'green'}>
                    {r.kind || (r.amount < 0 ? 'Cash Out' : 'Cash In')}
                  </Badge>
                ),
              ],
              ['Operator', r => r.operator_name || 'Staff'],
              ['Reference', r => r.reference || '—'],
              [
                'Amount',
                r => (
                  <strong className={r.amount < 0 ? 'text-red' : 'text-green'}>
                    {r.amount < 0 ? `− ${money(Math.abs(r.amount))}` : `+ ${money(r.amount)}`}
                  </strong>
                ),
              ],
              [
                'Balance',
                r => (
                  <span style={{ fontWeight: 700, color: '#334155' }}>
                    {money(r.running_balance)}
                  </span>
                ),
              ],
            ]}
          />
        </div>
      )}

      {/* TAB 2: CASHBOOK LEDGER */}
      {activeTab === 'ledger' && (
        <div className="zk-cb-main-card">
          <div className="zk-cb-filter-bar">
            <FilterTabs
              choices={[
                ['all', 'All Time'],
                ['today', 'Today'],
                ['yesterday', 'Yesterday'],
                ['7days', 'Last 7 Days'],
                ['month', 'This Month'],
              ]}
              value={datePreset}
              onChange={applyDatePreset}
            />

            <div className="zk-cb-date-inputs">
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => {
                  setDatePreset('custom');
                  setFromDate(e.target.value);
                }}
              />
              <span>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={e => {
                  setDatePreset('custom');
                  setToDate(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="zk-cb-filter-bar" style={{ background: '#ffffff' }}>
            <div style={{ flex: '1 1 240px' }}>
              <SearchBox
                value={ledgerSearch}
                onChange={setLedgerSearch}
                placeholder="Search category, invoice, branch, operator or reference..."
              />
            </div>
            <div style={{ minWidth: '185px' }}>
              <Select
                aria-label="Filter Movement Type"
                value={ledgerFilter}
                options={[
                  ['all', 'All Movements'],
                  ['in', 'Inflows (Cash In)'],
                  ['out', 'Outflows (Cash Out)'],
                  ['sales', 'Sales Cash Only'],
                  ['expenses', 'Expenses Only'],
                ]}
                onChange={e => setLedgerFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="zk-cb-ledger-metrics">
            <div className="zk-cb-ledger-card in">
              <small style={{ color: '#166534' }}>
                TOTAL INFLOW ({filteredLedger.filter(x => x.amount > 0).length} entries)
              </small>
              <strong style={{ color: '#15803d' }}>+ {money(ledgerIn)}</strong>
            </div>
            <div className="zk-cb-ledger-card out">
              <small style={{ color: '#991b1b' }}>
                TOTAL OUTFLOW ({filteredLedger.filter(x => x.amount < 0).length} entries)
              </small>
              <strong style={{ color: '#dc2626' }}>− {money(ledgerOut)}</strong>
            </div>
            <div className="zk-cb-ledger-card">
              <small>NET CASH FLOW</small>
              <strong style={{ color: ledgerNet >= 0 ? '#15803d' : '#dc2626' }}>
                {money(ledgerNet)}
              </strong>
            </div>
          </div>

          <Table
            rows={filteredLedger}
            columns={[
              ['Date & Time', r => timeLabel(r.created_at)],
              ['Branch', r => r.branch_name || currentBranchName],
              [
                'Category / Kind',
                r => <Badge tone={r.amount < 0 ? 'red' : 'green'}>{r.kind}</Badge>,
              ],
              ['Operator', r => r.operator_name || 'Staff'],
              ['Reference', r => r.reference || '—'],
              [
                'Inflow',
                r =>
                  r.amount > 0 ? (
                    <strong className="text-green">+ {money(r.amount)}</strong>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  ),
              ],
              [
                'Outflow',
                r =>
                  r.amount < 0 ? (
                    <strong className="text-red">− {money(Math.abs(r.amount))}</strong>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  ),
              ],
            ]}
          />
        </div>
      )}

      {/* TAB 3: EXPENSE CATEGORIES */}
      {activeTab === 'categories' && (
        <div className="zk-cb-main-card">
          {categories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
              No categorized cashbook transactions found yet.
            </div>
          ) : (
            <div className="zk-cb-cat-grid">
              {categories.map((c, idx) => {
                const isNeg = c.total < 0;
                const pct = Math.min(100, Math.round((Math.abs(c.total) / maxCatVal) * 100));
                return (
                  <div
                    key={idx}
                    className="zk-cb-cat-card"
                    style={{ background: isNeg ? '#fffafa' : '#f8fdfb' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{c.name}</strong>
                      <Badge tone={isNeg ? 'red' : 'green'}>{c.count} entries</Badge>
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 800,
                        marginTop: '8px',
                        color: isNeg ? '#dc2626' : '#15803d',
                      }}
                    >
                      {isNeg ? `− ${money(Math.abs(c.total))}` : `+ ${money(c.total)}`}
                    </div>
                    <div
                      style={{
                        height: '6px',
                        background: '#e2e8f0',
                        borderRadius: '4px',
                        marginTop: '10px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: isNeg ? '#ef4444' : '#10b981',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLOSED SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="zk-cb-main-card">
          {canManage(ctx) && ctx.branch > 0 && (
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                icon={LockKeyhole}
                onClick={() =>
                  ctx.setDialog({
                    title: 'Close Business Day Cycle',
                    description: 'Seal all drawer accounts and lock the financial business date.',
                    route: 'cycle.close',
                    values: { business_date: today() },
                    fields: [{ name: 'business_date', label: 'Business Date', type: 'date' }],
                    submit: 'Close Day',
                    onSuccess: () => {
                      ctx.setNotice('Business cycle closed successfully.');
                      onRefresh?.();
                    },
                  })
                }
              >
                Close Business Day
              </Button>
            </div>
          )}

          <Table
            rows={history}
            columns={[
              ['Business Date', r => dateLabel(r.business_date)],
              ['Branch', r => r.branch_name || currentBranchName],
              ['Operator', 'operator'],
              ['Opening Float', r => money(r.opening)],
              ['Expected Cash', r => money(r.expected)],
              ['Counted Cash', r => money(r.counted)],
              [
                'Variance',
                r => {
                  const diff = (r.counted || 0) - (r.expected || 0);
                  if (diff === 0) return <Badge tone="green">Balanced (0.00)</Badge>;
                  return (
                    <strong className={diff > 0 ? 'text-green' : 'text-red'}>
                      {diff > 0 ? `+ ${money(diff)}` : `− ${money(Math.abs(diff))}`}
                    </strong>
                  );
                },
              ],
              ['Notes', r => r.notes || '—'],
              [
                'Inspect',
                r => (
                  <Button
                    variant="outline"
                    onClick={() => setSessionModal(r)}
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.82rem' }}
                  >
                    View Shift
                  </Button>
                ),
              ],
            ]}
          />
        </div>
      )}

      {/* CLOSED SESSION INSPECT MODAL */}
      {sessionModal && (
        <Modal
          title={`Closed Shift: ${dateLabel(sessionModal.business_date)}`}
          description={`${sessionModal.branch_name || currentBranchName} · Cashier: ${sessionModal.operator || 'Staff'}`}
          onClose={() => setSessionModal(null)}
          wide={true}
        >
          <div className="modal-body" style={{ display: 'grid', gap: '12px' }}>
            <div className="zk-recon-summary">
              <div className="zk-recon-box">
                <small>Opening Float</small>
                <strong>{money(sessionModal.opening)}</strong>
              </div>
              <div className="zk-recon-box">
                <small>System Expected</small>
                <strong>{money(sessionModal.expected)}</strong>
              </div>
              <div className="zk-recon-box" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
                <small style={{ color: '#0f766e' }}>Actual Counted</small>
                <strong style={{ color: '#0d9488' }}>{money(sessionModal.counted)}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>Reconciliation Variance</span>
              <strong style={{ color: (sessionModal.counted || 0) - (sessionModal.expected || 0) === 0 ? '#15803d' : '#dc2626' }}>
                {money((sessionModal.counted || 0) - (sessionModal.expected || 0))}
              </strong>
            </div>
            {sessionModal.notes && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a', fontSize: '0.88rem' }}>
                <strong>Closing Notes:</strong> {sessionModal.notes}
              </div>
            )}
            <Table
              rows={ledger.filter(m => Number(m.drawer_id) === Number(sessionModal.id))}
              empty="No individual movements linked to this shift."
              columns={[
                ['Time', m => timeLabel(m.created_at)],
                ['Category', 'kind'],
                ['Reference', m => m.reference || '—'],
                [
                  'Amount',
                  m => (
                    <strong className={m.amount < 0 ? 'text-red' : 'text-green'}>
                      {m.amount < 0 ? `− ${money(Math.abs(m.amount))}` : `+ ${money(m.amount)}`}
                    </strong>
                  ),
                ],
              ]}
            />
          </div>
          <div className="modal-footer">
            <Button variant="outline" onClick={() => setSessionModal(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* RECONCILE & CLOSE DRAWER MODAL */}
      {closeModalDrawer && (
        <CloseReconcileModal
          ctx={ctx}
          drawer={closeModalDrawer}
          onClose={() => setCloseModalDrawer(null)}
          onSuccess={onRefresh}
        />
      )}

      {/* PRINT DAILY CASHBOOK MODAL */}
      {printModalOpen && (
        <Modal
          title="Daily Cashbook Statement"
          description={`Branch: ${currentBranchName} · Business Date: ${dateLabel(today())}`}
          onClose={() => setPrintModalOpen(false)}
          wide={true}
        >
          <div style={{ padding: '0.5rem' }}>
            <div
              id="printable-cashbook-area"
              style={{
                padding: '1.5rem',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                color: '#0f172a',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '2px solid #0f172a',
                  paddingBottom: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>ZEEDAT ERP — CASHBOOK STATEMENT</h2>
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: '#64748b' }}>
                  Branch: <strong>{currentBranchName}</strong> | Date: <strong>{dateLabel(today())}</strong>
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                  Printed on {new Date().toLocaleString()} by {ctx.user?.name}
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ border: '1px solid #cbd5e1', padding: '0.5rem' }}>
                  <small style={{ color: '#64748b' }}>OPENING FLOAT</small>
                  <div style={{ fontWeight: 700 }}>{money(drawer?.opening || 0)}</div>
                </div>
                <div style={{ border: '1px solid #cbd5e1', padding: '0.5rem' }}>
                  <small style={{ color: '#15803d' }}>TOTAL INFLOWS</small>
                  <div style={{ fontWeight: 700, color: '#15803d' }}>+{money(inflow)}</div>
                </div>
                <div style={{ border: '1px solid #cbd5e1', padding: '0.5rem' }}>
                  <small style={{ color: '#dc2626' }}>TOTAL EXPENSES</small>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>−{money(-outflow)}</div>
                </div>
                <div style={{ border: '1px solid #cbd5e1', padding: '0.5rem' }}>
                  <small style={{ color: '#0f172a' }}>CLOSING BALANCE</small>
                  <div style={{ fontWeight: 700 }}>
                    {money(drawer?.expected || (drawer?.opening || 0) + inflow + outflow)}
                  </div>
                </div>
              </div>

              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.85rem',
                  marginBottom: '1.5rem',
                }}
              >
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Type / Category</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description / Ref</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Operator</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Inflow (LKR)</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Outflow (LKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>
                        No cash movements recorded in current shift.
                      </td>
                    </tr>
                  ) : (
                    movements.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.4rem' }}>{timeLabel(m.created_at)}</td>
                        <td style={{ padding: '0.4rem' }}>{m.kind}</td>
                        <td style={{ padding: '0.4rem' }}>{m.reference}</td>
                        <td style={{ padding: '0.4rem' }}>{m.operator_name || 'Cashier'}</td>
                        <td style={{ padding: '0.4rem', textAlign: 'right', color: '#15803d' }}>
                          {m.amount > 0 ? money(m.amount) : '—'}
                        </td>
                        <td style={{ padding: '0.4rem', textAlign: 'right', color: '#dc2626' }}>
                          {m.amount < 0 ? money(Math.abs(m.amount)) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '2.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px dashed #cbd5e1',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '180px', borderBottom: '1px solid #94a3b8', marginBottom: '0.25rem' }} />
                  <small>Cashier Signature</small>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '180px', borderBottom: '1px solid #94a3b8', marginBottom: '0.25rem' }} />
                  <small>Manager / Owner Signature</small>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" onClick={() => setPrintModalOpen(false)}>
                Close
              </Button>
              <Button
                icon={Printer}
                variant="primary"
                onClick={() => {
                  const el = document.getElementById('printable-cashbook-area');
                  if (!el) return;
                  printHtmlDocument(
                    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Cashbook Statement</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:18px;color:#0f172a}table{width:100%;border-collapse:collapse}th,td{padding:6px;border-bottom:1px solid #e2e8f0;font-size:12px}</style></head><body>${el.innerHTML}</body></html>`
                  );
                }}
              >
                Print Statement
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function CashRegisterModal({ ctx, registerData, onClose, onRefresh, defaultTab = 'register' }) {
  return (
    <Modal
      title="Cashbook & Register"
      description="Shift reconciliation, Cash In / Cash Out vouchers, and cashbook audit trail."
      onClose={onClose}
      xl={true}
    >
      <div className="modal-body">
        <CashbookWorkspace
          ctx={ctx}
          registerData={registerData}
          onRefresh={onRefresh}
          defaultTab={defaultTab}
        />
      </div>
    </Modal>
  );
}

export function CashRegister({ ctx }) {
  const state = useData(ctx, { register: 'drawer' });
  return (
    <DataView state={state}>
      {({ register }) => (
        <div className="zk-dashboard-wrap">
          <Heading
            title="Cashbook & Register"
            description="Daily cash journal, shift reconciliation, payment breakdown & denomination counter."
          />
          <CashbookWorkspace ctx={ctx} registerData={register} onRefresh={state.refresh} />
        </div>
      )}
    </DataView>
  );
}
