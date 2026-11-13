import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Layers,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { useData } from '../../hooks/useData';
import { cents, managers, money, options, ref, today } from '../../utils';
import './purchases.css';

const branchOf = ctx => Number(ctx.branch || ctx.branches[0]?.id || 1);
const canManage = ctx => managers.includes(ctx.user.role);

export function Purchases({ ctx }) {
  const state = useData(ctx, {
    purchases: 'purchases',
    suppliers: 'suppliers',
    products: 'products',
  });

  const isManager = canManage(ctx);
  const activeBranch = branchOf(ctx);

  // Tabs: 'invoices' | 'items' | 'suppliers'
  const [tab, setTab] = useState('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'unpaid' | 'paid'

  // Modals
  const [receiveModal, setReceiveModal] = useState(false);
  const [payModal, setPayModal] = useState(null); // { invoice, supplier_id, supplier, balance, ... }
  const [voucherModal, setVoucherModal] = useState(null); // invoice group object
  const [newSupplierModal, setNewSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '' });

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form state for Multi-Item Receive Invoice Modal
  const [receiveForm, setReceiveForm] = useState({
    branch: activeBranch,
    supplier_id: '',
    invoice: '',
    invoice_date: today(),
    payment_status: 'Unpaid', // 'Paid' | 'Partial' | 'Unpaid'
    amount_paid: '',
    payment_method: 'Cash',
    items: [
      {
        product_id: '',
        qty: 1,
        unit_cost: '',
        selling_price: '',
        update_cost: true,
        code: '',
        imei: '',
        grade: 'New',
      },
    ],
  });

  // Reset receive form
  const resetReceiveForm = () => {
    setReceiveForm({
      branch: activeBranch,
      supplier_id: '',
      invoice: '',
      invoice_date: today(),
      payment_status: 'Unpaid',
      amount_paid: '',
      payment_method: 'Cash',
      items: [
        {
          product_id: '',
          qty: 1,
          unit_cost: '',
          selling_price: '',
          update_cost: true,
          code: '',
          imei: '',
          grade: 'New',
        },
      ],
    });
    setError('');
  };

  // Add line to receive form
  const addItemLine = () => {
    setReceiveForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: '',
          qty: 1,
          unit_cost: '',
          selling_price: '',
          update_cost: true,
          code: '',
          imei: '',
          grade: 'New',
        },
      ],
    }));
  };

  // Remove line from receive form
  const removeItemLine = index => {
    if (receiveForm.items.length <= 1) return;
    setReceiveForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Update line in receive form
  const updateItemLine = (index, field, value) => {
    setReceiveForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  // Submit Quick Add Supplier
  const handleSupplierSubmit = async e => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await ctx.mutate('supplier.create', {
        name: supplierForm.name.trim(),
        phone: supplierForm.phone.trim(),
      });
      setNewSupplierModal(false);
      setSupplierForm({ name: '', phone: '' });
      setNotice(`Supplier "${created.name}" created successfully.`);
      state.refresh();
      // If receive modal is open, auto-select this new supplier
      if (receiveModal) {
        setReceiveForm(prev => ({ ...prev, supplier_id: String(created.id) }));
      }
    } catch (err) {
      setError(err.message || 'Failed to create supplier');
    } finally {
      setBusy(false);
    }
  };

  // Submit Multi-Item Receive Invoice & Auto Update Stocks
  const handleReceiveSubmit = async (e, products) => {
    e.preventDefault();
    if (!receiveForm.supplier_id) {
      setError('Please select a supplier.');
      return;
    }
    if (!receiveForm.invoice.trim()) {
      setError('Please enter the supplier invoice number.');
      return;
    }

    // Validate items
    for (let i = 0; i < receiveForm.items.length; i++) {
      const item = receiveForm.items[i];
      if (!item.product_id) {
        setError(`Please select a product for line #${i + 1}.`);
        return;
      }
      if (!Number(item.qty) || Number(item.qty) < 1) {
        setError(`Please enter a valid quantity for line #${i + 1}.`);
        return;
      }
      if (cents(item.unit_cost) <= 0) {
        setError(`Please enter a valid unit cost price for line #${i + 1}.`);
        return;
      }
      const prodObj = products.find(p => String(p.id) === String(item.product_id));
      if (prodObj?.serialized && !item.code.trim()) {
        setError(`Please enter the device serial / code for line #${i + 1} (${prodObj.name}).`);
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      const preparedItems = receiveForm.items.map(it => ({
        product_id: Number(it.product_id),
        qty: Number(it.qty),
        unit_cost: cents(it.unit_cost),
        selling_price: it.selling_price ? cents(it.selling_price) : 0,
        update_cost: Boolean(it.update_cost),
        code: it.code ? it.code.trim().toUpperCase() : null,
        imei: it.imei ? it.imei.trim() : null,
        grade: it.grade || 'New',
      }));

      const totalInvoiceCost = preparedItems.reduce((sum, it) => sum + it.qty * it.unit_cost, 0);
      let amountPaid = 0;
      if (receiveForm.payment_status === 'Paid') {
        amountPaid = totalInvoiceCost;
      } else if (receiveForm.payment_status === 'Partial') {
        amountPaid = cents(receiveForm.amount_paid);
      }

      await ctx.mutate('purchase.receive', {
        branch: Number(receiveForm.branch),
        supplier_id: Number(receiveForm.supplier_id),
        invoice: receiveForm.invoice.trim(),
        payment_method: receiveForm.payment_method,
        amount_paid: amountPaid,
        items: preparedItems,
      });

      setReceiveModal(false);
      resetReceiveForm();
      setNotice(
        `Purchase Invoice "${receiveForm.invoice.trim()}" received! Inventory stocks automatically updated.`
      );
      state.refresh();
    } catch (err) {
      setError(err.message || 'Failed to receive purchase invoice');
    } finally {
      setBusy(false);
    }
  };

  // Submit Supplier Payment
  const handlePaySubmit = async e => {
    e.preventDefault();
    if (!payModal) return;
    const payCents = cents(payModal.amountToPay);
    if (payCents <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (payModal.invoice && payModal.supplier_id) {
        await ctx.mutate('purchase.pay', {
          branch: payModal.branch_id || activeBranch,
          supplier_id: payModal.supplier_id,
          invoice: payModal.invoice,
          amount: payCents,
        });
      } else {
        await ctx.mutate('purchase.pay', {
          branch: payModal.branch_id || activeBranch,
          id: payModal.id,
          amount: payCents,
        });
      }
      setPayModal(null);
      setNotice(`Payment of ${money(payCents)} recorded.`);
      state.refresh();
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DataView state={state}>
      {({ purchases = [], suppliers = [], products = [] }) => {
        // Group purchases by Supplier & Invoice number
        const invoiceGroups = useMemo(() => {
          const map = new Map();
          for (const p of purchases) {
            const key = `${p.supplier_id}_${p.invoice}_${String(p.created_at).slice(0, 10)}`;
            if (!map.has(key)) {
              map.set(key, {
                key,
                invoice: p.invoice,
                supplier_id: p.supplier_id,
                supplier: p.supplier,
                supplier_phone: p.supplier_phone,
                branch_id: p.branch_id,
                branch_name: p.branch_name,
                created_at: p.created_at,
                total_cost: 0,
                paid_amount: 0,
                balance: 0,
                items_count: 0,
                total_qty: 0,
                lines: [],
              });
            }
            const group = map.get(key);
            const lineTotal = Number(p.qty || 1) * Number(p.unit_cost || 0);
            const lineBal = Number(p.balance || 0);
            const linePaid = lineTotal - lineBal;

            group.total_cost += lineTotal;
            group.balance += lineBal;
            group.paid_amount += linePaid;
            group.items_count += 1;
            group.total_qty += Number(p.qty || 1);
            group.lines.push(p);
          }
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
          );
        }, [purchases]);

        // KPIs
        const totalPurchasesSum = purchases.reduce(
          (sum, p) => sum + Number(p.qty || 1) * Number(p.unit_cost || 0),
          0
        );
        const totalOutstandingPayables = purchases.reduce(
          (sum, p) => sum + Number(p.balance || 0),
          0
        );

        // Filtered Invoices
        const filteredInvoices = invoiceGroups.filter(inv => {
          if (statusFilter === 'unpaid' && inv.balance <= 0) return false;
          if (statusFilter === 'paid' && inv.balance > 0) return false;
          if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            const invNo = String(inv.invoice || '').toLowerCase();
            const sup = String(inv.supplier || '').toLowerCase();
            const phone = String(inv.supplier_phone || '').toLowerCase();
            const hasItem = inv.lines.some(l =>
              String(l.product || '').toLowerCase().includes(q)
            );
            if (!invNo.includes(q) && !sup.includes(q) && !phone.includes(q) && !hasItem) {
              return false;
            }
          }
          return true;
        });

        // Filtered Lines
        const filteredLines = purchases.filter(p => {
          if (statusFilter === 'unpaid' && Number(p.balance || 0) <= 0) return false;
          if (statusFilter === 'paid' && Number(p.balance || 0) > 0) return false;
          if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            const refNo = ref('PO', p.id).toLowerCase();
            const invNo = String(p.invoice || '').toLowerCase();
            const sup = String(p.supplier || '').toLowerCase();
            const prod = String(p.product || '').toLowerCase();
            if (!refNo.includes(q) && !invNo.includes(q) && !sup.includes(q) && !prod.includes(q)) {
              return false;
            }
          }
          return true;
        });

        return (
          <div className="purchases-viewport">
            <Heading
              title="Purchases &amp; Supplier Invoices"
              description="Receive inventory invoices from suppliers, auto-update stock levels, record payments and track payables."
            >
              <Button
                icon={Plus}
                onClick={() => {
                  setNewSupplierModal(true);
                  setError('');
                }}
              >
                New Supplier
              </Button>
              <Button
                variant="primary"
                icon={Package}
                onClick={() => {
                  resetReceiveForm();
                  setReceiveModal(true);
                }}
              >
                + Receive Purchase Invoice
              </Button>
            </Heading>

            {notice && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  {notice}
                </span>
                <button
                  type="button"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#065f46' }}
                  onClick={() => setNotice('')}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* KPI Metrics */}
            <section className="purchases-kpis" aria-label="Purchasing Summary Metrics">
              <div className="purchases-kpi-card volume">
                <span className="purchases-kpi-label">
                  <ShoppingBag size={13} />
                  Total Purchases
                </span>
                <strong className="purchases-kpi-val">{money(totalPurchasesSum)}</strong>
                <span className="purchases-kpi-sub">
                  {invoiceGroups.length} supplier invoices received
                </span>
              </div>
              <div className="purchases-kpi-card payables">
                <span className="purchases-kpi-label">
                  <Wallet size={13} />
                  Outstanding Payables
                </span>
                <strong className="purchases-kpi-val" style={{ color: '#b45309' }}>
                  {money(totalOutstandingPayables)}
                </strong>
                <span className="purchases-kpi-sub">
                  Remaining debt to suppliers
                </span>
              </div>
              <div className="purchases-kpi-card suppliers">
                <span className="purchases-kpi-label">
                  <Truck size={13} />
                  Active Suppliers
                </span>
                <strong className="purchases-kpi-val">{suppliers.length}</strong>
                <span className="purchases-kpi-sub">Registered vendors</span>
              </div>
              <div className="purchases-kpi-card">
                <span className="purchases-kpi-label">
                  <Layers size={13} />
                  Total Stock Received
                </span>
                <strong className="purchases-kpi-val">
                  {purchases.reduce((s, p) => s + Number(p.qty || 1), 0)} units
                </strong>
                <span className="purchases-kpi-sub">Across {purchases.length} item lines</span>
              </div>
            </section>

            {/* Navigation Tabs */}
            <div className="purchases-nav-bar">
              <div className="purchases-tabs">
                <button
                  type="button"
                  className={`purchases-tab-btn ${tab === 'invoices' ? 'active' : ''}`}
                  onClick={() => setTab('invoices')}
                >
                  <FileText size={14} />
                  <span>Purchase Invoices ({invoiceGroups.length})</span>
                </button>
                <button
                  type="button"
                  className={`purchases-tab-btn ${tab === 'items' ? 'active' : ''}`}
                  onClick={() => setTab('items')}
                >
                  <Package size={14} />
                  <span>All Received Items ({purchases.length})</span>
                </button>
                <button
                  type="button"
                  className={`purchases-tab-btn ${tab === 'suppliers' ? 'active' : ''}`}
                  onClick={() => setTab('suppliers')}
                >
                  <Truck size={14} />
                  <span>Suppliers Directory ({suppliers.length})</span>
                </button>
              </div>

              <Button
                variant="soft"
                icon={RefreshCw}
                disabled={state.pending}
                onClick={() => state.refresh()}
              >
                Refresh
              </Button>
            </div>

            {/* TAB 1: PURCHASE INVOICES */}
            {tab === 'invoices' && (
              <div style={{ display: 'grid', gap: '14px' }}>
                <div className="purchases-toolbar">
                  <div className="purchases-search-box">
                    <Search size={15} style={{ color: '#94a3b8' }} />
                    <input
                      type="search"
                      placeholder="Search by supplier invoice #, supplier name, phone, or product…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                        onClick={() => setSearchQuery('')}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <FilterTabs
                    choices={['All Invoices', 'Pending Balance', 'Fully Settled']}
                    value={
                      statusFilter === 'all'
                        ? 'All Invoices'
                        : statusFilter === 'unpaid'
                        ? 'Pending Balance'
                        : 'Fully Settled'
                    }
                    onChange={v => {
                      if (v === 'All Invoices') setStatusFilter('all');
                      else if (v === 'Pending Balance') setStatusFilter('unpaid');
                      else setStatusFilter('paid');
                    }}
                  />
                </div>

                <div className="purchases-table-wrap">
                  <table className="purchases-table">
                    <thead>
                      <tr>
                        <th>Supplier Invoice #</th>
                        <th>Supplier</th>
                        <th>Branch</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'center' }}>Items / Qty</th>
                        <th>Total Cost</th>
                        <th>Paid</th>
                        <th>Balance Due</th>
                        <th>Payment Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.length > 0 ? (
                        filteredInvoices.map(inv => {
                          const isUnpaid = inv.balance > 0;
                          const isFullyPaid = inv.balance === 0;

                          return (
                            <tr key={inv.key}>
                              <td>
                                <strong style={{ color: '#0f766e', fontSize: '13px' }}>
                                  {inv.invoice}
                                </strong>
                              </td>
                              <td>
                                <strong>{inv.supplier}</strong>
                                {inv.supplier_phone && (
                                  <small style={{ display: 'block', color: '#64748b' }}>
                                    {inv.supplier_phone}
                                  </small>
                                )}
                              </td>
                              <td>{inv.branch_name || 'Main Branch'}</td>
                              <td>
                                {inv.created_at
                                  ? String(inv.created_at).slice(0, 10)
                                  : '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span style={{ fontWeight: 600 }}>
                                  {inv.items_count} line(s) · {inv.total_qty} units
                                </span>
                              </td>
                              <td>
                                <strong>{money(inv.total_cost)}</strong>
                              </td>
                              <td>
                                <span style={{ color: '#047857' }}>
                                  {money(inv.paid_amount)}
                                </span>
                              </td>
                              <td>
                                <strong style={{ color: isUnpaid ? '#b45309' : '#047857' }}>
                                  {money(inv.balance)}
                                </strong>
                              </td>
                              <td>
                                {isFullyPaid && <Badge tone="green">Paid</Badge>}
                                {isUnpaid && inv.paid_amount > 0 && (
                                  <Badge tone="amber">Partial</Badge>
                                )}
                                {isUnpaid && inv.paid_amount === 0 && (
                                  <Badge tone="red">Unpaid</Badge>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  <Button
                                    size="small"
                                    variant="soft"
                                    icon={FileText}
                                    onClick={() => setVoucherModal(inv)}
                                    title="View invoice details & print voucher"
                                  >
                                    View Voucher
                                  </Button>
                                  {isUnpaid && isManager && (
                                    <Button
                                      size="small"
                                      variant="primary"
                                      icon={CreditCard}
                                      onClick={() => {
                                        setError('');
                                        setPayModal({
                                          invoice: inv.invoice,
                                          supplier_id: inv.supplier_id,
                                          supplier: inv.supplier,
                                          branch_id: inv.branch_id,
                                          balance: inv.balance,
                                          amountToPay: (inv.balance / 100).toFixed(2),
                                        });
                                      }}
                                    >
                                      Pay Balance
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: '36px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                              <ShoppingBag size={32} style={{ color: '#cbd5e1' }} />
                              <strong style={{ color: '#475569' }}>No purchase invoices found</strong>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {searchQuery || statusFilter !== 'all'
                                  ? 'Try adjusting your search query or status filter.'
                                  : 'No supplier purchase invoices received yet.'}
                              </span>
                              <Button
                                variant="primary"
                                icon={Package}
                                style={{ marginTop: '6px' }}
                                onClick={() => {
                                  resetReceiveForm();
                                  setReceiveModal(true);
                                }}
                              >
                                + Receive First Purchase Invoice
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: ALL RECEIVED ITEMS / LINES */}
            {tab === 'items' && (
              <div style={{ display: 'grid', gap: '14px' }}>
                <div className="purchases-toolbar">
                  <div className="purchases-search-box">
                    <Search size={15} style={{ color: '#94a3b8' }} />
                    <input
                      type="search"
                      placeholder="Search by PO #, invoice #, supplier or product name…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="purchases-table-wrap">
                  <table className="purchases-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Supplier Invoice</th>
                        <th>Supplier</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'center' }}>Qty</th>
                        <th>Unit Cost</th>
                        <th>Line Total</th>
                        <th>Balance Due</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLines.length > 0 ? (
                        filteredLines.map(p => {
                          const lineTotal = Number(p.qty || 1) * Number(p.unit_cost || 0);
                          const isUnpaid = Number(p.balance || 0) > 0;

                          return (
                            <tr key={p.id}>
                              <td>
                                <strong style={{ color: '#0f766e', fontFamily: 'monospace' }}>
                                  {ref('PO', p.id)}
                                </strong>
                              </td>
                              <td>{p.invoice}</td>
                              <td>{p.supplier}</td>
                              <td>
                                <strong>{p.product}</strong>
                                {p.serialized ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      marginLeft: '6px',
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: '#eff6ff',
                                      color: '#1e40af',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Serialized
                                  </span>
                                ) : null}
                              </td>
                              <td>{p.category || '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.qty}</td>
                              <td>{money(p.unit_cost)}</td>
                              <td>
                                <strong>{money(lineTotal)}</strong>
                              </td>
                              <td>
                                <strong style={{ color: isUnpaid ? '#b45309' : '#047857' }}>
                                  {money(p.balance)}
                                </strong>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {isUnpaid && isManager && (
                                  <Button
                                    size="small"
                                    variant="soft"
                                    onClick={() => {
                                      setError('');
                                      setPayModal({
                                        id: p.id,
                                        supplier: p.supplier,
                                        invoice: p.invoice,
                                        branch_id: p.branch_id,
                                        balance: p.balance,
                                        amountToPay: (p.balance / 100).toFixed(2),
                                      });
                                    }}
                                  >
                                    Pay Line
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: '36px 12px' }}>
                            <span style={{ color: '#94a3b8' }}>No items match your query.</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: SUPPLIERS DIRECTORY */}
            {tab === 'suppliers' && (
              <div style={{ display: 'grid', gap: '14px' }}>
                <Panel
                  title="Suppliers Directory"
                  icon={Truck}
                  action={
                    <Button
                      variant="primary"
                      icon={Plus}
                      onClick={() => {
                        setNewSupplierModal(true);
                        setError('');
                      }}
                    >
                      + Add Supplier
                    </Button>
                  }
                >
                  <div style={{ overflowX: 'auto' }}>
                    <table className="purchases-table">
                      <thead>
                        <tr>
                          <th>Supplier Name</th>
                          <th>Phone Number</th>
                          <th style={{ textAlign: 'center' }}>Total Purchase Orders</th>
                          <th>Total Purchased Volume</th>
                          <th>Outstanding Balance Due</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppliers.map(s => {
                          const bal = Number(s.balance_due || 0);
                          return (
                            <tr key={s.id}>
                              <td>
                                <strong>{s.name}</strong>
                              </td>
                              <td>{s.phone || '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                {s.total_orders || 0} order(s)
                              </td>
                              <td>
                                <strong>{money(s.total_purchased || 0)}</strong>
                              </td>
                              <td>
                                <strong style={{ color: bal > 0 ? '#b45309' : '#047857' }}>
                                  {money(bal)}
                                </strong>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <Button
                                  size="small"
                                  variant="soft"
                                  icon={Package}
                                  onClick={() => {
                                    resetReceiveForm();
                                    setReceiveForm(prev => ({
                                      ...prev,
                                      supplier_id: String(s.id),
                                    }));
                                    setReceiveModal(true);
                                  }}
                                >
                                  Receive Stock
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            )}

            {/* MODAL 1: MULTI-ITEM PURCHASE INVOICE INTAKE */}
            {receiveModal && (
              <Modal
                title="Receive Purchase Invoice &amp; Auto Update Stocks"
                description="Add supplier invoice items. Stock quantities will be automatically updated in branch inventory upon receiving."
                wide
                xl
                busy={busy}
                onClose={() => setReceiveModal(false)}
              >
                <form onSubmit={e => handleReceiveSubmit(e, products)}>
                  <div className="purchase-intake-card">
                    {error && <Alert>{error}</Alert>}

                    {/* Step 1: Supplier & Invoice Header */}
                    <div className="purchase-intake-header-grid">
                      <Field label="Receiving Branch">
                        <Select
                          value={receiveForm.branch}
                          options={ctx.branches.map(b => [b.id, b.name])}
                          onChange={e =>
                            setReceiveForm({ ...receiveForm, branch: Number(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Supplier">
                        <Select
                          value={receiveForm.supplier_id}
                          required
                          blank="Select supplier…"
                          options={suppliers.map(s => [s.id, s.name])}
                          onChange={e =>
                            setReceiveForm({ ...receiveForm, supplier_id: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Supplier Invoice #">
                        <input
                          type="text"
                          required
                          placeholder="e.g. INV-2026-891"
                          value={receiveForm.invoice}
                          onChange={e =>
                            setReceiveForm({ ...receiveForm, invoice: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Invoice Date">
                        <input
                          type="date"
                          value={receiveForm.invoice_date}
                          onChange={e =>
                            setReceiveForm({ ...receiveForm, invoice_date: e.target.value })
                          }
                        />
                      </Field>
                    </div>

                    {/* Step 2: Items Builder */}
                    <div className="purchase-items-builder">
                      <div className="purchase-items-builder-head">
                        <span>Items on this Invoice ({receiveForm.items.length})</span>
                        <Button
                          type="button"
                          variant="soft"
                          size="small"
                          icon={Plus}
                          onClick={addItemLine}
                        >
                          + Add Item Line
                        </Button>
                      </div>

                      <div style={{ display: 'grid', gap: '4px', padding: '6px' }}>
                        {receiveForm.items.map((line, idx) => {
                          const prodObj = products.find(
                            p => String(p.id) === String(line.product_id)
                          );
                          const lineCostTotal =
                            cents(line.unit_cost) * Number(line.qty || 1);

                          return (
                            <div key={idx} className="purchase-line-row">
                              {/* Product Picker */}
                              <Field label={`#${idx + 1} Product`} style={{ margin: 0 }}>
                                <Select
                                  value={line.product_id}
                                  required
                                  blank="Choose product in catalog…"
                                  options={products
                                    .filter(p => p.category !== 'Services')
                                    .map(p => [
                                      p.id,
                                      `${p.name} · SKU: ${p.sku || '—'} (Stock: ${p.qty})`,
                                    ])}
                                  onChange={e => {
                                    const pid = e.target.value;
                                    const hit = products.find(p => String(p.id) === pid);
                                    updateItemLine(idx, 'product_id', pid);
                                    if (hit) {
                                      if (hit.cost && !line.unit_cost) {
                                        updateItemLine(idx, 'unit_cost', (hit.cost / 100).toFixed(2));
                                      }
                                      if (hit.price && !line.selling_price) {
                                        updateItemLine(idx, 'selling_price', (hit.price / 100).toFixed(2));
                                      }
                                    }
                                  }}
                                />
                              </Field>

                              {/* Quantity */}
                              <Field label="Qty" style={{ margin: 0 }}>
                                <input
                                  type="number"
                                  min="1"
                                  required
                                  value={line.qty}
                                  disabled={prodObj?.serialized}
                                  onChange={e =>
                                    updateItemLine(idx, 'qty', Math.max(1, Number(e.target.value)))
                                  }
                                />
                              </Field>

                              {/* Unit Cost */}
                              <Field label="Unit Cost (LKR)" style={{ margin: 0 }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  required
                                  placeholder="0.00"
                                  value={line.unit_cost}
                                  onChange={e =>
                                    updateItemLine(idx, 'unit_cost', e.target.value)
                                  }
                                />
                              </Field>

                              {/* Retail Selling Price */}
                              <Field label="Retail Price (LKR)" style={{ margin: 0 }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="Selling price"
                                  value={line.selling_price}
                                  onChange={e =>
                                    updateItemLine(idx, 'selling_price', e.target.value)
                                  }
                                />
                              </Field>

                              {/* Line Total Preview */}
                              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                                <small style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>Total</small>
                                {money(lineCostTotal)}
                              </div>

                              {/* Delete button */}
                              <div style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    padding: '4px',
                                  }}
                                  disabled={receiveForm.items.length <= 1}
                                  onClick={() => removeItemLine(idx)}
                                  title="Remove this line"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>

                              {/* Serialized Device Details (if serialized) */}
                              {prodObj?.serialized && (
                                <div className="purchase-serials-box">
                                  <strong style={{ fontSize: '12px', color: '#1e40af' }}>
                                    📱 Device Serial &amp; IMEI Information ({prodObj.name}):
                                  </strong>
                                  <div className="purchase-serial-input-row">
                                    <Field label="Unit Code / Tag" style={{ flex: 1, margin: 0 }}>
                                      <input
                                        type="text"
                                        required
                                        placeholder="e.g. DEV-001 or Serial #"
                                        value={line.code}
                                        onChange={e => updateItemLine(idx, 'code', e.target.value)}
                                      />
                                    </Field>
                                    <Field label="IMEI Number (Optional)" style={{ flex: 1, margin: 0 }}>
                                      <input
                                        type="text"
                                        placeholder="e.g. 356789123456789"
                                        value={line.imei}
                                        onChange={e => updateItemLine(idx, 'imei', e.target.value)}
                                      />
                                    </Field>
                                    <Field label="Condition Grade" style={{ width: '130px', margin: 0 }}>
                                      <Select
                                        value={line.grade}
                                        options={[
                                          ['New', 'Brand New'],
                                          ['Used', 'Used'],
                                          ['Refurbished', 'Refurbished'],
                                        ]}
                                        onChange={e => updateItemLine(idx, 'grade', e.target.value)}
                                      />
                                    </Field>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step 3: Payment & Settlement Summary Card */}
                    {(() => {
                      const totalInvoiceCost = receiveForm.items.reduce(
                        (sum, it) => sum + cents(it.unit_cost) * Number(it.qty || 1),
                        0
                      );

                      let amountPaidCents = 0;
                      if (receiveForm.payment_status === 'Paid') {
                        amountPaidCents = totalInvoiceCost;
                      } else if (receiveForm.payment_status === 'Partial') {
                        amountPaidCents = cents(receiveForm.amount_paid);
                      }
                      const balanceDue = Math.max(0, totalInvoiceCost - amountPaidCents);

                      return (
                        <div className="purchase-settlement-card">
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                              Payment &amp; Settlement Options:
                            </strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                              <button
                                type="button"
                                className={`purchases-tab-btn ${receiveForm.payment_status === 'Paid' ? 'active' : ''}`}
                                style={{ justifyContent: 'center' }}
                                onClick={() => setReceiveForm({ ...receiveForm, payment_status: 'Paid', amount_paid: '' })}
                              >
                                Fully Paid Now
                              </button>
                              <button
                                type="button"
                                className={`purchases-tab-btn ${receiveForm.payment_status === 'Partial' ? 'active' : ''}`}
                                style={{ justifyContent: 'center' }}
                                onClick={() => setReceiveForm({ ...receiveForm, payment_status: 'Partial' })}
                              >
                                Partially Paid
                              </button>
                              <button
                                type="button"
                                className={`purchases-tab-btn ${receiveForm.payment_status === 'Unpaid' ? 'active' : ''}`}
                                style={{ justifyContent: 'center' }}
                                onClick={() => setReceiveForm({ ...receiveForm, payment_status: 'Unpaid', amount_paid: '' })}
                              >
                                Unpaid / Credit
                              </button>
                            </div>

                            {receiveForm.payment_status === 'Partial' && (
                              <div style={{ marginBottom: '10px' }}>
                                <Field label="Amount Paid Now (LKR)">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    required
                                    placeholder="Enter partial payment amount"
                                    value={receiveForm.amount_paid}
                                    onChange={e => setReceiveForm({ ...receiveForm, amount_paid: e.target.value })}
                                  />
                                </Field>
                              </div>
                            )}

                            {receiveForm.payment_status !== 'Unpaid' && (
                              <Field label="Payment Tender Method">
                                <Select
                                  value={receiveForm.payment_method}
                                  options={[
                                    ['Cash', 'Cash (Payout from register drawer)'],
                                    ['Bank Transfer', 'Bank Transfer / Wire'],
                                    ['Cheque', 'Cheque'],
                                    ['Company Account', 'Company Account / Direct Deposit'],
                                  ]}
                                  onChange={e => setReceiveForm({ ...receiveForm, payment_method: e.target.value })}
                                />
                              </Field>
                            )}
                          </div>

                          <div className="purchase-totals-breakdown">
                            <div className="purchase-total-row">
                              <span>Total Items:</span>
                              <strong>{receiveForm.items.length} line(s)</strong>
                            </div>
                            <div className="purchase-total-row">
                              <span>Total Invoice Cost:</span>
                              <strong>{money(totalInvoiceCost)}</strong>
                            </div>
                            <div className="purchase-total-row">
                              <span>Paid Now:</span>
                              <strong style={{ color: '#047857' }}>{money(amountPaidCents)}</strong>
                            </div>
                            <div className="purchase-total-row grand">
                              <span>Balance Owed to Supplier:</span>
                              <strong style={{ color: balanceDue > 0 ? '#b45309' : '#047857' }}>
                                {money(balanceDue)}
                              </strong>
                            </div>
                            <small style={{ color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={13} />
                              Inventory stock quantities will be automatically updated immediately upon save.
                            </small>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => setReceiveModal(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={busy}
                      >
                        {busy ? 'Receiving & Updating Stocks…' : '✓ Receive Invoice & Update Stocks'}
                      </Button>
                    </div>
                  </div>
                </form>
              </Modal>
            )}

            {/* MODAL 2: PAY SUPPLIER INVOICE */}
            {payModal && (
              <Modal
                title={`Pay Supplier — ${payModal.supplier}`}
                description={`Invoice: ${payModal.invoice} · Outstanding Balance: ${money(payModal.balance)}`}
                busy={busy}
                onClose={() => setPayModal(null)}
              >
                <form onSubmit={handlePaySubmit}>
                  <div style={{ display: 'grid', gap: '14px' }}>
                    {error && <Alert>{error}</Alert>}

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span>Supplier:</span>
                        <strong>{payModal.supplier}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px' }}>
                        <span>Invoice #:</span>
                        <strong>{payModal.invoice}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '8px', borderTop: '1px dashed #fde68a', paddingTop: '6px' }}>
                        <span>Remaining Balance:</span>
                        <strong style={{ color: '#b45309' }}>{money(payModal.balance)}</strong>
                      </div>
                    </div>

                    <Field label="Payment Amount to Settle (LKR)">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={(payModal.balance / 100).toFixed(2)}
                        required
                        value={payModal.amountToPay}
                        onChange={e => setPayModal({ ...payModal, amountToPay: e.target.value })}
                      />
                    </Field>

                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                      Cash payment will be automatically recorded as a supplier payout movement in the cashier register drawer.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                      <Button type="button" disabled={busy} onClick={() => setPayModal(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" variant="primary" disabled={busy}>
                        {busy ? 'Processing…' : `Record Payment (${money(cents(payModal.amountToPay))})`}
                      </Button>
                    </div>
                  </div>
                </form>
              </Modal>
            )}

            {/* MODAL 3: INVOICE VOUCHER PREVIEW / PRINT */}
            {voucherModal && (
              <Modal
                title={`Purchase Voucher — Invoice ${voucherModal.invoice}`}
                wide
                onClose={() => setVoucherModal(null)}
              >
                <div className="purchase-voucher-body">
                  <div className="purchase-voucher-header">
                    <div>
                      <h2>ZEEDAT MOBILE &amp; COMPUTERS</h2>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#475569' }}>
                        Supplier Purchase &amp; Stock Intake Voucher
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '15px', color: '#0f766e' }}>
                        {voucherModal.invoice}
                      </strong>
                      <small style={{ display: 'block', color: '#64748b' }}>
                        Date: {voucherModal.created_at?.slice(0, 10)}
                      </small>
                    </div>
                  </div>

                  <div className="purchase-voucher-meta">
                    <div>
                      <span>Supplier:</span> <strong>{voucherModal.supplier}</strong>
                    </div>
                    <div>
                      <span>Supplier Phone:</span> <strong>{voucherModal.supplier_phone || '—'}</strong>
                    </div>
                    <div>
                      <span>Receiving Branch:</span> <strong>{voucherModal.branch_name || 'Main Branch'}</strong>
                    </div>
                    <div>
                      <span>Payment Status:</span>{' '}
                      <strong>{voucherModal.balance === 0 ? 'Fully Settled' : 'Balance Due'}</strong>
                    </div>
                  </div>

                  <table className="purchase-voucher-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'center' }}>Qty Received</th>
                        <th>Unit Cost</th>
                        <th>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voucherModal.lines?.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <strong>{line.product}</strong>
                          </td>
                          <td>{line.category || '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{line.qty}</td>
                          <td>{money(line.unit_cost)}</td>
                          <td style={{ fontWeight: 700 }}>{money(Number(line.qty) * Number(line.unit_cost))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>
                      Paid: <strong style={{ color: '#047857' }}>{money(voucherModal.paid_amount)}</strong>
                      {voucherModal.balance > 0 && (
                        <span style={{ marginLeft: '8px', color: '#b45309' }}>
                          · Balance Due: <strong>{money(voucherModal.balance)}</strong>
                        </span>
                      )}
                    </span>
                    <strong style={{ fontSize: '17px', color: '#0f172a' }}>
                      Total Invoice: {money(voucherModal.total_cost)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                    <Button variant="soft" onClick={() => setVoucherModal(null)}>
                      Close
                    </Button>
                    <Button
                      variant="primary"
                      icon={Printer}
                      onClick={() => window.print()}
                    >
                      Print Voucher
                    </Button>
                  </div>
                </div>
              </Modal>
            )}

            {/* MODAL 4: NEW SUPPLIER DIALOG */}
            {newSupplierModal && (
              <Modal
                title="Add New Supplier"
                description="Register a new supplier / vendor in the directory"
                busy={busy}
                onClose={() => setNewSupplierModal(false)}
              >
                <form onSubmit={handleSupplierSubmit}>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {error && <Alert>{error}</Alert>}
                    <Field label="Supplier Full Name / Company">
                      <input
                        type="text"
                        autoFocus
                        required
                        placeholder="e.g. ABC Mobile Distributors"
                        value={supplierForm.name}
                        onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      />
                    </Field>
                    <Field label="Contact Phone Number">
                      <input
                        type="tel"
                        placeholder="e.g. 0771234567"
                        value={supplierForm.phone}
                        onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      />
                    </Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                      <Button type="button" disabled={busy} onClick={() => setNewSupplierModal(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" variant="primary" disabled={busy || !supplierForm.name.trim()}>
                        {busy ? 'Saving…' : 'Save Supplier'}
                      </Button>
                    </div>
                  </div>
                </form>
              </Modal>
            )}
          </div>
        );
      }}
    </DataView>
  );
}
