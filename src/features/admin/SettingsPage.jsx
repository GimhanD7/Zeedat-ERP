import { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Check,
  ClipboardList,
  Cloud,
  Database,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Percent,
  Phone,
  Plus,
  Printer,
  Receipt,
  Save,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Panel,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, money, timeLabel } from '../../utils';
import { BackupSyncManager } from './BackupSyncManager';

export function SettingsPage({ ctx }) {
  const state = useData(ctx, {
    settings: 'settings',
    branches: 'branches.summary',
    audit: 'audit',
  });

  const [activeTab, setActiveTab] = useState('Store & Receipt');

  // Store & Receipt inline form state
  const [form, setForm] = useState({
    shop_name: 'ZEEDAT POS',
    shop_phone: '',
    shop_email: '',
    shop_address: '',
    invoice_prefix: 'INV-',
    tax_pct: '0',
    paper_width: '80',
    receipt_footer: 'Thank you for your business! Please retain this receipt for warranty.',
    auto_print: true,
    show_tax_on_receipt: true,
  });
  const [savingStore, setSavingStore] = useState(false);
  const [storeMsg, setStoreMsg] = useState(null);

  // Audit filters
  const [auditQuery, setAuditQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('all');

  // Change Password form
  const [pwdForm, setPwdForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  // Hydrate form when settings load
  useEffect(() => {
    const s = state.data?.settings;
    if (s) {
      setForm({
        shop_name: s.shop_name || 'ZEEDAT POS',
        shop_phone: s.shop_phone || '',
        shop_email: s.shop_email || '',
        shop_address: s.shop_address || '',
        invoice_prefix: s.invoice_prefix || 'INV-',
        tax_pct: String((s.tax_bps || 0) / 100),
        paper_width: String(s.paper_width || '80'),
        receipt_footer:
          s.receipt_footer ||
          'Thank you for your business! Please retain this receipt for warranty.',
        auto_print: s.auto_print !== 0 && s.auto_print !== '0',
        show_tax_on_receipt: s.show_tax_on_receipt !== 0 && s.show_tax_on_receipt !== '0',
      });
    }
  }, [state.data?.settings]);

  const handleSaveStoreSettings = async e => {
    e.preventDefault();
    setSavingStore(true);
    setStoreMsg(null);
    try {
      await ctx.mutate('settings.save', {
        shop_name: form.shop_name,
        shop_phone: form.shop_phone,
        shop_email: form.shop_email,
        shop_address: form.shop_address,
        invoice_prefix: form.invoice_prefix,
        tax_bps: cents(form.tax_pct || 0),
        paper_width: form.paper_width,
        receipt_footer: form.receipt_footer,
        auto_print: form.auto_print ? 1 : 0,
        show_tax_on_receipt: form.show_tax_on_receipt ? 1 : 0,
      });
      setStoreMsg({ type: 'success', text: 'Store & receipt settings saved successfully.' });
      ctx.setNotice('Store settings updated.');
      state.refresh();
    } catch (err) {
      setStoreMsg({ type: 'error', text: err.message || 'Failed to save settings.' });
    } finally {
      setSavingStore(false);
    }
  };

  const openBranchModal = branch => {
    ctx.setDialog({
      title: branch ? `Edit Branch: ${branch.name}` : 'Add New Store Branch',
      description: 'Configure branch name and contact information.',
      route: 'branch.save',
      values: branch || { name: '', phone: '', address: '' },
      fields: [
        { name: 'name', label: 'Branch Name', placeholder: 'e.g. Kandy City Center', full: true },
        { name: 'phone', label: 'Contact Phone', placeholder: 'e.g. 081 223 4455', optional: true },
        { name: 'address', label: 'Branch Address', type: 'textarea', optional: true },
      ],
      onSuccess: () => {
        ctx.setNotice(branch ? 'Branch updated.' : 'New branch created.');
        state.refresh();
      },
    });
  };

  const handleChangePassword = async e => {
    e.preventDefault();
    setPwdMsg(null);
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (pwdForm.new_password.length < 6) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    setPwdBusy(true);
    try {
      const res = await ctx.mutate('profile.password', {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      setPwdMsg({ type: 'success', text: res.message || 'Password updated.' });
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setPwdBusy(false);
    }
  };

  const formatAuditDetails = raw => {
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!obj || typeof obj !== 'object') return String(raw || '—');
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ');
    } catch {
      return String(raw || '—');
    }
  };

  return (
    <DataView state={state}>
      {({ settings = {}, branches = [], audit = [] }) => {
        const distinctActions = Array.from(new Set(audit.map(a => a.action)));
        const filteredAudit = audit.filter(a => {
          if (auditActionFilter !== 'all' && a.action !== auditActionFilter) return false;
          if (auditQuery) {
            const q = auditQuery.toLowerCase();
            const text = `${a.actor || ''} ${a.action || ''} ${a.details || ''} ${a.branch || ''}`.toLowerCase();
            if (!text.includes(q)) return false;
          }
          return true;
        });

        // Live preview tax calculation
        const sampleSubtotal = 15000;
        const taxRateNum = parseFloat(form.tax_pct || '0') || 0;
        const sampleTax = (sampleSubtotal * taxRateNum) / 100;
        const sampleTotal = sampleSubtotal + sampleTax;

        return (
          <div className="zk-dashboard-wrap">
            <Heading
              title="System Settings & Preferences"
              description="Configure store identity, thermal receipt printing, branches, cloud backup & security."
            />

            {/* TOP 4 KPI OVERVIEW CARDS */}
            <div className="zk-kpi-4grid">
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square green">
                  <Store size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Active Store Name</div>
                  <div className="zk-kpi-value" style={{ fontSize: '16.5px' }}>
                    {settings.shop_name || 'ZEEDAT POS'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    Prefix: <strong>{settings.invoice_prefix || 'INV-'}</strong>
                  </div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square blue">
                  <Printer size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Printer & Tax Rate</div>
                  <div className="zk-kpi-value" style={{ fontSize: '16.5px' }}>
                    {settings.paper_width || 80}mm · {(settings.tax_bps || 0) / 100}% Tax
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    Timezone: Asia/Colombo
                  </div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square orange">
                  <Building2 size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Store Branches</div>
                  <div className="zk-kpi-value" style={{ fontSize: '16.5px' }}>
                    {branches.length} Locations
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    Multi-branch synchronized
                  </div>
                </div>
              </div>

              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square purple">
                  <Database size={23} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Database Engine</div>
                  <div className="zk-kpi-value" style={{ fontSize: '16.5px' }}>
                    {settings.db_driver === 'sqlite' ? 'SQLite Offline' : 'MySQL Server'}
                  </div>
                  <div style={{ marginTop: '3px' }}>
                    <Badge tone="green">Auto-Migrated</Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN SETTINGS PANEL WITH TABS */}
            <Panel
              title={activeTab}
              icon={
                activeTab === 'Store & Receipt'
                  ? Receipt
                  : activeTab === 'Branches & Locations'
                  ? Building2
                  : activeTab === 'Cloud Sync & Backup'
                  ? Cloud
                  : ShieldCheck
              }
              action={
                <FilterTabs
                  choices={[
                    'Store & Receipt',
                    'Branches & Locations',
                    'Cloud Sync & Backup',
                    'Security & Audit Log',
                  ]}
                  value={activeTab}
                  onChange={setActiveTab}
                />
              }
            >
              {/* TAB 1: STORE & RECEIPT SETTINGS + LIVE PREVIEW */}
              {activeTab === 'Store & Receipt' && (
                <div className="zk-settings-grid">
                  {/* LEFT: INLINE EDITABLE FORM */}
                  <form onSubmit={handleSaveStoreSettings} className="zk-settings-card">
                    <div className="zk-card-header">
                      <div className="zk-card-title">
                        <Settings size={17} style={{ color: '#0d9488' }} />
                        <span>Business Profile & Thermal Receipt Rules</span>
                      </div>
                    </div>

                    {storeMsg && (
                      <Alert tone={storeMsg.type === 'error' ? 'red' : 'mint'} style={{ marginBottom: '14px' }}>
                        {storeMsg.text}
                      </Alert>
                    )}

                    <div className="zk-form-row-2" style={{ marginBottom: '14px' }}>
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Shop / Receipt Title *</label>
                        <div className="zk-input-box">
                          <Store size={15} style={{ color: '#64748b' }} />
                          <input
                            type="text"
                            value={form.shop_name}
                            onChange={e => setForm({ ...form, shop_name: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Shop Contact Phone</label>
                        <div className="zk-input-box">
                          <Phone size={15} style={{ color: '#64748b' }} />
                          <input
                            type="text"
                            placeholder="e.g. 011 234 5678 / 077 123 4567"
                            value={form.shop_phone}
                            onChange={e => setForm({ ...form, shop_phone: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="zk-form-row-2" style={{ marginBottom: '14px' }}>
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Business Email / Website</label>
                        <div className="zk-input-box">
                          <Mail size={15} style={{ color: '#64748b' }} />
                          <input
                            type="text"
                            placeholder="e.g. sales@zeedat.lk"
                            value={form.shop_email}
                            onChange={e => setForm({ ...form, shop_email: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Store Address</label>
                        <div className="zk-input-box">
                          <MapPin size={15} style={{ color: '#64748b' }} />
                          <input
                            type="text"
                            placeholder="e.g. No. 124, Main Street, Battaramulla"
                            value={form.shop_address}
                            onChange={e => setForm({ ...form, shop_address: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="zk-form-row-2" style={{ marginBottom: '14px' }}>
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Default VAT / Tax Rate (%)</label>
                        <div className="zk-input-box">
                          <Percent size={15} style={{ color: '#64748b' }} />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={form.tax_pct}
                            onChange={e => setForm({ ...form, tax_pct: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Invoice Number Prefix</label>
                        <div className="zk-input-box">
                          <Receipt size={15} style={{ color: '#64748b' }} />
                          <input
                            type="text"
                            maxLength={15}
                            value={form.invoice_prefix}
                            onChange={e => setForm({ ...form, invoice_prefix: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Thermal Paper Selector */}
                    <div className="zk-field-wrap" style={{ marginBottom: '14px' }}>
                      <label className="zk-field-label">Thermal Receipt Paper Width</label>
                      <div className="zk-paper-selector">
                        <button
                          type="button"
                          className={`zk-paper-option ${form.paper_width === '58' ? 'active' : ''}`}
                          onClick={() => setForm({ ...form, paper_width: '58' })}
                        >
                          <Printer size={18} style={{ color: form.paper_width === '58' ? '#0d9488' : '#64748b' }} />
                          <div>
                            <strong style={{ display: 'block', fontSize: '13px' }}>58mm Compact</strong>
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Mini Bluetooth / Portable POS</small>
                          </div>
                        </button>

                        <button
                          type="button"
                          className={`zk-paper-option ${form.paper_width === '80' ? 'active' : ''}`}
                          onClick={() => setForm({ ...form, paper_width: '80' })}
                        >
                          <Printer size={18} style={{ color: form.paper_width === '80' ? '#0d9488' : '#64748b' }} />
                          <div>
                            <strong style={{ display: 'block', fontSize: '13px' }}>80mm Standard</strong>
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Desktop Auto-Cutter Printer</small>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Receipt Footer Terms */}
                    <div className="zk-field-wrap" style={{ marginBottom: '14px' }}>
                      <label className="zk-field-label">Receipt Footer / Warranty Message</label>
                      <div className="zk-textarea-box">
                        <textarea
                          rows={2}
                          maxLength={250}
                          value={form.receipt_footer}
                          onChange={e => setForm({ ...form, receipt_footer: e.target.value })}
                          placeholder="Thank you! Goods sold are returnable within 7 days with tag & receipt."
                        />
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="zk-form-row-2" style={{ marginBottom: '18px' }}>
                      <label className="zk-toggle-row">
                        <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Auto-open print dialog after sale</span>
                        <input
                          type="checkbox"
                          checked={form.auto_print}
                          onChange={e => setForm({ ...form, auto_print: e.target.checked })}
                          style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
                        />
                      </label>

                      <label className="zk-toggle-row">
                        <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Show tax breakdown on receipt</span>
                        <input
                          type="checkbox"
                          checked={form.show_tax_on_receipt}
                          onChange={e => setForm({ ...form, show_tax_on_receipt: e.target.checked })}
                          style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="zk-btn-complete" disabled={savingStore}>
                        <Save size={16} />
                        <span>{savingStore ? 'Saving Settings...' : 'Save Store & Receipt Settings'}</span>
                      </button>
                    </div>
                  </form>

                  {/* RIGHT: LIVE THERMAL RECEIPT PREVIEW */}
                  <div className="zk-receipt-preview-box">
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <strong style={{ fontSize: '13px', color: '#334155' }}>
                        Live Receipt Preview ({form.paper_width}mm)
                      </strong>
                      <button
                        type="button"
                        className="zk-edit-btn"
                        onClick={() => window.print()}
                      >
                        <Printer size={12} />
                        <span>Test Print</span>
                      </button>
                    </div>

                    <div className={`zk-thermal-paper ${form.paper_width === '58' ? 'w58' : 'w80'}`}>
                      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>
                          {form.shop_name || 'ZEEDAT POS'}
                        </div>
                        {form.shop_address && <div>{form.shop_address}</div>}
                        {form.shop_phone && <div>Tel: {form.shop_phone}</div>}
                        {form.shop_email && <div>{form.shop_email}</div>}
                      </div>

                      <div style={{ borderTop: '1px dashed #94a3b8', borderBottom: '1px dashed #94a3b8', padding: '4px 0', marginBottom: '6px' }}>
                        <div>Inv: {form.invoice_prefix}001042</div>
                        <div>Date: {new Date().toLocaleDateString()}</div>
                        <div>Cashier: Admin</div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
                        <span>Item</span>
                        <span>Amount</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>20W USB-C Charger x1</span>
                        <span>7,500.00</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>Silicone Case x2</span>
                        <span>7,500.00</span>
                      </div>

                      <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Subtotal</span>
                          <span>15,000.00</span>
                        </div>
                        {form.show_tax_on_receipt && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>VAT ({form.tax_pct || 0}%)</span>
                            <span>{sampleTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', marginTop: '3px' }}>
                          <span>TOTAL</span>
                          <span>LKR {sampleTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px dashed #94a3b8', marginTop: '8px', paddingTop: '6px', textAlign: 'center', fontSize: '10px', color: '#475569' }}>
                        {form.receipt_footer || 'Thank you for shopping with us!'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BRANCHES & LOCATIONS */}
              {activeTab === 'Branches & Locations' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                      Manage store branches, contact numbers, and physical addresses across your retail network.
                    </p>
                    {ctx.user.role === 'owner' && (
                      <Button icon={Plus} variant="primary" onClick={() => openBranchModal(null)}>
                        Add New Branch
                      </Button>
                    )}
                  </div>

                  <div className="zk-branches-grid">
                    {branches.map(b => (
                      <div className="zk-branch-tile" key={b.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className="zk-kpi-icon-square green" style={{ width: '38px', height: '38px' }}>
                              <Building2 size={18} />
                            </div>
                            <div>
                              <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>{b.name}</strong>
                              <div style={{ fontSize: '11.5px', color: '#64748b' }}>Branch ID #{b.id}</div>
                            </div>
                          </div>

                          {ctx.user.role === 'owner' && (
                            <button
                              type="button"
                              className="zk-edit-btn"
                              onClick={() => openBranchModal(b)}
                            >
                              <Pencil size={12} />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>

                        <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={13} style={{ color: '#0d9488' }} />
                            <span>{b.phone || 'No phone number set'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MapPin size={13} style={{ color: '#0d9488' }} />
                            <span>{b.address || 'No street address set'}</span>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '8px',
                            borderTop: '1px solid #f1f5f9',
                            paddingTop: '10px',
                            marginTop: '4px',
                            textAlign: 'center',
                          }}
                        >
                          <div>
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Staff</small>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{b.staff_count || 0}</div>
                          </div>
                          <div>
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Stock Units</small>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{b.stock_units || 0}</div>
                          </div>
                          <div>
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Sales</small>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{b.sales_count || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: CLOUD SYNC & BACKUP */}
              {activeTab === 'Cloud Sync & Backup' && <BackupSyncManager ctx={ctx} />}

              {/* TAB 4: SECURITY & AUDIT LOG */}
              {activeTab === 'Security & Audit Log' && (
                <div className="stack">
                  {/* Change Own Password Card */}
                  <div className="zk-settings-card">
                    <div className="zk-card-header">
                      <div className="zk-card-title">
                        <KeyRound size={17} style={{ color: '#0d9488' }} />
                        <span>Account Security · Change My Password ({ctx.user.name})</span>
                      </div>
                    </div>

                    {pwdMsg && (
                      <Alert tone={pwdMsg.type === 'error' ? 'red' : 'mint'} style={{ marginBottom: '12px' }}>
                        {pwdMsg.text}
                      </Alert>
                    )}

                    <form onSubmit={handleChangePassword}>
                      <div className="zk-form-row-3" style={{ alignItems: 'end' }}>
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Current Password</label>
                          <div className="zk-input-box">
                            <Lock size={15} style={{ color: '#64748b' }} />
                            <input
                              type="password"
                              value={pwdForm.current_password}
                              onChange={e => setPwdForm({ ...pwdForm, current_password: e.target.value })}
                              required
                            />
                          </div>
                        </div>

                        <div className="zk-field-wrap">
                          <label className="zk-field-label">New Password (min 6 chars)</label>
                          <div className="zk-input-box">
                            <Lock size={15} style={{ color: '#64748b' }} />
                            <input
                              type="password"
                              value={pwdForm.new_password}
                              onChange={e => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                              required
                            />
                          </div>
                        </div>

                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Confirm New Password</label>
                          <div className="zk-input-box">
                            <Lock size={15} style={{ color: '#64748b' }} />
                            <input
                              type="password"
                              value={pwdForm.confirm_password}
                              onChange={e => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                        <Button type="submit" icon={ShieldCheck} variant="primary" disabled={pwdBusy}>
                          {pwdBusy ? 'Updating Password...' : 'Update My Password'}
                        </Button>
                      </div>
                    </form>
                  </div>

                  {/* Filterable System Audit Trail */}
                  <div className="zk-settings-card">
                    <div className="zk-card-header">
                      <div className="zk-card-title">
                        <ClipboardList size={17} style={{ color: '#0d9488' }} />
                        <span>System Security & Audit Trail</span>
                      </div>
                      <Badge>{filteredAudit.length} events</Badge>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ flex: '1 1 240px' }}>
                        <SearchBox
                          value={auditQuery}
                          onChange={setAuditQuery}
                          placeholder="Search user, branch, action, or details..."
                        />
                      </div>

                      <div style={{ minWidth: '180px' }}>
                        <Select
                          aria-label="Filter by Action"
                          value={auditActionFilter}
                          options={[
                            ['all', 'All Action Types'],
                            ...distinctActions.map(a => [a, a]),
                          ]}
                          onChange={e => setAuditActionFilter(e.target.value)}
                        />
                      </div>
                    </div>

                    <Table
                      rows={filteredAudit}
                      columns={[
                        ['Date & Time', r => timeLabel(r.created_at)],
                        ['Actor', r => <strong>{r.actor}</strong>],
                        ['Branch', r => r.branch || 'Global'],
                        ['Action', r => <Badge>{r.action}</Badge>],
                        [
                          'Event Details',
                          r => (
                            <span style={{ fontSize: '12px', color: '#475569' }}>
                              {formatAuditDetails(r.details)}
                            </span>
                          ),
                        ],
                      ]}
                    />
                  </div>
                </div>
              )}
            </Panel>
          </div>
        );
      }}
    </DataView>
  );
}
