import { useMemo, useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  ArrowUpDown,
  Building2,
  Download,
  Smartphone,
} from 'lucide-react';
import {
  Badge,
  Button,
  ProductArt,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { categories, downloadCsv, money, number } from '../../utils';

export function BranchStocksTab({
  ctx,
  items = [],
  query,
  setQuery,
  category,
  setCategory,
  onAdjust,
  onTransfer,
  onOpenBarcode,
  onOpenUnitsForBranch,
}) {
  const [healthFilter, setHealthFilter] = useState('all'); // 'all' | 'low' | 'zero' | 'healthy'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const branches = ctx.branches || [];
  const physicalItems = useMemo(
    () => items.filter(p => p.category !== 'Services'),
    [items]
  );

  // Per-branch summary KPIs across all physical products
  const branchTotals = useMemo(() => {
    return branches.map(b => {
      let units = 0;
      let value = 0;
      let lowCount = 0;
      let zeroCount = 0;

      for (const p of physicalItems) {
        const hit = (p.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(b.id));
        const q = hit ? Number(hit.qty || 0) : 0;
        units += q;
        value += q * Number(p.cost || 0);
        if (q === 0) zeroCount++;
        else if (q <= Number(p.reorder_level || 0)) lowCount++;
      }
      return { branch: b, units, value, lowCount, zeroCount };
    });
  }, [branches, physicalItems]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return physicalItems.filter(p => {
      if (category && p.category !== category) return false;
      if (q) {
        const hay = `${p.name} ${p.sku} ${p.barcode || ''} ${p.brand || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (healthFilter !== 'all') {
        const qtys = branches.map(b => {
          const hit = (p.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(b.id));
          return hit ? Number(hit.qty || 0) : 0;
        });
        const hasZero = qtys.some(v => v === 0);
        const hasLow = qtys.some((v, idx) => {
          void idx;
          return v > 0 && v <= Number(p.reorder_level || 0);
        });
        if (healthFilter === 'zero' && !hasZero) return false;
        if (healthFilter === 'low' && !hasLow && !hasZero) return false;
        if (healthFilter === 'healthy' && (hasZero || hasLow)) return false;
      }
      return true;
    });
  }, [physicalItems, category, query, healthFilter, branches]);

  useEffect(() => {
    setPage(1);
  }, [query, category, healthFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  const handleExportCsv = () => {
    const headers = [
      'Product',
      'SKU',
      'Barcode',
      'Category',
      'Reorder Level',
      ...branches.map(b => `${b.name} Qty`),
      'Total Qty',
      'Total Cost Value (LKR)',
    ];
    const rows = filteredRows.map(p => {
      const total = Number(p.total_qty ?? p.qty ?? 0);
      const val = ((total * Number(p.cost || 0)) / 100).toFixed(2);
      return [
        p.name,
        p.sku,
        p.barcode || '',
        p.category,
        p.reorder_level ?? 0,
        ...branches.map(b => {
          const hit = (p.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(b.id));
          return hit ? Number(hit.qty || 0) : 0;
        }),
        total,
        val,
      ];
    });
    downloadCsv('branch-stocks.csv', headers, rows);
  };

  return (
    <>
      {/* Per-branch summary cards */}
      {branches.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          {branchTotals.map(({ branch, units, value, lowCount, zeroCount }) => (
            <div
              key={branch.id}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={14} style={{ color: '#0d9488' }} />
                  {branch.name}
                </strong>
                <Badge tone={zeroCount > 0 ? 'amber' : 'mint'}>
                  {number(units)} units
                </Badge>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                <span>Value: <strong>{money(value)}</strong></span>
                <span style={{ color: zeroCount > 0 ? '#dc2626' : '#64748b' }}>
                  {lowCount} low · {zeroCount} out
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel-tools toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Filter products, SKU, or barcode across branches…"
        />
        <Select
          aria-label="Category"
          blank="All categories"
          value={category}
          onChange={e => setCategory(e.target.value)}
          options={categories.filter(c => c !== 'Services')}
        />
        <Select
          aria-label="Stock health"
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value)}
          options={[
            ['all', 'All Stock Levels'],
            ['low', 'Low or Out of Stock Anywhere'],
            ['zero', 'Out of Stock in Any Branch'],
            ['healthy', 'Healthy Everywhere'],
          ]}
        />
        <Button icon={Download} variant="outline" onClick={handleExportCsv} disabled={!filteredRows.length}>
          Export CSV
        </Button>
        <Button icon={ArrowUpDown} variant="primary" onClick={() => onAdjust(items)}>
          New Stock Adjustment
        </Button>
      </div>

      <Table
        rows={pagedRows}
        columns={[
          [
            'Product',
            r => (
              <div className="table-product">
                <ProductArt item={r} small />
                <span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>{r.name}</strong>
                    {Boolean(r.serialized) && (
                      <Badge tone="violet">Serialized</Badge>
                    )}
                  </div>
                  <small className="subtext mono">{r.sku} · Reorder: {r.reorder_level}</small>
                </span>
              </div>
            ),
          ],
          [
            'Barcode',
            r => (
              <span
                className="mono"
                style={{ cursor: 'pointer' }}
                title="Click to manage barcode"
                onClick={() => onOpenBarcode?.(r)}
              >
                {r.barcode ? (
                  r.barcode
                ) : (
                  <span className="badge-no-barcode" style={{ fontSize: 10 }}>
                    No Barcode
                  </span>
                )}
              </span>
            ),
          ],
          ...branches.map(b => [
            b.name,
            r => {
              const stockItem = (r.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(b.id));
              const qty = stockItem ? Number(stockItem.qty || 0) : 0;
              const toneClass =
                qty === 0 ? 'zero' : qty <= Number(r.reorder_level || 0) ? 'low' : 'ok';
              return (
                <div className="branch-matrix-cell">
                  <span className={`badge-stock ${toneClass}`}>{qty}</span>
                  {r.serialized ? (
                    <Button
                      size="small"
                      variant="link"
                      icon={Smartphone}
                      title={`View serialized units for ${r.name} at ${b.name}`}
                      onClick={() => onOpenUnitsForBranch?.(b.id, r.name)}
                    >
                      Units
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="link"
                      title={`Adjust stock for ${r.name} at ${b.name}`}
                      onClick={() => onAdjust(items, r, b.id)}
                    >
                      Adjust
                    </Button>
                  )}
                </div>
              );
            },
          ]),
          [
            'Total / Value',
            r => {
              const total = Number(r.total_qty ?? r.qty ?? 0);
              return (
                <div>
                  <strong>{number(total)}</strong>
                  {r.cost !== undefined && (
                    <div>
                      <small className="subtext">{money(total * Number(r.cost || 0))}</small>
                    </div>
                  )}
                </div>
              );
            },
          ],
          [
            'Transfer',
            r => {
              if (branches.length <= 1) return null;
              if (r.serialized) {
                return (
                  <Button
                    icon={Smartphone}
                    size="small"
                    variant="outline"
                    title="Transfer a serialized device from the Device Units tab"
                    onClick={() => onOpenUnitsForBranch?.(0, r.name)}
                  >
                    Transfer Unit
                  </Button>
                );
              }
              const bestBranch = [...(r.branch_stocks || [])].sort((a, b) => b.qty - a.qty)[0]?.branch_id;
              return (
                <Button
                  icon={ArrowRightLeft}
                  size="small"
                  variant="secondary"
                  title="Transfer stock to another branch"
                  onClick={() => onTransfer?.(r, bestBranch)}
                >
                  Transfer
                </Button>
              );
            },
          ],
        ]}
      />

      <div className="panel-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span>
          Showing <strong>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)}</strong> of <strong>{filteredRows.length}</strong> products across {branches.length} branch(es)
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
          >
            {[25, 50, 100].map(sz => (
              <option key={sz} value={sz}>{sz} / page</option>
            ))}
          </select>
          <Button size="small" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>
            Page {page} / {totalPages}
          </span>
          <Button size="small" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
