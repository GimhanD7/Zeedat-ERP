import { useState, useEffect } from 'react';
import {
  Building2,
  ClipboardList,
  Cloud,
  Database,
  Download,
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
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  BillPreview,
  Button,
  Heading,
  SearchBox,
  Select,
  Table,
} from '../../components/common';
import { DataView } from '../../components/feedback';
import { billLayout, billPaperWidth, buildBillHtml, printBill, cents, printHtmlDocument, timeLabel, today } from '../../utils';
import { BackupSyncManager } from './BackupSyncManager';

export function SettingsPage({ ctx }) {
  // Audit filters
  const [auditQuery, setAuditQuery] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');

  const state = useData(ctx, {
    settings: 'settings',
    branches: 'branches.summary',
    audit: ['audit', { limit: 1000, ...(auditFrom ? { from: auditFrom } : {}), ...(auditTo ? { to: auditTo } : {}) }],
  });

  const [activeTab, setActiveTab] = useState(
    ctx.intent === 'pin' ? 'Security & PIN' : 'Store & Receipt'
  );

  useEffect(() => {
    if (ctx.intent === 'pin') {
      setActiveTab('Security & PIN');
      ctx.clearIntent?.();
    }
  }, [ctx.intent]);

  // Store & Receipt inline form state
  const [form, setForm] = useState({
    shop_name: 'ZEEDAT POS',
    shop_phone: '',
    shop_email: '',
    shop_address: '',
    invoice_prefix: 'INV-',
    tax_pct: '0',
    paper_width: '80',
    bill_layout: {},
    receipt_footer: 'Thank you for your business! Please retain this receipt for warranty.',
    auto_print: true,
    show_tax_on_receipt: true,
    receipt_printer_name: '',
    cash_drawer_enabled: true,
    sms_enabled: false,
    sms_provider_url: '',
    sms_api_key: '',
    sms_sender_id: '',
  });
  const updateBillLayout = (key, value) => setForm(previous => ({ ...previous, bill_layout: { ...previous.bill_layout, [key]: value } }));
  const [printers, setPrinters] = useState([]);
  const [drawerTesting, setDrawerTesting] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [storeMsg, setStoreMsg] = useState(null);

  // Change Password form
  const [pwdForm, setPwdForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  // Inventory Delete Security PIN form
  const [pinForm, setPinForm] = useState({
    current_pin: '',
    current_password: '',
    new_pin: '',
    confirm_pin: '',
    use_account_password: false,
  });
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState(null);

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
        bill_layout: billLayout(s),
        receipt_footer:
          s.receipt_footer ||
          'Thank you for your business! Please retain this receipt for warranty.',
        auto_print: s.auto_print !== 0 && s.auto_print !== '0',
        show_tax_on_receipt: s.show_tax_on_receipt !== 0 && s.show_tax_on_receipt !== '0',
        receipt_printer_name: s.receipt_printer_name || '',
        cash_drawer_enabled: s.cash_drawer_enabled !== 0 && s.cash_drawer_enabled !== '0',
        sms_enabled: Boolean(Number(s.sms_enabled || 0)),
        sms_provider_url: s.sms_provider_url || '',
        sms_api_key: s.sms_api_key || '',
        sms_sender_id: s.sms_sender_id || '',
      });
    }
  }, [state.data?.settings]);

  const loadPrinters = async () => {
    if (!window.electronAPI?.getPrinters) return;
    try {
      const list = await window.electronAPI.getPrinters();
      if (Array.isArray(list)) setPrinters(list);
    } catch {
      // Ignore printer enumeration failures
    }
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  const handleTestDrawer = async () => {
    if (!window.electronAPI?.openCashDrawer) {
      setStoreMsg({ type: 'error', text: 'Hardware cash drawer kick is only available in the Zeedat desktop app.' });
      return;
    }
    setDrawerTesting(true);
    setStoreMsg(null);
    try {
      const res = await window.electronAPI.openCashDrawer({ deviceName: form.receipt_printer_name || '' });
      if (res?.ok) {
        setStoreMsg({ type: 'success', text: `Cash drawer kick sent to ${res.printerName || 'default printer'}.` });
      } else {
        setStoreMsg({ type: 'error', text: res?.error || 'Could not trigger cash drawer.' });
      }
    } finally {
      setDrawerTesting(false);
    }
  };

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
        bill_layout: form.bill_layout,
        receipt_footer: form.receipt_footer,
        auto_print: form.auto_print ? 1 : 0,
        show_tax_on_receipt: form.show_tax_on_receipt ? 1 : 0,
        receipt_printer_name: form.receipt_printer_name || '',
        cash_drawer_enabled: form.cash_drawer_enabled ? 1 : 0,
        sms_enabled: form.sms_enabled ? 1 : 0,
        sms_provider_url: form.sms_provider_url || '',
        sms_api_key: form.sms_api_key || '',
        sms_sender_id: form.sms_sender_id || '',
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

  const handleSaveDeletePin = async (e, alreadyConfigured) => {
    e.preventDefault();
    setPinMsg(null);
    if (!/^\d{4,8}$/.test(pinForm.new_pin)) {
      setPinMsg({ type: 'error', text: 'Security PIN must be 4 to 8 numeric digits.' });
      return;
    }
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      setPinMsg({ type: 'error', text: 'New PIN and Confirm PIN do not match.' });
      return;
    }
    if (alreadyConfigured) {
      if (pinForm.use_account_password && !pinForm.current_password) {
        setPinMsg({ type: 'error', text: 'Enter your account password to reset the PIN.' });
        return;
      }
      if (!pinForm.use_account_password && !pinForm.current_pin) {
        setPinMsg({ type: 'error', text: 'Enter your current PIN first.' });
        return;
      }
    }

    setPinBusy(true);
    try {
      const res = await ctx.mutate('settings.pin.save', {
        current_pin: pinForm.current_pin,
        current_password: pinForm.current_password,
        new_pin: pinForm.new_pin,
        use_account_password: pinForm.use_account_password,
      });
      setPinMsg({ type: 'success', text: res.message || 'Security PIN saved.' });
      setPinForm({
        current_pin: '',
        current_password: '',
        new_pin: '',
        confirm_pin: '',
        use_account_password: false,
      });
      ctx.setNotice('Delete PIN saved.');
      state.refresh();
    } catch (err) {
      setPinMsg({ type: 'error', text: err.message || 'Failed to save Security PIN.' });
    } finally {
      setPinBusy(false);
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

  const actionTone = action => {
    const a = String(action || '');
    if (a.startsWith('auth.')) return 'blue';
    if (a.startsWith('sale.')) return 'green';
    if (a.startsWith('drawer.') || a.startsWith('purchase.')) return 'amber';
    if (a.includes('delete') || a.includes('pin')) return 'red';
    if (a.startsWith('staff.') || a.startsWith('permissions')) return 'violet';
    return 'slate';
  };

  const exportAuditCsv = rows => {
    const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['ID', 'Date & Time', 'User ID', 'Staff Name', 'Badge', 'Role', 'Branch', 'Action', 'Details'];
    const lines = [
      headers.map(csvCell).join(','),
      ...rows.map(r =>
        [
          r.id,
          r.created_at,
          r.user_id || '',
          r.actor || '',
          r.actor_badge || '',
          r.actor_role || '',
          r.branch || 'Global',
          r.action || '',
          formatAuditDetails(r.details),
        ]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_activity_log_${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printAuditDocument = (rows, shopName = 'ZEEDAT POS') => {
    const esc = v =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const trs = rows
      .slice(0, 500)
      .map(
        r => `<tr>
          <td>${esc(timeLabel(r.created_at))}</td>
          <td>#${esc(r.user_id || '')} · ${esc(r.actor)} (${esc(r.actor_badge || '')})</td>
          <td>${esc(r.branch || 'Global')}</td>
          <td><strong>${esc(r.action)}</strong></td>
          <td>${esc(formatAuditDetails(r.details))}</td>
        </tr>`
      )
      .join('');
    printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Users Activity & History Log</title><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#0f172a;margin:14mm 12mm}h1{margin:0 0 4px;font-size:16px}p{margin:0 0 12px;color:#475569;font-size:10.5px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top;font-size:9.8px}th{background:#f8fafc}</style></head><body><h1>${esc(shopName)} — Users History & Full Activity Log</h1><p>Printed: ${esc(new Date().toLocaleString())} · Events shown: ${rows.length}</p><table><thead><tr><th>Date & Time</th><th>User</th><th>Branch</th><th>Action</th><th>Details</th></tr></thead><tbody>${trs || '<tr><td colspan="5">No activity events match current filters.</td></tr>'}</tbody></table></body></html>`);
  };

  return (
    <DataView state={state}>
      {({ settings = {}, branches = [], audit = [] }) => {
        const auditEvents = Array.isArray(audit) ? audit : (audit?.events || []);
        const usersSummary = Array.isArray(audit?.users_summary) ? audit.users_summary : [];
        const distinctActions = Array.from(new Set(auditEvents.map(a => a.action)));
        const filteredAudit = auditEvents.filter(a => {
          if (auditUserFilter !== 'all' && String(a.user_id) !== String(auditUserFilter)) return false;
          if (auditActionFilter !== 'all' && a.action !== auditActionFilter) return false;
          if (auditQuery) {
            const q = auditQuery.toLowerCase();
            const text = `${a.actor || ''} ${a.actor_badge || ''} ${a.action || ''} ${a.details || ''} ${a.branch || ''}`.toLowerCase();
            if (!text.includes(q)) return false;
          }
          return true;
        });

        // Live preview tax calculation
        const sampleSubtotal = 15000;
        const taxRateNum = parseFloat(form.tax_pct || '0') || 0;
        const sampleTax = (sampleSubtotal * taxRateNum) / 100;
        const sampleTotal = sampleSubtotal + sampleTax;
        const sampleBill = {
          title: 'SALES INVOICE', number: 'INV-EXAMPLE', copyLabel: 'TEST PRINT',
          parties: [['Customer', 'Sample Customer']],
          items: [{ name: 'Sample Item', qty: 1, price: cents(sampleSubtotal), total: cents(sampleSubtotal) }],
          totals: [
            ...(form.show_tax_on_receipt ? [{ label: 'Tax', value: cents(sampleTax) }] : []),
            { label: 'Total', value: cents(sampleTotal), grand: true },
          ],
          status: { tone: 'paid', label: 'Paid in Full' },
        };

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

            {/* SETTINGS NAVIGATION & CONTENT SHELL */}
            <div className="zk-settings-shell">
              <nav className="zk-settings-nav" aria-label="Settings sections">
                {[
                  ['Store & Receipt', Receipt],
                  ['Branches & Locations', Building2],
                  ['Cloud Sync & Backup', Cloud],
                  ['Users History & Activity', ClipboardList],
                  ['Security & PIN', ShieldCheck],
                ].map(([label, TabIcon]) => (
                  <button
                    key={label}
                    type="button"
                    className={`zk-settings-tab ${activeTab === label ? 'active' : ''}`}
                    onClick={() => setActiveTab(label)}
                  >
                    <TabIcon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

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
                      <Badge tone="blue">{form.paper_width}mm Format</Badge>
                    </div>

                    {storeMsg && (
                      <div className={`zk-notice-banner ${storeMsg.type === 'error' ? 'error' : 'success'}`}>
                        {storeMsg.text}
                      </div>
                    )}

                    <div className="zk-settings-section">
                      <h4 className="zk-settings-subtitle">Business Identity</h4>
                      <div className="zk-form-row-2" style={{ marginBottom: '16px' }}>
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

                      <div className="zk-form-row-2">
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
                    </div>

                    <div className="zk-settings-section">
                      <h4 className="zk-settings-subtitle">Tax &amp; Invoice Numbering</h4>
                      <div className="zk-form-row-2">
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
                    </div>

                    <div className="zk-settings-section">
                      <h4 className="zk-settings-subtitle">Thermal Printer &amp; Receipt Layout</h4>
                      <div className="zk-field-wrap" style={{ marginBottom: '16px' }}>
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

                      <div className="zk-field-wrap" style={{ marginBottom: '16px' }}>
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

                      <div className="zk-form-row-2">
                        <label className="zk-toggle-row">
                          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Auto-print bill after sale</span>
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

                      <div className="zk-form-row-2" style={{ marginTop: '12px', alignItems: 'end' }}>
                        <div className="zk-field-wrap" style={{ marginBottom: 0 }}>
                          <label className="zk-field-label">Receipt Printer &amp; Cash Drawer Port</label>
                          <select
                            className="input"
                            value={form.receipt_printer_name}
                            onChange={e => setForm({ ...form, receipt_printer_name: e.target.value })}
                          >
                            <option value="">System Default Thermal Printer</option>
                            {printers.map(p => (
                              <option key={p.name} value={p.name}>
                                {p.name}{p.isDefault ? ' (Default)' : ''}
                              </option>
                            ))}
                            {form.receipt_printer_name && !printers.some(p => p.name === form.receipt_printer_name) && (
                              <option value={form.receipt_printer_name}>{form.receipt_printer_name}</option>
                            )}
                          </select>
                        </div>

                        <label className="zk-toggle-row">
                          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Auto-open cash drawer (Cash only)</span>
                          <input
                            type="checkbox"
                            checked={form.cash_drawer_enabled}
                            onChange={e => setForm({ ...form, cash_drawer_enabled: e.target.checked })}
                            style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
                          />
                        </label>
                      </div>

                      {window.electronAPI?.openCashDrawer && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                          <Button type="button" variant="outline" onClick={loadPrinters} style={{ fontSize: '12px', padding: '5px 10px' }}>
                            Refresh Printers
                          </Button>
                          <Button type="button" variant="outline" disabled={drawerTesting} onClick={handleTestDrawer} style={{ fontSize: '12px', padding: '5px 10px' }}>
                            {drawerTesting ? 'Opening Drawer...' : 'Test Cash Drawer Kick'}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="zk-settings-section">
                      <div className="zk-settings-sec-title">Repair Intake &amp; Ready SMS Gateway</div>
                      <label className="zk-toggle-row" style={{ marginBottom: '10px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Auto-send SMS when repair device is received</span>
                        <input
                          type="checkbox"
                          checked={form.sms_enabled}
                          onChange={e => setForm({ ...form, sms_enabled: e.target.checked })}
                          style={{ width: '16px', height: '16px', accentColor: '#0d9488' }}
                        />
                      </label>
                      <div className="zk-form-row-2">
                        <div className="zk-field-wrap" style={{ gridColumn: '1 / -1' }}>
                          <label className="zk-field-label">SMS Gateway URL (GET placeholders {'{phone}'}, {'{message}'}, {'{sender_id}'}, {'{api_key}'} or JSON POST URL)</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="https://app.notify.lk/api/v1/send?user_id=...&api_key={api_key}&sender_id={sender_id}&to={phone}&message={message}"
                            value={form.sms_provider_url}
                            onChange={e => setForm({ ...form, sms_provider_url: e.target.value })}
                          />
                        </div>
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Sender ID</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="ZEEDAT"
                            maxLength={40}
                            value={form.sms_sender_id}
                            onChange={e => setForm({ ...form, sms_sender_id: e.target.value })}
                          />
                        </div>
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">API Key / Bearer Token</label>
                          <input
                            type="password"
                            className="input"
                            placeholder="Gateway API key"
                            value={form.sms_api_key}
                            onChange={e => setForm({ ...form, sms_api_key: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="zk-form-footer">
                      <section className="zk-field-wrap" style={{ display: 'grid', gap: 10 }}>
                        <strong>Bill Layout</strong>
                        <label>Print format
                          <Select value={form.bill_layout.format || 'thermal'} options={[[ 'thermal', 'Thermal receipt' ], [ 'a4', 'A4 invoice' ]]}
                            onChange={e => updateBillLayout('format', e.target.value)} />
                        </label>
                        <label>Logo (PNG, JPEG or WebP, up to 130 KB)
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 130000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                              setStoreMsg({ type: 'error', text: 'Choose a PNG, JPEG or WebP logo under 130 KB.' });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => updateBillLayout('logo', reader.result);
                            reader.onerror = () => setStoreMsg({ type: 'error', text: 'Could not read the logo.' });
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                        {form.bill_layout.logo && <Button type="button" onClick={() => updateBillLayout('logo', '')}>Remove Logo</Button>}
                        <label>Header line
                          <input maxLength={100} value={form.bill_layout.heading || ''} onChange={e => updateBillLayout('heading', e.target.value)} />
                        </label>
                        <label>Additional details
                          <textarea rows={2} maxLength={700} placeholder="Business registration or tax number" value={form.bill_layout.details || ''} onChange={e => updateBillLayout('details', e.target.value)} />
                        </label>
                        <label>Terms and warranty
                          <textarea rows={3} maxLength={1000} value={form.bill_layout.terms || ''} onChange={e => updateBillLayout('terms', e.target.value)} />
                        </label>
                      </section>
                      <Button type="submit" icon={Save} variant="primary" disabled={savingStore}>
                        {savingStore ? 'Saving Settings...' : 'Save Store & Receipt Settings'}
                      </Button>
                    </div>
                  </form>

                  <div className="zk-receipt-preview-box">
                    <strong>Bill Preview</strong>
                    <Button icon={Printer} onClick={() => printBill(sampleBill, form, { silent: false })}>Test Print</Button>
                    <BillPreview html={buildBillHtml(sampleBill, form)} paperWidth={billPaperWidth(form)} maxHeight={420} />
                  </div>
                </div>
              )}

              {/* TAB 2: BRANCHES & LOCATIONS */}
              {activeTab === 'Branches & Locations' && (
                <div className="zk-settings-card">
                  <div className="zk-card-header">
                    <div>
                      <div className="zk-card-title">
                        <Building2 size={17} style={{ color: '#0d9488' }} />
                        <span>Branches &amp; Retail Locations</span>
                      </div>
                      <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                        Manage store branches, contact numbers, and physical addresses across your retail network.
                      </p>
                    </div>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="zk-kpi-icon-square green" style={{ width: '40px', height: '40px' }}>
                              <Building2 size={18} />
                            </div>
                            <div>
                              <strong style={{ fontSize: '15px', color: '#0f172a' }}>{b.name}</strong>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>Branch ID #{b.id}</div>
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

                        <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Phone size={14} style={{ color: '#0d9488', flexShrink: 0 }} />
                            <span>{b.phone || 'No phone number set'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={14} style={{ color: '#0d9488', flexShrink: 0 }} />
                            <span>{b.address || 'No street address set'}</span>
                          </div>
                        </div>

                        <div className="zk-branch-stats">
                          <div className="zk-branch-stat-cell">
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Staff</small>
                            <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#0f172a' }}>{b.staff_count || 0}</div>
                          </div>
                          <div className="zk-branch-stat-cell">
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Stock Units</small>
                            <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#0f172a' }}>{b.stock_units || 0}</div>
                          </div>
                          <div className="zk-branch-stat-cell">
                            <small style={{ color: '#64748b', fontSize: '11px' }}>Sales</small>
                            <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#0f172a' }}>{b.sales_count || 0}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: CLOUD SYNC & BACKUP */}
              {activeTab === 'Cloud Sync & Backup' && <BackupSyncManager ctx={ctx} />}

              {/* TAB 4: USERS HISTORY TRACKING & FULL ACTIVITY LOG */}
              {activeTab === 'Users History & Activity' && (
                <div className="zk-settings-stack">
                  {usersSummary.length > 0 && (
                    <div className="zk-settings-card">
                      <div className="zk-card-header">
                        <div className="zk-card-title">
                          <Users size={17} style={{ color: '#0d9488' }} />
                          <span>All Users Activity Tracking</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {auditUserFilter !== 'all' && (
                            <Button variant="ghost" onClick={() => setAuditUserFilter('all')}>
                              Show All Users
                            </Button>
                          )}
                          <Badge tone="green">{usersSummary.length} Users Tracked</Badge>
                        </div>
                      </div>

                      <Table
                        rows={usersSummary}
                        onRow={u =>
                          setAuditUserFilter(prev =>
                            String(prev) === String(u.id) ? 'all' : String(u.id)
                          )
                        }
                        columns={[
                          [
                            'User',
                            u => (
                              <div>
                                <strong>#{u.id} · {u.name}</strong>
                                <div className="muted" style={{ fontSize: '11.5px' }}>
                                  {u.badge_code} · {u.role} · {u.branch_name}
                                </div>
                              </div>
                            ),
                          ],
                          ['Today', u => <Badge tone={Number(u.today_events) > 0 ? 'green' : 'slate'}>{u.today_events || 0} today</Badge>],
                          ['Logins', u => u.login_count || 0],
                          ['Sales Ops', u => u.sales_events || 0],
                          ['Total History', u => <strong>{u.total_events || 0} events</strong>],
                          ['Last Activity', u => (u.last_activity_at ? timeLabel(u.last_activity_at) : '—')],
                        ]}
                      />
                    </div>
                  )}

                  <div className="zk-settings-card">
                    <div className="zk-card-header">
                      <div className="zk-card-title">
                        <ClipboardList size={17} style={{ color: '#0d9488' }} />
                        <span>Full System &amp; User Activity Log</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge>{filteredAudit.length} events</Badge>
                        <Button icon={Download} variant="ghost" onClick={() => exportAuditCsv(filteredAudit)}>
                          Export CSV
                        </Button>
                        <Button
                          icon={Printer}
                          variant="soft"
                          onClick={() => printAuditDocument(filteredAudit, settings.shop_name)}
                        >
                          Print Log
                        </Button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        marginBottom: '16px',
                      }}
                    >
                      <div style={{ flex: '1 1 220px' }}>
                        <SearchBox
                          value={auditQuery}
                          onChange={setAuditQuery}
                          placeholder="Search user, badge, branch, action, or details..."
                        />
                      </div>

                      {usersSummary.length > 0 && (
                        <div style={{ minWidth: '175px' }}>
                          <Select
                            aria-label="Filter by User"
                            value={auditUserFilter}
                            options={[
                              ['all', 'All Users'],
                              ...usersSummary.map(u => [String(u.id), `#${u.id} · ${u.name}`]),
                            ]}
                            onChange={e => setAuditUserFilter(e.target.value)}
                          />
                        </div>
                      )}

                      <div style={{ minWidth: '175px' }}>
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

                      <input
                        type="date"
                        aria-label="From date"
                        value={auditFrom}
                        onChange={e => setAuditFrom(e.target.value)}
                        style={{ minHeight: '36px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                      />
                      <input
                        type="date"
                        aria-label="To date"
                        value={auditTo}
                        onChange={e => setAuditTo(e.target.value)}
                        style={{ minHeight: '36px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                      />
                      <Button icon={RefreshCw} variant="ghost" onClick={state.refresh} title="Reload activity log" />
                    </div>

                    <Table
                      rows={filteredAudit}
                      empty="No user activity events recorded for the selected filters."
                      columns={[
                        ['Date & Time', r => timeLabel(r.created_at)],
                        [
                          'User',
                          r => (
                            <div>
                              <strong>#{r.user_id || ''} · {r.actor}</strong>
                              <div className="muted" style={{ fontSize: '11px' }}>
                                {r.actor_badge || ''} {r.actor_role ? `· ${r.actor_role}` : ''}
                              </div>
                            </div>
                          ),
                        ],
                        ['Branch', r => r.branch || 'Global'],
                        ['Action', r => <Badge tone={actionTone(r.action)}>{r.action}</Badge>],
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

              {/* TAB 5: SECURITY & PIN */}
              {activeTab === 'Security & PIN' && (
                <div className="zk-settings-stack">
                  <div className="zk-security-top-grid">
                    {/* Inventory Delete Security PIN Card */}
                    <div className="zk-settings-card" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="zk-card-header">
                        <div className="zk-card-title">
                          <Lock size={17} style={{ color: '#0d9488' }} />
                          <span>Delete Security PIN</span>
                        </div>
                        <Badge tone={settings.delete_pin_configured ? 'green' : 'amber'}>
                          {settings.delete_pin_configured ? 'PIN Active' : 'PIN Not Set'}
                        </Badge>
                      </div>

                      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                        The owner sets this 4–8 digit PIN. It is required to delete inventory items or customer accounts.
                      </p>

                      {pinMsg && (
                        <div className={`zk-notice-banner ${pinMsg.type === 'error' ? 'error' : 'success'}`}>
                          {pinMsg.text}
                        </div>
                      )}

                      <form
                        onSubmit={e => handleSaveDeletePin(e, Boolean(settings.delete_pin_configured))}
                        style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}
                      >
                        <div className="zk-settings-stack" style={{ gap: '14px' }}>
                          {settings.delete_pin_configured && (
                            <div className="zk-field-wrap">
                              <label className="zk-field-label">
                                {pinForm.use_account_password ? 'Your Account Password' : 'Current Security PIN'}
                              </label>
                              <div className="zk-input-box">
                                <KeyRound size={15} style={{ color: '#64748b' }} />
                                {pinForm.use_account_password ? (
                                  <input
                                    type="password"
                                    value={pinForm.current_password}
                                    onChange={e => setPinForm({ ...pinForm, current_password: e.target.value })}
                                    placeholder="Enter account password"
                                    required
                                  />
                                ) : (
                                  <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={8}
                                    value={pinForm.current_pin}
                                    onChange={e =>
                                      setPinForm({
                                        ...pinForm,
                                        current_pin: e.target.value.replace(/\D/g, ''),
                                      })
                                    }
                                    placeholder="Current 4–8 digit PIN"
                                    required
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          <div className="zk-form-row-2">
                            <div className="zk-field-wrap">
                              <label className="zk-field-label">New Security PIN (4–8 digits)</label>
                              <div className="zk-input-box">
                                <Lock size={15} style={{ color: '#64748b' }} />
                                <input
                                  type="password"
                                  inputMode="numeric"
                                  maxLength={8}
                                  value={pinForm.new_pin}
                                  onChange={e =>
                                    setPinForm({
                                      ...pinForm,
                                      new_pin: e.target.value.replace(/\D/g, ''),
                                    })
                                  }
                                  placeholder="e.g. 1234"
                                  required
                                />
                              </div>
                            </div>

                            <div className="zk-field-wrap">
                              <label className="zk-field-label">Confirm New PIN</label>
                              <div className="zk-input-box">
                                <Lock size={15} style={{ color: '#64748b' }} />
                                <input
                                  type="password"
                                  inputMode="numeric"
                                  maxLength={8}
                                  value={pinForm.confirm_pin}
                                  onChange={e =>
                                    setPinForm({
                                      ...pinForm,
                                      confirm_pin: e.target.value.replace(/\D/g, ''),
                                    })
                                  }
                                  placeholder="Re-enter PIN"
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={`zk-form-footer ${settings.delete_pin_configured ? 'between' : ''}`}>
                          {settings.delete_pin_configured && (
                            <button
                              type="button"
                              className="zk-edit-btn"
                              onClick={() =>
                                setPinForm(prev => ({
                                  ...prev,
                                  use_account_password: !prev.use_account_password,
                                  current_pin: '',
                                  current_password: '',
                                }))
                              }
                            >
                              {pinForm.use_account_password
                                ? 'Use Current PIN Instead'
                                : 'Forgot PIN? Use Account Password'}
                            </button>
                          )}
                          <Button type="submit" icon={ShieldCheck} variant="primary" disabled={pinBusy}>
                            {pinBusy
                              ? 'Saving PIN...'
                              : settings.delete_pin_configured
                                ? 'Change Security PIN'
                                : 'Set Security PIN'}
                          </Button>
                        </div>
                      </form>
                    </div>

                    {/* Change Own Password Card */}
                    <div className="zk-settings-card" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="zk-card-header">
                        <div className="zk-card-title">
                          <KeyRound size={17} style={{ color: '#0d9488' }} />
                          <span>Account Security · Change Password</span>
                        </div>
                        <Badge tone="blue">{ctx.user.name}</Badge>
                      </div>

                      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                        Update your sign-in password. Changes apply cleanly to your local session and sync permissions.
                      </p>

                      {pwdMsg && (
                        <div className={`zk-notice-banner ${pwdMsg.type === 'error' ? 'error' : 'success'}`}>
                          {pwdMsg.text}
                        </div>
                      )}

                      <form
                        onSubmit={handleChangePassword}
                        style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}
                      >
                        <div className="zk-settings-stack" style={{ gap: '14px' }}>
                          <div className="zk-field-wrap">
                            <label className="zk-field-label">Current Password</label>
                            <div className="zk-input-box">
                              <Lock size={15} style={{ color: '#64748b' }} />
                              <input
                                type="password"
                                value={pwdForm.current_password}
                                onChange={e => setPwdForm({ ...pwdForm, current_password: e.target.value })}
                                placeholder="Enter current password"
                                required
                              />
                            </div>
                          </div>

                          <div className="zk-form-row-2">
                            <div className="zk-field-wrap">
                              <label className="zk-field-label">New Password (min 6 chars)</label>
                              <div className="zk-input-box">
                                <Lock size={15} style={{ color: '#64748b' }} />
                                <input
                                  type="password"
                                  value={pwdForm.new_password}
                                  onChange={e => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                                  placeholder="Min 6 characters"
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
                                  placeholder="Re-enter password"
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="zk-form-footer">
                          <Button type="submit" icon={ShieldCheck} variant="primary" disabled={pwdBusy}>
                            {pwdBusy ? 'Updating Password...' : 'Update My Password'}
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }}
    </DataView>
  );
}
