import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpDown,
  Barcode,
  Box,
  Building2,
  DollarSign,
  History,
  Layers3,
  Lock,
  Package,
  Pencil,
  Plus,
  Printer,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  ProductArt,
  SearchBox,
  Select,
  Stats,
  Table,
} from '../../components/common';
import { DataView } from '../../components/feedback';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { BatchBarcodeModal } from './BatchBarcodeModal';
import { StockAdjustModal } from './StockAdjustModal';
import { BranchStocksTab } from './BranchStocksTab';
import { DeviceUnitsTab } from './DeviceUnitsTab';
import { StockHistoryTab } from './StockHistoryTab';
import {
  categories,
  cents,
  money,
  options,
  rupees,
  stockStatus,
} from '../../utils';

const actionBranch = ctx => ctx.branch || ctx.branches[0]?.id;
const branchField = ctx => ({ name: 'branch', label: 'Branch', choices: options(ctx.branches) });
const itemFilter = (item, q, fields) =>
  fields.some(key =>
    String(item[key] || '')
      .toLowerCase()
      .includes(q.trim().toLowerCase())
  );
const stateTone = status =>
  ({ 'Low Stock': 'amber', 'Out of Stock': 'red', 'In Stock': 'green' })[status];

const shortBranchCode = name => {
  const raw = String(name || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('battaramulla') && lower.includes('mobile')) return 'BM';
  if (lower.includes('battaramulla') && lower.includes('pc')) return 'BP';
  if (lower === 'malabe' || lower.startsWith('malabe')) return 'M';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return raw ? raw[0].toUpperCase() : '—';
};

const formatCommission = item => {
  const val = Number(item?.commission_value || 0);
  if (val <= 0) return null;
  if (item?.commission_type === 'percent') {
    const pct = val / 100;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
  }
  return money(val);
};

export function Inventory({ ctx }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [filter, setFilter] = useState(ctx.intent === 'low' ? 'Reorder alerts' : '');
  const [barcodeFilter, setBarcodeFilter] = useState(''); // '', 'with-barcode', 'no-barcode'
  const [tab, setTab] = useState('Products'); // Products, Branch Stocks, Device Units, Stock History
  const [selectedBranch, setSelectedBranch] = useState(ctx.branch || 0); // 0 = All Branches
  const [unitBranch, setUnitBranch] = useState(ctx.branch || 0);
  const [labelProduct, setLabelProduct] = useState(null);
  const [batchModal, setBatchModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(null); // null | { product, branch }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Sync with global branch changes if active
  useEffect(() => {
    if (ctx.branch) {
      setSelectedBranch(ctx.branch);
    }
  }, [ctx.branch]);

  const state = useData(ctx, {
    items: ['products', { branch: selectedBranch }],
    units: ['units', { branch: unitBranch }],
    movements: ['stock.movements', { branch: selectedBranch }],
  });

  useEffect(() => {
    if (ctx.intent === 'low') {
      setFilter('Reorder alerts');
      ctx.clearIntent();
    }
  }, [ctx.intent]);

  const getProductBranchStock = (p, branchId) => {
    if (p.category === 'Services') return null;
    if (branchId === 0) return p.total_qty ?? p.qty ?? 0;
    const found = (p.branch_stocks || []).find(b => b.branch_id === branchId);
    return found ? found.qty : 0;
  };

  const getProductBranchStatus = (p, branchId) => {
    if (p.category === 'Services') return 'In Stock';
    const q = getProductBranchStock(p, branchId);
    if (q === null) return 'In Stock';
    if (q <= 0) return 'Out of Stock';
    if (q <= p.reorder_level) return 'Low Stock';
    return 'In Stock';
  };

  const form = (item = null, defaults = null) => {
    const isNew = !item;
    const activeBranchId = selectedBranch || actionBranch(ctx);
    const activeBranchName = ctx.branches.find(b => b.id === activeBranchId)?.name || 'Active Branch';

    ctx.setDialog({
      title: item ? 'Edit product / service' : 'Add product / service',
      description: item
        ? `Item Code: ${item.sku} (auto-generated)`
        : 'Item Code is auto-generated automatically (ZEE00001 format).',
      route: 'product.save',
      submit: item ? 'Save changes' : 'Create item',
      wide: true,
      values: {
        ...item,
        branch: activeBranchId,
        category: defaults?.category || item?.category || 'Accessories',
        cost: rupees(item?.cost),
        price: rupees(item?.price),
        commission_type: item?.commission_type || 'fixed',
        commission_input:
          item && Number(item.commission_value) > 0
            ? String(rupees(item.commission_value))
            : (defaults?.category || item?.category) === 'Services'
              ? ''
              : '0',
        reorder_level: item?.reorder_level || 0,
        serialized: Boolean(defaults?.serialized ?? item?.serialized ?? false),
        auto_barcode: false,
        initial_stock: 0,
        image_data: '',
        remove_image: false,
      },
      fields: values => [
        branchField(ctx),
        ...(isNew
          ? []
          : [
              {
                name: 'sku',
                label: 'Item Code (Auto-generated)',
                optional: true,
                readOnly: true,
              },
            ]),
        { name: 'name', label: values.category === 'Services' ? 'Service name' : 'Product name' },
        { name: 'category', label: 'Category', choices: categories },
        ...(values.category !== 'Services'
          ? [
              {
                name: 'barcode',
                label: 'Barcode (Optional — leave blank if item has no barcode)',
                optional: true,
                placeholder: 'Scan, enter or leave empty for non-barcoded items',
              },
              ...(isNew
                ? [
                    {
                      name: 'auto_barcode',
                      label: 'Auto-generate 12-digit barcode if blank',
                      type: 'checkbox',
                    },
                  ]
                : []),
            ]
          : []),
        { name: 'brand', label: 'Brand', optional: true },
        {
          name: 'cost',
          label: values.category === 'Services' ? 'Cost (LKR, Optional)' : 'Cost (LKR)',
          type: 'money',
          optional: values.category === 'Services',
        },
        { name: 'price', label: 'Selling price (LKR)', type: 'money' },
        {
          name: 'commission_type',
          label: 'Commission Type',
          choices: [
            ['fixed', 'Fixed Amount (LKR)'],
            ['percent', 'Percentage (%)'],
          ],
        },
        {
          name: 'commission_input',
          label:
            values.category === 'Services'
              ? values.commission_type === 'percent'
                ? 'Service Commission (%) *'
                : 'Service Commission (LKR) *'
              : values.commission_type === 'percent'
                ? 'Product Commission (%, Optional)'
                : 'Product Commission (LKR, Optional)',
          type: 'money',
          min: 0,
          max: values.commission_type === 'percent' ? 100 : undefined,
          optional: values.category !== 'Services',
          placeholder: values.commission_type === 'percent' ? 'e.g. 10' : 'e.g. 500.00',
        },
        ...(values.category !== 'Services'
          ? [{ name: 'reorder_level', label: 'Reorder level', type: 'number', min: 0 }]
          : []),
        ...(isNew && values.category !== 'Services'
          ? [
              {
                name: 'initial_stock',
                label: `Initial stock for ${activeBranchName}`,
                type: 'number',
                min: 0,
                optional: true,
              },
            ]
          : []),
        ...(isNew && values.category !== 'Services'
          ? [{ name: 'serialized', label: 'Track by individual serial number', type: 'checkbox' }]
          : []),
        {
          name: 'image_data',
          label: 'Product Photo (Online Only · Max 10 KB)',
          type: 'image',
          optional: true,
          full: true,
        },
      ],
      transform: v => {
        const barcodeVal = (v.barcode || '').trim();
        if (barcodeVal && v.category !== 'Services') {
          const duplicate = items.find(
            p =>
              p.id !== item?.id &&
              p.barcode &&
              p.barcode.trim().toLowerCase() === barcodeVal.toLowerCase()
          );
          if (duplicate) {
            throw new Error(
              `Barcode '${barcodeVal}' is already assigned to '${duplicate.name}' (${duplicate.sku}). One barcode can only belong to one product.`
            );
          }
        }
        const commType = v.commission_type === 'percent' ? 'percent' : 'fixed';
        const commValue = cents(v.commission_input || 0);
        if (v.category === 'Services' && commValue <= 0) {
          throw new Error('Please enter a commission greater than 0 for Services.');
        }
        if (commType === 'percent' && commValue > 10000) {
          throw new Error('Percentage commission cannot exceed 100%.');
        }
        return {
          ...v,
          cost: cents(v.cost || 0),
          price: cents(v.price),
          commission_type: commType,
          commission_value: commValue,
          image_data: v.image_data || undefined,
          remove_image: Boolean(v.remove_image),
          initial_stock: parseInt(v.initial_stock, 10) || 0,
          barcode: v.category === 'Services' ? '' : barcodeVal,
        };
      },
    });
  };

  const handleBulkGenerateBarcodes = async () => {
    if (!window.confirm('Auto-generate unique 12-digit barcodes for all items that currently have no barcode?')) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await ctx.mutate('barcode.bulk', {});
      ctx.setNotice(`Barcodes generated for ${res.updated || 0} products`);
    } catch (e) {
      alert(e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const adjust = (_items, preselectedProduct = null, preselectedBranch = null) =>
    setAdjustModal({
      product: preselectedProduct,
      branch: preselectedBranch || (selectedBranch || actionBranch(ctx)),
    });

  const transfer = (product, fromBranch = null) => {
    const src = fromBranch || actionBranch(ctx);
    const dest = ctx.branches.find(b => Number(b.id) !== Number(src))?.id || src;
    ctx.setDialog({
      title: 'Transfer stock between branches',
      description: `${product.name} (${product.sku})`,
      route: 'transfer.request',
      values: {
        branch: src,
        to_branch: dest,
        product_id: String(product.id),
        qty: 1,
      },
      fields: [
        {
          name: 'branch',
          label: 'Source branch',
          choices: options(ctx.branches),
        },
        {
          name: 'to_branch',
          label: 'Destination branch',
          choices: options(ctx.branches),
        },
        {
          name: 'qty',
          label: 'Quantity to transfer',
          type: 'number',
          min: 1,
        },
      ],
      onSuccess: () => {
        ctx.setNotice?.(`Stock transfer requested for ${product.name}.`);
        state.refresh();
      },
    });
  };

  return (
    <DataView state={state}>
      {({ items, units, movements = [] }) => {
        const physicalItems = items.filter(p => p.category !== 'Services');
        const withBarcodeCount = physicalItems.filter(p => Boolean(p.barcode)).length;
        const internalZdCount = physicalItems.filter(p =>
          String(p.barcode || '').toUpperCase().startsWith('ZD')
        ).length;
        const externalBarcodeCount = withBarcodeCount - internalZdCount;
        const noBarcodeCount = physicalItems.length - withBarcodeCount;

        const low = items.filter(
          p => p.category !== 'Services' && getProductBranchStatus(p, selectedBranch) === 'Low Stock'
        ).length;
        const out = items.filter(
          p => p.category !== 'Services' && getProductBranchStatus(p, selectedBranch) === 'Out of Stock'
        ).length;
        const inStockCount = items.filter(
          p => p.category === 'Services' || (getProductBranchStock(p, selectedBranch) ?? 0) > 0
        ).length;

        const totalStockValue = items.reduce((sum, p) => {
          const qty = getProductBranchStock(p, selectedBranch) || 0;
          return sum + qty * p.cost;
        }, 0);

        const matching = items.filter(p => {
          const status = getProductBranchStatus(p, selectedBranch);
          const qty = getProductBranchStock(p, selectedBranch) ?? 0;
          const isInternalZd = String(p.barcode || '').toUpperCase().startsWith('ZD');
          const matchesBarcode =
            !barcodeFilter ||
            (barcodeFilter === 'internal-zd'
              ? isInternalZd
              : barcodeFilter === 'external'
              ? Boolean(p.barcode) && !isInternalZd
              : barcodeFilter === 'with-barcode'
              ? Boolean(p.barcode)
              : !p.barcode && p.category !== 'Services');

          return (
            matchesBarcode &&
            (!category || category === p.category) &&
            (!brand || brand === p.brand) &&
            (!filter ||
              filter === status ||
              (filter === 'Reorder alerts' && p.category !== 'Services' && qty <= p.reorder_level)) &&
            itemFilter(p, query, ['name', 'sku', 'barcode', 'brand'])
          );
        });

        const branchChoices = [
          { id: 0, name: 'All Branches (Combined)' },
          ...ctx.branches,
        ];

        return (
          <>
            <Heading
              title="Products & Inventory"
              description="Manage your catalog, branch-wise stocks, barcodes, pricing and device units."
            >
              <Button icon={Barcode} onClick={() => ctx.navigate('barcodes')}>
                Barcode
              </Button>
              <Button icon={ArrowUpDown} onClick={() => adjust(items)}>
                Adjust stock
              </Button>
              <Button icon={Plus} variant="primary" onClick={() => form()}>
                Add product / service
              </Button>
            </Heading>

            <Stats
              items={[
                {
                  icon: Package,
                  label: 'Total Products',
                  value: items.length,
                  note: `${withBarcodeCount} with barcode, ${noBarcodeCount} without`,
                },
                {
                  icon: Layers3,
                  label: 'In Stock',
                  value: inStockCount,
                  note: selectedBranch ? 'Available in branch' : 'Available in any branch',
                  tone: 'mint',
                },
                {
                  icon: AlertTriangle,
                  label: 'Low Stock',
                  value: low,
                  note: 'At or below reorder level',
                  tone: 'amber',
                },
                {
                  icon: Box,
                  label: 'Out of Stock',
                  value: out,
                  note: selectedBranch ? 'No stock in branch' : 'No stock in system',
                  tone: 'red',
                },
                {
                  icon: DollarSign,
                  label: 'Stock Value (Cost)',
                  value: money(totalStockValue),
                  note: selectedBranch
                    ? ctx.branches.find(b => b.id === selectedBranch)?.name || 'Branch'
                    : 'All branches combined',
                  tone: 'violet',
                },
              ]}
            />

            <Panel
              title={
                tab === 'Products'
                  ? 'Product Catalog'
                  : tab === 'Branch Stocks'
                    ? 'Branch-wise Stocks Matrix'
                    : tab === 'Device Units'
                      ? 'Serialized Devices'
                      : 'Stock Adjustment & Movement History'
              }
              icon={
                tab === 'Products'
                  ? Package
                  : tab === 'Branch Stocks'
                    ? Building2
                    : tab === 'Device Units'
                      ? Smartphone
                      : History
              }
              action={
                <FilterTabs
                  choices={['Products', 'Branch Stocks', 'Device Units', 'Stock History']}
                  value={tab}
                  onChange={v => {
                    setTab(v);
                    setQuery('');
                  }}
                />
              }
            >
              {tab === 'Products' ? (
                <>
                  <div className="panel-tools toolbar">
                    <SearchBox
                      value={query}
                      onChange={setQuery}
                      placeholder="Search by SKU, product or barcode…"
                    />

                    {/* Branch filter for inventory view */}
                    <Select
                      aria-label="Stock Branch"
                      value={selectedBranch}
                      onChange={e => setSelectedBranch(Number(e.target.value))}
                      options={branchChoices.map(b => [b.id, b.name])}
                    />

                    {/* Barcode status filter */}
                    <Select
                      aria-label="Barcode status"
                      blank="All items (With & Without Barcode)"
                      value={barcodeFilter}
                      onChange={e => setBarcodeFilter(e.target.value)}
                      options={[
                        ['internal-zd', `Internal Barcodes (ZD) (${internalZdCount})`],
                        ['external', `Manufacturer / Other Barcodes (${externalBarcodeCount})`],
                        ['with-barcode', `All With Barcode (${withBarcodeCount})`],
                        ['no-barcode', `No Barcode Only (${noBarcodeCount})`],
                      ]}
                    />

                    <Select
                      aria-label="Category"
                      blank="All categories"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      options={categories}
                    />
                    <Select
                      aria-label="Brand"
                      blank="All brands"
                      value={brand}
                      onChange={e => setBrand(e.target.value)}
                      options={[...new Set(items.map(p => p.brand).filter(Boolean))].sort()}
                    />
                    <Select
                      aria-label="Stock status"
                      blank="All stock statuses"
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      options={['In Stock', 'Low Stock', 'Out of Stock', 'Reorder alerts']}
                    />
                    <Button
                      variant="link"
                      onClick={() => {
                        setQuery('');
                        setBrand('');
                        setFilter('');
                        setBarcodeFilter('');
                        setCategory('');
                        setSelectedBranch(0);
                      }}
                    >
                      Clear filters
                    </Button>

                    {barcodeFilter === 'no-barcode' && noBarcodeCount > 0 && (
                      <Button
                        icon={Sparkles}
                        variant="primary"
                        onClick={() => setBatchModal(true)}
                      >
                        Generate & Print Barcodes ({noBarcodeCount})
                      </Button>
                    )}
                  </div>

                  <Table
                    rows={matching}
                    columns={[
                      [
                        'Product',
                        r => (
                          <div className="table-product">
                            <ProductArt item={r} small />
                            <span>
                              <strong>{r.name}</strong>
                              <small className="subtext">
                                {r.brand ? `${r.brand} • ` : ''}
                                {r.category}
                                <span className="mono" style={{ marginLeft: 6, opacity: 0.78 }}>
                                  #{r.sku}
                                </span>
                              </small>
                            </span>
                          </div>
                        ),
                      ],
                      [
                        'Barcode',
                        r => {
                          if (r.category === 'Services') {
                            return <span className="subtext mono" title="Services do not have physical barcodes">—</span>;
                          }
                          if (r.barcode) {
                            const isZd = String(r.barcode).toUpperCase().startsWith('ZD');
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="barcode-pill mono"
                                  style={
                                    isZd
                                      ? {
                                          background: '#f0fdfa',
                                          color: '#0f766e',
                                          borderColor: '#99f6e4',
                                        }
                                      : undefined
                                  }
                                  title={isZd ? 'Internal ZD Barcode · Click to view & print' : 'Click to view & print barcode labels'}
                                  onClick={() => setLabelProduct(r)}
                                >
                                  <Barcode size={13} />
                                  <span>{r.barcode}</span>
                                </button>
                                {isZd ? (
                                  <Badge tone="mint">Internal</Badge>
                                ) : (
                                  <Badge tone="blue">Manufacturer</Badge>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                className="badge-no-barcode"
                                title="Physical item without barcode. You can sell using SKU/Name or add a barcode."
                              >
                                No Barcode
                              </span>
                              <Button
                                icon={Sparkles}
                                size="small"
                                variant="secondary"
                                title="Assign or generate barcode"
                                onClick={() => setLabelProduct(r)}
                              >
                                + Barcode
                              </Button>
                            </div>
                          );
                        },
                      ],
                      ['Category', r => <Badge tone="blue">{r.category}</Badge>],
                      [
                        'Stock',
                        r => {
                          if (r.category === 'Services') return '—';
                          const branchQty = getProductBranchStock(r, selectedBranch);

                          return (
                            <div>
                              <div>
                                <strong>{branchQty}</strong>
                                {selectedBranch > 0 && (
                                  <small className="subtext" style={{ marginLeft: 6 }}>
                                    (Total: {r.total_qty ?? r.qty})
                                  </small>
                                )}
                              </div>
                              {/* If showing all branches, show breakdown */}
                              {selectedBranch === 0 && r.branch_stocks?.length > 0 && (
                                <div className="branch-stock-pills">
                                  {r.branch_stocks.map(bs => (
                                    <span
                                      key={bs.branch_id}
                                      className={`branch-pill ${
                                        bs.qty === 0
                                          ? 'zero'
                                          : bs.qty <= r.reorder_level
                                            ? 'low'
                                            : 'ok'
                                      }`}
                                      title={`${bs.branch_name}: ${bs.qty} in stock`}
                                    >
                                      <span className="branch-name">{shortBranchCode(bs.branch_name)}:</span>{' '}
                                      <strong>{bs.qty}</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        },
                      ],
                      ['Reorder level', 'reorder_level'],
                      ['Buy price', r => money(r.cost)],
                      ['Sell price', r => money(r.price)],
                      [
                        'Commission',
                        r => {
                          const label = formatCommission(r);
                          return label ? (
                            <Badge tone={r.category === 'Services' ? 'mint' : 'blue'}>{label}</Badge>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          );
                        },
                      ],
                      [
                        'Status',
                        r => {
                          const st = getProductBranchStatus(r, selectedBranch);
                          return <Badge tone={stateTone(st)}>{st}</Badge>;
                        },
                      ],
                      [
                        'Actions',
                        r => (
                          <div style={{ display: 'flex', gap: 4 }}>
                            {!r.serialized && r.category !== 'Services' && (
                              <Button
                                icon={ArrowUpDown}
                                className="icon-only"
                                title={'Adjust stock for ' + r.name}
                                onClick={() =>
                                  adjust(items, r, selectedBranch || actionBranch(ctx))
                                }
                              />
                            )}
                            {r.category !== 'Services' && (
                              <Button
                                icon={Printer}
                                className="icon-only"
                                title={'Print barcode label for ' + r.name}
                                onClick={() => setLabelProduct(r)}
                              />
                            )}
                            <Button
                              icon={Pencil}
                              className="icon-only"
                              aria-label={'Edit ' + r.name}
                              onClick={() => form(r)}
                            />
                            <Button
                              icon={Trash2}
                              className="icon-only"
                              style={{ color: '#dc2626', borderColor: '#fecaca' }}
                              aria-label={'Delete ' + r.name}
                              title={'Delete ' + r.name + ' (Requires PIN)'}
                              onClick={() => setDeleteTarget(r)}
                            />
                          </div>
                        ),
                      ],
                    ]}
                  />
                  <div className="panel-foot">
                    Showing {matching.length} of {items.length} products
                  </div>
                </>
              ) : tab === 'Branch Stocks' ? (
                <BranchStocksTab
                  ctx={ctx}
                  items={items}
                  query={query}
                  setQuery={setQuery}
                  category={category}
                  setCategory={setCategory}
                  onAdjust={adjust}
                  onTransfer={transfer}
                  onOpenBarcode={setLabelProduct}
                  onOpenUnitsForBranch={(branchId, productName) => {
                    setUnitBranch(branchId);
                    setTab('Device Units');
                    setQuery(productName || '');
                  }}
                />
              ) : tab === 'Device Units' ? (
                <DeviceUnitsTab
                  ctx={ctx}
                  items={items}
                  units={units}
                  unitBranch={unitBranch}
                  setUnitBranch={setUnitBranch}
                  query={query}
                  setQuery={setQuery}
                  onRefresh={state.refresh}
                  onCreateSerializedProduct={() => form(null, { category: 'Phones', serialized: true })}
                />
              ) : (
                <StockHistoryTab
                  ctx={ctx}
                  movements={movements}
                  selectedBranch={selectedBranch}
                  setSelectedBranch={setSelectedBranch}
                  query={query}
                  setQuery={setQuery}
                  onNewAdjustment={() => adjust(items)}
                />
              )}
            </Panel>

            {/* Stock Adjustment & Bulk Stocktake Modal */}
            {adjustModal && (
              <StockAdjustModal
                ctx={ctx}
                items={items}
                preselectedProduct={adjustModal.product}
                preselectedBranch={adjustModal.branch}
                onClose={() => setAdjustModal(null)}
                onSuccess={() => {
                  setAdjustModal(null);
                  state.refresh();
                }}
              />
            )}

            {/* Barcode & Label Print Modal */}
            {labelProduct && (
              <BarcodeLabelModal
                product={labelProduct}
                allProducts={items}
                shopName={ctx.settings?.shop_name || 'ZEEDAT POS'}
                onClose={() => setLabelProduct(null)}
                onUpdateBarcode={async (productId, newBarcode, autoGenerate = false) => {
                  const res = await ctx.mutate('product.barcode', {
                    id: productId,
                    barcode: newBarcode,
                    auto_generate: autoGenerate,
                  });
                  const finalCode = res.barcode ?? newBarcode;
                  setLabelProduct(prev => (prev ? { ...prev, barcode: finalCode } : null));
                  state.refresh();
                  return finalCode;
                }}
              />
            )}

            {/* Batch Barcode Generator & Print Modal */}
            {batchModal && (
              <BatchBarcodeModal
                products={items}
                shopName={ctx.settings?.shop_name || 'ZEEDAT POS'}
                onClose={() => setBatchModal(false)}
                onBulkGenerate={async (productIds, force = false) => {
                  const res = await ctx.mutate('barcode.bulk', {
                    product_ids: productIds,
                    force,
                  });
                  ctx.setNotice(`Generated & saved ${res.updated || 0} ZD barcodes`);
                  state.refresh();
                  return res;
                }}
                onUpdateSingleBarcode={async productId => {
                  const res = await ctx.mutate('product.barcode', {
                    id: productId,
                    auto_generate: true,
                  });
                  ctx.setNotice(`Saved barcode ${res.barcode}`);
                  state.refresh();
                  return res;
                }}
              />
            )}
            {/* Delete Item with PIN Confirmation Modal */}
            {deleteTarget && (
              <DeleteProductPinModal
                ctx={ctx}
                product={deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onDeleted={msg => {
                  setDeleteTarget(null);
                  ctx.setNotice?.(msg || 'Product deleted.');
                  state.refresh();
                }}
              />
            )}
          </>
        );
      }}
    </DataView>
  );
}

function DeleteProductPinModal({ ctx, product, onClose, onDeleted }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleConfirmDelete = async e => {
    e?.preventDefault();
    setErrorMsg('');
    if (!/^\d{4,8}$/.test(pin.trim())) {
      setErrorMsg('Enter the 4–8 digit Inventory Delete Security PIN.');
      return;
    }
    setBusy(true);
    try {
      const res = await ctx.mutate('product.delete', {
        id: product.id,
        pin: pin.trim(),
      });
      onDeleted?.(res?.message);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete item.');
    } finally {
      setBusy(false);
    }
  };

  const pinNotConfigured = errorMsg.toLowerCase().includes('not set');

  return (
    <Modal title="Delete Inventory Item" onClose={onClose}>
      <form onSubmit={handleConfirmDelete}>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '13px',
              color: '#991b1b',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>
              Confirm removing "{product.name}"
            </div>
            <div style={{ fontSize: '12px' }}>
              SKU: <span className="mono">{product.sku}</span>
              {product.barcode ? (
                <>
                  {' · '}Barcode: <span className="mono">{product.barcode}</span>
                </>
              ) : null}
              {' · '}Stock: <strong>{product.total_qty ?? product.qty ?? 0}</strong>
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '12.5px',
                color: '#92400e',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>{errorMsg}</span>
              {pinNotConfigured && ctx.hasPermission?.('settings') && (
                <Button
                  type="button"
                  size="small"
                  variant="outline"
                  onClick={() => {
                    onClose?.();
                    ctx.navigate('settings', 'pin');
                  }}
                >
                  Open Settings to Set PIN
                </Button>
              )}
            </div>
          )}

          <div className="zk-pb-filter-item">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={14} style={{ color: '#0d9488' }} />
              <span>Security PIN (4–8 digits)</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={e => {
                setPin(e.target.value.replace(/\D/g, ''));
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Enter Security PIN set in Settings..."
              style={{ fontSize: '16px', letterSpacing: '3px', fontWeight: 700 }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            icon={Trash2}
            style={{ background: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
            disabled={busy || pin.length < 4}
          >
            {busy ? 'Verifying & Deleting…' : 'Verify PIN & Delete'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
