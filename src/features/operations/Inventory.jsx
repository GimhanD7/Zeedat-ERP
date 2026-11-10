import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpDown,
  Barcode,
  Box,
  Building2,
  DollarSign,
  Layers3,
  Package,
  Pencil,
  Plus,
  Printer,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
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

export function Inventory({ ctx }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [filter, setFilter] = useState(ctx.intent === 'low' ? 'Reorder alerts' : '');
  const [barcodeFilter, setBarcodeFilter] = useState(''); // '', 'with-barcode', 'no-barcode'
  const [tab, setTab] = useState('Products'); // Products, Branch Stocks, Device Units
  const [selectedBranch, setSelectedBranch] = useState(ctx.branch || 0); // 0 = All Branches
  const [unitBranch, setUnitBranch] = useState(actionBranch(ctx));
  const [labelProduct, setLabelProduct] = useState(null);
  const [batchModal, setBatchModal] = useState(false);
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

  const form = item => {
    const isNew = !item;
    const activeBranchId = selectedBranch || actionBranch(ctx);
    const activeBranchName = ctx.branches.find(b => b.id === activeBranchId)?.name || 'Active Branch';

    ctx.setDialog({
      title: item ? 'Edit product' : 'Add product',
      route: 'product.save',
      submit: item ? 'Save product' : 'Create product',
      wide: true,
      values: {
        ...item,
        branch: activeBranchId,
        category: item?.category || 'Accessories',
        cost: rupees(item?.cost),
        price: rupees(item?.price),
        reorder_level: item?.reorder_level || 0,
        auto_barcode: false,
        initial_stock: 0,
      },
      fields: values => [
        branchField(ctx),
        { name: 'name', label: 'Product name' },
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
        { name: 'cost', label: 'Cost (LKR)', type: 'money' },
        { name: 'price', label: 'Selling price (LKR)', type: 'money' },
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
        ...(isNew && values.category === 'Accessories'
          ? [{ name: 'serialized', label: 'Track by individual serial number', type: 'checkbox' }]
          : []),
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
        return {
          ...v,
          cost: cents(v.cost),
          price: cents(v.price),
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

  const adjust = (items, preselectedProduct = null, preselectedBranch = null) =>
    ctx.setDialog({
      title: 'Stock adjustment',
      route: 'stock.adjust',
      values: {
        branch: preselectedBranch || (selectedBranch || actionBranch(ctx)),
        product_id: preselectedProduct ? String(preselectedProduct.id) : undefined,
        direction: 'In',
      },
      fields: [
        branchField(ctx),
        {
          name: 'product_id',
          label: 'Product',
          choices: options(items.filter(p => !p.serialized && p.category !== 'Services')),
        },
        { name: 'direction', label: 'Direction', choices: ['In', 'Out'] },
        { name: 'qty', label: 'Quantity', type: 'number', min: 1 },
        { name: 'reason', label: 'Reason', full: true },
      ],
    });

  const transfer = (product, fromBranch = null) =>
    ctx.setDialog({
      title: 'Transfer stock between branches',
      route: 'transfer.request',
      values: {
        branch: fromBranch || actionBranch(ctx),
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
    });

  const receive = items =>
    ctx.setDialog({
      title: 'Receive device unit',
      route: 'unit.receive',
      values: { branch: unitBranch, grade: 'New' },
      fields: [
        branchField(ctx),
        {
          name: 'product_id',
          label: 'Serialized product',
          choices: options(items.filter(p => p.serialized)),
        },
        { name: 'code', label: 'Internal unit code' },
        { name: 'imei', label: 'IMEI / serial', optional: true },
        {
          name: 'grade',
          label: 'Condition grade',
          choices: ['New', 'Used', 'Refurbished'],
        },
      ],
    });

  return (
    <DataView state={state}>
      {({ items, units }) => {
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
                Add product
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
                    : 'Serialized Devices'
              }
              icon={tab === 'Products' ? Package : tab === 'Branch Stocks' ? Building2 : Smartphone}
              action={
                <FilterTabs
                  choices={['Products', 'Branch Stocks', 'Device Units']}
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
                                <span className="mono" style={{ marginLeft: 6, opacity: 0.75 }}>
                                  ({r.sku})
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
                                {isZd && (
                                  <Badge tone="mint">Internal</Badge>
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
                                      <span className="branch-name">{bs.branch_name}:</span>{' '}
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
                /* Dedicated Branch-wise Stocks Matrix */
                <>
                  <div className="panel-tools toolbar">
                    <SearchBox
                      value={query}
                      onChange={setQuery}
                      placeholder="Filter products across branches…"
                    />
                    <Select
                      aria-label="Category"
                      blank="All categories"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      options={categories}
                    />
                    <Button icon={ArrowUpDown} onClick={() => adjust(items)}>
                      New stock adjustment
                    </Button>
                  </div>

                  <Table
                    rows={matching.filter(p => p.category !== 'Services')}
                    columns={[
                      [
                        'Product',
                        r => (
                          <div className="table-product">
                            <ProductArt item={r} small />
                            <span>
                              <strong>{r.name}</strong>
                              <small className="subtext mono">{r.sku}</small>
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
                            onClick={() => setLabelProduct(r)}
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
                      // Dynamically render a column for each branch in the workspace
                      ...ctx.branches.map(b => [
                        b.name,
                        r => {
                          const stockItem = (r.branch_stocks || []).find(bs => bs.branch_id === b.id);
                          const qty = stockItem ? stockItem.qty : 0;
                          const toneClass =
                            qty === 0 ? 'zero' : qty <= r.reorder_level ? 'low' : 'ok';
                          return (
                            <div className="branch-matrix-cell">
                              <span className={`badge-stock ${toneClass}`}>{qty}</span>
                              <Button
                                size="small"
                                variant="link"
                                title={`Adjust stock for ${r.name} at ${b.name}`}
                                onClick={() => adjust(items, r, b.id)}
                              >
                                Adjust
                              </Button>
                            </div>
                          );
                        },
                      ]),
                      [
                        'Total Stock',
                        r => (
                          <strong>{r.total_qty ?? r.qty}</strong>
                        ),
                      ],
                      [
                        'Transfer',
                        r =>
                          ctx.branches.length > 1 ? (
                            <Button
                              icon={ArrowRightLeft}
                              size="small"
                              variant="secondary"
                              title="Transfer stock to another branch"
                              onClick={() => transfer(r)}
                            >
                              Transfer
                            </Button>
                          ) : null,
                      ],
                    ]}
                  />
                  <div className="panel-foot">
                    Tracking stock across {ctx.branches.length} branches
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-tools toolbar">
                    <SearchBox
                      value={query}
                      onChange={setQuery}
                      placeholder="Find unit code or IMEI…"
                    />
                    <Select
                      aria-label="Device branch"
                      value={unitBranch}
                      onChange={e => setUnitBranch(Number(e.target.value))}
                      options={options(ctx.branches)}
                    />
                    <Button
                      icon={Plus}
                      variant="primary"
                      onClick={() => receive(items)}
                    >
                      Receive device
                    </Button>
                  </div>
                  <Table
                    rows={units.filter(u =>
                      itemFilter(u, query, ['code', 'imei', 'grade', 'state'])
                    )}
                    columns={[
                      ['Unit code', 'code'],
                      ['Product', r => items.find(p => p.id === r.product_id)?.name],
                      ['IMEI', 'imei'],
                      ['Grade', 'grade'],
                      ['Status', r => <Badge>{r.state}</Badge>],
                      [
                        'Actions',
                        r =>
                          r.state === 'Inspection' ? (
                            <Button
                              onClick={() =>
                                ctx.setDialog({
                                  title: 'Release inspected device',
                                  description: r.code,
                                  route: 'unit.release',
                                  values: { id: r.id, branch: unitBranch },
                                  fields: [
                                    {
                                      name: 'reason',
                                      label: 'Inspection outcome',
                                      full: true,
                                    },
                                  ],
                                })
                              }
                            >
                              Release to stock
                            </Button>
                          ) : null,
                      ],
                    ]}
                  />
                </>
              )}
            </Panel>

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
          </>
        );
      }}
    </DataView>
  );
}
