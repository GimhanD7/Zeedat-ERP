import { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  Mail,
  Package,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  Smartphone,
  Tag,
  User,
  UserPlus,
  UserRound,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Empty,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  SearchBox,
  Select,
  Stats,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import {
  cents,
  dateLabel,
  money,
  options,
  ref,
  rupees,
  today,
  transitions,
} from '../../utils';

const DEVICE_BRANDS = [
  'Samsung',
  'Apple',
  'Xiaomi',
  'Huawei',
  'Vivo',
  'Oppo',
  'Google',
  'OnePlus',
  'Sony',
  'Realme',
  'Honor',
  'Nokia',
  'Other',
];

const ACCESSORY_LIST = [
  { id: 'Charger', label: 'Charger' },
  { id: 'Cable', label: 'Cable' },
  { id: 'Case', label: 'Case' },
  { id: 'Screen Protector', label: 'Screen Protector' },
  { id: 'SIM Card', label: 'SIM Card' },
  { id: 'Memory Card', label: 'Memory Card' },
];

const actionBranch = ctx => ctx.branch || ctx.branches[0]?.id;
const itemFilter = (item, q, fields) =>
  fields.some(key =>
    String(item[key] || '')
      .toLowerCase()
      .includes(q.trim().toLowerCase())
  );

export function Repairs({ ctx }) {
  const tech = ctx.user.role === 'technician';
  const [mainTab, setMainTab] = useState('New Repair Job');
  const [intakeBranch, setIntakeBranch] = useState(actionBranch(ctx));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(ctx.intent === 'overdue' ? 'Overdue' : 'All jobs');
  const [view, setView] = useState('Board');
  const [assigned, setAssigned] = useState('');
  const [detail, setDetail] = useState(null);
  const [receiptJob, setReceiptJob] = useState(null);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [brand, setBrand] = useState('Samsung');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [issue, setIssue] = useState('');
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState('');
  const [advance, setAdvance] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().substring(0, 10);
  });
  const [technicianId, setTechnicianId] = useState('');
  const [repairStatus, setRepairStatus] = useState('Pending Intake');
  const [accessories, setAccessories] = useState({
    Charger: true,
    Case: true,
  });
  const [otherAccessory, setOtherAccessory] = useState('');
  const [printReceiptOnSave, setPrintReceiptOnSave] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const state = useData(ctx, {
    jobs: 'repairs',
    ...(!tech
      ? {
          customers: ['customers', { branch: intakeBranch }],
          technicians: ['technicians', { branch: intakeBranch }],
        }
      : {}),
  });

  // Next Job Number
  const nextJobNumber = useMemo(() => {
    const list = state.data?.jobs || [];
    const highestId = list.reduce((max, j) => Math.max(max, j.id || 0), 0);
    return `RJ-${String(highestId + 1 || 6521).padStart(6, '0')}`;
  }, [state.data?.jobs]);

  // Selected Customer Object
  const currentCustomer = useMemo(() => {
    const list = state.data?.customers || [];
    return list.find(c => String(c.id) === String(selectedCustomerId)) || list[0] || null;
  }, [state.data?.customers, selectedCustomerId]);

  // Sync phone when customer changes
  useEffect(() => {
    if (currentCustomer && !customerPhone) {
      setCustomerPhone(currentCustomer.phone || '');
      setSelectedCustomerId(String(currentCustomer.id));
    }
  }, [currentCustomer]);

  const handleCustomerChange = id => {
    setSelectedCustomerId(id);
    const list = state.data?.customers || [];
    const found = list.find(c => String(c.id) === String(id));
    if (found) {
      setCustomerPhone(found.phone || '');
    }
  };

  // Past repairs for selected customer
  const customerPastRepairs = useMemo(() => {
    if (!currentCustomer) return [];
    const all = state.data?.jobs || [];
    return all.filter(j => String(j.customer_id) === String(currentCustomer.id));
  }, [state.data?.jobs, currentCustomer]);

  const customerTotalJobs = customerPastRepairs.length;
  const customerCompletedJobs = customerPastRepairs.filter(j => j.status === 'Completed' || j.status === 'Delivered').length;
  const customerInProgressJobs = customerPastRepairs.filter(j => !['Completed', 'Delivered', 'Cancelled'].includes(j.status)).length;

  const toggleAccessory = id => {
    setAccessories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const clearForm = () => {
    setModel('');
    setSerial('');
    setIssue('');
    setNotes('');
    setEstimate('');
    setAdvance('');
    setOtherAccessory('');
    setFormError('');
  };

  // Handle Create Repair Job
  const handleCreateJob = async e => {
    if (e) e.preventDefault();
    setFormError('');

    if (!selectedCustomerId && !currentCustomer) {
      setFormError('Please select or add a customer.');
      return;
    }

    if (!issue.trim()) {
      setFormError('Please describe the reported issue.');
      return;
    }

    const deviceName = `${brand} ${model}`.trim() || brand;
    const chosenAccessories = Object.entries(accessories)
      .filter(([_, checked]) => checked)
      .map(([name]) => name);
    if (otherAccessory.trim()) {
      chosenAccessories.push(otherAccessory.trim());
    }

    setSubmitting(true);
    try {
      const res = await ctx.mutate('repair.create', {
        branch: intakeBranch,
        customer_id: selectedCustomerId || currentCustomer?.id,
        technician_id: technicianId ? Number(technicianId) : null,
        brand,
        model,
        device: deviceName,
        serial: serial.trim(),
        issue: issue.trim(),
        notes: notes.trim(),
        accessories: chosenAccessories.join(', '),
        estimate: cents(estimate || 0),
        advance_payment: cents(advance || 0),
        due_date: dueDate || today(),
        status: repairStatus === 'Pending Intake' ? 'Received' : repairStatus,
      });

      ctx.setNotice(`Repair Job ${res.job_number || 'RJ-' + res.id} created successfully.`);

      if (printReceiptOnSave) {
        setReceiptJob({
          id: res.id,
          job_number: res.job_number || `RJ-${String(res.id).padStart(6, '0')}`,
          customer: currentCustomer?.name || 'Customer',
          phone: customerPhone,
          device: deviceName,
          serial,
          issue,
          notes,
          accessories: chosenAccessories.join(', '),
          estimate: cents(estimate || 0),
          advance: cents(advance || 0),
          due_date: dueDate,
          status: res.status || 'Received',
          created_at: new Date().toISOString(),
        });
      }

      clearForm();
      state.refresh();
    } catch (err) {
      setFormError(err.message || 'Failed to create repair job.');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Customer Creation
  const handleNewCustomerModal = () => {
    ctx.setDialog({
      title: 'Add New Customer',
      description: 'Create customer account for repair job registration.',
      route: 'customer.save',
      fields: [
        { name: 'name', label: 'Customer Full Name' },
        { name: 'phone', label: 'Mobile Phone Number' },
        { name: 'email', label: 'Email Address', type: 'email', optional: true },
        { name: 'notes', label: 'Notes', type: 'textarea', optional: true },
      ],
      values: { branch: intakeBranch },
      onSuccess: newCust => {
        state.refresh();
        if (newCust?.id) {
          setSelectedCustomerId(String(newCust.id));
          setCustomerPhone(newCust.phone || '');
        }
        ctx.setNotice('Customer registered successfully.');
      },
    });
  };

  // Quick Customer Edit
  const handleEditCustomerModal = () => {
    if (!currentCustomer) return;
    ctx.setDialog({
      title: `Edit Customer: ${currentCustomer.name}`,
      route: 'customer.save',
      values: { ...currentCustomer, branch: intakeBranch },
      fields: [
        { name: 'name', label: 'Customer Full Name' },
        { name: 'phone', label: 'Mobile Phone Number' },
        { name: 'email', label: 'Email Address', type: 'email', optional: true },
        { name: 'notes', label: 'Notes', type: 'textarea', optional: true },
      ],
      onSuccess: () => {
        state.refresh();
        ctx.setNotice('Customer profile updated.');
      },
    });
  };

  const openJob = job => {
    const next = (transitions[job.status] || []).filter(s =>
      tech
        ? !['Cancelled', 'Delivered'].includes(s)
        : ctx.user.role === 'cashier'
          ? s === 'Delivered'
          : true
    );
    if (!next.length) {
      setDetail(job);
      return;
    }
    ctx.setDialog({
      title: (job.job_number || ref('REP', job.id)) + ' · ' + job.device,
      description: job.customer + ' · ' + job.issue + ' · ' + job.status,
      route: 'repair.status',
      submit: 'Update status',
      values: { branch: job.branch_id, id: job.id },
      fields: [{ name: 'status', label: 'Next status', choices: next, full: true }],
      onSuccess: () => state.refresh(),
    });
  };

  const groups = [
    ['Received', ['Received'], 'blue'],
    ['Diagnosing', ['Diagnosing', 'Awaiting Approval'], 'blue'],
    ['In progress', ['Waiting for Parts', 'In Progress', 'Testing'], 'amber'],
    ['Ready', ['Ready'], 'violet'],
    ['Delivered', ['Delivered', 'Cancelled'], 'mint'],
  ];

  return (
    <DataView state={state}>
      {({ jobs = [], customers = [], technicians = [] }) => {
        const active = jobs.filter(j => !['Delivered', 'Cancelled'].includes(j.status));
        const overdue = active.filter(j => j.due_date < today());
        const due = active.filter(j => j.due_date === today());
        const results = jobs.filter(
          j =>
            (!assigned || String(j.technician_id) === assigned) &&
            (filter === 'All jobs' || (filter === 'Overdue' ? overdue.includes(j) : due.includes(j))) &&
            (itemFilter(j, query, ['customer', 'device', 'issue', 'serial', 'customer_phone']) ||
              (j.job_number || ref('REP', j.id)).toLowerCase().includes(query.toLowerCase()))
        );

        return (
          <>
            <Heading
              title={mainTab === 'New Repair Job' ? 'Repair Intake / New Repair Job' : 'Repair Desk & Workshop'}
              description={
                mainTab === 'New Repair Job'
                  ? 'Create a new repair job with customer, device and issue details.'
                  : 'Manage, diagnose and track customer devices from intake to delivery.'
              }
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  icon={FileText}
                  variant={mainTab === 'Repair Jobs' ? 'primary' : 'outline'}
                  onClick={() => setMainTab('Repair Jobs')}
                >
                  Repair Jobs ({jobs.length})
                </Button>
                <Button
                  icon={Plus}
                  variant={mainTab === 'New Repair Job' ? 'primary' : 'outline'}
                  onClick={() => setMainTab('New Repair Job')}
                >
                  New Repair Job
                </Button>
              </div>
            </Heading>

            {/* TAB 1: NEW REPAIR JOB INTAKE WORKSPACE (MATCHING THE SCREENSHOT) */}
            {mainTab === 'New Repair Job' && (
              <div className="zk-repairs-layout">
                {/* LEFT COLUMN: FORM */}
                <div className="zk-repair-form-card">
                  <div className="zk-repair-card-header">
                    <div className="zk-repair-icon-box">
                      <Wrench size={20} />
                    </div>
                    <h3>New Repair Job</h3>
                  </div>

                  {formError && (
                    <Alert tone="red" style={{ marginBottom: '16px' }}>
                      {formError}
                    </Alert>
                  )}

                  <form onSubmit={handleCreateJob}>
                    {/* SECTION 1: JOB & CUSTOMER DETAILS */}
                    <div className="zk-section-box">
                      <div className="zk-section-header">
                        <div className="zk-section-title">
                          <User size={16} style={{ color: '#0d9488' }} />
                          <span>Job & Customer Details</span>
                        </div>
                        <button
                          type="button"
                          className="zk-edit-btn"
                          onClick={handleNewCustomerModal}
                          style={{ color: '#0d9488', borderColor: '#ccfbf1', background: '#f0fdfa' }}
                        >
                          <Plus size={12} />
                          <span>New Customer</span>
                        </button>
                      </div>

                      <div className="zk-form-row-3">
                        {/* Job Number */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Job Number <span className="req">*</span>
                          </label>
                          <div className="zk-input-box" style={{ background: '#f8fafc' }}>
                            <input
                              type="text"
                              value={nextJobNumber}
                              readOnly
                              style={{ color: '#0f172a', fontWeight: 700 }}
                            />
                            <Barcode size={18} style={{ color: '#64748b' }} />
                          </div>
                        </div>

                        {/* Customer Dropdown */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Customer <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <UserRound size={16} style={{ color: '#64748b' }} />
                            <select
                              value={selectedCustomerId || currentCustomer?.id || ''}
                              onChange={e => handleCustomerChange(e.target.value)}
                              required
                            >
                              {customers.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} {c.phone ? `(${c.phone})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Phone Number */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Phone Number <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <Phone size={16} style={{ color: '#64748b' }} />
                            <input
                              type="text"
                              value={customerPhone}
                              onChange={e => setCustomerPhone(e.target.value)}
                              placeholder="077 123 4567"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: DEVICE DETAILS */}
                    <div className="zk-section-box">
                      <div className="zk-section-header">
                        <div className="zk-section-title">
                          <Smartphone size={16} style={{ color: '#0d9488' }} />
                          <span>Device Details</span>
                        </div>
                      </div>

                      <div className="zk-form-row-3">
                        {/* Brand */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Device Brand <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <Smartphone size={16} style={{ color: '#64748b' }} />
                            <select value={brand} onChange={e => setBrand(e.target.value)} required>
                              {DEVICE_BRANDS.map(b => (
                                <option key={b} value={b}>
                                  {b}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Model */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Device Model <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <input
                              type="text"
                              value={model}
                              onChange={e => setModel(e.target.value)}
                              placeholder="e.g. Galaxy S21 (SM-G991B)"
                              required
                            />
                          </div>
                        </div>

                        {/* IMEI or Serial Number */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">IMEI or Serial Number</label>
                          <div className="zk-input-box">
                            <Barcode size={16} style={{ color: '#64748b' }} />
                            <input
                              type="text"
                              value={serial}
                              onChange={e => setSerial(e.target.value)}
                              placeholder="356789123456789"
                            />
                            <button
                              type="button"
                              className="zk-edit-btn"
                              style={{ padding: '2px 6px', border: 'none', background: 'transparent' }}
                              title="Scan Barcode / QR Code"
                              onClick={() => {
                                const dummy = '35' + Math.floor(Math.random() * 8999999999999 + 1000000000000);
                                setSerial(dummy);
                              }}
                            >
                              <QrCode size={16} style={{ color: '#0d9488' }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: ISSUE DESCRIPTION & ACCESSORIES */}
                    <div className="zk-section-box">
                      <div className="zk-form-row-2">
                        {/* Left: Issue Description */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={14} style={{ color: '#eab308' }} />
                            <span>
                              Issue Description <span className="req">*</span>
                            </span>
                          </label>
                          <div className="zk-textarea-box">
                            <textarea
                              rows={3}
                              maxLength={500}
                              value={issue}
                              onChange={e => setIssue(e.target.value)}
                              placeholder="Screen not turning on after a drop. No display, but phone vibrates when powered..."
                              required
                            />
                            <span className="zk-char-counter">{issue.length} / 500</span>
                          </div>
                        </div>

                        {/* Right: Accessories Handed Over */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Package size={14} style={{ color: '#0d9488' }} />
                            <span>Accessories Handed Over</span>
                          </label>
                          <div className="zk-accessories-grid">
                            {ACCESSORY_LIST.map(({ id, label }) => (
                              <label key={id} className="zk-acc-checkbox">
                                <input
                                  type="checkbox"
                                  checked={Boolean(accessories[id])}
                                  onChange={() => toggleAccessory(id)}
                                />
                                <span>{label}</span>
                              </label>
                            ))}
                            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                              <label className="zk-acc-checkbox">
                                <input
                                  type="checkbox"
                                  checked={Boolean(otherAccessory)}
                                  onChange={e => !e.target.checked && setOtherAccessory('')}
                                />
                                <span>Others</span>
                              </label>
                              <input
                                type="text"
                                style={{
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  flex: 1,
                                }}
                                placeholder="Specify..."
                                value={otherAccessory}
                                onChange={e => setOtherAccessory(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: PHYSICAL CONDITION NOTES & FINANCIALS */}
                    <div className="zk-section-box">
                      <div className="zk-form-row-2">
                        {/* Physical Condition Notes */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FileText size={14} style={{ color: '#0d9488' }} />
                            <span>Physical Condition Notes</span>
                          </label>
                          <div className="zk-textarea-box">
                            <textarea
                              rows={3}
                              maxLength={500}
                              value={notes}
                              onChange={e => setNotes(e.target.value)}
                              placeholder="Minor dents on frame, visible scratch on back cover. Screen has hairline cracks..."
                            />
                            <span className="zk-char-counter">{notes.length} / 500</span>
                          </div>
                        </div>

                        {/* Estimated Cost & Advance */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start' }}>
                          <div className="zk-field-wrap">
                            <label className="zk-field-label">
                              Estimated Cost (LKR) <span className="req">*</span>
                            </label>
                            <div className="zk-input-box">
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>LKR</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={estimate}
                                onChange={e => setEstimate(e.target.value)}
                                placeholder="74,500.00"
                                required
                              />
                            </div>
                          </div>

                          <div className="zk-field-wrap">
                            <label className="zk-field-label">Advance Payment (LKR)</label>
                            <div className="zk-input-box">
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>LKR</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={advance}
                                onChange={e => setAdvance(e.target.value)}
                                placeholder="20,000.00"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 5: DATES, TECHNICIAN & STATUS */}
                    <div className="zk-section-box">
                      <div className="zk-form-row-3">
                        {/* Promised Date */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Promised Date <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <input
                              type="date"
                              value={dueDate}
                              min={today()}
                              onChange={e => setDueDate(e.target.value)}
                              required
                            />
                            <Calendar size={16} style={{ color: '#64748b' }} />
                          </div>
                        </div>

                        {/* Assigned Technician */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Assigned Technician</label>
                          <div className="zk-input-box">
                            <UserRound size={16} style={{ color: '#64748b' }} />
                            <select value={technicianId} onChange={e => setTechnicianId(e.target.value)}>
                              <option value="">Unassigned</option>
                              {technicians.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Repair Status */}
                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Repair Status</label>
                          <div className="zk-input-box">
                            <Wrench size={16} style={{ color: '#64748b' }} />
                            <select value={repairStatus} onChange={e => setRepairStatus(e.target.value)}>
                              <option value="Pending Intake">Pending Intake</option>
                              <option value="Received">Received</option>
                              <option value="Diagnosing">Diagnosing</option>
                              <option value="Waiting for Parts">Waiting for Parts</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Completed">Completed</option>
                              <option value="Delivered">Delivered</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM ACTION BAR */}
                    <div className="zk-repair-footer">
                      <label className="zk-acc-checkbox" style={{ fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={printReceiptOnSave}
                          onChange={e => setPrintReceiptOnSave(e.target.checked)}
                        />
                        <span>Print intake receipt after saving</span>
                      </label>

                      <div className="zk-footer-actions">
                        <button type="button" className="zk-btn-outline" onClick={clearForm}>
                          <RefreshCw size={15} />
                          <span>Clear</span>
                        </button>
                        <button type="submit" className="zk-btn-complete" disabled={submitting}>
                          <FileText size={16} />
                          <span>{submitting ? 'Creating Job...' : 'Create Repair Job'}</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* RIGHT COLUMN: CUSTOMER PROFILE & REPAIR HISTORY */}
                <div className="zk-customer-sidebar">
                  {/* Card 1: Customer Profile */}
                  <div className="zk-cust-card">
                    <div className="zk-cust-profile-header">
                      <div className="zk-cust-avatar">
                        {currentCustomer ? currentCustomer.name.substring(0, 2).toUpperCase() : 'CU'}
                      </div>
                      <div className="zk-cust-details">
                        <h4>{currentCustomer?.name || 'No Customer Selected'}</h4>
                        <div className="zk-cust-contact">
                          <div className="zk-cust-contact-item">
                            <Phone size={13} style={{ color: '#0d9488' }} />
                            <span>{currentCustomer?.phone || 'No phone recorded'}</span>
                          </div>
                          {currentCustomer?.email && (
                            <div className="zk-cust-contact-item">
                              <Mail size={13} style={{ color: '#0d9488' }} />
                              <span>{currentCustomer.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {currentCustomer && (
                        <button
                          type="button"
                          className="zk-edit-btn"
                          onClick={handleEditCustomerModal}
                          title="Edit Customer"
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>

                    {/* Mini Stats */}
                    <div className="zk-cust-kpi-row">
                      <div className="zk-kpi-box">
                        <div className="zk-kpi-top">
                          <Package size={12} />
                          <span>Total Jobs</span>
                        </div>
                        <div className="zk-kpi-val">{customerTotalJobs}</div>
                      </div>

                      <div className="zk-kpi-box">
                        <div className="zk-kpi-top">
                          <CheckCircle2 size={12} style={{ color: '#15803d' }} />
                          <span>Completed</span>
                        </div>
                        <div className="zk-kpi-val" style={{ color: '#15803d' }}>
                          {customerCompletedJobs}
                        </div>
                      </div>

                      <div className="zk-kpi-box">
                        <div className="zk-kpi-top">
                          <Clock size={12} style={{ color: '#0284c7' }} />
                          <span>In Progress</span>
                        </div>
                        <div className="zk-kpi-val" style={{ color: '#0284c7' }}>
                          {customerInProgressJobs}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Previous Repairs (Customer History) */}
                  <div className="zk-cust-card">
                    <div className="zk-section-header" style={{ marginBottom: '8px' }}>
                      <div className="zk-section-title" style={{ fontSize: '13px' }}>
                        <Clock size={15} style={{ color: '#0d9488' }} />
                        <span>Previous Repairs (Customer History)</span>
                      </div>
                      <button
                        type="button"
                        className="zk-edit-btn"
                        style={{ border: 'none', background: 'transparent', color: '#0284c7', padding: 0 }}
                        onClick={() => setMainTab('Repair Jobs')}
                      >
                        View All →
                      </button>
                    </div>

                    <div className="zk-history-list">
                      {customerPastRepairs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '12.5px' }}>
                          No past repair jobs recorded for this customer.
                        </div>
                      ) : (
                        customerPastRepairs.slice(0, 5).map(job => (
                          <div
                            key={job.id}
                            className="zk-history-item"
                            onClick={() => openJob(job)}
                            title="Click to view details"
                          >
                            <div className="zk-history-icon">
                              <Smartphone size={18} />
                            </div>
                            <div className="zk-history-info">
                              <div className="zk-history-top">
                                <span className="zk-history-job-no">
                                  {job.job_number || ref('REP', job.id)}
                                </span>
                                <Badge
                                  tone={
                                    job.status === 'Completed' || job.status === 'Delivered'
                                      ? 'green'
                                      : 'blue'
                                  }
                                >
                                  {job.status}
                                </Badge>
                              </div>
                              <div className="zk-history-model">{job.device}</div>
                              <div className="zk-history-meta">
                                <span>📅 {dateLabel(job.created_at || job.due_date)}</span>
                                <span>💰 {money(job.estimate)}</span>
                              </div>
                            </div>
                            <ChevronRight size={16} style={{ color: '#94a3b8' }} />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: REPAIR JOBS BOARD & TABLE VIEW */}
            {mainTab === 'Repair Jobs' && (
              <>
                <Stats
                  items={[
                    {
                      icon: Wrench,
                      label: 'Open Repairs',
                      value: active.length,
                      note: 'Active service jobs',
                    },
                    {
                      icon: AlertTriangle,
                      label: 'Overdue Repairs',
                      value: overdue.length,
                      note: 'Past promised date',
                      tone: 'red',
                    },
                    {
                      icon: CheckCircle2,
                      label: 'Delivered',
                      value: jobs.filter(j => j.status === 'Delivered').length,
                      note: 'Handed to customer',
                      tone: 'mint',
                    },
                    {
                      icon: CalendarDays,
                      label: 'Due Today',
                      value: due.length,
                      note: dateLabel(today()),
                      tone: 'blue',
                    },
                  ]}
                />

                <Panel className="repair-tools">
                  <div className="panel-tools toolbar">
                    <SearchBox
                      value={query}
                      onChange={setQuery}
                      placeholder="Search job, device, phone or customer…"
                    />
                    {!tech && (
                      <Select
                        aria-label="Technician"
                        value={assigned}
                        onChange={e => setAssigned(e.target.value)}
                        blank="All technicians"
                        options={[
                          ...new Map(
                            jobs
                              .filter(j => j.technician_id)
                              .map(j => [j.technician_id, j.technician])
                          ).entries(),
                        ]}
                      />
                    )}
                    <FilterTabs
                      choices={['All jobs', 'Overdue', 'Due today']}
                      value={filter}
                      onChange={setFilter}
                    />
                    <FilterTabs
                      choices={['Board', 'List']}
                      value={view}
                      onChange={setView}
                    />
                  </div>
                </Panel>

                {view === 'Board' ? (
                  <div className="kanban">
                    {groups.map(([group, states, tone]) => {
                      const list = results.filter(j => states.includes(j.status));
                      return (
                        <section className={'kanban-column ' + tone} key={group}>
                          <header>
                            <strong>{group}</strong>
                            <Badge tone={tone === 'mint' ? 'green' : tone}>{list.length}</Badge>
                          </header>
                          <div className="kanban-list">
                            {list.map(j => (
                              <article className="repair-card" key={j.id}>
                                <div>
                                  <strong className="mono">{j.job_number || ref('REP', j.id)}</strong>
                                  <Badge>{j.status}</Badge>
                                </div>
                                <h3>{j.device}</h3>
                                <p>{j.issue}</p>
                                <small>
                                  <UserRound size={14} />
                                  {j.customer}
                                </small>
                                <small>
                                  <CalendarDays size={14} />
                                  {dateLabel(j.due_date)}
                                </small>
                                <div>
                                  <b>{money(j.estimate)}</b>
                                  <Button
                                    className="icon-only"
                                    icon={ArrowRight}
                                    aria-label={'Open ' + (j.job_number || ref('REP', j.id))}
                                    onClick={() => openJob(j)}
                                  />
                                </div>
                              </article>
                            ))}
                            {!list.length && <Empty>No jobs</Empty>}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <Panel title="Repair Jobs Directory" icon={Wrench}>
                    <Table
                      rows={results}
                      onRow={openJob}
                      columns={[
                        ['Job #', r => r.job_number || ref('REP', r.id)],
                        ['Device', 'device'],
                        ['Customer', r => `${r.customer} ${r.customer_phone ? '(' + r.customer_phone + ')' : ''}`],
                        ['Technician', r => r.technician || 'Unassigned'],
                        ['Promised Date', r => dateLabel(r.due_date)],
                        ['Estimate', r => money(r.estimate)],
                        ['Status', r => <Badge>{r.status}</Badge>],
                      ]}
                    />
                  </Panel>
                )}
              </>
            )}

            {/* DETAIL MODAL */}
            {detail && (
              <Modal
                title={(detail.job_number || ref('REP', detail.id)) + ' · ' + detail.device}
                description={detail.customer + ' · ' + detail.status}
                onClose={() => setDetail(null)}
              >
                <div className="modal-body">
                  <p>
                    <strong>Reported Issue: </strong>
                    {detail.issue}
                  </p>
                  {detail.notes && (
                    <p style={{ marginTop: '8px' }}>
                      <strong>Condition Notes: </strong>
                      {detail.notes}
                    </p>
                  )}
                  {detail.accessories && (
                    <p style={{ marginTop: '8px' }}>
                      <strong>Accessories Received: </strong>
                      {detail.accessories}
                    </p>
                  )}
                  <div className="detail" style={{ marginTop: '12px' }}>
                    <div>
                      <small>Technician</small>
                      <strong>{detail.technician || 'Unassigned'}</strong>
                    </div>
                    <div>
                      <small>Promised Date</small>
                      <strong>{dateLabel(detail.due_date)}</strong>
                    </div>
                    <div>
                      <small>Estimate</small>
                      <strong>{money(detail.estimate)}</strong>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <Button onClick={() => setDetail(null)}>Close</Button>
                </div>
              </Modal>
            )}

            {/* PRINT INTAKE JOB CARD MODAL */}
            {receiptJob && (
              <Modal
                title={`Intake Receipt · ${receiptJob.job_number}`}
                description="Print repair customer intake card"
                onClose={() => setReceiptJob(null)}
              >
                <div className="modal-body">
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '16px',
                      color: '#0f172a',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>ZEEDAT - REPAIR INTAKE RECEIPT</h3>
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#64748b' }}>
                        {ctx.branch?.name || 'Main Branch'} · Tel: 011 234 5678
                      </p>
                      <h4 style={{ margin: '6px 0 0', fontSize: '15px', color: '#0d9488' }}>
                        {receiptJob.job_number}
                      </h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Customer: </span>
                        <strong>{receiptJob.customer}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Phone: </span>
                        <strong>{receiptJob.phone}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Device: </span>
                        <strong>{receiptJob.device}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>IMEI/Serial: </span>
                        <strong>{receiptJob.serial || 'N/A'}</strong>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginBottom: '8px' }}>
                      <div><strong>Issue: </strong>{receiptJob.issue}</div>
                      {receiptJob.accessories && (
                        <div style={{ marginTop: '4px' }}>
                          <strong>Accessories: </strong>{receiptJob.accessories}
                        </div>
                      )}
                      {receiptJob.notes && (
                        <div style={{ marginTop: '4px' }}>
                          <strong>Condition: </strong>{receiptJob.notes}
                        </div>
                      )}
                    </div>

                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <span>Estimated Cost: </span>
                        <strong>{money(receiptJob.estimate)}</strong>
                      </div>
                      <div>
                        <span>Advance Paid: </span>
                        <strong style={{ color: '#15803d' }}>{money(receiptJob.advance)}</strong>
                      </div>
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                      Promised Date: <strong>{dateLabel(receiptJob.due_date)}</strong>
                    </div>

                    <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '16px', paddingTop: '8px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
                      Please bring this slip when collecting your device. Thank you for choosing Zeedat.
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <Button variant="outline" onClick={() => setReceiptJob(null)}>
                    Close
                  </Button>
                  <Button icon={Printer} variant="primary" onClick={() => window.print()}>
                    Print Slip
                  </Button>
                </div>
              </Modal>
            )}
          </>
        );
      }}
    </DataView>
  );
}
