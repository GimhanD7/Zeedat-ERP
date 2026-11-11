import { useMemo, useState, useEffect } from 'react';
import { ArrowUpDown, Download } from 'lucide-react';
import {
  Badge,
  Button,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { downloadCsv, number, today } from '../../utils';

function classifyMovement(m) {
  const ref = String(m.reference || '').toUpperCase();
  const kind = String(m.kind || '').toLowerCase();
  if (ref.startsWith('INV')) return ['Sale', 'red'];
  if (ref.startsWith('PO')) return ['Purchase', 'mint'];
  if (ref.startsWith('ADJ') || kind.includes('stocktake') || kind.includes('initial stock')) return ['Adjustment', 'blue'];
  if (ref.startsWith('ST')) return ['Transfer', 'violet'];
  if (ref.startsWith('RET')) return ['Return', 'amber'];
  if (ref.startsWith('UNIT') || kind.includes('device unit') || kind.includes('inspection')) return ['Device Unit', 'blue'];
  return ['Movement', 'blue'];
}

function addDaysIso(baseIso, deltaDays) {
  const d = new Date(baseIso + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function StockHistoryTab({
  ctx,
  movements = [],
  selectedBranch,
  setSelectedBranch,
  query,
  setQuery,
  onNewAdjustment,
}) {
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'Sale' | 'Purchase' | 'Adjustment' | 'Transfer' | 'Return' | 'Device Unit'
  const [dirFilter, setDirFilter] = useState('all'); // 'all' | 'in' | 'out'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const branchChoices = useMemo(
    () => [[0, 'All Branches'], ...(ctx.branches || []).map(b => [b.id, b.name])],
    [ctx.branches]
  );

  const filteredMovements = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements.filter(m => {
      const signed = Number(m.qty || 0);
      if (dirFilter === 'in' && signed <= 0) return false;
      if (dirFilter === 'out' && signed >= 0) return false;

      if (sourceFilter !== 'all') {
        const [source] = classifyMovement(m);
        if (source !== sourceFilter) return false;
      }

      const dayStr = m.created_at ? String(m.created_at).slice(0, 10) : '';
      if (fromDate && dayStr && dayStr < fromDate) return false;
      if (toDate && dayStr && dayStr > toDate) return false;

      if (q) {
        const hay = `${m.product_name} ${m.sku} ${m.barcode || ''} ${m.kind} ${m.reference} ${m.user_name} ${m.branch_name} ${m.category || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movements, dirFilter, sourceFilter, fromDate, toDate, query]);

  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const m of filteredMovements) {
      const q = Number(m.qty || 0);
      if (q > 0) totalIn += q;
      else if (q < 0) totalOut += Math.abs(q);
    }
    return { count: filteredMovements.length, totalIn, totalOut, net: totalIn - totalOut };
  }, [filteredMovements]);

  useEffect(() => {
    setPage(1);
  }, [query, sourceFilter, dirFilter, fromDate, toDate, selectedBranch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredMovements.length / pageSize));
  const pagedMovements = useMemo(
    () => filteredMovements.slice((page - 1) * pageSize, page * pageSize),
    [filteredMovements, page, pageSize]
  );

  const applyQuickDate = preset => {
    const cur = today();
    if (preset === 'today') {
      setFromDate(cur);
      setToDate(cur);
    } else if (preset === '7d') {
      setFromDate(addDaysIso(cur, -6));
      setToDate(cur);
    } else if (preset === '30d') {
      setFromDate(addDaysIso(cur, -29));
      setToDate(cur);
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const handleExportCsv = () => {
    const headers = ['Date & Time', 'Branch', 'Product', 'SKU', 'Type', 'Qty Change', 'Reason / Details', 'Reference', 'Staff'];
    const rows = filteredMovements.map(m => {
      const [source] = classifyMovement(m);
      return [
        m.created_at || '',
        m.branch_name || '',
        m.product_name || '',
        m.sku || '',
        source,
        m.qty,
        m.kind || '',
        m.reference || '',
        m.user_name || '',
      ];
    });
    downloadCsv('stock-history.csv', headers, rows);
  };

  return (
    <>
      {/* Summary Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '9px 12px' }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>Movements Shown</div>
          <strong style={{ fontSize: '16px', color: '#0f172a' }}>{number(stats.count)}</strong>
        </div>
        <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', padding: '9px 12px' }}>
          <div style={{ fontSize: '11.5px', color: '#115e59' }}>Total Stock In</div>
          <strong style={{ fontSize: '16px', color: '#0d9488' }}>+{number(stats.totalIn)}</strong>
        </div>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '9px 12px' }}>
          <div style={{ fontSize: '11.5px', color: '#991b1b' }}>Total Stock Out</div>
          <strong style={{ fontSize: '16px', color: '#dc2626' }}>-{number(stats.totalOut)}</strong>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '9px 12px' }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>Net Change</div>
          <strong style={{ fontSize: '16px', color: stats.net >= 0 ? '#0d9488' : '#dc2626' }}>
            {stats.net >= 0 ? `+${number(stats.net)}` : number(stats.net)}
          </strong>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="panel-tools toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search product, SKU, reason, reference, or staff…"
        />
        <Select
          aria-label="Branch"
          value={selectedBranch}
          onChange={e => setSelectedBranch(Number(e.target.value))}
          options={branchChoices}
        />
        <Select
          aria-label="Operation source"
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          options={[
            ['all', 'All Operations'],
            ['Adjustment', 'Adjustments / Stocktake'],
            ['Sale', 'Sales (INV-)'],
            ['Purchase', 'Purchases (PO-)'],
            ['Transfer', 'Transfers (ST-)'],
            ['Return', 'Returns (RET-)'],
            ['Device Unit', 'Device Units'],
          ]}
        />
        <Select
          aria-label="Direction"
          value={dirFilter}
          onChange={e => setDirFilter(e.target.value)}
          options={[
            ['all', 'In & Out'],
            ['in', 'Stock In (+)'],
            ['out', 'Stock Out (-)'],
          ]}
        />
        <Button icon={Download} variant="outline" onClick={handleExportCsv} disabled={!filteredMovements.length}>
          Export CSV
        </Button>
        <Button icon={ArrowUpDown} variant="primary" onClick={onNewAdjustment}>
          New Adjustment
        </Button>
      </div>

      {/* Date Range Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '10px',
          fontSize: '12px',
          color: '#475569',
        }}
      >
        <span>Date range:</span>
        {[
          ['all', 'All Time'],
          ['today', 'Today'],
          ['7d', 'Last 7 Days'],
          ['30d', 'Last 30 Days'],
        ].map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            className="zk-cb-chip"
            onClick={() => applyQuickDate(k)}
          >
            {lbl}
          </button>
        ))}
        <input
          type="date"
          aria-label="From date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
        />
        <span>to</span>
        <input
          type="date"
          aria-label="To date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
        />
      </div>

      <Table
        rows={pagedMovements}
        columns={[
          [
            'Date & Time',
            r =>
              r.created_at
                ? new Date(String(r.created_at).replace(' ', 'T')).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—',
          ],
          ['Branch', 'branch_name'],
          [
            'Product',
            r => (
              <div>
                <strong>{r.product_name}</strong>
                <div>
                  <small className="subtext mono">{r.sku}</small>
                </div>
              </div>
            ),
          ],
          [
            'Type',
            r => {
              const [label, tone] = classifyMovement(r);
              return <Badge tone={tone}>{label}</Badge>;
            },
          ],
          [
            'Change',
            r => {
              const q = Number(r.qty);
              return (
                <Badge tone={q > 0 ? 'mint' : q < 0 ? 'red' : 'blue'}>
                  {q > 0 ? `+${q}` : q}
                </Badge>
              );
            },
          ],
          ['Reason / Details', 'kind'],
          ['Reference', r => <span className="mono">{r.reference || '—'}</span>],
          ['Staff', 'user_name'],
        ]}
      />

      <div className="panel-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span>
          Showing <strong>{filteredMovements.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredMovements.length)}</strong> of <strong>{filteredMovements.length}</strong> stock movements
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
