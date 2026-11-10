import { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUpDown,
  Check,
  ClipboardCheck,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge, Button, Modal } from '../../components/common';
import { categories, money, options } from '../../utils';

const QUICK_REASONS = [
  'Stock Count / Audit',
  'Damaged / Expired',
  'Opening Stock',
  'Lost / Shrinkage',
  'Found / Unrecorded',
  'Supplier Bonus',
  'Internal Use',
  'Correction',
];

function getBranchQty(product, branchId) {
  if (!product || !branchId) return 0;
  const hit = (product.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(branchId));
  return hit ? Number(hit.qty || 0) : 0;
}

export function StockAdjustModal({
  ctx,
  items = [],
  preselectedProduct = null,
  preselectedBranch = null,
  onClose,
  onSuccess,
}) {
  const branches = ctx.branches || [];
  const defaultBranchId =
    Number(preselectedBranch) ||
    Number(ctx.branch) ||
    Number(branches[0]?.id || 0);

  const adjustableItems = useMemo(
    () => items.filter(p => !p.serialized && p.category !== 'Services'),
    [items]
  );

  const [tab, setTab] = useState('single'); // 'single' | 'bulk'
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [reason, setReason] = useState('Stock Count / Audit');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Single item state
  const [singleSearch, setSingleSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(() =>
    preselectedProduct ? String(preselectedProduct.id) : String(adjustableItems[0]?.id || '')
  );
  const [singleMode, setSingleMode] = useState('in'); // 'in' | 'out' | 'set'
  const [singleQty, setSingleQty] = useState('1');

  // Bulk stocktake state
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkView, setBulkView] = useState('all'); // 'all' | 'low' | 'changed'
  const [bulkMode, setBulkMode] = useState('set'); // 'set' | 'in' | 'out'
  const [bulkEdits, setBulkEdits] = useState({}); // { [productId]: string }
  const [bulkPage, setBulkPage] = useState(1);
  const bulkPageSize = 25;

  const activeBranchName =
    branches.find(b => Number(b.id) === Number(branchId))?.name || 'Selected Branch';

  // Filtered choices for single product search
  const singleFilteredItems = useMemo(() => {
    const q = singleSearch.trim().toLowerCase();
    if (!q) return adjustableItems;
    return adjustableItems.filter(p =>
      `${p.name} ${p.sku} ${p.barcode || ''} ${p.brand || ''}`.toLowerCase().includes(q)
    );
  }, [adjustableItems, singleSearch]);

  const activeProduct = useMemo(
    () =>
      adjustableItems.find(p => String(p.id) === String(selectedProductId)) ||
      singleFilteredItems[0] ||
      null,
    [adjustableItems, singleFilteredItems, selectedProductId]
  );

  const currentSingleStock = activeProduct ? getBranchQty(activeProduct, branchId) : 0;

  // Keep singleQty reasonable when switching to/from 'set' mode
  const handleSingleModeChange = nextMode => {
    setSingleMode(nextMode);
    setErrorMsg('');
    if (nextMode === 'set') {
      setSingleQty(String(currentSingleStock));
    } else if (!singleQty || Number(singleQty) <= 0) {
      setSingleQty('1');
    }
  };

  // Barcode scan / Enter shortcut in single search box
  const handleSingleSearchKeyDown = e => {
    if (e.key !== 'Enter') return;
    const raw = singleSearch.trim().toLowerCase();
    if (!raw) return;
    const exact = adjustableItems.find(
      p =>
        String(p.barcode || '').toLowerCase() === raw ||
        String(p.sku || '').toLowerCase() === raw
    );
    const hit = exact || singleFilteredItems[0];
    if (hit) {
      e.preventDefault();
      setSelectedProductId(String(hit.id));
      if (singleMode === 'set') {
        setSingleQty(String(getBranchQty(hit, branchId)));
      }
    }
  };

  // Computed single preview
  const singleParsedQty = parseInt(singleQty, 10);
  const singleValidQty = !Number.isNaN(singleParsedQty);
  const singleDelta = !singleValidQty
    ? 0
    : singleMode === 'in'
      ? singleParsedQty
      : singleMode === 'out'
        ? -singleParsedQty
        : singleParsedQty - currentSingleStock;
  const singleNewStock = currentSingleStock + singleDelta;

  const canSubmitSingle =
    Boolean(branchId) &&
    Boolean(activeProduct) &&
    singleValidQty &&
    (singleMode === 'set' ? singleParsedQty >= 0 : singleParsedQty >= 1) &&
    singleNewStock >= 0 &&
    reason.trim().length > 0 &&
    !(singleMode === 'set' && singleDelta === 0);

  // Bulk helpers
  const bulkPreparedRows = useMemo(() => {
    const q = bulkSearch.trim().toLowerCase();
    return adjustableItems
      .map(p => {
        const cur = getBranchQty(p, branchId);
        const raw = bulkEdits[p.id];
        const hasEdit = raw !== undefined && String(raw).trim() !== '';
        let delta = 0;
        let next = cur;
        let invalid = false;

        if (hasEdit) {
          const parsed = parseInt(raw, 10);
          if (Number.isNaN(parsed)) {
            invalid = true;
          } else if (bulkMode === 'set') {
            if (parsed < 0) invalid = true;
            next = parsed;
            delta = next - cur;
          } else if (bulkMode === 'in') {
            if (parsed < 1) invalid = true;
            delta = parsed;
            next = cur + delta;
          } else {
            if (parsed < 1) invalid = true;
            delta = -parsed;
            next = cur + delta;
          }
          if (next < 0) invalid = true;
        }

        return {
          product: p,
          cur,
          raw: raw ?? '',
          hasEdit,
          delta,
          next,
          invalid,
        };
      })
      .filter(row => {
        const p = row.product;
        if (bulkCategory && p.category !== bulkCategory) return false;
        if (bulkView === 'low' && row.cur > p.reorder_level) return false;
        if (bulkView === 'changed' && (!row.hasEdit || row.delta === 0)) return false;
        if (q) {
          const hay = `${p.name} ${p.sku} ${p.barcode || ''} ${p.brand || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [adjustableItems, branchId, bulkEdits, bulkMode, bulkCategory, bulkView, bulkSearch]);

  useEffect(() => {
    setBulkPage(1);
  }, [bulkSearch, bulkCategory, bulkView, branchId]);

  const bulkSummary = useMemo(() => {
    const entries = [];
    let hasInvalid = false;
    let totalIn = 0;
    let totalOut = 0;

    for (const p of adjustableItems) {
      const raw = bulkEdits[p.id];
      if (raw === undefined || String(raw).trim() === '') continue;
      const cur = getBranchQty(p, branchId);
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) {
        hasInvalid = true;
        continue;
      }
      if (bulkMode === 'set') {
        if (parsed < 0) {
          hasInvalid = true;
          continue;
        }
        const delta = parsed - cur;
        if (delta === 0) continue;
        if (delta > 0) totalIn += delta;
        else totalOut += Math.abs(delta);
        entries.push({ product_id: p.id, mode: 'set', target_qty: parsed });
      } else {
        if (parsed < 1) {
          hasInvalid = true;
          continue;
        }
        const next = bulkMode === 'in' ? cur + parsed : cur - parsed;
        if (next < 0) {
          hasInvalid = true;
          continue;
        }
        if (bulkMode === 'in') totalIn += parsed;
        else totalOut += parsed;
        entries.push({ product_id: p.id, mode: bulkMode, qty: parsed });
      }
    }

    return { entries, hasInvalid, totalIn, totalOut };
  }, [adjustableItems, bulkEdits, bulkMode, branchId]);

  const bulkTotalPages = Math.max(1, Math.ceil(bulkPreparedRows.length / bulkPageSize));
  const bulkPagedRows = useMemo(
    () => bulkPreparedRows.slice((bulkPage - 1) * bulkPageSize, bulkPage * bulkPageSize),
    [bulkPreparedRows, bulkPage]
  );

  const handleSubmitSingle = async e => {
    e?.preventDefault();
    if (!canSubmitSingle || !activeProduct) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const payload = {
        branch: Number(branchId),
        product_id: Number(activeProduct.id),
        mode: singleMode,
        reason: reason.trim(),
        reference: reference.trim(),
      };
      if (singleMode === 'set') {
        payload.target_qty = singleParsedQty;
      } else {
        payload.qty = singleParsedQty;
      }
      const res = await ctx.mutate('stock.adjust', payload);
      const signDelta = res?.delta > 0 ? `+${res.delta}` : String(res?.delta ?? singleDelta);
      ctx.setNotice?.(
        `Adjusted ${activeProduct.name} (${activeBranchName}): ${signDelta} -> Stock ${res?.new_qty ?? singleNewStock}`
      );
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err.message || 'Stock adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitBulk = async () => {
    if (!bulkSummary.entries.length || bulkSummary.hasInvalid || !reason.trim()) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await ctx.mutate('stock.bulk_adjust', {
        branch: Number(branchId),
        reason: reason.trim(),
        reference: reference.trim(),
        items: bulkSummary.entries,
      });
      ctx.setNotice?.(
        `Applied ${res?.adjusted ?? bulkSummary.entries.length} stock adjustment(s) at ${activeBranchName} (${res?.reference || 'Saved'})`
      );
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err.message || 'Bulk stock adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Adjust Stock" onClose={onClose} xl={true}>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Top Mode Tabs & Branch Selector */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            paddingBottom: '10px',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button
              variant={tab === 'single' ? 'primary' : 'outline'}
              icon={ArrowUpDown}
              onClick={() => {
                setTab('single');
                setErrorMsg('');
              }}
            >
              Single Item
            </Button>
            <Button
              variant={tab === 'bulk' ? 'primary' : 'outline'}
              icon={ClipboardCheck}
              onClick={() => {
                setTab('bulk');
                setErrorMsg('');
              }}
            >
              Bulk / Stocktake
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
              Branch:
            </label>
            <select
              value={branchId}
              onChange={e => {
                const nextBranch = Number(e.target.value);
                setBranchId(nextBranch);
                setErrorMsg('');
                if (tab === 'single' && singleMode === 'set' && activeProduct) {
                  setSingleQty(String(getBranchQty(activeProduct, nextBranch)));
                }
              }}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '7px',
                padding: '6px 10px',
                fontSize: '13px',
                fontWeight: 600,
                background: '#ffffff',
              }}
            >
              {options(branches).map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              borderRadius: '8px',
              padding: '9px 12px',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {tab === 'single' ? (
          <form onSubmit={handleSubmitSingle} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Search & Product Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '12px' }}>
              <div className="zk-pb-filter-item">
                <label>Find Item / Scan Barcode</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={singleSearch}
                    onChange={e => setSingleSearch(e.target.value)}
                    onKeyDown={handleSingleSearchKeyDown}
                    placeholder="Type name, SKU, or scan barcode + Enter..."
                  />
                </div>
              </div>

              <div className="zk-pb-filter-item">
                <label>Product ({singleFilteredItems.length} eligible)</label>
                <select
                  value={activeProduct ? String(activeProduct.id) : ''}
                  onChange={e => {
                    const pid = e.target.value;
                    setSelectedProductId(pid);
                    setErrorMsg('');
                    const nextP = adjustableItems.find(p => String(p.id) === pid);
                    if (singleMode === 'set' && nextP) {
                      setSingleQty(String(getBranchQty(nextP, branchId)));
                    }
                  }}
                >
                  {singleFilteredItems.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — Stock: {getBranchQty(p, branchId)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Product Summary Card */}
            {activeProduct && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                    {activeProduct.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    SKU: <span className="mono">{activeProduct.sku}</span>
                    {activeProduct.barcode ? (
                      <>
                        {' · '}Barcode: <span className="mono">{activeProduct.barcode}</span>
                      </>
                    ) : null}
                    {' · '}Category: {activeProduct.category}
                    {' · '}Reorder Level: {activeProduct.reorder_level}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {activeProduct.cost !== undefined && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Unit Cost</div>
                      <strong style={{ fontSize: '13px', color: '#334155' }}>
                        {money(activeProduct.cost)}
                      </strong>
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{activeBranchName} Stock</div>
                    <strong style={{ fontSize: '18px', color: currentSingleStock <= 0 ? '#dc2626' : '#0f766e' }}>
                      {currentSingleStock}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Direction / Mode & Quantity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Adjustment Type
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    icon={ArrowUpCircle}
                    variant={singleMode === 'in' ? 'primary' : 'outline'}
                    onClick={() => handleSingleModeChange('in')}
                  >
                    Stock In (+)
                  </Button>
                  <Button
                    type="button"
                    icon={ArrowDownCircle}
                    variant={singleMode === 'out' ? 'primary' : 'outline'}
                    onClick={() => handleSingleModeChange('out')}
                  >
                    Stock Out (-)
                  </Button>
                  <Button
                    type="button"
                    icon={SlidersHorizontal}
                    variant={singleMode === 'set' ? 'primary' : 'outline'}
                    onClick={() => handleSingleModeChange('set')}
                  >
                    Set Exact Count (=)
                  </Button>
                </div>
              </div>

              <div className="zk-pb-filter-item">
                <label>
                  {singleMode === 'set' ? 'Physical Count on Shelf' : 'Quantity to Adjust'}
                </label>
                <input
                  type="number"
                  min={singleMode === 'set' ? 0 : 1}
                  max={singleMode === 'set' ? 100000 : 10000}
                  value={singleQty}
                  onChange={e => setSingleQty(e.target.value)}
                  style={{ fontSize: '15px', fontWeight: 700 }}
                />
              </div>
            </div>

            {/* Live Stock Calculation Preview */}
            {activeProduct && (
              <div
                style={{
                  background: singleNewStock < 0 ? '#fef2f2' : '#f0fdfa',
                  border: `1px solid ${singleNewStock < 0 ? '#fecaca' : '#99f6e4'}`,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                }}
              >
                <span>
                  Current Stock: <strong>{currentSingleStock}</strong>
                  {'  ->  '}
                  New Stock:{' '}
                  <strong style={{ fontSize: '15px', color: singleNewStock < 0 ? '#dc2626' : '#0f766e' }}>
                    {singleNewStock}
                  </strong>
                </span>
                {singleNewStock < 0 ? (
                  <Badge tone="red">Cannot drop below zero</Badge>
                ) : singleDelta > 0 ? (
                  <Badge tone="mint">+{singleDelta} units added</Badge>
                ) : singleDelta < 0 ? (
                  <Badge tone="amber">{singleDelta} units removed</Badge>
                ) : (
                  <Badge tone="blue">No change</Badge>
                )}
              </div>
            )}

            {/* Quick Reasons & Reference */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Quick Reasons
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {QUICK_REASONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    className="zk-cb-chip"
                    style={
                      reason === r
                        ? { background: '#0d9488', color: '#ffffff', borderColor: '#0d9488' }
                        : undefined
                    }
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '12px' }}>
              <div className="zk-pb-filter-item">
                <label>Reason / Note *</label>
                <input
                  type="text"
                  maxLength={150}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Enter reason for adjustment..."
                  required
                />
              </div>
              <div className="zk-pb-filter-item">
                <label>Reference / Slip # (Optional)</label>
                <input
                  type="text"
                  maxLength={80}
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Auto-generated if blank"
                />
              </div>
            </div>
          </form>
        ) : (
          /* BULK / STOCKTAKE TAB */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Batch Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: '10px' }}>
              <div className="zk-pb-filter-item">
                <label>Search items</label>
                <input
                  type="text"
                  value={bulkSearch}
                  onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Search name, SKU, or barcode..."
                />
              </div>
              <div className="zk-pb-filter-item">
                <label>Category</label>
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {categories
                    .filter(c => c !== 'Services')
                    .map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
              </div>
              <div className="zk-pb-filter-item">
                <label>Input Mode</label>
                <select
                  value={bulkMode}
                  onChange={e => {
                    setBulkMode(e.target.value);
                    setBulkEdits({});
                    setErrorMsg('');
                  }}
                >
                  <option value="set">Set Exact Count (=)</option>
                  <option value="in">Add Stock (+)</option>
                  <option value="out">Remove Stock (-)</option>
                </select>
              </div>
              <div className="zk-pb-filter-item">
                <label>Filter View</label>
                <select value={bulkView} onChange={e => setBulkView(e.target.value)}>
                  <option value="all">All Eligible ({adjustableItems.length})</option>
                  <option value="low">Low / Out of Stock</option>
                  <option value="changed">Modified Only ({bulkSummary.entries.length})</option>
                </select>
              </div>
            </div>

            {/* Batch Reason + Summary Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '10px' }}>
              <div className="zk-pb-filter-item">
                <label>Batch Reason *</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    maxLength={150}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Reason applied to all changed rows..."
                    style={{ flex: 1 }}
                  />
                  <select
                    value=""
                    onChange={e => e.target.value && setReason(e.target.value)}
                    style={{ width: '160px' }}
                    aria-label="Quick reason preset"
                  >
                    <option value="">Pick preset…</option>
                    {QUICK_REASONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="zk-pb-filter-item">
                <label>Batch Reference / Slip #</label>
                <input
                  type="text"
                  maxLength={80}
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Auto ADJ-... if blank"
                />
              </div>
            </div>

            {/* Summary Strip */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '12.5px',
              }}
            >
              <span>
                Branch: <strong>{activeBranchName}</strong> · Showing{' '}
                <strong>{bulkPreparedRows.length}</strong> items ·{' '}
                <strong>{bulkSummary.entries.length}</strong> modified (
                <span style={{ color: '#0d9488', fontWeight: 700 }}>+{bulkSummary.totalIn} in</span>
                {' / '}
                <span style={{ color: '#d97706', fontWeight: 700 }}>-{bulkSummary.totalOut} out</span>)
              </span>
              {Object.keys(bulkEdits).length > 0 && (
                <Button
                  size="small"
                  variant="outline"
                  onClick={() => setBulkEdits({})}
                >
                  Reset All Edits
                </Button>
              )}
            </div>

            {/* Bulk Table */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', maxHeight: '320px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#0f766e', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Product</th>
                    <th style={{ padding: '8px 10px' }}>SKU</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Current</th>
                    <th style={{ padding: '8px 10px', width: '130px' }}>
                      {bulkMode === 'set' ? 'New Count' : bulkMode === 'in' ? 'Add Qty (+)' : 'Remove Qty (-)'}
                    </th>
                    <th style={{ padding: '8px 10px' }}>Result</th>
                    <th style={{ padding: '8px 10px', width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkPagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                        No items match this filter.
                      </td>
                    </tr>
                  ) : (
                    bulkPagedRows.map(row => {
                      const p = row.product;
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: row.invalid
                              ? '#fef2f2'
                              : row.hasEdit && row.delta !== 0
                                ? '#f0fdfa'
                                : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0f172a' }}>
                            <div>{p.name}</div>
                            <small style={{ color: '#64748b', fontWeight: 400 }}>{p.category}</small>
                          </td>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#475569' }}>
                            {p.sku}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>
                            {row.cur}
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            <input
                              type="number"
                              min={bulkMode === 'set' ? 0 : 1}
                              value={row.raw}
                              placeholder={bulkMode === 'set' ? String(row.cur) : '0'}
                              onChange={e => {
                                const val = e.target.value;
                                setBulkEdits(prev => {
                                  const next = { ...prev };
                                  if (val === '') delete next[p.id];
                                  else next[p.id] = val;
                                  return next;
                                });
                              }}
                              style={{
                                width: '96px',
                                padding: '4px 8px',
                                border: `1px solid ${row.invalid ? '#ef4444' : '#cbd5e1'}`,
                                borderRadius: '6px',
                                fontWeight: 700,
                                textAlign: 'center',
                              }}
                            />
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            {!row.hasEdit ? (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            ) : row.invalid ? (
                              <Badge tone="red">Invalid / &lt; 0</Badge>
                            ) : row.delta === 0 ? (
                              <span style={{ color: '#64748b' }}>No change</span>
                            ) : (
                              <span style={{ fontWeight: 700, color: row.delta > 0 ? '#0d9488' : '#d97706' }}>
                                {row.delta > 0 ? `+${row.delta}` : row.delta} {' -> '} {row.next}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                            {row.hasEdit && (
                              <button
                                type="button"
                                className="zk-edit-btn"
                                onClick={() =>
                                  setBulkEdits(prev => {
                                    const next = { ...prev };
                                    delete next[p.id];
                                    return next;
                                  })
                                }
                              >
                                Clear
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {bulkPreparedRows.length > bulkPageSize && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569' }}>
                <span>
                  Page <strong>{bulkPage}</strong> of <strong>{bulkTotalPages}</strong>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    size="small"
                    variant="outline"
                    disabled={bulkPage <= 1}
                    onClick={() => setBulkPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="small"
                    variant="outline"
                    disabled={bulkPage >= bulkTotalPages}
                    onClick={() => setBulkPage(p => Math.min(bulkTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        {tab === 'single' ? (
          <Button
            variant="primary"
            icon={Check}
            disabled={!canSubmitSingle || submitting}
            onClick={handleSubmitSingle}
          >
            {submitting ? 'Saving Adjustment…' : 'Save Stock Adjustment'}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={Check}
            disabled={
              submitting ||
              bulkSummary.hasInvalid ||
              bulkSummary.entries.length === 0 ||
              !reason.trim()
            }
            onClick={handleSubmitBulk}
          >
            {submitting
              ? 'Applying Batch…'
              : `Apply ${bulkSummary.entries.length} Adjustment(s)`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
