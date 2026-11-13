import { dateLabel, money, ref } from './formatters.js';

/* =====================================================================
   ZEEDAT UNIFIED BILL ENGINE
   ---------------------------------------------------------------------
   Every customer-facing bill in the system (POS sales invoice, review
   copy, wallet / credit receipts, repair intake slip, repair delivery
   bill, ...) is rendered by ONE template: buildBillHtml().
   Feature modules only map their data into the generic "bill" shape
   below, so the printed paper and the on-screen preview always share
   the exact same design.

   bill = {
     title:      'SALES INVOICE',           // document type band
     number:     'INV-000123',              // bill / job number
     numberLabel:'Bill No',
     date:       '2026-11-13 10:02:18',     // created time (defaults to now)
     copyLabel:  'REVIEW COPY',             // optional watermark-style tag
     parties:    [['Customer', 'Name (07x...)'], ['Cashier', 'Owner']],
     sections:   [{ title: 'Device', rows: [['IMEI', '...']], notes: [['Issue', 'text']] }],
     items:      [{ name, meta, qty, price, total }],   // numbers in cents
     totals:     [{ label, value, minus?, grand? }],    // value in cents
     payments:   [{ label, value }],
     extras:     [{ label, value, strong? }],           // value: cents or text
     status:     { tone: 'paid' | 'due' | 'info', label, value? },
     notes:      'free text',
     footerNote: 'Please bring this slip...',
   }
===================================================================== */

const esc = val =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const amount = v => (isNum(v) ? money(v) : String(v ?? ''));

const pct = bps =>
  bps ? ` (${(Number(bps) / 100).toFixed(Number(bps) % 100 === 0 ? 0 : 1)}%)` : '';

/** Format a timestamp (or now) as "13 Nov 2026 · 10:02 AM" in Asia/Colombo. */
function billDateTime(value) {
  let d;
  if (!value) d = new Date();
  else if (value instanceof Date) d = value;
  else {
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateLabel(s);
    d = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : new Date(s.replace(' ', 'T') + '+05:30');
  }
  if (Number.isNaN(d.getTime())) return String(value);
  const opts = { timeZone: 'Asia/Colombo' };
  const day = new Intl.DateTimeFormat('en-GB', { ...opts, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  return `${day} · ${time.toUpperCase()}`;
}

/**
 * Check whether an invoice / settlement payload includes cash tendered into the drawer.
 */
export function hasCashInPayments(payments = [], explicitCashTendered = 0) {
  if (Number(explicitCashTendered || 0) > 0) return true;
  return (payments || []).some(
    p => String(p?.method || '').toLowerCase() === 'cash' && Number(p?.amount || 0) > 0
  );
}

/**
 * Trigger physical POS cash drawer kick ONLY when a cash settlement occurred.
 */
export async function triggerCashDrawerForSettlement({ settings, hasCashSettlement }) {
  const drawerEnabled =
    settings?.cash_drawer_enabled !== 0 &&
    settings?.cash_drawer_enabled !== '0' &&
    settings?.cash_drawer_enabled !== false;

  if (!hasCashSettlement || !drawerEnabled) {
    return { opened: false, skipped: true };
  }

  if (!window.electronAPI?.openCashDrawer) {
    return { opened: false, unsupported: true };
  }

  try {
    const res = await window.electronAPI.openCashDrawer({
      deviceName: settings?.receipt_printer_name || '',
    });
    return { opened: Boolean(res?.ok), error: res?.error || '' };
  } catch (err) {
    return { opened: false, error: err?.message || 'Cash drawer kick failed.' };
  }
}

export function billLayout(settings = {}) {
  try {
    return (typeof settings.bill_layout === 'string' ? JSON.parse(settings.bill_layout) : settings.bill_layout) || {};
  } catch {
    return {};
  }
}

export function billLogo(settings) {
  const logo = billLayout(settings).logo;
  return typeof logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : '';
}

export const billPaperWidth = settings => billLayout(settings).format === 'a4' ? 210 : Number(settings?.paper_width) === 58 ? 58 : 80;

/**
 * THE single bill template used by every printed bill and on-screen bill preview.
 */
export function buildBillHtml(bill = {}, settings = {}) {
  const widthMm = billPaperWidth(settings);
  const a4 = widthMm === 210;
  const layout = billLayout(settings);
  const logo = billLogo(settings);
  const narrow = widthMm === 58;
  const contentWidthMm = narrow ? 54 : 74;
  const fs = (n58, n80) => (narrow ? n58 : n80) + 'px';

  const shopName = settings?.shop_name || 'ZEEDAT POS';
  const branch = bill.branch || '';
  const items = bill.items || [];
  const parties = (bill.parties || []).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const sections = (bill.sections || []).filter(
    s => (s.rows || []).some(([, v]) => v) || (s.notes || []).some(([, v]) => v)
  );

  const kv = (label, value, cls = '') => `
      <div class="kv ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;

  const partiesHtml = parties.length
    ? `<div class="block">${parties.map(([l, v]) => kv(l, v)).join('')}</div><div class="rule"></div>`
    : '';

  const sectionsHtml = sections
    .map(
      s => `
    <div class="block">
      ${s.title ? `<div class="sec-title">${esc(s.title)}</div>` : ''}
      ${(s.rows || []).filter(([, v]) => v).map(([l, v]) => kv(l, v)).join('')}
      ${(s.notes || [])
        .filter(([, v]) => v)
        .map(([l, v]) => `<div class="note-row"><span>${esc(l)}</span><p>${esc(v)}</p></div>`)
        .join('')}
    </div>
    <div class="rule"></div>`
    )
    .join('');

  const itemsHtml = items.length
    ? `
    <table class="items">
      <thead>
        <tr><th class="c-item">Item (${items.length})</th><th class="c-qty">Qty</th><th class="c-amt">Amount</th></tr>
      </thead>
      <tbody>
        ${items
          .map(
            (it, i) => `
        <tr>
          <td class="c-item">
            <div class="it-name">${i + 1}. ${esc(it.name || 'Item')}</div>
            ${it.meta ? `<div class="it-meta">${esc(it.meta)}</div>` : ''}
            <div class="it-meta">${Number(it.qty || 1)} &times; ${esc(amount(it.price || 0))}</div>
          </td>
          <td class="c-qty">${Number(it.qty || 1)}</td>
          <td class="c-amt">${esc(amount(it.total ?? Number(it.qty || 1) * Number(it.price || 0)))}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div class="rule"></div>`
    : '';

  const totalsHtml = (bill.totals || [])
    .map(t =>
      t.grand
        ? `<div class="grand"><span>${esc(t.label)}</span><strong>${esc(amount(t.value))}</strong></div>`
        : kv(t.label, (t.minus ? '- ' : '') + amount(t.value), t.strong ? 'strong' : '')
    )
    .join('');

  const paymentsHtml = (bill.payments || []).length
    ? `<div class="sec-title">Payment</div>${bill.payments.map(p => kv(p.label, amount(p.value))).join('')}`
    : '';

  const extrasHtml = (bill.extras || [])
    .map(x => kv(x.label, amount(x.value), x.strong ? 'strong' : ''))
    .join('');

  const status = bill.status || { tone: 'info', label: 'Recorded' };
  const statusHtml = status
    ? `<div class="stamp ${esc(status.tone || 'info')}">
        <span>${esc(status.label)}</span>
        ${status.value !== undefined && status.value !== null ? `<strong>${esc(amount(status.value))}</strong>` : ''}
      </div>`
    : '';

  const notesHtml = bill.notes
    ? `<div class="note-row"><span>Note</span><p>${esc(bill.notes)}</p></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(bill.title || 'Bill')} ${esc(bill.number || '')}</title>
<style>
  @page { size: ${a4 ? 'A4 portrait; margin: 14mm' : widthMm + 'mm auto; margin: 0'}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${widthMm}mm;
    background: #fff;
    color: #000;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: ${fs(10, 11)};
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bill { width: ${contentWidthMm}mm; margin: 0 auto; padding: 3mm 1mm 6mm; }
  .center { text-align: center; }
  .shop { font-size: ${fs(14, 17)}; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; }
  .shop-meta { font-size: ${fs(8.5, 9.5)}; margin-top: 1px; word-break: break-word; }
  .band {
    margin: 6px 0 4px;
    background: #000;
    color: #fff;
    text-align: center;
    font-weight: 800;
    font-size: ${fs(10, 11.5)};
    letter-spacing: 1.4px;
    padding: 3px 4px;
    text-transform: uppercase;
  }
  .copy { text-align: center; font-size: ${fs(8.5, 9.5)}; font-weight: 800; letter-spacing: 1px; border: 1px dashed #000; padding: 1px; margin-bottom: 4px; }
  .number { text-align: center; font-family: 'Consolas', 'Courier New', monospace; font-weight: 800; font-size: ${fs(12.5, 14)}; letter-spacing: 0.5px; }
  .number small { display: block; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-weight: 600; font-size: ${fs(8.5, 9.5)}; letter-spacing: 0; }
  .rule { border-top: 1px dashed #000; margin: 5px 0; }
  .rule.solid { border-top: 1.5px solid #000; }
  .block { display: grid; gap: 1px; }
  .kv { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; font-size: ${fs(9.5, 10.5)}; }
  .kv span { flex: 0 0 auto; }
  .kv strong { font-weight: 600; text-align: right; word-break: break-word; }
  .kv.strong span, .kv.strong strong { font-weight: 800; }
  .sec-title { font-size: ${fs(8.5, 9.5)}; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin: 2px 0 1px; }
  .note-row { font-size: ${fs(9.5, 10.5)}; margin-top: 2px; }
  .note-row span { font-weight: 800; }
  .note-row p { word-break: break-word; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { font-size: ${fs(8.5, 9.5)}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #000; padding: 1px 0 3px; text-align: left; }
  table.items td { padding: 3px 0; vertical-align: top; border-bottom: 1px dotted #999; }
  table.items tr:last-child td { border-bottom: none; }
  .c-item { padding-right: 4px !important; }
  .c-qty { text-align: center !important; width: 26px; }
  .c-amt { text-align: right !important; white-space: nowrap; font-weight: 700; }
  .it-name { font-weight: 700; word-break: break-word; }
  .it-meta { font-size: ${fs(8.5, 9.5)}; color: #222; word-break: break-word; }
  .grand {
    display: flex; justify-content: space-between; align-items: center;
    margin: 5px 0; padding: 4px 3px;
    border-top: 2px solid #000; border-bottom: 2px solid #000;
    font-size: ${fs(12.5, 14.5)}; font-weight: 900; letter-spacing: 0.4px;
  }
  .stamp {
    margin: 6px 0 2px; padding: 4px 5px; text-align: center;
    border: 2px solid #000; font-weight: 900; letter-spacing: 1px;
    font-size: ${fs(10.5, 12)}; text-transform: uppercase;
    display: flex; justify-content: space-between; gap: 6px;
  }
  .stamp.paid, .stamp.info { justify-content: center; }
  .stamp.due { background: #000; color: #fff; }
  .footer { text-align: center; margin-top: 6px; font-size: ${fs(9, 10)}; word-break: break-word; }
  .footer .thanks { font-weight: 800; font-size: ${fs(10, 11)}; }
  .footer .powered { margin-top: 4px; font-size: ${fs(7.5, 8.5)}; letter-spacing: 0.5px; }
  .ref-code { font-family: 'Consolas', 'Courier New', monospace; letter-spacing: 2px; margin-top: 4px; font-size: ${fs(9, 10)}; }
  .logo { max-width: ${a4 ? 48 : 34}mm; max-height: 22mm; object-fit: contain; margin-bottom: 3mm; }
  .custom { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0; }
  thead { display: table-header-group; }
  tr, .grand, .stamp, .number { break-inside: avoid; }
  ${a4 ? `
  html, body { width: auto; color: #16273a; font-size: 12px; }
  .bill { width: auto; max-width: 182mm; padding: 4mm 0; }
  .center { text-align: left; padding: 0 0 5mm; border-bottom: 2px solid #14796d; }
  .shop { font-size: 27px; }
  .shop-meta { font-size: 11px; color: #475569; }
  .band { background: #e8f3f1; color: #115e56; padding: 12px; margin: 5mm 0 3mm; text-align: left; font-size: 16px; }
  .number { text-align: left; font-size: 18px; }
  .kv { padding: 4px 0; font-size: 12px; }
  .rule { border-color: #cbd5e1; margin: 10px 0; }
  table.items th, table.items td { padding: 9px 6px; border-bottom: 1px solid #dce5ed; }
  table.items th { background: #eef3f7; }
  .c-qty { width: 52px; }
  .grand { color: #115e56; background: #e8f3f1; border: 0; padding: 11px; }
  .stamp { margin-top: 12px; border-color: #14796d; color: #115e56; border-radius: 4px; padding: 8px; }
  .stamp.due { background: #fff3eb; color: #9a3412; border-color: #c2410c; }
  .footer { text-align: left; }
  ` : ''}
</style>
</head>
<body>
  <div class="bill">
    <div class="center">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="Shop logo" />` : ''}
      <div class="shop">${esc(shopName)}</div>
      ${layout.heading ? `<div class="shop-meta">${esc(layout.heading)}</div>` : ''}
      ${branch ? `<div class="shop-meta">${esc(branch)}</div>` : ''}
      ${settings?.shop_address ? `<div class="shop-meta">${esc(settings.shop_address)}</div>` : ''}
      ${settings?.shop_phone ? `<div class="shop-meta">Tel: ${esc(settings.shop_phone)}</div>` : ''}
      ${settings?.shop_email ? `<div class="shop-meta">${esc(settings.shop_email)}</div>` : ''}
      ${layout.details ? `<div class="shop-meta custom">${esc(layout.details)}</div>` : ''}
    </div>
    <div class="band">${esc(bill.title || 'Bill')}</div>
    ${bill.copyLabel ? `<div class="copy">${esc(bill.copyLabel)}</div>` : ''}
    <div class="number">
      ${esc(bill.number || '—')}
      <small>${esc(bill.numberLabel || 'Bill No')} · ${esc(billDateTime(bill.date))}</small>
    </div>
    <div class="rule"></div>
    ${partiesHtml}
    ${sectionsHtml}
    ${itemsHtml}
    ${totalsHtml}
    ${paymentsHtml}
    ${extrasHtml}
    ${statusHtml}
    ${notesHtml}
    <div class="rule solid"></div>
    <div class="footer">
      ${bill.footerNote ? `<div>${esc(bill.footerNote)}</div>` : ''}
      ${layout.terms ? `<div class="custom">${esc(layout.terms)}</div>` : ''}
      <div class="thanks">${esc(settings?.receipt_footer || 'Thank you for your business!')}</div>
      ${bill.number ? `<div class="ref-code">*${esc(bill.number)}*</div>` : ''}
      <div class="powered">Powered by ZEEDAT POS</div>
    </div>
  </div>
</body>
</html>`;
}

/* ---------------------------------------------------------------------
   Data mappers -> unified bill shape
--------------------------------------------------------------------- */

/** POS sales invoice / review copy / wallet & credit receipts. */
export function saleInvoiceToBill(invoice = {}, settings = {}) {
  const showTax = settings?.show_tax_on_receipt !== 0 && settings?.show_tax_on_receipt !== '0';
  const number =
    invoice.invoice_no ||
    invoice.invoiceNo ||
    (invoice.id ? ref(String(settings?.invoice_prefix || 'INV').replace(/-+$/, '') || 'INV', invoice.id) : 'PREVIEW');

  const cashTendered = Number(invoice.cashTendered ?? invoice.cash_tendered ?? 0);
  const change = Number(invoice.change ?? invoice.change_amount ?? 0);
  const credit = Number(invoice.credit || 0);
  const total = Number(invoice.total || 0);

  const totals = [{ label: 'Subtotal', value: Number(invoice.subtotal || 0) }];
  if (Number(invoice.discount || 0) > 0)
    totals.push({ label: 'Discount' + pct(invoice.discount_bps), value: Number(invoice.discount), minus: true });
  if (showTax) totals.push({ label: 'Tax' + pct(invoice.tax_bps), value: Number(invoice.tax || 0) });
  totals.push({ label: 'TOTAL', value: total, grand: true });

  const payments = [];
  if (Number(invoice.wallet_used || 0) > 0) payments.push({ label: 'Wallet', value: Number(invoice.wallet_used) });
  (invoice.payments || []).forEach(p =>
    payments.push({
      label: `${p.method}${p.kind === 'Credit' ? ' repayment' : ''}${p.reference ? ` (${p.reference})` : ''}`,
      value: Number(p.amount || 0),
    })
  );

  const extras = [];
  if (cashTendered > 0) extras.push({ label: 'Cash Tendered', value: cashTendered });
  if (change > 0) extras.push({ label: 'CHANGE', value: change, strong: true });
  if (Number(invoice.refunded || 0) > 0) extras.push({ label: 'Refunded', value: Number(invoice.refunded) });
  if (invoice.customer_id) {
    extras.push({
      label: `Loyalty Points${Number(invoice.points_earned || 0) > 0 ? ` (+${Number(invoice.points_earned).toLocaleString()})` : ''}`,
      value: `${Number(invoice.customer_points || 0).toLocaleString()} pts`,
    });
    if (Number(invoice.customer_wallet || 0) > 0)
      extras.push({ label: 'Wallet Balance', value: Number(invoice.customer_wallet) });
  }

  return {
    title: invoice.billTitle || (invoice.isPreview ? 'Bill Review' : 'Sales Invoice'),
    number,
    numberLabel: 'Bill No',
    date: invoice.created_at,
    branch: invoice.branch,
    copyLabel: invoice.isPreview ? 'REVIEW COPY' : invoice.isReprint ? 'REPRINT' : '',
    parties: [
      ['Customer', `${invoice.customer || 'Walk-in customer'}${invoice.customer_phone ? ` (${invoice.customer_phone})` : ''}`],
      ['Cashier', invoice.cashier],
      ['Sales Staff', invoice.seller_name],
    ],
    items: (invoice.items || []).map(it => ({
      name: it.name,
      meta: [
        it.sku ? `SKU: ${it.sku}` : '',
        it.code ? `S/N: ${it.code}` : '',
        it.imei ? `IMEI: ${it.imei}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      qty: Number(it.qty || 1),
      price: Number(it.price || 0),
      total: Number(it.total ?? Number(it.qty || 1) * Number(it.price || 0)),
    })),
    totals,
    payments,
    extras,
    status: invoice.isPreview
      ? { tone: 'info', label: 'Payment not recorded' }
      : Number(invoice.refunded || 0) > 0
        ? { tone: 'info', label: Number(invoice.refunded) >= total ? 'Refunded' : 'Partially Refunded', value: Number(invoice.refunded) }
      : credit > 0
        ? { tone: 'due', label: `${credit >= total ? 'Unpaid' : 'Partially Paid'}${invoice.due_date ? ' · ' + dateLabel(invoice.due_date) : ''}`, value: credit }
        : { tone: 'paid', label: 'Paid in Full' },
    notes: invoice.notes,
  };
}

/** Repair intake slip & repair delivery / payment bill. */
export function repairJobToBill(job = {}, settings = {}, branchName = '', mode = 'intake') {
  const delivery = mode === 'delivery';
  const charge = Number(job.final_charge || job.estimate || 0);
  const paid = Number(job.paid_amount ?? job.advance_paid ?? job.advance ?? 0);
  const balance = Math.max(0, charge - paid);

  const payments = [];
  if (paid > 0)
    payments.push({ label: `${delivery ? 'Total Paid' : 'Advance Paid'}${job.payment_method ? ` (${job.payment_method})` : ''}`, value: paid });

  return {
    title: delivery ? 'Repair Delivery Bill' : 'Repair Intake Receipt',
    number: job.job_number || (job.id ? ref('RJ', job.id) : '—'),
    numberLabel: 'Job No',
    date: job.delivered_at && delivery ? job.delivered_at : job.created_at,
    branch: branchName || job.branch_name || '',
    parties: [
      ['Customer', job.customer || 'Walk-in'],
      ['Phone', job.phone || job.customer_phone],
      ['Technician', job.technician || 'Unassigned'],
    ],
    sections: [
      {
        title: 'Device Details',
        rows: [
          ['Device', job.device],
          ['IMEI / Serial', job.serial || 'N/A'],
          ['Status', job.status],
          [delivery ? 'Delivered' : 'Promised Date', delivery ? billDateTime(job.delivered_at) : dateLabel(job.due_date || new Date().toISOString().slice(0, 10))],
        ],
        notes: [
          ['Reported Issue', job.issue],
          ['Accessories', job.accessories],
          ['Technician Notes', job.notes],
        ],
      },
    ],
    totals: [
      { label: delivery ? 'Final Repair Charge' : 'Estimated Repair Charge', value: charge, strong: true },
    ],
    payments,
    status:
      balance > 0
        ? { tone: 'due', label: paid > 0 ? 'Partially Paid' : 'Unpaid', value: balance }
        : { tone: 'paid', label: charge > 0 ? 'Paid in Full' : 'No Charge' },
    footerNote: delivery
      ? 'Device handed over in working condition. Warranty as per shop policy.'
      : 'Please bring this slip when collecting your device.',
  };
}

/** Store Reservation Deposit / Payment / Handover bill. */
export function reservationToBill(rsv = {}, settings = {}, branchName = '') {
  const total = Number(rsv.total || 0);
  const paid = Number(rsv.paid || 0);
  const balance = Math.max(0, total - paid);
  const unitPrice = Number(rsv.unit_price || (rsv.qty ? Math.round(total / Number(rsv.qty)) : total));
  const qty = Number(rsv.qty || 1);

  return {
    title: rsv.status === 'Delivered' ? 'Reservation Handover Bill' : 'Reservation Slip',
    number: rsv.id ? ref('RSV', rsv.id) : '—',
    numberLabel: 'Reservation No',
    date: rsv.created_at,
    branch: branchName || rsv.branch_name || '',
    parties: [
      ['Customer', `${rsv.customer_name || rsv.customer || 'Customer'}${rsv.customer_phone ? ` (${rsv.customer_phone})` : ''}`],
      ['Status', rsv.status || 'Held'],
    ],
    items: [
      {
        name: rsv.product || 'Reserved Item',
        meta: rsv.unit_code ? `S/N: ${rsv.unit_code}` : '',
        qty,
        price: unitPrice,
        total,
      },
    ],
    totals: [{ label: 'RESERVATION TOTAL', value: total, grand: true }],
    payments: paid > 0 ? [{ label: 'Deposit / Paid', value: paid }] : [],
    extras:
      Number(rsv.points_earned || 0) > 0
        ? [{ label: 'Loyalty Points Earned', value: `+${Number(rsv.points_earned).toLocaleString()} pts` }]
        : [],
    status:
      rsv.status === 'Cancelled'
        ? { tone: 'info', label: 'Cancelled · Deposit Refunded' }
        : balance > 0
          ? { tone: 'due', label: paid > 0 ? 'Partially Paid' : 'Unpaid', value: balance }
          : { tone: 'paid', label: rsv.status === 'Delivered' ? 'Handed Over · Paid' : 'Ready for Handover' },
    footerNote: 'Please present this reservation slip when collecting your reserved item.',
  };
}

/** Return or Exchange bill. */
export function returnToBill(ret = {}, settings = {}, branchName = '') {
  const isExchange = Boolean(ret.replacement);
  const refundAmt = Number(ret.amount || 0);
  const quoted = Number(ret.quoted_total || 0);
  const diff = quoted - refundAmt;
  const qty = Number(ret.qty || 1);

  const items = [
    {
      name: `${ret.product || 'Returned Item'} (Returned)`,
      meta: ret.condition_note ? `Condition: ${ret.condition_note}` : '',
      qty,
      price: qty ? Math.round(refundAmt / qty) : refundAmt,
      total: refundAmt,
    },
  ];
  if (isExchange) {
    const replacements = ret.replacement_items?.length ? ret.replacement_items : [{
      name: ret.replacement,
      qty: Number(ret.replacement_qty || 1),
      price: Math.round(quoted / Number(ret.replacement_qty || 1)),
      total: quoted,
    }];
    items.push(...replacements.map(item => ({
      ...item,
      name: item.name,
      meta: ret.replacement_sale_id ? `New Bill: ${ref('INV', ret.replacement_sale_id)}` : 'Exchange Item',
    })));
  }

  return {
    title: isExchange ? 'Exchange Bill' : 'Sales Return Bill',
    number: ret.id ? ref('RET', ret.id) : '—',
    numberLabel: 'Return No',
    date: ret.created_at,
    branch: branchName || ret.branch || '',
    parties: [
      ['Original Bill', ret.sale_id ? ref('INV', ret.sale_id) : '—'],
      ['Customer', ret.customer || 'Walk-in'],
      ...(!isExchange || diff < 0 ? [['Refund Method', ret.method || 'Cash']] : []),
      ['Status', ret.status || 'Pending'],
    ],
    items,
    totals: [
      { label: isExchange ? 'Return Credit' : 'REFUND TOTAL', value: refundAmt, grand: !isExchange },
      ...(isExchange ? [{ label: 'Replacement Total', value: quoted, grand: true }] : []),
    ],
    extras: isExchange && ret.status === 'Completed' ? [
      ...(ret.settlement_payments || []).map(p => ({
        label: p.reference ? `${p.method} · ${p.reference}` : p.method,
        value: Number(p.amount),
      })),
      ...(diff > 0 && Number(ret.cash_received) > 0 ? [
        { label: 'Cash Received', value: Number(ret.cash_received) },
        { label: 'Change Given', value: Number(ret.change) },
      ] : []),
      ...(diff < 0 && ret.reference ? [{ label: 'Refund Reference', value: ret.reference }] : []),
    ] : [],
    status:
      ret.status === 'Rejected'
        ? { tone: 'info', label: 'Request Rejected' }
        : ret.status !== 'Completed'
          ? { tone: 'info', label: `Return ${ret.status || 'Pending'}` }
        : isExchange
          ? diff > 0
            ? { tone: 'paid', label: 'Difference Paid', value: diff }
            : diff < 0
              ? { tone: 'paid', label: 'Difference Refunded', value: Math.abs(diff) }
              : { tone: 'paid', label: 'Even Exchange' }
          : { tone: 'paid', label: `Refund (${ret.method || 'Cash'})`, value: refundAmt },
    notes: ret.reason,
  };
}

/** Supplier Purchase / Stock Receive bill. */
export function purchaseToBill(po = {}, settings = {}, branchName = '') {
  const qty = Number(po.qty || 1);
  const unitCost = Number(po.unit_cost || 0);
  const totalCost = Number(po.total_cost ?? qty * unitCost);
  const balance = Number(po.balance || 0);
  const paid = Math.max(0, totalCost - balance);

  return {
    title: 'Purchase Receive Bill',
    number: po.id ? ref('PO', po.id) : '—',
    numberLabel: 'PO No',
    date: po.created_at,
    branch: branchName || po.branch_name || '',
    parties: [
      ['Supplier', `${po.supplier || 'Supplier'}${po.supplier_phone ? ` (${po.supplier_phone})` : ''}`],
      ['Supplier Inv', po.invoice || '—'],
    ],
    items: [
      {
        name: po.product || 'Item',
        meta: po.sku ? `SKU: ${po.sku}` : '',
        qty,
        price: unitCost,
        total: totalCost,
      },
    ],
    totals: [{ label: 'TOTAL COST', value: totalCost, grand: true }],
    payments: paid > 0 ? [{ label: 'Paid to Supplier', value: paid }] : [],
    status:
      balance > 0
        ? { tone: 'due', label: paid > 0 ? 'Partially Paid' : 'Unpaid', value: balance }
        : { tone: 'paid', label: 'Settled in Full' },
  };
}

/** Inter-branch Stock Transfer bill / waybill. */
export function transferToBill(tr = {}, settings = {}) {
  return {
    title: 'Stock Transfer Bill',
    number: tr.id ? ref('ST', tr.id) : '—',
    numberLabel: 'Transfer No',
    date: tr.created_at,
    branch: `${tr.source || ''} -> ${tr.destination || ''}`,
    parties: [
      ['From Branch', tr.source || `Branch #${tr.from_branch}`],
      ['To Branch', tr.destination || `Branch #${tr.to_branch}`],
      ['Status', tr.status || 'Requested'],
    ],
    items: [
      {
        name: tr.product || 'Stock Item',
        meta: [tr.sku ? `SKU: ${tr.sku}` : '', tr.unit_code ? `S/N: ${tr.unit_code}` : ''].filter(Boolean).join(' · '),
        qty: Number(tr.qty || 1),
        price: Number(tr.cost || tr.price || 0),
        total: Number(tr.qty || 1) * Number(tr.cost || tr.price || 0),
      },
    ],
    status: {
      tone: tr.status === 'Received' ? 'paid' : tr.status === 'Rejected' ? 'due' : 'info',
      label: `Transfer ${tr.status || 'Requested'}`,
    },
    footerNote: 'Authorised inter-branch stock movement slip.',
  };
}

/* ---------------------------------------------------------------------
   Printing
--------------------------------------------------------------------- */

/**
 * Print an isolated HTML document via Electron silent print or hidden iframe fallback.
 */
export function printHtmlDocument(html, { paperWidth = 210 } = {}) {
  if (paperWidth !== 210 && window.electronAPI?.printReceiptHtml) {
    return window.electronAPI
      .printReceiptHtml({ html, paperWidth, silent: false })
      .then(res => ({ success: res?.success ?? res?.ok ?? true, ...res }))
      .catch(err => ({ success: false, error: err?.message || 'Print failed' }));
  }

  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 800);
    };

    try {
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        cleanup();
        window.print();
        resolve({ success: true });
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          resolve({ success: true });
        } catch (err) {
          resolve({ success: false, error: err?.message || 'Print failed' });
        } finally {
          cleanup();
        }
      }, 140);
    } catch (err) {
      cleanup();
      resolve({ success: false, error: err?.message || 'Print failed' });
    }
  });
}

/**
 * Send thermal bills to the configured desktop printer or open the print dialog.
 */
export async function printBill(bill, settings = {}, options = {}) {
  const html = buildBillHtml(options.reprint && !bill.copyLabel ? { ...bill, copyLabel: 'REPRINT' } : bill, settings);
  const paperWidth = billPaperWidth(settings);
  if (paperWidth !== 210 && window.electronAPI?.printReceiptHtml) {
    try {
      const res = await window.electronAPI.printReceiptHtml({
        html,
        paperWidth,
        deviceName: paperWidth === 210 ? '' : settings?.receipt_printer_name || '',
        silent: paperWidth !== 210 && options.silent !== false,
      });
      return { success: res?.success ?? res?.ok ?? true, ...res };
    } catch (err) {
      return { success: false, error: err?.message || 'Print failed' };
    }
  }
  return printHtmlDocument(html, { paperWidth });
}

/** Backwards-compatible helpers for the POS sales invoice. */
export function buildThermalReceiptHtml(invoice, settings = {}) {
  return buildBillHtml(saleInvoiceToBill(invoice, settings), settings);
}

export async function printThermalReceipt(invoice, settings = {}, options = {}) {
  return printBill(saleInvoiceToBill(invoice, settings), settings, options);
}
