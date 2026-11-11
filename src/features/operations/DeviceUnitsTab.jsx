import { useMemo, useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Pencil,
  Plus,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import {
  Badge,
  Button,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { downloadCsv, money, options } from '../../utils';

const STATE_TONE = {
  Available: 'mint',
  Inspection: 'amber',
  'In Transit': 'blue',
  Sold: 'red',
};

export function DeviceUnitsTab({
  ctx,
  items = [],
  units = [],
  unitBranch,
  setUnitBranch,
  query,
  setQuery,
  onRefresh,
  onCreateSerializedProduct,
}) {
  const [stateFilter, setStateFilter] = useState('all'); // 'all' | 'Available' | 'Inspection' | 'In Transit' | 'Sold'
  const [gradeFilter, setGradeFilter] = useState('all'); // 'all' | 'New' | 'Used' | 'Refurbished'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const branches = ctx.branches || [];
  const serializedProducts = useMemo(
    () => items.filter(p => Boolean(p.serialized) && p.category !== 'Services'),
    [items]
  );

  // Summary counts across loaded units
  const summary = useMemo(() => {
    const counts = { total: units.length, Available: 0, Inspection: 0, 'In Transit': 0, Sold: 0 };
    for (const u of units) {
      if (counts[u.state] !== undefined) counts[u.state]++;
    }
    return counts;
  }, [units]);

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter(u => {
      if (stateFilter !== 'all' && u.state !== stateFilter) return false;
      if (gradeFilter !== 'all' && u.grade !== gradeFilter) return false;
      if (q) {
        const prodName = u.product_name || items.find(p => p.id === u.product_id)?.name || '';
        const sku = u.sku || items.find(p => p.id === u.product_id)?.sku || '';
        const hay = `${u.code} ${u.imei || ''} ${prodName} ${sku} ${u.grade} ${u.state} ${u.branch_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [units, stateFilter, gradeFilter, query, items]);

  useEffect(() => {
    setPage(1);
  }, [query, stateFilter, gradeFilter, unitBranch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredUnits.length / pageSize));
  const pagedUnits = useMemo(
    () => filteredUnits.slice((page - 1) * pageSize, page * pageSize),
    [filteredUnits, page, pageSize]
  );

  const openReceiveUnit = () => {
    if (!serializedProducts.length) {
      if (
        window.confirm(
          'No serialized products exist yet. Create a product with "Track by individual serial number" checked first. Open Add Product form now?'
        )
      ) {
        onCreateSerializedProduct?.();
      }
      return;
    }

    const defaultBranch = unitBranch > 0 ? unitBranch : (ctx.branch || branches[0]?.id || 1);
    ctx.setDialog({
      title: 'Receive Device Unit',
      description: 'Register an individual serialized phone or device unit into branch stock or inspection.',
      route: 'unit.receive',
      submit: 'Receive Unit',
      values: {
        branch: defaultBranch,
        product_id: String(serializedProducts[0].id),
        code: '',
        imei: '',
        grade: 'New',
        state: 'Available',
      },
      fields: [
        { name: 'branch', label: 'Branch', choices: options(branches) },
        {
          name: 'product_id',
          label: 'Serialized Product',
          choices: serializedProducts.map(p => [p.id, `${p.name} (${p.sku})`]),
        },
        {
          name: 'code',
          label: 'Unit Code (Leave blank to auto-generate UNIT-XXXXXX)',
          optional: true,
          placeholder: 'e.g. IPH15-001',
        },
        {
          name: 'imei',
          label: 'IMEI / Serial Number',
          optional: true,
          placeholder: '15-digit IMEI or serial',
        },
        { name: 'grade', label: 'Condition Grade', choices: ['New', 'Used', 'Refurbished'] },
        {
          name: 'state',
          label: 'Initial Status',
          choices: [
            ['Available', 'Available (Add +1 to Stock)'],
            ['Inspection', 'Inspection (Hold for QA Check)'],
          ],
        },
      ],
      onSuccess: res => {
        ctx.setNotice?.(`Received device unit ${res?.code || ''} (${res?.state || 'Saved'})`);
        onRefresh?.();
      },
    });
  };

  const openInspectUnit = r => {
    ctx.setDialog({
      title: 'Move Device to Inspection',
      description: `Unit ${r.code} (${r.product_name || 'Device'}) — removes 1 unit from sellable stock during QA.`,
      route: 'unit.inspect',
      submit: 'Move to Inspection',
      values: { id: r.id, branch: r.branch_id || unitBranch, reason: 'Quality check / repair hold' },
      fields: [
        { name: 'reason', label: 'Inspection Reason / Note', full: true },
      ],
      onSuccess: () => {
        ctx.setNotice?.(`Moved ${r.code} to Inspection.`);
        onRefresh?.();
      },
    });
  };

  const openReleaseUnit = r => {
    ctx.setDialog({
      title: 'Release Inspected Device to Stock',
      description: `Unit ${r.code} (${r.product_name || 'Device'}) — marks Available and adds +1 to sellable stock.`,
      route: 'unit.release',
      submit: 'Release to Stock',
      values: { id: r.id, branch: r.branch_id || unitBranch, reason: 'Passed inspection' },
      fields: [
        { name: 'reason', label: 'Inspection Outcome', full: true },
      ],
      onSuccess: () => {
        ctx.setNotice?.(`Released ${r.code} to Available stock.`);
        onRefresh?.();
      },
    });
  };

  const openEditUnit = r => {
    ctx.setDialog({
      title: `Edit Device Unit: ${r.code}`,
      route: 'unit.update',
      submit: 'Save Unit Details',
      values: { id: r.id, imei: r.imei || '', grade: r.grade || 'New' },
      fields: [
        { name: 'imei', label: 'IMEI / Serial Number', optional: true },
        { name: 'grade', label: 'Condition Grade', choices: ['New', 'Used', 'Refurbished'] },
      ],
      onSuccess: () => {
        ctx.setNotice?.(`Updated unit ${r.code}.`);
        onRefresh?.();
      },
    });
  };

  const openTransferUnit = r => {
    const dest = branches.find(b => Number(b.id) !== Number(r.branch_id))?.id || branches[0]?.id;
    ctx.setDialog({
      title: `Transfer Device Unit: ${r.code}`,
      description: `${r.product_name || 'Device'}${r.imei ? ` · IMEI: ${r.imei}` : ''}`,
      route: 'transfer.request',
      submit: 'Request Unit Transfer',
      values: {
        branch: r.branch_id,
        to_branch: dest,
        product_id: String(r.product_id),
        unit_id: r.id,
        qty: 1,
      },
      fields: [
        {
          name: 'to_branch',
          label: 'Destination Branch',
          choices: options(branches.filter(b => Number(b.id) !== Number(r.branch_id))),
        },
      ],
      onSuccess: () => {
        ctx.setNotice?.(`Requested branch transfer for unit ${r.code}.`);
        onRefresh?.();
      },
    });
  };

  const handleExportCsv = () => {
    const headers = ['Unit Code', 'Branch', 'Product', 'SKU', 'IMEI / Serial', 'Grade', 'Status', 'Sell Price (LKR)'];
    const rows = filteredUnits.map(u => {
      const prod = items.find(p => p.id === u.product_id);
      return [
        u.code,
        u.branch_name || branches.find(b => b.id === u.branch_id)?.name || '',
        u.product_name || prod?.name || '',
        u.sku || prod?.sku || '',
        u.imei || '',
        u.grade,
        u.state,
        ((Number(u.price ?? prod?.price ?? 0)) / 100).toFixed(2),
      ];
    });
    downloadCsv('device-units.csv', headers, rows);
  };

  const branchFilterOptions = [
    [0, 'All Branches'],
    ...options(branches),
  ];

  return (
    <>
      {/* Status KPI Filter Chips */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        {[
          ['all', 'Total Units', summary.total, 'blue'],
          ['Available', 'Available', summary.Available, 'mint'],
          ['Inspection', 'Inspection', summary.Inspection, 'amber'],
          ['In Transit', 'In Transit', summary['In Transit'], 'blue'],
          ['Sold', 'Sold', summary.Sold, 'red'],
        ].map(([key, label, val, tone]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStateFilter(key)}
            style={{
              textAlign: 'left',
              background: stateFilter === key ? '#f0fdfa' : '#f8fafc',
              border: `1px solid ${stateFilter === key ? '#0d9488' : '#cbd5e1'}`,
              borderRadius: '8px',
              padding: '9px 12px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{label}</span>
            <Badge tone={tone}>{val}</Badge>
          </button>
        ))}
      </div>

      <div className="panel-tools toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search unit code, IMEI, product name, or SKU…"
        />
        <Select
          aria-label="Device branch"
          value={unitBranch}
          onChange={e => setUnitBranch(Number(e.target.value))}
          options={branchFilterOptions}
        />
        <Select
          aria-label="Unit Status"
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          options={[
            ['all', 'All Statuses'],
            ['Available', 'Available'],
            ['Inspection', 'Inspection'],
            ['In Transit', 'In Transit'],
            ['Sold', 'Sold'],
          ]}
        />
        <Select
          aria-label="Unit Grade"
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
          options={[
            ['all', 'All Grades'],
            ['New', 'New'],
            ['Used', 'Used'],
            ['Refurbished', 'Refurbished'],
          ]}
        />
        <Button icon={Download} variant="outline" onClick={handleExportCsv} disabled={!filteredUnits.length}>
          Export CSV
        </Button>
        <Button icon={Plus} variant="primary" onClick={openReceiveUnit}>
          Receive Device
        </Button>
      </div>

      {!serializedProducts.length && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            fontSize: '12.5px',
            color: '#92400e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>
            No serialized products found. To track individual IMEI / unit serials, check <strong>"Track by individual serial number"</strong> when adding a product.
          </span>
          <Button size="small" variant="outline" onClick={onCreateSerializedProduct}>
            + Add Serialized Product
          </Button>
        </div>
      )}

      <Table
        rows={pagedUnits}
        columns={[
          ['Unit Code', r => <strong className="mono">{r.code}</strong>],
          ['Branch', r => r.branch_name || branches.find(b => b.id === r.branch_id)?.name || '—'],
          [
            'Product',
            r => {
              const prod = items.find(p => p.id === r.product_id);
              const name = r.product_name || prod?.name || '—';
              const sku = r.sku || prod?.sku || '';
              return (
                <div>
                  <strong>{name}</strong>
                  {sku ? (
                    <div>
                      <small className="subtext mono">{sku}</small>
                    </div>
                  ) : null}
                </div>
              );
            },
          ],
          ['IMEI / Serial', r => <span className="mono">{r.imei || '—'}</span>],
          ['Grade', r => <Badge tone={r.grade === 'New' ? 'blue' : 'amber'}>{r.grade}</Badge>],
          ['Sell Price', r => money(r.price ?? items.find(p => p.id === r.product_id)?.price ?? 0)],
          ['Status', r => <Badge tone={STATE_TONE[r.state] || 'blue'}>{r.state}</Badge>],
          [
            'Actions',
            r => (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {r.state === 'Inspection' && (
                  <Button
                    size="small"
                    variant="secondary"
                    icon={CheckCircle2}
                    onClick={() => openReleaseUnit(r)}
                  >
                    Release
                  </Button>
                )}
                {r.state === 'Available' && (
                  <>
                    <Button
                      size="small"
                      variant="outline"
                      icon={ShieldAlert}
                      title="Move to QA inspection"
                      onClick={() => openInspectUnit(r)}
                    >
                      Inspect
                    </Button>
                    {branches.length > 1 && (
                      <Button
                        size="small"
                        variant="outline"
                        icon={ArrowRightLeft}
                        title="Request transfer to another branch"
                        onClick={() => openTransferUnit(r)}
                      >
                        Transfer
                      </Button>
                    )}
                  </>
                )}
                {r.state !== 'Sold' && (
                  <Button
                    size="small"
                    variant="outline"
                    icon={Pencil}
                    className="icon-only"
                    title="Edit IMEI / Condition Grade"
                    onClick={() => openEditUnit(r)}
                  />
                )}
              </div>
            ),
          ],
        ]}
      />

      <div className="panel-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span>
          Showing <strong>{filteredUnits.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredUnits.length)}</strong> of <strong>{filteredUnits.length}</strong> device units
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
