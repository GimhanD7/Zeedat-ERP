import { dateLabel, money, ref, timeLabel } from '../../utils/formatters';

export const invoiceNumber = (row, prefix = 'INV') => row.invoice_no ||
  ((row.sale_id ?? row.id) ? ref(prefix.replace(/-+$/, '') || 'INV', row.sale_id ?? row.id) : '—');

const dateTime = row => [dateLabel(String(row.created_at || '').slice(0, 10)), timeLabel(row.created_at)].filter(Boolean).join(' · ');

export function auditReportTables(report, tab) {
  const prefix = report.shop?.invoice_prefix || 'INV';
  const invoice = row => invoiceNumber(row, prefix);
  const payment = row => row.sale_id ? invoice(row) : row.reference || '—';
  const auditRef = row => ref('AUD', row.id);
  if (tab === 'invoice-audit') {
    return [{
      title: 'Daily invoice register',
      rows: report.invoice_audit || [],
      columns: [
        ['Date & time', dateTime], ['Invoice', invoice], ['Branch', r => r.branch_name],
        ['Customer', r => r.customer], ['Cashier', r => r.cashier], ['Tender', r => r.payment_methods || '—'],
        ['Total', r => money(r.total)], ['Paid', r => money(r.paid_amount)], ['Due', r => money(r.credit)],
        ['Refunded', r => money(r.refunded)], ['Status', r => r.status],
      ],
    }, {
      title: 'Invoice line items',
      rows: report.invoice_items_audit || [],
      columns: [
        ['Date', dateTime], ['Invoice', invoice], ['SKU', r => r.sku], ['Item', r => r.name],
        ['Serial', r => r.serial || '—'], ['Qty', r => r.qty], ['Returned', r => r.refunded_qty],
        ['Unit price', r => money(r.price)], ['Line total', r => money(r.total)],
      ],
    }];
  }
  if (tab === 'activity-audit') {
    return [{
      title: 'System activity log',
      rows: report.activity_audit || [],
      columns: [
        ['Event', auditRef], ['Date & time', dateTime], ['User', r => r.cashier || '—'],
        ['Branch', r => r.branch_name || '—'], ['Action', r => r.action],
        ['Details', r => Object.entries(r.details || {}).map(([key, value]) => key.replaceAll('_', ' ') + ' ' +
          (['amount', 'final_charge', 'pay_amount', 'total_paid', 'expected', 'counted', 'variance'].includes(key)
            ? money(value) : String(value ?? ''))).join(' · ') || '—'],
      ],
    }];
  }
  return [{
    title: tab === 'koko' ? 'Recorded Koko transactions' : 'Payment transaction ledger',
    rows: (report.payment_audit || []).filter(r => tab !== 'koko' || r.method === 'Koko'),
    columns: [
      ['Entry ID', r => `#${r.id}`], ['Date & time', dateTime], ['Invoice / linked record', payment], ['Reference', r => r.reference || '—'],
      ['Customer', r => r.customer], ['Branch', r => r.branch_name], ['Cashier', r => r.cashier || '—'],
      ['Method', r => r.method], ['Type', r => r.kind], ['Source', r => r.source], ['Amount', r => money(r.amount)],
    ],
  }];
}
