import { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Calendar,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  LockKeyhole,
  Plus,
  Printer,
  RefreshCw,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, dateLabel, managers, money, rupees, timeLabel, today } from '../../utils';

const canManage = ctx => managers.includes(ctx.user.role);

const EXPENSE_CATEGORIES = [
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

const INFLOW_CATEGORIES = [
  ['Owner Capital', 'Owner Capital / Cash Injection'],
  ['Bank Withdrawal', 'Bank Cash Withdrawal into Register'],
  ['Customer Settlement', 'Customer Debt / Credit Settlement'],
  ['Other Income', 'Other Cash Inflow'],
];

const LKR_DENOMS = [5000, 1000, 500, 100, 50, 20, 10];

export function CashRegister({ ctx }) {
  const state = useData(ctx, { register: 'drawer' });
  const [activeTab, setActiveTab] = useState("Today's Register");
  const [shiftFilter, setShiftFilter] = useState('all');

  // Cashbook Ledger filters
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Quick Entry Inline Form State
  const [entryDir, setEntryDir] = useState('Out');
  const [entryCategory, setEntryCategory] = useState(EXPENSE_CATEGORIES[0][0]);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryReason, setEntryReason] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState('');

  // Modals
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [closeModalDrawer, setCloseModalDrawer] = useState(null);
  const [denoms, setDenoms] = useState({});
  const [coinsAmount, setCoinsAmount] = useState('');
  const [manualCounted, setManualCounted] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState('');

  const handleDirectionSwitch = dir => {
    setEntryDir(dir);
    setEntryCategory(dir === 'Out' ? EXPENSE_CATEGORIES[0][0] : INFLOW_CATEGORIES[0][0]);
    setEntryError('');
  };

  const openDrawerModal = () => {
    if (!ctx.branch) {
      ctx.setNotice('Please select a specific branch from the top bar before opening a cash drawer.');
      return;
    }
    ctx.setDialog({
      title: 'Open Cash Drawer',
      description: 'Record the starting cash float for the current business shift.',
      route: 'drawer.open',
      submit: 'Open Drawer',
      fields: [{ name: 'opening', label: 'Opening Float (LKR)', type: 'money', full: true }],
      values: { opening: 0 },
      transform: v => ({ ...v, opening: cents(v.opening) }),
      onSuccess: () => state.refresh(),
    });
  };

  const openCloseReconcileModal = drawer => {
    setCloseModalDrawer(drawer);
    setDenoms({});
    setCoinsAmount('');
    setManualCounted(String(rupees(drawer.expected || 0)));
    setCloseNotes('');
    setCloseError('');
  };

  // Denomination sum in cents
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

  const effectiveCountedCents = hasDenomInputs
    ? denomTotalCents
    : cents(manualCounted || 0);

  const handleDenomChange = (note, val) => {
    const clean = val.replace(/[^0-9]/g, '');
    setDenoms(prev => ({ ...prev, [note]: clean }));
  };

  const submitCloseDrawer = async e => {
    e.preventDefault();
    if (!closeModalDrawer) return;
    setCloseBusy(true);
    setCloseError('');
    try {
      const res = await ctx.mutate('drawer.close', {
        counted: effectiveCountedCents,
        notes: closeNotes.trim(),
      });
      const diff = res.variance;
      const msg =
        diff === 0
          ? 'Drawer balanced perfectly with 0.00 variance.'
          : diff > 0
          ? `Drawer closed with cash SURPLUS of ${money(diff)}`
          : `Drawer closed with cash SHORTAGE of ${money(Math.abs(diff))}`;
      ctx.setNotice(msg);
      setCloseModalDrawer(null);
      state.refresh();
    } catch (err) {
      setCloseError(err.message || 'Failed to close drawer.');
    } finally {
      setCloseBusy(false);
    }
  };

  const submitQuickEntry = async e => {
    e.preventDefault();
    setEntryError('');

    if (!ctx.branch) {
      setEntryError('Select a specific branch from the top bar to post a cash entry.');
      return;
    }

    const amountCents = cents(entryAmount);
    if (amountCents <= 0) {
      setEntryError('Please enter a valid amount greater than 0.');
      return;
    }

    if (!entryReason.trim()) {
      setEntryError('Please provide a description or bill reference.');
      return;
    }

    setEntryBusy(true);
    try {
      await ctx.mutate('drawer.movement', {
        direction: entryDir,
        category: entryCategory,
        amount: amountCents,
        reason: entryReason.trim(),
        auto_open: true,
      });
      ctx.setNotice(
        entryDir === 'Out'
          ? `Expense (${entryCategory}) of ${money(amountCents)} recorded.`
          : `Cash In (${entryCategory}) of ${money(amountCents)} recorded.`
      );
      setEntryAmount('');
      setEntryReason('');
      state.refresh();
    } catch (err) {
      setEntryError(err.message || 'Failed to record movement.');
    } finally {
      setEntryBusy(false);
    }
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
        const inflow = r.amount > 0 ? (r.amount / 100).toFixed(2) : '0.00';
        const outflow = r.amount < 0 ? (Math.abs(r.amount) / 100).toFixed(2) : '0.00';
        const clean = v => `"${String(v || '').replace(/"/g, '""')}"`;
        return [
          r.id,
          clean(r.created_at),
          clean(r.branch_name || 'Current'),
          clean(r.kind),
          clean(r.operator_name || 'Staff'),
          clean(r.reference),
          inflow,
          outflow,
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

  return (
    <DataView state={state}>
      {({
        register: {
          drawer,
          movements = [],
          payment_breakdown = [],
          history = [],
          ledger = [],
          categories = [],
          blocked,
        },
      }) => {
        const inflow = movements.reduce((s, r) => s + Math.max(0, r.amount), 0);
        const outflow = movements.reduce((s, r) => s + Math.min(0, r.amount), 0);
        const current = drawer?.business_date === today();

        // Filter Today's Movements + compute running balance (reverse chronological calculation)
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

        // Filter Full Cashbook Ledger
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

        const ledgerIn = filteredLedger.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
        const ledgerOut = filteredLedger.reduce((sum, item) => sum + (item.amount < 0 ? Math.abs(item.amount) : 0), 0);
        const ledgerNet = ledgerIn - ledgerOut;

        const maxCatVal = Math.max(1, ...categories.map(c => Math.abs(c.total)));

        const currentBranchName = ctx.branches.find(b => b.id === ctx.branch)?.name || 'All Branches';

        return (
          <div className="zk-dashboard-wrap">
            {/* TOP HEADER */}
            <Heading
              title="Cashbook & Register"
              description="Daily cash journal, expense vouchers, live drawer reconciliation & denomination counter."
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="date-chip">
                  <CalendarDays size={16} />
                  {dateLabel(today())}
                </span>

                <Button
                  icon={Download}
                  variant="outline"
                  onClick={() => exportCsv(filteredLedger)}
                  title="Export Cashbook CSV"
                >
                  Export CSV
                </Button>

                <Button
                  icon={Printer}
                  variant="outline"
                  onClick={() => setPrintModalOpen(true)}
                  aria-label="Print Daily Cashbook Statement"
                >
                  Print Statement
                </Button>

                {drawer ? (
                  <Button
                    icon={LockKeyhole}
                    variant="primary"
                    onClick={() => openCloseReconcileModal(drawer)}
                  >
                    Reconcile & Close
                  </Button>
                ) : (
                  ctx.branch > 0 && (
                    <Button
                      icon={Plus}
                      variant="primary"
                      disabled={blocked}
                      onClick={openDrawerModal}
                    >
                      Open Drawer
                    </Button>
                  )
                )}
              </div>
            </Heading>

            {blocked && (
              <Alert>
                This branch already has an active cash drawer session assigned to another cashier.
              </Alert>
            )}

            {drawer && !current && (
              <Alert>
                The previous business shift ({dateLabel(drawer.business_date)}) is still open. Please
                reconcile and close it before starting today's transactions.
              </Alert>
            )}

            {/* TOP 4 MODERN KPI CARDS */}
            <div className="zk-kpi-4grid">
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square purple">
                  <Wallet size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Opening Float</div>
                  <div className="zk-kpi-value">{money(drawer?.opening || 0)}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    {drawer ? `Operator: ${drawer.operator || 'Active'}` : 'Register currently closed'}
                  </div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square green">
                  <ArrowDownLeft size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">
                    {drawer ? "Shift Cash In" : 'Ledger Cash In'}
                  </div>
                  <div className="zk-kpi-value" style={{ color: '#15803d' }}>
                    + {money(drawer ? inflow : ledgerIn)}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    Cash sales & direct inflows
                  </div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square orange">
                  <ArrowUpRight size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">
                    {drawer ? "Shift Cash Out" : 'Ledger Expenses'}
                  </div>
                  <div className="zk-kpi-value" style={{ color: '#dc2626' }}>
                    − {money(drawer ? -outflow : ledgerOut)}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    Expenses, supplier pay & refunds
                  </div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square blue">
                  <Banknote size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">
                    {drawer ? 'Expected Cash in Drawer' : 'Net Cash Flow'}
                  </div>
                  <div className="zk-kpi-value">
                    {money(drawer ? drawer.expected : ledgerNet)}
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    <Badge tone={drawer ? 'green' : 'amber'}>
                      {drawer ? 'Shift Open' : ctx.branch === 0 ? 'All Branches' : 'Shift Closed'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* NAVIGATION PANEL */}
            <Panel
              title={
                activeTab === "Today's Register"
                  ? "Today's Cashbook & Live Register"
                  : activeTab === 'Cashbook Ledger'
                  ? 'Full Cashbook Journal & Audit Trail'
                  : activeTab === 'Expense Categories'
                  ? 'Income & Expense Categories'
                  : 'Closed Register Sessions'
              }
              icon={
                activeTab === "Today's Register"
                  ? Wallet
                  : activeTab === 'Cashbook Ledger'
                  ? FileSpreadsheet
                  : activeTab === 'Expense Categories'
                  ? Layers
                  : LockKeyhole
              }
              action={
                <FilterTabs
                  choices={[
                    "Today's Register",
                    'Cashbook Ledger',
                    'Expense Categories',
                    'Closed Sessions',
                  ]}
                  value={activeTab}
                  onChange={setActiveTab}
                />
              }
            >
              {/* TAB 1: TODAY'S REGISTER & INLINE QUICK ENTRY */}
              {activeTab === "Today's Register" && (
                <div className="zk-cashbook-layout">
                  {/* LEFT COLUMN: PAYMENT BREAKDOWN + MOVEMENTS TABLE */}
                  <div>
                    {/* Payment Method Breakdown Strip for Current Shift */}
                    {drawer && (
                      <div className="zk-pay-strip">
                        {['Cash', 'Card', 'Bank Transfer', 'Koko'].map(method => {
                          const found = payment_breakdown.find(p => p.method === method);
                          return (
                            <div className="zk-pay-pill" key={method}>
                              <small>{method} Collected</small>
                              <strong>{money(found?.total || 0)}</strong>
                              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                                {found?.count || 0} transactions
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '14px' }}>Shift Movements</strong>
                        <Badge tone={drawer ? 'green' : 'amber'}>
                          {drawer ? `${movements.length} Entries` : 'Drawer Closed'}
                        </Badge>
                      </div>

                      <FilterTabs
                        choices={[
                          ['all', 'All'],
                          ['in', 'Cash In'],
                          ['out', 'Expenses / Out'],
                          ['sales', 'Sales'],
                        ]}
                        value={shiftFilter}
                        onChange={setShiftFilter}
                      />
                    </div>

                    <Table
                      rows={movementsWithBalance}
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
                        ['Description / Ref', r => r.reference || '—'],
                        [
                          'Amount',
                          r => (
                            <strong className={r.amount < 0 ? 'text-red' : 'text-green'}>
                              {r.amount < 0
                                ? `− ${money(Math.abs(r.amount))}`
                                : `+ ${money(r.amount)}`}
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

                  {/* RIGHT COLUMN: INLINE QUICK CASHBOOK ENTRY */}
                  <div className="zk-cb-entry-card">
                    <div className="zk-card-header" style={{ marginBottom: '12px' }}>
                      <div className="zk-card-title">
                        <Zap size={17} style={{ color: '#0d9488' }} />
                        <span>Quick Cashbook Entry</span>
                      </div>
                    </div>

                    {entryError && (
                      <Alert tone="red" style={{ marginBottom: '12px' }}>
                        {entryError}
                      </Alert>
                    )}

                    {/* Direction Switcher: Cash Out (Expense) vs Cash In */}
                    <div className="zk-cb-direction-switch">
                      <button
                        type="button"
                        className={`zk-cb-dir-btn ${entryDir === 'Out' ? 'active-out' : ''}`}
                        onClick={() => handleDirectionSwitch('Out')}
                      >
                        <ArrowUpRight size={15} />
                        <span>Expense / Cash Out</span>
                      </button>

                      <button
                        type="button"
                        className={`zk-cb-dir-btn ${entryDir === 'In' ? 'active-in' : ''}`}
                        onClick={() => handleDirectionSwitch('In')}
                      >
                        <ArrowDownLeft size={15} />
                        <span>Cash In (Income)</span>
                      </button>
                    </div>

                    <form onSubmit={submitQuickEntry} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Category */}
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">
                          {entryDir === 'Out' ? 'Expense Category' : 'Inflow Source'}
                        </label>
                        <div className="zk-input-box">
                          <Tag size={15} style={{ color: '#64748b' }} />
                          <select
                            value={entryCategory}
                            onChange={e => setEntryCategory(e.target.value)}
                          >
                            {(entryDir === 'Out' ? EXPENSE_CATEGORIES : INFLOW_CATEGORIES).map(
                              ([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Amount + Quick Chips */}
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Amount (LKR)</label>
                        <div className="zk-input-box">
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#475569' }}>
                            LKR
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={entryAmount}
                            onChange={e => setEntryAmount(e.target.value)}
                            required
                          />
                        </div>
                        <div className="zk-cb-amount-chips">
                          {[500, 1000, 2000, 5000, 10000].map(amt => (
                            <button
                              key={amt}
                              type="button"
                              className="zk-cb-chip"
                              onClick={() => setEntryAmount(String(amt))}
                            >
                              {amt.toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Description */}
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Description / Bill Reference</label>
                        <div className="zk-textarea-box">
                          <textarea
                            rows={2}
                            maxLength={150}
                            placeholder={
                              entryDir === 'Out'
                                ? 'e.g. Staff tea & snacks, Electricity bill, Courier fee...'
                                : 'e.g. Morning float added from bank...'
                            }
                            value={entryReason}
                            onChange={e => setEntryReason(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={entryBusy || blocked}
                        className="zk-btn-complete"
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          background: entryDir === 'Out' ? '#dc2626' : '#0d9488',
                          marginTop: '4px',
                        }}
                      >
                        {entryDir === 'Out' ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}
                        <span>
                          {entryBusy
                            ? 'Recording...'
                            : entryDir === 'Out'
                            ? 'Record Cash Expense'
                            : 'Record Cash Inflow'}
                        </span>
                      </button>

                      {!drawer && ctx.branch > 0 && canManage(ctx) && (
                        <small style={{ color: '#64748b', fontSize: '11px', textAlign: 'center' }}>
                          Drawer is closed — recording an entry will automatically open today's shift.
                        </small>
                      )}
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 2: FULL CASHBOOK LEDGER */}
              {activeTab === 'Cashbook Ledger' && (
                <div>
                  {/* Date Presets & Pickers */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>From:</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={e => {
                          setDatePreset('custom');
                          setFromDate(e.target.value);
                        }}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          fontSize: '12.5px',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>To:</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={e => {
                          setDatePreset('custom');
                          setToDate(e.target.value);
                        }}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          fontSize: '12.5px',
                        }}
                      />
                    </div>
                  </div>

                  {/* Search & Type Filter */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ flex: '1 1 220px' }}>
                      <SearchBox
                        value={ledgerSearch}
                        onChange={setLedgerSearch}
                        placeholder="Search category, invoice, branch, or description..."
                      />
                    </div>

                    <div style={{ minWidth: '170px' }}>
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

                  {/* 3 Colored Totals */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        padding: '12px 16px',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ fontSize: '11.5px', color: '#166534', fontWeight: 700 }}>
                        TOTAL INFLOW ({filteredLedger.filter(x => x.amount > 0).length} entries)
                      </span>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                        + {money(ledgerIn)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        padding: '12px 16px',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ fontSize: '11.5px', color: '#991b1b', fontWeight: 700 }}>
                        TOTAL OUTFLOW ({filteredLedger.filter(x => x.amount < 0).length} entries)
                      </span>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                        − {money(ledgerOut)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        padding: '12px 16px',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ fontSize: '11.5px', color: '#334155', fontWeight: 700 }}>
                        NET CASH FLOW
                      </span>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 800,
                          color: ledgerNet >= 0 ? '#15803d' : '#dc2626',
                          marginTop: '2px',
                        }}
                      >
                        {money(ledgerNet)}
                      </div>
                    </div>
                  </div>

                  <Table
                    rows={filteredLedger}
                    columns={[
                      ['Date & Time', r => timeLabel(r.created_at)],
                      ['Branch', r => r.branch_name || currentBranchName],
                      [
                        'Category / Kind',
                        r => (
                          <Badge tone={r.amount < 0 ? 'red' : 'green'}>
                            {r.kind}
                          </Badge>
                        ),
                      ],
                      ['Operator', r => r.operator_name || 'Staff'],
                      ['Reference / Description', r => r.reference || '—'],
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

              {/* TAB 3: EXPENSE CATEGORIES BREAKDOWN */}
              {activeTab === 'Expense Categories' && (
                <div>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '14px' }}>
                    Breakdown of categorized cash disbursements, utilities, supplier cash payments, and direct inflows.
                  </p>

                  {categories.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                      No categorized cashbook transactions found yet.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '14px',
                      }}
                    >
                      {categories.map((c, idx) => {
                        const isNeg = c.total < 0;
                        const pct = Math.min(100, Math.round((Math.abs(c.total) / maxCatVal) * 100));
                        return (
                          <div
                            key={idx}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              background: isNeg ? '#fffafa' : '#f8fdfb',
                            }}
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

              {/* TAB 4: CLOSED DRAWER SESSIONS */}
              {activeTab === 'Closed Sessions' && (
                <div>
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
                              state.refresh();
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
                    ]}
                  />
                </div>
              )}
            </Panel>

            {/* DENOMINATION CASH RECONCILIATION & CLOSE DRAWER MODAL */}
            {closeModalDrawer && (
              <Modal
                title="Reconcile & Close Cash Drawer"
                description={`Operator: ${closeModalDrawer.operator || 'Active Cashier'} · Expected Cash: ${money(closeModalDrawer.expected)}`}
                onClose={() => !closeBusy && setCloseModalDrawer(null)}
                wide={true}
                busy={closeBusy}
              >
                <form onSubmit={submitCloseDrawer}>
                  <div className="modal-body">
                    {closeError && (
                      <Alert tone="red" style={{ marginBottom: '12px' }}>
                        {closeError}
                      </Alert>
                    )}

                    {/* Reconciliation Live Status Cards */}
                    {(() => {
                      const expectedCents = closeModalDrawer.expected || 0;
                      const diff = effectiveCountedCents - expectedCents;
                      return (
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
                      );
                    })()}

                    {/* LKR Denomination Counter */}
                    <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                        LKR Note & Coin Counter
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
                            <span className="zk-denom-sub">
                              {(note * qty).toLocaleString()}
                            </span>
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

                    {/* Or Manual Total Entry */}
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

                    {/* Notes */}
                    <div className="zk-field-wrap">
                      <label className="zk-field-label">
                        Closing & Variance Notes{' '}
                        {effectiveCountedCents !== (closeModalDrawer.expected || 0) && (
                          <span style={{ color: '#dc2626' }}>(Recommended for variance)</span>
                        )}
                      </label>
                      <div className="zk-textarea-box">
                        <textarea
                          rows={2}
                          value={closeNotes}
                          onChange={e => setCloseNotes(e.target.value)}
                          placeholder="Note any cash discrepancy, coin rounding, or handover details..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <Button variant="outline" onClick={() => setCloseModalDrawer(null)} disabled={closeBusy}>
                      Cancel
                    </Button>
                    <Button type="submit" icon={LockKeyhole} variant="primary" disabled={closeBusy}>
                      {closeBusy ? 'Closing Drawer...' : 'Confirm & Close Drawer'}
                    </Button>
                  </div>
                </form>
              </Modal>
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
                        Branch: <strong>{currentBranchName}</strong> | Date:{' '}
                        <strong>{dateLabel(today())}</strong>
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
                        <div style={{ width: '180px', borderBottom: '1px solid #94a3b8', marginBottom: '0.25rem' }}></div>
                        <small>Cashier Signature</small>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '180px', borderBottom: '1px solid #94a3b8', marginBottom: '0.25rem' }}></div>
                        <small>Manager / Owner Signature</small>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <Button variant="outline" onClick={() => setPrintModalOpen(false)}>
                      Close
                    </Button>
                    <Button icon={Printer} variant="primary" onClick={() => window.print()}>
                      Print Statement
                    </Button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        );
      }}
    </DataView>
  );
}
