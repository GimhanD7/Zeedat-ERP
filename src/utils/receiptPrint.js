import { dateLabel, money, ref } from './formatters.js';

const esc = val =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

/**
 * Build full-height 58mm/80mm thermal receipt HTML containing every line item and settlement details.
 */
export function buildThermalReceiptHtml(invoice, settings = {}) {
  const widthMm = Number(settings?.paper_width) === 58 ? 58 : 80;
  const contentWidthMm = widthMm === 58 ? 54 : 74;
  const shopName = settings?.shop_name || 'ZEEDAT POS';
  const showTax =
    settings?.show_tax_on_receipt !== 0 && settings?.show_tax_on_receipt !== '0';

  const invNumber =
    invoice?.invoice_no ||
    invoice?.invoiceNo ||
    (invoice?.id ? ref(String(settings?.invoice_prefix || 'INV').replace(/-+$/, ''), invoice.id) : 'PREVIEW');

  const items = invoice?.items || [];
  const itemRowsHtml = items
    .map(item => {
      const skuText = item.sku ? `SKU: ${esc(item.sku)}` : '';
      const unitText = item.code ? `${esc(item.code)}${item.imei ? ' · IMEI: ' + esc(item.imei) : ''}` : '';
      const metaCombined = [skuText, unitText].filter(Boolean).join(' · ');
      const serialLine = metaCombined
        ? `<div class="item-meta">${metaCombined}</div>`
        : '';
      return `
        <tr>
          <td class="col-item">
            <div class="item-name">${esc(item.name || 'Item')}</div>
            ${serialLine}
            <div class="item-rate">${Number(item.qty || 1)} &times; ${esc(money(item.price || 0))}</div>
          </td>
          <td class="col-qty">${Number(item.qty || 1)}</td>
          <td class="col-amt">${esc(money(item.total ?? Number(item.qty || 1) * Number(item.price || 0)))}</td>
        </tr>`;
    })
    .join('');

  const payments = invoice?.payments || [];
  const paymentRowsHtml = payments
    .map(
      p => `
        <div class="sum-row">
          <span>${esc(p.method)}${p.kind === 'Credit' ? ' repayment' : ''}${p.reference ? ` (${esc(p.reference)})` : ''}</span>
          <strong>${esc(money(p.amount))}</strong>
        </div>`
    )
    .join('');

  const cashTendered = Number(invoice?.cashTendered ?? invoice?.cash_tendered ?? 0);
  const changeAmount = Number(invoice?.change ?? invoice?.change_amount ?? 0);
  const discPct = invoice?.discount_bps ? ` (${(Number(invoice.discount_bps) / 100).toFixed(Number(invoice.discount_bps) % 100 === 0 ? 0 : 1)}%)` : '';
  const taxPct = invoice?.tax_bps ? ` (${(Number(invoice.tax_bps) / 100).toFixed(Number(invoice.tax_bps) % 100 === 0 ? 0 : 1)}%)` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(invNumber)}</title>
<style>
  @page {
    size: ${widthMm}mm auto;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  html, body {
    width: ${widthMm}mm;
    background: #fff;
    color: #000;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: ${widthMm === 58 ? '10px' : '11px'};
    line-height: 1.35;
  }
  .ticket {
    width: ${contentWidthMm}mm;
    margin: 0 auto;
    padding: 3mm 1.5mm 6mm;
  }
  .center { text-align: center; }
  .shop-name {
    font-size: ${widthMm === 58 ? '13px' : '15px'};
    font-weight: 800;
    letter-spacing: 0.3px;
  }
  .meta-line {
    font-size: ${widthMm === 58 ? '9px' : '10px'};
    margin-top: 1px;
    word-break: break-word;
  }
  .sep {
    border: none;
    border-top: 1px dashed #000;
    margin: 5px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-size: ${widthMm === 58 ? '9px' : '10px'};
    font-weight: 700;
    border-bottom: 1px solid #000;
    padding: 2px 0 3px;
  }
  th.col-qty, td.col-qty {
    text-align: center;
    width: 24px;
    vertical-align: top;
    padding-top: 3px;
  }
  th.col-amt, td.col-amt {
    text-align: right;
    white-space: nowrap;
    vertical-align: top;
    padding-top: 3px;
    font-weight: 600;
  }
  td.col-item {
    padding: 3px 4px 3px 0;
    vertical-align: top;
  }
  .item-name {
    font-weight: 600;
    word-break: break-word;
  }
  .item-meta, .item-rate {
    font-size: ${widthMm === 58 ? '8.5px' : '9.5px'};
    color: #222;
  }
  .sum-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin: 2px 0;
    font-size: ${widthMm === 58 ? '10px' : '11px'};
  }
  .sum-row.grand {
    font-size: ${widthMm === 58 ? '12px' : '13px'};
    font-weight: 800;
    border-top: 1px dashed #000;
    border-bottom: 1px dashed #000;
    padding: 4px 0;
    margin: 4px 0;
  }
  .sum-row.change {
    font-weight: 800;
    font-size: ${widthMm === 58 ? '11px' : '12px'};
    margin-top: 3px;
  }
  .footer-msg {
    text-align: center;
    font-size: ${widthMm === 58 ? '9px' : '10px'};
    margin-top: 6px;
    word-break: break-word;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="center">
      <div class="shop-name">${esc(shopName)}</div>
      ${invoice?.branch ? `<div class="meta-line">${esc(invoice.branch)}</div>` : ''}
      ${settings?.shop_address ? `<div class="meta-line">${esc(settings.shop_address)}</div>` : ''}
      ${settings?.shop_phone ? `<div class="meta-line">Tel: ${esc(settings.shop_phone)}</div>` : ''}
    </div>
    <hr class="sep" />
    <div class="meta-line"><strong>Bill:</strong> ${esc(invNumber)}${invoice?.isPreview ? ' (Review)' : ''}</div>
    <div class="meta-line"><strong>Date:</strong> ${esc(invoice?.created_at ? dateLabel(invoice.created_at) : dateLabel(new Date().toISOString().slice(0, 10)))}</div>
    ${invoice?.cashier ? `<div class="meta-line"><strong>Cashier:</strong> ${esc(invoice.cashier)}</div>` : ''}
    <div class="meta-line"><strong>Customer:</strong> ${esc(invoice?.customer || 'Walk-in customer')}${invoice?.customer_phone ? ` (${esc(invoice.customer_phone)})` : ''}</div>
    <hr class="sep" />
    <table>
      <thead>
        <tr>
          <th>Item (${items.length})</th>
          <th class="col-qty">Qty</th>
          <th class="col-amt">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml}
      </tbody>
    </table>
    <hr class="sep" />
    <div class="sum-row">
      <span>Subtotal</span>
      <strong>${esc(money(invoice?.subtotal || 0))}</strong>
    </div>
    ${
      Number(invoice?.discount || 0) > 0
        ? `<div class="sum-row"><span>Discount${esc(discPct)}</span><strong>- ${esc(money(invoice.discount))}</strong></div>`
        : ''
    }
    ${
      showTax
        ? `<div class="sum-row"><span>Tax${esc(taxPct)}</span><strong>${esc(money(invoice?.tax || 0))}</strong></div>`
        : ''
    }
    <div class="sum-row grand">
      <span>TOTAL</span>
      <strong>${esc(money(invoice?.total || 0))}</strong>
    </div>
    ${
      Number(invoice?.wallet_used || 0) > 0
        ? `<div class="sum-row"><span>Wallet Paid</span><strong>${esc(money(invoice.wallet_used))}</strong></div>`
        : ''
    }
    ${paymentRowsHtml}
    ${
      cashTendered > 0
        ? `<div class="sum-row"><span>Cash Tendered</span><strong>${esc(money(cashTendered))}</strong></div>`
        : ''
    }
    ${
      changeAmount > 0
        ? `<div class="sum-row change"><span>CHANGE RETURN</span><strong>${esc(money(changeAmount))}</strong></div>`
        : ''
    }
    ${
      Number(invoice?.points_earned || 0) > 0 || invoice?.customer_id
        ? `<div class="sum-row"><span>Loyalty Points (+${Number(invoice?.points_earned || 0).toLocaleString()} pts)</span><strong>${Number(invoice?.customer_points || 0).toLocaleString()} pts</strong></div>`
        : ''
    }
    ${
      invoice?.customer_id && Number(invoice?.customer_wallet || 0) > 0
        ? `<div class="sum-row"><span>Wallet Balance</span><strong>${esc(money(invoice.customer_wallet))}</strong></div>`
        : ''
    }
    ${
      Number(invoice?.credit || 0) > 0
        ? `<div class="sum-row"><span>Balance Due (${esc(dateLabel(invoice.due_date))})</span><strong>${esc(money(invoice.credit))}</strong></div>`
        : ''
    }
    ${
      Number(invoice?.refunded || 0) > 0
        ? `<div class="sum-row"><span>Refunded</span><strong>${esc(money(invoice.refunded))}</strong></div>`
        : ''
    }
    ${
      invoice?.notes
        ? `<div class="meta-line" style="margin-top:4px;"><strong>Note:</strong> ${esc(invoice.notes)}</div>`
        : ''
    }
    <hr class="sep" />
    <div class="footer-msg">${esc(settings?.receipt_footer || 'Thank you for your business!')}</div>
  </div>
</body>
</html>`;
}

/**
 * Print an isolated HTML document via hidden iframe without printing the main app workspace.
 */
export function printHtmlDocument(html) {
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
 * Print a full thermal receipt with all items via Electron silent printer or clean browser iframe fallback.
 */
export async function printThermalReceipt(invoice, settings = {}, options = {}) {
  const html = buildThermalReceiptHtml(invoice, settings);
  const paperWidth = Number(settings?.paper_width) === 58 ? 58 : 80;

  if (window.electronAPI?.printReceiptHtml) {
    return window.electronAPI.printReceiptHtml({
      html,
      paperWidth,
      deviceName: settings?.receipt_printer_name || '',
      silent: options.silent ?? true,
    });
  }

  return printHtmlDocument(html);
}
