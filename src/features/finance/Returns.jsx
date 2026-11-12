import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  Package,
  Phone,
  Printer,
  RefreshCw,
  Search,
  Tag,
  Undo2,
  User,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { useData } from '../../hooks/useData';
import { managers, money, options, ref, today } from '../../utils';
import { ReceiptModal } from '../pos/ReceiptModal';
import './returns.css';

const canManage = ctx => managers.includes(ctx.user.role);

// Calculate refund portion based on original sale item line
function calculateRefundPortion(total, qty, refundedQty, returnQty) {
  const prior = Math.floor((Number(total) * Number(refundedQty)) / Number(qty));
  const next = Math.floor((Number(total) * (Number(refundedQty) + Number(returnQty))) / Number(qty));
  return Math.max(0, next - prior);
}

export function Returns({ ctx }) {
  const state = useData(ctx, {
    returns: 'returns',
    settings: 'settings',
    sales: 'sales',
  });

  const branch = Number(ctx.branch);
  const isManager = canManage(ctx);

  // Tab navigation: 'lookup' | 'history' | 'browse'
  const [tab, setTab] = useState(ctx.intent === 'pending' ? 'history' : 'lookup');
  const [historyFilter, setHistoryFilter] = useState(ctx.intent === 'pending' ? 'Pending' : 'All');
  const [historySearch, setHistorySearch] = useState('');

  // Lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [matchingSales, setMatchingSales] = useState([]);

  // Catalog cache for replacement products & units
  const [catalog, setCatalog] = useState({ products: [], units: [] });
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Modals
  const [returnModal, setReturnModal] = useState(null); // { item, ... }
  const [exchangeModal, setExchangeModal] = useState(null); // { item, ... }
  const [resolveModal, setResolveModal] = useState(null); // { row, decision, ... }
  const [viewReceipt, setViewReceipt] = useState(null); // invoice object
  const [returnSlip, setReturnSlip] = useState(null); // return row object
  const [modalBusy, setModalBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  useEffect(() => {
    if (ctx.intent === 'pending') {
      setTab('history');
      setHistoryFilter('Pending');
      ctx.clearIntent();
    }
  }, [ctx.intent]);

  // Load catalog for branch
  const loadCatalog = async () => {
    if (catalog.products.length > 0) return catalog;
    setCatalogLoading(true);
    try {
      const [products, units] = await Promise.all([
        ctx.get('products', { branch }),
        ctx.get('units', { branch }),
      ]);
      const data = { products: products || [], units: units || [] };
      setCatalog(data);
      return data;
    } catch (e) {
      console.error('Failed to load branch catalog', e);
      return { products: [], units: [] };
    } finally {
      setCatalogLoading(false);
    }
  };

  // Find invoice by query
  const findInvoice = async (queryStr = lookupQuery) => {
    const q = (queryStr || '').trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    setInvoice(null);
    setMatchingSales([]);
    try {
      // First try direct invoice lookup
      const found = await ctx.get('invoice', { id: q });
      setInvoice(found);
      loadCatalog();
    } catch (err) {
      // If direct invoice lookup failed, try searching sales list for partial matches
      try {
        const matches = await ctx.get('sales.search', { q });
        if (Array.isArray(matches) && matches.length === 1) {
          const single = await ctx.get('invoice', { id: matches[0].id });
          setInvoice(single);
          loadCatalog();
        } else if (Array.isArray(matches) && matches.length > 1) {
          setMatchingSales(matches);
        } else {
          setSearchError(err.message || 'No matching sale found for "' + q + '".');
        }
      } catch (inner) {
        setSearchError(err.message || 'No invoice found.');
      }
    } finally {
      setSearching(false);
    }
  };

  // Open invoice directly from ID
  const selectInvoiceById = async id => {
    setSearching(true);
    setSearchError('');
    setMatchingSales([]);
    try {
      const found = await ctx.get('invoice', { id });
      setInvoice(found);
      setLookupQuery(ref('INV', found.id));
      setTab('lookup');
      loadCatalog();
    } catch (err) {
      setSearchError(err.message || 'Failed to load invoice.');
    } finally {
      setSearching(false);
    }
  };

  // Open Return / Refund Modal
  const openReturnModal = item => {
    const availableQty = item.qty - (item.refunded_qty || 0);
    const invoicePayments = invoice?.payments || [];
    const defaultMethod = invoicePayments[0]?.method || 'Cash';
    setActionError('');
    setReturnModal({
      item,
      qty: 1,
      condition: 'Unopened',
      restock: !item.unit_id && item.category !== 'Services',
      reasonPreset: 'Customer Changed Mind',
      reasonNote: '',
      method: defaultMethod,
      reference: '',
      availableQty,
    });
  };

  // Open Exchange Modal
  const openExchangeModal = async item => {
    const availableQty = item.qty - (item.refunded_qty || 0);
    setActionError('');
    await loadCatalog();
    setExchangeModal({
      item,
      qty: 1,
      condition: 'Opened / Like New',
      reasonPreset: 'Size / Spec Mismatch',
      reasonNote: '',
      replacementProductId: '',
      replacementUnitId: '',
      replacementQty: 1,
      diffMethod: 'Cash',
      diffRefundMethod: 'Cash',
      availableQty,
    });
  };

  // Submit Return Request or Direct Refund
  const handleReturnSubmit = async (e, direct = false) => {
    e.preventDefault();
    if (!returnModal || !invoice) return;
    setModalBusy(true);
    setActionError('');
    try {
      const reasonFull = [returnModal.reasonPreset, returnModal.reasonNote.trim()]
        .filter(Boolean)
        .join(' — ');

      const res = await ctx.mutate('return.request', {
        branch: invoice.branch_id || branch,
        item_id: returnModal.item.id,
        qty: Number(returnModal.qty),
        method: returnModal.method,
        condition_note: returnModal.condition,
        reason: reasonFull || 'Customer Return',
        restock: Boolean(returnModal.restock),
        direct: direct && isManager,
        reference: returnModal.reference.trim(),
      });

      setReturnModal(null);
      setSuccessNotice(
        direct
          ? `Return completed! Refund of ${money(res.amount)} recorded.`
          : 'Return request submitted for manager review.'
      );
      state.refresh();
      // Reload current invoice to reflect updated refunded quantities
      selectInvoiceById(invoice.id);
    } catch (err) {
      setActionError(err.message || 'Failed to process return');
    } finally {
      setModalBusy(false);
    }
  };

  // Submit Exchange Request or Direct Exchange
  const handleExchangeSubmit = async (e, direct = false) => {
    e.preventDefault();
    if (!exchangeModal || !invoice) return;
    if (!exchangeModal.replacementProductId) {
      setActionError('Please select a replacement product.');
      return;
    }
    setModalBusy(true);
    setActionError('');
    try {
      const reasonFull = [exchangeModal.reasonPreset, exchangeModal.reasonNote.trim()]
        .filter(Boolean)
        .join(' — ');

      const res = await ctx.mutate('return.request', {
        branch: invoice.branch_id || branch,
        item_id: exchangeModal.item.id,
        qty: Number(exchangeModal.qty),
        method: 'Cash',
        condition_note: exchangeModal.condition,
        reason: reasonFull || 'Customer Exchange',
        replacement_product_id: Number(exchangeModal.replacementProductId),
        replacement_qty: Number(exchangeModal.replacementQty || 1),
        replacement_unit_id: exchangeModal.replacementUnitId
          ? Number(exchangeModal.replacementUnitId)
          : null,
        direct: direct && isManager,
      });

      setExchangeModal(null);
      setSuccessNotice(
        direct
          ? `Exchange completed! Replacement invoice created.`
          : 'Exchange request submitted for manager review.'
      );
      state.refresh();
      if (res.replacement_invoice) {
        setViewReceipt(res.replacement_invoice);
      }
      selectInvoiceById(invoice.id);
    } catch (err) {
      setActionError(err.message || 'Failed to process exchange');
    } finally {
      setModalBusy(false);
    }
  };

  // Resolve pending return (Approve or Reject)
  const handleResolveSubmit = async e => {
    e.preventDefault();
    if (!resolveModal) return;
    setModalBusy(true);
    setActionError('');
    try {
      const res = await ctx.mutate('return.resolve', {
        branch: resolveModal.row.branch_id || branch,
        id: resolveModal.row.id,
        decision: resolveModal.decision,
        reference: resolveModal.reference?.trim() || null,
      });

      setResolveModal(null);
      setSuccessNotice(
        resolveModal.decision === 'Completed'
          ? 'Request approved and processed.'
          : 'Request rejected.'
      );
      state.refresh();
      if (res.replacement_invoice) {
        setViewReceipt(res.replacement_invoice);
      }
    } catch (err) {
      setActionError(err.message || 'Failed to resolve request');
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <DataView state={state}>
      {({ returns = [], settings = {}, sales = [] }) => {
        // KPI Metrics
        const totalReturnsCount = returns.length;
        const pendingCount = returns.filter(r => r.status === 'Pending').length;
        const completedRefunds = returns.filter(r => r.status === 'Completed' && !r.replacement);
        const completedExchanges = returns.filter(r => r.status === 'Completed' && Boolean(r.replacement));
        const totalRefundedSum = completedRefunds.reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const rejectedCount = returns.filter(r => r.status === 'Rejected').length;

        // Filtered History
        const q = historySearch.trim().toLowerCase();
        const filteredHistory = returns.filter(r => {
          if (historyFilter === 'Pending' && r.status !== 'Pending') return false;
          if (historyFilter === 'Completed' && r.status !== 'Completed') return false;
          if (historyFilter === 'Refunds' && (r.status !== 'Completed' || r.replacement)) return false;
          if (historyFilter === 'Exchanges' && (r.status !== 'Completed' || !r.replacement)) return false;
          if (historyFilter === 'Rejected' && r.status !== 'Rejected') return false;

          if (q) {
            const retRef = ref('RET', r.id).toLowerCase();
            const invRef = ref('INV', r.sale_id).toLowerCase();
            const repRef = r.replacement_sale_id ? ref('INV', r.replacement_sale_id).toLowerCase() : '';
            const prod = String(r.product || '').toLowerCase();
            const cust = String(r.customer || '').toLowerCase();
            const phone = String(r.customer_phone || '').toLowerCase();
            const rep = String(r.replacement || '').toLowerCase();
            const idStr = String(r.id);
            const matched =
              retRef.includes(q) ||
              invRef.includes(q) ||
              repRef.includes(q) ||
              prod.includes(q) ||
              cust.includes(q) ||
              phone.includes(q) ||
              rep.includes(q) ||
              idStr.includes(q);
            if (!matched) return false;
          }
          return true;
        });

        // Recent sales for quick picker strip
        const recentSales = Array.isArray(sales) ? sales.slice(0, 10) : [];

        return (
          <div className="returns-viewport">
            <Heading
              title="Returns & Exchanges"
              description="Look up customer sales, issue instant item refunds, perform product exchanges, and review return vouchers."
            >
              <Button
                icon={RefreshCw}
                variant="soft"
                disabled={state.pending}
                onClick={() => state.refresh()}
              >
                Refresh
              </Button>
            </Heading>

            {successNotice && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  {successNotice}
                </span>
                <button
                  type="button"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#065f46' }}
                  onClick={() => setSuccessNotice('')}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* KPI Metrics Strip */}
            <section className="returns-kpis" aria-label="Returns Overview Metrics">
              <div className="returns-kpi-card">
                <span className="returns-kpi-label">
                  <ArrowLeftRight size={13} />
                  Total Returns
                </span>
                <strong className="returns-kpi-val">{totalReturnsCount}</strong>
                <span className="returns-kpi-sub">{completedRefunds.length} refunds · {completedExchanges.length} exchanges</span>
              </div>
              <div className="returns-kpi-card pending">
                <span className="returns-kpi-label">
                  <Clock3 size={13} />
                  Pending Review
                </span>
                <strong className="returns-kpi-val" style={{ color: '#b45309' }}>
                  {pendingCount}
                </strong>
                <span className="returns-kpi-sub">
                  {pendingCount > 0 ? 'Awaiting manager approval' : 'All requests resolved'}
                </span>
              </div>
              <div className="returns-kpi-card refund">
                <span className="returns-kpi-label">
                  <Undo2 size={13} />
                  Processed Refunds
                </span>
                <strong className="returns-kpi-val" style={{ color: '#6d28d9' }}>
                  {money(totalRefundedSum)}
                </strong>
                <span className="returns-kpi-sub">{completedRefunds.length} cash / wallet returns</span>
              </div>
              <div className="returns-kpi-card exchange">
                <span className="returns-kpi-label">
                  <Package size={13} />
                  Completed Exchanges
                </span>
                <strong className="returns-kpi-val" style={{ color: '#1e40af' }}>
                  {completedExchanges.length}
                </strong>
                <span className="returns-kpi-sub">Replacement items handed over</span>
              </div>
            </section>

            {/* Navigation Tabs */}
            <div className="returns-nav-bar">
              <div className="returns-tabs">
                <button
                  type="button"
                  className={`returns-tab-btn ${tab === 'lookup' ? 'active' : ''}`}
                  onClick={() => setTab('lookup')}
                >
                  <Search size={14} />
                  <span>New Return / Exchange</span>
                </button>
                <button
                  type="button"
                  className={`returns-tab-btn ${tab === 'history' ? 'active' : ''}`}
                  onClick={() => setTab('history')}
                >
                  <ArrowLeftRight size={14} />
                  <span>Return History &amp; Directory ({returns.length})</span>
                  {pendingCount > 0 && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`returns-tab-btn ${tab === 'browse' ? 'active' : ''}`}
                  onClick={() => setTab('browse')}
                >
                  <FileText size={14} />
                  <span>Browse Recent Sales ({sales.length})</span>
                </button>
              </div>
            </div>

            {/* TAB 1: LOOKUP & PROCESS RETURN / EXCHANGE */}
            {tab === 'lookup' && (
              <div style={{ display: 'grid', gap: '16px' }}>
                {/* Search Card */}
                <div className="returns-search-card">
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      findInvoice();
                    }}
                  >
                    <div className="returns-search-input-wrap">
                      <div className="returns-search-field">
                        <Search size={16} style={{ color: '#64748b' }} />
                        <input
                          type="text"
                          value={lookupQuery}
                          onChange={e => setLookupQuery(e.target.value)}
                          placeholder="Search Invoice # (e.g. INV-00042 or 42), Customer Phone, Name, or Device IMEI / Serial…"
                          autoFocus
                        />
                        {lookupQuery && (
                          <button
                            type="button"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                            onClick={() => {
                              setLookupQuery('');
                              setInvoice(null);
                              setMatchingSales([]);
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        icon={Search}
                        disabled={searching || !lookupQuery.trim()}
                      >
                        {searching ? 'Searching…' : 'Find Sale'}
                      </Button>
                    </div>
                  </form>

                  {/* Quick recent invoices strip */}
                  {recentSales.length > 0 && (
                    <div className="returns-quick-chips-strip">
                      <span className="returns-chip-label">Recent Sales:</span>
                      {recentSales.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          className="returns-recent-chip"
                          onClick={() => selectInvoiceById(s.id)}
                          title={`Click to load sale #${s.id}`}
                        >
                          <strong>{ref('INV', s.id)}</strong>
                          <span>{s.customer || 'Walk-in'}</span>
                          <span style={{ color: '#047857' }}>{money(s.total)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchError && <Alert>{searchError}</Alert>}

                  {/* Multiple Matching Sales Disambiguation */}
                  {matchingSales.length > 0 && (
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      <strong style={{ fontSize: '13px', color: '#1e40af' }}>
                        Multiple sales matched "{lookupQuery}". Select the invoice to process:
                      </strong>
                      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                        {matchingSales.map(m => (
                          <div
                            key={m.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                            }}
                          >
                            <div>
                              <strong style={{ color: '#0f172a' }}>{ref('INV', m.id)}</strong>
                              <span style={{ marginLeft: '10px', color: '#475569' }}>
                                {m.customer} ({m.customer_phone || 'No phone'})
                              </span>
                              <small style={{ display: 'block', color: '#64748b' }}>
                                {m.created_at?.slice(0, 16)} · {m.items || `${m.line_count || 1} items`}
                              </small>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <strong style={{ color: '#047857' }}>{money(m.total)}</strong>
                              <Button
                                size="small"
                                variant="primary"
                                onClick={() => selectInvoiceById(m.id)}
                              >
                                Select Invoice →
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected Invoice Details Card */}
                {invoice && (
                  <div className="returns-invoice-card">
                    <div className="returns-inv-top">
                      <div className="returns-inv-title">
                        <FileText size={20} style={{ color: '#0f766e' }} />
                        <div>
                          <strong style={{ fontSize: '16px', color: '#0f172a' }}>
                            {ref('INV', invoice.id)}
                          </strong>
                          <span style={{ marginLeft: '10px', fontSize: '12px', color: '#64748b' }}>
                            {invoice.created_at ? String(invoice.created_at).slice(0, 16).replace('T', ' ') : '—'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          size="small"
                          variant="soft"
                          icon={Printer}
                          onClick={() => setViewReceipt(invoice)}
                        >
                          View Original Receipt
                        </Button>
                        <Button
                          size="small"
                          variant="soft"
                          onClick={() => setInvoice(null)}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <dl className="returns-inv-meta-grid">
                      <div>
                        <dt>Customer</dt>
                        <dd>
                          {invoice.customer || 'Walk-in'}
                          {invoice.customer_phone && (
                            <small style={{ display: 'block', color: '#64748b' }}>
                              {invoice.customer_phone}
                            </small>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Branch &amp; Cashier</dt>
                        <dd>
                          {invoice.branch || 'Main Branch'}
                          <small style={{ display: 'block', color: '#64748b' }}>
                            Sold by {invoice.cashier || 'Staff'}
                          </small>
                        </dd>
                      </div>
                      <div>
                        <dt>Original Tender</dt>
                        <dd>
                          {invoice.payment_methods ||
                            invoice.payments?.map(p => p.method).join(', ') ||
                            'Cash'}
                        </dd>
                      </div>
                      <div>
                        <dt>Sale Total / Refunded</dt>
                        <dd>
                          {money(invoice.total)}
                          {Number(invoice.refunded || 0) > 0 && (
                            <small style={{ display: 'block', color: '#dc2626' }}>
                              Refunded: {money(invoice.refunded)}
                            </small>
                          )}
                        </dd>
                      </div>
                    </dl>

                    {Boolean(invoice.credit) && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <AlertCircle size={15} />
                        <span>
                          Notice: This invoice has an outstanding credit balance of{' '}
                          <strong>{money(invoice.credit)}</strong>. Settle outstanding customer credit before cash payout.
                        </span>
                      </div>
                    )}

                    {/* Sold Items Table */}
                    <div style={{ marginTop: '6px' }}>
                      <strong style={{ fontSize: '13px', color: '#334155', display: 'block', marginBottom: '8px' }}>
                        Purchased Items on this Sale (Select Item to Return or Exchange):
                      </strong>
                      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table className="returns-items-table">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Serial / IMEI</th>
                              <th style={{ textAlign: 'center' }}>Sold</th>
                              <th style={{ textAlign: 'center' }}>Already Refunded</th>
                              <th style={{ textAlign: 'center' }}>Available</th>
                              <th>Unit Price</th>
                              <th>Line Total</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoice.items?.map(item => {
                              const availableQty = item.qty - (item.refunded_qty || 0);
                              return (
                                <tr key={item.id}>
                                  <td>
                                    <strong>{item.name}</strong>
                                    {item.category && (
                                      <small style={{ display: 'block', color: '#64748b' }}>
                                        {item.category}
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    {item.imei || item.code ? (
                                      <span className="returns-serial-tag">
                                        {item.imei || item.code}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8' }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.qty}</td>
                                  <td style={{ textAlign: 'center', color: '#dc2626' }}>
                                    {item.refunded_qty || 0}
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 700, color: availableQty > 0 ? '#047857' : '#94a3b8' }}>
                                    {availableQty}
                                  </td>
                                  <td>{money(item.price)}</td>
                                  <td style={{ fontWeight: 700 }}>{money(item.total)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    {availableQty > 0 ? (
                                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <Button
                                          size="small"
                                          variant="soft"
                                          icon={Undo2}
                                          disabled={Boolean(invoice.credit)}
                                          onClick={() => openReturnModal(item)}
                                          title="Return this item for a cash or wallet refund"
                                        >
                                          Return / Refund
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="primary"
                                          icon={ArrowLeftRight}
                                          disabled={Boolean(invoice.credit)}
                                          onClick={() => openExchangeModal(item)}
                                          title="Exchange this item for a replacement product"
                                        >
                                          Exchange
                                        </Button>
                                      </div>
                                    ) : (
                                      <Badge tone="gray">Fully Returned</Badge>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: RETURN & EXCHANGE HISTORY & DIRECTORY */}
            {tab === 'history' && (
              <div style={{ display: 'grid', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div className="returns-search-field" style={{ minWidth: '280px', flex: 1 }}>
                    <Search size={15} style={{ color: '#94a3b8' }} />
                    <input
                      type="search"
                      placeholder="Search returns by ref #, invoice #, customer name, phone, item name, replacement…"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                    />
                    {historySearch && (
                      <button
                        type="button"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                        onClick={() => setHistorySearch('')}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <FilterTabs
                    choices={['All', 'Pending', 'Refunds', 'Exchanges', 'Completed', 'Rejected']}
                    value={historyFilter}
                    onChange={setHistoryFilter}
                  />
                </div>

                <div className="returns-history-wrap">
                  <table className="returns-history-table">
                    <thead>
                      <tr>
                        <th>Return # &amp; Date</th>
                        <th>Original Invoice</th>
                        <th>Customer</th>
                        <th>Returned Item</th>
                        <th>Type</th>
                        <th>Tender</th>
                        <th>Amount / Diff</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.length > 0 ? (
                        filteredHistory.map(row => {
                          const isExchange = Boolean(row.replacement);
                          const isPending = row.status === 'Pending';
                          const isCompleted = row.status === 'Completed';
                          const isRejected = row.status === 'Rejected';

                          return (
                            <tr key={row.id}>
                              <td>
                                <strong style={{ color: '#0f766e', fontFamily: 'monospace' }}>
                                  {ref('RET', row.id)}
                                </strong>
                                <small style={{ display: 'block', color: '#64748b', fontSize: '11px' }}>
                                  {row.created_at ? String(row.created_at).slice(0, 16).replace('T', ' ') : '—'}
                                </small>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => selectInvoiceById(row.sale_id)}
                                  title="View invoice details"
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#2563eb',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    padding: 0,
                                  }}
                                >
                                  {ref('INV', row.sale_id)}
                                </button>
                              </td>
                              <td>
                                <strong>{row.customer}</strong>
                                {row.customer_phone && (
                                  <small style={{ display: 'block', color: '#64748b' }}>
                                    {row.customer_phone}
                                  </small>
                                )}
                              </td>
                              <td>
                                <strong>{row.product}</strong>
                                <small style={{ display: 'block', color: '#64748b' }}>
                                  Qty: {row.qty}
                                  {row.item_unit_code ? ` · Serial: ${row.item_unit_code}` : ''}
                                  {row.condition_note ? ` (${row.condition_note})` : ''}
                                </small>
                              </td>
                              <td>
                                {isExchange ? (
                                  <div>
                                    <Badge tone="blue">Exchange</Badge>
                                    <small style={{ display: 'block', color: '#1e40af', marginTop: '2px', fontWeight: 600 }}>
                                      ↳ {row.replacement}
                                      {row.replacement_unit_code ? ` (${row.replacement_unit_code})` : ''}
                                    </small>
                                    {row.replacement_sale_id && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const inv = await ctx.get('invoice', { id: row.replacement_sale_id });
                                          setViewReceipt(inv);
                                        }}
                                        style={{
                                          border: 'none',
                                          background: 'transparent',
                                          color: '#0f766e',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          textDecoration: 'underline',
                                          padding: 0,
                                          display: 'block',
                                        }}
                                      >
                                        Receipt {ref('INV', row.replacement_sale_id)} →
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <Badge tone="violet">Refund</Badge>
                                )}
                              </td>
                              <td>
                                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontWeight: 600 }}>
                                  {row.method || 'Cash'}
                                </span>
                              </td>
                              <td>
                                <strong style={{ color: '#0f172a' }}>{money(row.amount)}</strong>
                                {isExchange && Number(row.quoted_total || 0) > 0 && (
                                  <small style={{ display: 'block', color: '#64748b' }}>
                                    New Item: {money(row.quoted_total)}
                                  </small>
                                )}
                              </td>
                              <td>
                                {isPending && <Badge tone="amber">Pending</Badge>}
                                {isCompleted && <Badge tone="green">Completed</Badge>}
                                {isRejected && <Badge tone="red">Rejected</Badge>}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  {isPending && isManager && (
                                    <>
                                      <Button
                                        size="small"
                                        variant="primary"
                                        onClick={() => setResolveModal({ row, decision: 'Completed', reference: '' })}
                                      >
                                        Approve
                                      </Button>
                                      <Button
                                        size="small"
                                        variant="outline-red"
                                        onClick={() => setResolveModal({ row, decision: 'Rejected' })}
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    size="small"
                                    variant="soft"
                                    icon={Printer}
                                    onClick={() => setReturnSlip(row)}
                                    title="View & print official return slip"
                                  >
                                    Slip
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '36px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                              <ArrowLeftRight size={32} style={{ color: '#cbd5e1' }} />
                              <strong style={{ color: '#475569' }}>No returns found</strong>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {historySearch || historyFilter !== 'All'
                                  ? 'Try adjusting your search query or filter tab.'
                                  : 'No return or exchange records currently logged.'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: BROWSE RECENT SALES */}
            {tab === 'browse' && (
              <div style={{ display: 'grid', gap: '14px' }}>
                <Panel title="Recent Branch Sales (Pick an invoice to return or exchange)">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="returns-history-table">
                      <thead>
                        <tr>
                          <th>Invoice # &amp; Date</th>
                          <th>Customer</th>
                          <th>Items Summary</th>
                          <th>Total Amount</th>
                          <th>Cashier</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map(s => (
                          <tr key={s.id}>
                            <td>
                              <strong style={{ color: '#0f172a' }}>{ref('INV', s.id)}</strong>
                              <small style={{ display: 'block', color: '#64748b' }}>
                                {s.created_at?.slice(0, 16)}
                              </small>
                            </td>
                            <td>
                              <strong>{s.customer || 'Walk-in'}</strong>
                              {s.customer_phone && (
                                <small style={{ display: 'block', color: '#64748b' }}>
                                  {s.customer_phone}
                                </small>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: '12px', color: '#334155' }}>
                                {s.items || `${s.line_count || 1} item(s)`}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: '#047857' }}>{money(s.total)}</strong>
                              {Number(s.refunded || 0) > 0 && (
                                <small style={{ display: 'block', color: '#dc2626' }}>
                                  Refunded: {money(s.refunded)}
                                </small>
                              )}
                            </td>
                            <td>{s.cashier || 'Staff'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <Button
                                size="small"
                                variant="primary"
                                icon={ArrowRight}
                                onClick={() => selectInvoiceById(s.id)}
                              >
                                Select for Return →
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            )}

            {/* MODAL 1: RETURN / REFUND DIALOG */}
            {returnModal && (
              <Modal
                title={`Return Item — ${ref('INV', invoice.id)}`}
                description={`Process product return and customer refund for ${returnModal.item.name}`}
                busy={modalBusy}
                onClose={() => setReturnModal(null)}
              >
                <form onSubmit={e => handleReturnSubmit(e, false)}>
                  <div className="returns-modal-content">
                    {actionError && <Alert>{actionError}</Alert>}

                    {/* Item Strip */}
                    <div className="returns-modal-item-strip">
                      <div>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          {returnModal.item.name}
                        </strong>
                        <small style={{ display: 'block', color: '#64748b' }}>
                          Unit Price: {money(returnModal.item.price)} · Sold Qty: {returnModal.item.qty} · Available: {returnModal.availableQty}
                        </small>
                      </div>
                      {returnModal.item.imei || returnModal.item.code ? (
                        <span className="returns-serial-tag">
                          {returnModal.item.imei || returnModal.item.code}
                        </span>
                      ) : null}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                      <Field label={`Return Quantity (Max: ${returnModal.availableQty})`}>
                        <input
                          type="number"
                          min="1"
                          max={returnModal.availableQty}
                          required
                          value={returnModal.qty}
                          onChange={e =>
                            setReturnModal({ ...returnModal, qty: Math.min(returnModal.availableQty, Math.max(1, Number(e.target.value))) })
                          }
                        />
                      </Field>
                      <Field label="Item Condition">
                        <Select
                          value={returnModal.condition}
                          onChange={e =>
                            setReturnModal({
                              ...returnModal,
                              condition: e.target.value,
                              restock: e.target.value === 'Unopened',
                            })
                          }
                          options={[
                            ['Unopened', 'Unopened / Brand New (Sellable)'],
                            ['Opened / Like New', 'Opened / Like New'],
                            ['Defective / Faulty', 'Defective / Hardware Issue'],
                            ['Damaged', 'Damaged / Customer Fault'],
                          ]}
                        />
                      </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                      <Field label="Reason Preset">
                        <Select
                          value={returnModal.reasonPreset}
                          onChange={e => setReturnModal({ ...returnModal, reasonPreset: e.target.value })}
                          options={[
                            ['Customer Changed Mind', 'Customer Changed Mind'],
                            ['Defective / Faulty Item', 'Defective / Hardware Issue'],
                            ['Wrong Item Purchased', 'Wrong Item Purchased'],
                            ['Specification Mismatch', 'Specification Mismatch'],
                            ['Overcharged / Billing Error', 'Overcharged / Billing Error'],
                            ['Warranty Claim', 'Warranty Claim'],
                            ['Other', 'Other / Custom Reason'],
                          ]}
                        />
                      </Field>
                      <Field label="Refund Tender Method">
                        <Select
                          value={returnModal.method}
                          onChange={e => setReturnModal({ ...returnModal, method: e.target.value })}
                          options={[
                            ['Cash', 'Cash (Payout from register drawer)'],
                            ['Wallet', `Wallet Store Credit · Bal: ${money(invoice.customer_wallet || 0)}`],
                            ['Card', 'Card Refund'],
                            ['Bank Transfer', 'Bank Transfer'],
                            ['Koko', 'Koko Refund'],
                          ]}
                        />
                      </Field>
                    </div>

                    <Field label="Reason Notes (Optional)">
                      <input
                        type="text"
                        placeholder="Additional details regarding why the customer is returning this item…"
                        value={returnModal.reasonNote}
                        onChange={e => setReturnModal({ ...returnModal, reasonNote: e.target.value })}
                      />
                    </Field>

                    {returnModal.method !== 'Cash' && returnModal.method !== 'Wallet' && (
                      <Field label="Confirmed Refund Reference / Txn #">
                        <input
                          type="text"
                          placeholder="e.g. Card slip auth #, bank transfer ref…"
                          value={returnModal.reference}
                          onChange={e => setReturnModal({ ...returnModal, reference: e.target.value })}
                        />
                      </Field>
                    )}

                    {!returnModal.item.unit_id && returnModal.item.category !== 'Services' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={returnModal.restock}
                          onChange={e => setReturnModal({ ...returnModal, restock: e.target.checked })}
                        />
                        <span>Item is undamaged and can be restocked back into active inventory</span>
                      </label>
                    )}

                    {/* Calculated Refund Box */}
                    {(() => {
                      const refundPortion = calculateRefundPortion(
                        returnModal.item.total,
                        returnModal.item.qty,
                        returnModal.item.refunded_qty || 0,
                        returnModal.qty
                      );
                      return (
                        <div className="returns-calc-card refund">
                          <div className="returns-calc-row">
                            <span>Item Line Value ({returnModal.qty} of {returnModal.item.qty}):</span>
                            <span>{money(refundPortion)}</span>
                          </div>
                          <div className="returns-calc-row total">
                            <span>Total Refund to Customer:</span>
                            <span style={{ color: '#047857', fontSize: '16px' }}>{money(refundPortion)}</span>
                          </div>
                          <small style={{ color: '#065f46' }}>
                            {returnModal.method === 'Wallet'
                              ? `Will credit ${money(refundPortion)} directly to customer's store wallet balance.`
                              : returnModal.method === 'Cash'
                              ? `Will record a cash payout movement of ${money(refundPortion)} in cashier drawer.`
                              : `Will record external refund confirmation via ${returnModal.method}.`}
                          </small>
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                      <Button type="button" disabled={modalBusy} onClick={() => setReturnModal(null)}>
                        Cancel
                      </Button>
                      {isManager && (
                        <Button
                          type="button"
                          variant="primary"
                          disabled={modalBusy}
                          onClick={e => handleReturnSubmit(e, true)}
                        >
                          {modalBusy ? 'Processing…' : '✓ Process & Refund Now'}
                        </Button>
                      )}
                      <Button
                        type="submit"
                        variant={isManager ? 'soft' : 'primary'}
                        disabled={modalBusy}
                      >
                        Submit for Approval
                      </Button>
                    </div>
                  </div>
                </form>
              </Modal>
            )}

            {/* MODAL 2: EXCHANGE ITEM DIALOG */}
            {exchangeModal && (
              <Modal
                title={`Exchange Item — ${ref('INV', invoice.id)}`}
                description={`Exchange ${exchangeModal.item.name} for a replacement product`}
                wide
                busy={modalBusy}
                onClose={() => setExchangeModal(null)}
              >
                <form onSubmit={e => handleExchangeSubmit(e, false)}>
                  <div className="returns-modal-content">
                    {actionError && <Alert>{actionError}</Alert>}

                    {/* Original Item Strip */}
                    <div className="returns-modal-item-strip">
                      <div>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          Returning: {exchangeModal.item.name}
                        </strong>
                        <small style={{ display: 'block', color: '#64748b' }}>
                          Original Price: {money(exchangeModal.item.price)} · Available Qty: {exchangeModal.availableQty}
                        </small>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Field label="Return Qty" style={{ margin: 0 }}>
                          <input
                            type="number"
                            min="1"
                            max={exchangeModal.availableQty}
                            value={exchangeModal.qty}
                            style={{ width: '80px' }}
                            onChange={e =>
                              setExchangeModal({
                                ...exchangeModal,
                                qty: Math.min(exchangeModal.availableQty, Math.max(1, Number(e.target.value))),
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>

                    {/* Replacement Product Selector */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                      <Field label="Select Replacement Product from Branch Stock">
                        <Select
                          value={exchangeModal.replacementProductId}
                          required
                          blank="Choose replacement item in stock…"
                          options={catalog.products
                            .filter(p => Number(p.qty || 0) > 0 && p.category !== 'Services')
                            .map(p => [
                              p.id,
                              `${p.name} · ${money(p.price)} (${p.qty} in stock)`,
                            ])}
                          onChange={e =>
                            setExchangeModal({
                              ...exchangeModal,
                              replacementProductId: e.target.value,
                              replacementUnitId: '',
                              replacementQty: 1,
                            })
                          }
                        />
                      </Field>

                      {(() => {
                        const repProd = catalog.products.find(
                          p => String(p.id) === String(exchangeModal.replacementProductId)
                        );
                        if (!repProd) {
                          return (
                            <Field label="Quantity">
                              <input type="number" disabled value="1" />
                            </Field>
                          );
                        }

                        if (repProd.serialized) {
                          const availableUnits = catalog.units.filter(
                            u => String(u.product_id) === String(repProd.id) && u.state === 'Available'
                          );
                          return (
                            <Field label="Replacement Device Serial / IMEI">
                              <Select
                                value={exchangeModal.replacementUnitId}
                                required
                                blank="Select serial unit…"
                                options={availableUnits.map(u => [u.id, u.code || u.imei])}
                                onChange={e =>
                                  setExchangeModal({ ...exchangeModal, replacementUnitId: e.target.value })
                                }
                              />
                            </Field>
                          );
                        }

                        return (
                          <Field label={`Replacement Quantity (${repProd.qty} available)`}>
                            <input
                              type="number"
                              min="1"
                              max={repProd.qty}
                              required
                              value={exchangeModal.replacementQty}
                              onChange={e =>
                                setExchangeModal({
                                  ...exchangeModal,
                                  replacementQty: Math.min(repProd.qty, Math.max(1, Number(e.target.value))),
                                })
                              }
                            />
                          </Field>
                        );
                      })()}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                      <Field label="Return Condition">
                        <Select
                          value={exchangeModal.condition}
                          onChange={e => setExchangeModal({ ...exchangeModal, condition: e.target.value })}
                          options={[
                            ['Unopened', 'Unopened / Brand New'],
                            ['Opened / Like New', 'Opened / Like New'],
                            ['Defective / Faulty', 'Defective / Hardware Issue'],
                            ['Damaged', 'Damaged / Customer Fault'],
                          ]}
                        />
                      </Field>
                      <Field label="Exchange Reason">
                        <Select
                          value={exchangeModal.reasonPreset}
                          onChange={e => setExchangeModal({ ...exchangeModal, reasonPreset: e.target.value })}
                          options={[
                            ['Size / Spec Mismatch', 'Size / Spec Mismatch'],
                            ['Upgrade to Higher Model', 'Upgrade to Higher Model'],
                            ['Defective / Hardware Issue', 'Defective / Hardware Issue'],
                            ['Customer Changed Mind', 'Customer Changed Mind'],
                            ['Other', 'Other Reason'],
                          ]}
                        />
                      </Field>
                    </div>

                    {/* Financial Difference Calculator */}
                    {(() => {
                      const returnCredit = calculateRefundPortion(
                        exchangeModal.item.total,
                        exchangeModal.item.qty,
                        exchangeModal.item.refunded_qty || 0,
                        exchangeModal.qty
                      );

                      const repProd = catalog.products.find(
                        p => String(p.id) === String(exchangeModal.replacementProductId)
                      );

                      let replacementTotal = 0;
                      if (repProd) {
                        const unitsCount = repProd.serialized ? 1 : Number(exchangeModal.replacementQty || 1);
                        const sub = unitsCount * Number(repProd.price || 0);
                        const tax = Math.round((sub * Number(settings?.tax_bps || 0)) / 10000);
                        replacementTotal = sub + tax;
                      }

                      const diff = replacementTotal - returnCredit;

                      return (
                        <div
                          className={`returns-calc-card ${
                            diff > 0
                              ? 'exchange-pay'
                              : diff < 0
                              ? 'exchange-refund'
                              : 'refund'
                          }`}
                        >
                          <div className="returns-calc-row">
                            <span>Credit from Returned Item ({exchangeModal.qty}x {exchangeModal.item.name}):</span>
                            <span style={{ color: '#047857', fontWeight: 600 }}>{money(returnCredit)}</span>
                          </div>
                          <div className="returns-calc-row">
                            <span>Replacement Product Total:</span>
                            <span style={{ fontWeight: 600 }}>{money(replacementTotal)}</span>
                          </div>
                          <div className="returns-calc-row total">
                            <span>Net Settlement Difference:</span>
                            <span
                              style={{
                                color: diff > 0 ? '#b45309' : diff < 0 ? '#047857' : '#0f172a',
                                fontSize: '16px',
                              }}
                            >
                              {diff > 0
                                ? `+ ${money(diff)} (Customer Pays)`
                                : diff < 0
                                ? `- ${money(Math.abs(diff))} (Store Refunds)`
                                : 'Even Swap (LKR 0.00)'}
                            </span>
                          </div>

                          {diff > 0 && (
                            <div style={{ marginTop: '6px' }}>
                              <Field label="Customer Difference Payment Method">
                                <Select
                                  value={exchangeModal.diffMethod}
                                  onChange={e => setExchangeModal({ ...exchangeModal, diffMethod: e.target.value })}
                                  options={[
                                    ['Cash', 'Cash'],
                                    ['Card', 'Card'],
                                    ['Bank Transfer', 'Bank Transfer'],
                                    ['Koko', 'Koko'],
                                    ['Wallet', `Customer Wallet · Bal: ${money(invoice.customer_wallet || 0)}`],
                                  ]}
                                />
                              </Field>
                            </div>
                          )}

                          {diff < 0 && (
                            <div style={{ marginTop: '6px' }}>
                              <Field label="Store Difference Refund Method">
                                <Select
                                  value={exchangeModal.diffRefundMethod}
                                  onChange={e =>
                                    setExchangeModal({ ...exchangeModal, diffRefundMethod: e.target.value })
                                  }
                                  options={[
                                    ['Cash', 'Cash Payout'],
                                    ['Wallet', `Credit Customer Wallet · Bal: ${money(invoice.customer_wallet || 0)}`],
                                  ]}
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                      <Button type="button" disabled={modalBusy} onClick={() => setExchangeModal(null)}>
                        Cancel
                      </Button>
                      {isManager && (
                        <Button
                          type="button"
                          variant="primary"
                          disabled={modalBusy || !exchangeModal.replacementProductId}
                          onClick={e => handleExchangeSubmit(e, true)}
                        >
                          {modalBusy ? 'Processing…' : '✓ Process & Complete Exchange Now'}
                        </Button>
                      )}
                      <Button
                        type="submit"
                        variant={isManager ? 'soft' : 'primary'}
                        disabled={modalBusy || !exchangeModal.replacementProductId}
                      >
                        Submit Exchange Request
                      </Button>
                    </div>
                  </div>
                </form>
              </Modal>
            )}

            {/* MODAL 3: APPROVE / REJECT RESOLUTION MODAL */}
            {resolveModal && (
              <Modal
                title={
                  resolveModal.decision === 'Completed'
                    ? resolveModal.row.replacement
                      ? 'Approve & Process Exchange'
                      : 'Approve & Process Refund'
                    : 'Reject Return Request'
                }
                description={`${ref('RET', resolveModal.row.id)} · ${resolveModal.row.product}`}
                busy={modalBusy}
                onClose={() => setResolveModal(null)}
              >
                <form onSubmit={handleResolveSubmit}>
                  <div className="returns-modal-content">
                    {actionError && <Alert>{actionError}</Alert>}

                    <dl className="returns-inv-meta-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                      <div>
                        <dt>Customer</dt>
                        <dd>{resolveModal.row.customer}</dd>
                      </div>
                      <div>
                        <dt>Refund / Exchange Type</dt>
                        <dd>
                          {resolveModal.row.replacement ? `Exchange for ${resolveModal.row.replacement}` : 'Direct Refund'}
                        </dd>
                      </div>
                      <div>
                        <dt>Method</dt>
                        <dd>{resolveModal.row.method || 'Cash'}</dd>
                      </div>
                      <div>
                        <dt>Amount</dt>
                        <dd style={{ color: '#047857' }}>{money(resolveModal.row.amount)}</dd>
                      </div>
                    </dl>

                    {resolveModal.decision === 'Completed' && (
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                        <p style={{ margin: 0, fontSize: '13px', color: '#065f46', lineHeight: 1.5 }}>
                          {resolveModal.row.replacement
                            ? `Confirming this exchange will deduct stock for "${resolveModal.row.replacement}", create a replacement sale invoice, and adjust drawer cash movements for the difference.`
                            : resolveModal.row.method === 'Cash'
                            ? `Confirming will deduct ${money(resolveModal.row.amount)} as a cash refund movement in the open register drawer.`
                            : resolveModal.row.method === 'Wallet'
                            ? `Confirming will credit ${money(resolveModal.row.amount)} directly to the customer's store wallet.`
                            : `Confirming will mark this refund completed via ${resolveModal.row.method}.`}
                        </p>
                      </div>
                    )}

                    {resolveModal.decision === 'Rejected' && (
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                        <p style={{ margin: 0, fontSize: '13px', color: '#991b1b', lineHeight: 1.5 }}>
                          Are you sure you want to reject this request? No refund or exchange invoice will be issued.
                        </p>
                      </div>
                    )}

                    {resolveModal.decision === 'Completed' && resolveModal.row.method !== 'Cash' && resolveModal.row.method !== 'Wallet' && (
                      <Field label="Confirmed Refund Reference / Txn #">
                        <input
                          type="text"
                          required
                          placeholder="Bank txn # or card slip reference"
                          value={resolveModal.reference || ''}
                          onChange={e => setResolveModal({ ...resolveModal, reference: e.target.value })}
                        />
                      </Field>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                      <Button type="button" disabled={modalBusy} onClick={() => setResolveModal(null)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant={resolveModal.decision === 'Completed' ? 'primary' : 'outline-red'}
                        disabled={modalBusy}
                      >
                        {modalBusy
                          ? 'Processing…'
                          : resolveModal.decision === 'Completed'
                          ? resolveModal.row.replacement
                            ? 'Process Exchange Now'
                            : 'Process Refund Now'
                          : 'Confirm Rejection'}
                      </Button>
                    </div>
                  </div>
                </form>
              </Modal>
            )}

            {/* MODAL 4: PRINTABLE RETURN SLIP / VOUCHER */}
            {returnSlip && (
              <Modal
                title={`Return Voucher — ${ref('RET', returnSlip.id)}`}
                wide
                onClose={() => setReturnSlip(null)}
              >
                <div className="returns-slip-body">
                  <div className="returns-slip-header">
                    <div>
                      <h2>ZEEDAT MOBILE &amp; COMPUTERS</h2>
                      <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#475569' }}>
                        Official Customer Return &amp; Exchange Slip
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '15px', color: '#0f766e', fontFamily: 'monospace' }}>
                        {ref('RET', returnSlip.id)}
                      </strong>
                      <small style={{ display: 'block', color: '#64748b' }}>
                        Date: {returnSlip.created_at?.slice(0, 16)}
                      </small>
                    </div>
                  </div>

                  <div className="returns-slip-meta">
                    <div>
                      <span>Original Invoice:</span> <strong>{ref('INV', returnSlip.sale_id)}</strong>
                    </div>
                    <div>
                      <span>Customer Name:</span> <strong>{returnSlip.customer}</strong>
                    </div>
                    <div>
                      <span>Customer Mobile:</span> <strong>{returnSlip.customer_phone || '—'}</strong>
                    </div>
                    <div>
                      <span>Status:</span> <strong>{returnSlip.status}</strong>
                    </div>
                  </div>

                  <table className="returns-slip-table">
                    <thead>
                      <tr>
                        <th>Item Returned</th>
                        <th>Serial / IMEI</th>
                        <th>Qty</th>
                        <th>Condition</th>
                        <th>Refund Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>{returnSlip.product}</strong></td>
                        <td>{returnSlip.item_unit_code || returnSlip.item_imei || '—'}</td>
                        <td>{returnSlip.qty}</td>
                        <td>{returnSlip.condition_note || 'Inspected'}</td>
                        <td style={{ fontWeight: 700 }}>{money(returnSlip.amount)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {returnSlip.replacement && (
                    <div style={{ padding: '8px 10px', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '12px' }}>
                      <strong>Exchange Issued:</strong> {returnSlip.replacement} ({returnSlip.replacement_unit_code || `Qty ${returnSlip.replacement_qty || 1}`})
                      {returnSlip.replacement_sale_id && (
                        <span> · Replacement Invoice: <strong>{ref('INV', returnSlip.replacement_sale_id)}</strong></span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Refund Method: <strong>{returnSlip.method || 'Cash'}</strong>
                      {returnSlip.reference ? ` (Ref: ${returnSlip.reference})` : ''}
                    </span>
                    <strong style={{ fontSize: '16px', color: '#0f172a' }}>
                      Total Refund / Credit: {money(returnSlip.amount)}
                    </strong>
                  </div>

                  <div className="returns-slip-signatures">
                    <div className="returns-slip-sig-box">
                      Store Officer / Cashier Signature
                    </div>
                    <div className="returns-slip-sig-box">
                      Customer Signature
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                    <Button variant="soft" onClick={() => setReturnSlip(null)}>
                      Close
                    </Button>
                    <Button
                      variant="primary"
                      icon={Printer}
                      onClick={() => window.print()}
                    >
                      Print Return Slip
                    </Button>
                  </div>
                </div>
              </Modal>
            )}

            {/* MODAL 5: INVOICE RECEIPT MODAL */}
            {viewReceipt && (
              <ReceiptModal
                invoice={viewReceipt}
                settings={settings}
                onClose={() => setViewReceipt(null)}
              />
            )}
          </div>
        );
      }}
    </DataView>
  );
}
