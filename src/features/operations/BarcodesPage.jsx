import { useState, useMemo, useEffect } from 'react';
import {
  Barcode,
  Check,
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import { Badge, BarcodeSvg, Button, Modal } from '../../components/common';
import { DataView } from '../../components/feedback';
import { categories as productCategories, money, rupees } from '../../utils';

const LABEL_PRESETS = [
  { id: '50x30_2', name: '50 × 30 mm · 2 across (roll 106 mm)', w: 50, h: 30, across: 2, roll: 106 },
  { id: '50x25_2', name: '50 × 25 mm · 2 across (roll 106 mm)', w: 50, h: 25, across: 2, roll: 106 },
  { id: '58x30_1', name: '58 × 30 mm · 1 across (roll 58 mm)', w: 58, h: 30, across: 1, roll: 58 },
  { id: '80x40_1', name: '80 × 40 mm · 1 across (roll 80 mm)', w: 80, h: 40, across: 1, roll: 80 },
  { id: 'a4_3', name: 'A4 Sheet · 65 × 35 mm · 3 across', w: 65, h: 35, across: 3, roll: 210 },
];

export function BarcodesPage({ ctx }) {
  const [branchId, setBranchId] = useState(ctx.branch || 0);
  const state = useData(ctx, {
    items: ['products', { branch: branchId }],
    printStats: ['barcode.stats', { branch: branchId }],
  });

  useEffect(() => {
    if (ctx.branch !== undefined) {
      setBranchId(ctx.branch || 0);
    }
  }, [ctx.branch]);

  return (
    <DataView state={state}>
      {({ items = [], printStats = {} }) => (
        <PrintBarcodesWorkspace
          ctx={ctx}
          branchId={branchId}
          setBranchId={setBranchId}
          items={items}
          printStats={printStats}
          onRefresh={state.refresh}
        />
      )}
    </DataView>
  );
}

function PrintBarcodesWorkspace({
  ctx,
  branchId,
  setBranchId,
  items,
  printStats,
  onRefresh,
}) {
  const physicalProducts = useMemo(
    () => items.filter(p => p.category !== 'Services'),
    [items]
  );

  const [localBarcodes, setLocalBarcodes] = useState({});
  const effectiveProducts = useMemo(
    () =>
      physicalProducts.map(p => ({
        ...p,
        effectiveBarcode: localBarcodes[p.id] ?? p.barcode ?? '',
      })),
    [physicalProducts, localBarcodes]
  );

  // Selected queue (ordered array of product ids + print quantities)
  const [pickedIds, setPickedIds] = useState([]);
  const [quantitiesById, setQuantitiesById] = useState({});
  const [query, setQuery] = useState('');
  const [barcodePresence, setBarcodePresence] = useState('all'); // 'all' | 'has' | 'missing'
  const [barcodeType, setBarcodeType] = useState('all'); // 'all' | 'internal' | 'manufacturer'
  const [department, setDepartment] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [printedFilter, setPrintedFilter] = useState('all'); // 'all' | 'never' | 'printed'

  // Pagination (50 rows per page matching fast catalog browsing)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [savingId, setSavingId] = useState(null);
  const [printWindowOpen, setPrintWindowOpen] = useState(false);

  const distinctBrands = useMemo(
    () => [...new Set(effectiveProducts.map(p => p.brand).filter(Boolean))].sort(),
    [effectiveProducts]
  );

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return effectiveProducts.filter(p => {
      const code = String(p.effectiveBarcode || '');
      const hasCode = Boolean(code);
      const isZd = code.toUpperCase().startsWith('ZD');
      const stats = printStats[String(p.id)];
      const wasPrinted = Boolean(stats && stats.times_printed > 0);

      if (barcodePresence === 'has' && !hasCode) return false;
      if (barcodePresence === 'missing' && hasCode) return false;

      if (barcodeType === 'internal' && !isZd) return false;
      if (barcodeType === 'manufacturer' && (!hasCode || isZd)) return false;

      if (department && p.category !== department) return false;
      if (brandFilter && p.brand !== brandFilter) return false;

      if (printedFilter === 'never' && wasPrinted) return false;
      if (printedFilter === 'printed' && !wasPrinted) return false;

      if (!q) return true;
      return [p.name, p.sku, code, p.brand].some(s => s?.toLowerCase().includes(q));
    });
  }, [
    effectiveProducts,
    printStats,
    query,
    barcodePresence,
    barcodeType,
    department,
    brandFilter,
    printedFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [query, barcodePresence, barcodeType, department, brandFilter, printedFilter, pageSize, branchId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const pickedProducts = useMemo(
    () =>
      pickedIds
        .map(id => effectiveProducts.find(p => p.id === id))
        .filter(Boolean),
    [pickedIds, effectiveProducts]
  );

  const togglePick = productId => {
    setPickedIds(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      }
      setQuantitiesById(q => (q[productId] ? q : { ...q, [productId]: 2 }));
      return [...prev, productId];
    });
  };

  const setQueueQty = (id, qty) => {
    const val = Math.max(1, Math.min(500, parseInt(qty, 10) || 1));
    setQuantitiesById(prev => ({ ...prev, [id]: val }));
  };

  const matchStockQueueQty = () => {
    setQuantitiesById(prev => {
      const next = { ...prev };
      for (const p of pickedProducts) {
        next[p.id] = Math.max(1, p.qty || 1);
      }
      return next;
    });
  };

  const setAllQueueQty = val => {
    setQuantitiesById(prev => {
      const next = { ...prev };
      for (const id of pickedIds) next[id] = val;
      return next;
    });
  };

  const totalPickedLabels = pickedProducts.reduce(
    (sum, p) => sum + (quantitiesById[p.id] ?? 2),
    0
  );

  const addCurrentPageToQueue = () => {
    setPickedIds(prev => {
      const next = new Set(prev);
      for (const p of pagedProducts) next.add(p.id);
      return Array.from(next);
    });
  };

  const clearQueue = () => setPickedIds([]);

  // Strictly assign internal ZD barcode ONLY when product has no barcode
  const handleGenerateSingleZd = async product => {
    if (product.effectiveBarcode) return;
    setSavingId(product.id);
    try {
      const res = await ctx.mutate('product.barcode', {
        id: product.id,
        auto_generate: true,
      });
      if (res?.barcode) {
        setLocalBarcodes(prev => ({ ...prev, [product.id]: res.barcode }));
        ctx.setNotice(`Assigned & saved internal barcode ${res.barcode}`);
        onRefresh?.();
      }
    } catch (err) {
      alert(err.message || 'Failed to generate barcode.');
    } finally {
      setSavingId(null);
    }
  };

  const formatPrintedHistory = stats => {
    if (!stats || !stats.times_printed) {
      return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>never</span>;
    }
    const dt = stats.last_printed_at
      ? new Date(stats.last_printed_at.replace(' ', 'T')).toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    return (
      <span style={{ fontSize: '12px', color: '#334155' }}>
        <strong>{stats.total_labels}</strong> label(s), {stats.times_printed} time(s)
        {dt ? ` · ${dt}` : ''}
        {stats.last_price ? ` · at ${money(stats.last_price)}` : ''}
      </span>
    );
  };

  const startItem = filteredProducts.length ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, filteredProducts.length);

  return (
    <div className="zk-dashboard-wrap">
      {/* Header matching Image 2 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '21px', fontWeight: 800, color: '#0f172a' }}>
            Print Barcodes
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
            Shelf labels for branch stock. Internal <code>ZDXXXXXXX</code> barcodes are assigned only to items without a manufacturer barcode.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <Button icon={RefreshCw} variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Selected Labels Queue Box (Top Card from Image 2) */}
      <div className="zk-pb-queue-card">
        <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
            Selected labels ({pickedProducts.length} items · {totalPickedLabels} stickers)
          </strong>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" variant="outline" onClick={addCurrentPageToQueue}>
              + Add Current Page ({pagedProducts.length})
            </Button>
            {pickedProducts.length > 0 && (
              <>
                <Button size="small" variant="outline" onClick={matchStockQueueQty}>
                  Match Stock
                </Button>
                <Button size="small" variant="outline" onClick={() => setAllQueueQty(1)}>
                  All 1
                </Button>
                <Button size="small" variant="outline" onClick={() => setAllQueueQty(2)}>
                  All 2
                </Button>
                <Button size="small" variant="outline" onClick={clearQueue}>
                  Clear
                </Button>
              </>
            )}
            <Button
              size="small"
              variant="primary"
              icon={Printer}
              onClick={() => {
                if (pickedProducts.length === 0 && pagedProducts.length > 0) {
                  setPickedIds([pagedProducts[0].id]);
                }
                setPrintWindowOpen(true);
              }}
            >
              Print Barcode Labels
            </Button>
          </div>
        </div>

        <div className="zk-pb-queue-header">
          <span>Item</span>
          <span>Price</span>
          <span>Print Quantity</span>
          <span style={{ textAlign: 'right' }}>Action</span>
        </div>

        {pickedProducts.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>
            No items picked yet. Click <strong>+ Add</strong> on any item below or click <strong>Print Barcode Labels</strong>.
          </div>
        ) : (
          <div style={{ maxHeight: '190px', overflowY: 'auto' }}>
            {pickedProducts.map(p => (
              <div className="zk-pb-queue-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>{' '}
                  <small className="mono" style={{ color: '#64748b' }}>({p.sku})</small>
                </div>
                <strong>{money(p.price)}</strong>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className="zk-stepper-btn"
                    style={{ border: '1px solid #cbd5e1', borderRadius: '4px', width: '24px', height: '24px' }}
                    onClick={() => setQueueQty(p.id, (quantitiesById[p.id] ?? 2) - 1)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={quantitiesById[p.id] ?? 2}
                    onChange={e => setQueueQty(p.id, e.target.value)}
                    style={{
                      width: '54px',
                      textAlign: 'center',
                      border: '1px solid #cbd5e1',
                      borderRadius: '5px',
                      padding: '2px 4px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                    }}
                  />
                  <button
                    type="button"
                    className="zk-stepper-btn"
                    style={{ border: '1px solid #cbd5e1', borderRadius: '4px', width: '24px', height: '24px' }}
                    onClick={() => setQueueQty(p.id, (quantitiesById[p.id] ?? 2) + 1)}
                  >
                    +
                  </button>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="zk-edit-btn"
                    style={{ color: '#dc2626', borderColor: '#fecaca' }}
                    onClick={() => togglePick(p.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Strip matching Image 2 */}
      <div className="zk-settings-card" style={{ padding: '14px 16px' }}>
        <div className="zk-pb-filter-grid">
          <div className="zk-pb-filter-item">
            <label>Branch</label>
            <select value={branchId} onChange={e => setBranchId(Number(e.target.value))}>
              <option value={0}>All Branches</option>
              {ctx.branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="zk-pb-filter-item" style={{ gridColumn: 'span 2' }}>
            <label>Search</label>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Item, code or barcode..."
            />
          </div>

          <div className="zk-pb-filter-item">
            <label>Barcode</label>
            <select value={barcodePresence} onChange={e => setBarcodePresence(e.target.value)}>
              <option value="all">Everything</option>
              <option value="has">Has a barcode</option>
              <option value="missing">Missing barcode only</option>
            </select>
          </div>

          <div className="zk-pb-filter-item">
            <label>Barcode type</label>
            <select value={barcodeType} onChange={e => setBarcodeType(e.target.value)}>
              <option value="all">Internal &amp; manufacturer</option>
              <option value="internal">Internal (ZD) only</option>
              <option value="manufacturer">Manufacturer only</option>
            </select>
          </div>

          <div className="zk-pb-filter-item">
            <label>Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {productCategories
                .filter(c => c !== 'Services')
                .map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>

          <div className="zk-pb-filter-item">
            <label>Brand / Supplier</label>
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
              <option value="">All brands</option>
              {distinctBrands.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="zk-pb-filter-item">
            <label>Printed before?</label>
            <select value={printedFilter} onChange={e => setPrintedFilter(e.target.value)}>
              <option value="all">Everything</option>
              <option value="never">Never printed</option>
              <option value="printed">Already printed</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
          <strong style={{ fontSize: '13px', color: '#334155' }}>
            {filteredProducts.length} items · {pickedProducts.length} picked
          </strong>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              onClick={() => {
                setQuery('');
                setBarcodePresence('all');
                setBarcodeType('all');
                setDepartment('');
                setBrandFilter('');
                setPrintedFilter('all');
                clearQueue();
              }}
            >
              Clear
            </Button>
            <Button
              variant="primary"
              icon={Printer}
              onClick={() => {
                if (pickedProducts.length === 0 && pagedProducts.length > 0) {
                  setPickedIds([pagedProducts[0].id]);
                }
                setPrintWindowOpen(true);
              }}
            >
              Print Barcode Labels
            </Button>
          </div>
        </div>
      </div>

      {/* Main Catalog Table matching Image 2 */}
      <div className="zk-pb-queue-card">
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0f766e', color: '#ffffff', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Item</th>
                <th style={{ padding: '10px 12px' }}>Item Code</th>
                <th style={{ padding: '10px 12px' }}>Barcode</th>
                <th style={{ padding: '10px 12px' }}>Type</th>
                <th style={{ padding: '10px 12px' }}>Price</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Select</th>
                <th style={{ padding: '10px 12px' }}>Printed here before</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map(p => {
                const code = p.effectiveBarcode;
                const isZd = String(code).toUpperCase().startsWith('ZD');
                const isPicked = pickedSet.has(p.id);
                const stats = printStats[String(p.id)];
                const isBusy = savingId === p.id;

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: isPicked ? '#f0fdfa' : '#ffffff',
                    }}
                  >
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0f172a' }}>
                      {p.name}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: '#475569' }}>
                      {p.sku}
                    </td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace' }}>
                      {code ? (
                        <span style={{ color: isZd ? '#0f766e' : '#0f172a', fontWeight: 600 }}>
                          {code}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#dc2626', fontSize: '11.5px', fontWeight: 600 }}>
                            Missing
                          </span>
                          <Button
                            size="small"
                            variant="secondary"
                            icon={isBusy ? RefreshCw : Sparkles}
                            disabled={isBusy}
                            onClick={() => handleGenerateSingleZd(p)}
                            title="Generate & save internal ZDXXXXXXX barcode"
                          >
                            {isBusy ? '…' : 'Gen ZD'}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {!code ? (
                        <Badge tone="amber">No Barcode</Badge>
                      ) : isZd ? (
                        <Badge tone="mint">Internal ZD</Badge>
                      ) : (
                        <Badge tone="blue">Manufacturer</Badge>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: 700 }}>
                      {money(p.price)}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        className={`zk-pb-add-btn ${isPicked ? 'added' : ''}`}
                        onClick={() => togglePick(p.id)}
                      >
                        {isPicked ? '✓ Added' : '+ Add'}
                      </button>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {formatPrintedHistory(stats)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Footer matching Image 2 */}
        <div className="zk-pagination-bar" style={{ padding: '10px 14px', background: '#f8fafc' }}>
          <div className="zk-pagination-info">
            <span>
              <strong>{startItem}–{endItem}</strong> of <strong>{filteredProducts.length}</strong> items
            </span>
            <select
              aria-label="Rows per page"
              className="zk-page-size-select"
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
            >
              {[20, 50, 100].map(sz => (
                <option key={sz} value={sz}>
                  {sz} / page
                </option>
              ))}
            </select>
          </div>

          <div className="zk-pagination-controls">
            <button
              type="button"
              className="zk-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <span style={{ fontSize: '12.5px', fontWeight: 700, padding: '0 10px', color: '#334155' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="zk-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* PRINT BARCODE LABELS MODAL (Matching Image 1) */}
      {printWindowOpen && (
        <PrintLabelsWindowModal
          ctx={ctx}
          branchId={branchId}
          items={pickedProducts.length ? pickedProducts : pagedProducts.slice(0, 1)}
          initialCopiesById={quantitiesById}
          onCopiesChange={setQuantitiesById}
          onClose={() => setPrintWindowOpen(false)}
          onBarcodesGenerated={generated => {
            setLocalBarcodes(prev => ({ ...prev, ...generated }));
            onRefresh?.();
          }}
          onPrinted={() => onRefresh?.()}
        />
      )}
    </div>
  );
}

/* =====================================================================
   PRINT BARCODE LABELS MODAL (EXACT MATCH FOR IMAGE 1)
   Single print / Bulk print · Printer & label setup · Zoom 1x-3x
===================================================================== */
function PrintLabelsWindowModal({
  ctx,
  branchId,
  items = [],
  initialCopiesById = {},
  onCopiesChange,
  onClose,
  onBarcodesGenerated,
  onPrinted,
}) {
  const [mode, setMode] = useState(items.length > 1 ? 'bulk' : 'single'); // 'single' | 'bulk'
  const [setupOpen, setSetupOpen] = useState(false);

  // Label & Printer physical setup
  const [labelW, setLabelW] = useState(50);
  const [labelH, setLabelH] = useState(30);
  const [across, setAcross] = useState(2);
  const [rollW, setRollW] = useState(106);
  const [zoom, setZoom] = useState(2); // 1, 1.5, 2, 3
  const [showDigits, setShowDigits] = useState(true);

  // Single print selection
  const [activeId, setActiveId] = useState(() => items[0]?.id || 0);
  const [copiesById, setCopiesById] = useState(() => {
    const m = {};
    for (const p of items) m[p.id] = initialCopiesById[p.id] ?? 2;
    return m;
  });
  const [priceById, setPriceById] = useState(() => {
    const m = {};
    for (const p of items) m[p.id] = String(rupees(p.price));
    return m;
  });

  const [printing, setPrinting] = useState(false);
  const [isPrintSheetMounted, setIsPrintSheetMounted] = useState(false);

  const activeItem = items.find(p => p.id === Number(activeId)) || items[0];
  const singleCopies = copiesById[activeItem?.id] ?? 2;
  const singlePrice = priceById[activeItem?.id] ?? String(rupees(activeItem?.price || 0));

  const setCopies = (id, count) => {
    const val = Math.max(1, Math.min(500, parseInt(count, 10) || 1));
    setCopiesById(prev => {
      const next = { ...prev, [id]: val };
      onCopiesChange?.(prevQueue => ({ ...prevQueue, [id]: val }));
      return next;
    });
  };

  const setAllCopies = count => {
    const val = Math.max(1, Math.min(500, parseInt(count, 10) || 1));
    setCopiesById(prev => {
      const next = { ...prev };
      for (const p of items) next[p.id] = val;
      onCopiesChange?.(prevQueue => ({ ...prevQueue, ...next }));
      return next;
    });
  };

  // Build stickers list for preview and printing
  const stickers = useMemo(() => {
    const targetItems = mode === 'single' ? (activeItem ? [activeItem] : []) : items;
    const list = [];
    for (const p of targetItems) {
      const count = copiesById[p.id] ?? 2;
      const customPrice = parseFloat(priceById[p.id] ?? rupees(p.price)) || 0;
      const code = p.effectiveBarcode || p.barcode || p.sku;
      for (let i = 0; i < count; i++) {
        list.push({
          product: p,
          code,
          priceFormatted: `Rs. ${customPrice.toFixed(2)}`,
          priceCents: Math.round(customPrice * 100),
        });
      }
    }
    return list;
  }, [mode, activeItem, items, copiesById, priceById]);

  // Group stickers into rows of `across`
  const rows = useMemo(() => {
    const chunked = [];
    for (let i = 0; i < stickers.length; i += across) {
      chunked.push(stickers.slice(i, i + across));
    }
    return chunked;
  }, [stickers, across]);

  // mm to px helper (1mm ≈ 3.78px at 96dpi) * zoom
  const mmToPx = mm => Math.round(mm * 3.78 * zoom);

  const applyPreset = preset => {
    setLabelW(preset.w);
    setLabelH(preset.h);
    setAcross(preset.across);
    setRollW(preset.roll);
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const targetItems = mode === 'single' ? (activeItem ? [activeItem] : []) : items;

      // 1. Strictly auto-generate internal ZD barcodes ONLY for items missing a barcode
      const missingIds = targetItems
        .filter(p => !p.effectiveBarcode && !p.barcode)
        .map(p => p.id);

      if (missingIds.length > 0) {
        const res = await ctx.mutate('barcode.bulk', { product_ids: missingIds });
        if (res?.products?.length) {
          const map = {};
          for (const item of res.products) map[item.id] = item.barcode;
          onBarcodesGenerated?.(map);
        }
      }

      // 2. Log print event into barcode_print_logs
      const logPayload = targetItems.map(p => ({
        product_id: p.id,
        copies: copiesById[p.id] ?? 2,
        price: Math.round((parseFloat(priceById[p.id] ?? rupees(p.price)) || 0) * 100),
      }));
      await ctx.mutate('barcode.log_print', {
        branch: branchId || 0,
        items: logPayload,
      });
      onPrinted?.();

      // 3. Mount print sheet & invoke browser print
      setIsPrintSheetMounted(true);
      setTimeout(() => {
        window.print();
        setIsPrintSheetMounted(false);
        setPrinting(false);
      }, 120);
    } catch (err) {
      alert(err.message || 'Print preparation failed.');
      setPrinting(false);
    }
  };

  return (
    <Modal title="Print Barcode Labels" onClose={onClose} xl={true}>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Top Mode Toggle & Label Size Setup Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button
              variant={mode === 'single' ? 'primary' : 'outline'}
              onClick={() => setMode('single')}
            >
              Single print
            </Button>
            <Button
              variant={mode === 'bulk' ? 'primary' : 'outline'}
              onClick={() => setMode('bulk')}
            >
              Bulk print ({items.length})
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12.5px', color: '#475569' }}>
              Labels <strong>{labelW} × {labelH} mm</strong> · <strong>{across} across</strong> · roll {rollW.toFixed(1)} mm
            </span>
            <Button
              icon={Settings2}
              variant="outline"
              onClick={() => setSetupOpen(v => !v)}
            >
              Printer &amp; label setup
            </Button>
          </div>
        </div>

        {/* Collapsible Printer & Label Setup Drawer */}
        {setupOpen && (
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {LABEL_PRESETS.map(pr => (
                <button
                  key={pr.id}
                  type="button"
                  className="zk-cb-chip"
                  style={
                    labelW === pr.w && labelH === pr.h && across === pr.across
                      ? { background: '#0d9488', color: '#ffffff', borderColor: '#0d9488' }
                      : undefined
                  }
                  onClick={() => applyPreset(pr)}
                >
                  {pr.name}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <div className="zk-pb-filter-item">
                <label>Width (mm)</label>
                <input type="number" min={20} max={120} value={labelW} onChange={e => setLabelW(Number(e.target.value) || 50)} />
              </div>
              <div className="zk-pb-filter-item">
                <label>Height (mm)</label>
                <input type="number" min={15} max={100} value={labelH} onChange={e => setLabelH(Number(e.target.value) || 30)} />
              </div>
              <div className="zk-pb-filter-item">
                <label>Columns Across</label>
                <select value={across} onChange={e => setAcross(Number(e.target.value))}>
                  <option value={1}>1 across</option>
                  <option value={2}>2 across</option>
                  <option value={3}>3 across</option>
                </select>
              </div>
              <div className="zk-pb-filter-item">
                <label>Roll / Sheet Width (mm)</label>
                <input type="number" min={30} max={220} value={rollW} onChange={e => setRollW(Number(e.target.value) || 106)} />
              </div>
            </div>
          </div>
        )}

        {/* Controls Section: Single Print vs Bulk Print */}
        {mode === 'single' ? (
          <div style={{ display: 'flex', gap: '14px', alignItems: 'end', flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
            <div className="zk-pb-filter-item" style={{ flex: '1 1 320px' }}>
              <label>Barcode</label>
              <select
                value={activeItem?.id || ''}
                onChange={e => setActiveId(Number(e.target.value))}
              >
                {items.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sku} — {p.effectiveBarcode || p.barcode || 'No Barcode (Auto ZD)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="zk-pb-filter-item">
              <label>Copies</label>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {[1, 2, 4].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`zk-page-btn ${singleCopies === n ? 'active' : ''}`}
                    style={{ minWidth: '34px', height: '32px' }}
                    onClick={() => activeItem && setCopies(activeItem.id, n)}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={singleCopies}
                  onChange={e => activeItem && setCopies(activeItem.id, e.target.value)}
                  style={{ width: '58px', padding: '5px 8px' }}
                />
              </div>
            </div>

            <div className="zk-pb-filter-item" style={{ width: '110px' }}>
              <label>Price (LKR)</label>
              <input
                type="number"
                step="0.01"
                value={singlePrice}
                onChange={e => activeItem && setPriceById(prev => ({ ...prev, [activeItem.id]: e.target.value }))}
              />
            </div>

            <Button variant="primary" icon={Printer} onClick={handlePrint} disabled={printing || !stickers.length}>
              {printing ? 'Printing…' : 'Print…'}
            </Button>
          </div>
        ) : (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <strong style={{ fontSize: '12.5px' }}>Bulk Items ({items.length})</strong>
                <Button size="small" variant="secondary" onClick={() => setAllCopies(1)}>All 1 Copy</Button>
                <Button size="small" variant="secondary" onClick={() => setAllCopies(2)}>All 2 Copies</Button>
              </div>
              <Button variant="primary" icon={Printer} onClick={handlePrint} disabled={printing || !stickers.length}>
                {printing ? 'Printing…' : 'Print…'}
              </Button>
            </div>

            <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '6px' }}>
              {items.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' }}>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                    {p.name}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={copiesById[p.id] ?? 2}
                    onChange={e => setCopies(p.id, e.target.value)}
                    style={{ width: '48px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center' }}
                    title="Copies"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={priceById[p.id] ?? String(rupees(p.price))}
                    onChange={e => setPriceById(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ width: '74px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right' }}
                    title="Sticker Price"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row summary line */}
        <div style={{ fontSize: '12.5px', color: '#334155' }}>
          <strong>{stickers.length}</strong> label(s) → <strong>{rows.length}</strong> row(s) of {across}
        </div>

        {/* Zoomable Exact-Size PRINT PREVIEW matching Image 1 */}
        <div>
          <div className="zk-preview-bar">
            <span>
              <strong>PRINT PREVIEW</strong>{' '}
              <span style={{ color: '#64748b' }}>
                exact size × {zoom} — dashed lines are the label edges (not printed)
              </span>
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showDigits}
                  onChange={e => setShowDigits(e.target.checked)}
                  style={{ accentColor: '#0d9488' }}
                />
                <span>Show numbers below barcode</span>
              </label>

              <div className="zk-zoom-group">
                {[1, 1.5, 2, 3].map(z => (
                  <button
                    key={z}
                    type="button"
                    className={`zk-zoom-btn ${zoom === z ? 'active' : ''}`}
                    onClick={() => setZoom(z)}
                  >
                    {z}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="zk-preview-canvas">
            {rows.slice(0, 10).map((row, rIdx) => (
              <div className="zk-label-row-strip" key={rIdx}>
                {row.map((st, cIdx) => {
                  const wPx = mmToPx(labelW);
                  const hPx = mmToPx(labelH);
                  const spacedCode = String(st.code).split('').join(' ');
                  const barHeightPx = Math.max(28, Math.round(hPx * (showDigits ? 0.44 : 0.52)));

                  return (
                    <div
                      key={cIdx}
                      className="zk-exact-sticker"
                      style={{
                        width: `${wPx}px`,
                        height: `${hPx}px`,
                        padding: `${Math.max(4, Math.round(hPx * 0.035))}px ${Math.max(6, Math.round(wPx * 0.03))}px`,
                        justifyContent: 'center',
                        gap: `${Math.max(1, Math.round(hPx * 0.012))}px`,
                      }}
                    >
                      <div
                        className="zk-sticker-title"
                        style={{
                          fontSize: `${Math.max(8, Math.round(hPx * 0.088))}px`,
                          marginBottom: `${Math.max(2, Math.round(hPx * 0.03))}px`,
                        }}
                      >
                        {st.product.name}
                      </div>

                      <div
                        className="zk-sticker-price"
                        style={{
                          fontSize: `${Math.max(10, Math.round(hPx * 0.112))}px`,
                          lineHeight: 1.05,
                        }}
                      >
                        {st.priceFormatted}
                      </div>

                      <div
                        className="zk-sticker-sku"
                        style={{
                          fontSize: `${Math.max(7, Math.round(hPx * 0.07))}px`,
                          fontWeight: 500,
                          marginBottom: `${Math.max(1, Math.round(hPx * 0.015))}px`,
                        }}
                      >
                        Item: {st.product.sku}
                      </div>

                      <div style={{ width: '74%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '100%' }}>
                          <BarcodeSvg
                            value={st.code}
                            height={barHeightPx}
                            showText={false}
                            barColor="#000000"
                          />
                        </div>
                        {showDigits && (
                          <span
                            className="mono"
                            style={{
                              fontSize: `${Math.max(7, Math.round(hPx * 0.074))}px`,
                              fontWeight: 700,
                              letterSpacing: `${Math.max(1, Math.round(zoom * 0.8))}px`,
                              marginTop: `${Math.max(2, Math.round(hPx * 0.015))}px`,
                              color: '#000000',
                            }}
                          >
                            {spacedCode}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {rows.length > 10 && (
              <small style={{ color: '#475569' }}>
                Showing first 10 rows in preview ({rows.length} rows total when printed).
              </small>
            )}
          </div>
        </div>

        {/* On-Demand Print Sheet */}
        {isPrintSheetMounted && (
          <div
            className="print-only zk-exact-print-grid"
            style={{
              gridTemplateColumns: `repeat(${across}, ${labelW}mm)`,
              width: `${across * labelW}mm`,
            }}
            aria-hidden="true"
          >
            {stickers.map((st, idx) => {
              const printBarPx = Math.max(28, Math.round(labelH * 3.78 * (showDigits ? 0.44 : 0.52)));
              return (
                <div
                  key={idx}
                  className="zk-exact-print-cell"
                  style={{
                    width: `${labelW}mm`,
                    height: `${labelH}mm`,
                    padding: '1mm 1.5mm',
                    justifyContent: 'center',
                    gap: '0.4mm',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '8.5pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', marginBottom: '0.8mm' }}>
                    {st.product.name}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '10.5pt', lineHeight: 1.05 }}>
                    {st.priceFormatted}
                  </div>
                  <div style={{ fontSize: '7pt', fontWeight: 500, marginBottom: '0.4mm' }}>
                    Item: {st.product.sku}
                  </div>
                  <div style={{ width: '74%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%' }}>
                      <BarcodeSvg value={st.code} height={printBarPx} showText={false} barColor="#000000" />
                    </div>
                    {showDigits && (
                      <span style={{ fontFamily: 'monospace', fontSize: '7.2pt', fontWeight: 700, letterSpacing: '1px', marginTop: '0.5mm' }}>
                        {String(st.code).split('').join(' ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" icon={Printer} onClick={handlePrint} disabled={printing || !stickers.length}>
          {printing ? 'Printing…' : `Print ${stickers.length} Label(s)`}
        </Button>
      </div>
    </Modal>
  );
}
