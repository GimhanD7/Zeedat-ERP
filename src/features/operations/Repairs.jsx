import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Banknote,
  Barcode,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  FileText,
  Mail,
  MessageSquare,
  Package,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  User,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import { OpenRegisterModal } from '../finance/CashRegister';
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
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import {
  cents,
  dateLabel,
  money,
  printHtmlDocument,
  ref,
  rupees,
  tenders,
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

function normalizePhoneForLink(phone) {
  const digits = String(phone || '').replace(/[^0-9+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('0') && digits.length === 10) return '94' + digits.slice(1);
  return digits;
}

function statusTone(status) {
  if (status === 'Delivered') return 'green';
  if (status === 'Ready') return 'violet';
  if (status === 'Cancelled') return 'red';
  if (['In Progress', 'Testing', 'Waiting for Parts'].includes(status)) return 'amber';
  return 'blue';
}

function buildClientSmsText(job, settings, branchName, kind = 'intake') {
  const shop = settings?.shop_name || 'Zeedat';
  const branchText = branchName ? ` (${branchName})` : '';
  const jobNo = job.job_number || ref('RJ', job.id);
  const est = Number(job.final_charge || job.estimate || 0);
  const paid = Number(job.paid_amount ?? job.advance_paid ?? job.advance ?? 0);
  const bal = Math.max(0, est - paid);

  if (kind === 'delivered' || job.status === 'Delivered') {
    return `Hi ${job.customer || 'Customer'}, your ${job.device} (${jobNo}) repair is complete and handed over at ${shop}${branchText}. Total: ${money(est)}, Paid: ${money(paid)}. Thank you!`;
  }
  if (kind === 'ready' || job.status === 'Ready') {
    return `Hi ${job.customer || 'Customer'}, your ${job.device} (${jobNo}) repair at ${shop}${branchText} is READY for pickup. Total: ${money(est)}, Balance Due: ${money(bal)}.`;
  }
  return `Hi ${job.customer || 'Customer'}, we received your ${job.device} (${jobNo}) at ${shop}${branchText}. Issue: ${job.issue || 'Repair'}. Est: ${money(est)}${paid > 0 ? `, Adv Paid: ${money(paid)}` : ''}. Due: ${job.due_date || today()}. Thank you!`;
}

function printRepairSlip(job, settings, branchName, mode = 'intake') {
  const shopName = settings?.shop_name || 'ZEEDAT MOBILE & REPAIR';
  const shopPhone = settings?.shop_phone ? `Tel: ${settings.shop_phone}` : '';
  const shopAddr = settings?.shop_address || '';
  const jobNo = job.job_number || ref('RJ', job.id);
  const totalCost = Number(job.final_charge || job.estimate || 0);
  const paid = Number(job.paid_amount ?? job.advance_paid ?? job.advance ?? 0);
  const balance = Math.max(0, totalCost - paid);
  const title = mode === 'delivery' ? 'REPAIR DELIVERY & PAYMENT BILL' : 'REPAIR INTAKE RECEIPT';

  printHtmlDocument(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} - ${jobNo}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 18px; max-width: 420px; }
  .head { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .head h2 { margin: 0; font-size: 16px; letter-spacing: 0.4px; }
  .head p { margin: 3px 0; font-size: 11px; color: #475569; }
  .job-tag { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; background: #0f172a; color: #fff; font-weight: 700; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 11.5px; margin-bottom: 10px; }
  .box { border-top: 1px dashed #cbd5e1; padding: 8px 0; font-size: 11.5px; }
  .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 12px; }
  .row.total { border-top: 1.5px solid #0f172a; padding-top: 6px; margin-top: 6px; font-size: 13.5px; font-weight: 800; }
  .foot { border-top: 1px dashed #94a3b8; margin-top: 14px; padding-top: 8px; text-align: center; font-size: 10.5px; color: #64748b; }
</style>
</head>
<body>
  <div class="head">
    <h2>${shopName}</h2>
    <p>${branchName || 'Main Branch'} ${shopPhone ? '· ' + shopPhone : ''}</p>
    ${shopAddr ? `<p>${shopAddr}</p>` : ''}
    <div style="margin-top:6px;font-weight:700;font-size:11px;color:#0f766e;">${title}</div>
    <span class="job-tag">${jobNo}</span>
  </div>
  <div class="grid">
    <div><span style="color:#64748b">Customer:</span><br/><strong>${job.customer || 'Walk-in'}</strong></div>
    <div><span style="color:#64748b">Phone:</span><br/><strong>${job.phone || job.customer_phone || '—'}</strong></div>
    <div><span style="color:#64748b">Device:</span><br/><strong>${job.device || ''}</strong></div>
    <div><span style="color:#64748b">IMEI / Serial:</span><br/><strong>${job.serial || 'N/A'}</strong></div>
    <div><span style="color:#64748b">Technician:</span><br/><strong>${job.technician || 'Unassigned'}</strong></div>
    <div><span style="color:#64748b">Promised Date:</span><br/><strong>${dateLabel(job.due_date || today())}</strong></div>
  </div>
  <div class="box">
    <div><strong>Reported Issue:</strong> ${job.issue || '—'}</div>
    ${job.accessories ? `<div style="margin-top:4px;"><strong>Accessories:</strong> ${job.accessories}</div>` : ''}
    ${job.notes ? `<div style="margin-top:4px;"><strong>Notes:</strong> ${job.notes}</div>` : ''}
  </div>
  <div class="box">
    <div class="row"><span>${mode === 'delivery' ? 'Final Repair Charge' : 'Estimated Cost'}</span><strong>${money(totalCost)}</strong></div>
    <div class="row"><span>${mode === 'delivery' ? 'Total Paid' : 'Advance Paid'}</span><strong style="color:#15803d;">${money(paid)}</strong></div>
    ${job.payment_method ? `<div class="row"><span>Payment Method</span><strong>${job.payment_method}</strong></div>` : ''}
    <div class="row total"><span>Balance Due</span><span>${money(balance)}</span></div>
  </div>
  <div class="foot">
    Please bring this slip when collecting your device.<br/>
    ${settings?.receipt_footer || 'Thank you for choosing us!'}
  </div>
</body>
</html>`);
}

export function Repairs({ ctx }) {
  const tech = ctx.user.role === 'technician';
  const [mainTab, setMainTab] = useState(
    ctx.intent === 'overdue' || tech ? 'Repair Jobs' : 'New Repair Job'
  );
  const [intakeBranch, setIntakeBranch] = useState(actionBranch(ctx));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(ctx.intent === 'overdue' ? 'Overdue' : 'All jobs');
  const [view, setView] = useState('Board');
  const [assigned, setAssigned] = useState('');
  const [detail, setDetail] = useState(null);
  const [receiptJob, setReceiptJob] = useState(null);
  const [completeJob, setCompleteJob] = useState(null);
  const [statusJob, setStatusJob] = useState(null);

  // Status + Technician Modal State
  const [statusNext, setStatusNext] = useState('');
  const [statusTechId, setStatusTechId] = useState('');
  const [statusSendSms, setStatusSendSms] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Complete & Pay Modal State
  const [finalCharge, setFinalCharge] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [completeTechId, setCompleteTechId] = useState('');
  const [completeNote, setCompleteNote] = useState('');
  const [completeSendSms, setCompleteSendSms] = useState(true);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState('');

  // Intake Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [brand, setBrand] = useState('Samsung');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [issue, setIssue] = useState('');
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState('');
  const [advance, setAdvance] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('Cash');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().substring(0, 10);
  });
  const [technicianId, setTechnicianId] = useState('');
  const [repairStatus, setRepairStatus] = useState('Received');
  const [accessories, setAccessories] = useState({
    Charger: false,
    Case: false,
  });
  const [otherAccessory, setOtherAccessory] = useState('');
  const [printReceiptOnSave, setPrintReceiptOnSave] = useState(true);
  const [sendSmsOnSave, setSendSmsOnSave] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [smsSendingId, setSmsSendingId] = useState(null);
  const [openRegisterOpen, setOpenRegisterOpen] = useState(false);

  useEffect(() => {
    setIntakeBranch(actionBranch(ctx));
  }, [ctx.branch, ctx.branches]);

  useEffect(() => {
    if (ctx.intent === 'overdue') {
      setMainTab('Repair Jobs');
      setFilter('Overdue');
      ctx.clearIntent?.();
    }
  }, [ctx.intent]);

  const state = useData(ctx, {
    jobs: 'repairs',
    settings: 'settings',
    ...(!tech
      ? {
          customers: ['customers', { branch: intakeBranch || ctx.branch }],
          technicians: ['technicians', { branch: intakeBranch || ctx.branch }],
          drawer: ['drawer', { branch: intakeBranch || ctx.branch }],
        }
      : {}),
  });

  const nextJobNumber = useMemo(() => {
    const list = state.data?.jobs || [];
    const highestId = list.reduce((max, j) => Math.max(max, j.id || 0), 0);
    return `RJ-${String(highestId + 1 || 1).padStart(6, '0')}`;
  }, [state.data?.jobs]);

  const currentCustomer = useMemo(() => {
    const list = state.data?.customers || [];
    return list.find(c => String(c.id) === String(selectedCustomerId)) || list[0] || null;
  }, [state.data?.customers, selectedCustomerId]);

  useEffect(() => {
    if (currentCustomer && !selectedCustomerId) {
      setCustomerPhone(currentCustomer.phone || '');
      setSelectedCustomerId(String(currentCustomer.id));
    }
  }, [currentCustomer, selectedCustomerId]);

  const handleCustomerChange = id => {
    setSelectedCustomerId(id);
    const list = state.data?.customers || [];
    const found = list.find(c => String(c.id) === String(id));
    if (found) {
      setCustomerPhone(found.phone || '');
    }
  };

  const handlePhoneChange = val => {
    setCustomerPhone(val);
    const digits = String(val || '').replace(/\D/g, '');
    if (digits.length < 7) return;
    const list = state.data?.customers || [];
    const normalize = p => String(p || '').replace(/\D/g, '');
    let match = list.find(c => normalize(c.phone) === digits);
    if (!match && digits.length >= 9) {
      const tail9 = digits.slice(-9);
      const candidates = list.filter(c => normalize(c.phone).endsWith(tail9));
      if (candidates.length === 1) match = candidates[0];
    }
    if (!match) {
      const tail7 = digits.slice(-7);
      const candidates = list.filter(c => normalize(c.phone).endsWith(tail7));
      if (candidates.length === 1) match = candidates[0];
    }
    if (match && String(match.id) !== String(selectedCustomerId)) {
      setSelectedCustomerId(String(match.id));
    }
  };

  const customerPastRepairs = useMemo(() => {
    if (!currentCustomer) return [];
    const all = state.data?.jobs || [];
    return all.filter(j => String(j.customer_id) === String(currentCustomer.id));
  }, [state.data?.jobs, currentCustomer]);

  const customerTotalJobs = customerPastRepairs.length;
  const customerCompletedJobs = customerPastRepairs.filter(j =>
    ['Ready', 'Delivered'].includes(j.status)
  ).length;
  const customerInProgressJobs = customerPastRepairs.filter(
    j => !['Delivered', 'Cancelled'].includes(j.status)
  ).length;

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
    setAdvanceMethod('Cash');
    setOtherAccessory('');
    setFormError('');
  };

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
      .filter(([, checked]) => checked)
      .map(([name]) => name);
    if (otherAccessory.trim()) {
      chosenAccessories.push(otherAccessory.trim());
    }

    const selectedTechName =
      (state.data?.technicians || []).find(t => String(t.id) === String(technicianId))?.name || '';

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
        advance_method: advanceMethod,
        due_date: dueDate || today(),
        status: repairStatus,
        send_sms: sendSmsOnSave,
      });

      const smsNotice = res?.sms?.sent
        ? ` · Intake SMS sent to ${res.sms.phone}`
        : sendSmsOnSave
          ? ' · Customer SMS slip ready'
          : '';
      const cashNotice = cents(advance || 0) > 0 && advanceMethod === 'Cash'
        ? ' · Advance added to Cashbook'
        : '';

      ctx.setNotice(`Repair Job ${res.job_number} saved${smsNotice}${cashNotice}.`);

      if (printReceiptOnSave || sendSmsOnSave) {
        setReceiptJob({
          id: res.id,
          branch_id: intakeBranch,
          branch_name: res.branch_name || ctx.branches.find(b => b.id === intakeBranch)?.name || '',
          job_number: res.job_number,
          customer: currentCustomer?.name || 'Customer',
          phone: customerPhone || currentCustomer?.phone || '',
          device: deviceName,
          serial: serial.trim(),
          issue: issue.trim(),
          notes: notes.trim(),
          accessories: chosenAccessories.join(', '),
          technician: res.technician || selectedTechName || 'Unassigned',
          estimate: cents(estimate || 0),
          advance_paid: cents(advance || 0),
          paid_amount: cents(advance || 0),
          payment_method: cents(advance || 0) > 0 ? advanceMethod : '',
          due_date: dueDate,
          status: res.status || 'Received',
          sms: res.sms,
          sms_message: res.sms_message,
          mode: 'intake',
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

  const handleNewCustomerModal = (prefillPhone = '') => {
    const phoneVal = typeof prefillPhone === 'string' ? prefillPhone.trim() : '';
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
      values: { branch: intakeBranch, ...(phoneVal ? { phone: phoneVal } : {}) },
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

  const openStatusEditor = job => {
    const allowed = (transitions[job.status] || []).filter(s =>
      tech
        ? !['Cancelled', 'Delivered'].includes(s)
        : ctx.user.role === 'cashier'
          ? s === 'Delivered'
          : true
    );
    if (!allowed.length && tech) {
      setDetail(job);
      return;
    }
    setStatusJob(job);
    setStatusNext(allowed[0] || '');
    setStatusTechId(job.technician_id ? String(job.technician_id) : '');
    setStatusSendSms(true);
    setStatusError('');
  };

  const submitStatusUpdate = async e => {
    e.preventDefault();
    if (!statusJob) return;
    setStatusBusy(true);
    setStatusError('');
    try {
      const payload = {
        branch: statusJob.branch_id,
        id: statusJob.id,
        send_sms: statusSendSms,
      };
      if (statusNext) payload.status = statusNext;
      if (!tech) payload.technician_id = statusTechId ? Number(statusTechId) : null;

      const res = await ctx.mutate('repair.status', payload);
      ctx.setNotice(
        res?.sms?.sent
          ? `Job updated to ${res.status} · Ready SMS sent to customer.`
          : `Job ${statusJob.job_number || ref('RJ', statusJob.id)} updated.`
      );
      setStatusJob(null);
      state.refresh();
    } catch (err) {
      setStatusError(err.message || 'Failed to update job.');
    } finally {
      setStatusBusy(false);
    }
  };

  const openCompleteModal = job => {
    const estCents = Number(job.final_charge || job.estimate || 0);
    const alreadyPaid = Number(job.paid_amount ?? job.advance_paid ?? 0);
    const balance = Math.max(0, estCents - alreadyPaid);
    setCompleteJob(job);
    setFinalCharge(String(rupees(estCents)));
    setPayAmount(String(rupees(balance)));
    setPayMethod('Cash');
    setCompleteTechId(job.technician_id ? String(job.technician_id) : '');
    setCompleteNote('');
    setCompleteSendSms(true);
    setCompleteError('');
  };

  const submitCompleteAndPay = async e => {
    e.preventDefault();
    if (!completeJob) return;
    const finalCents = cents(finalCharge || 0);
    const collectCents = cents(payAmount || 0);
    setCompleteBusy(true);
    setCompleteError('');
    try {
      const res = await ctx.mutate('repair.complete', {
        branch: completeJob.branch_id,
        id: completeJob.id,
        final_charge: finalCents,
        pay_amount: collectCents,
        payment_method: payMethod,
        technician_id: completeTechId ? Number(completeTechId) : null,
        notes: completeNote.trim(),
        send_sms: completeSendSms,
      });

      const cashMsg = res.cash_movement_added
        ? ` · ${money(res.pay_amount)} added to Cashbook`
        : '';
      ctx.setNotice(`Repair ${res.job_number} completed & delivered${cashMsg}.`);

      const updatedTechName =
        (state.data?.technicians || []).find(t => String(t.id) === String(completeTechId))?.name ||
        completeJob.technician ||
        'Unassigned';

      setReceiptJob({
        ...completeJob,
        job_number: res.job_number,
        phone: completeJob.customer_phone || '',
        technician: updatedTechName,
        final_charge: res.final_charge,
        paid_amount: res.paid_amount,
        payment_method: res.payment_method,
        status: 'Delivered',
        sms: res.sms,
        sms_message: res.sms_message,
        mode: 'delivery',
      });
      setCompleteJob(null);
      state.refresh();
    } catch (err) {
      setCompleteError(err.message || 'Failed to complete and record payment.');
    } finally {
      setCompleteBusy(false);
    }
  };

  const sendJobSmsAction = async (job, kind = 'intake') => {
    setSmsSendingId(job.id);
    try {
      const res = await ctx.mutate('repair.sms', {
        branch: job.branch_id,
        id: job.id,
        kind,
      });
      if (res?.sent) {
        ctx.setNotice(`SMS sent to ${res.phone}.`);
      } else {
        setReceiptJob({
          ...job,
          job_number: job.job_number || ref('RJ', job.id),
          phone: job.customer_phone || '',
          sms: res,
          sms_message: res?.message,
          mode: job.status === 'Delivered' ? 'delivery' : 'intake',
        });
      }
      state.refresh();
    } catch (err) {
      ctx.setNotice(err.message || 'Failed to trigger SMS.');
    } finally {
      setSmsSendingId(null);
    }
  };

  const groups = [
    ['Received', ['Received'], 'blue'],
    ['Diagnosing', ['Diagnosing', 'Awaiting Approval'], 'blue'],
    ['In Progress', ['Waiting for Parts', 'In Progress', 'Testing'], 'amber'],
    ['Ready for Pickup', ['Ready'], 'violet'],
    ['Delivered / Closed', ['Delivered', 'Cancelled'], 'mint'],
  ];

  return (
    <DataView state={state}>
      {({ jobs = [], customers = [], technicians = [], settings = {}, drawer = null }) => {
        const active = jobs.filter(j => !['Delivered', 'Cancelled'].includes(j.status));
        const readyJobs = jobs.filter(j => j.status === 'Ready');
        const overdue = active.filter(j => j.due_date < today());
        const due = active.filter(j => j.due_date === today());
        const totalCollected = jobs.reduce((sum, j) => sum + Number(j.paid_amount ?? j.advance_paid ?? 0), 0);
        const openDrawer = drawer?.drawer ?? (drawer?.id ? drawer : null);

        const techFilterChoices = new Map();
        technicians.forEach(t => techFilterChoices.set(String(t.id), t.name));
        jobs.forEach(j => {
          if (j.technician_id && j.technician) {
            techFilterChoices.set(String(j.technician_id), j.technician);
          }
        });

        const results = jobs.filter(
          j =>
            (!assigned || String(j.technician_id || '') === assigned) &&
            (filter === 'All jobs' ||
              (filter === 'Overdue'
                ? overdue.includes(j)
                : filter === 'Ready'
                  ? j.status === 'Ready'
                  : due.includes(j))) &&
            (itemFilter(j, query, ['customer', 'device', 'issue', 'serial', 'customer_phone', 'technician']) ||
              (j.job_number || ref('RJ', j.id)).toLowerCase().includes(query.toLowerCase()))
        );

        const currentBranchName =
          ctx.branches.find(b => b.id === (intakeBranch || ctx.branch))?.name || 'Main Branch';

        return (
          <>
            <Heading
              title={mainTab === 'New Repair Job' ? 'Repair Intake & Customer Slip' : 'Repair Desk & Workshop'}
              description={
                mainTab === 'New Repair Job'
                  ? 'Register device intake, assign a technician, send customer SMS & print intake bill.'
                  : 'Track technician assignments, complete repairs, collect payment into Cashbook & notify customers.'
              }
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {!tech && (
                  <>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: openDrawer ? '#ecfdf5' : '#fffbeb',
                        color: openDrawer ? '#047857' : '#b45309',
                        border: `1px solid ${openDrawer ? '#a7f3d0' : '#fde68a'}`,
                      }}
                    >
                      <Banknote size={14} />
                      {openDrawer ? `Drawer Open · ${money(openDrawer.expected ?? 0)}` : 'Register Closed'}
                    </span>
                    {!openDrawer && (
                      <Button
                        icon={Banknote}
                        variant="outline"
                        onClick={() => setOpenRegisterOpen(true)}
                      >
                        Open Register
                      </Button>
                    )}
                    <Button
                      icon={Wallet}
                      variant="outline"
                      onClick={() => ctx.navigate('drawer')}
                    >
                      Cashbook & Register
                    </Button>
                  </>
                )}
                <Button
                  icon={FileText}
                  variant={mainTab === 'Repair Jobs' ? 'primary' : 'outline'}
                  onClick={() => setMainTab('Repair Jobs')}
                >
                  Workshop Jobs ({jobs.length})
                </Button>
                {!tech && (
                  <Button
                    icon={Plus}
                    variant={mainTab === 'New Repair Job' ? 'primary' : 'outline'}
                    onClick={() => setMainTab('New Repair Job')}
                  >
                    New Repair Intake
                  </Button>
                )}
              </div>
            </Heading>

            {/* TAB 1: NEW REPAIR JOB INTAKE */}
            {mainTab === 'New Repair Job' && !tech && (
              <div className="zk-repairs-layout">
                <div className="zk-repair-form-card">
                  <div className="zk-repair-card-header">
                    <div className="zk-repair-icon-box">
                      <Wrench size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0 }}>New Repair Job Intake</h3>
                      <small style={{ color: '#64748b' }}>
                        Assign technician, record advance into Cashbook, send intake SMS &amp; print customer slip
                      </small>
                    </div>
                  </div>

                  {formError && (
                    <Alert tone="red" style={{ marginBottom: '16px' }}>
                      {formError}
                    </Alert>
                  )}

                  <form onSubmit={handleCreateJob}>
                    <div className="zk-section-box">
                      <div className="zk-section-header">
                        <div className="zk-section-title">
                          <User size={16} style={{ color: '#0d9488' }} />
                          <span>Job &amp; Customer Details</span>
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

                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Customer Mobile (SMS) <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <Phone size={16} style={{ color: '#64748b' }} />
                            <input
                              type="text"
                              value={customerPhone}
                              onChange={e => handlePhoneChange(e.target.value)}
                              placeholder="077 123 4567"
                              required
                            />
                          </div>
                          {(() => {
                            const digits = String(customerPhone || '').replace(/\D/g, '');
                            if (digits.length < 7) return null;
                            if (currentCustomer) {
                              const custCredit = Number(currentCustomer.credit || 0);
                              const custOverdue =
                                custCredit > 0 &&
                                currentCustomer.next_due_date &&
                                String(currentCustomer.next_due_date).slice(0, 10) < today();
                              return (
                                <div
                                  style={{
                                    marginTop: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    fontSize: '12px',
                                  }}
                                >
                                  <span style={{ color: '#047857', fontWeight: 600 }}>
                                    Matched: {ref('CUS', currentCustomer.id)} · {currentCustomer.name}
                                  </span>
                                  {custOverdue && (
                                    <span style={{ color: '#dc2626', fontWeight: 700 }}>
                                      · Overdue Credit {money(custCredit)}
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div
                                style={{
                                  marginTop: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  fontSize: '12px',
                                }}
                              >
                                <span style={{ color: '#b45309' }}>No customer found for this number</span>
                                <button
                                  type="button"
                                  className="zk-add-new-btn"
                                  onClick={() => handleNewCustomerModal(customerPhone)}
                                >
                                  + Quick Add
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="zk-section-box">
                      <div className="zk-section-header">
                        <div className="zk-section-title">
                          <Smartphone size={16} style={{ color: '#0d9488' }} />
                          <span>Device Details</span>
                        </div>
                      </div>

                      <div className="zk-form-row-3">
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

                        <div className="zk-field-wrap">
                          <label className="zk-field-label">
                            Device Model <span className="req">*</span>
                          </label>
                          <div className="zk-input-box">
                            <input
                              type="text"
                              value={model}
                              onChange={e => setModel(e.target.value)}
                              placeholder="e.g. Galaxy S24 / iPhone 15"
                              required
                            />
                          </div>
                        </div>

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
                              title="Generate Sample Serial"
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

                    <div className="zk-section-box">
                      <div className="zk-form-row-2">
                        <div className="zk-field-wrap">
                          <label className="zk-field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={14} style={{ color: '#eab308' }} />
                            <span>
                              Reported Issue <span className="req">*</span>
                            </span>
                          </label>
                          <div className="zk-textarea-box">
                            <textarea
                              rows={3}
                              maxLength={500}
                              value={issue}
                              onChange={e => setIssue(e.target.value)}
                              placeholder="Describe fault, symptoms, or repair work required..."
                              required
                            />
                            <span className="zk-char-counter">{issue.length} / 500</span>
                          </div>
                        </div>

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

                    <div className="zk-section-box">
                      <div className="zk-form-row-2">
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
                              placeholder="Minor scratches, frame dents, screen cracks..."
                            />
                            <span className="zk-char-counter">{notes.length} / 500</span>
                          </div>
                        </div>

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
                                placeholder="0.00"
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
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          {cents(advance || 0) > 0 && (
                            <div className="zk-field-wrap" style={{ gridColumn: '1 / -1' }}>
                              <label className="zk-field-label">Advance Payment Method (Posts Cash to Cashbook)</label>
                              <div className="zk-input-box">
                                <Banknote size={15} style={{ color: '#0d9488' }} />
                                <select value={advanceMethod} onChange={e => setAdvanceMethod(e.target.value)}>
                                  {tenders.map(m => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="zk-section-box">
                      <div className="zk-form-row-3">
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

                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Assigned Technician</label>
                          <div className="zk-input-box">
                            <Wrench size={16} style={{ color: '#0d9488' }} />
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

                        <div className="zk-field-wrap">
                          <label className="zk-field-label">Initial Status</label>
                          <div className="zk-input-box">
                            <Wrench size={16} style={{ color: '#64748b' }} />
                            <select value={repairStatus} onChange={e => setRepairStatus(e.target.value)}>
                              <option value="Received">Received</option>
                              <option value="Diagnosing">Diagnosing</option>
                              <option value="Awaiting Approval">Awaiting Approval</option>
                              <option value="Waiting for Parts">Waiting for Parts</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Testing">Testing</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="zk-repair-footer">
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <label className="zk-acc-checkbox" style={{ fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={printReceiptOnSave}
                            onChange={e => setPrintReceiptOnSave(e.target.checked)}
                          />
                          <span>Open intake bill after saving</span>
                        </label>
                        <label className="zk-acc-checkbox" style={{ fontSize: '13px' }}>
                          <input
                            type="checkbox"
                            checked={sendSmsOnSave}
                            onChange={e => setSendSmsOnSave(e.target.checked)}
                          />
                          <span>Send customer confirmation SMS</span>
                        </label>
                      </div>

                      <div className="zk-footer-actions">
                        <button type="button" className="zk-btn-outline" onClick={clearForm}>
                          <RefreshCw size={15} />
                          <span>Clear</span>
                        </button>
                        <button type="submit" className="zk-btn-complete" disabled={submitting}>
                          <FileText size={16} />
                          <span>{submitting ? 'Saving Job...' : 'Receive Device & Print Bill'}</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* RIGHT SIDEBAR: CUSTOMER PROFILE & HISTORY */}
                <div className="zk-customer-sidebar">
                  <div className="zk-cust-card">
                    <div className="zk-cust-profile-header">
                      <div className="zk-cust-avatar">
                        {currentCustomer ? currentCustomer.name.substring(0, 2).toUpperCase() : 'CU'}
                      </div>
                      <div className="zk-cust-details">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0 }}>{currentCustomer?.name || 'No Customer Selected'}</h4>
                          {currentCustomer && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: '6px',
                                background: '#f1f5f9',
                                color: '#475569',
                              }}
                            >
                              {ref('CUS', currentCustomer.id)}
                            </span>
                          )}
                        </div>
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

                    {currentCustomer && Number(currentCustomer.credit || 0) > 0 && (() => {
                      const custCredit = Number(currentCustomer.credit || 0);
                      const custOverdue =
                        currentCustomer.next_due_date &&
                        String(currentCustomer.next_due_date).slice(0, 10) < today();
                      return (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: custOverdue ? '#fef2f2' : '#fffbeb',
                            border: `1px solid ${custOverdue ? '#fecaca' : '#fde68a'}`,
                            color: custOverdue ? '#b91c1c' : '#92400e',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                            <AlertTriangle size={14} />
                            {custOverdue ? 'Overdue Credit' : 'Open Credit'}
                            {currentCustomer.next_due_date
                              ? ` · Due ${dateLabel(currentCustomer.next_due_date)}`
                              : ''}
                          </span>
                          <strong>{money(custCredit)}</strong>
                        </div>
                      );
                    })()}

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
                          <span>Active</span>
                        </div>
                        <div className="zk-kpi-val" style={{ color: '#0284c7' }}>
                          {customerInProgressJobs}
                        </div>
                      </div>
                    </div>

                    {currentCustomer && (
                      <>
                        <div className="zk-cust-kpi-row" style={{ marginTop: '8px' }}>
                          <div className="zk-kpi-box">
                            <div className="zk-kpi-top">
                              <FileText size={12} />
                              <span>Bills ({currentCustomer.sales_count || 0})</span>
                            </div>
                            <div className="zk-kpi-val" style={{ fontSize: '13px' }}>
                              {money(currentCustomer.total || 0)}
                            </div>
                          </div>
                          <div className="zk-kpi-box">
                            <div className="zk-kpi-top">
                              <Wallet size={12} style={{ color: '#0d9488' }} />
                              <span>Wallet</span>
                            </div>
                            <div className="zk-kpi-val" style={{ fontSize: '13px', color: '#0d9488' }}>
                              {money(currentCustomer.wallet_balance || 0)}
                            </div>
                          </div>
                          <div className="zk-kpi-box">
                            <div className="zk-kpi-top">
                              <Award size={12} style={{ color: '#7c3aed' }} />
                              <span>Points</span>
                            </div>
                            <div className="zk-kpi-val" style={{ fontSize: '13px', color: '#7c3aed' }}>
                              {currentCustomer.loyalty_points || 0}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            icon={ArrowRight}
                            variant="outline"
                            onClick={() =>
                              ctx.navigate(
                                'customers',
                                Number(currentCustomer.credit || 0) > 0 ? 'credit' : undefined
                              )
                            }
                          >
                            View Customer & Credit
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="zk-cust-card">
                    <div className="zk-section-header" style={{ marginBottom: '8px' }}>
                      <div className="zk-section-title" style={{ fontSize: '13px' }}>
                        <Clock size={15} style={{ color: '#0d9488' }} />
                        <span>Previous Repairs</span>
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
                            onClick={() => setDetail(job)}
                            title="Click to inspect"
                          >
                            <div className="zk-history-icon">
                              <Smartphone size={18} />
                            </div>
                            <div className="zk-history-info">
                              <div className="zk-history-top">
                                <span className="zk-history-job-no">
                                  {job.job_number || ref('RJ', job.id)}
                                </span>
                                <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                              </div>
                              <div className="zk-history-model">{job.device}</div>
                              <div className="zk-history-meta">
                                <span>Tech: {job.technician || 'Unassigned'}</span>
                                <span>{money(job.final_charge || job.estimate)}</span>
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

            {/* TAB 2: MODERN WORKSHOP BOARD & DIRECTORY */}
            {(mainTab === 'Repair Jobs' || tech) && (
              <div className="zk-dashboard-wrap">
                <div className="zk-cb-kpi-grid">
                  <div className="zk-cb-kpi-tile slate">
                    <div className="zk-cb-kpi-top">
                      <span>Open Workshop Jobs</span>
                      <Wrench size={17} />
                    </div>
                    <strong>{active.length}</strong>
                    <small>{due.length} promised today</small>
                  </div>

                  <div className="zk-cb-kpi-tile teal">
                    <div className="zk-cb-kpi-top">
                      <span>Ready for Pickup</span>
                      <CheckCircle2 size={17} />
                    </div>
                    <strong>{readyJobs.length}</strong>
                    <small>Awaiting payment &amp; handover</small>
                  </div>

                  <div className="zk-cb-kpi-tile red">
                    <div className="zk-cb-kpi-top">
                      <span>Overdue Jobs</span>
                      <AlertTriangle size={17} />
                    </div>
                    <strong>{overdue.length}</strong>
                    <small>Past promised date</small>
                  </div>

                  <div className="zk-cb-kpi-tile green">
                    <div className="zk-cb-kpi-top">
                      <span>Repair Revenue Collected</span>
                      <Banknote size={17} />
                    </div>
                    <strong>{money(totalCollected)}</strong>
                    <small>{jobs.filter(j => j.status === 'Delivered').length} delivered</small>
                  </div>
                </div>

                <Panel className="repair-tools">
                  <div className="panel-tools toolbar">
                    <SearchBox
                      value={query}
                      onChange={setQuery}
                      placeholder="Search job #, device, technician, phone or customer…"
                    />
                    {!tech && (
                      <Select
                        aria-label="Technician"
                        value={assigned}
                        onChange={e => setAssigned(e.target.value)}
                        blank="All technicians"
                        options={[...techFilterChoices.entries()]}
                      />
                    )}
                    <FilterTabs
                      choices={['All jobs', 'Ready', 'Overdue', 'Due today']}
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
                            {list.map(j => {
                              const estCents = Number(j.final_charge || j.estimate || 0);
                              const paidCents = Number(j.paid_amount ?? j.advance_paid ?? 0);
                              const balCents = Math.max(0, estCents - paidCents);
                              const canComplete = !tech && !['Delivered', 'Cancelled'].includes(j.status);

                              return (
                                <article className="repair-card zk-repair-modern-card" key={j.id}>
                                  <div className="zk-repair-card-top">
                                    <strong className="mono">{j.job_number || ref('RJ', j.id)}</strong>
                                    <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                                  </div>
                                  <h3 style={{ margin: '4px 0 2px' }}>{j.device}</h3>
                                  <p className="zk-repair-issue">{j.issue}</p>

                                  <div className="zk-repair-meta-pills">
                                    <span className="zk-repair-tech-pill">
                                      <Wrench size={12} />
                                      <span>Tech: {j.technician || 'Unassigned'}</span>
                                    </span>
                                    <span className="zk-repair-cust-pill">
                                      <UserRound size={12} />
                                      <span>{j.customer}</span>
                                    </span>
                                    <span
                                      className={`zk-repair-date-pill ${
                                        j.due_date < today() && !['Delivered', 'Cancelled'].includes(j.status)
                                          ? 'overdue'
                                          : ''
                                      }`}
                                    >
                                      <CalendarDays size={12} />
                                      <span>{dateLabel(j.due_date)}</span>
                                    </span>
                                  </div>

                                  <div className="zk-repair-money-row">
                                    <div>
                                      <small>Total</small>
                                      <b>{money(estCents)}</b>
                                    </div>
                                    <div>
                                      <small>Paid</small>
                                      <b style={{ color: '#15803d' }}>{money(paidCents)}</b>
                                    </div>
                                    <div>
                                      <small>Balance</small>
                                      <b style={{ color: balCents > 0 ? '#dc2626' : '#0f766e' }}>
                                        {money(balCents)}
                                      </b>
                                    </div>
                                  </div>

                                  <div className="zk-repair-card-actions">
                                    {canComplete && (
                                      <button
                                        type="button"
                                        className="zk-repair-pay-btn"
                                        onClick={() => openCompleteModal(j)}
                                      >
                                        <Banknote size={14} />
                                        <span>Complete &amp; Pay</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="zk-repair-mini-btn"
                                      title="Update Status / Assign Technician"
                                      onClick={() => openStatusEditor(j)}
                                    >
                                      <ArrowRight size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="zk-repair-mini-btn"
                                      title="Print Repair Bill"
                                      onClick={() =>
                                        setReceiptJob({
                                          ...j,
                                          job_number: j.job_number || ref('RJ', j.id),
                                          phone: j.customer_phone || '',
                                          sms_message: buildClientSmsText(
                                            j,
                                            settings,
                                            j.branch_name || currentBranchName,
                                            j.status === 'Delivered' ? 'delivered' : 'intake'
                                          ),
                                          mode: j.status === 'Delivered' ? 'delivery' : 'intake',
                                        })
                                      }
                                    >
                                      <Printer size={14} />
                                    </button>
                                    {!tech && (
                                      <button
                                        type="button"
                                        className="zk-repair-mini-btn"
                                        title="Send SMS to Customer"
                                        disabled={smsSendingId === j.id}
                                        onClick={() =>
                                          sendJobSmsAction(j, j.status === 'Ready' ? 'ready' : 'intake')
                                        }
                                      >
                                        <MessageSquare size={14} />
                                      </button>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
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
                      columns={[
                        ['Job #', r => <strong className="mono">{r.job_number || ref('RJ', r.id)}</strong>],
                        ['Device', r => (
                          <div>
                            <strong>{r.device}</strong>
                            <small className="subtext">{r.issue}</small>
                          </div>
                        )],
                        ['Customer', r => `${r.customer}${r.customer_phone ? ' (' + r.customer_phone + ')' : ''}`],
                        [
                          'Technician',
                          r => (
                            <Badge tone={r.technician ? 'blue' : 'amber'}>
                              {r.technician || 'Unassigned'}
                            </Badge>
                          ),
                        ],
                        ['Promised Date', r => dateLabel(r.due_date)],
                        [
                          'Charge / Paid',
                          r => {
                            const chg = Number(r.final_charge || r.estimate || 0);
                            const pd = Number(r.paid_amount ?? r.advance_paid ?? 0);
                            return (
                              <div>
                                <strong>{money(chg)}</strong>
                                <small className="subtext">Paid: {money(pd)}</small>
                              </div>
                            );
                          },
                        ],
                        ['Status', r => <Badge tone={statusTone(r.status)}>{r.status}</Badge>],
                        [
                          'Actions',
                          r => (
                            <div className="row-actions">
                              {!tech && !['Delivered', 'Cancelled'].includes(r.status) && (
                                <Button
                                  icon={Banknote}
                                  variant="primary"
                                  onClick={() => openCompleteModal(r)}
                                >
                                  Complete &amp; Pay
                                </Button>
                              )}
                              <Button icon={ArrowRight} onClick={() => openStatusEditor(r)}>
                                Status
                              </Button>
                              <Button
                                icon={Printer}
                                variant="outline"
                                onClick={() =>
                                  setReceiptJob({
                                    ...r,
                                    job_number: r.job_number || ref('RJ', r.id),
                                    phone: r.customer_phone || '',
                                    sms_message: buildClientSmsText(
                                      r,
                                      settings,
                                      r.branch_name || currentBranchName,
                                      r.status === 'Delivered' ? 'delivered' : 'intake'
                                    ),
                                    mode: r.status === 'Delivered' ? 'delivery' : 'intake',
                                  })
                                }
                              >
                                Bill
                              </Button>
                            </div>
                          ),
                        ],
                      ]}
                    />
                  </Panel>
                )}
              </div>
            )}

            {/* UPDATE STATUS & ASSIGN TECHNICIAN MODAL */}
            {statusJob && (
              <Modal
                title={`${statusJob.job_number || ref('RJ', statusJob.id)} · ${statusJob.device}`}
                description={`Customer: ${statusJob.customer} · Current Status: ${statusJob.status}`}
                onClose={() => !statusBusy && setStatusJob(null)}
                busy={statusBusy}
              >
                <form onSubmit={submitStatusUpdate}>
                  <div className="modal-body" style={{ display: 'grid', gap: '12px' }}>
                    {statusError && <Alert tone="red">{statusError}</Alert>}

                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Next Workflow Status</label>
                      <div className="zk-input-box">
                        <select value={statusNext} onChange={e => setStatusNext(e.target.value)}>
                          <option value="">Keep current ({statusJob.status})</option>
                          {(transitions[statusJob.status] || [])
                            .filter(s =>
                              tech
                                ? !['Cancelled', 'Delivered'].includes(s)
                                : ctx.user.role === 'cashier'
                                  ? s === 'Delivered'
                                  : true
                            )
                            .map(st => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {!tech && (
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Assigned Technician</label>
                        <div className="zk-input-box">
                          <Wrench size={15} style={{ color: '#0d9488' }} />
                          <select value={statusTechId} onChange={e => setStatusTechId(e.target.value)}>
                            <option value="">Unassigned</option>
                            {technicians.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {statusNext === 'Ready' && (
                      <label className="zk-acc-checkbox">
                        <input
                          type="checkbox"
                          checked={statusSendSms}
                          onChange={e => setStatusSendSms(e.target.checked)}
                        />
                        <span>Send Ready-for-Pickup SMS to {statusJob.customer_phone || 'customer'}</span>
                      </label>
                    )}
                  </div>
                  <div className="modal-footer">
                    <Button type="button" variant="outline" onClick={() => setStatusJob(null)} disabled={statusBusy}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={statusBusy}>
                      {statusBusy ? 'Updating...' : 'Save Changes'}
                    </Button>
                  </div>
                </form>
              </Modal>
            )}

            {/* COMPLETE REPAIR & PAY MODAL -> CASH FLOW / CASHBOOK */}
            {completeJob && (
              <Modal
                title={`Complete Repair & Collect Payment · ${completeJob.job_number || ref('RJ', completeJob.id)}`}
                description={`${completeJob.device} · Customer: ${completeJob.customer}`}
                onClose={() => !completeBusy && setCompleteJob(null)}
                wide={true}
                busy={completeBusy}
              >
                <form onSubmit={submitCompleteAndPay}>
                  <div className="modal-body" style={{ display: 'grid', gap: '14px' }}>
                    {completeError && <Alert tone="red">{completeError}</Alert>}

                    <div className="zk-recon-summary">
                      <div className="zk-recon-box">
                        <small>Estimated Cost</small>
                        <strong>{money(completeJob.estimate)}</strong>
                      </div>
                      <div className="zk-recon-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                        <small style={{ color: '#166534' }}>Already Paid (Advance)</small>
                        <strong style={{ color: '#15803d' }}>
                          {money(completeJob.paid_amount ?? completeJob.advance_paid ?? 0)}
                        </strong>
                      </div>
                      <div className="zk-recon-box" style={{ background: '#f0fdfa', borderColor: '#99f6e4' }}>
                        <small style={{ color: '#0f766e' }}>Remaining Balance</small>
                        <strong style={{ color: '#0d9488' }}>
                          {money(
                            Math.max(
                              0,
                              cents(finalCharge || 0) -
                                Number(completeJob.paid_amount ?? completeJob.advance_paid ?? 0)
                            )
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="zk-form-row-3">
                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Final Repair Charge (LKR)</label>
                        <div className="zk-input-box">
                          <span style={{ fontWeight: 700, color: '#475569' }}>LKR</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={finalCharge}
                            onChange={e => {
                              setFinalCharge(e.target.value);
                              const bal = Math.max(
                                0,
                                cents(e.target.value || 0) -
                                  Number(completeJob.paid_amount ?? completeJob.advance_paid ?? 0)
                              );
                              setPayAmount(String(rupees(bal)));
                            }}
                            required
                          />
                        </div>
                      </div>

                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Payment Collected Now (LKR)</label>
                        <div className="zk-input-box">
                          <span style={{ fontWeight: 700, color: '#475569' }}>LKR</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={payAmount}
                            onChange={e => setPayAmount(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="zk-field-wrap">
                        <label className="zk-field-label">Assigned Technician</label>
                        <div className="zk-input-box">
                          <Wrench size={15} style={{ color: '#0d9488' }} />
                          <select value={completeTechId} onChange={e => setCompleteTechId(e.target.value)}>
                            <option value="">Unassigned</option>
                            {technicians.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Payment Method</label>
                      <div className="zk-cb-amount-chips">
                        {tenders.map(method => (
                          <button
                            key={method}
                            type="button"
                            className={`zk-cb-chip ${payMethod === method ? 'active-method' : ''}`}
                            style={
                              payMethod === method
                                ? { background: '#0d9488', color: '#ffffff', borderColor: '#0d9488' }
                                : undefined
                            }
                            onClick={() => setPayMethod(method)}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                      {payMethod === 'Cash' && cents(payAmount || 0) > 0 && (
                        <small style={{ color: '#0f766e', marginTop: '6px', display: 'block', fontWeight: 600 }}>
                          Cash payment will automatically be added to today’s Cashbook &amp; Cash Flow.
                        </small>
                      )}
                    </div>

                    <div className="zk-field-wrap">
                      <label className="zk-field-label">Completion / Handover Notes (Optional)</label>
                      <div className="zk-textarea-box">
                        <textarea
                          rows={2}
                          value={completeNote}
                          onChange={e => setCompleteNote(e.target.value)}
                          placeholder="Replaced original display, tested all sensors..."
                        />
                      </div>
                    </div>

                    <label className="zk-acc-checkbox">
                      <input
                        type="checkbox"
                        checked={completeSendSms}
                        onChange={e => setCompleteSendSms(e.target.checked)}
                      />
                      <span>Send completion confirmation SMS to customer ({completeJob.customer_phone || 'phone'})</span>
                    </label>
                  </div>

                  <div className="modal-footer">
                    <Button type="button" variant="outline" onClick={() => setCompleteJob(null)} disabled={completeBusy}>
                      Cancel
                    </Button>
                    <Button type="submit" icon={Banknote} variant="primary" disabled={completeBusy}>
                      {completeBusy ? 'Processing...' : 'Complete Repair & Record Payment'}
                    </Button>
                  </div>
                </form>
              </Modal>
            )}

            {/* DETAIL MODAL */}
            {detail && (
              <Modal
                title={(detail.job_number || ref('RJ', detail.id)) + ' · ' + detail.device}
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
                      <small>Total / Paid</small>
                      <strong>
                        {money(detail.final_charge || detail.estimate)} · Paid {money(detail.paid_amount ?? detail.advance_paid ?? 0)}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <Button onClick={() => setDetail(null)}>Close</Button>
                </div>
              </Modal>
            )}

            {/* CUSTOMER INTAKE / DELIVERY BILL + SMS MODAL */}
            {receiptJob && (
              <Modal
                title={`${receiptJob.mode === 'delivery' ? 'Repair Payment Bill' : 'Repair Intake Receipt'} · ${receiptJob.job_number}`}
                description="Customer bill & SMS confirmation"
                onClose={() => setReceiptJob(null)}
                wide={true}
              >
                <div className="modal-body" style={{ display: 'grid', gap: '14px' }}>
                  {/* SMS CONFIRMATION PANEL */}
                  {(() => {
                    const smsText =
                      receiptJob.sms_message ||
                      buildClientSmsText(
                        receiptJob,
                        settings,
                        receiptJob.branch_name || currentBranchName,
                        receiptJob.mode === 'delivery' ? 'delivered' : 'intake'
                      );
                    const phoneDigits = normalizePhoneForLink(receiptJob.phone || receiptJob.customer_phone);
                    const sentOk = Boolean(receiptJob.sms?.sent);
                    return (
                      <div className="zk-repair-sms-box">
                        <div className="zk-repair-sms-head">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MessageSquare size={17} style={{ color: '#0d9488' }} />
                            <strong>Customer Confirmation SMS ({receiptJob.phone || 'No phone'})</strong>
                          </div>
                          <Badge tone={sentOk ? 'green' : 'amber'}>
                            {sentOk ? 'Sent via SMS Gateway' : 'Ready to Send'}
                          </Badge>
                        </div>
                        <p className="zk-repair-sms-text">{smsText}</p>
                        <div className="zk-repair-sms-actions">
                          {phoneDigits && (
                            <>
                              <a
                                href={`sms:${phoneDigits}?body=${encodeURIComponent(smsText)}`}
                                className="zk-pos-cash-btn in"
                                style={{ textDecoration: 'none' }}
                              >
                                <Send size={14} />
                                <span>Open SMS App</span>
                              </a>
                              <a
                                href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(smsText)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="zk-pos-cash-btn in"
                                style={{ textDecoration: 'none' }}
                              >
                                <MessageSquare size={14} />
                                <span>Send WhatsApp</span>
                              </a>
                            </>
                          )}
                          <Button
                            type="button"
                            icon={Copy}
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard?.writeText(smsText);
                              ctx.setNotice('SMS text copied to clipboard.');
                            }}
                          >
                            Copy SMS
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* PRINTABLE RECEIPT PREVIEW */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '16px',
                      color: '#0f172a',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>
                        {settings?.shop_name || 'ZEEDAT POS'} — {receiptJob.mode === 'delivery' ? 'REPAIR BILL' : 'REPAIR INTAKE SLIP'}
                      </h3>
                      <p style={{ margin: '2px 0', fontSize: '12px', color: '#64748b' }}>
                        {receiptJob.branch_name || currentBranchName}
                        {settings?.shop_phone ? ` · Tel: ${settings.shop_phone}` : ''}
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
                        <strong>{receiptJob.phone || '—'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Device: </span>
                        <strong>{receiptJob.device}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>IMEI / Serial: </span>
                        <strong>{receiptJob.serial || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Technician: </span>
                        <strong>{receiptJob.technician || 'Unassigned'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Promised Date: </span>
                        <strong>{dateLabel(receiptJob.due_date || today())}</strong>
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
                          <strong>Notes: </strong>{receiptJob.notes}
                        </div>
                      )}
                    </div>

                    {(() => {
                      const totalAmt = Number(receiptJob.final_charge || receiptJob.estimate || 0);
                      const paidAmt = Number(receiptJob.paid_amount ?? receiptJob.advance_paid ?? receiptJob.advance ?? 0);
                      const balAmt = Math.max(0, totalAmt - paidAmt);
                      return (
                        <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <span>{receiptJob.mode === 'delivery' ? 'Final Charge: ' : 'Estimated Cost: '}</span>
                            <strong>{money(totalAmt)}</strong>
                          </div>
                          <div>
                            <span>{receiptJob.mode === 'delivery' ? 'Total Paid: ' : 'Advance Paid: '}</span>
                            <strong style={{ color: '#15803d' }}>{money(paidAmt)}</strong>
                          </div>
                          <div>
                            <span>Balance Due: </span>
                            <strong style={{ color: balAmt > 0 ? '#dc2626' : '#0f766e' }}>{money(balAmt)}</strong>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="modal-footer">
                  <Button variant="outline" onClick={() => setReceiptJob(null)}>
                    Close
                  </Button>
                  <Button
                    icon={Printer}
                    variant="primary"
                    onClick={() =>
                      printRepairSlip(
                        receiptJob,
                        settings,
                        receiptJob.branch_name || currentBranchName,
                        receiptJob.mode === 'delivery' ? 'delivery' : 'intake'
                      )
                    }
                  >
                    Print Bill
                  </Button>
                </div>
              </Modal>
            )}
            {openRegisterOpen && (
              <OpenRegisterModal
                ctx={ctx}
                onClose={() => setOpenRegisterOpen(false)}
                onSuccess={() => {
                  setOpenRegisterOpen(false);
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
