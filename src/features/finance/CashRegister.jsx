import { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  LockKeyhole,
  Plus,
  Printer,
  Receipt,
  Search,
  SlidersHorizontal,
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
  Panel,
  SearchBox,
  Select,
  Stats,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, dateLabel, managers, money, timeLabel, today } from '../../utils';

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

export function CashRegister({ ctx }) {
  const state = useData(ctx, { register: 'drawer' });
  const [activeTab, setActiveTab] = useState("Today's Register");
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const openDrawerModal = () =>
    ctx.setDialog({
      title: 'Open Cash Drawer',
      description: 'Record the starting cash float for the current business shift.',
      route: 'drawer.open',
      submit: 'Open Drawer',
      fields: [{ name: 'opening', label: 'Opening Float (LKR)', type: 'money', full: true }],
      values: { opening: 0 },
      transform: v => ({ ...v, opening: cents(v.opening) }),
    });

  const closeDrawerModal = drawer =>
    ctx.setDialog({
      title: 'Reconcile & Close Cash Drawer',
      description: 'System Expected Cash · ' + money(drawer.expected),
      route: 'drawer.close',
      submit: 'Reconcile & Close',
      fields: v => [
        { name: 'counted', label: 'Actual Counted Cash (LKR)', type: 'money', full: true },
        {
          name: 'notes',
          label: 'Discrepancy / Variance Notes',
          type: 'textarea',
          optional: cents(v.counted) === drawer.expected,
          placeholder: 'Explain any cash variance or surplus/shortage...',
        },
      ],
      transform: v => ({ ...v, counted: cents(v.counted) }),
      onSuccess: r => {
        const diff = r.variance;
        const msg = diff === 0
          ? 'Drawer balanced perfectly with 0 variance.'
          : diff > 0
          ? `Drawer closed with cash SURPLUS of ${money(diff)}`
          : `Drawer closed with cash SHORTAGE of ${money(Math.abs(diff))}`;
        ctx.setNotice(msg);
      },
    });

  const recordMovementModal = direction => {
    const isOut = direction === 'Out';
    ctx.setDialog({
      title: isOut ? 'Record Cash Out / Expense' : 'Record Direct Cash In',
      description: isOut
        ? 'Disburse cash from drawer for operational expenses or supplier payments.'
        : 'Inject cash or record non-sales cash receipt into drawer.',
      route: 'drawer.movement',
      values: { 
        direction, 
        category: isOut ? EXPENSE_CATEGORIES[0][0] : INFLOW_CATEGORIES[0][0],
        amount: 0,
        reason: '',
      },
      fields: [
        {
          name: 'category',
          label: isOut ? 'Expense Category' : 'Inflow Source',
          choices: isOut ? EXPENSE_CATEGORIES : INFLOW_CATEGORIES,
        },
        { 
          name: 'amount', 
          label: 'Amount (LKR)', 
          type: 'money', 
          min: 0.01 
        },
        { 
          name: 'reason', 
          label: 'Description / Bill Reference', 
          full: true,
          placeholder: isOut ? 'e.g. Bought milk and tea for staff, or Bill #104' : 'e.g. Added morning float from bank',
        },
      ],
      transform: v => ({ ...v, amount: cents(v.amount) }),
      onSuccess: () => {
        ctx.setNotice(`Cash ${direction.toLowerCase()} recorded successfully.`);
      },
    });
  };

  const handlePrintCashbook = () => {
    window.print();
  };

  return (
    <DataView state={state}>
      {({ register: { drawer, movements = [], history = [], ledger = [], summary = {}, categories = [], blocked } }) => {
        const inflow = movements.reduce((s, r) => s + Math.max(0, r.amount), 0);
        const outflow = movements.reduce((s, r) => s + Math.min(0, r.amount), 0);
        const current = drawer?.business_date === today();

        // Filter ledger entries
        const filteredLedger = ledger.filter(item => {
          // Type filter
          if (ledgerFilter === 'in' && item.amount <= 0) return false;
          if (ledgerFilter === 'out' && item.amount >= 0) return false;
          if (ledgerFilter === 'sales' && !item.kind?.toLowerCase().includes('sale') && !item.reference?.toLowerCase().includes('inv-')) return false;
          if (ledgerFilter === 'expenses' && (item.amount >= 0 || item.kind?.toLowerCase().includes('return'))) return false;

          // Date preset filter
          if (dateRange === 'today') {
            const itemDate = (item.created_at || '').substring(0, 10);
            if (itemDate !== today()) return false;
          }

          // Search text filter
          if (ledgerSearch) {
            const q = ledgerSearch.toLowerCase();
            const matchesKind = (item.kind || '').toLowerCase().includes(q);
            const matchesRef = (item.reference || '').toLowerCase().includes(q);
            const matchesOp = (item.operator_name || '').toLowerCase().includes(q);
            if (!matchesKind && !matchesRef && !matchesOp) return false;
          }

          return true;
        });

        // Filtered Ledger totals
        const ledgerIn = filteredLedger.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0);
        const ledgerOut = filteredLedger.reduce((sum, item) => sum + (item.amount < 0 ? Math.abs(item.amount) : 0), 0);
        const ledgerNet = ledgerIn - ledgerOut;

        return (
          <>
            <Heading
              title="Cashbook & Register"
              description="Daily cash journal, expense tracking, live drawer reconciliation and multi-branch audit."
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="date-chip">
                  <CalendarDays size={16} />
                  {dateLabel(today())}
                </span>

                <Button 
                  icon={Printer} 
                  variant="outline" 
                  onClick={() => setPrintModalOpen(true)}
                  aria-label="Print Daily Cashbook Statement"
                >
                  Print Daily Statement
                </Button>

                {drawer ? (
                  <Button icon={LockKeyhole} variant="primary" onClick={() => closeDrawerModal(drawer)}>
                    Close Drawer
                  </Button>
                ) : (
                  <Button icon={Plus} variant="primary" disabled={blocked} onClick={openDrawerModal}>
                    Open Drawer
                  </Button>
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
                The previous business shift ({dateLabel(drawer.business_date)}) is still open. 
                Please reconcile and close it before starting today's transactions.
              </Alert>
            )}

            <Stats
              items={[
                {
                  icon: Wallet,
                  label: 'Opening Float',
                  value: money(drawer?.opening),
                  note: drawer?.operator ? `Cashier: ${drawer.operator}` : 'Drawer closed',
                },
                {
                  icon: ArrowDownLeft,
                  label: "Today's Cash In",
                  value: money(inflow),
                  note: 'Sales & Inflows',
                  tone: 'mint',
                },
                {
                  icon: ArrowUpRight,
                  label: "Today's Cash Out",
                  value: money(-outflow),
                  note: 'Expenses & Cash out',
                  tone: 'red',
                },
                {
                  icon: Banknote,
                  label: 'Live Expected Cash',
                  value: money(drawer?.expected),
                  note: drawer ? 'Cash currently in drawer' : 'No active session',
                  tone: 'violet',
                },
              ]}
            />

            <Panel
              title={
                activeTab === "Today's Register"
                  ? "Today's Live Drawer Feed"
                  : activeTab === 'Cashbook Ledger'
                  ? 'Cashbook Journal & Movements'
                  : activeTab === 'Expense Categories'
                  ? 'Category Breakdown & Expenses'
                  : 'Closed Drawer Sessions'
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
              {/* TAB 1: TODAY'S REGISTER */}
              {activeTab === "Today's Register" && (
                <div>
                  <div 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      flexWrap: 'wrap', 
                      gap: '0.75rem',
                      marginBottom: '1rem' 
                    }}
                  >
                    <div>
                      <strong>Shift Status: </strong>
                      {drawer ? (
                        <Badge tone="green">Active Session Open</Badge>
                      ) : (
                        <Badge tone="amber">Drawer Closed</Badge>
                      )}
                    </div>

                    {drawer && canManage(ctx) && (
                      <div className="row-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button 
                          icon={ArrowDownLeft} 
                          variant="outline" 
                          onClick={() => recordMovementModal('In')}
                        >
                          + Cash In
                        </Button>
                        <Button 
                          icon={ArrowUpRight} 
                          variant="outline" 
                          onClick={() => recordMovementModal('Out')}
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                        >
                          - Expense / Cash Out
                        </Button>
                      </div>
                    )}
                  </div>

                  <Table
                    rows={movements}
                    columns={[
                      ['Date & Time', r => timeLabel(r.created_at)],
                      [
                        'Movement Type',
                        r => (
                          <Badge tone={r.amount < 0 ? 'red' : 'green'}>
                            {r.kind || (r.amount < 0 ? 'Cash Out' : 'Cash In')}
                          </Badge>
                        ),
                      ],
                      ['Operator', r => r.operator_name || 'Cashier'],
                      ['Reference / Description', r => r.reference || '—'],
                      [
                        'Amount',
                        r => (
                          <strong className={r.amount < 0 ? 'text-red' : 'text-green'}>
                            {r.amount < 0 ? `- ${money(Math.abs(r.amount))}` : `+ ${money(r.amount)}`}
                          </strong>
                        ),
                      ],
                    ]}
                  />
                </div>
              )}

              {/* TAB 2: CASHBOOK LEDGER */}
              {activeTab === 'Cashbook Ledger' && (
                <div>
                  <div 
                    style={{ 
                      display: 'flex', 
                      gap: '0.75rem', 
                      flexWrap: 'wrap', 
                      alignItems: 'center', 
                      marginBottom: '1rem' 
                    }}
                  >
                    <div style={{ flex: '1 1 200px' }}>
                      <SearchBox
                        value={ledgerSearch}
                        onChange={setLedgerSearch}
                        placeholder="Search category, invoice, or reason..."
                      />
                    </div>

                    <div style={{ minWidth: '150px' }}>
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

                    <div style={{ minWidth: '130px' }}>
                      <Select
                        aria-label="Filter Date Range"
                        value={dateRange}
                        options={[
                          ['all', 'All Dates'],
                          ['today', 'Today Only'],
                        ]}
                        onChange={e => setDateRange(e.target.value)}
                      />
                    </div>
                  </div>

                  <div 
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                      gap: '0.75rem',
                      marginBottom: '1.25rem' 
                    }}
                  >
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>TOTAL INFLOW</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#15803d' }}>
                        + {money(ledgerIn)}
                      </div>
                    </div>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>TOTAL OUTFLOW (EXPENSES)</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>
                        - {money(ledgerOut)}
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>NET CASH FLOW</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: ledgerNet >= 0 ? '#15803d' : '#dc2626' }}>
                        {money(ledgerNet)}
                      </div>
                    </div>
                  </div>

                  <Table
                    rows={filteredLedger}
                    columns={[
                      ['Date & Time', r => timeLabel(r.created_at)],
                      ['Branch', r => r.branch_name || 'Current'],
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
                        'Amount (LKR)',
                        r => (
                          <strong className={r.amount < 0 ? 'text-red' : 'text-green'}>
                            {r.amount < 0 ? `- ${money(Math.abs(r.amount))}` : `+ ${money(r.amount)}`}
                          </strong>
                        ),
                      ],
                    ]}
                  />
                </div>
              )}

              {/* TAB 3: EXPENSE CATEGORIES BREAKDOWN */}
              {activeTab === 'Expense Categories' && (
                <div>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Summary of operational disbursements, utilities, purchases, and income categories recorded in the Cashbook.
                  </p>

                  <div 
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
                      gap: '1rem' 
                    }}
                  >
                    {categories.map((c, idx) => (
                      <div 
                        key={idx}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '1rem',
                          background: c.total < 0 ? '#fffafa' : '#fafdfb',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '0.95rem' }}>{c.name}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.count} records</span>
                        </div>
                        <div 
                          style={{ 
                            fontSize: '1.2rem', 
                            fontWeight: 700, 
                            marginTop: '0.5rem',
                            color: c.total < 0 ? '#dc2626' : '#15803d' 
                          }}
                        >
                          {money(c.total)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: CLOSED SESSIONS */}
              {activeTab === 'Closed Sessions' && (
                <div>
                  {canManage(ctx) && (
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        onClick={() =>
                          ctx.setDialog({
                            title: 'Close Business Day Cycle',
                            description: 'Seal all drawer accounts and lock the financial date.',
                            route: 'cycle.close',
                            values: { business_date: today() },
                            fields: [{ name: 'business_date', label: 'Business Date', type: 'date' }],
                            submit: 'Close Day',
                            onSuccess: () => ctx.setNotice('Business cycle closed successfully.'),
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
                      ['Operator', 'operator'],
                      ['Opening Float', r => money(r.opening)],
                      ['Expected Cash', r => money(r.expected)],
                      ['Counted Cash', r => money(r.counted)],
                      [
                        'Variance',
                        r => {
                          const diff = r.counted - r.expected;
                          if (diff === 0) return <Badge tone="green">Balanced (0.00)</Badge>;
                          return (
                            <strong className={diff > 0 ? 'text-green' : 'text-red'}>
                              {diff > 0 ? `+ ${money(diff)}` : money(diff)}
                            </strong>
                          );
                        },
                      ],
                      ['Notes / Explanations', 'notes'],
                    ]}
                  />
                </div>
              )}
            </Panel>

            {/* PRINT DAILY CASHBOOK MODAL */}
            {printModalOpen && (
              <Modal
                title="Daily Cashbook Statement"
                description={`Branch: ${ctx.branch?.name || 'Main Branch'} · Business Date: ${dateLabel(today())}`}
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
                      color: '#0f172a' 
                    }}
                  >
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                      <h2 style={{ margin: 0, fontSize: '1.5rem' }}>ZEEDAT ERP - CASHBOOK STATEMENT</h2>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: '#64748b' }}>
                        Branch: <strong>{ctx.branch?.name || 'All Branches'}</strong> | Date: <strong>{dateLabel(today())}</strong>
                      </p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                        Printed on {new Date().toLocaleString()} by {ctx.user?.name}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem', textAlign: 'center' }}>
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
                        <div style={{ fontWeight: 700, color: '#dc2626' }}>-{money(-outflow)}</div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', padding: '0.5rem' }}>
                        <small style={{ color: '#0f172a' }}>CLOSING BALANCE</small>
                        <div style={{ fontWeight: 700 }}>{money(drawer?.expected || (drawer?.opening || 0) + inflow + outflow)}</div>
                      </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Time</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Type</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description / Bill Ref</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Operator</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>Inflow (LKR)</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>Outflow (LKR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>
                              No cash movements recorded today.
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1' }}>
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
                    <Button icon={Printer} variant="primary" onClick={handlePrintCashbook}>
                      Print Statement
                    </Button>
                  </div>
                </div>
              </Modal>
            )}
          </>
        );
      }}
    </DataView>
  );
}
