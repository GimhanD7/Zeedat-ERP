import { useState, useMemo, useEffect } from 'react';
import {
  Barcode,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  MinusSquare,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Square,
} from 'lucide-react';
import { Button, Modal, BarcodeSvg } from '../../components/common';
import { money } from '../../utils';

export function BatchBarcodeModal({
  products = [],
  shopName = 'ZEEDAT POS',
  onClose,
  onBulkGenerate,
  onUpdateSingleBarcode,
}) {
  // Services never have barcodes or physical barcode stickers
  const physicalProducts = useMemo(
    () => products.filter(p => p.category !== 'Services'),
    [products]
  );

  // Optimistic local barcode map merged with server products
  const [localBarcodes, setLocalBarcodes] = useState({});

  const effectiveProducts = useMemo(
    () =>
      physicalProducts.map(p => ({
        ...p,
        effectiveBarcode: localBarcodes[p.id] ?? p.barcode ?? '',
      })),
    [physicalProducts, localBarcodes]
  );

  const [query, setQuery] = useState('');
  const [labelFormat, setLabelFormat] = useState('sticker58'); // sticker58, tag80, a4grid, compact
  const [previewMode, setPreviewMode] = useState('single'); // 'single' | 'grid'
  const [bulkCopiesInput, setBulkCopiesInput] = useState('1');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'no-barcode', 'has-barcode'

  // Pagination inside modal for instant rendering & zero lag
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Lazy selection & copies map (default 1 copy per item to keep mount instantaneous)
  const [selectedIds, setSelectedIds] = useState(() => {
    const unbarcoded = physicalProducts.filter(p => !p.barcode).map(p => p.id);
    return new Set(unbarcoded.length ? unbarcoded : physicalProducts.map(p => p.id));
  });
  const [copiesMap, setCopiesMap] = useState({});

  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return effectiveProducts.filter(p => {
      if (filterMode === 'no-barcode' && p.effectiveBarcode) return false;
      if (filterMode === 'has-barcode' && !p.effectiveBarcode) return false;
      if (!q) return true;
      return [p.name, p.sku, p.effectiveBarcode, p.brand].some(s =>
        s?.toLowerCase().includes(q)
      );
    });
  }, [effectiveProducts, query, filterMode]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [query, filterMode, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const allPageSelected =
    pagedProducts.length > 0 && pagedProducts.every(p => selectedIds.has(p.id));
  const somePageSelected =
    pagedProducts.some(p => selectedIds.has(p.id)) && !allPageSelected;

  const getCopies = p => copiesMap[p.id] ?? 1;

  const toggleSelect = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectCurrentPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const p of pagedProducts) next.delete(p.id);
      } else {
        for (const p of pagedProducts) next.add(p.id);
      }
      return next;
    });
  };

  const selectCurrentPageOnly = () => {
    setSelectedIds(new Set(pagedProducts.map(p => p.id)));
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const selectMissingOnly = () => {
    const ids = effectiveProducts.filter(p => !p.effectiveBarcode).map(p => p.id);
    setSelectedIds(new Set(ids));
  };

  const selectInStockOnly = () => {
    const ids = filteredProducts.filter(p => (p.qty || 0) > 0).map(p => p.id);
    setSelectedIds(new Set(ids));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const applyCopiesToSelected = qty => {
    const val = Math.max(1, Math.min(500, parseInt(qty, 10) || 1));
    setCopiesMap(prev => {
      const next = { ...prev };
      for (const id of selectedIds) {
        next[id] = val;
      }
      return next;
    });
  };

  const matchStockCopies = () => {
    setCopiesMap(prev => {
      const next = { ...prev };
      for (const p of effectiveProducts) {
        if (selectedIds.has(p.id)) {
          next[p.id] = Math.max(1, p.qty || 1);
        }
      }
      return next;
    });
  };

  const updateCopies = (id, count) => {
    const val = Math.max(1, Math.min(500, parseInt(count, 10) || 1));
    setCopiesMap(prev => ({ ...prev, [id]: val }));
  };

  // Auto-generate & save ZDXXXXXXX barcodes for selected items
  const runBulkGenerate = async (productIds, force = false) => {
    if (!productIds.length) return;
    setGenerating(true);
    setStatusMsg('');
    try {
      if (onBulkGenerate) {
        const res = await onBulkGenerate(productIds, force);
        if (res?.products && Array.isArray(res.products)) {
          setLocalBarcodes(prev => {
            const next = { ...prev };
            for (const item of res.products) {
              next[item.id] = item.barcode;
            }
            return next;
          });
        }
        setStatusMsg(`Auto-saved ${res?.updated ?? productIds.length} ZD barcodes.`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateMissing = async () => {
    const missingSelected = effectiveProducts
      .filter(p => !p.effectiveBarcode && selectedIds.has(p.id))
      .map(p => p.id);

    if (!missingSelected.length) {
      setStatusMsg('All selected items already have barcodes.');
      return;
    }
    await runBulkGenerate(missingSelected, false);
  };

  const handleAssignZdAllSelected = async () => {
    const targetIds = effectiveProducts
      .filter(p => selectedIds.has(p.id) && !String(p.effectiveBarcode).startsWith('ZD'))
      .map(p => p.id);

    const idsToRun = targetIds.length > 0 ? targetIds : Array.from(selectedIds);
    if (!idsToRun.length) return;
    await runBulkGenerate(idsToRun, true);
  };

  const handleGenerateSingle = async productId => {
    if (!onUpdateSingleBarcode) return;
    setSavingId(productId);
    try {
      const res = await onUpdateSingleBarcode(productId);
      if (res?.barcode) {
        setLocalBarcodes(prev => ({ ...prev, [productId]: res.barcode }));
        setStatusMsg(`Saved ${res.barcode}`);
      }
    } finally {
      setSavingId(null);
    }
  };

  // Lightweight summary counts + first 6 preview stickers (no heavy 3000-SVG allocation!)
  const { totalStickersCount, previewItems } = useMemo(() => {
    let total = 0;
    const preview = [];
    for (const p of effectiveProducts) {
      if (!selectedIds.has(p.id)) continue;
      const count = getCopies(p);
      total += count;
      if (preview.length < 6) {
        const barcodeValue = p.effectiveBarcode || p.sku;
        for (let i = 0; i < count && preview.length < 6; i++) {
          preview.push({ product: p, barcodeValue });
        }
      }
    }
    return { totalStickersCount: total, previewItems: preview };
  }, [effectiveProducts, selectedIds, copiesMap]);

  // Only build the full printQueue DOM when actually printing!
  const printSheetQueue = useMemo(() => {
    if (!isPrinting) return [];
    const queue = [];
    for (const p of effectiveProducts) {
      if (!selectedIds.has(p.id)) continue;
      const count = getCopies(p);
      const barcodeValue = p.effectiveBarcode || p.sku;
      for (let i = 0; i < count; i++) {
        queue.push({ product: p, barcodeValue });
      }
    }
    return queue;
  }, [isPrinting, effectiveProducts, selectedIds, copiesMap]);

  useEffect(() => {
    if (!isPrinting) return;
    const timer = setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [isPrinting]);

  const handlePrintAll = async () => {
    const missingSelected = effectiveProducts
      .filter(p => !p.effectiveBarcode && selectedIds.has(p.id))
      .map(p => p.id);

    if (missingSelected.length > 0) {
      await runBulkGenerate(missingSelected, false);
    }
    setIsPrinting(true);
  };

  const missingTotalCount = effectiveProducts.filter(p => !p.effectiveBarcode).length;
  const missingBarcodeSelectedCount = effectiveProducts.filter(
    p => !p.effectiveBarcode && selectedIds.has(p.id)
  ).length;
  const nonZdSelectedCount = effectiveProducts.filter(
    p => selectedIds.has(p.id) && !String(p.effectiveBarcode).startsWith('ZD')
  ).length;

  const startItem = filteredProducts.length ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, filteredProducts.length);

  return (
    <Modal
      title="Batch ZD Barcode Generator & Label Printing"
      description="Auto-generate & save ZDXXXXXXX barcodes, paginate items, and bulk-print selected labels."
      onClose={onClose}
      xl={true}
    >
      <div className="batch-barcode-modal">
        {/* Top Control Bar */}
        <div className="batch-toolbar">
          <div className="batch-filters">
            <div className="search-wrap">
              <Search size={15} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search products, SKU, or ZD barcode…"
              />
            </div>
            <select
              value={filterMode}
              onChange={e => setFilterMode(e.target.value)}
            >
              <option value="all">All Physical Products ({effectiveProducts.length})</option>
              <option value="no-barcode">
                Missing Barcode Only ({missingTotalCount})
              </option>
              <option value="has-barcode">
                With Barcode ({effectiveProducts.length - missingTotalCount})
              </option>
            </select>
          </div>

          <div className="batch-actions-top" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {missingBarcodeSelectedCount > 0 && (
              <Button
                icon={generating ? RefreshCw : Sparkles}
                variant="primary"
                disabled={generating}
                onClick={handleGenerateMissing}
              >
                {generating
                  ? 'Saving ZD Barcodes…'
                  : `Generate & Auto-Save ZD (${missingBarcodeSelectedCount})`}
              </Button>
            )}

            {selectedIds.size > 0 && nonZdSelectedCount > 0 && (
              <Button
                icon={Sparkles}
                variant="secondary"
                disabled={generating}
                onClick={handleAssignZdAllSelected}
                title="Convert selected items to ZDXXXXXXX barcodes and auto-save"
              >
                Assign ZD to Selected ({nonZdSelectedCount})
              </Button>
            )}

            <div className="selection-helpers" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              <Button size="small" variant="secondary" onClick={selectCurrentPageOnly}>
                Select Page ({pagedProducts.length})
              </Button>
              <Button size="small" variant="secondary" onClick={selectAllFiltered}>
                Select All ({filteredProducts.length})
              </Button>
              {missingTotalCount > 0 && (
                <Button size="small" variant="secondary" onClick={selectMissingOnly}>
                  Select Missing ({missingTotalCount})
                </Button>
              )}
              <Button size="small" variant="secondary" onClick={selectInStockOnly}>
                In-Stock Only
              </Button>
              <Button size="small" variant="secondary" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
          </div>
        </div>

        {/* Bulk Copy & Status Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '8px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            marginBottom: '12px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#334155' }}>Bulk Copies for Selected:</span>
            <Button size="small" variant="secondary" onClick={matchStockCopies}>
              Match Stock Qty
            </Button>
            <Button size="small" variant="secondary" onClick={() => applyCopiesToSelected(1)}>
              1 Copy Each
            </Button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min={1}
                max={500}
                value={bulkCopiesInput}
                onChange={e => setBulkCopiesInput(e.target.value)}
                style={{ width: '52px', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', textAlign: 'center', fontSize: '12px' }}
              />
              <Button
                size="small"
                variant="secondary"
                onClick={() => applyCopiesToSelected(bulkCopiesInput)}
              >
                Apply Copies
              </Button>
            </div>
          </div>

          {statusMsg && (
            <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} /> {statusMsg}
            </span>
          )}
        </div>

        {/* Middle: Product Selection Table & Settings */}
        <div className="batch-layout-grid xl">
          {/* Left Column: Page-wise Products Table + Pagination */}
          <div>
            <div className="batch-products-list xl">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>
                      <button
                        type="button"
                        className="btn-checkbox"
                        onClick={toggleSelectCurrentPage}
                        title={allPageSelected ? 'Deselect current page' : 'Select current page'}
                      >
                        {allPageSelected ? (
                          <CheckSquare size={17} className="text-primary" />
                        ) : somePageSelected ? (
                          <MinusSquare size={17} className="text-primary" />
                        ) : (
                          <Square size={17} className="text-muted" />
                        )}
                      </button>
                    </th>
                    <th>Product</th>
                    <th>ZD Barcode</th>
                    <th style={{ width: 90 }}>Copies</th>
                    <th style={{ width: 90 }}>Auto-Save</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map(p => {
                    const isChecked = selectedIds.has(p.id);
                    const copies = getCopies(p);
                    const isRowBusy = savingId === p.id;
                    const isZd = String(p.effectiveBarcode).startsWith('ZD');

                    return (
                      <tr
                        key={p.id}
                        className={isChecked ? 'row-selected' : 'row-dimmed'}
                      >
                        <td>
                          <button
                            type="button"
                            className="btn-checkbox"
                            onClick={() => toggleSelect(p.id)}
                          >
                            {isChecked ? (
                              <CheckSquare size={17} className="text-primary" />
                            ) : (
                              <Square size={17} className="text-muted" />
                            )}
                          </button>
                        </td>
                        <td>
                          <div className="product-title-cell">
                            <strong>{p.name}</strong>
                            <small className="mono subtext">
                              {p.sku} · Stock: {p.qty ?? 0}
                            </small>
                          </div>
                        </td>
                        <td>
                          {p.effectiveBarcode ? (
                            <span
                              className="barcode-pill mono"
                              style={{
                                fontSize: 11,
                                background: isZd ? '#f0fdfa' : '#f1f5f9',
                                color: isZd ? '#0f766e' : '#334155',
                                borderColor: isZd ? '#99f6e4' : '#cbd5e1',
                              }}
                            >
                              <Barcode size={12} /> {p.effectiveBarcode}
                            </span>
                          ) : (
                            <span className="badge-no-barcode" style={{ fontSize: 10 }}>
                              No Barcode
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            className="copies-input"
                            min={1}
                            max={500}
                            value={copies}
                            onChange={e => updateCopies(p.id, e.target.value)}
                          />
                        </td>
                        <td>
                          {!isZd && (
                            <Button
                              size="small"
                              variant="secondary"
                              icon={isRowBusy ? RefreshCw : Sparkles}
                              disabled={isRowBusy || generating}
                              title="Generate & auto-save ZDXXXXXXX barcode"
                              onClick={() => handleGenerateSingle(p.id)}
                            >
                              {isRowBusy ? '…' : 'Gen ZD'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Table Pagination Bar */}
            <div className="zk-pagination-bar" style={{ marginTop: '10px' }}>
              <div className="zk-pagination-info">
                <span>
                  Showing <strong>{startItem}–{endItem}</strong> of <strong>{filteredProducts.length}</strong>
                </span>
                <select
                  aria-label="Modal rows per page"
                  className="zk-page-size-select"
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                >
                  {[10, 20, 50, 100].map(sz => (
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
                  <span>Prev</span>
                </button>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '0 8px', color: '#334155' }}>
                  Page {page} / {totalPages}
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

          {/* Right Preview & Options */}
          <div className="batch-options-preview">
            <div className="options-card">
              <h4>Printing Configuration</h4>
              <div className="field">
                <label>Label Sheet Format</label>
                <select
                  value={labelFormat}
                  onChange={e => setLabelFormat(e.target.value)}
                >
                  <option value="sticker58">58mm Thermal Sticker Roll</option>
                  <option value="tag80">80mm Thermal Tag Roll</option>
                  <option value="a4grid">A4 Label Sheet (3 × 8 = 24 Labels/Page)</option>
                  <option value="compact">Compact Jewelry/Small Tag (40×25mm)</option>
                </select>
              </div>

              <div className="batch-summary-stats">
                <div className="stat-row">
                  <span>Selected Products:</span>
                  <strong>{selectedIds.size} items</strong>
                </div>
                <div className="stat-row">
                  <span>Total Sticker Labels:</span>
                  <strong className="text-primary" style={{ fontSize: 16 }}>
                    {totalStickersCount} stickers
                  </strong>
                </div>
                {missingBarcodeSelectedCount > 0 && (
                  <div className="stat-row text-amber">
                    <span>Missing Barcodes:</span>
                    <strong>{missingBarcodeSelectedCount} (Auto-saves on Print)</strong>
                  </div>
                )}
              </div>

              {previewItems.length > 0 && (
                <div className="single-preview-wrap">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h5 style={{ margin: 0 }}>Label Preview</h5>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className={`zk-3way-btn ${previewMode === 'single' ? 'active-inherit' : ''}`}
                        onClick={() => setPreviewMode('single')}
                      >
                        Single
                      </button>
                      <button
                        type="button"
                        className={`zk-3way-btn ${previewMode === 'grid' ? 'active-inherit' : ''}`}
                        onClick={() => setPreviewMode('grid')}
                      >
                        Queue ({previewItems.length})
                      </button>
                    </div>
                  </div>

                  {previewMode === 'single' ? (
                    <div className={`barcode-label-card ${labelFormat}`}>
                      <div className="label-header">
                        <span className="label-shop">{shopName}</span>
                        <span className="label-sku mono">{previewItems[0].product.sku}</span>
                      </div>
                      <div className="label-title">{previewItems[0].product.name}</div>
                      <div className="label-barcode">
                        <BarcodeSvg
                          value={previewItems[0].barcodeValue}
                          height={labelFormat === 'compact' ? 30 : 40}
                          showText={true}
                        />
                      </div>
                      <div className="label-footer">
                        <span className="label-price">
                          {money(previewItems[0].product.price)}
                        </span>
                        <span className="label-vat">Incl. Taxes</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                      {previewItems.map((item, i) => (
                        <div key={i} className="barcode-label-card compact" style={{ width: '100%' }}>
                          <div className="label-title" style={{ fontSize: '10px' }}>{item.product.name}</div>
                          <div className="label-barcode">
                            <BarcodeSvg value={item.barcodeValue} height={24} showText={true} />
                          </div>
                          <div className="label-footer" style={{ fontSize: '10px' }}>
                            <span className="label-price">{money(item.product.price)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* On-Demand Printable Sheet (only rendered when isPrinting is true for 0ms modal open!) */}
        {isPrinting && (
          <div className={`batch-print-sheet print-only ${labelFormat}`} aria-hidden="true">
            {printSheetQueue.map((item, idx) => (
              <div key={idx} className={`batch-print-label ${labelFormat}`}>
                <div className="label-header">
                  <span className="label-shop">{shopName}</span>
                  <span className="label-sku mono">{item.product.sku}</span>
                </div>
                <div className="label-title">{item.product.name}</div>
                <div className="label-barcode">
                  <BarcodeSvg
                    value={item.barcodeValue}
                    height={labelFormat === 'compact' ? 30 : 42}
                    showText={true}
                  />
                </div>
                <div className="label-footer">
                  <span className="label-price">{money(item.product.price)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="primary"
          icon={generating || isPrinting ? RefreshCw : Printer}
          disabled={!totalStickersCount || generating || isPrinting}
          onClick={handlePrintAll}
        >
          {generating
            ? 'Generating & Saving ZD Barcodes…'
            : isPrinting
            ? 'Preparing Print Sheet…'
            : missingBarcodeSelectedCount > 0
            ? `Auto-Generate ZD & Print (${totalStickersCount})`
            : `Print All Selected (${totalStickersCount} Stickers)`}
        </Button>
      </div>
    </Modal>
  );
}
