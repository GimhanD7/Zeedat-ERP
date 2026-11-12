import { dateLabel, money, ref, timeLabel } from '../../utils';

const esc = v =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const baseCss = `
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
  .head h1 { margin: 0 0 2px; font-size: 17px; }
  .head p { margin: 1px 0; color: #475569; font-size: 10px; }
  .meta { text-align: right; font-size: 10px; color: #334155; }
  .meta .title { font-size: 14px; font-weight: 700; color: #0f766e; margin-bottom: 3px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .card small { display: block; font-size: 9.5px; color: #64748b; text-transform: uppercase; }
  .card strong { display: block; font-size: 13px; margin-top: 2px; }
  h2 { margin: 14px 0 6px; font-size: 12px; background: #f1f5f9; padding: 5px 8px; border-left: 3px solid #0d9488; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 700; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { color: #64748b; font-style: italic; padding: 6px 0; }
  .sig { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 28px; }
  .sig div { border-top: 1px solid #64748b; padding-top: 4px; text-align: center; font-size: 10px; color: #475569; }
`;

export function buildCustomerStatementHtml({
  customer,
  sales = [],
  creditPayments = [],
  walletLogs = [],
  repairs = [],
  shopName = 'ZEEDAT POS',
}) {
  const openReceivables = sales.filter(s => Number(s.credit || 0) > 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Customer Statement — ${esc(customer.name)}</title>
<style>${baseCss}</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>${esc(shopName)}</h1>
      <p><strong>Customer:</strong> ${esc(customer.name)} (${esc(ref('CUS', customer.id))})</p>
      <p><strong>Phone:</strong> ${esc(customer.phone)}${customer.email ? ` · ${esc(customer.email)}` : ''}</p>
      <p><strong>Branch:</strong> ${esc(customer.branch || '—')}</p>
    </div>
    <div class="meta">
      <div class="title">CUSTOMER ACCOUNT STATEMENT</div>
      <div><strong>Printed:</strong> ${esc(new Date().toLocaleString())}</div>
      <div><strong>Member Since:</strong> ${esc(dateLabel(customer.created_at) || '—')}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card"><small>Lifetime Purchases</small><strong>${esc(money(customer.total || 0))}</strong></div>
    <div class="card"><small>Outstanding Credit</small><strong>${esc(money(customer.credit || 0))}</strong></div>
    <div class="card"><small>Wallet Balance</small><strong>${esc(money(customer.wallet_balance || 0))}</strong></div>
    <div class="card"><small>Loyalty Points</small><strong>${esc(Number(customer.loyalty_points || 0).toLocaleString())} pts</strong></div>
  </div>

  <h2>Open Credit Receivables (${openReceivables.length})</h2>
  ${
    openReceivables.length
      ? `<table><thead><tr><th>Invoice</th><th>Date</th><th>Due Date</th><th>Items</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Credit Due</th></tr></thead><tbody>
        ${openReceivables
          .map(
            s => `<tr>
              <td>${esc(s.invoice_no || ref('INV', s.id))}</td>
              <td>${esc(dateLabel(s.created_at))}</td>
              <td>${esc(s.due_date ? dateLabel(s.due_date) : '—')}</td>
              <td>${esc(s.items || '')}</td>
              <td class="num">${esc(money(s.total))}</td>
              <td class="num">${esc(money(s.paid_amount || 0))}</td>
              <td class="num"><strong>${esc(money(s.credit))}</strong></td>
            </tr>`
          )
          .join('')}
      </tbody></table>`
      : '<p class="empty">No unpaid credit invoices.</p>'
  }

  <h2>Credit Collection Payments (${creditPayments.length})</h2>
  ${
    creditPayments.length
      ? `<table><thead><tr><th>Date & Time</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Cashier</th><th class="num">Collected</th></tr></thead><tbody>
        ${creditPayments
          .map(
            p => `<tr>
              <td>${esc(timeLabel(p.created_at))}</td>
              <td>${esc(ref('INV', p.sale_id))}</td>
              <td>${esc(p.method)}</td>
              <td>${esc(p.reference || '—')}</td>
              <td>${esc(p.user_name || 'Staff')}</td>
              <td class="num">${esc(money(p.amount))}</td>
            </tr>`
          )
          .join('')}
      </tbody></table>`
      : '<p class="empty">No credit payments recorded.</p>'
  }

  <h2>Sales History (${sales.length})</h2>
  ${
    sales.length
      ? `<table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Payment</th><th class="num">Total</th><th class="num">Balance</th></tr></thead><tbody>
        ${sales
          .map(
            s => `<tr>
              <td>${esc(s.invoice_no || ref('INV', s.id))}</td>
              <td>${esc(dateLabel(s.created_at))}</td>
              <td>${esc(s.items || '')}</td>
              <td>${esc(s.payment_methods || '—')}</td>
              <td class="num">${esc(money(s.total))}</td>
              <td class="num">${esc(money(s.credit || 0))}</td>
            </tr>`
          )
          .join('')}
      </tbody></table>`
      : '<p class="empty">No sales recorded.</p>'
  }

  <h2>Wallet & Loyalty Ledger (${walletLogs.length})</h2>
  ${
    walletLogs.length
      ? `<table><thead><tr><th>Date & Time</th><th>Activity</th><th>Method / Info</th><th>Reference</th><th class="num">Wallet</th><th class="num">Points</th></tr></thead><tbody>
        ${walletLogs
          .map(
            l => `<tr>
              <td>${esc(timeLabel(l.created_at))}</td>
              <td>${esc(l.kind)}</td>
              <td>${esc(l.method || '—')}</td>
              <td>${esc(l.reference || '—')}</td>
              <td class="num">${Number(l.amount || 0) !== 0 ? esc((Number(l.amount) > 0 ? '+' : '') + money(l.amount)) : '—'}</td>
              <td class="num">${Number(l.points_delta || 0) !== 0 ? esc((Number(l.points_delta) > 0 ? '+' : '') + Number(l.points_delta) + ' pts') : '—'}</td>
            </tr>`
          )
          .join('')}
      </tbody></table>`
      : '<p class="empty">No wallet or loyalty point movements.</p>'
  }

  ${
    repairs.length
      ? `<h2>Repair Jobs (${repairs.length})</h2>
      <table><thead><tr><th>Job</th><th>Received</th><th>Device</th><th>Status</th><th class="num">Paid</th></tr></thead><tbody>
        ${repairs
          .map(
            r => `<tr>
              <td>${esc(ref('REP', r.id))}</td>
              <td>${esc(dateLabel(r.created_at))}</td>
              <td>${esc(r.device)}</td>
              <td>${esc(r.status)}</td>
              <td class="num">${esc(money(r.paid_amount || r.estimate || 0))}</td>
            </tr>`
          )
          .join('')}
      </tbody></table>`
      : ''
  }

  <div class="sig">
    <div>Customer Signature</div>
    <div>Authorized Staff (${esc(shopName)})</div>
  </div>
</body>
</html>`;
}

export function buildCustomerDirectoryHtml(customers = [], { filterLabel = 'All Customers', shopName = 'ZEEDAT POS' } = {}) {
  const totCredit = customers.reduce((s, c) => s + Number(c.credit || 0), 0);
  const totWallet = customers.reduce((s, c) => s + Number(c.wallet_balance || 0), 0);
  const totSpent = customers.reduce((s, c) => s + Number(c.total || 0), 0);
  const totPoints = customers.reduce((s, c) => s + Number(c.loyalty_points || 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Customers & Credit Report — ${esc(shopName)}</title>
<style>${baseCss}</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>${esc(shopName)}</h1>
      <p>Customers, Receivables, Wallets & Loyalty Directory</p>
    </div>
    <div class="meta">
      <div class="title">CUSTOMERS & CREDIT REPORT</div>
      <div><strong>Filter:</strong> ${esc(filterLabel)} (${customers.length} customers)</div>
      <div><strong>Generated:</strong> ${esc(new Date().toLocaleString())}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card"><small>Total Customers</small><strong>${customers.length}</strong></div>
    <div class="card"><small>Outstanding Credit</small><strong>${esc(money(totCredit))}</strong></div>
    <div class="card"><small>Total Wallets</small><strong>${esc(money(totWallet))}</strong></div>
    <div class="card"><small>Lifetime Sales / Pts</small><strong>${esc(money(totSpent))} · ${totPoints.toLocaleString()} pts</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Customer</th>
        <th>Phone</th>
        <th>Branch</th>
        <th class="num">Bills</th>
        <th class="num">Spent</th>
        <th class="num">Points</th>
        <th class="num">Wallet</th>
        <th class="num">Credit Due</th>
      </tr>
    </thead>
    <tbody>
      ${customers
        .map(
          c => `<tr>
            <td>${esc(ref('CUS', c.id))}</td>
            <td>${esc(c.name)}</td>
            <td>${esc(c.phone)}</td>
            <td>${esc(c.branch || '—')}</td>
            <td class="num">${Number(c.sales_count || 0)}</td>
            <td class="num">${esc(money(c.total || 0))}</td>
            <td class="num">${Number(c.loyalty_points || 0).toLocaleString()}</td>
            <td class="num">${esc(money(c.wallet_balance || 0))}</td>
            <td class="num"><strong>${esc(money(c.credit || 0))}</strong></td>
          </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
}
