import { dateLabel, money, ref, timeLabel } from '../../utils';

import { billLogo } from '../../utils/receiptPrint';
import { auditReportTables, invoiceNumber } from './financialAudit';

const esc = v =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderTableHtml = (headers, rows, emptyText = 'No records in selected period.') => {
  if (!rows || !rows.length) {
    return `<p class="empty-note">${esc(emptyText)}</p>`;
  }
  const ths = headers
    .map(h => `<th${h.align ? ` class="${h.align}"` : ''}>${esc(h.label)}</th>`)
    .join('');
  const trs = rows
    .map(
      r =>
        `<tr>${headers
          .map(h => `<td${h.align ? ` class="${h.align}"` : ''}>${esc(h.get(r))}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
};

const renderKpiGrid = items =>
  `<div class="kpi-grid">${items
    .map(
      k => `<div class="kpi-card">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-val">${esc(k.value)}</div>
        ${k.sub ? `<div class="kpi-sub">${esc(k.sub)}</div>` : ''}
      </div>`
    )
    .join('')}</div>`;

export function buildSectionBlocks(tab, report) {
  if (tab.endsWith('-audit') || tab === 'koko') {
    return auditReportTables(report, tab).map(({ title, rows, columns }) => ({
      title,
      html: renderTableHtml(columns.map(([label, get]) => ({ label, get })), rows),
    }));
  }
  const s = report.sales_totals || {};
  const cb = report.cashbook_summary || {};
  const inv = report.inventory_summary || {};
  const commSum = report.commissions_summary || [];
  const commItems = report.commission_items || [];
  const totalCommEarned = commSum.reduce((a, r) => a + Number(r.total_commission || 0), 0);

  const sections = {
    overview: () => [
      {
        title: '1. Executive Financial & Operations Summary',
        html: renderKpiGrid([
          { label: 'Gross Sales', value: money(s.gross_sales || 0), sub: `${Number(s.total_bills || 0)} bills (${Number(s.total_units_sold || 0)} units)` },
          { label: 'Total Discounts', value: money(s.total_discount || 0), sub: `Tax: ${money(s.total_tax || 0)}` },
          { label: 'Net Sales Revenue', value: money(s.net_sales || 0), sub: `Credit: ${money(s.total_credit || 0)}` },
          { label: 'Cost of Goods (COGS)', value: money(s.total_cost || 0), sub: `Gross Profit: ${money(s.gross_profit || 0)}` },
          { label: 'Total Staff Commissions', value: money(s.total_commission || totalCommEarned), sub: `${commSum.length} active staff accounts` },
          { label: 'Net Profit (After Comm.)', value: money(s.net_profit_after_comm || 0), sub: 'Net Sales − Cost − Commissions' },
          { label: 'Cashbook Net Flow', value: money(cb.net_cashflow || 0), sub: `In ${money(cb.total_in || 0)} / Out ${money(cb.total_out || 0)}` },
          { label: 'Stock Cost Valuation', value: money(inv.cost_value || 0), sub: `${Number(inv.total_units || 0)} units across ${Number(inv.total_skus || 0)} SKUs` },
        ]),
      },
      {
        title: '2. Payment Tender Breakdown',
        html: renderTableHtml(
          [
            { label: 'Payment Method', get: r => r.method },
            { label: 'Type', get: r => r.kind },
            { label: 'Transactions', align: 'num', get: r => String(r.tx_count || 0) },
            { label: 'Total Collected', align: 'num', get: r => money(r.total_amount || 0) },
          ],
          report.payments_breakdown || []
        ),
      },
      {
        title: '3. All Users Commission Standing',
        html: renderTableHtml(
          [
            { label: 'User ID', get: r => `#${r.id}` },
            { label: 'Staff Name', get: r => r.name },
            { label: 'Role', get: r => String(r.role || '').toUpperCase() },
            { label: 'Branch', get: r => r.branch_name || 'All' },
            { label: 'Bills', align: 'num', get: r => String(r.bills_count || 0) },
            { label: 'Qty Sold', align: 'num', get: r => String(r.total_qty || 0) },
            { label: 'Sales Volume', align: 'num', get: r => money(r.sales_total || 0) },
            { label: 'Commission Earned', align: 'num', get: r => money(r.total_commission || 0) },
          ],
          commSum
        ),
      },
    ],
    commissions: () => [
      {
        title: 'Staff Commission Summary (All Active Users)',
        html:
          renderKpiGrid([
            { label: 'Active Staff Accounts', value: String(commSum.length) },
            { label: 'Commissioned Lines', value: String(commItems.length) },
            { label: 'Total Attributed Sales', value: money(commSum.reduce((a, r) => a + Number(r.sales_total || 0), 0)) },
            { label: 'Total Commission Payable', value: money(totalCommEarned) },
          ]) +
          renderTableHtml(
            [
              { label: 'User ID', get: r => `#${r.id}` },
              { label: 'Staff Name', get: r => r.name },
              { label: 'Role', get: r => String(r.role || '').toUpperCase() },
              { label: 'Assigned Branch', get: r => r.branch_name || 'All Branches' },
              { label: 'Bills', align: 'num', get: r => String(r.bills_count || 0) },
              { label: 'Items', align: 'num', get: r => String(r.items_sold || 0) },
              { label: 'Units', align: 'num', get: r => String(r.total_qty || 0) },
              { label: 'Sales Total', align: 'num', get: r => money(r.sales_total || 0) },
              { label: 'Total Commission', align: 'num', get: r => money(r.total_commission || 0) },
            ],
            commSum
          ),
      },
      {
        title: 'Itemized Product Commission Ledger',
        html: renderTableHtml(
          [
            { label: 'Date & Time', get: r => timeLabel(r.created_at) },
            { label: 'Invoice', get: r => ref('INV', r.sale_id) },
            { label: 'Bill Maker', get: r => `#${r.staff_id} ${r.staff_name}` },
            { label: 'Cashier', get: r => r.cashier_name },
            { label: 'Product (SKU)', get: r => `${r.product_name} (${r.sku})` },
            { label: 'Qty', align: 'num', get: r => String(r.qty) },
            { label: 'Line Total', align: 'num', get: r => money(r.total) },
            { label: 'Rule', get: r => (r.commission_type === 'percent' ? `${(Number(r.commission_value || 0) / 100).toFixed(2)}%` : `${money(r.commission_value || 0)}/u`) },
            { label: 'Commission', align: 'num', get: r => money(r.commission_amount || 0) },
          ],
          commItems,
          'No sold commission items in this period.'
        ),
      },
    ],
    sales: () => [
      {
        title: 'Sales & Profitability Statement',
        html:
          renderKpiGrid([
            { label: 'Invoices Issued', value: String(s.total_bills || 0) },
            { label: 'Gross Subtotal', value: money(s.gross_sales || 0) },
            { label: 'Discounts Allowed', value: money(s.total_discount || 0) },
            { label: 'Net Revenue', value: money(s.net_sales || 0) },
            { label: 'COGS', value: money(s.total_cost || 0) },
            { label: 'Gross Profit', value: money(s.gross_profit || 0) },
            { label: 'Commissions', value: money(s.total_commission || 0) },
            { label: 'Net Profit', value: money(s.net_profit_after_comm || 0) },
          ]) +
          renderTableHtml(
            [
              { label: 'Invoice', get: r => invoiceNumber(r, report.shop?.invoice_prefix) },
              { label: 'Date', get: r => timeLabel(r.created_at) },
              { label: 'Branch', get: r => r.branch_name },
              { label: 'Customer', get: r => r.customer_name },
              { label: 'Bill Maker', get: r => `#${r.staff_id} ${r.seller_name}` },
              { label: 'Subtotal', align: 'num', get: r => money(r.subtotal) },
              { label: 'Discount', align: 'num', get: r => `${money(r.discount)} (${r.discount_type === 'fixed' ? 'Rs' : '%'})` },
              { label: 'Total', align: 'num', get: r => money(r.total) },
              { label: 'Paid', align: 'num', get: r => money(r.paid_amount) },
              { label: 'Credit', align: 'num', get: r => money(r.credit) },
              { label: 'Comm.', align: 'num', get: r => money(r.total_commission || 0) },
            ],
            report.sales_report || []
          ),
      },
    ],
    cashbook: () => [
      {
        title: 'Cashbook Movements & Register Shifts',
        html:
          renderKpiGrid([
            { label: 'Total Cash In', value: money(cb.total_in || 0) },
            { label: 'Total Cash Out', value: money(cb.total_out || 0) },
            { label: 'Net Cashflow', value: money(cb.net_cashflow || 0) },
            { label: 'Register Shifts', value: `${cb.shifts_count || 0} (${cb.open_shifts || 0} open)` },
          ]) +
          renderTableHtml(
            [
              { label: 'Date & Time', get: r => timeLabel(r.created_at) },
              { label: 'Branch', get: r => r.branch_name },
              { label: 'Drawer', get: r => ref('DRW', r.drawer_id) },
              { label: 'Kind', get: r => r.kind },
              { label: 'Reference', get: r => r.reference },
              { label: 'Recorded By', get: r => r.user_name },
              { label: 'Amount', align: 'num', get: r => money(r.amount) },
            ],
            report.cashbook_movements || []
          ),
      },
      {
        title: 'Register Shift Reconciliations',
        html: renderTableHtml(
          [
            { label: 'Shift', get: r => ref('DRW', r.id) },
            { label: 'Branch', get: r => r.branch_name },
            { label: 'Opened By', get: r => r.user_name },
            { label: 'Opened At', get: r => timeLabel(r.created_at) },
            { label: 'Closed At', get: r => (r.closed_at ? timeLabel(r.closed_at) : 'OPEN') },
            { label: 'Opening', align: 'num', get: r => money(r.opening) },
            { label: 'Expected', align: 'num', get: r => (r.expected != null ? money(r.expected) : '—') },
            { label: 'Counted', align: 'num', get: r => (r.counted != null ? money(r.counted) : '—') },
          ],
          report.cashbook_shifts || []
        ),
      },
    ],
    inventory: () => [
      {
        title: 'Inventory Valuation & Stock Levels',
        html:
          renderKpiGrid([
            { label: 'Active SKUs', value: String(inv.total_skus || 0) },
            { label: 'Units In Stock', value: String(inv.total_units || 0) },
            { label: 'Total Cost Value', value: money(inv.cost_value || 0) },
            { label: 'Total Retail Value', value: money(inv.retail_value || 0) },
            { label: 'Low Stock Alerts', value: String(inv.low_stock_count || 0) },
            { label: 'Out of Stock SKUs', value: String(inv.out_of_stock_count || 0) },
          ]) +
          renderTableHtml(
            [
              { label: 'SKU', get: r => r.sku },
              { label: 'Product', get: r => r.name },
              { label: 'Category', get: r => r.category },
              { label: 'Qty', align: 'num', get: r => String(r.qty) },
              { label: 'Cost', align: 'num', get: r => money(r.cost) },
              { label: 'Price', align: 'num', get: r => money(r.price) },
              { label: 'Cost Valuation', align: 'num', get: r => money(r.cost_value) },
              { label: 'Retail Valuation', align: 'num', get: r => money(r.retail_value) },
            ],
            report.inventory_items || []
          ),
      },
      {
        title: 'Recent Stock Movements',
        html: renderTableHtml(
          [
            { label: 'Date', get: r => timeLabel(r.created_at) },
            { label: 'Branch', get: r => r.branch_name },
            { label: 'Product', get: r => `${r.product_name} (${r.sku})` },
            { label: 'Kind', get: r => r.kind },
            { label: 'Qty Delta', align: 'num', get: r => String(r.qty) },
            { label: 'Reference', get: r => r.reference },
            { label: 'By', get: r => r.user_name },
          ],
          report.stock_movements || []
        ),
      },
    ],
    repairs: () => [
      {
        title: 'Repairs Workshop Log',
        html: renderTableHtml(
          [
            { label: 'Job #', get: r => ref('REP', r.id) },
            { label: 'Received', get: r => dateLabel(r.created_at) },
            { label: 'Branch', get: r => r.branch_name },
            { label: 'Customer', get: r => `${r.customer_name} (${r.customer_phone})` },
            { label: 'Device', get: r => r.device },
            { label: 'Technician', get: r => r.technician_name },
            { label: 'Status', get: r => r.status },
            { label: 'Estimate', align: 'num', get: r => money(r.estimate) },
            { label: 'Paid', align: 'num', get: r => money(r.paid_amount) },
          ],
          report.repairs_report || []
        ),
      },
    ],
    purchases: () => [
      {
        title: 'Supplier Payables Summary',
        html: renderTableHtml(
          [
            { label: 'Supplier', get: r => r.name },
            { label: 'Phone', get: r => r.phone || '—' },
            { label: 'GRN Lines', align: 'num', get: r => String(r.orders_count || 0) },
            { label: 'Total Purchased', align: 'num', get: r => money(r.total_billed || 0) },
            { label: 'Payable Balance', align: 'num', get: r => money(r.total_balance || 0) },
          ],
          report.suppliers_summary || []
        ),
      },
      {
        title: 'Purchase Invoices Ledger',
        html: renderTableHtml(
          [
            { label: 'Date', get: r => dateLabel(r.created_at) },
            { label: 'Invoice #', get: r => r.invoice },
            { label: 'Branch', get: r => r.branch_name },
            { label: 'Supplier', get: r => r.supplier_name },
            { label: 'Product', get: r => r.product_name },
            { label: 'Qty', align: 'num', get: r => String(r.qty) },
            { label: 'Total Cost', align: 'num', get: r => money(r.total_cost) },
            { label: 'Balance Due', align: 'num', get: r => money(r.balance) },
          ],
          report.purchases_report || []
        ),
      },
    ],
    returns: () => [
      {
        title: 'Customer Returns & Refunds Log',
        html: renderTableHtml(
          [
            { label: 'Return #', get: r => ref('RET', r.id) },
            { label: 'Date', get: r => dateLabel(r.created_at) },
            { label: 'Branch', get: r => r.branch_name },
            { label: 'Invoice', get: r => ref('INV', r.sale_id) },
            { label: 'Product', get: r => r.product_name },
            { label: 'Qty', align: 'num', get: r => String(r.qty) },
            { label: 'Amount', align: 'num', get: r => money(r.amount) },
            { label: 'Status', get: r => r.status },
          ],
          report.returns_report || []
        ),
      },
      {
        title: 'Inter-Branch Stock Transfers',
        html: renderTableHtml(
          [
            { label: 'Transfer #', get: r => ref('TRF', r.id) },
            { label: 'Date', get: r => dateLabel(r.created_at) },
            { label: 'From Branch', get: r => r.from_branch_name },
            { label: 'To Branch', get: r => r.to_branch_name },
            { label: 'Product', get: r => `${r.product_name} (${r.sku})` },
            { label: 'Qty', align: 'num', get: r => String(r.qty) },
            { label: 'Status', get: r => r.status },
          ],
          report.transfers_report || []
        ),
      },
    ],
    customers: () => [
      {
        title: 'Customers, Loyalty Points & Wallets Directory',
        html: renderTableHtml(
          [
            { label: 'Customer', get: r => r.name },
            { label: 'Phone', get: r => r.phone },
            { label: 'Branch', get: r => r.branch_name },
            { label: 'Bills', align: 'num', get: r => String(r.bills_count || 0) },
            { label: 'Total Spent', align: 'num', get: r => money(r.total_spent || 0) },
            { label: 'Loyalty Points', align: 'num', get: r => `${Number(r.loyalty_points || 0).toLocaleString()} pts` },
            { label: 'Wallet Balance', align: 'num', get: r => money(r.wallet_balance || 0) },
            { label: 'Credit Due', align: 'num', get: r => money(r.total_credit || 0) },
          ],
          report.customers_report || []
        ),
      },
    ],
  };

  return sections[tab] ? sections[tab]() : [];
}

export function buildPrintableReportHtml(report, { title, tab = 'all', staffLabel = 'All Staff' }) {
  const shop = report.shop || {};
  const branch = report.branch_info || {};
  const period = report.period || {};

  const order =
    tab === 'all'
      ? ['overview', 'commissions', 'sales', 'invoice-audit', 'payment-audit', 'koko', 'cashbook', 'inventory', 'repairs', 'purchases', 'returns', 'customers', 'activity-audit']
      : [tab];

  const blocks = order.flatMap(key => buildSectionBlocks(key, report));
  const bodySections = blocks
    .map(
      b => `<section class="doc-section">
        <h2>${esc(b.title)}</h2>
        ${b.html}
      </section>`
    )
    .join('');

  return buildA4ReportHtml({ title, shop, branch: branch.name, period, staffLabel, body: bodySections });
}

export function buildStockReportHtml(items, { shop, branch, quantity, status }) {
  const rows = items.map(item => [
    item.sku, item.name, item.category, quantity(item), item.reorder_level, money(item.price), status(item),
  ]);
  return buildA4ReportHtml({
    title: 'Stock Report', shop, branch,
    body: `<section class="doc-section"><h2>Stock on hand · ${items.length} products</h2>${
      renderTableHtml(['SKU', 'Product', 'Category', 'Stock', 'Reorder level', 'Selling price', 'Status'].map((label, index) => ({ label, get: row => row[index] })), rows)
    }</section>`,
  });
}

export function buildCashbookStatementHtml({ shop, branch, period, operator, rows, opening, closing }) {
  const received = rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount)), 0);
  const paid = rows.reduce((sum, row) => sum + Math.max(0, -Number(row.amount)), 0);
  const totals = [
    ...(opening == null ? [] : [{ label: 'Opening float', value: money(opening) }]),
    { label: 'Cash received', value: money(received) },
    { label: 'Cash paid out', value: money(paid) },
    { label: closing == null ? 'Net cash movement' : 'Closing balance', value: money(closing ?? received - paid) },
  ];
  const columns = [
    { label: 'Date & time', get: row => [dateLabel(row.business_date || row.created_at), timeLabel(row.created_at)].filter(Boolean).join(' · ') },
    { label: 'Category', get: row => row.kind || '—' },
    { label: 'Description / ref', get: row => row.reference || '—' },
    { label: 'Operator', get: row => row.operator_name || '—' },
    { label: 'Cash in', align: 'num', get: row => row.amount > 0 ? money(row.amount) : '—' },
    { label: 'Cash out', align: 'num', get: row => row.amount < 0 ? money(-row.amount) : '—' },
  ];
  return buildA4ReportHtml({
    title: 'Daily Cashbook Statement', shop, branch, period, operator,
    signatures: ['Cashier signature', 'Manager / owner signature'],
    body: renderKpiGrid(totals) +
      `<section class="doc-section"><h2>Cash movements · ${rows.length} entries</h2>${
        renderTableHtml(columns, rows, 'No cash movements match this statement.')
      }</section>`,
  });
}

function buildA4ReportHtml({ title, shop = {}, branch, period = {}, staffLabel, operator, body,
  signatures = ['Prepared By', 'Checked By (Accounts)', 'Approved By (Management)'] }) {
  const logo = billLogo(shop);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)} — ${esc(shop.shop_name || 'ZEEDAT POS')}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #142638; font-size: 11px; line-height: 1.45; print-color-adjust: exact; }
  .doc-header { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14796d; padding: 10px 0 14px; margin-bottom: 18px; }
  .shop-brand img { display: block; max-width: 48mm; max-height: 20mm; object-fit: contain; margin-bottom: 8px; }
  .shop-brand h1 { margin: 0 0 3px; font-size: 18px; letter-spacing: 0.4px; }
  .shop-brand p { margin: 1px 0; color: #475569; font-size: 10px; }
  .doc-meta { text-align: right; font-size: 10px; color: #334155; }
  .doc-meta .doc-title { font-size: 14px; font-weight: 700; color: #0f766e; margin-bottom: 4px; }
  .doc-section { margin-bottom: 16px; }
  .doc-section h2 { break-after: avoid; }
  thead { display: table-header-group; }
  tr, .kpi-card { break-inside: avoid; }
  .doc-section h2 { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #0f172a; background: #f1f5f9; padding: 5px 8px; border-left: 3px solid #0d9488; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 5px; padding: 7px 9px; background: #ffffff; }
  .kpi-label { font-size: 9.5px; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; }
  .kpi-val { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .kpi-sub { font-size: 9px; color: #475569; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.8px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  td { overflow-wrap: anywhere; }
  th { background: #f8fafc; font-weight: 700; color: #1e293b; }
  tr:nth-child(even) td { background: #fcfcfd; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty-note { margin: 6px 0; padding: 8px; border: 1px dashed #cbd5e1; color: #64748b; font-style: italic; }
  .doc-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 26px; page-break-inside: avoid; }
  .sig-box { border-top: 1px solid #64748b; padding-top: 5px; font-size: 10px; color: #475569; text-align: center; }
  .doc-footer { margin-top: 14px; font-size: 9px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="shop-brand">
      ${logo ? `<img src="${esc(logo)}" alt="Shop logo" />` : ''}
      <h1>${esc(shop.shop_name || 'ZEEDAT POS')}</h1>
      ${shop.shop_address ? `<p>${esc(shop.shop_address)}</p>` : ''}
      ${shop.shop_phone || shop.shop_email ? `<p>${esc([shop.shop_phone, shop.shop_email].filter(Boolean).join(' · '))}</p>` : ''}
    </div>
    <div class="doc-meta">
      <div class="doc-title">${esc(title)}</div>
      ${period.from || period.to ? `<div><strong>Period:</strong> ${esc(period.from === period.to ? period.from : [period.from, period.to].filter(Boolean).join(' to '))}</div>` : ''}
      <div><strong>Branch:</strong> ${esc(branch || 'All Branches')}</div>
      ${staffLabel ? `<div><strong>Staff Filter:</strong> ${esc(staffLabel)}</div>` : ''}
      ${operator ? `<div><strong>Prepared by:</strong> ${esc(operator)}</div>` : ''}
      <div><strong>Generated:</strong> ${esc(period.generated_at || new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' }))}</div>
    </div>
  </div>
  ${body}
  <div class="doc-signatures" style="grid-template-columns:repeat(${signatures.length},1fr)">
    ${signatures.map(label => `<div class="sig-box">${esc(label)}</div>`).join('')}
  </div>
  <div class="doc-footer">Official Management Report · ${esc(shop.shop_name || 'ZEEDAT POS')}</div>
</body>
</html>`;
}
