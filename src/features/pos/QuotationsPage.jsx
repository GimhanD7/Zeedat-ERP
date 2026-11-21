import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Ban,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  FileBarChart2,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  Minus,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
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
  Modal,
  Panel,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import {
  cents,
  DEFAULT_ZEEDAT_LOGO,
  getSystemLogo,
  money,
  printHtmlDocument,
  ref,
  timeLabel,
  today,
  useSystemLogo,
} from '../../utils';
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

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Card', 'Online Transfer'];

const TOTAL_TABLE_ROWS = 12;

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

const extractMonthKey = row => {
  const raw = String(row?.paid_at || row?.quote_date || row?.created_at || '').trim();
  const match = raw.match(/^(\d{4}-\d{2})/);
  return match ? match[1] : today().slice(0, 7);
};

const formatMonthLabel = ym => {
  if (!ym || ym === 'all') return 'All Months';
  const match = String(ym).match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const date = new Date(year, monthIdx, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const isAcceptedRecord = row => {
  if (!row) return false;
  if (row.status === 'Rejected') return false;
  return (
    row.payment_status === 'Paid' ||
    row.doc_type === 'Invoice' ||
    Boolean(row.po_number) ||
    ['PO Accepted', 'Approved', 'Invoiced'].includes(row.status)
  );
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
  if (s === 'invoiced') return 'green';
  if (s === 'po accepted' || s === 'approved') return 'blue';
  if (s === 'sent') return 'amber';
  if (s === 'rejected') return 'red';
  return 'slate';
};

/**
 * Builds an official printable A4 HTML report for Paid Quotations & Invoices (filtered by month or all months).
 */
function buildPaidReportA4Html({ rows, monthKey, shopName = 'ZEEDAT POS', logoUrl = '' }) {
  const esc = v =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const periodTitle = monthKey === 'all' ? 'All Months' : formatMonthLabel(monthKey);
  const totalCollected = rows.reduce((sum, r) => sum + Number(r.grand_total || 0), 0);
  const byMethod = {};
  for (const r of rows) {
    const m = r.payment_method || 'Cash';
    byMethod[m] = (byMethod[m] || 0) + Number(r.grand_total || 0);
  }
  const methodSummary = Object.entries(byMethod)
    .map(([m, amt]) => `${esc(m)}: LKR ${esc(fmtNum(amt))}`)
    .join(' · ');

  const trs = rows
    .map(
      (r, idx) => `<tr>
        <td>${idx + 1}</td>
        <td><strong>${esc(r.quote_no)}</strong><br/><small>${esc(r.doc_type || 'Quotation')}</small></td>
        <td>${esc(r.po_number || '—')}</td>
        <td><strong>${esc(r.client_name)}</strong>${r.client_contact ? `<br/><small>${esc(r.client_contact)}</small>` : ''}</td>
        <td>${esc((r.items || []).map(i => `${i.description} (x${fmtQty(i.qty)})`).join(', '))}</td>
        <td>${esc(fmtShortDate(r.paid_at || r.quote_date))}</td>
        <td><strong>${esc(r.payment_method || 'Cash')}</strong>${r.payment_reference ? `<br/><small>${esc(r.payment_reference)}</small>` : ''}</td>
        <td style="text-align:right;font-weight:700;">LKR ${esc(fmtNum(r.grand_total))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Paid Quotations & Invoices Report — ${esc(periodTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; }
    .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #e2af0d; padding-bottom: 10px; margin-bottom: 14px; background: #080b12; color: #fff; padding: 12px 16px; border-radius: 8px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 48px; height: 56px; object-fit: contain; }
    .brand h1 { margin: 0 0 3px; font-size: 18px; letter-spacing: 1px; color: #facc15; }
    .brand p { margin: 0; font-size: 11px; color: #e2e8f0; }
    .meta { text-align: right; font-size: 11px; color: #e2e8f0; }
    .meta strong { font-size: 14px; color: #facc15; display: block; margin-bottom: 2px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
    .kpi.gold { background: #fef9c3; border-color: #eab308; }
    .kpi small { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .kpi strong { display: block; font-size: 16px; margin-top: 3px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #e2af0d; color: #050505; font-weight: 800; text-transform: uppercase; font-size: 10px; }
    tfoot td { background: #fef9c3; font-weight: 800; font-size: 12px; border-top: 2px solid #0f172a; }
  </style>
</head>
<body>
  <div class="head">
    <div class="brand">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" />` : ''}
      <div>
        <h1>${esc(shopName)} — PAID QUOTATIONS &amp; INVOICES REPORT</h1>
        <p>Official Monthly Payment Collection Report · Period: <strong>${esc(periodTitle)}</strong></p>
      </div>
    </div>
    <div class="meta">
      <strong>TOTAL COLLECTED: LKR ${esc(fmtNum(totalCollected))}</strong>
      <div>Paid Orders: ${rows.length} · Printed: ${esc(new Date().toLocaleString())}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi">
      <small>Report Period</small>
      <strong>${esc(periodTitle)}</strong>
    </div>
    <div class="kpi">
      <small>Paid Orders Count</small>
      <strong>${rows.length} Paid Document(s)</strong>
    </div>
    <div class="kpi gold">
      <small>Total Money Received</small>
      <strong>LKR ${esc(fmtNum(totalCollected))}</strong>
      ${methodSummary ? `<div style="font-size:9.5px;margin-top:2px;color:#713f12;">${methodSummary}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Doc No</th>
        <th>PO Number</th>
        <th>Client / Company</th>
        <th>Items</th>
        <th>Paid Date</th>
        <th>Method / Ref</th>
        <th style="text-align:right;">Paid Amount</th>
      </tr>
    </thead>
    <tbody>
      ${trs || '<tr><td colspan="8" style="text-align:center;padding:18px;">No paid records for this period.</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="7" style="text-align:right;">TOTAL MONEY RECEIVED (${esc(periodTitle)}):</td>
        <td style="text-align:right;">LKR ${esc(fmtNum(totalCollected))}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

/**
 * Generates a high-DPI PNG Data URL of the geometric Black & Gold ZEEDAT header banner using HTML5 Canvas.
 */
let cachedHeaderBannerUrl = null;
function getHeaderBannerDataUrl() {
  if (cachedHeaderBannerUrl) return cachedHeaderBannerUrl;
  try {
    const W = 1588; // 2x of 794px
    const H = 280; // 2x of 140px
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const stripGrad = ctx.createLinearGradient(0, 0, 770, 0);
    stripGrad.addColorStop(0, '#c5970d');
    stripGrad.addColorStop(1, '#e5b81b');
    ctx.fillStyle = stripGrad;
    ctx.beginPath();
    ctx.moveTo(0, 212);
    ctx.lineTo(730, 212);
    ctx.lineTo(770, 240);
    ctx.lineTo(0, 240);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    const goldGrad = ctx.createLinearGradient(832, 38, W, 270);
    goldGrad.addColorStop(0, '#f5cf38');
    goldGrad.addColorStop(0.52, '#cfa012');
    goldGrad.addColorStop(1, '#9c7105');
    ctx.fillStyle = goldGrad;
    ctx.beginPath();
    ctx.moveTo(968, 38);
    ctx.lineTo(W, 38);
    ctx.lineTo(W, 270);
    ctx.lineTo(832, 270);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#060606';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(956, 0);
    ctx.lineTo(832, 270);
    ctx.lineTo(710, 216);
    ctx.lineTo(0, 216);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    cachedHeaderBannerUrl = canvas.toDataURL('image/png');
    return cachedHeaderBannerUrl;
  } catch {
    return '';
  }
}

function HybridClientInput({ value, customers, onType, onPickCustomer }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const matches = useMemo(() => {
    const q = String(value || '').trim().toLowerCase();
    const list = !q
      ? customers
      : customers.filter(c =>
          `${c.name || ''} ${c.phone || ''} ${c.notes || ''} ${ref('CUS', c.id)}`
            .toLowerCase()
            .includes(q)
        );
    return list.slice(0, 15);
  }, [customers, value]);

  const exactExists = useMemo(() => {
    const q = String(value || '').trim().toLowerCase();
    if (!q) return true;
    return customers.some(c => String(c.name || '').trim().toLowerCase() === q);
  }, [customers, value]);

  return (
    <div ref={wrapRef} className="zk-quo-hybrid-input-wrap">
      <input
        type="text"
        required
        placeholder="Type new company/client name OR click to pick saved customer…"
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={e => {
          onType(e.target.value);
          setOpen(true);
        }}
      />
      {value.trim() && !exactExists && (
        <small className="zk-quo-auto-cust-note">
          <UserPlus size={12} /> New customer — will be automatically added to the Customers table when saved.
        </small>
      )}
      {open && matches.length > 0 && (
        <div className="zk-quo-hybrid-dropdown" role="listbox">
          <div className="zk-quo-hybrid-head">
            <span>Saved Customers (click to fill Name, Contact &amp; Address, or keep typing new client)</span>
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                setOpen(false);
              }}
            >
              Close
            </button>
          </div>
          {matches.map(c => (
            <button
              key={c.id}
              type="button"
              className="zk-quo-hybrid-item"
              onMouseDown={e => {
                e.preventDefault();
                onPickCustomer(c);
                setOpen(false);
              }}
            >
              <div className="zk-quo-hybrid-item-main">
                <strong>{c.name}</strong>
                <span className="zk-quo-sku-pill">{ref('CUS', c.id)}</span>
              </div>
              <div className="zk-quo-hybrid-item-meta">
                <span className="price">{c.phone || 'No phone'}</span>
                {c.notes && (
                  <span
                    className="stock in"
                    style={{
                      maxWidth: '180px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.notes}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HybridProductInput({ value, products, onType, onPickProduct }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const matches = useMemo(() => {
    const q = String(value || '').trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(p =>
          `${p.name || ''} ${p.sku || ''} ${p.barcode || ''} ${p.brand || ''}`
            .toLowerCase()
            .includes(q)
        );
    return list.slice(0, 25);
  }, [products, value]);

  return (
    <div ref={wrapRef} className="zk-quo-hybrid-input-wrap">
      <input
        type="text"
        placeholder="Type custom product/service OR click to pick from catalog…"
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={e => {
          onType(e.target.value);
          setOpen(true);
        }}
      />
      {open && matches.length > 0 && (
        <div className="zk-quo-hybrid-dropdown" role="listbox">
          <div className="zk-quo-hybrid-head">
            <span>Click a catalog product to fill (or keep typing custom text)</span>
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                setOpen(false);
              }}
            >
              Close
            </button>
          </div>
          {matches.map(p => {
            const stockQty = Number(p.qty ?? 0);
            return (
              <button
                key={p.id}
                type="button"
                className="zk-quo-hybrid-item"
                onMouseDown={e => {
                  e.preventDefault();
                  onPickProduct(p);
                  setOpen(false);
                }}
              >
                <div className="zk-quo-hybrid-item-main">
                  <strong>{p.name}</strong>
                  {p.sku && <span className="zk-quo-sku-pill">{p.sku}</span>}
                </div>
                <div className="zk-quo-hybrid-item-meta">
                  <span className="price">{money(p.price)}</span>
                  <span className={`stock ${stockQty > 0 ? 'in' : 'zero'}`}>
                    {stockQty > 0 ? `Stock: ${stockQty}` : '0 Stock · OK'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ZeedatA4Sheet({ doc, sheetRef }) {
  const bannerUrl = useMemo(() => getHeaderBannerDataUrl(), []);
  const { logo: systemLogo } = useSystemLogo();
  const activeLogo = doc.logo_url || systemLogo || DEFAULT_ZEEDAT_LOGO;
  const isInvoice = doc.doc_type === 'Invoice';
  const docTitle = isInvoice ? 'INVOICE' : 'QUOTATION';
  const toLabel = isInvoice ? 'INVOICE TO:' : 'QUOTATION TO:';
  const noLabel = isInvoice ? 'INVOICE NO:' : 'QUOTATION NO:';
  const dateLabelTxt = isInvoice ? 'INVOICE DATE:' : 'QUOTATION DATE:';
  const validLabel = isInvoice ? 'PAYMENT TERMS:' : 'VALID UNTIL:';

  const taglineParts = String(doc.header_tagline || DEFAULT_HEADER_TAGLINE).split(/Hardware/i);
  const taglineLine1 = taglineParts[0]?.trim() || 'Mobile Phones|Laptops|Computers|Accessories|';
  const taglineLine2 =
    taglineParts.length > 1
      ? `Hardware${taglineParts.slice(1).join('Hardware')}`.trim()
      : 'Hardware & Software Repair';

  const footerParts = String(doc.footer_addresses || DEFAULT_FOOTER_ADDRESSES).split('|');
  const footerLeft = footerParts[0]?.trim() || 'No. 148, Main Street, Battaramulla';
  const footerRight =
    footerParts.slice(1).join(' | ').trim() ||
    'No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)';

  const items = Array.isArray(doc.items) ? doc.items : [];
  const filledItems = items.map(it => {
    const qtyNum = Math.max(1, parseInt(it.qtyNum ?? it.qty, 10) || 1);
    const unitCents = Number(it.unit_price_cents ?? it.unit_price ?? 0);
    const totalCents = Number(it.line_total_cents ?? it.line_total ?? qtyNum * unitCents);
    return {
      ...it,
      qtyNum,
      unitCents,
      totalCents,
      hasText: String(it.description || '').trim() !== '',
    };
  });

  const rowsCount = Math.max(TOTAL_TABLE_ROWS, filledItems.length);
  const subtotalCents = Number(doc.subtotal_cents ?? doc.subtotal ?? 0);
  const discountCents = Number(doc.discount_cents ?? doc.discount ?? 0);
  const grandTotalCents = Math.max(0, subtotalCents - discountCents);

  return (
    <div ref={sheetRef} className="zk-quo-a4-sheet">
      <div className="zk-quo-a4-top">
        <div className="zk-quo-hdr">
          {bannerUrl && (
            <img
              src={bannerUrl}
              alt=""
              className="zk-quo-hdr-bg-img"
              aria-hidden="true"
            />
          )}

          <div className="zk-quo-hdr-left-content">
            <div className="zk-quo-logo-box">
              <img src={activeLogo} alt="ZEEDAT" className="zk-quo-custom-logo-img" />
            </div>

            <div className="zk-quo-brand-center">
              <div className="zk-quo-brand-title">ZEEDAT</div>
              <div className="zk-quo-brand-sub">
                <div>{taglineLine1}</div>
                <div>{taglineLine2}</div>
              </div>
            </div>
          </div>

          <div className="zk-quo-hdr-right-content">
            <div className="zk-quo-doc-heading">{docTitle}</div>
            <div className="zk-quo-phone-row">
              <span className="zk-quo-phone-icon">&#9742;</span>
              <span>{doc.header_phones || DEFAULT_HEADER_PHONES}</span>
            </div>
          </div>
        </div>

        <div className="zk-quo-sheet-body">
          <div className="zk-quo-meta-grid">
            <div className="zk-quo-meta-left">
              <div className="zk-quo-meta-line">
                <span>{toLabel} </span>
                <span>{doc.client_name || ''}</span>
              </div>
              <div className="zk-quo-meta-line">
                <span>CONTACT: </span>
                <span>{doc.client_contact || ''}</span>
              </div>
              <div className="zk-quo-meta-line">
                <span>ADDRESS: </span>
                <span>{doc.client_address || ''}</span>
              </div>
            </div>

            <div className="zk-quo-meta-right">
              <div className="zk-quo-meta-line">
                <span>{noLabel}</span>
                <span>{doc.quote_no}</span>
              </div>
              <div className="zk-quo-meta-line">
                <span>{dateLabelTxt}</span>
                <span>{fmtShortDate(doc.quote_date)}</span>
              </div>
              <div className="zk-quo-meta-line">
                <span>{validLabel}</span>
                <span>{doc.valid_until}</span>
              </div>
              {doc.po_number && (
                <div className="zk-quo-meta-line">
                  <span>PO NO:</span>
                  <span>
                    {doc.po_number}
                    {doc.po_date ? ` (${fmtShortDate(doc.po_date)})` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="zk-a4-table">
            <div className="zk-a4-thead">
              <div className="zk-a4-th col-desc">Description of Service / Product</div>
              <div className="zk-a4-th col-qty">Qty</div>
              <div className="zk-a4-th col-price">Unit Price</div>
              <div className="zk-a4-th col-total">Total</div>
            </div>

            <div className="zk-a4-tbody">
              {Array.from({ length: rowsCount }).map((_, idx) => {
                const line = filledItems[idx];
                const hasText = Boolean(line?.hasText);
                return (
                  <div
                    key={idx}
                    className={`zk-a4-trow ${hasText ? 'is-filled' : 'is-blank'}`}
                  >
                    <div className="zk-a4-td c-desc">
                      {hasText ? (
                        <div className="c-desc-inner">
                          <div className="d-main">{line.description}</div>
                          {line.warranty && <div className="d-sub">{line.warranty}</div>}
                        </div>
                      ) : (
                        '\u00A0'
                      )}
                    </div>
                    <div className="zk-a4-td c-qty">
                      {hasText ? fmtQty(line.qtyNum) : '\u00A0'}
                    </div>
                    <div className="zk-a4-td c-price">
                      {hasText ? fmtNum(line.unitCents) : '\u00A0'}
                    </div>
                    <div className="zk-a4-td c-total">
                      {hasText ? fmtNum(line.totalCents) : '\u00A0'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

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

          <div className="zk-quo-sheet-sigs">
            <div className="zk-quo-sig-left">
              <div className="zk-quo-sig-dots">..............................................</div>
              <div className="zk-quo-sig-title">Business Signature</div>
              <div className="zk-quo-sig-note">
                <div>
                  If you have any questions concerning this{' '}
                  {isInvoice ? 'Invoice' : 'Quotation'}, please contact Us.
                </div>
                <div className="thank-you">Thank You for Your Business.</div>
              </div>
            </div>

            <div className="zk-quo-sig-right">
              <div className="zk-quo-accept-text">
                Please Confirm Your Acceptance
                <br />
                of This {isInvoice ? 'Invoice' : 'Quote'}:
              </div>
              <div className="zk-quo-sig-dots">............................................</div>
              <div className="zk-quo-sig-title">Client Signature &amp; Date</div>
            </div>
          </div>
        </div>
      </div>

      <div className="zk-quo-sheet-footer">
        <span className="zk-quo-pin">&#9906;</span>
        <span>{footerLeft}</span>
        <span className="zk-quo-foot-sep">|</span>
        <span>{footerRight}</span>
      </div>
    </div>
  );
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
  const hiddenCaptureRef = useRef(null);
  const stageRef = useRef(null);
  const quickSearchRef = useRef(null);
  const { logo: systemLogo, shopName: systemShopName } = useSystemLogo();

  const [previewScale, setPreviewScale] = useState(0.52);
  const [manualScale, setManualScale] = useState(null);
  const [captureDoc, setCaptureDoc] = useState(null);

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
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [poApprovedBy, setPoApprovedBy] = useState('');
  const [poNotes, setPoNotes] = useState('');
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

  // Purchase Order (PO) Acceptance Modal state
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poModalTarget, setPoModalTarget] = useState(null);
  const [poForm, setPoForm] = useState({
    po_number: '',
    po_date: today(),
    po_approved_by: '',
    po_notes: '',
  });

  // Payment Received (Mark Paid) Modal state
  const [payModalRow, setPayModalRow] = useState(null);
  const [payForm, setPayForm] = useState({
    paid_at: today(),
    payment_method: 'Bank Transfer',
    payment_reference: '',
  });

  // Quick Search & Click to Add Product state
  const [quickQuery, setQuickQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);

  // History tab filters & Monthly Paid Report state
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [reportMonth, setReportMonth] = useState(() => today().slice(0, 7));

  useEffect(() => {
    if (!quickOpen) return undefined;
    const onOutside = e => {
      if (quickSearchRef.current && !quickSearchRef.current.contains(e.target)) {
        setQuickOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [quickOpen]);

  useEffect(() => {
    if (activeTab !== 'builder') return undefined;
    const updateScale = () => {
      const stageEl = stageRef.current;
      const availW = stageEl ? Math.max(300, stageEl.clientWidth - 20) : 430;
      const availH = Math.max(440, window.innerHeight - 180);
      const scaleW = availW / 794;
      const scaleH = availH / 1123;
      const fit = Math.min(scaleW, scaleH, 0.56);
      setPreviewScale(Math.max(0.4, Number(fit.toFixed(3))));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScale) : null;
    if (ro && stageRef.current) ro.observe(stageRef.current);
    return () => {
      window.removeEventListener('resize', updateScale);
      ro?.disconnect();
    };
  }, [activeTab]);

  const effectiveScale = manualScale ?? previewScale;

  const nextAutoNumber = useMemo(() => {
    let maxSeq = 0;
    for (const q of quotations) {
      const idNum = Number(q.id || 0);
      if (idNum > maxSeq) maxSeq = idNum;
      const qNo = String(q.quote_no || '').trim().toUpperCase();
      const match = qNo.match(/^ZD0*(\d+)$/);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    return `ZD${String(maxSeq + 1).padStart(4, '0')}`;
  }, [quotations]);

  useEffect(() => {
    if (!editingId) {
      setQuoteNo(nextAutoNumber);
    }
  }, [nextAutoNumber, editingId]);

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

  const quickMatchedProducts = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(p =>
          `${p.name || ''} ${p.sku || ''} ${p.barcode || ''} ${p.brand || ''} ${p.category || ''}`
            .toLowerCase()
            .includes(q)
        );
    return list.slice(0, 30);
  }, [products, quickQuery]);

  const customerOptions = useMemo(
    () =>
      customers.map(c => [
        c.id,
        `${c.name} · ${c.phone || 'No phone'}${c.notes ? ` · ${c.notes}` : ''} (${ref('CUS', c.id)})`,
      ]),
    [customers]
  );

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

  const displayQuoteNo = editingId ? quoteNo || nextAutoNumber : nextAutoNumber;

  const currentDocPreview = useMemo(
    () => ({
      id: editingId,
      doc_type: docType,
      quote_no: displayQuoteNo,
      quote_date: quoteDate,
      valid_until: validUntil,
      client_name: clientName,
      client_contact: clientContact,
      client_address: clientAddress,
      po_number: poNumber,
      po_date: poDate,
      po_approved_by: poApprovedBy,
      po_notes: poNotes,
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
      displayQuoteNo,
      quoteDate,
      validUntil,
      clientName,
      clientContact,
      clientAddress,
      poNumber,
      poDate,
      poApprovedBy,
      poNotes,
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
    setPoNumber('');
    setPoDate('');
    setPoApprovedBy('');
    setPoNotes('');
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
    setPoNumber(asDuplicate ? '' : row.po_number || '');
    setPoDate(asDuplicate ? '' : row.po_date || '');
    setPoApprovedBy(asDuplicate ? '' : row.po_approved_by || '');
    setPoNotes(asDuplicate ? '' : row.po_notes || '');
    setDiscountInput(row.discount > 0 ? (Number(row.discount) / 100).toFixed(2) : '');
    setStatus(overrideDocType === 'Invoice' ? 'Invoiced' : row.status || 'Saved');
    setNotes(row.notes || '');
    setHeaderPhones(row.header_phones || DEFAULT_HEADER_PHONES);
    setHeaderTagline(row.header_tagline || DEFAULT_HEADER_TAGLINE);
    setFooterAddresses(row.footer_addresses || DEFAULT_FOOTER_ADDRESSES);

    const rowItems =
      Array.isArray(row.items) && row.items.length > 0
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

  const applyCustomerObject = found => {
    if (!found) return;
    setCustomerId(String(found.id));
    setClientName(found.name || '');
    setClientContact(found.phone && found.phone !== 'N/A' ? found.phone : '');
    if (found.notes) {
      setClientAddress(found.notes);
    }
  };

  const handleSelectCustomer = nextCustId => {
    setCustomerId(nextCustId);
    const found = customers.find(c => String(c.id) === String(nextCustId));
    if (found) {
      applyCustomerObject(found);
    }
  };

  const updateItemLine = (index, patch) => {
    setItems(prev => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  };

  const handlePickCatalogProduct = (index, prodIdOrObj) => {
    const found =
      typeof prodIdOrObj === 'object' && prodIdOrObj !== null
        ? prodIdOrObj
        : products.find(p => String(p.id) === String(prodIdOrObj));
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

  const handleQuickAddCatalogProduct = prod => {
    if (!prod) return;
    setItems(prev => {
      const existingIdx = prev.findIndex(
        it =>
          (it.product_id && String(it.product_id) === String(prod.id)) ||
          String(it.description || '').trim().toLowerCase() ===
            String(prod.name || '').trim().toLowerCase()
      );
      if (existingIdx !== -1) {
        return prev.map((it, i) =>
          i === existingIdx
            ? { ...it, qty: String(Math.max(1, (parseInt(it.qty, 10) || 1) + 1)) }
            : it
        );
      }
      const emptyIdx = prev.findIndex(it => !String(it.description || '').trim());
      const newLine = {
        key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        product_id: String(prod.id),
        description: prod.name || '',
        warranty: '1 year Company warranty',
        qty: '1',
        unit_price: (Number(prod.price || 0) / 100).toFixed(2),
      };
      if (emptyIdx !== -1) {
        return prev.map((it, i) => (i === emptyIdx ? newLine : it));
      }
      return [...prev, newLine];
    });
    setQuickQuery('');
    setQuickOpen(false);
    ctx.setNotice(`Added "${prod.name}" to ${docType.toLowerCase()}.`);
  };

  const handleQuickAddCustomText = () => {
    const clean = quickQuery.trim();
    if (!clean) return;
    if (quickMatchedProducts.length === 1) {
      handleQuickAddCatalogProduct(quickMatchedProducts[0]);
      return;
    }
    setItems(prev => {
      const emptyIdx = prev.findIndex(it => !String(it.description || '').trim());
      const newLine = {
        key: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        product_id: '',
        description: clean,
        warranty: '1 year Company warranty',
        qty: '1',
        unit_price: '',
      };
      if (emptyIdx !== -1) {
        return prev.map((it, i) => (i === emptyIdx ? newLine : it));
      }
      return [...prev, newLine];
    });
    setQuickQuery('');
    setQuickOpen(false);
  };

  const addItemLine = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItemLine = index => {
    setItems(prev => (prev.length <= 1 ? [createEmptyItem()] : prev.filter((_, i) => i !== index)));
  };

  const saveToDatabase = async (overridePayload = {}) => {
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
        doc_type: overridePayload.doc_type || docType,
        quote_date: quoteDate || today(),
        valid_until: validUntil.trim(),
        client_name: clientName.trim(),
        client_contact: clientContact.trim(),
        client_address: clientAddress.trim(),
        po_number: (overridePayload.po_number ?? poNumber).trim(),
        po_date: (overridePayload.po_date ?? poDate).trim(),
        po_approved_by: (overridePayload.po_approved_by ?? poApprovedBy).trim(),
        po_notes: (overridePayload.po_notes ?? poNotes).trim(),
        header_phones: headerPhones.trim() || DEFAULT_HEADER_PHONES,
        header_tagline: headerTagline.trim() || DEFAULT_HEADER_TAGLINE,
        footer_addresses: footerAddresses.trim() || DEFAULT_FOOTER_ADDRESSES,
        discount: discountCents,
        status: overridePayload.status || status,
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
      setQuoteNo(saved.quote_no || displayQuoteNo);
      if (saved.customer_id) {
        setCustomerId(String(saved.customer_id));
      }
      if (saved.doc_type) setDocType(saved.doc_type);
      if (saved.status) setStatus(saved.status);
      onRefresh?.();

      const custMsg = saved.customer_auto_created
        ? ` · New customer "${saved.client_name}" automatically added to Customers table!`
        : '';
      ctx.setNotice(`${saved.doc_type || docType} ${saved.quote_no} saved to database${custMsg}`);
      return saved;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const captureSheetToCanvas = async docData => {
    setCaptureDoc(docData);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const targetEl = hiddenCaptureRef.current || previewRef.current;
    if (!targetEl) {
      throw new Error('Preview sheet element not ready.');
    }

    const canvas = await html2canvas(targetEl, {
      scale: 2.5,
      width: 794,
      height: 1123,
      windowWidth: 1600,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (_clonedDoc, clonedEl) => {
        clonedEl.style.transform = 'none';
        clonedEl.style.width = '794px';
        clonedEl.style.height = '1123px';
      },
    });
    return canvas;
  };

  const handleDownloadPdf = async docData => {
    setPdfBusy(true);
    setError('');
    try {
      const canvas = await captureSheetToCanvas(docData);
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      const prefix = docData.doc_type === 'Invoice' ? 'Invoice' : 'Quotation';
      const cleanNo = String(docData.quote_no || 'ZD0001').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanClient = String(docData.client_name || 'Client')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 30);
      pdf.save(`ZEEDAT_${prefix}_${cleanNo}_${cleanClient}.pdf`);
      ctx.setNotice(`${prefix} ${docData.quote_no} downloaded as PDF.`);
    } catch (err) {
      setError('Could not generate PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePrintA4 = async docToPrint => {
    setPdfBusy(true);
    setError('');
    try {
      const canvas = await captureSheetToCanvas(docToPrint);
      const imgData = canvas.toDataURL('image/png');
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${docToPrint.doc_type || 'Quotation'} ${docToPrint.quote_no || ''}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; background: #fff; }
    img { width: 210mm; height: 297mm; display: block; }
  </style>
</head>
<body>
  <img src="${imgData}" onload="setTimeout(function(){ window.focus(); window.print(); }, 80);" />
</body>
</html>`);
        doc.close();
      }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 60000);
    } catch (err) {
      setError('Could not print document: ' + (err.message || 'Unknown error'));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSaveAndDownloadPdf = async () => {
    const saved = await saveToDatabase();
    if (saved) {
      await handleDownloadPdf(saved);
    }
  };

  const handleSaveAndPrint = async () => {
    const saved = await saveToDatabase();
    if (saved) {
      await handlePrintA4(saved);
    }
  };

  const openAcceptPoModal = async (targetRow = null) => {
    let row = targetRow;
    if (!row) {
      const saved = await saveToDatabase();
      if (!saved) return;
      row = saved;
    }
    setPoModalTarget(row);
    setPoForm({
      po_number: row.po_number || `PO-${row.quote_no || displayQuoteNo}`,
      po_date: row.po_date || today(),
      po_approved_by: row.po_approved_by || row.client_contact || row.client_name || '',
      po_notes: row.po_notes || '',
    });
    setPoModalOpen(true);
  };

  const submitPoAcceptance = async (generateInvoiceImmediate = false) => {
    if (!poModalTarget) return;
    setBusy(true);
    setError('');
    try {
      const updated = await ctx.mutate('quotation.status', {
        id: poModalTarget.id,
        operation: 'accept_po',
        po_number: poForm.po_number.trim() || `PO-${poModalTarget.quote_no}`,
        po_date: poForm.po_date || today(),
        po_approved_by: poForm.po_approved_by.trim(),
        po_notes: poForm.po_notes.trim(),
        generate_invoice: generateInvoiceImmediate,
      });
      setPoModalOpen(false);
      onRefresh?.();
      loadQuotationToBuilder(updated, false, generateInvoiceImmediate ? 'Invoice' : updated.doc_type);
      ctx.setNotice(
        generateInvoiceImmediate
          ? `PO #${updated.po_number} recorded & Official Invoice ${updated.quote_no} generated!`
          : `Quotation ${updated.quote_no} accepted with Purchase Order #${updated.po_number}.`
      );
      if (generateInvoiceImmediate) {
        await handleDownloadPdf(updated);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Opens the "Mark Money Received (Paid)" dialog for a row, or unmarks if already Paid.
   */
  const openMarkPaidModal = row => {
    setPayModalRow(row);
    setPayForm({
      paid_at: row.paid_at || today(),
      payment_method: row.payment_method || 'Bank Transfer',
      payment_reference: row.payment_reference || row.po_number || '',
    });
  };

  const submitMarkPayment = async (row, nextPayStatus, details = {}) => {
    setBusy(true);
    setError('');
    try {
      const updated = await ctx.mutate('quotation.status', {
        id: row.id,
        operation: 'mark_payment',
        payment_status: nextPayStatus,
        paid_at: details.paid_at || today(),
        payment_method: details.payment_method || 'Cash',
        payment_reference: details.payment_reference || '',
      });
      setPayModalRow(null);
      onRefresh?.();
      ctx.setNotice(
        nextPayStatus === 'Paid'
          ? `${updated.quote_no} (${updated.client_name}) marked as PAID (Money Received: LKR ${fmtNum(updated.grand_total)}).`
          : `${updated.quote_no} marked as Unpaid (Pending Payment).`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRejectQuotation = async row => {
    setBusy(true);
    setError('');
    try {
      await ctx.mutate('quotation.status', {
        id: row.id,
        operation: 'reject',
      });
      onRefresh?.();
      ctx.setNotice(`${row.quote_no} marked as Rejected.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateInvoiceFromCurrent = async () => {
    if (!editingId) {
      const saved = await saveToDatabase({
        doc_type: 'Invoice',
        status: 'Invoiced',
        po_number: poNumber || `PO-${displayQuoteNo}`,
        po_date: poDate || today(),
      });
      if (saved) {
        await handleDownloadPdf(saved);
      }
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await ctx.mutate('quotation.status', {
        id: editingId,
        operation: 'convert_to_invoice',
        po_number: poNumber || `PO-${displayQuoteNo}`,
        po_date: poDate || today(),
        po_approved_by: poApprovedBy,
        po_notes: poNotes,
      });
      onRefresh?.();
      loadQuotationToBuilder(updated, false, 'Invoice');
      ctx.setNotice(`Official Invoice ${updated.quote_no} generated from Quotation!`);
      await handleDownloadPdf(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
      ctx.setNotice(`Quotation ${row.quote_no} converted to Official Invoice.`);
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
      ctx.setNotice(`${row.doc_type || 'Quotation'} ${row.quote_no} deleted.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Categorized lists & totals:
   * - `unpaidAcceptedList`: Accepted / PO Accepted / Approved / Invoiced records that are still Unpaid (shows Count + Total To Pay)
   * - `paidList`: Records where `payment_status === 'Paid'` (shows Count + Total Paid)
   * - `generatedPendingList`: Generated quotations awaiting acceptance (`Saved`, `Draft`, `Sent` and not yet accepted/paid) — Count only!
   * - `rejectedList`: Rejected quotations (`status === 'Rejected'`) — Count only!
   */
  const breakdown = useMemo(() => {
    const unpaidAcceptedList = [];
    let unpaidAcceptedTotal = 0;

    const paidList = [];
    let paidTotal = 0;

    const generatedPendingList = [];
    const rejectedList = [];

    for (const q of quotations) {
      if (q.status === 'Rejected') {
        rejectedList.push(q);
      } else if (q.payment_status === 'Paid') {
        paidList.push(q);
        paidTotal += Number(q.grand_total || 0);
      } else if (isAcceptedRecord(q)) {
        unpaidAcceptedList.push(q);
        unpaidAcceptedTotal += Number(q.grand_total || 0);
      } else {
        generatedPendingList.push(q);
      }
    }

    return {
      unpaidAcceptedList,
      unpaidAcceptedTotal,
      paidList,
      paidTotal,
      generatedPendingList,
      rejectedList,
    };
  }, [quotations]);

  // Month-by-Month Paid grouping for Monthly Paid Report
  const monthlyPaidGroups = useMemo(() => {
    const map = new Map();
    for (const r of breakdown.paidList) {
      const ym = extractMonthKey(r);
      const entry = map.get(ym) || { ym, label: formatMonthLabel(ym), count: 0, total: 0, rows: [] };
      entry.count += 1;
      entry.total += Number(r.grand_total || 0);
      entry.rows.push(r);
      map.set(ym, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.ym.localeCompare(a.ym));
  }, [breakdown.paidList]);

  const filteredPaidForMonth = useMemo(() => {
    if (!reportMonth || reportMonth === 'all') {
      return breakdown.paidList;
    }
    return breakdown.paidList.filter(r => extractMonthKey(r) === reportMonth);
  }, [breakdown.paidList, reportMonth]);

  const selectedMonthPaidTotal = useMemo(
    () => filteredPaidForMonth.reduce((sum, r) => sum + Number(r.grand_total || 0), 0),
    [filteredPaidForMonth]
  );

  const exportPaidReportCsv = rows => {
    const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'System No',
      'Type',
      'PO Number',
      'Client / Company',
      'Contact',
      'Address',
      'Items',
      'Paid Date',
      'Payment Method',
      'Payment Reference',
      'Paid Amount (LKR)',
    ];
    const lines = [
      headers.map(csvCell).join(','),
      ...rows.map(r =>
        [
          r.quote_no,
          r.doc_type || 'Quotation',
          r.po_number || '',
          r.client_name || '',
          r.client_contact || '',
          r.client_address || '',
          (r.items || []).map(i => `${i.description} (x${fmtQty(i.qty)})`).join('; '),
          r.paid_at || r.quote_date || '',
          r.payment_method || 'Cash',
          r.payment_reference || '',
          (Number(r.grand_total || 0) / 100).toFixed(2),
        ]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZEEDAT_Paid_Report_${reportMonth || 'All'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const filteredQuotations = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return quotations.filter(row => {
      if (historyFilter === 'accepted_unpaid') {
        if (row.status === 'Rejected' || row.payment_status === 'Paid' || !isAcceptedRecord(row)) {
          return false;
        }
      } else if (historyFilter === 'paid') {
        if (row.payment_status !== 'Paid') return false;
      } else if (historyFilter === 'generated') {
        if (row.status === 'Rejected' || row.payment_status === 'Paid' || isAcceptedRecord(row)) {
          return false;
        }
      } else if (historyFilter === 'rejected') {
        if (row.status !== 'Rejected') return false;
      }

      if (q) {
        const itemsText = (row.items || []).map(i => `${i.description} ${i.warranty}`).join(' ');
        const hay = `${row.quote_no} ${row.po_number || ''} ${row.client_name} ${row.client_contact} ${row.client_address} ${row.payment_method || ''} ${row.payment_reference || ''} ${itemsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [quotations, historyFilter, historySearch]);

  const workflowStep =
    docType === 'Invoice' || status === 'Invoiced'
      ? 3
      : poNumber || status === 'PO Accepted'
        ? 2
        : 1;

  return (
    <div className="zk-quo-page">
      {/* Offscreen unscaled 1:1 A4 capture target so downloaded PDF is 100% identical to Live Preview */}
      <div className="zk-quo-offscreen-capture" aria-hidden="true">
        <ZeedatA4Sheet doc={captureDoc || currentDocPreview} sheetRef={hiddenCaptureRef} />
      </div>

      <Heading
        title="Quotations, Purchase Orders & Corporate Invoices"
        description="Auto-numbered ZD0001+ quotations, accepted unpaid tracking, payment received marking, and month-by-month paid reports"
      >
        <Button
          icon={Plus}
          variant="soft"
          onClick={() => {
            resetForm('Quotation');
            setActiveTab('builder');
          }}
        >
          New Quotation ({nextAutoNumber})
        </Button>
        <Button
          icon={FileCheck2}
          variant="soft"
          onClick={() => {
            resetForm('Invoice');
            setActiveTab('builder');
          }}
        >
          New Direct Invoice
        </Button>
        <Button
          icon={FileBarChart2}
          variant={activeTab === 'paid_report' ? 'primary' : 'soft'}
          onClick={() => setActiveTab('paid_report')}
        >
          Monthly Paid Report ({breakdown.paidList.length})
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

      {/* 4 KPI CARDS:
          1. Accepted & Unpaid (To Pay) — WITH TOTAL LKR
          2. Paid / Money Received — WITH TOTAL LKR
          3. Generated / Pending Quotations — COUNT ONLY (NO MONEY TOTAL)
          4. Rejected Quotations — COUNT ONLY (NO MONEY TOTAL)
      */}
      <div className="zk-quo-kpis four-cols">
        <div
          className="zk-quo-kpi-card gold"
          onClick={() => {
            setHistoryFilter('accepted_unpaid');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon">
            <Clock3 size={20} />
          </div>
          <div>
            <small>Accepted · To Pay ({breakdown.unpaidAcceptedList.length})</small>
            <strong>{money(breakdown.unpaidAcceptedTotal)}</strong>
            <span>Accepted &amp; awaiting payment</span>
          </div>
        </div>

        <div
          className="zk-quo-kpi-card green"
          onClick={() => setActiveTab('paid_report')}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon green">
            <Banknote size={20} />
          </div>
          <div>
            <small>Paid · Money Received ({breakdown.paidList.length})</small>
            <strong>{money(breakdown.paidTotal)}</strong>
            <span>Click for Month-by-Month Paid Report</span>
          </div>
        </div>

        <div
          className="zk-quo-kpi-card"
          onClick={() => {
            setHistoryFilter('generated');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon">
            <FileText size={20} />
          </div>
          <div>
            <small>Generated Quotations</small>
            <strong>{breakdown.generatedPendingList.length} Quotations</strong>
            <span>Awaiting client acceptance · Next: {nextAutoNumber}</span>
          </div>
        </div>

        <div
          className="zk-quo-kpi-card"
          onClick={() => {
            setHistoryFilter('rejected');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon red">
            <Ban size={20} />
          </div>
          <div>
            <small>Rejected Quotations</small>
            <strong>{breakdown.rejectedList.length} Rejected</strong>
            <span>Declined / cancelled quotes</span>
          </div>
        </div>
      </div>

      {/* MAIN TABS */}
      <div className="zk-quo-tabs-bar">
        <FilterTabs
          value={activeTab}
          onChange={setActiveTab}
          choices={[
            [
              'builder',
              editingId
                ? `Editing ${docType} ${displayQuoteNo}`
                : `Create ${docType} (${displayQuoteNo}) & Live PDF Preview`,
            ],
            ['history', `Saved Quotations, POs & Invoices (${quotations.length})`],
            ['paid_report', `Monthly Paid Report (${breakdown.paidList.length})`],
          ]}
        />
        {activeTab === 'builder' && (
          <div className="zk-quo-top-actions">
            <Button
              type="button"
              icon={Save}
              variant="soft"
              disabled={busy || pdfBusy}
              onClick={() => saveToDatabase()}
            >
              {busy ? 'Saving…' : editingId ? `Update ${docType}` : `Save ${docType}`}
            </Button>
            {docType === 'Quotation' && (
              <Button
                type="button"
                icon={ClipboardCheck}
                variant="soft"
                disabled={busy || pdfBusy}
                onClick={() => openAcceptPoModal(null)}
              >
                Accept Quote &amp; Add PO
              </Button>
            )}
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
          VIEW 1: QUOTATION -> PO -> INVOICE BUILDER + LIVE A4 PREVIEW
      ========================================================= */}
      {activeTab === 'builder' && (
        <div className="zk-quo-workspace">
          <div className="zk-quo-form-col">
            <Panel
              title={
                editingId
                  ? `${docType} ${displayQuoteNo} · Workflow & Details`
                  : `New ${docType} (${displayQuoteNo})`
              }
              icon={FileSpreadsheet}
            >
              <div className="zk-quo-form-stack">
                <div className="zk-quo-flow-stepper">
                  <div
                    className={`zk-quo-flow-step ${workflowStep >= 1 ? 'done' : ''} ${
                      workflowStep === 1 ? 'current' : ''
                    }`}
                  >
                    <span className="step-num">1</span>
                    <div className="step-info">
                      <strong>1. Create Quotation</strong>
                      <small>Auto ID: {displayQuoteNo}</small>
                    </div>
                  </div>
                  <ArrowRight size={15} className="flow-arrow" />
                  <div
                    className={`zk-quo-flow-step ${workflowStep >= 2 ? 'done' : ''} ${
                      workflowStep === 2 ? 'current' : ''
                    }`}
                  >
                    <span className="step-num">2</span>
                    <div className="step-info">
                      <strong>2. Accept &amp; Purchase Order</strong>
                      <small>{poNumber ? `PO: ${poNumber}` : 'Record client PO #'}</small>
                    </div>
                    <button
                      type="button"
                      className="flow-action-btn"
                      disabled={busy}
                      onClick={() => openAcceptPoModal(null)}
                    >
                      {poNumber ? 'Edit PO' : 'Accept & Add PO'}
                    </button>
                  </div>
                  <ArrowRight size={15} className="flow-arrow" />
                  <div className={`zk-quo-flow-step ${workflowStep === 3 ? 'done current' : ''}`}>
                    <span className="step-num">3</span>
                    <div className="step-info">
                      <strong>3. Generate Invoice</strong>
                      <small>
                        {docType === 'Invoice' ? `Invoice ${displayQuoteNo}` : 'Create A4 Invoice'}
                      </small>
                    </div>
                    {docType !== 'Invoice' && (
                      <button
                        type="button"
                        className="flow-action-btn gold"
                        disabled={busy || pdfBusy}
                        onClick={handleGenerateInvoiceFromCurrent}
                      >
                        Generate Invoice
                      </button>
                    )}
                  </div>
                </div>

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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {poNumber && <Badge tone="blue">PO: {poNumber}</Badge>}
                    <Badge tone="amber">System No: {displayQuoteNo}</Badge>
                  </div>
                </div>

                <div className="zk-quo-grid-meta">
                  <Field
                    label={`${
                      docType === 'Invoice' ? 'Invoice' : 'Quotation'
                    } No (System Auto-Generated)`}
                  >
                    <div className="zk-quo-readonly-no">
                      <Lock size={14} />
                      <strong>{displayQuoteNo}</strong>
                      <span>Auto-Increase Unique ID</span>
                    </div>
                  </Field>
                  <Field label={`${docType === 'Invoice' ? 'Invoice' : 'Quotation'} Date *`}>
                    <input
                      type="date"
                      value={quoteDate}
                      onChange={e => setQuoteDate(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={docType === 'Invoice' ? 'Payment Terms / Days' : 'Valid Until (Days)'}
                  >
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
                        ['Saved', 'Saved (Generated)'],
                        ['Draft', 'Draft'],
                        ['Sent', 'Sent to Client'],
                        ['PO Accepted', 'PO Accepted'],
                        ['Approved', 'Approved'],
                        ['Invoiced', 'Invoiced'],
                        ['Rejected', 'Rejected'],
                      ]}
                    />
                  </Field>
                </div>

                <div className="zk-quo-client-box">
                  <div className="zk-quo-section-head">
                    <div>
                      <strong>
                        1. Client / Company Information (
                        {docType === 'Invoice' ? 'INVOICE TO' : 'QUOTATION TO'})
                      </strong>
                      <small className="muted">
                        Pick a saved customer OR type a new customer below (new customers are automatically saved to the Customers table!)
                      </small>
                    </div>
                    {customerId && (
                      <Badge tone="green">
                        <UserCheck size={12} /> Linked to {ref('CUS', customerId)}
                      </Badge>
                    )}
                  </div>

                  <Field label="Quick Fill from Saved Customers (Optional)">
                    <Select
                      searchable
                      value={customerId}
                      blank="Search & pick an existing customer or type a new client below…"
                      options={customerOptions}
                      onChange={e => handleSelectCustomer(e.target.value)}
                    />
                  </Field>

                  <div className="zk-quo-grid-2">
                    <Field
                      label={`${
                        docType === 'Invoice' ? 'INVOICE TO' : 'QUOTATION TO'
                      } (Company / Client) *`}
                    >
                      <HybridClientInput
                        value={clientName}
                        customers={customers}
                        onType={val => {
                          setClientName(val);
                          const matched = customers.find(
                            c =>
                              String(c.name || '').trim().toLowerCase() ===
                              val.trim().toLowerCase()
                          );
                          setCustomerId(matched ? String(matched.id) : '');
                        }}
                        onPickCustomer={applyCustomerObject}
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

                  {(poNumber || docType === 'Invoice' || status === 'PO Accepted') && (
                    <div className="zk-quo-po-inline-box">
                      <div className="zk-quo-section-head">
                        <strong>Purchase Order (PO) Details</strong>
                        <Badge tone="blue">Attached to {displayQuoteNo}</Badge>
                      </div>
                      <div className="zk-quo-grid-meta">
                        <Field label="Purchase Order (PO) Number">
                          <input
                            type="text"
                            placeholder={`e.g. PO-${displayQuoteNo}`}
                            value={poNumber}
                            onChange={e => setPoNumber(e.target.value)}
                          />
                        </Field>
                        <Field label="PO Date">
                          <input
                            type="date"
                            value={poDate || today()}
                            onChange={e => setPoDate(e.target.value)}
                          />
                        </Field>
                        <Field label="Approved / Ordered By">
                          <input
                            type="text"
                            placeholder="Client Purchasing Officer"
                            value={poApprovedBy}
                            onChange={e => setPoApprovedBy(e.target.value)}
                          />
                        </Field>
                        <Field label="PO Notes / Delivery Terms">
                          <input
                            type="text"
                            placeholder="e.g. 14 Days Credit / Immediate Delivery"
                            value={poNotes}
                            onChange={e => setPoNotes(e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </div>

                <div className="zk-quo-items-box">
                  <div className="zk-quo-section-head">
                    <div>
                      <strong>2. Products &amp; Services ({items.length})</strong>
                      <small className="muted">
                        Search &amp; click to add from catalog (0-stock items included) OR type any custom item directly.
                      </small>
                    </div>
                    <Button type="button" size="sm" variant="primary" icon={Plus} onClick={addItemLine}>
                      + Add Empty Row
                    </Button>
                  </div>

                  <div ref={quickSearchRef} className="zk-quo-quick-add-bar">
                    <div className="zk-quo-quick-search-input">
                      <Search size={16} className="zk-quo-qs-icon" />
                      <input
                        type="text"
                        placeholder="Quick Search & Click to Add Product (or type custom item name & click Add)…"
                        value={quickQuery}
                        onFocus={() => setQuickOpen(true)}
                        onClick={() => setQuickOpen(true)}
                        onChange={e => {
                          setQuickQuery(e.target.value);
                          setQuickOpen(true);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleQuickAddCustomText();
                          }
                        }}
                      />
                      {quickQuery.trim() && (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          icon={Plus}
                          onClick={handleQuickAddCustomText}
                        >
                          Add “{quickQuery.trim().slice(0, 22)}”
                        </Button>
                      )}
                    </div>

                    {quickOpen && (
                      <div className="zk-quo-quick-dropdown">
                        <div className="zk-quo-hybrid-head">
                          <span>
                            Click any product below to add to {docType} (0-stock items allowed)
                          </span>
                          <button
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              setQuickOpen(false);
                            }}
                          >
                            Close
                          </button>
                        </div>
                        <div className="zk-quo-quick-list">
                          {quickMatchedProducts.map(p => {
                            const stockQty = Number(p.qty ?? 0);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                className="zk-quo-hybrid-item"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  handleQuickAddCatalogProduct(p);
                                }}
                              >
                                <div className="zk-quo-hybrid-item-main">
                                  <strong>+ {p.name}</strong>
                                  {p.sku && <span className="zk-quo-sku-pill">{p.sku}</span>}
                                </div>
                                <div className="zk-quo-hybrid-item-meta">
                                  <span className="price">{money(p.price)}</span>
                                  <span className={`stock ${stockQty > 0 ? 'in' : 'zero'}`}>
                                    {stockQty > 0 ? `Stock: ${stockQty}` : '0 Stock · Allowed'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                          {quickMatchedProducts.length === 0 && (
                            <div className="zk-quo-quick-empty">
                              <span>No catalog match for “{quickQuery}”.</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="soft"
                                icon={Plus}
                                onMouseDown={e => {
                                  e.preventDefault();
                                  handleQuickAddCustomText();
                                }}
                              >
                                Add “{quickQuery}” as Custom Item
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                              blank="Pick from catalog dropdown (0-stock included) OR type directly in Description below…"
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

                        <div className="zk-quo-line-desc-grid">
                          <Field label="Description of Service / Product (Type freely or click suggestion) *">
                            <HybridProductInput
                              value={line.description}
                              products={products}
                              onType={val => updateItemLine(index, { description: val })}
                              onPickProduct={prod => handlePickCatalogProduct(index, prod)}
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
                        </div>

                        <div className="zk-quo-line-numbers-grid">
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
                            <span>Line Total (LKR)</span>
                            <strong>{fmtNum(line.line_total_cents)}</strong>
                          </div>
                        </div>

                        <div className="zk-quo-warranty-chips">
                          <span>Warranty preset:</span>
                          {WARRANTY_PRESETS.map(preset => (
                            <button
                              key={preset}
                              type="button"
                              className={`zk-quo-chip ${
                                (preset === 'No Warranty' && !line.warranty) ||
                                line.warranty === preset
                                  ? 'active'
                                  : ''
                              }`}
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
                      onClick={() => saveToDatabase()}
                    >
                      {busy ? 'Saving…' : editingId ? `Update ${docType}` : `Save ${docType}`}
                    </Button>
                    {docType === 'Quotation' && (
                      <Button
                        type="button"
                        icon={ClipboardCheck}
                        variant="soft"
                        disabled={busy || pdfBusy}
                        onClick={() => openAcceptPoModal(null)}
                      >
                        Accept Quote &amp; Add PO
                      </Button>
                    )}
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

          <div className="zk-quo-preview-col">
            <div className="zk-quo-preview-toolbar">
              <div className="zk-quo-preview-title">
                <Eye size={15} />
                <span>
                  Live A4 PDF Preview ({docType.toUpperCase()} {displayQuoteNo})
                </span>
              </div>

              <div className="zk-quo-preview-btns">
                <div className="zk-quo-zoom-controls" title="Adjust preview zoom">
                  <button
                    type="button"
                    onClick={() =>
                      setManualScale(s =>
                        Math.max(0.38, Number(((s ?? previewScale) - 0.05).toFixed(2)))
                      )
                    }
                    aria-label="Zoom out"
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    className="zoom-pct"
                    onClick={() => setManualScale(null)}
                    title="Reset to Fit Full Page"
                  >
                    {Math.round(effectiveScale * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setManualScale(s =>
                        Math.min(0.95, Number(((s ?? previewScale) + 0.05).toFixed(2)))
                      )
                    }
                    aria-label="Zoom in"
                  >
                    <Plus size={12} />
                  </button>
                  {manualScale !== null && (
                    <button
                      type="button"
                      onClick={() => setManualScale(null)}
                      title="Fit entire A4 page on screen"
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={Printer}
                  disabled={pdfBusy}
                  onClick={() => handlePrintA4(currentDocPreview)}
                >
                  Print
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  icon={Download}
                  disabled={pdfBusy}
                  onClick={() => handleDownloadPdf(currentDocPreview)}
                >
                  {pdfBusy ? 'PDF…' : 'Download PDF'}
                </Button>
              </div>
            </div>

            <div ref={stageRef} className="zk-quo-a4-stage">
              <div
                className="zk-quo-a4-scale-box"
                style={{
                  width: `${Math.round(794 * effectiveScale)}px`,
                  height: `${Math.round(1123 * effectiveScale)}px`,
                }}
              >
                <div
                  className="zk-quo-a4-scale-inner"
                  style={{
                    transform: `scale(${effectiveScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <ZeedatA4Sheet doc={currentDocPreview} sheetRef={previewRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW 2: SAVED QUOTATIONS, PURCHASE ORDERS & INVOICES
      ========================================================= */}
      {activeTab === 'history' && (
        <Panel
          title={`Saved Quotations, Purchase Orders & Invoices (${filteredQuotations.length})`}
          icon={History}
        >
          <div className="zk-quo-history-toolbar">
            <div className="zk-quo-history-search">
              <SearchBox
                value={historySearch}
                onChange={setHistorySearch}
                placeholder="Search by ZD0001 No, PO Number, Client Name, Contact, Address, or Item…"
              />
            </div>
            <div className="zk-quo-history-filters">
              <FilterTabs
                value={historyFilter}
                onChange={setHistoryFilter}
                choices={[
                  ['all', `All (${quotations.length})`],
                  [
                    'accepted_unpaid',
                    `Accepted · To Pay (${breakdown.unpaidAcceptedList.length}) · ${money(
                      breakdown.unpaidAcceptedTotal
                    )}`,
                  ],
                  [
                    'paid',
                    `Paid · Money Received (${breakdown.paidList.length}) · ${money(
                      breakdown.paidTotal
                    )}`,
                  ],
                  ['generated', `Generated / Pending (${breakdown.generatedPendingList.length})`],
                  ['rejected', `Rejected (${breakdown.rejectedList.length})`],
                ]}
              />
              <Button icon={RefreshCw} variant="ghost" onClick={onRefresh}>
                Refresh
              </Button>
            </div>
          </div>

          {/* CONTEXTUAL SUMMARY BANNER BASED ON SELECTED FILTER */}
          {historyFilter === 'accepted_unpaid' && (
            <div className="zk-quo-status-summary-banner amber">
              <div>
                <strong>
                  Accepted &amp; Awaiting Payment ({breakdown.unpaidAcceptedList.length} Orders)
                </strong>
                <span>
                  These clients have accepted quotations / POs / invoices and still need to pay. Click{' '}
                  <strong>Mark Paid</strong> once money is received.
                </span>
              </div>
              <div className="summary-total">
                <small>Total Outstanding To Collect</small>
                <strong>{money(breakdown.unpaidAcceptedTotal)}</strong>
              </div>
            </div>
          )}

          {historyFilter === 'paid' && (
            <div className="zk-quo-status-summary-banner green">
              <div>
                <strong>
                  Paid Quotations &amp; Invoices ({breakdown.paidList.length} Orders)
                </strong>
                <span>
                  Money has been received for these orders. Open the Monthly Paid Report to filter and print month-by-month.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div className="summary-total">
                  <small>Total Money Received</small>
                  <strong>{money(breakdown.paidTotal)}</strong>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  icon={FileBarChart2}
                  onClick={() => setActiveTab('paid_report')}
                >
                  Open Monthly Paid Report
                </Button>
              </div>
            </div>
          )}

          {historyFilter === 'generated' && (
            <div className="zk-quo-status-summary-banner slate">
              <div>
                <strong>
                  Generated Quotations Awaiting Client Decision ({breakdown.generatedPendingList.length} Quotations)
                </strong>
                <span>
                  Click <strong>Accept &amp; PO</strong> when the client approves, or <strong>Reject</strong> if declined.
                </span>
              </div>
            </div>
          )}

          {historyFilter === 'rejected' && (
            <div className="zk-quo-status-summary-banner red">
              <div>
                <strong>
                  Rejected Quotations ({breakdown.rejectedList.length} Rejected)
                </strong>
                <span>
                  These quotations were marked as rejected. You can still view, clone, or re-open them if needed.
                </span>
              </div>
            </div>
          )}

          <Table
            rows={filteredQuotations}
            empty="No records match the selected filter."
            columns={[
              [
                'System No & Type',
                r => (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong>{r.quote_no}</strong>
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
                'PO & Status',
                r => (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <Badge tone={statusTone(r.status)}>{r.status || 'Saved'}</Badge>
                      {r.po_number && <Badge tone="blue">PO: {r.po_number}</Badge>}
                    </div>
                    {r.po_date && (
                      <div className="muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                        PO Date: {fmtShortDate(r.po_date)}
                        {r.po_approved_by ? ` · ${r.po_approved_by}` : ''}
                      </div>
                    )}
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
                      <div className="muted" style={{ fontSize: '11.5px', maxWidth: '220px' }}>
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
                'Amount',
                r =>
                  r.status === 'Rejected' ? (
                    <span className="muted">Rejected</span>
                  ) : (
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
                'Payment (Money Received)',
                r => {
                  if (r.status === 'Rejected') {
                    return <Badge tone="red">Rejected</Badge>;
                  }
                  const isPaid = r.payment_status === 'Paid';
                  return (
                    <div className="zk-quo-pay-cell">
                      {isPaid ? (
                        <>
                          <Badge tone="green">✓ Paid (Money Received)</Badge>
                          <small className="muted">
                            {fmtShortDate(r.paid_at || r.quote_date)} · {r.payment_method || 'Cash'}
                            {r.payment_reference ? ` (${r.payment_reference})` : ''}
                          </small>
                          <button
                            type="button"
                            className="zk-quo-mini-pay-btn unmark"
                            disabled={busy}
                            onClick={() => submitMarkPayment(r, 'Unpaid')}
                          >
                            Mark Unpaid
                          </button>
                        </>
                      ) : (
                        <>
                          <Badge tone={isAcceptedRecord(r) ? 'amber' : 'slate'}>
                            {isAcceptedRecord(r) ? 'Unpaid · To Pay' : 'Not Paid Yet'}
                          </Badge>
                          <button
                            type="button"
                            className="zk-quo-mini-pay-btn mark-paid"
                            disabled={busy}
                            onClick={() => openMarkPaidModal(r)}
                          >
                            <Banknote size={12} /> Mark Paid
                          </button>
                        </>
                      )}
                    </div>
                  );
                },
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
                      onClick={() => handleDownloadPdf(r)}
                    >
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Printer}
                      disabled={pdfBusy}
                      onClick={() => handlePrintA4(r)}
                    >
                      Print
                    </Button>
                    {r.doc_type !== 'Invoice' && r.status !== 'Rejected' && (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={ClipboardCheck}
                        disabled={busy}
                        onClick={() => openAcceptPoModal(r)}
                      >
                        {r.po_number ? 'Edit PO' : 'Accept & PO'}
                      </Button>
                    )}
                    {r.doc_type !== 'Invoice' && r.status !== 'Rejected' && (
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
                    {r.status !== 'Rejected' && r.payment_status !== 'Paid' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Ban}
                        className="text-red"
                        title="Mark Quotation as Rejected"
                        disabled={busy}
                        onClick={() => handleRejectQuotation(r)}
                      >
                        Reject
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Pencil}
                      onClick={() => loadQuotationToBuilder(r, false)}
                    >
                      Edit
                    </Button>
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

      {/* =========================================================
          VIEW 3: MONTH-BY-MONTH PAID REPORT (ගෙවපු ඒවගේ Report එක)
      ========================================================= */}
      {activeTab === 'paid_report' && (
        <Panel
          title={`Month-by-Month Paid Quotations & Invoices Report (${
            reportMonth === 'all' ? 'All Months' : formatMonthLabel(reportMonth)
          })`}
          icon={FileBarChart2}
        >
          {/* MONTH SELECTOR & EXPORT TOOLBAR */}
          <div className="zk-quo-report-bar">
            <div className="zk-quo-month-picker-group">
              <label className="zk-quo-month-label">
                <CalendarDays size={16} />
                <span>Select Month:</span>
                <input
                  type="month"
                  value={reportMonth === 'all' ? '' : reportMonth}
                  onChange={e => setReportMonth(e.target.value || 'all')}
                />
              </label>
              <Button
                size="sm"
                variant={reportMonth === 'all' ? 'primary' : 'outline'}
                onClick={() => setReportMonth('all')}
              >
                All Months ({breakdown.paidList.length})
              </Button>
              <Button
                size="sm"
                variant={reportMonth === today().slice(0, 7) ? 'primary' : 'soft'}
                onClick={() => setReportMonth(today().slice(0, 7))}
              >
                This Month ({formatMonthLabel(today().slice(0, 7))})
              </Button>
            </div>

            <div className="zk-quo-top-actions">
              <Button
                size="sm"
                variant="outline"
                icon={Download}
                disabled={filteredPaidForMonth.length === 0}
                onClick={() => exportPaidReportCsv(filteredPaidForMonth)}
              >
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={Printer}
                onClick={() =>
                  printHtmlDocument(
                    buildPaidReportA4Html({
                      rows: filteredPaidForMonth,
                      monthKey: reportMonth,
                      shopName: systemShopName || 'ZEEDAT POS',
                      logoUrl: systemLogo || getSystemLogo(),
                    })
                  )
                }
              >
                Print Monthly Paid Report (A4)
              </Button>
            </div>
          </div>

          {/* CLICKABLE MONTH-BY-MONTH BREAKDOWN CARDS */}
          {monthlyPaidGroups.length > 0 && (
            <div className="zk-quo-month-cards">
              {monthlyPaidGroups.map(m => (
                <button
                  key={m.ym}
                  type="button"
                  className={`zk-quo-month-card ${reportMonth === m.ym ? 'active' : ''}`}
                  onClick={() => setReportMonth(m.ym)}
                >
                  <div className="m-top">
                    <strong>{m.label}</strong>
                    <Badge tone={reportMonth === m.ym ? 'green' : 'slate'}>
                      {m.count} Paid
                    </Badge>
                  </div>
                  <div className="m-val">{money(m.total)}</div>
                </button>
              ))}
            </div>
          )}

          {/* SELECTED PERIOD SUMMARY BANNER */}
          <div className="zk-quo-status-summary-banner green" style={{ marginBottom: '14px' }}>
            <div>
              <strong>
                Paid Report Period:{' '}
                {reportMonth === 'all' ? 'All Months' : formatMonthLabel(reportMonth)}
              </strong>
              <span>
                Showing {filteredPaidForMonth.length} paid quotation(s) / invoice(s) where payment was received.
              </span>
            </div>
            <div className="summary-total">
              <small>
                Total Collected ({reportMonth === 'all' ? 'All Months' : formatMonthLabel(reportMonth)})
              </small>
              <strong>{money(selectedMonthPaidTotal)}</strong>
            </div>
          </div>

          <Table
            rows={filteredPaidForMonth}
            empty={`No paid quotations or invoices recorded for ${
              reportMonth === 'all' ? 'any month yet' : formatMonthLabel(reportMonth)
            }. Click "Mark Paid" on any accepted quotation/invoice when payment is received.`}
            columns={[
              [
                'Paid Date',
                r => (
                  <div>
                    <strong>{fmtShortDate(r.paid_at || r.quote_date)}</strong>
                    <div className="muted" style={{ fontSize: '11px' }}>
                      {formatMonthLabel(extractMonthKey(r))}
                    </div>
                  </div>
                ),
              ],
              [
                'System No & PO',
                r => (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong>{r.quote_no}</strong>
                      <Badge tone={r.doc_type === 'Invoice' ? 'green' : 'amber'}>
                        {r.doc_type || 'Quotation'}
                      </Badge>
                    </div>
                    {r.po_number && <small className="muted">PO: {r.po_number}</small>}
                  </div>
                ),
              ],
              [
                'Client / Company',
                r => (
                  <div>
                    <strong>{r.client_name}</strong>
                    <div className="muted" style={{ fontSize: '11.5px' }}>
                      {r.client_contact || ''}
                    </div>
                  </div>
                ),
              ],
              [
                'Items',
                r => {
                  const list = r.items || [];
                  return (
                    <div style={{ maxWidth: '250px', fontSize: '12px' }}>
                      {list.map(i => `${i.description} (x${fmtQty(i.qty)})`).join(', ')}
                    </div>
                  );
                },
              ],
              [
                'Payment Method & Ref',
                r => (
                  <div>
                    <Badge tone="green">{r.payment_method || 'Cash'}</Badge>
                    {r.payment_reference && (
                      <div className="muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                        Ref: {r.payment_reference}
                      </div>
                    )}
                  </div>
                ),
              ],
              [
                'Paid Amount',
                r => <strong className="text-green">LKR {fmtNum(r.grand_total)}</strong>,
              ],
              [
                'Invoice / PDF',
                r => (
                  <div className="row-actions">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Download}
                      disabled={pdfBusy}
                      onClick={() => handleDownloadPdf(r)}
                    >
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={Printer}
                      disabled={pdfBusy}
                      onClick={() => handlePrintA4(r)}
                    >
                      Print
                    </Button>
                  </div>
                ),
              ],
            ]}
          />
        </Panel>
      )}

      {/* =========================================================
          MODAL 1: ACCEPT QUOTATION & RECORD PURCHASE ORDER (PO)
      ========================================================= */}
      {poModalOpen && poModalTarget && (
        <Modal
          title={`Accept Quotation ${poModalTarget.quote_no} & Record Purchase Order (PO)`}
          description={`Client: ${poModalTarget.client_name} · Grand Total: LKR ${fmtNum(
            poModalTarget.grand_total
          )}`}
          busy={busy}
          onClose={() => setPoModalOpen(false)}
        >
          <div className="modal-body" style={{ display: 'grid', gap: '14px' }}>
            <div className="zk-quo-po-modal-banner">
              <strong>Quotation → Purchase Order (PO) → Official Invoice Flow</strong>
              <p>
                Enter the client’s Purchase Order (PO) reference details below. You can either save the PO acceptance
                now or immediately generate &amp; download the official ZEEDAT A4 <strong>INVOICE</strong> PDF.
              </p>
            </div>

            <div className="zk-quo-grid-2">
              <Field label="Purchase Order (PO) Number *">
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder={`e.g. PO-${poModalTarget.quote_no}`}
                  value={poForm.po_number}
                  onChange={e => setPoForm({ ...poForm, po_number: e.target.value })}
                />
              </Field>
              <Field label="Purchase Order Date *">
                <input
                  type="date"
                  required
                  value={poForm.po_date}
                  onChange={e => setPoForm({ ...poForm, po_date: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Approved / Ordered By (Client Signatory / Contact)">
              <input
                type="text"
                placeholder="e.g. Purchasing Manager / Client Representative"
                value={poForm.po_approved_by}
                onChange={e => setPoForm({ ...poForm, po_approved_by: e.target.value })}
              />
            </Field>

            <Field label="PO Remarks / Delivery & Payment Terms (Optional)">
              <input
                type="text"
                placeholder="e.g. 14 Days Credit · Deliver to Head Office"
                value={poForm.po_notes}
                onChange={e => setPoForm({ ...poForm, po_notes: e.target.value })}
              />
            </Field>
          </div>

          <div className="modal-footer">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPoModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="soft"
              icon={ClipboardCheck}
              disabled={busy || !poForm.po_number.trim()}
              onClick={() => submitPoAcceptance(false)}
            >
              {busy ? 'Saving…' : 'Save PO & Mark Accepted'}
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={FileCheck2}
              disabled={busy || !poForm.po_number.trim()}
              onClick={() => submitPoAcceptance(true)}
            >
              {busy ? 'Generating…' : 'Save PO & Generate Official Invoice PDF'}
            </Button>
          </div>
        </Modal>
      )}

      {/* =========================================================
          MODAL 2: MARK PAYMENT RECEIVED (සල්ලි ලැබුණා / PAID)
      ========================================================= */}
      {payModalRow && (
        <Modal
          title={`Mark Payment Received · ${payModalRow.quote_no}`}
          description={`Client: ${payModalRow.client_name} · Amount: LKR ${fmtNum(
            payModalRow.grand_total
          )}`}
          busy={busy}
          onClose={() => setPayModalRow(null)}
        >
          <div className="modal-body" style={{ display: 'grid', gap: '14px' }}>
            <div className="zk-quo-status-summary-banner green">
              <div>
                <strong>Confirm Payment Collection</strong>
                <span>
                  This order will be marked as <strong>Paid (Money Received)</strong> and included in the{' '}
                  <strong>{formatMonthLabel((payForm.paid_at || today()).slice(0, 7))}</strong> Paid Report.
                </span>
              </div>
              <div className="summary-total">
                <small>Amount Received</small>
                <strong>LKR {fmtNum(payModalRow.grand_total)}</strong>
              </div>
            </div>

            <div className="zk-quo-grid-2">
              <Field label="Payment Received Date *">
                <input
                  type="date"
                  required
                  value={payForm.paid_at}
                  onChange={e => setPayForm({ ...payForm, paid_at: e.target.value })}
                />
              </Field>
              <Field label="Payment Method *">
                <Select
                  value={payForm.payment_method}
                  onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}
                  options={PAYMENT_METHODS.map(m => [m, m])}
                />
              </Field>
            </div>

            <Field label="Payment Reference / Cheque # / Bank Slip # (Optional)">
              <input
                type="text"
                placeholder="e.g. Bank transfer reference, cheque number, or PO #"
                value={payForm.payment_reference}
                onChange={e => setPayForm({ ...payForm, payment_reference: e.target.value })}
              />
            </Field>
          </div>

          <div className="modal-footer">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPayModalRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={CheckCircle2}
              disabled={busy}
              onClick={() => submitMarkPayment(payModalRow, 'Paid', payForm)}
            >
              {busy ? 'Saving…' : `Confirm Money Received (LKR ${fmtNum(payModalRow.grand_total)})`}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
