import { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Panel,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { money, ref, timeLabel, today } from '../../utils';
import { ReceiptModal } from './ReceiptModal';

export function SalesHistory({ ctx }) {
  const state = useData(ctx, { sales: 'sales', settings: 'settings' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const exportCsv = (rows, settings) => {
    const prefix = String(settings?.invoice_prefix || 'INV').replace(/-+$/, '') || 'INV';
    const headers = [
      'Invoice #',
      'Date & Time',
      'Branch',
      'Cashier',
      'Customer',
      'Phone',
      'Items',
      'Subtotal (LKR)',
      'Discount (LKR)',
      'Tax (LKR)',
      'Total (LKR)',
      'Paid (LKR)',
      'Cash Tendered (LKR)',
      'Change (LKR)',
      'Payment Methods',
      'Credit Due (LKR)',
      'Refunded (LKR)',
      'Notes',
    ];
    const clean = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmtRs = v => (Number(v || 0) / 100).toFixed(2);
    const lines = [
      headers.join(','),
      ...rows.map(r =>
        [
          clean(r.invoice_no || ref(prefix, r.id)),
          clean(r.created_at),
          clean(r.branch),
          clean(r.cashier || 'Staff'),
          clean(r.customer),
          clean(r.customer_phone || ''),
          clean(r.items),
          fmtRs(r.subtotal),
          fmtRs(r.discount),
          fmtRs(r.tax),
          fmtRs(r.total),
          fmtRs(r.paid_amount),
          fmtRs(r.cash_tendered),
          fmtRs(r.change_amount),
          clean(r.payment_methods || ''),
          fmtRs(r.credit),
          fmtRs(r.refunded),
          clean(r.notes || ''),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zeedat-invoices-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DataView state={state}>
      {({ sales = [], settings = {} }) => {
        const prefix = String(settings?.invoice_prefix || 'INV').replace(/-+$/, '') || 'INV';
        const now = new Date();
        const todayStr = today();
        const weekAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
        const monthStart = `${todayStr.slice(0, 7)}-01`;

        const filtered = useMemo(() => {
          const q = query.trim().toLowerCase();
          return sales.filter(r => {
            const invCode = (r.invoice_no || ref(prefix, r.id)).toLowerCase();
            if (q) {
              const hit = [
                invCode,
                r.items,
                r.customer,
                r.customer_phone,
                r.branch,
                r.cashier,
                r.payment_methods,
                r.notes,
              ].some(v => String(v || '').toLowerCase().includes(q));
              if (!hit) return false;
            }

            if (statusFilter === 'paid' && (Number(r.credit || 0) > 0 || Number(r.refunded || 0) > 0)) return false;
            if (statusFilter === 'credit' && Number(r.credit || 0) <= 0) return false;
            if (statusFilter === 'refunded' && Number(r.refunded || 0) <= 0) return false;

            if (methodFilter !== 'all') {
              const methods = String(r.payment_methods || '').toLowerCase();
              if (!methods.includes(methodFilter.toLowerCase())) return false;
            }

            const dateOnly = String(r.created_at || '').slice(0, 10);
            if (dateRange === 'today' && dateOnly !== todayStr) return false;
            if (dateRange === '7days' && dateOnly < weekAgo) return false;
            if (dateRange === 'month' && dateOnly < monthStart) return false;

            return true;
          });
        }, [sales, query, statusFilter, methodFilter, dateRange, prefix, todayStr, weekAgo, monthStart]);

        const grossTotal = filtered.reduce((s, r) => s + Number(r.total || 0), 0);
        const settledTotal = filtered.reduce(
          (s, r) => s + Math.max(0, Number(r.total || 0) - Number(r.credit || 0)),
          0
        );
        const creditTotal = filtered.reduce((s, r) => s + Number(r.credit || 0), 0);
        const refundedTotal = filtered.reduce((s, r) => s + Number(r.refunded || 0), 0);

        return (
          <div className="zk-dashboard-wrap">
            <Heading
              title="Invoices & Sales History"
              description="Complete invoice records, payment settlements, cashier logs, tax/discount breakdowns & receipts."
            >
              <Button
                icon={Download}
                variant="outline"
                onClick={() => exportCsv(filtered, settings)}
              >
                Export CSV
              </Button>
            </Heading>

            <Alert>{error}</Alert>

            {/* Top 4 KPI Cards */}
            <div className="zk-kpi-4grid">
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square purple">
                  <FileText size={22} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Invoices Shown</div>
                  <div className="zk-kpi-value">{filtered.length}</div>
                  <div className="zk-kpi-sub">of {sales.length} recent invoices</div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square blue">
                  <Banknote size={22} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Gross Invoiced</div>
                  <div className="zk-kpi-value">{money(grossTotal)}</div>
                  <div className="zk-kpi-sub">Subtotal − Discount + Tax</div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square green">
                  <CheckCircle2 size={22} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Settled Payments</div>
                  <div className="zk-kpi-value" style={{ color: '#15803d' }}>
                    {money(settledTotal)}
                  </div>
                  <div className="zk-kpi-sub">Cash, Card, Bank & Koko</div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square orange">
                  {refundedTotal > 0 ? <RotateCcw size={22} /> : <CreditCard size={22} />}
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Credit Due / Refunded</div>
                  <div className="zk-kpi-value" style={{ color: creditTotal > 0 ? '#dc2626' : '#0f172a' }}>
                    {money(creditTotal)}
                  </div>
                  <div className="zk-kpi-sub">Refunded: {money(refundedTotal)}</div>
                </div>
              </div>
            </div>

            <Panel
              title="Posted Invoices (Full Details)"
              icon={FileText}
              action={
                <div className="zk-inv-toolbar">
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Search invoice #, customer, phone, cashier or item…"
                  />
                  <Select
                    aria-label="Payment method filter"
                    value={methodFilter}
                    options={[
                      ['all', 'All Methods'],
                      ['Cash', 'Cash'],
                      ['Card', 'Card'],
                      ['Bank Transfer', 'Bank Transfer'],
                      ['Koko', 'Koko'],
                      ['Credit', 'Credit'],
                    ]}
                    onChange={e => setMethodFilter(e.target.value)}
                  />
                </div>
              }
            >
              <div className="zk-cb-filter-bar" style={{ marginBottom: '14px' }}>
                <FilterTabs
                  choices={[
                    ['all', 'All Invoices'],
                    ['paid', 'Paid in Full'],
                    ['credit', 'Credit Due'],
                    ['refunded', 'Refunded'],
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
                <FilterTabs
                  choices={[
                    ['all', 'All Time'],
                    ['today', 'Today'],
                    ['7days', '7 Days'],
                    ['month', 'This Month'],
                  ]}
                  value={dateRange}
                  onChange={setDateRange}
                />
              </div>

              <Table
                rows={filtered}
                empty="No invoices match the selected filters."
                columns={[
                  [
                    'Invoice #',
                    r => (
                      <div>
                        <strong className="mono">{r.invoice_no || ref(prefix, r.id)}</strong>
                        <small className="subtext">{timeLabel(r.created_at)}</small>
                      </div>
                    ),
                  ],
                  [
                    'Cashier & Branch',
                    r => (
                      <div>
                        <strong>{r.branch}</strong>
                        <small className="subtext">{r.cashier || 'Staff'}</small>
                      </div>
                    ),
                  ],
                  [
                    'Customer',
                    r => (
                      <div>
                        <strong>{r.customer}</strong>
                        <small className="subtext">{r.customer_phone || 'Walk-in'}</small>
                      </div>
                    ),
                  ],
                  [
                    'Products',
                    r => (
                      <div style={{ maxWidth: '240px' }}>
                        <Badge tone="blue">{r.total_qty || r.line_count || 1} qty</Badge>{' '}
                        <span style={{ fontSize: '0.84rem', color: '#334155' }}>{r.items}</span>
                      </div>
                    ),
                  ],
                  [
                    'Payment & Cash',
                    r => (
                      <div>
                        <Badge tone={Number(r.credit || 0) > 0 ? 'amber' : 'green'}>
                          {r.payment_methods || (Number(r.credit || 0) > 0 ? 'Credit' : 'Paid')}
                        </Badge>
                        {(Number(r.cash_tendered || 0) > 0 || Number(r.change_amount || 0) > 0) && (
                          <small className="subtext">
                            Cash: {money(r.cash_tendered)}
                            {Number(r.change_amount || 0) > 0 ? ` · Chg: ${money(r.change_amount)}` : ''}
                          </small>
                        )}
                      </div>
                    ),
                  ],
                  [
                    'Breakdown',
                    r => (
                      <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                        <div>Sub: {money(r.subtotal)}</div>
                        {(Number(r.discount || 0) > 0 || Number(r.tax || 0) > 0) && (
                          <small className="subtext">
                            {Number(r.discount || 0) > 0 ? `Disc −${money(r.discount)} ` : ''}
                            {Number(r.tax || 0) > 0 ? `Tax +${money(r.tax)}` : ''}
                          </small>
                        )}
                      </div>
                    ),
                  ],
                  [
                    'Total & Balance',
                    r => (
                      <div>
                        <strong>{money(r.total)}</strong>
                        {Number(r.credit || 0) > 0 && (
                          <small className="subtext" style={{ color: '#dc2626', fontWeight: 600 }}>
                            Due: {money(r.credit)}
                          </small>
                        )}
                        {Number(r.refunded || 0) > 0 && (
                          <small className="subtext" style={{ color: '#d97706', fontWeight: 600 }}>
                            Refunded: {money(r.refunded)}
                          </small>
                        )}
                      </div>
                    ),
                  ],
                  [
                    'Invoice',
                    r => (
                      <Button
                        icon={ReceiptText}
                        variant="outline"
                        disabled={loading}
                        onClick={async () => {
                          setError('');
                          setLoading(true);
                          try {
                            setReceipt(await ctx.get('invoice', { id: r.id }));
                          } catch (e) {
                            setError(e.message);
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        Full View
                      </Button>
                    ),
                  ],
                ]}
              />
            </Panel>

            {receipt && (
              <ReceiptModal
                invoice={receipt}
                settings={settings}
                onClose={() => setReceipt(null)}
              />
            )}
          </div>
        );
      }}
    </DataView>
  );
}
