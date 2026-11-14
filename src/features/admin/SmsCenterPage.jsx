import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  MessageSquare,
  MessageSquareText,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Heading,
  Modal,
  SearchBox,
  SearchSelect,
  Select,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { money, printHtmlDocument, timeLabel, today } from '../../utils';
import './smsCenter.css';

const SINGLE_TEMPLATES = [
  {
    id: 'promo',
    kind: 'promo',
    title: 'Special Offer / Promotion',
    desc: 'Announce discounts or new arrivals',
    text: 'Hi {name}, special offer at {shop}! Visit us today for exclusive deals on mobile phones & accessories. Thank you!',
  },
  {
    id: 'reminder',
    kind: 'reminder',
    title: 'Credit / Balance Reminder',
    desc: 'Remind customer of outstanding balance',
    text: 'Hi {name}, friendly reminder from {shop}: your outstanding account balance is {credit}. Please settle at your earliest convenience. Thank you!',
  },
  {
    id: 'repair_ready',
    kind: 'ready',
    title: 'Repair Ready for Pickup',
    desc: 'Notify device repair completion',
    text: 'Hi {name}, your device repair at {shop} is READY for collection. Please bring your job slip when visiting. Thank you!',
  },
  {
    id: 'reservation',
    kind: 'reservation',
    title: 'Reserved Item Ready',
    desc: 'Alert customer that reserved stock arrived',
    text: 'Hi {name}, your reserved item at {shop} is ready for handover. Please visit our store to complete collection. Thank you!',
  },
  {
    id: 'loyalty',
    kind: 'promo',
    title: 'Loyalty Points Update',
    desc: 'Share customer loyalty point balance',
    text: 'Hi {name}, thank you for shopping at {shop}! You currently have {points} loyalty points available to redeem on your next visit.',
  },
];

const GATEWAY_PRESETS = [
  {
    label: 'Notify.lk (GET URL)',
    url: 'https://app.notify.lk/api/v1/send?user_id=YOUR_USER_ID&api_key={api_key}&sender_id={sender_id}&to={phone}&message={message}',
  },
  {
    label: 'Text.lk / eSMS (POST JSON)',
    url: 'https://app.text.lk/api/v3/sms/send',
  },
  {
    label: 'Dialog / Custom GET Template',
    url: 'https://api.example.lk/sms/send?key={api_key}&mask={sender_id}&to={phone}&text={message}',
  },
];

const statusTone = status => {
  const s = String(status || '').toLowerCase();
  if (s === 'sent') return 'green';
  if (s === 'rejected') return 'red';
  if (s === 'failed' || s === 'no_phone') return 'amber';
  if (s === 'manual' || s === 'queued') return 'blue';
  return 'slate';
};

const statusLabel = status => {
  const s = String(status || '').toLowerCase();
  if (s === 'sent') return 'Sent';
  if (s === 'rejected') return 'Rejected';
  if (s === 'failed') return 'Failed';
  if (s === 'no_phone') return 'No Phone';
  if (s === 'manual') return 'Logged / Manual';
  if (s === 'queued') return 'Queued';
  return status || 'Logged';
};

const kindLabel = kind => {
  const k = String(kind || '').toLowerCase();
  if (k === 'intake') return 'Repair Intake';
  if (k === 'ready') return 'Repair Ready';
  if (k === 'delivered') return 'Repair Delivered';
  if (k === 'single') return 'Single SMS';
  if (k === 'bulk') return 'Bulk SMS';
  if (k === 'promo') return 'Promotion';
  if (k === 'reminder') return 'Payment Reminder';
  if (k === 'reservation') return 'Reservation';
  if (k === 'test') return 'Gateway Test';
  return kind || 'SMS';
};

const hasValidPhone = phone => {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.length >= 9;
};

export function SmsCenterPage({ ctx }) {
  const state = useData(ctx, {
    smsLogs: 'sms.logs',
    customers: 'customers',
    settings: 'settings',
  });

  const [activeTab, setActiveTab] = useState(
    ctx.intent === 'settings'
      ? 'settings'
      : ctx.intent === 'single'
        ? 'single'
        : ctx.intent === 'bulk'
          ? 'bulk'
          : 'history'
  );

  useEffect(() => {
    if (['settings', 'single', 'bulk', 'history'].includes(ctx.intent)) {
      setActiveTab(ctx.intent);
      ctx.clearIntent?.();
    }
  }, [ctx.intent]);

  // History tab filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectModalRow, setRejectModalRow] = useState(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('Rejected by manager / Invalid number');
  const [actionBusyId, setActionBusyId] = useState(null);
  const [pageError, setPageError] = useState('');

  // Single SMS composer state
  const [singleCustomerId, setSingleCustomerId] = useState('');
  const [singleName, setSingleName] = useState('');
  const [singlePhone, setSinglePhone] = useState('');
  const [singleKind, setSingleKind] = useState('single');
  const [singleMessage, setSingleMessage] = useState('');
  const [singleRejectMode, setSingleRejectMode] = useState(false);
  const [singleRejectReason, setSingleRejectReason] = useState('Customer number rejected / DND');
  const [singleBusy, setSingleBusy] = useState(false);

  // Bulk SMS state
  const [bulkFilter, setBulkFilter] = useState('with_phone');
  const [bulkSearch, setBulkSearch] = useState('');
  const [selectedCustIds, setSelectedCustIds] = useState(() => new Set());
  const [bulkKind, setBulkKind] = useState('bulk');
  const [bulkMessage, setBulkMessage] = useState(
    'Hi {name}, special update from {shop}! Visit us for the latest mobile phones, repairs & accessories. Thank you!'
  );
  const [bulkBusy, setBulkBusy] = useState(false);

  // SMS Gateway Settings state
  const [gwForm, setGwForm] = useState({
    sms_enabled: false,
    sms_provider_url: '',
    sms_api_key: '',
    sms_sender_id: 'ZEEDAT',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingGw, setSavingGw] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    const s = state.data?.settings;
    if (s) {
      setGwForm({
        sms_enabled: Boolean(Number(s.sms_enabled || 0)),
        sms_provider_url: s.sms_provider_url || '',
        sms_api_key: s.sms_api_key || '',
        sms_sender_id: s.sms_sender_id || s.shop_name || 'ZEEDAT',
      });
    }
  }, [state.data?.settings]);

  // Pre-select customers with valid phone when customers load for the first time
  useEffect(() => {
    const list = state.data?.customers;
    if (Array.isArray(list) && list.length > 0 && selectedCustIds.size === 0) {
      const validIds = list.filter(c => hasValidPhone(c.phone)).map(c => Number(c.id));
      setSelectedCustIds(new Set(validIds));
    }
  }, [state.data?.customers]);

  const exportSmsCsv = rows => {
    const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['ID', 'Date & Time', 'Customer', 'Phone', 'Type', 'Status', 'Reject / Error Reason', 'Branch', 'Message'];
    const lines = [
      headers.map(csvCell).join(','),
      ...rows.map(r =>
        [
          r.id,
          r.created_at,
          r.customer_name || '',
          r.phone || '',
          kindLabel(r.kind),
          statusLabel(r.status),
          r.error_message || '',
          r.branch_name || '',
          r.message || '',
        ]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sms_history_${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printSmsReport = (rows, shopName = 'ZEEDAT POS') => {
    const esc = v =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const trs = rows
      .slice(0, 400)
      .map(
        r => `<tr>
          <td>#${esc(r.id)}<br/><small>${esc(timeLabel(r.created_at))}</small></td>
          <td><strong>${esc(r.customer_name)}</strong><br/>${esc(r.phone)}</td>
          <td>${esc(kindLabel(r.kind))}</td>
          <td><strong>${esc(statusLabel(r.status))}</strong>${r.error_message ? `<br/><small style="color:#b91c1c">${esc(r.error_message)}</small>` : ''}</td>
          <td>${esc(r.message)}</td>
        </tr>`
      )
      .join('');
    printHtmlDocument(`<!DOCTYPE html><html><head><meta charset="utf-8" /><title>SMS History & Rejected Log</title><style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#0f172a;margin:14mm 12mm}h1{margin:0 0 4px;font-size:16px}p{margin:0 0 12px;color:#475569;font-size:10.5px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top;font-size:10px}th{background:#f8fafc}</style></head><body><h1>${esc(shopName)} — Complete SMS History & Rejected Log</h1><p>Printed: ${esc(new Date().toLocaleString())} · Total Records: ${rows.length}</p><table><thead><tr><th>ID / Time</th><th>Customer & Phone</th><th>Type</th><th>Status / Reason</th><th>Message</th></tr></thead><tbody>${trs || '<tr><td colspan="5">No SMS records found.</td></tr>'}</tbody></table></body></html>`);
  };

  return (
    <DataView state={state}>
      {({ smsLogs = [], customers = [], settings = {} }) => {
        const shopName = settings.shop_name || 'ZEEDAT POS';

        // Counts for KPIs & filter badges
        const sentCount = smsLogs.filter(l => l.status === 'sent').length;
        const rejectedCount = smsLogs.filter(l => l.status === 'rejected').length;
        const failedCount = smsLogs.filter(l => l.status === 'failed' || l.status === 'no_phone').length;
        const manualCount = smsLogs.filter(l => l.status === 'manual' || l.status === 'queued').length;
        const customersWithPhone = customers.filter(c => hasValidPhone(c.phone));
        const customersWithoutPhone = customers.filter(c => !hasValidPhone(c.phone));
        const customersWithCredit = customers.filter(c => Number(c.credit || 0) > 0);
        const customersWithPoints = customers.filter(c => Number(c.loyalty_points || 0) > 0);

        const filteredLogs = smsLogs.filter(l => {
          const st = String(l.status || '').toLowerCase();
          const kd = String(l.kind || '').toLowerCase();
          if (statusFilter === 'sent' && st !== 'sent') return false;
          if (statusFilter === 'rejected' && st !== 'rejected') return false;
          if (statusFilter === 'failed' && st !== 'failed' && st !== 'no_phone') return false;
          if (statusFilter === 'manual' && st !== 'manual' && st !== 'queued') return false;
          if (statusFilter === 'rejected_or_failed' && st !== 'rejected' && st !== 'failed' && st !== 'no_phone') return false;

          if (kindFilter === 'repair' && !['intake', 'ready', 'delivered', 'repair'].includes(kd)) return false;
          if (kindFilter === 'single_bulk' && !['single', 'bulk', 'promo', 'reminder', 'reservation', 'test'].includes(kd)) return false;
          if (kindFilter !== 'all' && kindFilter !== 'repair' && kindFilter !== 'single_bulk' && kd !== kindFilter) return false;

          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const hay = `${l.id} ${l.customer_name || ''} ${l.phone || ''} ${l.message || ''} ${l.error_message || ''} ${l.kind || ''} ${l.branch_name || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        // Single SMS customer resolution & preview
        const selectedSingleCustomer = customers.find(c => Number(c.id) === Number(singleCustomerId));
        const previewSingleText = (singleMessage || 'Type or choose a template to preview your SMS…')
          .replace(/\{name\}/g, singleName || selectedSingleCustomer?.name || 'Customer')
          .replace(/\{shop\}/g, shopName)
          .replace(/\{phone\}/g, singlePhone || selectedSingleCustomer?.phone || '077XXXXXXX')
          .replace(/\{credit\}/g, money(selectedSingleCustomer?.credit || 0))
          .replace(/\{points\}/g, String(selectedSingleCustomer?.loyalty_points || 0));
        const singleSegments = Math.max(1, Math.ceil(previewSingleText.length / 160));

        // Bulk SMS filtered customers
        const filteredBulkCustomers = customers.filter(c => {
          if (bulkFilter === 'with_phone' && !hasValidPhone(c.phone)) return false;
          if (bulkFilter === 'missing_phone' && hasValidPhone(c.phone)) return false;
          if (bulkFilter === 'credit_due' && Number(c.credit || 0) <= 0) return false;
          if (bulkFilter === 'loyalty' && Number(c.loyalty_points || 0) <= 0) return false;
          if (bulkSearch.trim()) {
            const q = bulkSearch.toLowerCase();
            const hay = `${c.name || ''} ${c.phone || ''} ${c.branch || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        const selectedBulkCustomers = customers.filter(c => selectedCustIds.has(Number(c.id)));
        const selectedValidCount = selectedBulkCustomers.filter(c => hasValidPhone(c.phone)).length;
        const selectedInvalidCount = selectedBulkCustomers.length - selectedValidCount;
        const sampleBulkCust = selectedBulkCustomers[0] || customers[0] || {
          name: 'Kamal Perera',
          phone: '0771234567',
          credit: 250000,
          loyalty_points: 120,
          branch: 'Main Branch',
        };
        const previewBulkText = (bulkMessage || '')
          .replace(/\{name\}/g, sampleBulkCust.name || 'Customer')
          .replace(/\{shop\}/g, shopName)
          .replace(/\{phone\}/g, sampleBulkCust.phone || '')
          .replace(/\{credit\}/g, money(sampleBulkCust.credit || 0))
          .replace(/\{points\}/g, String(sampleBulkCust.loyalty_points || 0))
          .replace(/\{branch\}/g, sampleBulkCust.branch || '');

        const handleSelectSingleCustomer = custId => {
          setSingleCustomerId(custId);
          const found = customers.find(c => String(c.id) === String(custId));
          if (found) {
            setSingleName(found.name || '');
            setSinglePhone(found.phone || '');
          }
        };

        const handleSendSingle = async e => {
          e.preventDefault();
          if (singleBusy) return;
          if (!singleMessage.trim()) {
            setPageError('Enter an SMS message before sending.');
            return;
          }
          setSingleBusy(true);
          setPageError('');
          try {
            const res = await ctx.mutate('sms.send', {
              customer_id: singleCustomerId ? Number(singleCustomerId) : undefined,
              customer_name: singleName.trim() || selectedSingleCustomer?.name || 'Direct Recipient',
              phone: singlePhone.trim(),
              kind: singleKind,
              message: previewSingleText,
              reject_immediately: singleRejectMode,
              reject_reason: singleRejectMode ? singleRejectReason : undefined,
            });
            if (res.status === 'sent') {
              ctx.setNotice(`SMS sent to ${res.phone}.`);
            } else if (res.status === 'rejected') {
              ctx.setNotice(`SMS recorded as Rejected (${res.error || 'Rejected'}).`);
            } else if (res.status === 'failed') {
              ctx.setNotice(`SMS failed (${res.error || 'Gateway error'}) and logged to history.`);
            } else {
              ctx.setNotice(`SMS logged for ${res.phone} (Gateway in manual/offline mode).`);
            }
            setSingleMessage('');
            setSingleRejectMode(false);
            state.refresh();
            setActiveTab('history');
          } catch (err) {
            setPageError(err.message);
          } finally {
            setSingleBusy(false);
          }
        };

        const handleSendBulk = async e => {
          e.preventDefault();
          if (bulkBusy) return;
          if (!selectedBulkCustomers.length) {
            setPageError('Select at least one customer from the list.');
            return;
          }
          if (!bulkMessage.trim()) {
            setPageError('Enter a bulk SMS message.');
            return;
          }
          setBulkBusy(true);
          setPageError('');
          try {
            const res = await ctx.mutate('sms.bulk', {
              kind: bulkKind,
              message: bulkMessage.trim(),
              recipients: selectedBulkCustomers.map(c => ({
                customer_id: c.id,
                customer_name: c.name,
                phone: c.phone || '',
                credit: c.credit || 0,
                loyalty_points: c.loyalty_points || 0,
                branch: c.branch || '',
              })),
            });
            ctx.setNotice(
              `Bulk SMS processed (${res.total} customers): ${res.sent} sent, ${res.manual} logged, ${res.rejected} rejected, ${res.failed} failed.`
            );
            state.refresh();
            setActiveTab('history');
          } catch (err) {
            setPageError(err.message);
          } finally {
            setBulkBusy(false);
          }
        };

        const handleManageSms = async (id, operation, reason = '') => {
          setActionBusyId(id);
          setPageError('');
          try {
            const res = await ctx.mutate('sms.manage', { id, operation, reason });
            if (operation === 'delete') {
              ctx.setNotice(`SMS #${id} deleted.`);
            } else if (operation === 'reject') {
              ctx.setNotice(`SMS #${id} marked as Rejected.`);
              setRejectModalRow(null);
            } else if (operation === 'mark_sent') {
              ctx.setNotice(`SMS #${id} marked as Sent.`);
            } else if (operation === 'retry') {
              ctx.setNotice(
                res.status === 'sent'
                  ? `SMS #${id} re-sent successfully.`
                  : `SMS #${id} retry status: ${statusLabel(res.status)}.`
              );
            }
            state.refresh();
          } catch (err) {
            setPageError(err.message);
          } finally {
            setActionBusyId(null);
          }
        };

        const handleSaveGateway = async e => {
          e.preventDefault();
          setSavingGw(true);
          setPageError('');
          try {
            await ctx.mutate('sms.settings.save', {
              sms_enabled: gwForm.sms_enabled ? 1 : 0,
              sms_provider_url: gwForm.sms_provider_url.trim(),
              sms_api_key: gwForm.sms_api_key.trim(),
              sms_sender_id: gwForm.sms_sender_id.trim() || 'ZEEDAT',
            });
            ctx.setNotice('SMS Gateway settings saved.');
            state.refresh();
          } catch (err) {
            setPageError(err.message);
          } finally {
            setSavingGw(false);
          }
        };

        const handleTestGateway = async () => {
          if (!testPhone.trim()) {
            setPageError('Enter a phone number to send a test SMS.');
            return;
          }
          setTestBusy(true);
          setPageError('');
          try {
            const res = await ctx.mutate('sms.send', {
              phone: testPhone.trim(),
              customer_name: 'Gateway Test',
              kind: 'test',
              message: `Test SMS from ${shopName} (${gwForm.sms_sender_id || 'ZEEDAT'}). Your SMS Center is connected!`,
            });
            ctx.setNotice(
              res.status === 'sent'
                ? `Test SMS delivered to ${res.phone}.`
                : `Test SMS logged with status: ${statusLabel(res.status)}${res.error ? ` (${res.error})` : ''}.`
            );
            state.refresh();
          } catch (err) {
            setPageError(err.message);
          } finally {
            setTestBusy(false);
          }
        };

        return (
          <div className="sms-page">
            <Heading
              title="SMS Center & Customer Messaging"
              description="Manage SMS Gateway settings, send Single or Bulk SMS to customers, and review complete SMS history including Rejected & Failed messages."
            />

            <Alert>{pageError}</Alert>

            {/* TOP 5 KPI CARDS */}
            <div className="sms-kpi-grid">
              <div
                className="sms-kpi-card"
                onClick={() => {
                  setActiveTab('history');
                  setStatusFilter('all');
                }}
              >
                <div className="sms-kpi-icon teal">
                  <MessageSquareText size={22} />
                </div>
                <div className="sms-kpi-meta">
                  <small>Total SMS History</small>
                  <strong>{smsLogs.length}</strong>
                  <span>All recorded messages</span>
                </div>
              </div>

              <div
                className="sms-kpi-card"
                onClick={() => {
                  setActiveTab('history');
                  setStatusFilter('sent');
                }}
              >
                <div className="sms-kpi-icon green">
                  <CheckCircle2 size={22} />
                </div>
                <div className="sms-kpi-meta">
                  <small>Sent / Delivered</small>
                  <strong>{sentCount}</strong>
                  <span>Confirmed gateway deliveries</span>
                </div>
              </div>

              <div
                className="sms-kpi-card"
                onClick={() => {
                  setActiveTab('history');
                  setStatusFilter('rejected');
                }}
              >
                <div className="sms-kpi-icon red">
                  <Ban size={22} />
                </div>
                <div className="sms-kpi-meta">
                  <small>Rejected &amp; Failed SMS</small>
                  <strong>{rejectedCount + failedCount}</strong>
                  <span>
                    {rejectedCount} rejected · {failedCount} failed
                  </span>
                </div>
              </div>

              <div
                className="sms-kpi-card"
                onClick={() => {
                  setActiveTab('history');
                  setStatusFilter('manual');
                }}
              >
                <div className="sms-kpi-icon amber">
                  <Clock3 size={22} />
                </div>
                <div className="sms-kpi-meta">
                  <small>Logged / Queued</small>
                  <strong>{manualCount}</strong>
                  <span>Ready to retry or send</span>
                </div>
              </div>

              <div
                className="sms-kpi-card"
                onClick={() => setActiveTab('bulk')}
              >
                <div className="sms-kpi-icon blue">
                  <Users size={22} />
                </div>
                <div className="sms-kpi-meta">
                  <small>Customer Audience</small>
                  <strong>{customersWithPhone.length}</strong>
                  <span>of {customers.length} customers have phone</span>
                </div>
              </div>
            </div>

            {/* MAIN NAVIGATION TABS */}
            <div className="sms-tabs-bar">
              <div className="sms-tabs-list" role="tablist">
                <button
                  type="button"
                  className={'sms-tab-btn' + (activeTab === 'history' ? ' active' : '')}
                  onClick={() => setActiveTab('history')}
                >
                  <FileText size={16} />
                  <span>All SMS &amp; Rejected History</span>
                  <span className="sms-tab-count">{smsLogs.length}</span>
                </button>

                <button
                  type="button"
                  className={'sms-tab-btn' + (activeTab === 'single' ? ' active' : '')}
                  onClick={() => setActiveTab('single')}
                >
                  <Send size={16} />
                  <span>Single SMS</span>
                </button>

                <button
                  type="button"
                  className={'sms-tab-btn' + (activeTab === 'bulk' ? ' active' : '')}
                  onClick={() => setActiveTab('bulk')}
                >
                  <Users size={16} />
                  <span>Bulk Customer SMS</span>
                  <span className="sms-tab-count">{customers.length}</span>
                </button>

                <button
                  type="button"
                  className={'sms-tab-btn' + (activeTab === 'settings' ? ' active' : '')}
                  onClick={() => setActiveTab('settings')}
                >
                  <Settings size={16} />
                  <span>SMS Gateway Settings</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Badge tone={gwForm.sms_enabled ? 'green' : 'amber'}>
                  {gwForm.sms_enabled ? 'Gateway Enabled' : 'Manual / Log Mode'}
                </Badge>
                <Button icon={RefreshCw} variant="ghost" onClick={state.refresh}>
                  Refresh
                </Button>
              </div>
            </div>

            {/* =========================================================
                TAB 1: COMPLETE SMS HISTORY & REJECTED / FAILED SMS
            ========================================================= */}
            {activeTab === 'history' && (
              <div className="sms-card">
                <div className="sms-card-head">
                  <div className="sms-card-title">
                    <MessageSquare size={18} />
                    <span>All SMS History, Delivery Status &amp; Rejected SMS Log</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button
                      icon={Send}
                      variant="soft"
                      onClick={() => {
                        setSingleRejectMode(false);
                        setActiveTab('single');
                      }}
                    >
                      New Single SMS
                    </Button>
                    <Button
                      icon={Ban}
                      variant="outline-red"
                      onClick={() => {
                        setSingleRejectMode(true);
                        setActiveTab('single');
                      }}
                    >
                      Log Rejected SMS
                    </Button>
                    <Button icon={Download} variant="ghost" onClick={() => exportSmsCsv(filteredLogs)}>
                      Export CSV
                    </Button>
                    <Button
                      icon={Printer}
                      variant="soft"
                      onClick={() => printSmsReport(filteredLogs, shopName)}
                    >
                      Print Report
                    </Button>
                  </div>
                </div>

                {/* STATUS FILTER PILLS */}
                <div className="sms-filter-pills">
                  {[
                    ['all', `All SMS (${smsLogs.length})`, false],
                    ['rejected', `Rejected SMS (${rejectedCount})`, true],
                    ['failed', `Failed SMS (${failedCount})`, true],
                    ['rejected_or_failed', `All Rejected & Failed (${rejectedCount + failedCount})`, true],
                    ['sent', `Sent / Delivered (${sentCount})`, false],
                    ['manual', `Logged / Queued (${manualCount})`, false],
                  ].map(([key, label, isDanger]) => (
                    <button
                      type="button"
                      key={key}
                      className={
                        'sms-pill' +
                        (statusFilter === key ? ' active' : '') +
                        (isDanger ? ' danger' : '')
                      }
                      onClick={() => setStatusFilter(key)}
                    >
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* SEARCH & TYPE FILTER TOOLBAR */}
                <div className="sms-toolbar">
                  <div className="sms-toolbar-search">
                    <SearchBox
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder="Search by customer name, phone number, message text, or reject reason…"
                    />
                  </div>
                  <div style={{ minWidth: '190px' }}>
                    <Select
                      aria-label="Filter by SMS Type"
                      value={kindFilter}
                      options={[
                        ['all', 'All SMS Categories'],
                        ['single_bulk', 'Single, Bulk & Promotions'],
                        ['repair', 'All Repair SMS'],
                        ['single', 'Single SMS Only'],
                        ['bulk', 'Bulk SMS Only'],
                        ['promo', 'Promotions Only'],
                        ['reminder', 'Payment Reminders Only'],
                        ['intake', 'Repair Intake Only'],
                        ['ready', 'Repair Ready Only'],
                      ]}
                      onChange={e => setKindFilter(e.target.value)}
                    />
                  </div>
                </div>

                <Table
                  rows={filteredLogs}
                  empty="No SMS records match the selected filter."
                  columns={[
                    [
                      'SMS # & Date',
                      r => (
                        <div>
                          <strong>#{r.id}</strong>
                          <div className="muted" style={{ fontSize: '11px' }}>
                            {timeLabel(r.created_at)}
                          </div>
                          <div className="muted" style={{ fontSize: '10.5px' }}>
                            {r.branch_name || 'All Branches'}
                          </div>
                        </div>
                      ),
                    ],
                    [
                      'Customer & Phone',
                      r => (
                        <div>
                          <strong>{r.customer_name || 'Direct Recipient'}</strong>
                          <div
                            style={{
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              color: '#0f766e',
                              fontWeight: 700,
                            }}
                          >
                            {r.phone || '—'}
                          </div>
                          {r.repair_id && (
                            <Badge tone="slate">Repair #{r.repair_id}</Badge>
                          )}
                        </div>
                      ),
                    ],
                    [
                      'Category',
                      r => <Badge tone="blue">{kindLabel(r.kind)}</Badge>,
                    ],
                    [
                      'SMS Message',
                      r => (
                        <div className="sms-msg-cell">
                          <div>{r.message}</div>
                          {r.error_message && (
                            <div className="sms-error-pill">
                              <AlertTriangle size={12} />
                              <span>Reason: {r.error_message}</span>
                            </div>
                          )}
                        </div>
                      ),
                    ],
                    [
                      'Status',
                      r => (
                        <Badge tone={statusTone(r.status)}>
                          {statusLabel(r.status)}
                        </Badge>
                      ),
                    ],
                    [
                      'Actions',
                      r => (
                        <div className="row-actions">
                          <Button
                            variant="soft"
                            icon={RotateCcw}
                            disabled={actionBusyId === r.id}
                            onClick={() => handleManageSms(r.id, 'retry')}
                          >
                            Resend
                          </Button>
                          {r.status !== 'sent' && (
                            <Button
                              variant="outline"
                              icon={Check}
                              disabled={actionBusyId === r.id}
                              onClick={() => handleManageSms(r.id, 'mark_sent')}
                            >
                              Mark Sent
                            </Button>
                          )}
                          {r.status !== 'rejected' && (
                            <Button
                              variant="outline-red"
                              icon={Ban}
                              disabled={actionBusyId === r.id}
                              onClick={() => {
                                setRejectModalRow(r);
                                setRejectReasonInput(
                                  r.error_message || 'Rejected by staff / Invalid number'
                                );
                              }}
                            >
                              Reject
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            icon={Trash2}
                            disabled={actionBusyId === r.id}
                            onClick={() => handleManageSms(r.id, 'delete')}
                            title="Delete SMS log"
                          />
                        </div>
                      ),
                    ],
                  ]}
                />
              </div>
            )}

            {/* =========================================================
                TAB 2: SINGLE SMS COMPOSER
            ========================================================= */}
            {activeTab === 'single' && (
              <div className="sms-split-2">
                <form className="sms-card" onSubmit={handleSendSingle}>
                  <div className="sms-card-head">
                    <div className="sms-card-title">
                      <Send size={18} />
                      <span>Compose Single SMS to Customer or Number</span>
                    </div>
                    <Badge tone={singleRejectMode ? 'red' : 'teal'}>
                      {singleRejectMode ? 'Recording Rejected SMS' : 'Single SMS Dispatch'}
                    </Badge>
                  </div>

                  <div className="zk-form-row-2">
                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Select Customer (Search by Name or Phone)</label>
                      <SearchSelect
                        value={singleCustomerId}
                        blank="Type customer name or phone (or enter custom number below)…"
                        options={customers.map(c => [
                          String(c.id),
                          `${c.name} · ${c.phone || 'No Phone'} · ${c.branch || ''}`,
                        ])}
                        onChange={ev => handleSelectSingleCustomer(ev.target.value)}
                      />
                    </div>

                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Message Category</label>
                      <Select
                        value={singleKind}
                        options={[
                          ['single', 'General Single SMS'],
                          ['promo', 'Special Promotion / Offer'],
                          ['reminder', 'Credit / Payment Reminder'],
                          ['ready', 'Repair Ready Notification'],
                          ['reservation', 'Reservation Handover Alert'],
                        ]}
                        onChange={e => setSingleKind(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="zk-form-row-2">
                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Recipient Name</label>
                      <div className="zk-input-box">
                        <UserCheck size={15} style={{ color: '#64748b' }} />
                        <input
                          type="text"
                          placeholder="e.g. Kamal Perera"
                          value={singleName}
                          onChange={e => setSingleName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Recipient Phone Number *</label>
                      <div className="zk-input-box">
                        <Phone size={15} style={{ color: '#64748b' }} />
                        <input
                          type="text"
                          placeholder="e.g. 0771234567 or 94771234567"
                          value={singlePhone}
                          onChange={e => setSinglePhone(e.target.value)}
                          required={!singleRejectMode}
                        />
                      </div>
                    </div>
                  </div>

                  {/* QUICK TEMPLATES */}
                  <div className="zk-field-wrap">
                    <label className="zk-field-label">One-Click Quick Templates</label>
                    <div className="sms-template-grid">
                      {SINGLE_TEMPLATES.map(tpl => (
                        <button
                          type="button"
                          key={tpl.id}
                          className="sms-template-card"
                          onClick={() => {
                            setSingleKind(tpl.kind);
                            setSingleMessage(tpl.text);
                          }}
                        >
                          <strong>{tpl.title}</strong>
                          <small>{tpl.desc}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PERSONALIZATION TAGS */}
                  <div className="sms-var-bar">
                    <small>Insert Variable:</small>
                    {['{name}', '{shop}', '{phone}', '{credit}', '{points}'].map(tag => (
                      <button
                        type="button"
                        key={tag}
                        className="sms-var-chip"
                        onClick={() => setSingleMessage(prev => `${prev}${prev ? ' ' : ''}${tag}`)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">SMS Message Content *</label>
                    <div className="zk-textarea-box">
                      <textarea
                        rows={4}
                        maxLength={1000}
                        placeholder="Type the SMS message to send to this customer…"
                        value={singleMessage}
                        onChange={e => setSingleMessage(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <label className="zk-toggle-row">
                    <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
                      Mark this message as a Rejected SMS (log as rejected with reason)
                    </span>
                    <input
                      type="checkbox"
                      checked={singleRejectMode}
                      onChange={e => setSingleRejectMode(e.target.checked)}
                    />
                  </label>

                  {singleRejectMode && (
                    <div className="sms-reject-box">
                      <label className="zk-field-label" style={{ color: '#b91c1c' }}>
                        Rejection Reason *
                      </label>
                      <input
                        type="text"
                        className="input"
                        value={singleRejectReason}
                        onChange={e => setSingleRejectReason(e.target.value)}
                        placeholder="Why was this SMS rejected? (e.g. Invalid number, Customer opted out)"
                        required
                      />
                    </div>
                  )}

                  <div className="zk-form-footer">
                    <Button
                      type="submit"
                      variant={singleRejectMode ? 'outline-red' : 'primary'}
                      icon={singleRejectMode ? Ban : Send}
                      disabled={singleBusy}
                    >
                      {singleBusy
                        ? 'Processing…'
                        : singleRejectMode
                          ? 'Save as Rejected SMS'
                          : 'Send Single SMS Now'}
                    </Button>
                  </div>
                </form>

                {/* LIVE PREVIEW PANEL */}
                <div className="sms-card">
                  <div className="sms-card-head">
                    <div className="sms-card-title">
                      <Smartphone size={18} />
                      <span>Live Handset Preview</span>
                    </div>
                    <Badge tone="teal">{singleSegments} SMS Segment(s)</Badge>
                  </div>

                  <div className="sms-preview-phone">
                    <div className="sms-preview-top">
                      <span>Sender: {gwForm.sms_sender_id || 'ZEEDAT'}</span>
                      <span>To: {singlePhone || '077XXXXXXX'}</span>
                    </div>
                    <div className="sms-preview-bubble">{previewSingleText}</div>
                    <div className="sms-preview-stats">
                      <span>{previewSingleText.length} characters</span>
                      <span>{singleSegments} × 160-char SMS</span>
                    </div>
                  </div>

                  {selectedSingleCustomer && (
                    <div className="xm-calc-box">
                      <div className="xm-calc-row">
                        <span>Selected Customer</span>
                        <strong>{selectedSingleCustomer.name}</strong>
                      </div>
                      <div className="xm-calc-row">
                        <span>Phone Number</span>
                        <strong>{selectedSingleCustomer.phone || 'No Phone'}</strong>
                      </div>
                      <div className="xm-calc-row">
                        <span>Outstanding Credit</span>
                        <strong>{money(selectedSingleCustomer.credit || 0)}</strong>
                      </div>
                      <div className="xm-calc-row">
                        <span>Loyalty Points</span>
                        <strong>{selectedSingleCustomer.loyalty_points || 0} pts</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================
                TAB 3: BULK CUSTOMER SMS (ALL CUSTOMERS & FILTERS)
            ========================================================= */}
            {activeTab === 'bulk' && (
              <div className="sms-bulk-grid">
                {/* LEFT: ALL CUSTOMERS RECIPIENT SELECTOR */}
                <div className="sms-card">
                  <div className="sms-card-head">
                    <div className="sms-card-title">
                      <Users size={18} />
                      <span>1. Select Customer Recipients ({selectedCustIds.size} Selected)</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        variant="soft"
                        onClick={() =>
                          setSelectedCustIds(new Set(filteredBulkCustomers.map(c => Number(c.id))))
                        }
                      >
                        Select Filtered ({filteredBulkCustomers.length})
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setSelectedCustIds(new Set(customersWithPhone.map(c => Number(c.id))))
                        }
                      >
                        All With Phone ({customersWithPhone.length})
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedCustIds(new Set())}
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>

                  <div className="sms-filter-pills">
                    {[
                      ['all', `All Customers (${customers.length})`],
                      ['with_phone', `Valid Phone (${customersWithPhone.length})`],
                      ['missing_phone', `No / Invalid Phone (${customersWithoutPhone.length})`],
                      ['credit_due', `Credit Balance Due (${customersWithCredit.length})`],
                      ['loyalty', `Loyalty Members (${customersWithPoints.length})`],
                    ].map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        className={'sms-pill' + (bulkFilter === key ? ' active' : '')}
                        onClick={() => setBulkFilter(key)}
                      >
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>

                  <SearchBox
                    value={bulkSearch}
                    onChange={setBulkSearch}
                    placeholder="Search customers by name, phone number, or branch…"
                  />

                  <div className="sms-cust-list">
                    {filteredBulkCustomers.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                        No customers match this filter.
                      </div>
                    ) : (
                      filteredBulkCustomers.map(c => {
                        const checked = selectedCustIds.has(Number(c.id));
                        const validPhone = hasValidPhone(c.phone);
                        return (
                          <div
                            key={c.id}
                            className={'sms-cust-row' + (checked ? ' selected' : '')}
                            onClick={() => {
                              setSelectedCustIds(prev => {
                                const next = new Set(prev);
                                if (next.has(Number(c.id))) next.delete(Number(c.id));
                                else next.add(Number(c.id));
                                return next;
                              });
                            }}
                          >
                            <div className="sms-cust-left">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {}}
                                aria-label={`Select ${c.name}`}
                              />
                              <div className="sms-cust-info">
                                <strong>{c.name}</strong>
                                <small>
                                  {c.phone || 'No phone number'} · {c.branch || 'All Branches'}
                                  {Number(c.credit || 0) > 0
                                    ? ` · Credit: ${money(c.credit)}`
                                    : ''}
                                </small>
                              </div>
                            </div>

                            <div className="sms-cust-right" onClick={e => e.stopPropagation()}>
                              <Badge tone={validPhone ? 'green' : 'red'}>
                                {validPhone ? c.phone : 'Invalid / No Phone'}
                              </Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  handleSelectSingleCustomer(String(c.id));
                                  setActiveTab('single');
                                }}
                              >
                                Single SMS
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* RIGHT: BULK SMS COMPOSER & DISPATCH */}
                <form className="sms-card" onSubmit={handleSendBulk}>
                  <div className="sms-card-head">
                    <div className="sms-card-title">
                      <Sparkles size={18} />
                      <span>2. Bulk SMS Message &amp; Dispatch</span>
                    </div>
                    <Badge tone="teal">{selectedBulkCustomers.length} Recipients</Badge>
                  </div>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">Campaign / Bulk SMS Type</label>
                    <Select
                      value={bulkKind}
                      options={[
                        ['bulk', 'Bulk Store Announcement'],
                        ['promo', 'Promotional Campaign / Offer'],
                        ['reminder', 'Bulk Credit / Payment Reminder'],
                      ]}
                      onChange={e => setBulkKind(e.target.value)}
                    />
                  </div>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">Quick Bulk Templates</label>
                    <div className="sms-template-grid">
                      {SINGLE_TEMPLATES.slice(0, 4).map(tpl => (
                        <button
                          type="button"
                          key={tpl.id}
                          className="sms-template-card"
                          onClick={() => {
                            setBulkKind(tpl.kind === 'single' ? 'bulk' : tpl.kind);
                            setBulkMessage(tpl.text);
                          }}
                        >
                          <strong>{tpl.title}</strong>
                          <small>{tpl.desc}</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sms-var-bar">
                    <small>Personalize per customer:</small>
                    {['{name}', '{shop}', '{credit}', '{points}', '{branch}'].map(tag => (
                      <button
                        type="button"
                        key={tag}
                        className="sms-var-chip"
                        onClick={() => setBulkMessage(prev => `${prev}${prev ? ' ' : ''}${tag}`)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">Bulk SMS Template *</label>
                    <div className="zk-textarea-box">
                      <textarea
                        rows={4}
                        maxLength={1000}
                        value={bulkMessage}
                        onChange={e => setBulkMessage(e.target.value)}
                        placeholder="Hi {name}, special offer from {shop}…"
                        required
                      />
                    </div>
                  </div>

                  <div className="sms-preview-phone">
                    <div className="sms-preview-top">
                      <span>Sample Preview ({sampleBulkCust.name})</span>
                      <span>Sender: {gwForm.sms_sender_id || 'ZEEDAT'}</span>
                    </div>
                    <div className="sms-preview-bubble">{previewBulkText}</div>
                    <div className="sms-preview-stats">
                      <span>{previewBulkText.length} chars</span>
                      <span>{Math.max(1, Math.ceil(previewBulkText.length / 160))} SMS segment(s)</span>
                    </div>
                  </div>

                  <div className="xm-calc-box">
                    <div className="xm-calc-row">
                      <span>Total Selected Customers</span>
                      <strong>{selectedBulkCustomers.length}</strong>
                    </div>
                    <div className="xm-calc-row">
                      <span>Valid Phone Numbers (Will Send)</span>
                      <strong className="text-green">{selectedValidCount}</strong>
                    </div>
                    {selectedInvalidCount > 0 && (
                      <div className="xm-calc-row">
                        <span>Missing / Invalid Phone (Will Log as Rejected)</span>
                        <strong style={{ color: '#dc2626' }}>{selectedInvalidCount}</strong>
                      </div>
                    )}
                  </div>

                  <div className="zk-form-footer">
                    <Button
                      type="submit"
                      variant="primary"
                      icon={Send}
                      disabled={bulkBusy || selectedBulkCustomers.length === 0}
                    >
                      {bulkBusy
                        ? 'Sending Bulk SMS…'
                        : `Send Bulk SMS to ${selectedBulkCustomers.length} Customer(s)`}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* =========================================================
                TAB 4: SMS GATEWAY SETTINGS & CONNECTION TEST
            ========================================================= */}
            {activeTab === 'settings' && (
              <div className="sms-split-2">
                <form className="sms-card" onSubmit={handleSaveGateway}>
                  <div className="sms-card-head">
                    <div className="sms-card-title">
                      <Settings size={18} />
                      <span>SMS Gateway Configuration &amp; Automation</span>
                    </div>
                    <Badge tone={gwForm.sms_enabled ? 'green' : 'amber'}>
                      {gwForm.sms_enabled ? 'Live HTTP Gateway Active' : 'Manual Logging Only'}
                    </Badge>
                  </div>

                  <label className="zk-toggle-row">
                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>
                        Enable Live SMS Gateway &amp; Auto Repair Notifications
                      </strong>
                      <small style={{ color: '#64748b', fontSize: '11.5px' }}>
                        When enabled, Repair Intake, Repair Ready, Single SMS, and Bulk SMS are dispatched live through your HTTP SMS Gateway.
                      </small>
                    </div>
                    <input
                      type="checkbox"
                      checked={gwForm.sms_enabled}
                      onChange={e => setGwForm({ ...gwForm, sms_enabled: e.target.checked })}
                    />
                  </label>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">Quick Gateway Provider Presets</label>
                    <div className="sms-template-grid">
                      {GATEWAY_PRESETS.map(p => (
                        <button
                          type="button"
                          key={p.label}
                          className="sms-template-card"
                          onClick={() => setGwForm({ ...gwForm, sms_provider_url: p.url })}
                        >
                          <strong>{p.label}</strong>
                          <small>Click to populate endpoint template</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">
                      SMS Gateway Endpoint URL (GET with {'{phone}'}, {'{message}'}, {'{sender_id}'}, {'{api_key}'} or JSON POST URL)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="https://app.notify.lk/api/v1/send?user_id=...&api_key={api_key}&sender_id={sender_id}&to={phone}&message={message}"
                      value={gwForm.sms_provider_url}
                      onChange={e => setGwForm({ ...gwForm, sms_provider_url: e.target.value })}
                    />
                  </div>

                  <div className="sms-var-bar">
                    <small>URL Placeholders:</small>
                    {['{phone}', '{message}', '{sender_id}', '{api_key}'].map(ph => (
                      <button
                        type="button"
                        key={ph}
                        className="sms-var-chip"
                        onClick={() =>
                          setGwForm(prev => ({
                            ...prev,
                            sms_provider_url: `${prev.sms_provider_url}${ph}`,
                          }))
                        }
                      >
                        {ph}
                      </button>
                    ))}
                  </div>

                  <div className="zk-form-row-2">
                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Sender ID / Brand Mask</label>
                      <div className="zk-input-box">
                        <MessageSquareText size={15} style={{ color: '#64748b' }} />
                        <input
                          type="text"
                          maxLength={40}
                          placeholder="ZEEDAT"
                          value={gwForm.sms_sender_id}
                          onChange={e => setGwForm({ ...gwForm, sms_sender_id: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="zk-field-wrap">
                      <label className="zk-field-label">API Key / Bearer Token</label>
                      <div className="zk-input-box">
                        <KeyRound size={15} style={{ color: '#64748b' }} />
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="Enter gateway API key or token"
                          value={gwForm.sms_api_key}
                          onChange={e => setGwForm({ ...gwForm, sms_api_key: e.target.value })}
                        />
                        <button
                          type="button"
                          className="button ghost icon-only"
                          onClick={() => setShowApiKey(v => !v)}
                          title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                        >
                          {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="zk-form-footer">
                    <Button type="submit" variant="primary" icon={Save} disabled={savingGw}>
                      {savingGw ? 'Saving SMS Settings…' : 'Save SMS Gateway Settings'}
                    </Button>
                  </div>
                </form>

                {/* RIGHT: TEST GATEWAY CONNECTION & AUTOMATION OVERVIEW */}
                <div className="sms-card">
                  <div className="sms-card-head">
                    <div className="sms-card-title">
                      <Zap size={18} />
                      <span>Test SMS Gateway Connection</span>
                    </div>
                    <Badge tone="blue">Instant Test</Badge>
                  </div>

                  <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                    Save your gateway settings first, then enter a mobile number below to verify live delivery and inspect the result in SMS History.
                  </p>

                  <div className="zk-field-wrap">
                    <label className="zk-field-label">Test Recipient Mobile Number</label>
                    <div className="zk-input-box">
                      <Phone size={15} style={{ color: '#64748b' }} />
                      <input
                        type="text"
                        placeholder="e.g. 0771234567"
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="soft"
                    icon={Send}
                    disabled={testBusy}
                    onClick={handleTestGateway}
                  >
                    {testBusy ? 'Sending Test SMS…' : 'Send Test SMS'}
                  </Button>

                  <div className="xm-calc-box" style={{ marginTop: '8px' }}>
                    <div className="xm-calc-row">
                      <span>Repair Intake Auto-SMS</span>
                      <Badge tone={gwForm.sms_enabled ? 'green' : 'slate'}>
                        {gwForm.sms_enabled ? 'Active' : 'Manual Log'}
                      </Badge>
                    </div>
                    <div className="xm-calc-row">
                      <span>Repair Ready / Handover SMS</span>
                      <Badge tone={gwForm.sms_enabled ? 'green' : 'slate'}>
                        {gwForm.sms_enabled ? 'Active' : 'Manual Log'}
                      </Badge>
                    </div>
                    <div className="xm-calc-row">
                      <span>Single &amp; Bulk Customer SMS</span>
                      <Badge tone="green">Enabled</Badge>
                    </div>
                    <div className="xm-calc-row">
                      <span>Rejected &amp; Failed SMS Tracking</span>
                      <Badge tone="green">Enabled</Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL FOR REJECTING AN EXISTING SMS LOG WITH REASON */}
            {rejectModalRow && (
              <Modal
                title={`Reject SMS #${rejectModalRow.id}`}
                description={`Recipient: ${rejectModalRow.customer_name || 'Direct'} (${rejectModalRow.phone})`}
                onClose={() => setRejectModalRow(null)}
              >
                <div className="modal-body" style={{ display: 'grid', gap: '12px' }}>
                  <div className="xm-calc-box">
                    <small style={{ color: '#64748b', fontWeight: 700 }}>Message Content</small>
                    <div style={{ fontSize: '12.5px', color: '#0f172a' }}>
                      {rejectModalRow.message}
                    </div>
                  </div>
                  <label className="field">
                    <span>Rejection Reason *</span>
                    <input
                      value={rejectReasonInput}
                      onChange={e => setRejectReasonInput(e.target.value)}
                      placeholder="Enter reason for rejecting this SMS…"
                      required
                    />
                  </label>
                </div>
                <div className="modal-footer">
                  <Button type="button" onClick={() => setRejectModalRow(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="outline-red"
                    icon={Ban}
                    disabled={actionBusyId === rejectModalRow.id}
                    onClick={() =>
                      handleManageSms(rejectModalRow.id, 'reject', rejectReasonInput)
                    }
                  >
                    Confirm Reject SMS
                  </Button>
                </div>
              </Modal>
            )}
          </div>
        );
      }}
    </DataView>
  );
}
