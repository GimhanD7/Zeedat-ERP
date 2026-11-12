import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  Banknote,
  BarChart3,
  Download,
  FileText,
  Package,
  Printer,
  RefreshCw,
  ShoppingBag,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import { Badge, Button, Empty, FilterTabs, Heading, Panel, Stats, Table } from '../../components/common';
import { DataView } from '../../components/feedback';
import { dateLabel, money, printHtmlDocument, ref, timeLabel, today } from '../../utils';
import { buildPrintableReportHtml } from './reportPrint';

const addDays = (iso, delta) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const monthStart = iso => iso.slice(0, 8) + '01';

const REPORT_TABS = [
  ['overview', 'Executive Overview'],
  ['commissions', 'Staff Commissions'],
  ['sales', 'Sales & Profit'],
  ['cashbook', 'Cashbook & Shifts'],
  ['inventory', 'Inventory Valuation'],
  ['repairs', 'Repairs Workshop'],
  ['purchases', 'Purchases & Suppliers'],
  ['returns', 'Returns & Transfers'],
  ['customers', 'Customers & Loyalty'],
];

const csvCell = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

function downloadCsv(filename, columns, rows) {
  const header = columns.map(c => csvCell(c[0])).join(',');
  const lines = rows.map(r => columns.map(c => csvCell(c[1](r))).join(','));
  const blob = new Blob([[header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsPage({ ctx }) {
  const endDefault = today();
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState(() => addDays(endDefault, -29));
  const [to, setTo] = useState(endDefault);
  const [staffId, setStaffId] = useState('0');
  const [tab, setTab] = useState('overview');

  const query = useMemo(
    () => ({ from, to, staff_id: Number(staffId) > 0 ? Number(staffId) : '' }),
    [from, to, staffId]
  );

  const state = useData(ctx, {
    report: ['reports', query],
    staffList: 'staff.lookup',
  });

  const applyPreset = code => {
    const t = today();
    setPreset(code);
    setTo(t);
    if (code === '1') setFrom(t);
    else if (code === '7') setFrom(addDays(t, -6));
    else if (code === '30') setFrom(addDays(t, -29));
    else if (code === 'month') setFrom(monthStart(t));
  };

  return (
    <DataView state={state}>
      {({ report, staffList = [] }) => {
        const s = report.sales_totals || {};
        const cb = report.cashbook_summary || {};
        const inv = report.inventory_summary || {};
        const commSummary = report.commissions_summary || [];
        const commItems = report.commission_items || [];
        const selectedStaffObj = staffList.find(u => String(u.id) === String(staffId));
        const staffLabel = selectedStaffObj ? `#${selectedStaffObj.id} · ${selectedStaffObj.name}` : 'All Staff';
        const activeTabLabel = REPORT_TABS.find(t => t[0] === tab)?.[1] || 'Report';

        const handlePrintTab = () => {
          const html = buildPrintableReportHtml(report, {
            title: `${activeTabLabel} Report`,
            tab,
            staffLabel,
          });
          printHtmlDocument(html);
        };

        const handlePrintAll = () => {
          const html = buildPrintableReportHtml(report, {
            title: 'Complete Management & Operations Report',
            tab: 'all',
            staffLabel,
          });
          printHtmlDocument(html);
        };

        const handleExportCsv = () => {
          const stamp = `${from}_to_${to}`;
          const exporters = {
            overview: [
              `commissions_summary_${stamp}.csv`,
              [
                ['User ID', r => r.id],
                ['Staff Name', r => r.name],
                ['Role', r => r.role],
                ['Branch', r => r.branch_name],
                ['Bills', r => r.bills_count],
                ['Items Sold', r => r.items_sold],
                ['Units Sold', r => r.total_qty],
                ['Sales Total (Rs)', r => (Number(r.sales_total || 0) / 100).toFixed(2)],
                ['Commission (Rs)', r => (Number(r.total_commission || 0) / 100).toFixed(2)],
              ],
              commSummary,
            ],
            commissions: [
              `commission_items_${stamp}.csv`,
              [
                ['Date', r => r.created_at],
                ['Invoice', r => ref('INV', r.sale_id)],
                ['Branch', r => r.branch_name],
                ['Bill Maker ID', r => r.staff_id],
                ['Bill Maker Name', r => r.staff_name],
                ['Cashier', r => r.cashier_name],
                ['SKU', r => r.sku],
                ['Product', r => r.product_name],
                ['Qty', r => r.qty],
                ['Line Total (Rs)', r => (Number(r.total || 0) / 100).toFixed(2)],
                ['Commission (Rs)', r => (Number(r.commission_amount || 0) / 100).toFixed(2)],
              ],
              commItems,
            ],
            sales: [
              `sales_report_${stamp}.csv`,
              [
                ['Invoice', r => ref('INV', r.id)],
                ['Date', r => r.created_at],
                ['Branch', r => r.branch_name],
                ['Customer', r => r.customer_name],
                ['Bill Maker', r => `#${r.staff_id} ${r.seller_name}`],
                ['Cashier', r => r.cashier_name],
                ['Subtotal (Rs)', r => (Number(r.subtotal || 0) / 100).toFixed(2)],
                ['Discount Type', r => r.discount_type],
                ['Discount (Rs)', r => (Number(r.discount || 0) / 100).toFixed(2)],
                ['Total (Rs)', r => (Number(r.total || 0) / 100).toFixed(2)],
                ['Paid (Rs)', r => (Number(r.paid_amount || 0) / 100).toFixed(2)],
                ['Credit (Rs)', r => (Number(r.credit || 0) / 100).toFixed(2)],
                ['Commission (Rs)', r => (Number(r.total_commission || 0) / 100).toFixed(2)],
              ],
              report.sales_report || [],
            ],
            cashbook: [
              `cashbook_${stamp}.csv`,
              [
                ['Date', r => r.created_at],
                ['Branch', r => r.branch_name],
                ['Drawer', r => ref('DRW', r.drawer_id)],
                ['Kind', r => r.kind],
                ['Reference', r => r.reference],
                ['User', r => r.user_name],
                ['Amount (Rs)', r => (Number(r.amount || 0) / 100).toFixed(2)],
              ],
              report.cashbook_movements || [],
            ],
            inventory: [
              `inventory_${stamp}.csv`,
              [
                ['SKU', r => r.sku],
                ['Product', r => r.name],
                ['Category', r => r.category],
                ['Qty', r => r.qty],
                ['Cost (Rs)', r => (Number(r.cost || 0) / 100).toFixed(2)],
                ['Price (Rs)', r => (Number(r.price || 0) / 100).toFixed(2)],
                ['Cost Value (Rs)', r => (Number(r.cost_value || 0) / 100).toFixed(2)],
                ['Retail Value (Rs)', r => (Number(r.retail_value || 0) / 100).toFixed(2)],
              ],
              report.inventory_items || [],
            ],
            repairs: [
              `repairs_${stamp}.csv`,
              [
                ['Job', r => ref('REP', r.id)],
                ['Received', r => r.created_at],
                ['Branch', r => r.branch_name],
                ['Customer', r => r.customer_name],
                ['Phone', r => r.customer_phone],
                ['Device', r => r.device],
                ['Technician', r => r.technician_name],
                ['Status', r => r.status],
                ['Estimate (Rs)', r => (Number(r.estimate || 0) / 100).toFixed(2)],
                ['Paid (Rs)', r => (Number(r.paid_amount || 0) / 100).toFixed(2)],
              ],
              report.repairs_report || [],
            ],
            purchases: [
              `purchases_${stamp}.csv`,
              [
                ['Date', r => r.created_at],
                ['Invoice', r => r.invoice],
                ['Branch', r => r.branch_name],
                ['Supplier', r => r.supplier_name],
                ['Product', r => r.product_name],
                ['Qty', r => r.qty],
                ['Total Cost (Rs)', r => (Number(r.total_cost || 0) / 100).toFixed(2)],
                ['Balance (Rs)', r => (Number(r.balance || 0) / 100).toFixed(2)],
              ],
              report.purchases_report || [],
            ],
            returns: [
              `returns_${stamp}.csv`,
              [
                ['Return', r => ref('RET', r.id)],
                ['Date', r => r.created_at],
                ['Branch', r => r.branch_name],
                ['Invoice', r => ref('INV', r.sale_id)],
                ['Product', r => r.product_name],
                ['Qty', r => r.qty],
                ['Amount (Rs)', r => (Number(r.amount || 0) / 100).toFixed(2)],
                ['Status', r => r.status],
              ],
              report.returns_report || [],
            ],
            customers: [
              `customers_${stamp}.csv`,
              [
                ['Name', r => r.name],
                ['Phone', r => r.phone],
                ['Branch', r => r.branch_name],
                ['Bills', r => r.bills_count],
                ['Total Spent (Rs)', r => (Number(r.total_spent || 0) / 100).toFixed(2)],
                ['Loyalty Points', r => r.loyalty_points],
                ['Wallet (Rs)', r => (Number(r.wallet_balance || 0) / 100).toFixed(2)],
                ['Credit Due (Rs)', r => (Number(r.total_credit || 0) / 100).toFixed(2)],
              ],
              report.customers_report || [],
            ],
          };
          const [fname, cols, rows] = exporters[tab] || exporters.overview;
          downloadCsv(fname, cols, rows);
        };

        const totalCommEarned = commSummary.reduce((sum, r) => sum + Number(r.total_commission || 0), 0);

        return (
          <div className="stack">
            <Heading
              title="Reports & Print Center"
              description="All-user sales commissions, itemized ledgers, and formal printable business reports across every system function"
              action={
                <div className="zk-rpt-print-actions">
                  <Button icon={Download} variant="ghost" onClick={handleExportCsv}>
                    Export CSV
                  </Button>
                  <Button icon={Printer} variant="soft" onClick={handlePrintTab}>
                    Print {activeTabLabel}
                  </Button>
                  <Button icon={FileText} variant="primary" onClick={handlePrintAll}>
                    Print Full Report
                  </Button>
                </div>
              }
            />

            <Panel className="zk-rpt-filter-bar">
              <div className="zk-rpt-filter-row">
                <FilterTabs
                  value={preset}
                  onChange={applyPreset}
                  options={[
                    ['1', 'Today'],
                    ['7', '7 Days'],
                    ['30', '30 Days'],
                    ['month', 'This Month'],
                  ]}
                />
                <div className="zk-rpt-date-inputs">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={from}
                      onChange={e => {
                        setPreset('custom');
                        setFrom(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={to}
                      onChange={e => {
                        setPreset('custom');
                        setTo(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    <span>Staff ID</span>
                    <select value={staffId} onChange={e => setStaffId(e.target.value)}>
                      <option value="0">All Users ({staffList.length})</option>
                      {staffList.map(u => (
                        <option key={u.id} value={u.id}>
                          #{u.id} · {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button icon={RefreshCw} variant="ghost" onClick={state.refresh} title="Reload report data" />
                </div>
              </div>
              <div className="zk-rpt-tab-strip">
                <FilterTabs value={tab} onChange={setTab} options={REPORT_TABS} />
              </div>
            </Panel>

            {tab === 'overview' && (
              <>
                <Stats
                  items={[
                    ['Net Sales', money(s.net_sales || 0), `${s.total_bills || 0} invoices · ${s.total_units_sold || 0} units`],
                    ['Gross Profit', money(s.gross_profit || 0), `COGS: ${money(s.total_cost || 0)}`],
                    ['All Staff Commissions', money(s.total_commission || totalCommEarned), `${commSummary.length} active users`],
                    ['Net Profit After Comm.', money(s.net_profit_after_comm || 0), `Discounts: ${money(s.total_discount || 0)}`],
                  ]}
                />
                <Stats
                  items={[
                    ['Cashbook Net Flow', money(cb.net_cashflow || 0), `In ${money(cb.total_in || 0)} · Out ${money(cb.total_out || 0)}`],
                    ['Stock Cost Value', money(inv.cost_value || 0), `${inv.total_units || 0} units · ${inv.low_stock_count || 0} low`],
                    ['Repairs Logged', String((report.repairs_report || []).length), `Paid: ${money((report.repairs_report || []).reduce((a, r) => a + Number(r.paid_amount || 0), 0))}`],
                    ['Purchases Total', money((report.purchases_report || []).reduce((a, r) => a + Number(r.total_cost || 0), 0)), `${(report.purchases_report || []).length} GRN items`],
                  ]}
                />
                <div className="columns">
                  <Panel title="All Users Commission Standing" icon={Award} action={<Badge tone="green">{commSummary.length} Users</Badge>}>
                    <Table
                      rows={commSummary}
                      empty="No active users found"
                      columns={[
                        ['User ID', r => <Badge tone="slate">#{r.id}</Badge>],
                        ['Staff Name', r => <div><strong>{r.name}</strong><div className="muted">{r.role} · {r.branch_name}</div></div>],
                        ['Bills', r => r.bills_count],
                        ['Sales Total', r => money(r.sales_total || 0)],
                        ['Commission', r => <strong className="text-green">{money(r.total_commission || 0)}</strong>],
                      ]}
                    />
                  </Panel>
                  <Panel title="Payment Methods & Tax Breakdown" icon={BarChart3}>
                    <Table
                      rows={report.payments_breakdown || []}
                      empty="No payments collected in this period"
                      columns={[
                        ['Method', r => <strong>{r.method}</strong>],
                        ['Kind', r => <Badge tone="blue">{r.kind}</Badge>],
                        ['Txns', r => r.tx_count],
                        ['Collected', r => <strong>{money(r.total_amount || 0)}</strong>],
                      ]}
                    />
                  </Panel>
                </div>
              </>
            )}

            {tab === 'commissions' && (
              <>
                <Stats
                  items={[
                    ['Active Staff', String(commSummary.length), 'All accounts tracked'],
                    ['Total Commission Earned', money(totalCommEarned), `${from} to ${to}`],
                    ['Commissioned Items', String(commItems.length), 'Individual sold lines'],
                    ['Attributed Sales', money(commSummary.reduce((a, r) => a + Number(r.sales_total || 0), 0)), 'By bill maker User ID'],
                  ]}
                />
                <Panel title="All Users Commission Summary (By Bill Maker User ID)" icon={Award}>
                  <Table
                    rows={commSummary}
                    empty="No staff users found"
                    columns={[
                      ['User ID', r => <Badge tone="blue">#{r.id}</Badge>],
                      ['Staff Name', r => <strong>{r.name}</strong>],
                      ['Role', r => <Badge tone="slate">{r.role}</Badge>],
                      ['Branch', r => r.branch_name || 'All'],
                      ['Bills Made', r => r.bills_count],
                      ['Item Lines', r => r.items_sold],
                      ['Units Sold', r => r.total_qty],
                      ['Total Sales', r => money(r.sales_total || 0)],
                      ['Total Commission', r => <strong className="text-green">{money(r.total_commission || 0)}</strong>],
                    ]}
                  />
                </Panel>
                <Panel title="Itemized Sale Commission Ledger" icon={FileText} action={<Badge tone="slate">{commItems.length} rows</Badge>}>
                  <Table
                    rows={commItems}
                    empty="No sold commission lines in this period"
                    columns={[
                      ['Invoice', r => <strong>{ref('INV', r.sale_id)}</strong>],
                      ['Date', r => timeLabel(r.created_at)],
                      ['Bill Maker', r => <Badge tone="green">#{r.staff_id} · {r.staff_name}</Badge>],
                      ['Cashier', r => r.cashier_name],
                      ['Product', r => <div><strong>{r.product_name}</strong><div className="muted">{r.sku}</div></div>],
                      ['Qty', r => r.qty],
                      ['Total', r => money(r.total)],
                      ['Rule', r => (r.commission_type === 'percent' ? `${(Number(r.commission_value || 0) / 100).toFixed(2)}%` : `${money(r.commission_value || 0)}/u`)],
                      ['Commission', r => <strong className="text-green">{money(r.commission_amount || 0)}</strong>],
                    ]}
                  />
                </Panel>
              </>
            )}

            {tab === 'sales' && (
              <>
                <Stats
                  items={[
                    ['Gross Sales', money(s.gross_sales || 0), `${s.total_bills || 0} invoices`],
                    ['Discounts', money(s.total_discount || 0), `Tax: ${money(s.total_tax || 0)}`],
                    ['Net Revenue', money(s.net_sales || 0), `Wallet: ${money(s.total_wallet_used || 0)}`],
                    ['Net Profit (After Comm.)', money(s.net_profit_after_comm || 0), `Gross: ${money(s.gross_profit || 0)}`],
                  ]}
                />
                <Panel title="Invoices & Margin Ledger" icon={ShoppingBag}>
                  <Table
                    rows={report.sales_report || []}
                    empty="No sales invoices in this period"
                    columns={[
                      ['Invoice', r => <strong>{ref('INV', r.id)}</strong>],
                      ['Date', r => timeLabel(r.created_at)],
                      ['Branch', r => r.branch_name],
                      ['Customer', r => r.customer_name],
                      ['Bill Maker', r => `#${r.staff_id} · ${r.seller_name}`],
                      ['Discount', r => `${money(r.discount)} (${r.discount_type === 'fixed' ? 'Rs' : '%'})`],
                      ['Total', r => <strong>{money(r.total)}</strong>],
                      ['Paid / Credit', r => <div>{money(r.paid_amount)}{Number(r.credit) > 0 && <span className="muted"> · Due {money(r.credit)}</span>}</div>],
                      ['Commission', r => money(r.total_commission || 0)],
                    ]}
                  />
                </Panel>
              </>
            )}

            {tab === 'cashbook' && (
              <>
                <Stats
                  items={[
                    ['Total Cash In', money(cb.total_in || 0), `${cb.movements_count || 0} entries`],
                    ['Total Cash Out', money(cb.total_out || 0)],
                    ['Net Cashflow', money(cb.net_cashflow || 0)],
                    ['Register Shifts', String(cb.shifts_count || 0), `${cb.open_shifts || 0} currently open`],
                  ]}
                />
                <Panel title="Cashbook Ledger" icon={Banknote}>
                  <Table
                    rows={report.cashbook_movements || []}
                    empty="No cash movements in selected period"
                    columns={[
                      ['Date & Time', r => timeLabel(r.created_at)],
                      ['Branch', r => r.branch_name],
                      ['Drawer', r => ref('DRW', r.drawer_id)],
                      ['Category', r => <Badge tone={Number(r.amount) >= 0 ? 'green' : 'amber'}>{r.kind}</Badge>],
                      ['Reference', r => r.reference],
                      ['User', r => r.user_name],
                      ['Amount', r => <strong className={Number(r.amount) >= 0 ? 'text-green' : 'text-red'}>{money(r.amount)}</strong>],
                    ]}
                  />
                </Panel>
                <Panel title="Register Shifts Summary" icon={FileText}>
                  <Table
                    rows={report.cashbook_shifts || []}
                    empty="No register shifts in selected period"
                    columns={[
                      ['Shift', r => ref('DRW', r.id)],
                      ['Branch', r => r.branch_name],
                      ['Opened By', r => r.user_name],
                      ['Opened', r => timeLabel(r.created_at)],
                      ['Closed', r => (r.closed_at ? timeLabel(r.closed_at) : <Badge tone="green">Open</Badge>)],
                      ['Opening', r => money(r.opening)],
                      ['Expected', r => (r.expected != null ? money(r.expected) : '—')],
                      ['Counted', r => (r.counted != null ? money(r.counted) : '—')],
                    ]}
                  />
                </Panel>
              </>
            )}

            {tab === 'inventory' && (
              <>
                <Stats
                  items={[
                    ['Active SKUs', String(inv.total_skus || 0), `${inv.total_units || 0} units total`],
                    ['Stock Cost Value', money(inv.cost_value || 0)],
                    ['Retail Valuation', money(inv.retail_value || 0), `Margin: ${money(inv.potential_profit || 0)}`],
                    ['Low / Out Stock', `${inv.low_stock_count || 0} / ${inv.out_of_stock_count || 0}`, 'Needs reorder'],
                  ]}
                />
                <Panel title="Current Inventory Valuation" icon={Package}>
                  <Table
                    rows={report.inventory_items || []}
                    empty="No inventory records"
                    columns={[
                      ['SKU', r => r.sku],
                      ['Product', r => <div><strong>{r.name}</strong><div className="muted">{r.category}</div></div>],
                      ['Qty', r => <Badge tone={Number(r.qty) <= 0 ? 'red' : Number(r.qty) <= Number(r.reorder_level || 0) ? 'amber' : 'green'}>{r.qty}</Badge>],
                      ['Cost', r => money(r.cost)],
                      ['Price', r => money(r.price)],
                      ['Cost Value', r => money(r.cost_value)],
                      ['Retail Value', r => <strong>{money(r.retail_value)}</strong>],
                    ]}
                  />
                </Panel>
                <Panel title="Stock Movements Audit Log" icon={ArrowLeftRight}>
                  <Table
                    rows={report.stock_movements || []}
                    empty="No stock movements in period"
                    columns={[
                      ['Date', r => timeLabel(r.created_at)],
                      ['Branch', r => r.branch_name],
                      ['Product', r => `${r.product_name} (${r.sku})`],
                      ['Kind', r => <Badge tone="slate">{r.kind}</Badge>],
                      ['Qty', r => <strong>{Number(r.qty) > 0 ? `+${r.qty}` : r.qty}</strong>],
                      ['Reference', r => r.reference],
                      ['By', r => r.user_name],
                    ]}
                  />
                </Panel>
              </>
            )}

            {tab === 'repairs' && (
              <Panel title="Repairs Workshop Jobs & Collections" icon={Wrench}>
                <Table
                  rows={report.repairs_report || []}
                  empty="No repair tickets in selected period"
                  columns={[
                    ['Job', r => <strong>{ref('REP', r.id)}</strong>],
                    ['Received', r => dateLabel(r.created_at)],
                    ['Branch', r => r.branch_name],
                    ['Customer', r => <div>{r.customer_name}<div className="muted">{r.customer_phone}</div></div>],
                    ['Device', r => r.device],
                    ['Technician', r => r.technician_name],
                    ['Status', r => <Badge tone={r.status === 'Delivered' || r.status === 'Ready' ? 'green' : 'blue'}>{r.status}</Badge>],
                    ['Estimate', r => money(r.estimate)],
                    ['Collected', r => <strong>{money(r.paid_amount)}</strong>],
                  ]}
                />
              </Panel>
            )}

            {tab === 'purchases' && (
              <>
                <Panel title="Supplier Balances Summary" icon={Truck}>
                  <Table
                    rows={report.suppliers_summary || []}
                    empty="No supplier records"
                    columns={[
                      ['Supplier', r => <strong>{r.name}</strong>],
                      ['Phone', r => r.phone || '—'],
                      ['Orders', r => r.orders_count],
                      ['Total Purchased', r => money(r.total_billed || 0)],
                      ['Outstanding Payable', r => <strong className={Number(r.total_balance) > 0 ? 'text-red' : ''}>{money(r.total_balance || 0)}</strong>],
                    ]}
                  />
                </Panel>
                <Panel title="Purchase Invoices (GRN)" icon={FileText}>
                  <Table
                    rows={report.purchases_report || []}
                    empty="No purchases in selected period"
                    columns={[
                      ['Date', r => dateLabel(r.created_at)],
                      ['Invoice #', r => <strong>{r.invoice}</strong>],
                      ['Branch', r => r.branch_name],
                      ['Supplier', r => r.supplier_name],
                      ['Product', r => r.product_name],
                      ['Qty', r => r.qty],
                      ['Total Cost', r => money(r.total_cost)],
                      ['Balance', r => money(r.balance)],
                    ]}
                  />
                </Panel>
              </>
            )}

            {tab === 'returns' && (
              <div className="columns">
                <Panel title="Sales Returns & Refunds" icon={ArrowLeftRight}>
                  <Table
                    rows={report.returns_report || []}
                    empty="No returns in selected period"
                    columns={[
                      ['Return #', r => ref('RET', r.id)],
                      ['Date', r => dateLabel(r.created_at)],
                      ['Invoice', r => ref('INV', r.sale_id)],
                      ['Product', r => r.product_name],
                      ['Qty', r => r.qty],
                      ['Amount', r => money(r.amount)],
                      ['Status', r => <Badge tone={r.status === 'Completed' ? 'green' : 'amber'}>{r.status}</Badge>],
                    ]}
                  />
                </Panel>
                <Panel title="Branch Stock Transfers" icon={Truck}>
                  <Table
                    rows={report.transfers_report || []}
                    empty="No stock transfers in selected period"
                    columns={[
                      ['Transfer #', r => ref('TRF', r.id)],
                      ['Route', r => `${r.from_branch_name} → ${r.to_branch_name}`],
                      ['Product', r => r.product_name],
                      ['Qty', r => r.qty],
                      ['Status', r => <Badge tone={r.status === 'Received' ? 'green' : 'blue'}>{r.status}</Badge>],
                    ]}
                  />
                </Panel>
              </div>
            )}

            {tab === 'customers' && (
              <Panel title="Customer Spending, Loyalty Points & Wallets" icon={Users}>
                <Table
                  rows={report.customers_report || []}
                  empty="No customers found"
                  columns={[
                    ['Customer', r => <div><strong>{r.name}</strong><div className="muted">{r.phone}</div></div>],
                    ['Branch', r => r.branch_name],
                    ['Bills (Period)', r => r.bills_count],
                    ['Period Spent', r => <strong>{money(r.total_spent || 0)}</strong>],
                    ['Loyalty Points', r => <Badge tone="amber">{Number(r.loyalty_points || 0).toLocaleString()} pts</Badge>],
                    ['Wallet Balance', r => <strong className="text-green">{money(r.wallet_balance || 0)}</strong>],
                    ['Credit Due', r => money(r.total_credit || 0)],
                  ]}
                />
              </Panel>
            )}
          </div>
        );
      }}
    </DataView>
  );
}
