import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Layers,
  LockKeyhole,
  Plus,
  Printer,
  RefreshCw,
  Tag,
  TrendingDown,
  TrendingUp,
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

const LKR_DENOMS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

const calcDenomCents = (denoms, coinsAmount) => {
  let sumRupees = 0;
  for (const note of LKR_DENOMS) {
    const count = parseInt(denoms[note] || '0', 10);
    if (count > 0) sumRupees += note * count;
  }
  const coins = parseFloat(coinsAmount || '0');
  if (coins > 0) sumRupees += coins;
  return Math.round(sumRupees * 100);
};

const formatDenomNote = (denoms, coinsAmount) => {
  const parts = LKR_DENOMS.filter(n => parseInt(denoms[n] || '0', 10) > 0).map(
    n => `${n}x${parseInt(denoms[n], 10)}`
  );
  if (Number(coinsAmount) > 0) parts.push(`Coins:${Number(coinsAmount).toFixed(2)}`);
  return parts.length ? `Notes: ${parts.join(', ')}` : '';
};

function LkrDenomCounter({ denoms, coinsAmount, onChangeDenom, onChangeCoins, onClear }) {
  return (
    <>
      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '13px', color: '#0f172a' }}>
          LKR Note &amp; Coin Counter (Cash Breakdown)
        </strong>
        <button type="button" className="zk-edit-btn" onClick={onClear}>
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
                onChange={e => onChangeDenom(note, e.target.value)}
              />
              <span className="zk-denom-sub">{(note * qty).toLocaleString()}</span>
            </div>
          );
        })}
        <div className="zk-denom-row">
          <span className="zk-denom-note">Extra Coins (LKR)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            className="zk-denom-input"
            style={{ width: '100%', textAlign: 'right' }}
            placeholder="0.00"
            value={coinsAmount}
            onChange={e => onChangeCoins(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

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

export function OpenRegisterModal({ ctx, onClose, onSuccess }) {
  const [denoms, setDenoms] = useState({});
  const [coinsAmount, setCoinsAmount] = useState('');
  const [manualOpening, setManualOpening] = useState('0');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const denomTotalCents = useMemo(() => calcDenomCents(denoms, coinsAmount), [denoms, coinsAmount]);
  const hasDenomInputs =
    Object.values(denoms).some(v => Number(v) > 0) || Number(coinsAmount) > 0;
  const effectiveOpeningCents = hasDenomInputs ? denomTotalCents : cents(manualOpening || 0);

  const handleDenomChange = (note, val) => {
    setDenoms(prev => ({ ...prev, [note]: val.replace(/[^0-9]/g, '') }));
  };

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const denomNote = hasDenomInputs ? formatDenomNote(denoms, coinsAmount) : '';
      const combinedNotes = [notes.trim(), denomNote].filter(Boolean).join(' | ');
      await ctx.mutate('drawer.open', {
        opening: effectiveOpeningCents,
        notes: combinedNotes,
      });
      ctx.setNotice(`Cash register opened with ${money(effectiveOpeningCents)}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to open cash register.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Open Cash Register"
      description="Count opening LKR notes & coins or enter starting float to begin today’s shift."
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

          <div className="zk-recon-summary" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="zk-recon-box" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
              <small style={{ color: '#0f766e' }}>Opening Cash Float</small>
              <strong style={{ color: '#0d9488' }}>{money(effectiveOpeningCents)}</strong>
            </div>
            <div className="zk-recon-box">
              <small>Input Mode</small>
              <strong>{hasDenomInputs ? 'Note & Coin Counter' : 'Manual Float Amount'}</strong>
            </div>
          </div>

          <LkrDenomCounter
            denoms={denoms}
            coinsAmount={coinsAmount}
            onChangeDenom={handleDenomChange}
            onChangeCoins={setCoinsAmount}
            onClear={() => {
              setDenoms({});
              setCoinsAmount('');
            }}
          />

          {!hasDenomInputs && (
            <div className="zk-field-wrap" style={{ marginBottom: '12px' }}>
              <label className="zk-field-label">Or Enter Opening Float Manually (LKR)</label>
              <div className="zk-input-box">
                <span style={{ fontWeight: 700, color: '#475569' }}>LKR</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualOpening}
                  onChange={e => setManualOpening(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="zk-field-wrap">
            <label className="zk-field-label">Opening Notes (Optional)</label>
            <div className="zk-textarea-box">
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Shift handover notes or drawer remarks..."
              />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={Plus} variant="primary" disabled={busy}>
            {busy ? 'Opening...' : 'Open Register'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CloseReconcileModal({ ctx, drawer, paymentBreakdown = [], onClose, onSuccess }) {
  const [denoms, setDenoms] = useState({});
  const [coinsAmount, setCoinsAmount] = useState('');
  const [manualCounted, setManualCounted] = useState(String(rupees(drawer?.expected || 0)));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const denomTotalCents = useMemo(() => calcDenomCents(denoms, coinsAmount), [denoms, coinsAmount]);

  const hasDenomInputs =
    Object.values(denoms).some(v => Number(v) > 0) || Number(coinsAmount) > 0;
  const effectiveCountedCents = hasDenomInputs ? denomTotalCents : cents(manualCounted || 0);
  const expectedCents = drawer?.expected || 0;
  const diff = effectiveCountedCents - expectedCents;

  const tenderTotals = useMemo(() => {
    const map = { Cash: { total: 0, count: 0 }, Card: { total: 0, count: 0 }, 'Bank Transfer': { total: 0, count: 0 }, Koko: { total: 0, count: 0 } };
    for (const p of paymentBreakdown || []) {
      const m = p.method;
      if (!map[m]) map[m] = { total: 0, count: 0 };
      map[m].total += Number(p.total || 0);
      map[m].count += Number(p.count || 0);
    }
    return map;
  }, [paymentBreakdown]);

  const handleDenomChange = (note, val) => {
    setDenoms(prev => ({ ...prev, [note]: val.replace(/[^0-9]/g, '') }));
  };

  const submit = async e => {
    e.preventDefault();
    if (!drawer) return;
    setBusy(true);
    setError('');
    try {
      const denomNote = hasDenomInputs ? formatDenomNote(denoms, coinsAmount) : '';
      const combinedNotes = [notes.trim(), denomNote].filter(Boolean).join(' | ');
      const res = await ctx.mutate('drawer.close', {
        counted: effectiveCountedCents,
        notes: combinedNotes,
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

          <div className="zk-close-tenders-grid">
            <div className="zk-close-tender-card cash">
              <small>Cash in Drawer (Expected)</small>
              <strong>{money(expectedCents)}</strong>
              <span>Cash Sales: {money(tenderTotals.Cash.total)} ({tenderTotals.Cash.count})</span>
            </div>
            <div className="zk-close-tender-card card">
              <small>Card Payments</small>
              <strong>{money(tenderTotals.Card.total)}</strong>
              <span>{tenderTotals.Card.count} transaction(s)</span>
            </div>
            <div className="zk-close-tender-card bank">
              <small>Bank Transfer</small>
              <strong>{money(tenderTotals['Bank Transfer'].total)}</strong>
              <span>{tenderTotals['Bank Transfer'].count} transaction(s)</span>
            </div>
            <div className="zk-close-tender-card koko">
              <small>Koko Payments</small>
              <strong>{money(tenderTotals.Koko.total)}</strong>
              <span>{tenderTotals.Koko.count} transaction(s)</span>
            </div>
          </div>

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

          <LkrDenomCounter
            denoms={denoms}
            coinsAmount={coinsAmount}
            onChangeDenom={handleDenomChange}
            onChangeCoins={setCoinsAmount}
            onClear={() => {
              setDenoms({});
              setCoinsAmount('');
            }}
          />

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
  const [shiftSearch, setShiftSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);
  const [catFilter, setCatFilter] = useState('all');
  const [shiftAuditFilter, setShiftAuditFilter] = useState('all');
  const [shiftAuditSearch, setShiftAuditSearch] = useState('');
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [sessionModal, setSessionModal] = useState(null);
  const [closeModalDrawer, setCloseModalDrawer] = useState(null);
  const [openModalVisible, setOpenModalVisible] = useState(false);

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
  const totalOutflowAbs = Math.abs(outflow);
  const current = drawer?.business_date === today();
  const currentBranchName = ctx.branches.find(b => b.id === ctx.branch)?.name || 'All Branches';
  const totalTenderCollected = useMemo(
    () => payment_breakdown.reduce((sum, p) => sum + Number(p.total || 0), 0),
    [payment_breakdown]
  );

  const movementsWithBalance = useMemo(() => {
    const asc = [...movements].reverse();
    let runBal = drawer?.opening || 0;
    const mapped = asc.map(m => {
      runBal += m.amount;
      return { ...m, running_balance: runBal };
    });
    const q = shiftSearch.trim().toLowerCase();
    return mapped.reverse().filter(m => {
      const kindLow = String(m.kind || '').toLowerCase();
      if (shiftFilter === 'in' && m.amount <= 0) return false;
      if (shiftFilter === 'out' && m.amount >= 0) return false;
      if (shiftFilter === 'sales' && !kindLow.includes('sale')) return false;
      if (shiftFilter === 'repairs' && !kindLow.includes('repair')) return false;
      if (q) {
        const hit =
          kindLow.includes(q) ||
          String(m.reference || '').toLowerCase().includes(q) ||
          String(m.operator_name || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [movements, drawer?.opening, shiftFilter, shiftSearch]);

  const filteredLedger = useMemo(() => {
    const asc = [...ledger].reverse();
    let runBal = 0;
    const withBalance = asc.map(item => {
      runBal += Number(item.amount || 0);
      return { ...item, running_balance: runBal };
    });
    return withBalance.reverse().filter(item => {
      const kindLow = String(item.kind || '').toLowerCase();
      const refLow = String(item.reference || '').toLowerCase();
      if (ledgerFilter === 'in' && item.amount <= 0) return false;
      if (ledgerFilter === 'out' && item.amount >= 0) return false;
      if (ledgerFilter === 'sales' && !kindLow.includes('sale') && !refLow.includes('inv-')) {
        return false;
      }
      if (ledgerFilter === 'repairs' && !kindLow.includes('repair') && !refLow.includes('rj-')) {
        return false;
      }
      if (
        ledgerFilter === 'expenses' &&
        (item.amount >= 0 || kindLow.includes('return') || kindLow.includes('supplier'))
      ) {
        return false;
      }
      if (ledgerFilter === 'suppliers' && !kindLow.includes('supplier')) {
        return false;
      }
      if (ledgerFilter === 'refunds' && !kindLow.includes('refund') && !kindLow.includes('return')) {
        return false;
      }
      const itemDate = (item.created_at || '').substring(0, 10);
      if (fromDate && itemDate < fromDate) return false;
      if (toDate && itemDate > toDate) return false;
      if (ledgerSearch) {
        const q = ledgerSearch.toLowerCase();
        const hit =
          kindLow.includes(q) ||
          refLow.includes(q) ||
          String(item.operator_name || '').toLowerCase().includes(q) ||
          String(item.branch_name || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [ledger, ledgerFilter, fromDate, toDate, ledgerSearch]);

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerFilter, fromDate, toDate, ledgerSearch, ledgerPageSize]);

  const ledgerTotalPages = Math.max(1, Math.ceil(filteredLedger.length / ledgerPageSize));
  const pagedLedger = useMemo(() => {
    const start = (ledgerPage - 1) * ledgerPageSize;
    return filteredLedger.slice(start, start + ledgerPageSize);
  }, [filteredLedger, ledgerPage, ledgerPageSize]);

  const ledgerIn = useMemo(
    () => filteredLedger.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0),
    [filteredLedger]
  );
  const ledgerOut = useMemo(
    () => filteredLedger.reduce((sum, item) => sum + (item.amount < 0 ? Math.abs(item.amount) : 0), 0),
    [filteredLedger]
  );
  const ledgerNet = ledgerIn - ledgerOut;

  const totalCatInflow = useMemo(
    () => categories.reduce((sum, c) => sum + (c.total > 0 ? c.total : 0), 0),
    [categories]
  );
  const totalCatOutflow = useMemo(
    () => categories.reduce((sum, c) => sum + (c.total < 0 ? Math.abs(c.total) : 0), 0),
    [categories]
  );
  const filteredCategories = useMemo(() => {
    const list = categories.filter(c => {
      if (catFilter === 'in' && c.total <= 0) return false;
      if (catFilter === 'out' && c.total >= 0) return false;
      return true;
    });
    return [...list].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [categories, catFilter]);
  const maxCatVal = Math.max(1, ...categories.map(c => Math.abs(c.total)));

  const shiftAuditStats = useMemo(() => {
    const total = history.length;
    const balanced = history.filter(h => (h.counted || 0) - (h.expected || 0) === 0).length;
    const totalCounted = history.reduce((sum, h) => sum + Number(h.counted || 0), 0);
    const netVariance = history.reduce(
      (sum, h) => sum + ((h.counted || 0) - (h.expected || 0)),
      0
    );
    return { total, balanced, totalCounted, netVariance };
  }, [history]);

  const filteredHistory = useMemo(() => {
    const q = shiftAuditSearch.trim().toLowerCase();
    return history.filter(h => {
      const diff = (h.counted || 0) - (h.expected || 0);
      if (shiftAuditFilter === 'balanced' && diff !== 0) return false;
      if (shiftAuditFilter === 'variance' && diff === 0) return false;
      if (q) {
        const hit =
          String(h.operator || '').toLowerCase().includes(q) ||
          String(h.branch_name || '').toLowerCase().includes(q) ||
          String(h.notes || '').toLowerCase().includes(q) ||
          String(h.business_date || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [history, shiftAuditFilter, shiftAuditSearch]);

  const openDrawerModal = () => {
    if (!ctx.branch) {
      ctx.setNotice('Please select a specific branch from the top bar before opening a cash drawer.');
      return;
    }
    setOpenModalVisible(true);
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

      {/* TAB 1: TODAY'S REGISTER (STANDARD CASHBOOK RECONCILIATION & DOUBLE-COLUMN JOURNAL) */}
      {activeTab === 'register' && (
        <div className="zk-cb-main-card">
          {/* Standard Accounting Reconciliation Equation Strip */}
          <div className="zk-cb-equation-bar">
            <div className="zk-cb-eq-cell">
              <small>Opening Float (B/F)</small>
              <strong>{money(drawer?.opening || 0)}</strong>
            </div>
            <span className="zk-cb-eq-op">+</span>
            <div className="zk-cb-eq-cell in">
              <small>Receipts / Cash In (Dr)</small>
              <strong>{money(inflow)}</strong>
            </div>
            <span className="zk-cb-eq-op">−</span>
            <div className="zk-cb-eq-cell out">
              <small>Payments / Cash Out (Cr)</small>
              <strong>{money(totalOutflowAbs)}</strong>
            </div>
            <span className="zk-cb-eq-op">=</span>
            <div className="zk-cb-eq-cell closing">
              <small>Expected Drawer (C/F)</small>
              <strong>{money(drawer ? drawer.expected : 0)}</strong>
            </div>
          </div>

          {/* Payment Tender Summary Strip */}
          {drawer && (
            <div className="zk-pay-strip">
              {['Cash', 'Card', 'Bank Transfer', 'Koko'].map(method => {
                const found = payment_breakdown.find(p => p.method === method);
                const val = Number(found?.total || 0);
                const pct = totalTenderCollected > 0 ? Math.round((val / totalTenderCollected) * 100) : 0;
                return (
                  <div className="zk-pay-pill" key={method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <small>{method}</small>
                      <span className="zk-cb-pct-chip">{pct}%</span>
                    </div>
                    <strong>{money(val)}</strong>
                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      {found?.count || 0} transactions
                    </span>
                  </div>
                );
              })}
              <div className="zk-pay-pill total">
                <small>Total Collections</small>
                <strong>{money(totalTenderCollected)}</strong>
                <span style={{ fontSize: '10.5px', color: '#0f766e' }}>
                  All payment methods
                </span>
              </div>
            </div>
          )}

          <div className="zk-cb-section-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>Shift Cashbook Journal</strong>
              <Badge tone={drawer ? 'green' : 'amber'}>
                {drawer ? `${movementsWithBalance.length} / ${movements.length} Entries` : 'Register Closed'}
              </Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '210px' }}>
                <SearchBox
                  value={shiftSearch}
                  onChange={setShiftSearch}
                  placeholder="Search voucher, category, operator..."
                />
              </div>
              <FilterTabs
                choices={[
                  ['all', 'All'],
                  ['in', 'Cash In (Dr)'],
                  ['out', 'Cash Out (Cr)'],
                  ['sales', 'Sales'],
                  ['repairs', 'Repairs'],
                ]}
                value={shiftFilter}
                onChange={setShiftFilter}
              />
            </div>
          </div>

          <Table
            rows={movementsWithBalance}
            empty="No cash movements recorded in this shift yet."
            columns={[
              ['Voucher #', r => <span className="mono subtext">#{String(r.id).padStart(4, '0')}</span>],
              ['Time', r => timeLabel(r.created_at)],
              [
                'Account / Category',
                r => (
                  <Badge tone={r.amount < 0 ? 'red' : 'green'}>
                    {r.kind || (r.amount < 0 ? 'Cash Out' : 'Cash In')}
                  </Badge>
                ),
              ],
              ['Particulars / Ref', r => r.reference || '—'],
              ['Cashier', r => r.operator_name || 'Staff'],
              [
                'Cash In (Dr)',
                r =>
                  r.amount > 0 ? (
                    <strong className="text-green mono">+ {money(r.amount)}</strong>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  ),
              ],
              [
                'Cash Out (Cr)',
                r =>
                  r.amount < 0 ? (
                    <strong className="text-red mono">− {money(Math.abs(r.amount))}</strong>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  ),
              ],
              [
                'Running Balance',
                r => (
                  <strong className="mono" style={{ color: '#0f172a' }}>
                    {money(r.running_balance)}
                  </strong>
                ),
              ],
            ]}
          />

          {drawer && (
            <div className="zk-cb-table-footer">
              <span>Shift Closing Summary:</span>
              <div className="zk-cb-footer-totals">
                <span className="text-green">Total In (Dr): <strong>+ {money(inflow)}</strong></span>
                <span className="text-red">Total Out (Cr): <strong>− {money(totalOutflowAbs)}</strong></span>
                <span style={{ color: '#0f766e' }}>Closing Drawer: <strong>{money(drawer.expected)}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STANDARD DOUBLE-COLUMN CASHBOOK LEDGER */}
      {activeTab === 'ledger' && (
        <div className="zk-cb-main-card">
          <div className="zk-cb-section-head">
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>General Cashbook Ledger</strong>
              <small className="subtext" style={{ display: 'block' }}>
                Double-column cash receipts (Dr) &amp; payments (Cr) ledger across {currentBranchName}
              </small>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button icon={Download} variant="outline" onClick={() => exportCsv(filteredLedger)}>
                Export CSV ({filteredLedger.length})
              </Button>
              <Button icon={Printer} variant="outline" onClick={() => setPrintModalOpen(true)}>
                Print Statement
              </Button>
            </div>
          </div>

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
            <div style={{ flex: '1 1 260px' }}>
              <SearchBox
                value={ledgerSearch}
                onChange={setLedgerSearch}
                placeholder="Search account, voucher #, invoice, branch, operator or particulars..."
              />
            </div>
            <div style={{ minWidth: '210px' }}>
              <Select
                aria-label="Filter Movement Type"
                value={ledgerFilter}
                options={[
                  ['all', 'All Ledger Entries'],
                  ['in', 'Receipts Only (Cash In / Dr)'],
                  ['out', 'Payments Only (Cash Out / Cr)'],
                  ['sales', 'POS Cash Sales'],
                  ['repairs', 'Repair Cash Revenue'],
                  ['expenses', 'Operating Expenses'],
                  ['suppliers', 'Supplier Cash Payments'],
                  ['refunds', 'Customer Refunds'],
                ]}
                onChange={e => setLedgerFilter(e.target.value)}
              />
            </div>
            {(ledgerSearch || ledgerFilter !== 'all' || fromDate || toDate) && (
              <Button
                variant="outline"
                onClick={() => {
                  setLedgerSearch('');
                  setLedgerFilter('all');
                  applyDatePreset('all');
                }}
              >
                Reset
              </Button>
            )}
          </div>

          <div className="zk-cb-ledger-metrics four">
            <div className="zk-cb-ledger-card">
              <small>LEDGER ENTRIES</small>
              <strong>{filteredLedger.length}</strong>
            </div>
            <div className="zk-cb-ledger-card in">
              <small style={{ color: '#166534' }}>
                TOTAL RECEIPTS / DR ({filteredLedger.filter(x => x.amount > 0).length})
              </small>
              <strong style={{ color: '#15803d' }}>+ {money(ledgerIn)}</strong>
            </div>
            <div className="zk-cb-ledger-card out">
              <small style={{ color: '#991b1b' }}>
                TOTAL PAYMENTS / CR ({filteredLedger.filter(x => x.amount < 0).length})
              </small>
              <strong style={{ color: '#dc2626' }}>− {money(ledgerOut)}</strong>
            </div>
            <div className="zk-cb-ledger-card net">
              <small>NET CASH FLOW (C/F)</small>
              <strong style={{ color: ledgerNet >= 0 ? '#0f766e' : '#dc2626' }}>
                {money(ledgerNet)}
              </strong>
            </div>
          </div>

          <Table
            rows={pagedLedger}
            empty="No cashbook ledger entries match your current filters."
            columns={[
              ['Voucher', r => <span className="mono subtext">#{String(r.id).padStart(4, '0')}</span>],
              ['Date & Time', r => timeLabel(r.created_at)],
              ['Branch', r => r.branch_name || currentBranchName],
              [
                'Account / Category',
                r => <Badge tone={r.amount < 0 ? 'red' : 'green'}>{r.kind}</Badge>,
              ],
              ['Particulars / Ref', r => r.reference || '—'],
              ['Operator', r => r.operator_name || 'Staff'],
              [
                'Receipts (Dr)',
                r =>
                  r.amount > 0 ? (
                    <strong className="text-green mono">+ {money(r.amount)}</strong>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  ),
              ],
              [
                'Payments (Cr)',
                r =>
                  r.amount < 0 ? (
                    <strong className="text-red mono">− {money(Math.abs(r.amount))}</strong>
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  ),
              ],
              [
                'Balance',
                r => (
                  <strong className="mono" style={{ color: '#334155' }}>
                    {money(r.running_balance)}
                  </strong>
                ),
              ],
            ]}
          />

          <div className="zk-pagination-bar">
            <div className="zk-pagination-info">
              <span>
                Showing{' '}
                <strong>
                  {filteredLedger.length ? (ledgerPage - 1) * ledgerPageSize + 1 : 0}–
                  {Math.min(ledgerPage * ledgerPageSize, filteredLedger.length)}
                </strong>{' '}
                of <strong>{filteredLedger.length}</strong> cashbook entries
              </span>
              <select
                aria-label="Rows per page"
                className="zk-page-size-select"
                value={ledgerPageSize}
                onChange={e => setLedgerPageSize(Number(e.target.value))}
              >
                {[25, 50, 100].map(sz => (
                  <option key={sz} value={sz}>
                    {sz} / page
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="outline"
                icon={ChevronLeft}
                disabled={ledgerPage <= 1}
                onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                Page {ledgerPage} of {ledgerTotalPages}
              </span>
              <Button
                variant="outline"
                icon={ChevronRight}
                disabled={ledgerPage >= ledgerTotalPages}
                onClick={() => setLedgerPage(p => Math.min(ledgerTotalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CASHBOOK CATEGORIES & CHART OF ACCOUNTS BREAKDOWN */}
      {activeTab === 'categories' && (
        <div className="zk-cb-main-card">
          <div className="zk-cb-section-head">
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>Cashbook Account Categories</strong>
              <small className="subtext" style={{ display: 'block' }}>
                Click any category card to filter its entries directly in Cashbook Ledger
              </small>
            </div>
            <FilterTabs
              choices={[
                ['all', `All Accounts (${categories.length})`],
                ['in', 'Income / Inflows'],
                ['out', 'Expenses / Outflows'],
              ]}
              value={catFilter}
              onChange={setCatFilter}
            />
          </div>

          <div className="zk-cb-ledger-metrics">
            <div className="zk-cb-ledger-card in">
              <small style={{ color: '#166534' }}>CATEGORIZED INFLOWS (DR)</small>
              <strong style={{ color: '#15803d' }}>+ {money(totalCatInflow)}</strong>
            </div>
            <div className="zk-cb-ledger-card out">
              <small style={{ color: '#991b1b' }}>CATEGORIZED EXPENSES / OUTFLOWS (CR)</small>
              <strong style={{ color: '#dc2626' }}>− {money(totalCatOutflow)}</strong>
            </div>
            <div className="zk-cb-ledger-card net">
              <small>NET ACCOUNT BALANCE</small>
              <strong style={{ color: totalCatInflow - totalCatOutflow >= 0 ? '#0f766e' : '#dc2626' }}>
                {money(totalCatInflow - totalCatOutflow)}
              </strong>
            </div>
          </div>

          {filteredCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
              No categorized cashbook transactions match this filter.
            </div>
          ) : (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: '11.5px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>
                        Category / Account
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700 }}>
                        Type
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                        Txns
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                        Avg / Txn
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, minWidth: '180px' }}>
                        Share &amp; Volume
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                        Total Amount
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                        Ledger
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategories.map((c, idx) => {
                      const isNeg = c.total < 0;
                      const absVal = Math.abs(c.total);
                      const shareBase = isNeg ? Math.max(1, totalCatOutflow) : Math.max(1, totalCatInflow);
                      const sharePct = Math.round((absVal / shareBase) * 100);
                      const barPct = Math.min(100, Math.round((absVal / maxCatVal) * 100));
                      const avg = Math.round(absVal / Math.max(1, c.count));

                      return (
                        <tr
                          key={idx}
                          onClick={() => {
                            setLedgerSearch(c.name);
                            setLedgerFilter('all');
                            setActiveTab('ledger');
                          }}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#f8fafc';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: isNeg ? '#fef2f2' : '#ecfdf5',
                                  color: isNeg ? '#dc2626' : '#15803d',
                                  flexShrink: 0,
                                }}
                              >
                                {isNeg ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                              </span>
                              <strong style={{ color: '#0f172a', fontWeight: 600 }}>{c.name}</strong>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <Badge tone={isNeg ? 'red' : 'green'}>
                              {isNeg ? 'Outflow (Cr)' : 'Inflow (Dr)'}
                            </Badge>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>
                            {c.count}
                          </td>
                          <td className="mono" style={{ padding: '12px 14px', textAlign: 'right', color: '#475569' }}>
                            {money(avg)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: '7px',
                                  background: '#e2e8f0',
                                  borderRadius: '999px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${barPct}%`,
                                    height: '100%',
                                    background: isNeg ? '#ef4444' : '#10b981',
                                    borderRadius: '999px',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', minWidth: '34px', textAlign: 'right' }}>
                                {sharePct}%
                              </span>
                            </div>
                          </td>
                          <td
                            className="mono"
                            style={{
                              padding: '12px 16px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isNeg ? '#dc2626' : '#15803d',
                            }}
                          >
                            {isNeg ? `− ${money(absVal)}` : `+ ${money(absVal)}`}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#0d9488',
                              }}
                            >
                              View <ArrowRight size={13} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLOSED SHIFTS RECONCILIATION AUDIT */}
      {activeTab === 'sessions' && (
        <div className="zk-cb-main-card">
          <div className="zk-cb-section-head">
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>Closed Shifts &amp; Variance Audit</strong>
              <small className="subtext" style={{ display: 'block' }}>
                Historical cash drawer closings, counted cash verification &amp; variance tracking
              </small>
            </div>

            {canManage(ctx) && ctx.branch > 0 && (
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
            )}
          </div>

          <div className="zk-cb-ledger-metrics four">
            <div className="zk-cb-ledger-card">
              <small>CLOSED SHIFTS</small>
              <strong>{shiftAuditStats.total}</strong>
            </div>
            <div className="zk-cb-ledger-card in">
              <small style={{ color: '#166534' }}>BALANCED SHIFTS (0.00 DIFF)</small>
              <strong style={{ color: '#15803d' }}>
                {shiftAuditStats.balanced} / {shiftAuditStats.total}{' '}
                <span style={{ fontSize: '12px', fontWeight: 700 }}>
                  ({shiftAuditStats.total ? Math.round((shiftAuditStats.balanced / shiftAuditStats.total) * 100) : 0}%)
                </span>
              </strong>
            </div>
            <div className="zk-cb-ledger-card net">
              <small>TOTAL CASH COUNTED</small>
              <strong style={{ color: '#0f766e' }}>{money(shiftAuditStats.totalCounted)}</strong>
            </div>
            <div className={`zk-cb-ledger-card ${shiftAuditStats.netVariance < 0 ? 'out' : shiftAuditStats.netVariance === 0 ? 'in' : ''}`}>
              <small>NET CUMULATIVE VARIANCE</small>
              <strong
                style={{
                  color:
                    shiftAuditStats.netVariance === 0
                      ? '#15803d'
                      : shiftAuditStats.netVariance > 0
                        ? '#1d4ed8'
                        : '#dc2626',
                }}
              >
                {shiftAuditStats.netVariance === 0
                  ? 'Balanced (0.00)'
                  : shiftAuditStats.netVariance > 0
                    ? `+ ${money(shiftAuditStats.netVariance)}`
                    : `− ${money(Math.abs(shiftAuditStats.netVariance))}`}
              </strong>
            </div>
          </div>

          <div className="zk-cb-filter-bar">
            <div style={{ flex: '1 1 240px' }}>
              <SearchBox
                value={shiftAuditSearch}
                onChange={setShiftAuditSearch}
                placeholder="Search by cashier, branch, date or variance note..."
              />
            </div>
            <FilterTabs
              choices={[
                ['all', `All Shifts (${history.length})`],
                ['balanced', 'Balanced Only'],
                ['variance', 'With Variance'],
              ]}
              value={shiftAuditFilter}
              onChange={setShiftAuditFilter}
            />
          </div>

          <Table
            rows={filteredHistory}
            empty="No closed register shifts match your filter."
            columns={[
              ['Shift', r => <span className="mono subtext">#{String(r.id).padStart(4, '0')}</span>],
              ['Business Date', r => dateLabel(r.business_date)],
              ['Branch', r => r.branch_name || currentBranchName],
              ['Cashier', 'operator'],
              ['Opening Float', r => <span className="mono">{money(r.opening)}</span>],
              ['Expected', r => <span className="mono">{money(r.expected)}</span>],
              ['Counted', r => <strong className="mono">{money(r.counted)}</strong>],
              [
                'Variance',
                r => {
                  const diff = (r.counted || 0) - (r.expected || 0);
                  if (diff === 0) {
                    return (
                      <Badge tone="green">
                        <CheckCircle2 size={11} /> Balanced
                      </Badge>
                    );
                  }
                  return (
                    <Badge tone={diff > 0 ? 'blue' : 'red'}>
                      <AlertTriangle size={11} />{' '}
                      {diff > 0 ? `+ ${money(diff)}` : `− ${money(Math.abs(diff))}`}
                    </Badge>
                  );
                },
              ],
              ['Notes', r => r.notes || '—'],
              [
                'Actions',
                r => (
                  <Button
                    variant="outline"
                    onClick={() => setSessionModal(r)}
                    style={{ padding: '0.25rem 0.65rem', fontSize: '0.82rem' }}
                  >
                    View Audit
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
                ['Account / Category', 'kind'],
                ['Particulars / Ref', m => m.reference || '—'],
                [
                  'Cash In (Dr)',
                  m => (m.amount > 0 ? <strong className="text-green">+ {money(m.amount)}</strong> : '—'),
                ],
                [
                  'Cash Out (Cr)',
                  m => (m.amount < 0 ? <strong className="text-red">− {money(Math.abs(m.amount))}</strong> : '—'),
                ],
              ]}
            />
          </div>
          <div className="modal-footer">
            <Button
              variant="outline"
              icon={Printer}
              onClick={() => {
                const shiftMovs = ledger.filter(m => Number(m.drawer_id) === Number(sessionModal.id));
                const rowsHtml = shiftMovs.length
                  ? shiftMovs
                      .map(
                        m => `<tr><td>${timeLabel(m.created_at)}</td><td>${m.kind || ''}</td><td>${m.reference || '—'}</td><td style="text-align:right;color:#15803d">${m.amount > 0 ? money(m.amount) : '—'}</td><td style="text-align:right;color:#dc2626">${m.amount < 0 ? money(Math.abs(m.amount)) : '—'}</td></tr>`
                      )
                      .join('')
                  : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:10px;">No movements</td></tr>';
                const diff = (sessionModal.counted || 0) - (sessionModal.expected || 0);
                printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Shift Audit #${sessionModal.id}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:18px;color:#0f172a}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:6px;border-bottom:1px solid #e2e8f0;font-size:12px}th{background:#f8fafc;text-align:left}</style></head><body><h2 style="margin:0;">SHIFT AUDIT REPORT #${String(sessionModal.id).padStart(4, '0')}</h2><p style="margin:4px 0 12px;color:#475569;font-size:12.5px;">${sessionModal.branch_name || currentBranchName} · ${dateLabel(sessionModal.business_date)} · Cashier: ${sessionModal.operator || 'Staff'}</p><p style="font-size:13px;"><strong>Opening:</strong> ${money(sessionModal.opening)} &nbsp;|&nbsp; <strong>Expected:</strong> ${money(sessionModal.expected)} &nbsp;|&nbsp; <strong>Counted:</strong> ${money(sessionModal.counted)} &nbsp;|&nbsp; <strong>Variance:</strong> ${diff === 0 ? 'Balanced (0.00)' : money(diff)}</p><table><thead><tr><th>Time</th><th>Account / Category</th><th>Particulars / Ref</th><th style="text-align:right">Cash In (Dr)</th><th style="text-align:right">Cash Out (Cr)</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`);
              }}
            >
              Print Audit
            </Button>
            <Button variant="outline" onClick={() => setSessionModal(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* OPEN CASH REGISTER MODAL WITH NOTE & COIN COUNTER */}
      {openModalVisible && (
        <OpenRegisterModal
          ctx={ctx}
          onClose={() => setOpenModalVisible(false)}
          onSuccess={onRefresh}
        />
      )}

      {/* RECONCILE & CLOSE DRAWER MODAL */}
      {closeModalDrawer && (
        <CloseReconcileModal
          ctx={ctx}
          drawer={closeModalDrawer}
          paymentBreakdown={payment_breakdown}
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
