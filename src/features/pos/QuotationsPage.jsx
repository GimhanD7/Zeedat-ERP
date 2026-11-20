import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
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
import { cents, money, ref, timeLabel, today } from '../../utils';
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

    // 1. Bottom-left gold accent bar
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

    // 2. Right angled gold gradient polygon with soft shadow
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

    // 3. Left/Center angled black polygon with drop shadow
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

/**
 * Type-and-Click hybrid Customer / Client Name input:
 * Lets the user type any new customer/company name (which auto-saves into `customers` table on save)
 * OR click an existing customer from the live dropdown to auto-fill Name, Contact (Phone), and Address!
 */
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
                  <span className="stock in" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

/**
 * Type-and-Click hybrid product input for each row:
 * Allows typing any custom product/service name freely OR clicking any matching catalog product (including 0-stock items).
 */
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

/**
 * Shared A4 Document Sheet component (`794px × 1123px` exact A4 dimensions).
 * Uses div-based CSS Grid rows (.zk-a4-table) so global table/th/tr/.empty styles NEVER distort the layout.
 * Matches `nokia 105 original mobile 91.pdf` down to every margin, color, and signature line.
 */
function ZeedatA4Sheet({ doc, sheetRef }) {
  const bannerUrl = useMemo(() => getHeaderBannerDataUrl(), []);
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
        {/* TOP GEOMETRIC BLACK & GOLD HEADER BANNER */}
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
              <div className="zk-quo-logo-phone">
                <span>Z</span>
              </div>
              <div className="zk-quo-logo-word">ZEEDAT</div>
              <div className="zk-quo-logo-tiny">MOBILE &amp; PC</div>
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

        {/* BODY PADDING CONTAINER */}
        <div className="zk-quo-sheet-body">
          {/* CLIENT & QUOTATION INFO BLOCK */}
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

          {/* 12-ROW GOLD & GREY LINED ITEMS GRID TABLE (IMMUNE TO GLOBAL TABLE CSS) */}
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

          {/* SUB TOTAL / DISCOUNT / GRAND TOTAL */}
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

          {/* SIGNATURES & ACCEPTANCE */}
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

      {/* BOTTOM BLACK & GOLD ADDRESS BAR */}
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

  // Quick Search & Click to Add Product state
  const [quickQuery, setQuickQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);

  // History tab filters
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

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

  // Fit the entire 794x1123 A4 preview vertically AND horizontally inside the viewport so NO scrolling is needed
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

  // Compute next system-unique ZD0001+ quotation number automatically
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

  /**
   * Captures the exact ZeedatA4Sheet React DOM node into a high-resolution Canvas so that
   * both PDF Download and Print A4 are 100% identical to the Live A4 PDF Template Preview!
   */
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

  /**
   * Opens the "Accept Quotation & Add Purchase Order (PO)" modal for either the active Builder quotation
   * or any row from the Saved Quotations table.
   */
  const openAcceptPoModal = async (targetRow = null) => {
    let row = targetRow;
    if (!row) {
      // Save current builder quotation first if not yet saved
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

  const kpis = useMemo(() => {
    let quoteCount = 0;
    let poCount = 0;
    let invoiceCount = 0;
    let totalQuoteValue = 0;
    let totalInvoiceValue = 0;
    for (const q of quotations) {
      if (q.po_number || q.status === 'PO Accepted') {
        poCount++;
      }
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
      poCount,
      invoiceCount,
      totalQuoteValue,
      totalInvoiceValue,
    };
  }, [quotations]);

  const filteredQuotations = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return quotations.filter(row => {
      if (historyFilter === 'quotations' && row.doc_type === 'Invoice') return false;
      if (historyFilter === 'po_accepted' && !row.po_number && row.status !== 'PO Accepted') return false;
      if (historyFilter === 'invoices' && row.doc_type !== 'Invoice') return false;
      if (q) {
        const itemsText = (row.items || []).map(i => `${i.description} ${i.warranty}`).join(' ');
        const hay = `${row.quote_no} ${row.po_number || ''} ${row.client_name} ${row.client_contact} ${row.client_address} ${itemsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [quotations, historyFilter, historySearch]);

  const workflowStep = docType === 'Invoice' || status === 'Invoiced'
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
        description="Auto-numbered ZD0001+ quotations, automatic customer saving, Purchase Order (PO) acceptance flow, and exact ZEEDAT A4 PDF invoices"
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
            <small>1. Quotations ({kpis.quoteCount})</small>
            <strong>{money(kpis.totalQuoteValue)}</strong>
            <span>Next Auto ID: {nextAutoNumber}</span>
          </div>
        </div>

        <div
          className="zk-quo-kpi-card"
          onClick={() => {
            setHistoryFilter('po_accepted');
            setActiveTab('history');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="zk-quo-kpi-icon">
            <ClipboardCheck size={20} />
          </div>
          <div>
            <small>2. Accepted Purchase Orders</small>
            <strong>{kpis.poCount}</strong>
            <span>Quotations with PO attached</span>
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
            <small>3. Generated Invoices ({kpis.invoiceCount})</small>
            <strong>{money(kpis.totalInvoiceValue)}</strong>
            <span>Official ZEEDAT A4 PDF Invoices</span>
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
            ['history', `All Saved Quotations, POs & Invoices (${quotations.length})`],
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
          {/* LEFT: FORM BUILDER */}
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
                {/* 3-STAGE WORKFLOW PIPELINE: QUOTATION -> ACCEPT & PO -> GENERATE INVOICE */}
                <div className="zk-quo-flow-stepper">
                  <div className={`zk-quo-flow-step ${workflowStep >= 1 ? 'done' : ''} ${workflowStep === 1 ? 'current' : ''}`}>
                    <span className="step-num">1</span>
                    <div className="step-info">
                      <strong>1. Create Quotation</strong>
                      <small>Auto ID: {displayQuoteNo}</small>
                    </div>
                  </div>
                  <ArrowRight size={15} className="flow-arrow" />
                  <div className={`zk-quo-flow-step ${workflowStep >= 2 ? 'done' : ''} ${workflowStep === 2 ? 'current' : ''}`}>
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
                      <small>{docType === 'Invoice' ? `Invoice ${displayQuoteNo}` : 'Create A4 Invoice'}</small>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {poNumber && <Badge tone="blue">PO: {poNumber}</Badge>}
                    <Badge tone="amber">System No: {displayQuoteNo}</Badge>
                  </div>
                </div>

                {/* Auto-Generated System Unique Number (Read-Only) + Date + Valid Until + Status */}
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
                        ['Saved', 'Saved'],
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

                {/* Customer / Company Info (Auto-Saves New Customers to `customers` Table!) */}
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
                            c => String(c.name || '').trim().toLowerCase() === val.trim().toLowerCase()
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

                  {/* Purchase Order (PO) Details Box (Shown when PO is entered or in Invoice mode) */}
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

                {/* Line Items Section (Search & Click to Add + Type Custom Items + 0-Stock Allowed) */}
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

                  {/* QUICK SEARCH & CLICK TO ADD PRODUCT BAR */}
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

          {/* RIGHT: COMPACT FULL-VIEW LIVE A4 PDF TEMPLATE PREVIEW (NO VERTICAL SCROLL NEEDED) */}
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
          VIEW 2: ALL SAVED QUOTATIONS, POs & INVOICES DATABASE TABLE
      ========================================================= */}
      {activeTab === 'history' && (
        <Panel title={`Saved Quotations, Purchase Orders & Invoices (${filteredQuotations.length})`} icon={History}>
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
                  ['quotations', `Quotations (${kpis.quoteCount})`],
                  ['po_accepted', `PO Accepted (${kpis.poCount})`],
                  ['invoices', `Invoices (${kpis.invoiceCount})`],
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
                'Purchase Order (PO)',
                r =>
                  r.po_number ? (
                    <div>
                      <Badge tone="blue">PO: {r.po_number}</Badge>
                      <div className="muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                        {r.po_date ? fmtShortDate(r.po_date) : ''}
                        {r.po_approved_by ? ` · ${r.po_approved_by}` : ''}
                      </div>
                    </div>
                  ) : (
                    <span className="muted">No PO attached yet</span>
                  ),
              ],
              [
                'Items',
                r => {
                  const list = r.items || [];
                  return (
                    <div>
                      <strong>{list.length} item(s)</strong>
                      <div className="muted" style={{ fontSize: '11.5px', maxWidth: '240px' }}>
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
              ['Status', r => <Badge tone={statusTone(r.status)}>{r.status || 'Saved'}</Badge>],
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
                    {r.doc_type !== 'Invoice' && (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={ClipboardCheck}
                        disabled={busy}
                        onClick={() => openAcceptPoModal(r)}
                      >
                        {r.po_number ? 'PO / Invoice' : 'Accept & PO'}
                      </Button>
                    )}
                    {r.doc_type !== 'Invoice' && (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={CheckCircle2}
                        disabled={busy}
                        onClick={() => handleConvertToInvoice(r)}
                      >
                        Generate Invoice
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
          MODAL: ACCEPT QUOTATION & RECORD PURCHASE ORDER (PO) FLOW
      ========================================================= */}
      {poModalOpen && poModalTarget && (
        <Modal
          title={`Accept Quotation ${poModalTarget.quote_no} & Record Purchase Order (PO)`}
          description={`Client: ${poModalTarget.client_name} · Grand Total: LKR ${fmtNum(poModalTarget.grand_total)}`}
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
    </div>
  );
}
