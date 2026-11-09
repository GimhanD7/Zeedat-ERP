import { useState, useMemo } from 'react';
import {
  Barcode,
  Check,
  CheckSquare,
  Layers,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  X,
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

  const [query, setQuery] = useState('');
  const [labelFormat, setLabelFormat] = useState('sticker58'); // sticker58, tag80, a4grid, compact
  const [selectedIds, setSelectedIds] = useState(() => {
    // By default, select all physical products that don't have a barcode, or all if none missing
    const unbarcoded = physicalProducts.filter(p => !p.barcode).map(p => p.id);
    return new Set(unbarcoded.length ? unbarcoded : physicalProducts.map(p => p.id));
  });

  // Track copies per product: product.id -> copies count (default to current stock or 1)
  const [copiesMap, setCopiesMap] = useState(() => {
    const map = {};
    for (const p of physicalProducts) {
      map[p.id] = Math.max(1, p.qty || 1);
    }
    return map;
  });

  const [generating, setGenerating] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'no-barcode', 'has-barcode'

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return physicalProducts.filter(p => {
      if (filterMode === 'no-barcode' && p.barcode) return false;
      if (filterMode === 'has-barcode' && !p.barcode) return false;
      if (!q) return true;
      return [p.name, p.sku, p.barcode, p.brand].some(s =>
        s?.toLowerCase().includes(q)
      );
    });
  }, [physicalProducts, query, filterMode]);

  const toggleSelect = id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const setAllCopiesTo1 = () => {
    setCopiesMap(prev => {
      const next = { ...prev };
      for (const p of physicalProducts) next[p.id] = 1;
      return next;
    });
  };

  const matchStockCopies = () => {
    setCopiesMap(prev => {
      const next = { ...prev };
      for (const p of physicalProducts) next[p.id] = Math.max(1, p.qty || 1);
      return next;
    });
  };

  const updateCopies = (id, count) => {
    const val = Math.max(1, Math.min(500, parseInt(count, 10) || 1));
    setCopiesMap(prev => ({ ...prev, [id]: val }));
  };

  // Generate barcodes for all unbarcoded items that are selected
  const handleGenerateMissing = async () => {
    const missingSelected = physicalProducts
      .filter(p => !p.barcode && selectedIds.has(p.id))
      .map(p => p.id);

    if (!missingSelected.length) {
      alert('All selected physical items already have barcodes!');
      return;
    }

    setGenerating(true);
    try {
      if (onBulkGenerate) {
        await onBulkGenerate(missingSelected);
      }
    } finally {
      setGenerating(false);
    }
  };

  // Compute printable queue: array of { product, barcode } repeated copies times
  const printQueue = useMemo(() => {
    const queue = [];
    for (const p of physicalProducts) {
      if (!selectedIds.has(p.id)) continue;
      const count = copiesMap[p.id] || 1;
      const barcodeValue = p.barcode || p.sku;
      for (let i = 0; i < count; i++) {
        queue.push({ product: p, barcodeValue });
      }
    }
    return queue;
  }, [physicalProducts, selectedIds, copiesMap]);

  const missingBarcodeSelectedCount = physicalProducts.filter(
    p => !p.barcode && selectedIds.has(p.id)
  ).length;

  return (
    <Modal
      title="Batch Barcode Generator & Label Printing"
      description="Generate barcodes for unbarcoded items and print bulk sticker sheets."
      onClose={onClose}
      wide={true}
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
                placeholder="Search products in list…"
              />
            </div>
            <select
              value={filterMode}
              onChange={e => setFilterMode(e.target.value)}
            >
              <option value="all">Show All Physical Products ({physicalProducts.length})</option>
              <option value="no-barcode">
                Missing Barcode Only ({physicalProducts.filter(p => !p.barcode).length})
              </option>
              <option value="has-barcode">
                With Barcode ({physicalProducts.filter(p => Boolean(p.barcode)).length})
              </option>
            </select>
          </div>

          <div className="batch-actions-top">
            {missingBarcodeSelectedCount > 0 && (
              <Button
                icon={generating ? RefreshCw : Sparkles}
                variant="primary"
                disabled={generating}
                onClick={handleGenerateMissing}
              >
                {generating
                  ? 'Generating…'
                  : `Auto-Generate Barcodes for ${missingBarcodeSelectedCount} Items`}
              </Button>
            )}
            <div className="selection-helpers">
              <Button size="small" variant="secondary" onClick={selectAll}>
                Select All
              </Button>
              <Button size="small" variant="secondary" onClick={deselectAll}>
                Deselect
              </Button>
              <Button size="small" variant="secondary" onClick={matchStockCopies}>
                Match Stock
              </Button>
              <Button size="small" variant="secondary" onClick={setAllCopiesTo1}>
                1 Copy Each
              </Button>
            </div>
          </div>
        </div>

        {/* Middle: Product Selection Table & Settings */}
        <div className="batch-layout-grid">
          {/* Products List */}
          <div className="batch-products-list">
            <table className="batch-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Product</th>
                  <th>Barcode</th>
                  <th style={{ width: 100 }}>Copies</th>
                  <th style={{ width: 70 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const isChecked = selectedIds.has(p.id);
                  const copies = copiesMap[p.id] || 1;

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
                          <small className="mono subtext">{p.sku}</small>
                        </div>
                      </td>
                      <td>
                        {p.barcode ? (
                          <span className="barcode-pill mono" style={{ fontSize: 11 }}>
                            <Barcode size={12} /> {p.barcode}
                          </span>
                        ) : (
                          <span className="badge-no-barcode" style={{ fontSize: 10 }}>
                            No Barcode (Uses SKU)
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
                        {!p.barcode && (
                          <Button
                            size="small"
                            variant="secondary"
                            icon={Sparkles}
                            title="Generate a 12-digit barcode for this item"
                            onClick={async () => {
                              if (onUpdateSingleBarcode) {
                                await onUpdateSingleBarcode(p.id);
                              }
                            }}
                          >
                            Gen
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                    {printQueue.length} stickers
                  </strong>
                </div>
                {missingBarcodeSelectedCount > 0 && (
                  <div className="stat-row text-amber">
                    <span>Missing Barcodes:</span>
                    <strong>{missingBarcodeSelectedCount} items</strong>
                  </div>
                )}
              </div>

              {printQueue.length > 0 && (
                <div className="single-preview-wrap">
                  <h5>Single Sticker Preview</h5>
                  <div className={`barcode-label-card ${labelFormat}`}>
                    <div className="label-header">
                      <span className="label-shop">{shopName}</span>
                      <span className="label-sku mono">{printQueue[0].product.sku}</span>
                    </div>
                    <div className="label-title">{printQueue[0].product.name}</div>
                    <div className="label-barcode">
                      <BarcodeSvg
                        value={printQueue[0].barcodeValue}
                        height={labelFormat === 'compact' ? 30 : 40}
                        showText={true}
                      />
                    </div>
                    <div className="label-footer">
                      <span className="label-price">
                        {money(printQueue[0].product.price)}
                      </span>
                      <span className="label-vat">Incl. Taxes</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden Printable Sheet for Browser Print (Triggered by window.print()) */}
        <div className={`batch-print-sheet print-only ${labelFormat}`} aria-hidden="true">
          {printQueue.map((item, idx) => (
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
      </div>

      <div className="modal-footer">
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="primary"
          icon={Printer}
          disabled={!printQueue.length}
          onClick={() => window.print()}
        >
          Print {printQueue.length} {printQueue.length === 1 ? 'Sticker' : 'Stickers'}
        </Button>
      </div>
    </Modal>
  );
}
