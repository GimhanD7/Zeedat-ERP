import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Barcode,
  Check,
  Copy,
  Printer,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Button, Modal, BarcodeSvg } from '../../components/common';
import { money } from '../../utils';

export function BarcodeLabelModal({
  product,
  allProducts = [],
  shopName = 'ZEEDAT POS',
  onClose,
  onUpdateBarcode,
}) {
  const [copies, setCopies] = useState(1);
  const [labelFormat, setLabelFormat] = useState('sticker58'); // sticker58, tag80, compact
  const [customBarcode, setCustomBarcode] = useState(product?.barcode || '');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!product) return null;

  const currentBarcode = customBarcode || product.barcode;

  // Real-time check: Ensure this barcode isn't already assigned to another product
  const conflictProduct = useMemo(() => {
    if (!customBarcode) return null;
    const cleaned = customBarcode.trim().toLowerCase();
    return (allProducts || []).find(
      p => p.id !== product.id && p.barcode && p.barcode.trim().toLowerCase() === cleaned
    );
  }, [customBarcode, allProducts, product.id]);

  const generateBarcode = async () => {
    setGenerating(true);
    setSaving(true);
    try {
      if (onUpdateBarcode) {
        const savedCode = await onUpdateBarcode(product.id, '', true);
        if (savedCode) {
          setCustomBarcode(savedCode);
          return;
        }
      }
      const code = 'ZD' + String(product.id || Math.floor(Math.random() * 9000000) + 1000000).padStart(7, '0');
      setCustomBarcode(code);
      if (onUpdateBarcode) {
        await onUpdateBarcode(product.id, code);
      }
    } finally {
      setGenerating(false);
      setSaving(false);
    }
  };

  const useSkuAsBarcode = async () => {
    if (!product.sku) return;
    const cleaned = product.sku.trim().toLowerCase();
    const conflict = (allProducts || []).find(
      p => p.id !== product.id && p.barcode && p.barcode.trim().toLowerCase() === cleaned
    );
    if (conflict) {
      alert(`The SKU '${product.sku}' is already assigned as a barcode to '${conflict.name}'. One barcode can only belong to one product.`);
      return;
    }
    setCustomBarcode(product.sku);
    if (onUpdateBarcode) {
      setSaving(true);
      await onUpdateBarcode(product.id, product.sku);
      setSaving(false);
    }
  };

  const clearBarcode = async () => {
    setCustomBarcode('');
    if (onUpdateBarcode) {
      setSaving(true);
      await onUpdateBarcode(product.id, '');
      setSaving(false);
    }
  };

  const saveCustomBarcode = async () => {
    if (conflictProduct) {
      alert(`Barcode '${customBarcode}' is already assigned to '${conflictProduct.name}'. One barcode can only belong to one product.`);
      return;
    }
    if (onUpdateBarcode) {
      setSaving(true);
      await onUpdateBarcode(product.id, customBarcode);
      setSaving(false);
    }
  };

  const copyToClipboard = () => {
    if (currentBarcode) {
      navigator.clipboard?.writeText(currentBarcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      title="Barcode & Label Printing"
      description={`Manage barcode and print labels for ${product.name}`}
      onClose={onClose}
      wide={true}
    >
      <div className="barcode-modal-body">
        <div className="barcode-modal-grid">
          {/* Left panel: Controls & Settings */}
          <div className="barcode-controls">
            <div className="field">
              <label>Barcode Value</label>
              <div className="barcode-input-row">
                <input
                  type="text"
                  className="mono"
                  value={customBarcode}
                  onChange={e => setCustomBarcode(e.target.value)}
                  placeholder="Enter or scan barcode…"
                />
                {customBarcode && customBarcode !== product.barcode && (
                  <Button
                    variant="primary"
                    disabled={saving || Boolean(conflictProduct)}
                    onClick={saveCustomBarcode}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                )}
                {currentBarcode && (
                  <Button
                    icon={copied ? Check : Copy}
                    className="icon-only"
                    variant="link"
                    title="Copy barcode number"
                    onClick={copyToClipboard}
                  />
                )}
              </div>

              {conflictProduct && (
                <div className="barcode-conflict-warning">
                  <AlertTriangle size={15} />
                  <span>
                    <strong>Duplicate Barcode:</strong> Already assigned to{' '}
                    <strong>{conflictProduct.name}</strong> (<span className="mono">{conflictProduct.sku}</span>).
                    One barcode can only belong to one product.
                  </span>
                </div>
              )}

              {/* Quick Actions for Items Without Barcode */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {!product.barcode && (
                  <>
                    <Button
                      icon={generating ? RefreshCw : Sparkles}
                      variant="secondary"
                      size="small"
                      title="Auto-generate & save a ZDXXXXXXX internal barcode"
                      onClick={generateBarcode}
                      disabled={generating || saving}
                    >
                      {saving ? 'Saving…' : 'Generate ZD Barcode'}
                    </Button>
                    <Button
                      icon={Tag}
                      variant="secondary"
                      size="small"
                      title="Use SKU as the barcode"
                      onClick={useSkuAsBarcode}
                      disabled={saving}
                    >
                      Use SKU ({product.sku})
                    </Button>
                  </>
                )}
                {product.barcode && (
                  <Button
                    icon={Trash2}
                    variant="link"
                    size="small"
                    title="Remove barcode from this product"
                    onClick={clearBarcode}
                    disabled={saving}
                  >
                    Clear barcode
                  </Button>
                )}
              </div>

              {!currentBarcode ? (
                <div className="no-barcode-notice" style={{ marginTop: 10 }}>
                  <p>
                    <strong>No Barcode Assigned:</strong> This item doesn't have a manufacturer barcode.
                  </p>
                  <p className="subtext">
                    Click <em>Generate ZD Barcode</em> to auto-assign and save an internal <code>ZDXXXXXXX</code> barcode for printing stickers.
                  </p>
                </div>
              ) : (
                <small className="help-text text-green" style={{ display: 'block', marginTop: 6 }}>
                  {String(currentBarcode).toUpperCase().startsWith('ZD')
                    ? 'Internal ZD Barcode is active and scannable at POS.'
                    : 'Manufacturer Barcode is protected and active (internal ZD barcode is not assigned).'}
                </small>
              )}
            </div>

            <div className="field-grid two-col">
              <div className="field">
                <label>Number of Copies</label>
                <div className="copies-selector">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={copies}
                    onChange={e =>
                      setCopies(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)))
                    }
                  />
                  {product.qty > 0 && (
                    <Button
                      variant="link"
                      onClick={() => setCopies(Math.min(200, product.qty))}
                    >
                      Match Stock ({product.qty})
                    </Button>
                  )}
                </div>
              </div>

              <div className="field">
                <label>Label Format</label>
                <select
                  value={labelFormat}
                  onChange={e => setLabelFormat(e.target.value)}
                >
                  <option value="sticker58">58mm Thermal Sticker</option>
                  <option value="tag80">80mm Retail Tag</option>
                  <option value="compact">Compact Part Label (40x25mm)</option>
                </select>
              </div>
            </div>

            <div className="product-info-summary">
              <div>
                <span className="info-label">Product Name</span>
                <strong>{product.name}</strong>
              </div>
              <div className="info-row">
                <div>
                  <span className="info-label">SKU</span>
                  <span className="mono">{product.sku}</span>
                </div>
                <div>
                  <span className="info-label">Selling Price</span>
                  <span className="price-tag">{money(product.price)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Live Visual Preview */}
          <div className="barcode-preview-area">
            <h4>Label Live Preview</h4>
            <div className={`barcode-label-card ${labelFormat}`}>
              <div className="label-header">
                <span className="label-shop">{shopName}</span>
                <span className="label-sku mono">{product.sku}</span>
              </div>
              <div className="label-title">{product.name}</div>
              <div className="label-barcode">
                <BarcodeSvg
                  value={currentBarcode || product.sku}
                  height={labelFormat === 'compact' ? 32 : 44}
                  showText={true}
                />
              </div>
              <div className="label-footer">
                <span className="label-price">{money(product.price)}</span>
                <span className="label-vat">Incl. Taxes</span>
              </div>
            </div>
            {!currentBarcode && (
              <small className="subtext" style={{ marginTop: 8 }}>
                Previewing label using product SKU (<span className="mono">{product.sku}</span>)
              </small>
            )}
          </div>
        </div>

        {/* Hidden printable label sheet */}
        <div className="printable-labels-sheet print-only" aria-hidden="true">
          {Array.from({ length: copies }).map((_, i) => (
            <div key={i} className={`print-label-item ${labelFormat}`}>
              <div className="label-header">
                <span className="label-shop">{shopName}</span>
                <span className="label-sku mono">{product.sku}</span>
              </div>
              <div className="label-title">{product.name}</div>
              <div className="label-barcode">
                <BarcodeSvg
                  value={currentBarcode || product.sku}
                  height={labelFormat === 'compact' ? 32 : 44}
                  showText={true}
                />
              </div>
              <div className="label-footer">
                <span className="label-price">{money(product.price)}</span>
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
          onClick={handlePrint}
        >
          Print {copies} {copies === 1 ? 'Label' : 'Labels'}
        </Button>
      </div>
    </Modal>
  );
}
