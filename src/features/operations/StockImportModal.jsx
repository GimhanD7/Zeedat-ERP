import { useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Badge, Button, Modal, Table } from '../../components/common';
import { Alert } from '../../components/feedback';
import { downloadStockImportTemplate, money, parseStockSpreadsheet } from '../../utils';

export function StockImportModal({ ctx, defaultBranch, onClose, onSuccess }) {
  const [branch, setBranch] = useState(() => Number(defaultBranch || ctx.branch || ctx.branches[0]?.id || 0));
  const [mode, setMode] = useState('add'); // 'add' | 'set'
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ hasBranchColumns: false, hasSkuColumn: false, duplicatesMerged: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    try {
      const parsed = await parseStockSpreadsheet(file, ctx.branches);
      setRows(parsed.rows);
      setMeta({
        hasBranchColumns: parsed.hasBranchColumns,
        hasSkuColumn: parsed.hasSkuColumn,
        duplicatesMerged: parsed.duplicatesMerged,
      });
      if (parsed.hasBranchColumns || parsed.hasSkuColumn) {
        setMode('set');
      }
    } catch (err) {
      setRows([]);
      setMeta({ hasBranchColumns: false, hasSkuColumn: false, duplicatesMerged: 0 });
      setError(err?.message || 'Unable to read spreadsheet.');
    }
  };

  const handleImport = async e => {
    e.preventDefault();
    if (!rows.length) {
      setError('Select an Excel (.xlsx) or CSV (.csv) file with items first.');
      return;
    }
    if (!meta.hasBranchColumns && !branch) {
      setError('Select a destination branch.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await ctx.mutate('product.import', {
        branch,
        mode,
        items: rows,
      });
      ctx.setNotice(
        `Import complete: ${res.created || 0} created, ${res.updated || 0} updated, ${res.stock_adjusted || 0} stock entries posted.`
      );
      onSuccess?.(res);
    } catch (err) {
      setError(err?.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const totalUnits = rows.reduce((s, r) => s + Number(r.qty || 0), 0);

  return (
    <Modal
      title="Import Inventory & Stock from Excel / CSV"
      description="Upload an .xlsx or .csv file to add or update products and stock. New items automatically get ZEE00001-style item codes."
      onClose={() => !busy && onClose()}
      wide={true}
      busy={busy}
    >
      <form onSubmit={handleImport}>
        <div className="modal-body" style={{ display: 'grid', gap: '12px' }}>
          {error && <Alert tone="red">{error}</Alert>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
            {!meta.hasBranchColumns && (
              <label style={{ display: 'grid', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                <span>Target Branch for Stock</span>
                <select
                  value={branch}
                  onChange={e => setBranch(Number(e.target.value))}
                  style={{ minHeight: '36px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                >
                  {ctx.branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display: 'grid', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
              <span>Stock Quantity Mode</span>
              <select
                value={mode}
                onChange={e => setMode(e.target.value)}
                style={{ minHeight: '36px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
              >
                <option value="set">Set exact branch stock (= Qty from Excel)</option>
                <option value="add">Add to existing branch stock (+ Qty)</option>
              </select>
            </label>
          </div>

          <div
            style={{
              border: '1.5px dashed #99f6e4',
              background: '#f0fdfa',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={22} style={{ color: '#0d9488' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '13.5px', color: '#0f172a' }}>
                  {fileName || 'Choose Excel (.xlsx) or CSV (.csv) File'}
                </strong>
                <small className="muted">
                  Columns: Product Name, Category, Brand, Barcode, Cost (LKR), Selling Price (LKR), Stock Qty, Reorder Level
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button icon={Download} variant="ghost" onClick={downloadStockImportTemplate}>
                Sample Template
              </Button>
              <label className="button soft" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={15} />
                <span>{fileName ? 'Change File' : 'Select File'}</span>
                <input
                  type="file"
                  accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={handleFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {rows.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge tone="green">{rows.length} unique items ready</Badge>
                <Badge tone="blue">{totalUnits.toLocaleString()} total stock units</Badge>
                {meta.hasBranchColumns && (
                  <Badge tone="violet">Multi-branch stock columns matched automatically</Badge>
                )}
                {meta.duplicatesMerged > 0 && (
                  <Badge tone="amber">{meta.duplicatesMerged} duplicate name(s) merged</Badge>
                )}
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <Table
                  rows={rows}
                  paginate={false}
                  columns={[
                    ['#', r => r.rowNumber],
                    ['Product Name', r => <strong>{r.name}</strong>],
                    ['Category', r => <Badge tone="slate">{r.category}</Badge>],
                    ['Brand', r => r.brand || '—'],
                    ['Barcode', r => r.barcode || <span className="muted">Optional</span>],
                    ['Cost', r => money(r.cost)],
                    ['Price', r => <strong>{money(r.price)}</strong>],
                    ['Stock Qty', r => <Badge tone="green">{r.qty}</Badge>],
                  ]}
                />
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={Upload} variant="primary" disabled={busy || !rows.length}>
            {busy ? 'Importing Stock…' : `Import ${rows.length || ''} Items & Stock`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
