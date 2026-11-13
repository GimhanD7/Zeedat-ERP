import { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  X,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import { Badge, Button, Heading, Modal, Panel } from '../../components/common';
import { DataView } from '../../components/feedback';
import { managers, money, ref, today } from '../../utils';
import './transfers.css';

const branchOf = ctx => ctx.branch || ctx.branches[0]?.id;
const canManage = ctx => managers.includes(ctx.user.role);

export function StockTransfers({ ctx }) {
  const source = branchOf(ctx);
  const state = useData(ctx, {
    items: ['products', { branch: source }],
    units: ['units', { branch: source }],
    transfers: 'transfers',
  });

  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'inbound' | 'outbound'
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Requested' | 'Dispatched' | 'Received' | 'Rejected'
  const [searchQuery, setSearchQuery] = useState('');
  const [newTransferOpen, setNewTransferOpen] = useState(false);
  const [waybillTransfer, setWaybillTransfer] = useState(null);
  const [busyActionId, setBusyActionId] = useState(null);

  return (
    <DataView state={state}>
      {({ items = [], units = [], transfers = [] }) => {
        // Enriched list with helper fields
        const allTransfers = transfers;

        // KPI metrics
        const totalCount = allTransfers.length;
        const requestedCount = allTransfers.filter(t => t.status === 'Requested').length;
        const transitCount = allTransfers.filter(t => t.status === 'Dispatched').length;
        const receivedCount = allTransfers.filter(t => t.status === 'Received').length;

        // Filtered list
        const filteredTransfers = allTransfers.filter(t => {
          // Tab direction
          if (activeTab === 'inbound' && t.to_branch !== source) return false;
          if (activeTab === 'outbound' && t.from_branch !== source) return false;

          // Status filter
          if (statusFilter !== 'All' && t.status !== statusFilter) return false;

          // Search query
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const refCode = ref('ST', t.id).toLowerCase();
            const prod = String(t.product || '').toLowerCase();
            const sku = String(t.sku || '').toLowerCase();
            const src = String(t.source || '').toLowerCase();
            const dst = String(t.destination || '').toLowerCase();
            const serial = String(t.unit_code || t.unit_imei || '').toLowerCase();
            if (
              !refCode.includes(q) &&
              !prod.includes(q) &&
              !sku.includes(q) &&
              !src.includes(q) &&
              !dst.includes(q) &&
              !serial.includes(q)
            ) {
              return false;
            }
          }

          return true;
        });

        const handleUpdateStatus = async (t, newStatus, actingBranch) => {
          setBusyActionId(t.id);
          try {
            await ctx.mutate('transfer.update', {
              id: t.id,
              status: newStatus,
              branch: actingBranch,
            });
            ctx.setNotice(
              `Transfer ${ref('ST', t.id)} updated to "${newStatus}".`
            );
            state.refresh();
          } catch (err) {
            ctx.setNotice(`Error: ${err.message || 'Operation failed'}`);
          } finally {
            setBusyActionId(null);
          }
        };

        return (
          <div className="transfers-viewport">
            <Heading
              title="Stock Transfers"
              description="Coordinate inter-branch inventory logistics, device serialized movements, and live transit confirmation."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  icon={RefreshCw}
                  variant="outline"
                  onClick={state.refresh}
                  title="Refresh transfer records"
                >
                  Refresh
                </Button>
                <Button
                  icon={Plus}
                  variant="primary"
                  onClick={() => setNewTransferOpen(true)}
                >
                  + New Transfer
                </Button>
              </div>
            </Heading>

            {/* KPI Cards */}
            <div className="transfers-kpis">
              <div className="transfers-kpi-card">
                <span className="transfers-kpi-label">
                  <Boxes size={14} /> Total Movements
                </span>
                <span className="transfers-kpi-val">{totalCount}</span>
                <span className="transfers-kpi-sub">Lifetime branch transfers</span>
              </div>
              <div className="transfers-kpi-card requested">
                <span className="transfers-kpi-label">
                  <Clock size={14} /> Pending Requests
                </span>
                <span className="transfers-kpi-val">{requestedCount}</span>
                <span className="transfers-kpi-sub">Awaiting branch approval</span>
              </div>
              <div className="transfers-kpi-card transit">
                <span className="transfers-kpi-label">
                  <Truck size={14} /> In Transit
                </span>
                <span className="transfers-kpi-val">{transitCount}</span>
                <span className="transfers-kpi-sub">Dispatched & on the road</span>
              </div>
              <div className="transfers-kpi-card received">
                <span className="transfers-kpi-label">
                  <CheckCircle2 size={14} /> Completed
                </span>
                <span className="transfers-kpi-val">{receivedCount}</span>
                <span className="transfers-kpi-sub">Received at destination</span>
              </div>
            </div>

            {/* Navigation Tabs & Filters */}
            <div className="transfers-nav-bar">
              <div className="transfers-tabs">
                <button
                  type="button"
                  className={`transfers-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  <ArrowLeftRight size={13} />
                  <span>All Transfers ({totalCount})</span>
                </button>
                <button
                  type="button"
                  className={`transfers-tab-btn ${activeTab === 'inbound' ? 'active' : ''}`}
                  onClick={() => setActiveTab('inbound')}
                >
                  <ArrowDownLeft size={13} />
                  <span>Inbound to This Branch</span>
                </button>
                <button
                  type="button"
                  className={`transfers-tab-btn ${activeTab === 'outbound' ? 'active' : ''}`}
                  onClick={() => setActiveTab('outbound')}
                >
                  <ArrowUpRight size={13} />
                  <span>Outbound from This Branch</span>
                </button>
              </div>

              {/* Status pills */}
              <div className="transfers-tabs">
                {['All', 'Requested', 'Dispatched', 'Received', 'Rejected'].map(st => (
                  <button
                    key={st}
                    type="button"
                    className={`transfers-tab-btn ${statusFilter === st ? 'active' : ''}`}
                    onClick={() => setStatusFilter(st)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Toolbar */}
            <div className="transfers-toolbar">
              <div className="transfers-search-box">
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search by ST reference, product, IMEI/serial, or branch..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Showing {filteredTransfers.length} of {totalCount} transfers
              </div>
            </div>

            {/* Transfers Table */}
            <div className="transfers-table-wrap">
              <table className="transfers-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Route</th>
                    <th>Product & Details</th>
                    <th>Quantity</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        <Boxes size={28} style={{ opacity: 0.4, marginBottom: '6px' }} />
                        <div>No stock transfer records match your current filter.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredTransfers.map(t => {
                      const isOwner = ctx.user.role === 'owner';
                      const isSourceBranch = ctx.branch === t.from_branch;
                      const isDestBranch = ctx.branch === t.to_branch;
                      const canApproveOrDispatch = canManage(ctx) && (isOwner || isSourceBranch);
                      const canConfirmReceipt = isOwner || isDestBranch;
                      const isBusy = busyActionId === t.id;

                      let statusTone = 'gray';
                      if (t.status === 'Requested') statusTone = 'amber';
                      if (t.status === 'Dispatched') statusTone = 'blue';
                      if (t.status === 'Received') statusTone = 'green';
                      if (t.status === 'Rejected') statusTone = 'red';

                      return (
                        <tr key={t.id}>
                          <td>
                            <strong style={{ color: '#0f766e', fontFamily: 'monospace' }}>
                              {ref('ST', t.id)}
                            </strong>
                          </td>
                          <td>
                            <div className="transfer-branch-route">
                              <span className="source">{t.source || `Branch #${t.from_branch}`}</span>
                              <ArrowRight size={12} className="arrow" />
                              <span className="destination">{t.destination || `Branch #${t.to_branch}`}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.product}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              {t.sku && <small style={{ color: '#64748b' }}>SKU: {t.sku}</small>}
                              {(t.unit_code || t.unit_imei) && (
                                <span className="transfer-serial-tag" title="Serial / IMEI">
                                  SN: {t.unit_code || t.unit_imei}
                                  {t.unit_grade && ` (${t.unit_grade})`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <strong>{t.qty}</strong>
                          </td>
                          <td>
                            <Badge tone={statusTone}>{t.status}</Badge>
                          </td>
                          <td>
                            <small style={{ color: '#64748b' }}>
                              {t.created_at ? String(t.created_at).slice(0, 16) : '—'}
                            </small>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <Button
                                icon={FileText}
                                variant="outline"
                                size="sm"
                                onClick={() => setWaybillTransfer(t)}
                                title="Print Waybill / Dispatch Voucher"
                              >
                                Waybill
                              </Button>

                              {t.status === 'Requested' && canApproveOrDispatch && (
                                <>
                                  <Button
                                    icon={Truck}
                                    variant="primary"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => handleUpdateStatus(t, 'Dispatched', t.from_branch)}
                                    title="Dispatch items (deducts stock from source)"
                                  >
                                    Dispatch
                                  </Button>
                                  <Button
                                    icon={XCircle}
                                    variant="outline-red"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => handleUpdateStatus(t, 'Rejected', t.from_branch)}
                                    title="Reject request"
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}

                              {t.status === 'Dispatched' && canConfirmReceipt && (
                                <Button
                                  icon={CheckCircle2}
                                  variant="primary"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => handleUpdateStatus(t, 'Received', t.to_branch)}
                                  title="Confirm receipt at destination branch (adds to inventory)"
                                >
                                  Receive
                                </Button>
                              )}

                              {t.status === 'Dispatched' && canApproveOrDispatch && (
                                <Button
                                  icon={XCircle}
                                  variant="outline-red"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => handleUpdateStatus(t, 'Rejected', t.from_branch)}
                                  title="Cancel/Recall transfer (returns stock to source)"
                                >
                                  Recall
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* New Transfer Modal */}
            {newTransferOpen && (
              <NewTransferModal
                ctx={ctx}
                sourceBranch={source}
                items={items}
                units={units}
                onClose={() => setNewTransferOpen(false)}
                onSuccess={() => {
                  setNewTransferOpen(false);
                  state.refresh();
                }}
              />
            )}

            {/* Waybill Print Modal */}
            {waybillTransfer && (
              <TransferWaybillModal
                ctx={ctx}
                transfer={waybillTransfer}
                onClose={() => setWaybillTransfer(null)}
              />
            )}
          </div>
        );
      }}
    </DataView>
  );
}

/**
 * Multi-Item Transfer Intake Modal
 */
function NewTransferModal({ ctx, sourceBranch, items, units, onClose, onSuccess }) {
  const [fromBranch, setFromBranch] = useState(sourceBranch);
  const [toBranch, setToBranch] = useState(() => {
    const dest = ctx.destinations?.find(b => b.id !== sourceBranch);
    return dest ? dest.id : '';
  });
  const [autoDispatch, setAutoDispatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Transfer lines state
  const [lines, setLines] = useState([
    { id: 1, product_id: '', unit_id: '', qty: 1 },
  ]);

  const availableDestinations = useMemo(() => {
    return (ctx.branches || []).filter(b => b.id !== Number(fromBranch));
  }, [ctx.branches, fromBranch]);

  const addLine = () => {
    setLines(prev => [...prev, { id: Date.now(), product_id: '', unit_id: '', qty: 1 }]);
  };

  const removeLine = id => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const updateLine = (id, field, value) => {
    setLines(prev =>
      prev.map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        if (field === 'product_id') {
          updated.unit_id = '';
          const prod = items.find(p => p.id === Number(value));
          if (prod?.serialized) {
            updated.qty = 1;
          }
        }
        return updated;
      })
    );
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');

    if (!toBranch) {
      setError('Please select a destination branch.');
      return;
    }

    const validLines = lines.filter(l => l.product_id);
    if (validLines.length === 0) {
      setError('Please add at least one product to transfer.');
      return;
    }

    setBusy(true);
    try {
      await ctx.mutate('transfer.request', {
        branch: Number(fromBranch),
        from_branch: Number(fromBranch),
        to_branch: Number(toBranch),
        auto_dispatch: autoDispatch,
        items: validLines.map(l => ({
          product_id: Number(l.product_id),
          unit_id: l.unit_id ? Number(l.unit_id) : null,
          qty: Number(l.qty || 1),
        })),
      });

      ctx.setNotice(
        `Successfully created transfer of ${validLines.length} item(s)${
          autoDispatch ? ' and dispatched immediately' : ''
        }.`
      );
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to request stock transfer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create Stock Transfer"
      description="Select the source and destination branches, and pick products or serialized devices to move."
      onClose={onClose}
      busy={busy}
      wide
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '12px',
              }}
            >
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="transfer-builder-card">
            {/* Route Grid */}
            <div className="transfer-route-grid">
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  SOURCE BRANCH (FROM)
                </label>
                <select
                  value={fromBranch}
                  onChange={e => setFromBranch(Number(e.target.value))}
                  disabled={ctx.user.role !== 'owner'}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  {(ctx.branches || []).map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  DESTINATION BRANCH (TO)
                </label>
                <select
                  value={toBranch}
                  onChange={e => setToBranch(Number(e.target.value))}
                  required
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="">-- Select Destination Branch --</option>
                  {availableDestinations.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Direct Dispatch Toggle */}
            {canManage(ctx) && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoDispatch}
                  onChange={e => setAutoDispatch(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: '#0f766e' }}>
                  Direct Dispatch: Mark items as "Dispatched" immediately (deducts stock right now)
                </span>
              </label>
            )}

            {/* Items Container */}
            <div className="transfer-items-container">
              <div className="transfer-items-head">
                <span>Transfer Items</span>
                <Button
                  type="button"
                  icon={Plus}
                  variant="soft"
                  size="sm"
                  onClick={addLine}
                >
                  + Add Item
                </Button>
              </div>

              <div style={{ padding: '6px 0' }}>
                {lines.map((line, idx) => {
                  const selProd = items.find(p => p.id === Number(line.product_id));
                  const isSerialized = Boolean(selProd?.serialized);
                  const availableUnits = units.filter(
                    u => u.product_id === Number(line.product_id) && u.state === 'Available'
                  );

                  return (
                    <div key={line.id} className="transfer-item-line">
                      {/* Product Selector */}
                      <div>
                        <select
                          value={line.product_id}
                          onChange={e => updateLine(line.id, 'product_id', e.target.value)}
                          required
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                        >
                          <option value="">-- Choose Product --</option>
                          {items
                            .filter(p => p.category !== 'Services' && p.qty > 0)
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} (Stock: {p.qty})
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Serial / Unit Picker (if serialized) */}
                      <div>
                        {isSerialized ? (
                          <select
                            value={line.unit_id}
                            onChange={e => updateLine(line.id, 'unit_id', e.target.value)}
                            required
                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: '12px' }}
                          >
                            <option value="">-- Select Serial/IMEI Unit --</option>
                            {availableUnits.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.code} {u.grade ? `(${u.grade})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Standard Inventory</span>
                        )}
                      </div>

                      {/* Quantity */}
                      <div>
                        <input
                          type="number"
                          min={1}
                          max={isSerialized ? 1 : selProd?.qty || undefined}
                          value={line.qty}
                          disabled={isSerialized}
                          onChange={e => updateLine(line.id, 'qty', Math.max(1, Number(e.target.value)))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                          placeholder="Qty"
                        />
                      </div>

                      {/* Remove Line */}
                      <div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 1}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: lines.length <= 1 ? '#cbd5e1' : '#ef4444',
                            cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Processing...' : autoDispatch ? 'Dispatch Transfer' : 'Submit Transfer Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Printable Transfer Waybill Modal
 */
function TransferWaybillModal({ ctx, transfer, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      title={`Transfer Waybill · ${ref('ST', transfer.id)}`}
      description="Official inter-branch consignment note for dispatch, transit, and receipt confirmation."
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="waybill-body">
          <div className="waybill-header">
            <div>
              <h2>ZEEDAT LOGISTICS &amp; INVENTORY</h2>
              <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b' }}>
                Inter-Branch Stock Consignment &amp; Waybill
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: '16px', color: '#0f766e', fontFamily: 'monospace' }}>
                {ref('ST', transfer.id)}
              </strong>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Date: {transfer.created_at ? String(transfer.created_at).slice(0, 10) : today()}
              </div>
            </div>
          </div>

          <div className="waybill-meta">
            <div>
              <strong style={{ display: 'block', color: '#334155' }}>ORIGIN / DISPATCH FROM:</strong>
              <div>{transfer.source || `Branch #${transfer.from_branch}`}</div>
              {transfer.source_phone && <small style={{ color: '#64748b' }}>Tel: {transfer.source_phone}</small>}
            </div>
            <div>
              <strong style={{ display: 'block', color: '#334155' }}>DESTINATION / CONSIGN TO:</strong>
              <div>{transfer.destination || `Branch #${transfer.to_branch}`}</div>
              {transfer.destination_phone && <small style={{ color: '#64748b' }}>Tel: {transfer.destination_phone}</small>}
            </div>
          </div>

          <table className="waybill-table">
            <thead>
              <tr>
                <th>Item / Description</th>
                <th>SKU</th>
                <th>Serial / IMEI</th>
                <th>Condition</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>{transfer.product}</strong></td>
                <td>{transfer.sku || '—'}</td>
                <td>{transfer.unit_code || transfer.unit_imei || '—'}</td>
                <td>{transfer.unit_grade || 'Standard'}</td>
                <td style={{ textAlign: 'right' }}><strong>{transfer.qty}</strong></td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
            Current Status: <strong>{transfer.status}</strong> · Verified by Zeedat Automated Inventory System.
          </div>

          <div className="waybill-signatures">
            <div className="waybill-sig-box">
              <div>Dispatched / Authorized By</div>
              <small>Signature &amp; Date</small>
            </div>
            <div className="waybill-sig-box">
              <div>Received &amp; Verified By</div>
              <small>Signature &amp; Date</small>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <Button icon={Printer} variant="primary" onClick={handlePrint}>
          Print Waybill
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

export default StockTransfers;
