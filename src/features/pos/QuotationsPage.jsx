import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  MapPin,
  Pencil,
  PhoneCall,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Field,
  FilterTabs,
  Heading,
  Panel,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, money, printHtmlDocument, ref, timeLabel, today } from '../../utils';
import './quotations.css';

const DEFAULT_HEADER_PHONES = '077 089 4099 | 074 192 8979';
const DEFAULT_HEADER_TAGLINE =
  'Mobile Phones|Laptops|Computers|Accessories| Hardware & Software Repair';
const DEFAULT_FOOTER_ADDRESSES =
  'No. 148, Main Street, Battaramulla | No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)';

const WARRANTY_PRESETS = [
  '1 year Company warranty',
  '6 Months Warranty',
  '3 Months Warranty',
  '2 Years Company Warranty',
  'No Warranty',
];

const MIN_TABLE_ROWS = 12;

const fmtNum = centsVal => {
  const num = Number(centsVal || 0) / 100;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtQty = q => {
  const n = Math.max(1, parseInt(q, 10) || 1);
  return n < 10 ? `0${n}` : String(n);
};

const fmtShortDate = isoDate => {
  if (!isoDate) return '';
  const str = String(isoDate).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
  }
  return str;
};

const createEmptyItem = () => ({
  key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  product_id: '',
  description: '',
  warranty: '1 year Company warranty',
  qty: '1',
  unit_price: '',
});

const statusTone = status => {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'invoiced') return 'green';
  if (s === 'sent') return 'blue';
  if (s === 'rejected') return 'red';
  if (s === 'draft') return 'amber';
  return 'slate';
};

/**
 * Builds standalone printable A4 HTML that exactly matches the ZEEDAT gold & black PDF template.
 */
function buildQuotationA4Html(doc) {
  const esc = v =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const isInvoice = doc.doc_type === 'Invoice';
  const docTitle = isInvoice ? 'INVOICE' : 'QUOTATION';
  const toLabel = isInvoice ? 'INVOICE TO:' : 'QUOTATION TO:';
  const noLabel = isInvoice ? 'INVOICE NO:' : 'QUOTATION NO:';
  const dateLabelTxt = isInvoice ? 'INVOICE DATE:' : 'QUOTATION DATE:';
  const validLabel = isInvoice ? 'PAYMENT TERMS:' : 'VALID UNTIL:';

  const taglineParts = String(doc.header_tagline || DEFAULT_HEADER_TAGLINE).split(/Hardware/i);
  const taglineLine1 = taglineParts[0]?.trim() || 'Mobile Phones|Laptops|Computers|Accessories|';
  const taglineLine2 =
    taglineParts.length > 1 ? `Hardware${taglineParts.slice(1).join('Hardware')}`.trim() : 'Hardware & Software Repair';

  const footerParts = String(doc.footer_addresses || DEFAULT_FOOTER_ADDRESSES).split('|');
  const footerLeft = footerParts[0]?.trim() || 'No. 148, Main Street, Battaramulla';
  const footerRight =
    footerParts.slice(1).join(' | ').trim() || 'No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)';

  const items = Array.isArray(doc.items) ? doc.items : [];
  const totalRows = Math.max(MIN_TABLE_ROWS, items.length);
  let rowsHtml = '';

  for (let i = 0; i < totalRows; i++) {
    const item = items[i];
    if (item && String(item.description || '').trim()) {
      const qtyNum = Math.max(1, parseInt(item.qty, 10) || 1);
      const unitCents = Number(item.unit_price_cents ?? item.unit_price ?? 0);
      const lineCents = qtyNum * unitCents;
      rowsHtml += `
        <tr class="q-row filled">
          <td class="c-desc">
            <div class="d-main">${esc(item.description)}</div>
            ${item.warranty ? `<div class="d-sub">${esc(item.warranty)}</div>` : ''}
          </td>
          <td class="c-qty">${esc(fmtQty(qtyNum))}</td>
          <td class="c-price">${esc(fmtNum(unitCents))}</td>
          <td class="c-total">${esc(fmtNum(lineCents))}</td>
        </tr>`;
    } else {
      rowsHtml += `
        <tr class="q-row empty">
          <td class="c-desc">&nbsp;</td>
          <td class="c-qty">&nbsp;</td>
          <td class="c-price">&nbsp;</td>
          <td class="c-total">&nbsp;</td>
        </tr>`;
    }
  }

  const subtotalCents = Number(doc.subtotal_cents ?? doc.subtotal ?? 0);
  const discountCents = Number(doc.discount_cents ?? doc.discount ?? 0);
  const grandCents = Math.max(0, subtotalCents - discountCents);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(docTitle)} ${esc(doc.quote_no)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      min-height: 297mm;
      background: #ffffff;
      color: #000000;
      font-family: 'Times New Roman', Times, Georgia, serif;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #ffffff;
      position: relative;
    }
    .header-wrap {
      position: relative;
      width: 100%;
      height: 145px;
      overflow: hidden;
      background: #ffffff;
    }
    .header-gold-strip {
      position: absolute;
      left: 0;
      bottom: 18px;
      width: 48%;
      height: 14px;
      background: linear-gradient(90deg, #caa018 0%, #e4b61a 100%);
      z-index: 1;
    }
    .header-black-poly {
      position: absolute;
      top: 0;
      left: 0;
      width: 63%;
      height: 142px;
      background: #050505;
      clip-path: polygon(0 0, 100% 0, 82% 100%, 69% 79%, 0 79%);
      z-index: 3;
      display: flex;
      align-items: flex-start;
      padding: 16px 20px 0 22px;
      color: #ffffff;
    }
    .header-gold-poly {
      position: absolute;
      top: 16px;
      right: 0;
      width: 48%;
      height: 126px;
      background: linear-gradient(135deg, #f5cd2f 0%, #c8960c 58%, #9b7004 100%);
      clip-path: polygon(19% 0, 100% 0, 100% 100%, 0 100%);
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 18px 8px 46px;
    }
    .logo-box {
      width: 62px;
      height: 76px;
      border: 1.5px solid #3a2e0b;
      background: #070707;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-right: 18px;
      flex-shrink: 0;
    }
    .logo-phone {
      width: 24px;
      height: 38px;
      border: 2px solid #e2af0d;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e2af0d;
      font-family: Arial, sans-serif;
      font-weight: 900;
      font-size: 16px;
      margin-bottom: 4px;
    }
    .logo-word {
      font-family: Arial, sans-serif;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #ffffff;
    }
    .brand-center {
      text-align: center;
      flex: 1;
      padding-right: 45px;
    }
    .brand-title {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 31px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #e2e8f0;
      margin: 0 0 6px;
      line-height: 1;
    }
    .brand-sub {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11.5px;
      color: #f1f5f9;
      line-height: 1.45;
      letter-spacing: 0.3px;
    }
    .doc-heading {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 31px;
      font-weight: 600;
      letter-spacing: 1.5px;
      color: #ffffff;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.28);
      margin: 0 0 12px;
    }
    .phone-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      font-weight: 800;
      color: #050505;
    }
    .phone-badge {
      width: 22px;
      height: 22px;
      border-radius: 5px;
      background: #050505;
      color: #f3c623;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .body-pad {
      padding: 10px 42px 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .meta-grid {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 16px;
      font-size: 15.5px;
      line-height: 1.55;
    }
    .meta-left {
      width: 56%;
    }
    .meta-right {
      width: 40%;
    }
    .meta-line {
      margin-bottom: 6px;
      word-break: break-word;
    }
    .q-table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
      font-size: 13.5px;
    }
    .q-table thead th {
      background: #e2af0d;
      color: #ffffff;
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 15.5px;
      font-weight: 700;
      padding: 9px 10px;
      border-bottom: 1.5px solid #222222;
    }
    .q-table thead th.h-desc { width: 52%; text-align: center; }
    .q-table thead th.h-qty { width: 14%; text-align: center; }
    .q-table thead th.h-price { width: 17%; text-align: center; }
    .q-table thead th.h-total { width: 17%; text-align: center; }
    .q-table tbody tr {
      height: 36px;
      border-bottom: 1px solid #222222;
    }
    .q-table td {
      padding: 5px 10px;
      vertical-align: middle;
    }
    .q-table td.c-desc {
      background: #ffffff;
      text-align: left;
    }
    .q-table td.c-qty {
      background: #efefef;
      text-align: center;
    }
    .q-table td.c-price {
      background: #ffffff;
      text-align: center;
    }
    .q-table td.c-total {
      background: #efefef;
      text-align: center;
    }
    .d-main {
      font-weight: 500;
      color: #000000;
      line-height: 1.25;
    }
    .d-sub {
      font-size: 12.5px;
      color: #111111;
      line-height: 1.25;
      margin-top: 1px;
    }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 18px;
    }
    .totals-box {
      width: 265px;
      font-size: 15.5px;
    }
    .tot-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 10px;
      margin-bottom: 4px;
    }
    .tot-row strong {
      font-family: 'Times New Roman', Georgia, serif;
      font-weight: 700;
    }
    .tot-val {
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
      font-size: 13.5px;
    }
    .tot-grand {
      background: #e2af0d;
      padding: 8px 12px;
      margin-top: 6px;
      font-weight: 700;
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 16px;
    }
    .signatures-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 28px;
      padding-top: 10px;
    }
    .sig-left {
      width: 52%;
      text-align: center;
    }
    .sig-right {
      width: 44%;
      text-align: center;
    }
    .sig-dots {
      letter-spacing: 2px;
      font-size: 14px;
      margin-bottom: 6px;
      color: #111111;
    }
    .sig-title {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .sig-note {
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
      font-size: 12px;
      font-style: italic;
      font-weight: 600;
      line-height: 1.6;
    }
    .accept-prompt {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 15px;
      line-height: 1.38;
      margin-bottom: 22px;
    }
    .bottom-bar {
      width: 100%;
      background: #050505;
      border-top: 4px solid #e2af0d;
      color: #ffffff;
      padding: 10px 20px;
      text-align: center;
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 13.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .pin-gold {
      color: #e2af0d;
      font-weight: 900;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div>
      <div class="header-wrap">
        <div class="header-gold-strip"></div>
        <div class="header-black-poly">
          <div class="logo-box">
            <div class="logo-phone">Z</div>
            <div class="logo-word">ZEEDAT</div>
          </div>
          <div class="brand-center">
            <div class="brand-title">ZEEDAT</div>
            <div class="brand-sub">
              <div>${esc(taglineLine1)}</div>
              <div>${esc(taglineLine2)}</div>
            </div>
          </div>
        </div>
        <div class="header-gold-poly">
          <div class="doc-heading">${esc(docTitle)}</div>
          <div class="phone-row">
            <span class="phone-badge">&#9742;</span>
            <span>${esc(doc.header_phones || DEFAULT_HEADER_PHONES)}</span>
          </div>
        </div>
      </div>

      <div class="body-pad">
        <div class="meta-grid">
          <div class="meta-left">
            <div class="meta-line">${esc(toLabel)} ${esc(doc.client_name)}</div>
            <div class="meta-line">CONTACT: ${esc(doc.client_contact || '')}</div>
            <div class="meta-line">ADDRESS: ${esc(doc.client_address || '')}</div>
          </div>
          <div class="meta-right">
            <div class="meta-line">${esc(noLabel)}${esc(doc.quote_no)}</div>
            <div class="meta-line">${esc(dateLabelTxt)}${esc(fmtShortDate(doc.quote_date))}</div>
            <div class="meta-line">${esc(validLabel)}${esc(doc.valid_until || '')}</div>
          </div>
        </div>

        <table class="q-table">
          <thead>
            <tr>
              <th class="h-desc">Description of Service / Product</th>
              <th class="h-qty">Qty</th>
              <th class="h-price">Unit Price</th>
              <th class="h-total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="totals-wrap">
          <div class="totals-box">
            <div class="tot-row">
              <strong>Sub Total:</strong>
              <span class="tot-val">${esc(fmtNum(subtotalCents))}</span>
            </div>
            <div class="tot-row">
              <strong>Discount:</strong>
              <span class="tot-val">${discountCents > 0 ? esc(fmtNum(discountCents)) : ''}</span>
            </div>
            <div class="tot-row tot-grand">
              <span>Grand Total:</span>
              <span>${esc(fmtNum(grandCents))}</span>
            </div>
          </div>
        </div>

        <div class="signatures-grid">
          <div class="sig-left">
            <div class="sig-dots">..............................................</div>
            <div class="sig-title">Business Signature</div>
            <div class="sig-note">
              <div>If you have any questions concerning this ${isInvoice ? 'Invoice' : 'Quotation'}, please contact Us.</div>
              <div><strong>Thank You for Your Business.</strong></div>
            </div>
          </div>
          <div class="sig-right">
            <div class="accept-prompt">
              Please Confirm Your Acceptance<br/>of This ${isInvoice ? 'Invoice' : 'Quote'}:
            </div>
            <div class="sig-dots">............................................</div>
            <div class="sig-title">Client Signature &amp; Date</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-bar">
      <span class="pin-gold">&#9906;</span>
      <span>${esc(footerLeft)}</span>
      <span><strong>|</strong></span>
      <span>${esc(footerRight)}</span>
    </div>
  </div>
</body>
</html>`;
}

export function QuotationsPage({ ctx }) {
  const state = useData(ctx, {
    quotations: 'quotations',
    products: 'products',
    customers: 'customers',
  });

  return (
    <DataView state={state}>
      {data => <QuotationsWorkspace ctx={ctx} data={data} onRefresh={state.refresh} />}
    </DataView>
  );
}

function QuotationsWorkspace({ ctx, data, onRefresh }) {
  const { quotations = [], products = [], customers = [] } = data;
  const previewRef = useRef(null);

  const [activeTab, setActiveTab] = useState('builder');
  const [editingId, setEditingId] = useState(null);
  const [docType, setDocType] = useState('Quotation');
  const [quoteNo, setQuoteNo] = useState('');
  const [quoteDate, setQuoteDate] = useState(() => today());
  const [validUntil, setValidUntil] = useState('14');
  const [customerId, setCustomerId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [status, setStatus] = useState('Saved');
  const [notes, setNotes] = useState('');
  const [headerPhones, setHeaderPhones] = useState(DEFAULT_HEADER_PHONES);
  const [headerTagline, setHeaderTagline] = useState(DEFAULT_HEADER_TAGLINE);
  const [footerAddresses, setFooterAddresses] = useState(DEFAULT_FOOTER_ADDRESSES);
  const [showHeaderSettings, setShowHeaderSettings] = useState(false);
  const [items, setItems] = useState(() => [createEmptyItem()]);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState('');

  // History tab filters
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  // Compute next 4-digit quotation number automatically
  const nextAutoNumber = useMemo(() => {
    let maxNum = 90;
    for (const q of quotations) {
      const parsed = parseInt(String(q.quote_no || '').replace(/\D/g, ''), 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
    return String(maxNum + 1).padStart(4, '0');
  }, [quotations]);

  useEffect(() => {
    if (!editingId && !quoteNo) {
      setQuoteNo(nextAutoNumber);
    }
  }, [nextAutoNumber, editingId]);

  // All products in catalog — INCLUDING 0 stock items!
  const allCatalogOptions = useMemo(
    () =>
      products.map(p => {
        const qty = Number(p.qty ?? 0);
        const stockLabel = qty > 0 ? `Stock: ${qty}` : '0 Stock (Allowed for Quote)';
        return [
          p.id,
          `${p.name}${p.sku ? ` (${p.sku})` : ''} · ${money(p.price)} · ${stockLabel}`,
        ];
      }),
    [products]
  );

  const customerOptions = useMemo(
    () =>
      customers.map(c => [
        c.id,
        `${c.name} · ${c.phone || 'No phone'} (${ref('CUS', c.id)})`,
      ]),
    [customers]
  );

  // Calculated line totals & summary
  const computedLines = useMemo(
    () =>
      items.map(line => {
        const qtyNum = Math.max(1, parseInt(line.qty, 10) || 1);
        const unitCents = Math.max(0, cents(line.unit_price || 0));
        const totalCents = qtyNum * unitCents;
        return {
          ...line,
          qtyNum,
          unit_price_cents: unitCents,
          line_total_cents: totalCents,
        };
      }),
    [items]
  );

  const subtotalCents = useMemo(
    () =>
      computedLines.reduce(
        (sum, l) => (String(l.description || '').trim() ? sum + l.line_total_cents : sum),
        0
      ),
    [computedLines]
  );

  const discountCents = Math.min(subtotalCents, Math.max(0, cents(discountInput || 0)));
  const grandTotalCents = Math.max(0, subtotalCents - discountCents);

  const currentDocPreview = useMemo(
    () => ({
      id: editingId,
      doc_type: docType,
      quote_no: quoteNo || nextAutoNumber,
      quote_date: quoteDate,
      valid_until: validUntil,
      client_name: clientName || 'Customer / Company Name',
      client_contact: clientContact,
      client_address: clientAddress,
      header_phones: headerPhones,
      header_tagline: headerTagline,
      footer_addresses: footerAddresses,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      grand_total_cents: grandTotalCents,
      items: computedLines,
    }),
    [
      editingId,
      docType,
      quoteNo,
      nextAutoNumber,
      quoteDate,
      validUntil,
      clientName,
      clientContact,
      clientAddress,
      headerPhones,
      headerTagline,
      footerAddresses,
      subtotalCents,
      discountCents,
      grandTotalCents,
      computedLines,
    ]
  );

  const resetForm = (nextType = 'Quotation') => {
    setEditingId(null);
    setDocType(nextType);
    setQuoteNo(nextAutoNumber);
    setQuoteDate(today());
    setValidUntil('14');
    setCustomerId('');
    setClientName('');
    setClientContact('');
    setClientAddress('');
    setDiscountInput('');
    setStatus('Saved');
    setNotes('');
    setItems([createEmptyItem()]);
    setError('');
  };

  const loadQuotationToBuilder = (row, asDuplicate = false, overrideDocType = null) => {
    setEditingId(asDuplicate ? null : row.id);
    setDocType(overrideDocType || row.doc_type || 'Quotation');
    setQuoteNo(asDuplicate ? nextAutoNumber : row.quote_no || nextAutoNumber);
    setQuoteDate(asDuplicate ? today() : row.quote_date || today());
    setValidUntil(row.valid_until ?? '14');
    setCustomerId(row.customer_id ? String(row.customer_id) : '');
    setClientName(row.client_name || '');
    setClientContact(row.client_contact || '');
    setClientAddress(row.client_address || '');
    setDiscountInput(row.discount > 0 ? (Number(row.discount) / 100).toFixed(2) : '');
    setStatus(overrideDocType === 'Invoice' ? 'Invoiced' : row.status || 'Saved');
    setNotes(row.notes || '');
    setHeaderPhones(row.header_phones || DEFAULT_HEADER_PHONES);
    setHeaderTagline(row.header_tagline || DEFAULT_HEADER_TAGLINE);
    setFooterAddresses(row.footer_addresses || DEFAULT_FOOTER_ADDRESSES);

    const rowItems = Array.isArray(row.items) && row.items.length > 0
      ? row.items.map(it => ({
          key: `${it.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          product_id: it.product_id ? String(it.product_id) : '',
          description: it.description || '',
          warranty: it.warranty ?? '',
          qty: String(it.qty || 1),
          unit_price: (Number(it.unit_price || 0) / 100).toFixed(2),
        }))
      : [createEmptyItem()];

    setItems(rowItems);
    setError('');
    setActiveTab('builder');
  };

  const handleSelectCustomer = nextCustId => {
    setCustomerId(nextCustId);
    const found = customers.find(c => String(c.id) === String(nextCustId));
    if (found) {
      setClientName(found.name || '');
      setClientContact(found.phone || '');
      if (found.notes && !clientAddress) {
        setClientAddress(found.notes);
      }
    }
  };

  const updateItemLine = (index, patch) => {
    setItems(prev => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  };

  const handlePickCatalogProduct = (index, prodId) => {
    const found = products.find(p => String(p.id) === String(prodId));
    if (!found) {
      updateItemLine(index, { product_id: '' });
      return;
    }
    updateItemLine(index, {
      product_id: String(found.id),
      description: found.name || '',
      unit_price: (Number(found.price || 0) / 100).toFixed(2),
    });
  };

  const addItemLine = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItemLine = index => {
    setItems(prev => (prev.length <= 1 ? [createEmptyItem()] : prev.filter((_, i) => i !== index)));
  };

  const saveToDatabase = async () => {
    setError('');
    if (!clientName.trim()) {
      setError(`Please enter the customer or company name (${docType} To).`);
      return null;
    }
    const validLines = computedLines.filter(l => String(l.description || '').trim() !== '');
    if (validLines.length === 0) {
      setError('Please add at least one product or service description.');
      return null;
    }

    setBusy(true);
    try {
      const activeBranch =
        Number(ctx.branch) || Number(ctx.user?.branch_id) || Number(ctx.branches?.[0]?.id) || 1;
      const saved = await ctx.mutate('quotation.save', {
        id: editingId || undefined,
        branch_id: activeBranch,
        customer_id: customerId ? Number(customerId) : null,
        doc_type: docType,
        quote_no: quoteNo.trim() || nextAutoNumber,
        quote_date: quoteDate || today(),
        valid_until: validUntil.trim(),
        client_name: clientName.trim(),
        client_contact: clientContact.trim(),
        client_address: clientAddress.trim(),
        header_phones: headerPhones.trim() || DEFAULT_HEADER_PHONES,
        header_tagline: headerTagline.trim() || DEFAULT_HEADER_TAGLINE,
        footer_addresses: footerAddresses.trim() || DEFAULT_FOOTER_ADDRESSES,
        discount: discountCents,
        status,
        notes: notes.trim(),
        items: validLines.map(l => ({
          product_id: l.product_id ? Number(l.product_id) : null,
          description: l.description.trim(),
          warranty: (l.warranty || '').trim(),
          qty: l.qtyNum,
          unit_price: l.unit_price_cents,
        })),
      });

      setEditingId(saved.id);
      setQuoteNo(saved.quote_no || quoteNo);
      onRefresh?.();
      ctx.setNotice(
        `${saved.doc_type || docType} #${saved.quote_no} saved to database.`
      );
      return saved;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handlePrintA4 = docToPrint => {
    const html = buildQuotationA4Html(docToPrint);
    printHtmlDocument(html);
  };

  const handleDownloadPdf = async (docData, useLiveDom = false) => {
    setPdfBusy(true);
    setError('');
    try {
      let targetEl = useLiveDom ? previewRef.current : null;
      let tempContainer = null;

      if (!targetEl) {
        tempContainer = document.createElement('div');
        tempContainer.style.position = 'fixed';
        tempContainer.style.left = '-10000px';
        tempContainer.style.top = '0';
        tempContainer.style.width = '794px';
        tempContainer.style.background = '#ffffff';
        tempContainer.style.zIndex = '-1';
        const html = buildQuotationA4Html(docData);
        const bodyMatch = html.match(/<style>([\s\S]*?)<\/style>[\s\S]*?<body>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          tempContainer.innerHTML = `<style>${bodyMatch[1]}</style>${bodyMatch[2]}`;
        } else {
          tempContainer.innerHTML = html;
        }
        document.body.appendChild(tempContainer);
        targetEl = tempContainer.querySelector('.sheet') || tempContainer;
      }

      const canvas = await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pdfWidth = 210;
      const pdfHeight = 297;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      const prefix = docData.doc_type === 'Invoice' ? 'Invoice' : 'Quotation';
      const cleanNo = String(docData.quote_no || '0001').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanClient = String(docData.client_name || 'Client')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 30);
      pdf.save(`ZEEDAT_${prefix}_${cleanNo}_${cleanClient}.pdf`);
      ctx.setNotice(`${prefix} #${docData.quote_no} downloaded as PDF.`);
    } catch (err) {
      setError('Could not generate PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSaveAndDownloadPdf = async () => {
    const saved = await saveToDatabase();
    if (saved) {
      await handleDownloadPdf(saved, true);
    }
  };

  const handleSaveAndPrint = async () => {
    const saved = await saveToDatabase();
    if (saved) {
      handlePrintA4(saved);
    }
  };

  const handleConvertToInvoice = async row => {
    setBusy(true);
    setError('');
    try {
      const updated = await ctx.mutate('quotation.status', {
        id: row.id,
        operation: 'convert_to_invoice',
      });
      onRefresh?.();
      ctx.setNotice(`Quotation #${row.quote_no} converted to Invoice.`);
      loadQuotationToBuilder(updated, false, 'Invoice');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteQuotation = async row => {
    setBusy(true);
    setError('');
    try {
      await ctx.mutate('quotation.delete', { id: row.id });
      if (editingId === row.id) {
        resetForm(docType);
      }
      onRefresh?.();
      ctx.setNotice(`${row.doc_type || 'Quotation'} #${row.quote_no} deleted.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // KPI metrics
  const kpis = useMemo(() => {
    let quoteCount = 0;
    let invoiceCount = 0;
    let totalQuoteValue = 0;
    let totalInvoiceValue = 0;
    for (const q of quotations) {
      if (q.doc_type === 'Invoice') {
        invoiceCount++;
        totalInvoiceValue += Number(q.grand_total || 0);
      } else {
        quoteCount++;
        totalQuoteValue += Number(q.grand_total || 0);
      }
    }
    return {
      totalCount: quotations.length,
      quoteCount,
      invoiceCount,
      totalQuoteValue,
      totalInvoiceValue,
    };
  }, [quotations]);

  const filteredQuotations = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return quotations.filter(row => {
      if (historyFilter === 'quotations' && row.doc_type === 'Invoice') return false;
      if (historyFilter === 'invoices' && row.doc_type !== 'Invoice') return false;
      if (historyFilter === 'approved' && !['Approved', 'Invoiced'].includes(row.status)) return false;
      if (q) {
        const itemsText = (row.items || []).map(i => `${i.description} ${i.warranty}`).join(' ');
        const hay = `${row.quote_no} ${row.client_name} ${row.client_contact} ${row.client_address} ${itemsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [quotations, historyFilter, historySearch]);

  const taglineParts = String(headerTagline || DEFAULT_HEADER_TAGLINE).split(/Hardware/i);
  const taglineLine1 = taglineParts[0]?.trim() || 'Mobile Phones|Laptops|Computers|Accessories|';
  const taglineLine2 =
    taglineParts.length > 1
      ? `Hardware${taglineParts.slice(1).join('Hardware')}`.trim()
      : 'Hardware & Software Repair';

  const footerParts = String(footerAddresses || DEFAULT_FOOTER_ADDRESSES).split('|');
  const footerLeft = footerParts[0]?.trim() || 'No. 148, Main Street, Battaramulla';
  const footerRight =
    footerParts.slice(1).join(' | ').trim() ||
    'No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)';

  const previewRowsCount = Math.max(MIN_TABLE_ROWS, computedLines.length);

  return (
    <div className="zk-quo-page">
      <Heading
        title="Quotations & Corporate Invoices"
        description="Generate official ZEEDAT A4 PDF quotations & invoices, save to database, and quote any item (even with 0 stock)"
      >
        <Button
          icon={Plus}
          variant="soft"
          onClick={() => {
            resetForm('Quotation');
            setActiveTab('builder');
          }}
        >
          New Quotation
        </Button>
        <Button
          icon={FileCheck2}
          variant="soft"
          onClick={() => {
            resetForm('Invoice');
            setActiveTab('builder');
          }}
        >
          New Invoice
        </Button>
        <Button
          icon={History}
          variant={activeTab === 'history' ? 'primary' : 'outline'}
          onClick={() => setActiveTab(activeTab === 'history' ? 'builder' : 'history')}
        >
          {activeTab === 'history'
            ? 'Back to Builder'
            : `Saved Quotations & Invoices (${quotations.length})`}
        </Button>
      </Heading>

      {error && <Alert>{error}</Alert>}

      {/* KPI STRIP */}
      <div className="zk-quo-kpis">
        <div
          className="zk-quo-kpi-card gold"
          onClick={() => {
            setHistoryFilter('all');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <small>Total Saved Documents</small>
            <strong>{kpis.totalCount}</strong>
            <span>All saved quotations &amp; invoices in DB</span>
          </div>
        </div>

        <div
          className="zk-quo-kpi-card"
          onClick={() => {
            setHistoryFilter('quotations');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon">
            <FileText size={20} />
          </div>
          <div>
            <small>Quotations ({kpis.quoteCount})</small>
            <strong>{money(kpis.totalQuoteValue)}</strong>
            <span>0-stock &amp; custom items supported</span>
          </div>
        </div>

        <div
          className="zk-quo-kpi-card"
          onClick={() => {
            setHistoryFilter('invoices');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon">
            <FileCheck2 size={20} />
          </div>
          <div>
            <small>Generated Invoices ({kpis.invoiceCount})</small>
            <strong>{money(kpis.totalInvoiceValue)}</strong>
            <span>Corporate A4 PDF invoices</span>
          </div>
        </div>
      </div>

      {/* MAIN TABS */}
      <div className="zk-quo-tabs-bar">
        <FilterTabs
          value={activeTab}
          onChange={setActiveTab}
          choices={[
            ['builder', editingId ? `Editing ${docType} #${quoteNo}` : `Create ${docType} & Live PDF Preview`],
            ['history', `All Saved Quotations & Invoices (${quotations.length})`],
          ]}
        />
        {activeTab === 'builder' && (
          <div className="zk-quo-top-actions">
            <Button
              type="button"
              icon={Save}
              variant="soft"
              disabled={busy || pdfBusy}
              onClick={saveToDatabase}
            >
              {busy ? 'Saving…' : editingId ? `Update ${docType}` : `Save ${docType} to DB`}
            </Button>
            <Button
              type="button"
              icon={Printer}
              variant="outline"
              disabled={busy || pdfBusy}
              onClick={handleSaveAndPrint}
            >
              Save &amp; Print A4
            </Button>
            <Button
              type="button"
              icon={Download}
              variant="primary"
              disabled={busy || pdfBusy}
              onClick={handleSaveAndDownloadPdf}
            >
              {pdfBusy ? 'Generating PDF…' : `Save & Download ${docType} PDF`}
            </Button>
          </div>
        )}
      </div>

      {/* =========================================================
          VIEW 1: QUOTATION & INVOICE BUILDER + LIVE A4 PDF PREVIEW
      ========================================================= */}
      {activeTab === 'builder' && (
        <div className="zk-quo-workspace">
          {/* LEFT: FORM BUILDER */}
          <div className="zk-quo-form-col">
            <Panel
              title={
                editingId
                  ? `Edit ${docType} #${quoteNo}`
                  : `New ${docType} Details`
              }
              icon={FileSpreadsheet}
            >
              <div className="zk-quo-form-stack">
                {/* Document Type Switcher */}
                <div className="zk-quo-doctype-bar">
                  <div className="zk-quo-doctype-pills">
                    <button
                      type="button"
                      className={`zk-quo-type-btn ${docType === 'Quotation' ? 'active' : ''}`}
                      onClick={() => setDocType('Quotation')}
                    >
                      <FileText size={15} />
                      <span>QUOTATION Template</span>
                    </button>
                    <button
                      type="button"
                      className={`zk-quo-type-btn ${docType === 'Invoice' ? 'active' : ''}`}
                      onClick={() => setDocType('Invoice')}
                    >
                      <FileCheck2 size={15} />
                      <span>INVOICE Template</span>
                    </button>
                  </div>
                  {editingId && (
                    <Badge tone="amber">Editing Saved ID #{editingId}</Badge>
                  )}
                </div>

                {/* Document Number, Date, Valid Until, Status */}
                <div className="zk-quo-grid-4">
                  <Field label={`${docType === 'Invoice' ? 'Invoice' : 'Quotation'} No *`}>
                    <input
                      type="text"
                      value={quoteNo}
                      placeholder="0091"
                      onChange={e => setQuoteNo(e.target.value)}
                    />
                  </Field>
                  <Field label={`${docType === 'Invoice' ? 'Invoice' : 'Quotation'} Date *`}>
                    <input
                      type="date"
                      value={quoteDate}
                      onChange={e => setQuoteDate(e.target.value)}
                    />
                  </Field>
                  <Field label={docType === 'Invoice' ? 'Payment Terms / Days' : 'Valid Until (Days)'}>
                    <input
                      type="text"
                      value={validUntil}
                      placeholder="14"
                      onChange={e => setValidUntil(e.target.value)}
                    />
                  </Field>
                  <Field label="Document Status">
                    <Select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      options={[
                        ['Saved', 'Saved'],
                        ['Draft', 'Draft'],
                        ['Sent', 'Sent to Client'],
                        ['Approved', 'Approved'],
                        ['Invoiced', 'Invoiced'],
                        ['Rejected', 'Rejected'],
                      ]}
                    />
                  </Field>
                </div>

                {/* Customer / Company Info */}
                <div className="zk-quo-client-box">
                  <div className="zk-quo-section-head">
                    <strong>1. Client / Company Information ({docType === 'Invoice' ? 'INVOICE TO' : 'QUOTATION TO'})</strong>
                    <small className="muted">Pick an existing customer or type any company/client name</small>
                  </div>

                  <Field label="Quick Fill from Saved Customers (Optional)">
                    <Select
                      searchable
                      value={customerId}
                      blank="Search & pick an existing customer or type below…"
                      options={customerOptions}
                      onChange={e => handleSelectCustomer(e.target.value)}
                    />
                  </Field>

                  <div className="zk-quo-grid-2">
                    <Field label={`${docType === 'Invoice' ? 'INVOICE TO' : 'QUOTATION TO'} (Company / Client Name) *`}>
                      <input
                        type="text"
                        required
                        placeholder="e.g. JF & I Packaging (Pvt) Ltd"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                      />
                    </Field>
                    <Field label="CONTACT (Phone / Contact Person)">
                      <input
                        type="text"
                        placeholder="e.g. 077 123 4567 / Purchasing Manager"
                        value={clientContact}
                        onChange={e => setClientContact(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label="ADDRESS">
                    <input
                      type="text"
                      placeholder="e.g. 321 Kaduwela road, Koswatta, Talangama"
                      value={clientAddress}
                      onChange={e => setClientAddress(e.target.value)}
                    />
                  </Field>
                </div>

                {/* Line Items Section (0-stock items and custom items allowed) */}
                <div className="zk-quo-items-box">
                  <div className="zk-quo-section-head">
                    <div>
                      <strong>2. Products &amp; Services ({items.length})</strong>
                      <small className="muted">
                        All catalog products can be selected even if stock is 0, or type any custom product/service directly.
                      </small>
                    </div>
                    <Button type="button" size="sm" variant="primary" icon={Plus} onClick={addItemLine}>
                      Add Item Row
                    </Button>
                  </div>

                  <div className="zk-quo-lines-list">
                    {computedLines.map((line, index) => (
                      <div key={line.key} className="zk-quo-line-card">
                        <div className="zk-quo-line-top">
                          <span className="zk-quo-line-num">#{index + 1}</span>
                          <div className="zk-quo-line-catalog">
                            <Select
                              searchable
                              value={line.product_id}
                              blank="Select from product catalog (0-stock items included) or type custom description below…"
                              options={allCatalogOptions}
                              onChange={e => handlePickCatalogProduct(index, e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            className="text-red"
                            title="Remove row"
                            onClick={() => removeItemLine(index)}
                          />
                        </div>

                        <div className="zk-quo-line-fields">
                          <Field label="Description of Service / Product *">
                            <input
                              type="text"
                              placeholder="e.g. Nokia 105 original mobile"
                              value={line.description}
                              onChange={e => updateItemLine(index, { description: e.target.value })}
                            />
                          </Field>

                          <Field label="Warranty / Second Line (Optional)">
                            <input
                              type="text"
                              placeholder="e.g. 1 year Company warranty"
                              value={line.warranty}
                              onChange={e => updateItemLine(index, { warranty: e.target.value })}
                            />
                          </Field>

                          <Field label="Qty">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.qty}
                              onChange={e => updateItemLine(index, { qty: e.target.value })}
                            />
                          </Field>

                          <Field label="Unit Price (LKR)">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="8000.00"
                              value={line.unit_price}
                              onChange={e => updateItemLine(index, { unit_price: e.target.value })}
                            />
                          </Field>

                          <div className="zk-quo-line-total-cell">
                            <span>Line Total</span>
                            <strong>{fmtNum(line.line_total_cents)}</strong>
                          </div>
                        </div>

                        <div className="zk-quo-warranty-chips">
                          <span>Warranty preset:</span>
                          {WARRANTY_PRESETS.map(preset => (
                            <button
                              key={preset}
                              type="button"
                              className={`zk-quo-chip ${line.warranty === preset ? 'active' : ''}`}
                              onClick={() =>
                                updateItemLine(index, {
                                  warranty: preset === 'No Warranty' ? '' : preset,
                                })
                              }
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Discount & Totals Summary */}
                <div className="zk-quo-totals-bar">
                  <div className="zk-quo-discount-inputs">
                    <Field label="Discount Amount (LKR — Optional)">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00 (leave blank for no discount)"
                        value={discountInput}
                        onChange={e => setDiscountInput(e.target.value)}
                      />
                    </Field>
                    <Field label="Internal Notes / Remarks (Optional)">
                      <input
                        type="text"
                        placeholder="Optional internal reference note"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="zk-quo-summary-numbers">
                    <div>
                      <span>Sub Total:</span>
                      <strong>LKR {fmtNum(subtotalCents)}</strong>
                    </div>
                    {discountCents > 0 && (
                      <div>
                        <span>Discount:</span>
                        <strong className="text-red">− LKR {fmtNum(discountCents)}</strong>
                      </div>
                    )}
                    <div className="grand">
                      <span>Grand Total:</span>
                      <strong>LKR {fmtNum(grandTotalCents)}</strong>
                    </div>
                  </div>
                </div>

                {/* Template Header & Footer Phones/Address Customization (Collapsible) */}
                <div className="zk-quo-template-config">
                  <button
                    type="button"
                    className="zk-quo-config-toggle"
                    onClick={() => setShowHeaderSettings(v => !v)}
                  >
                    <Sparkles size={14} />
                    <span>
                      {showHeaderSettings
                        ? 'Hide Header Phone Numbers & Footer Branch Addresses'
                        : 'Customize Header Phone Numbers & Footer Branch Addresses'}
                    </span>
                  </button>
                  {showHeaderSettings && (
                    <div className="zk-quo-config-body">
                      <Field label="Header Contact Numbers">
                        <input
                          type="text"
                          value={headerPhones}
                          onChange={e => setHeaderPhones(e.target.value)}
                        />
                      </Field>
                      <Field label="Header Services Subtitle">
                        <input
                          type="text"
                          value={headerTagline}
                          onChange={e => setHeaderTagline(e.target.value)}
                        />
                      </Field>
                      <Field label="Footer Branch Addresses (Separate with |)">
                        <input
                          type="text"
                          value={footerAddresses}
                          onChange={e => setFooterAddresses(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                </div>

                {/* Bottom Action Buttons */}
                <div className="zk-quo-form-footer">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => resetForm(docType)}
                    disabled={busy || pdfBusy}
                  >
                    Reset / Clear Form
                  </Button>
                  <div className="zk-quo-top-actions">
                    <Button
                      type="button"
                      icon={Save}
                      variant="soft"
                      disabled={busy || pdfBusy}
                      onClick={saveToDatabase}
                    >
                      {busy ? 'Saving…' : editingId ? `Update ${docType}` : `Save ${docType}`}
                    </Button>
                    <Button
                      type="button"
                      icon={Printer}
                      variant="outline"
                      disabled={busy || pdfBusy}
                      onClick={handleSaveAndPrint}
                    >
                      Save &amp; Print A4
                    </Button>
                    <Button
                      type="button"
                      icon={Download}
                      variant="primary"
                      disabled={busy || pdfBusy}
                      onClick={handleSaveAndDownloadPdf}
                    >
                      {pdfBusy ? 'Generating PDF…' : `Save & Download ${docType} PDF`}
                    </Button>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* RIGHT: EXACT ZEEDAT GOLD & BLACK A4 PDF TEMPLATE PREVIEW */}
          <div className="zk-quo-preview-col">
            <div className="zk-quo-preview-toolbar">
              <div className="zk-quo-preview-title">
                <Eye size={16} />
                <span>Live A4 PDF Template Preview ({docType.toUpperCase()} #{quoteNo || nextAutoNumber})</span>
              </div>
              <div className="zk-quo-preview-btns">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={Printer}
                  onClick={() => handlePrintA4(currentDocPreview)}
                >
                  Print Preview
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  icon={Download}
                  disabled={pdfBusy}
                  onClick={() => handleDownloadPdf(currentDocPreview, true)}
                >
                  {pdfBusy ? 'Exporting…' : 'Download PDF'}
                </Button>
              </div>
            </div>

            <div className="zk-quo-a4-stage">
              <div ref={previewRef} className="zk-quo-a4-sheet">
                <div>
                  {/* TOP BLACK & GOLD ANGLED BANNER */}
                  <div className="zk-quo-hdr">
                    <div className="zk-quo-hdr-gold-strip" />
                    <div className="zk-quo-hdr-black">
                      <div className="zk-quo-logo-box">
                        <div className="zk-quo-logo-phone">
                          <span>Z</span>
                        </div>
                        <div className="zk-quo-logo-word">ZEEDAT</div>
                      </div>
                      <div className="zk-quo-brand-center">
                        <div className="zk-quo-brand-title">ZEEDAT</div>
                        <div className="zk-quo-brand-sub">
                          <div>{taglineLine1}</div>
                          <div>{taglineLine2}</div>
                        </div>
                      </div>
                    </div>

                    <div className="zk-quo-hdr-gold">
                      <div className="zk-quo-doc-heading">
                        {docType === 'Invoice' ? 'INVOICE' : 'QUOTATION'}
                      </div>
                      <div className="zk-quo-phone-row">
                        <span className="zk-quo-phone-icon">
                          <PhoneCall size={13} strokeWidth={2.5} />
                        </span>
                        <span>{headerPhones || DEFAULT_HEADER_PHONES}</span>
                      </div>
                    </div>
                  </div>

                  {/* CLIENT & DOCUMENT METADATA */}
                  <div className="zk-quo-sheet-body">
                    <div className="zk-quo-meta-grid">
                      <div className="zk-quo-meta-left">
                        <div className="zk-quo-meta-line">
                          {docType === 'Invoice' ? 'INVOICE TO: ' : 'QUOTATION TO: '}
                          {clientName || '—'}
                        </div>
                        <div className="zk-quo-meta-line">CONTACT: {clientContact}</div>
                        <div className="zk-quo-meta-line">ADDRESS: {clientAddress}</div>
                      </div>
                      <div className="zk-quo-meta-right">
                        <div className="zk-quo-meta-line">
                          {docType === 'Invoice' ? 'INVOICE NO:' : 'QUOTATION NO:'}
                          {quoteNo || nextAutoNumber}
                        </div>
                        <div className="zk-quo-meta-line">
                          {docType === 'Invoice' ? 'INVOICE DATE:' : 'QUOTATION DATE:'}
                          {fmtShortDate(quoteDate)}
                        </div>
                        <div className="zk-quo-meta-line">
                          {docType === 'Invoice' ? 'PAYMENT TERMS:' : 'VALID UNTIL:'}
                          {validUntil}
                        </div>
                      </div>
                    </div>

                    {/* 12-ROW GOLD & GREY LINED ITEMS TABLE */}
                    <table className="zk-quo-sheet-table">
                      <thead>
                        <tr>
                          <th className="col-desc">Description of Service / Product</th>
                          <th className="col-qty">Qty</th>
                          <th className="col-price">Unit Price</th>
                          <th className="col-total">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: previewRowsCount }).map((_, idx) => {
                          const line = computedLines[idx];
                          const hasText = line && String(line.description || '').trim() !== '';
                          return (
                            <tr key={idx} className={hasText ? 'filled' : 'empty'}>
                              <td className="c-desc">
                                {hasText ? (
                                  <>
                                    <div className="d-main">{line.description}</div>
                                    {line.warranty && <div className="d-sub">{line.warranty}</div>}
                                  </>
                                ) : (
                                  '\u00A0'
                                )}
                              </td>
                              <td className="c-qty">{hasText ? fmtQty(line.qtyNum) : '\u00A0'}</td>
                              <td className="c-price">
                                {hasText ? fmtNum(line.unit_price_cents) : '\u00A0'}
                              </td>
                              <td className="c-total">
                                {hasText ? fmtNum(line.line_total_cents) : '\u00A0'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* SUBTOTAL / DISCOUNT / GOLD GRAND TOTAL */}
                    <div className="zk-quo-sheet-totals">
                      <div className="zk-quo-sheet-totals-box">
                        <div className="zk-quo-tot-row">
                          <strong>Sub Total:</strong>
                          <span className="zk-quo-tot-val">{fmtNum(subtotalCents)}</span>
                        </div>
                        <div className="zk-quo-tot-row">
                          <strong>Discount:</strong>
                          <span className="zk-quo-tot-val">
                            {discountCents > 0 ? fmtNum(discountCents) : ''}
                          </span>
                        </div>
                        <div className="zk-quo-tot-row grand">
                          <span>Grand Total:</span>
                          <span>{fmtNum(grandTotalCents)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SIGNATURES & ACCEPTANCE BLOCK */}
                    <div className="zk-quo-sheet-sigs">
                      <div className="zk-quo-sig-left">
                        <div className="zk-quo-sig-dots">
                          ..............................................
                        </div>
                        <div className="zk-quo-sig-title">Business Signature</div>
                        <div className="zk-quo-sig-note">
                          <div>
                            If you have any questions concerning this{' '}
                            {docType === 'Invoice' ? 'Invoice' : 'Quotation'}, please contact Us.
                          </div>
                          <div>
                            <strong>Thank You for Your Business.</strong>
                          </div>
                        </div>
                      </div>

                      <div className="zk-quo-sig-right">
                        <div className="zk-quo-accept-text">
                          Please Confirm Your Acceptance
                          <br />
                          of This {docType === 'Invoice' ? 'Invoice' : 'Quote'}:
                        </div>
                        <div className="zk-quo-sig-dots">
                          ............................................
                        </div>
                        <div className="zk-quo-sig-title">Client Signature &amp; Date</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOTTOM BLACK & GOLD ADDRESS BAR */}
                <div className="zk-quo-sheet-footer">
                  <span className="zk-quo-pin">
                    <MapPin size={14} />
                  </span>
                  <span>{footerLeft}</span>
                  <span className="zk-quo-foot-sep">|</span>
                  <span>{footerRight}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW 2: ALL SAVED QUOTATIONS & INVOICES DATABASE TABLE
      ========================================================= */}
      {activeTab === 'history' && (
        <Panel
          title={`Saved Quotations & Invoices (${filteredQuotations.length})`}
          icon={History}
        >
          <div className="zk-quo-history-toolbar">
            <div className="zk-quo-history-search">
              <SearchBox
                value={historySearch}
                onChange={setHistorySearch}
                placeholder="Search by Quotation/Invoice No, Client Name, Contact, Address, or Item…"
              />
            </div>
            <div className="zk-quo-history-filters">
              <FilterTabs
                value={historyFilter}
                onChange={setHistoryFilter}
                choices={[
                  ['all', `All (${quotations.length})`],
                  ['quotations', `Quotations (${kpis.quoteCount})`],
                  ['invoices', `Invoices (${kpis.invoiceCount})`],
                  ['approved', 'Approved / Invoiced'],
                ]}
              />
              <Button icon={RefreshCw} variant="ghost" onClick={onRefresh}>
                Refresh
              </Button>
            </div>
          </div>

          <Table
            rows={filteredQuotations}
            empty="No quotations or corporate invoices found. Click 'New Quotation' to create and save your first quotation."
            columns={[
              [
                'Doc # & Type',
                r => (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong>#{r.quote_no}</strong>
                      <Badge tone={r.doc_type === 'Invoice' ? 'green' : 'amber'}>
                        {r.doc_type || 'Quotation'}
                      </Badge>
                    </div>
                    <small className="muted">
                      Date: {fmtShortDate(r.quote_date)} · Valid: {r.valid_until || '—'}
                    </small>
                  </div>
                ),
              ],
              [
                'Client / Company',
                r => (
                  <div>
                    <strong>{r.client_name}</strong>
                    <div className="muted" style={{ fontSize: '11.5px' }}>
                      {r.client_contact ? `${r.client_contact} · ` : ''}
                      {r.client_address || ''}
                    </div>
                  </div>
                ),
              ],
              [
                'Items',
                r => {
                  const list = r.items || [];
                  return (
                    <div>
                      <strong>{list.length} item(s)</strong>
                      <div className="muted" style={{ fontSize: '11.5px', maxWidth: '280px' }}>
                        {list
                          .slice(0, 2)
                          .map(i => `${i.description} (x${fmtQty(i.qty)})`)
                          .join(', ')}
                        {list.length > 2 ? ` +${list.length - 2} more` : ''}
                      </div>
                    </div>
                  );
                },
              ],
              [
                'Grand Total',
                r => (
                  <div>
                    <strong>LKR {fmtNum(r.grand_total)}</strong>
                    {Number(r.discount) > 0 && (
                      <div className="muted" style={{ fontSize: '11px' }}>
                        Disc: LKR {fmtNum(r.discount)}
                      </div>
                    )}
                  </div>
                ),
              ],
              [
                'Status',
                r => <Badge tone={statusTone(r.status)}>{r.status || 'Saved'}</Badge>,
              ],
              [
                'Created',
                r => (
                  <div>
                    <small>{timeLabel(r.created_at)}</small>
                    <div className="muted" style={{ fontSize: '11px' }}>
                      {r.created_by_name} · {r.branch_name}
                    </div>
                  </div>
                ),
              ],
              [
                'Actions',
                r => (
                  <div className="row-actions">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Download}
                      disabled={pdfBusy}
                      onClick={() => handleDownloadPdf(r, false)}
                    >
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Printer}
                      onClick={() => handlePrintA4(r)}
                    >
                      Print
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      icon={Pencil}
                      onClick={() => loadQuotationToBuilder(r, false)}
                    >
                      Edit
                    </Button>
                    {r.doc_type !== 'Invoice' && (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={CheckCircle2}
                        disabled={busy}
                        onClick={() => handleConvertToInvoice(r)}
                      >
                        To Invoice
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Copy}
                      title="Duplicate Quotation"
                      onClick={() => loadQuotationToBuilder(r, true)}
                    >
                      Clone
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      className="text-red"
                      disabled={busy}
                      onClick={() => handleDeleteQuotation(r)}
                    />
                  </div>
                ),
              ],
            ]}
          />
        </Panel>
      )}
    </div>
  );
}
