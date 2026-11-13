import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  History,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Panel,
  SearchBox,
  Stats,
  Table,
} from '../../components/common';
import { DataView, Empty } from '../../components/feedback';
import {
  cents,
  dateLabel,
  initials,
  money,
  options,
  printBill,
  printHtmlDocument,
  printThermalReceipt,
  ref,
  repairJobToBill,
  reservationToBill,
  tenders,
  timeLabel,
  today,
} from '../../utils';
import { openReservationAction, openReserveItem, ReservationTable } from './ReservationActions';
import { buildCustomerDirectoryHtml, buildCustomerStatementHtml } from './customerStatementPrint';

const actionBranch = ctx => ctx.branch || ctx.branches[0]?.id;
const branchField = ctx => ({ name: 'branch', label: 'Branch', choices: options(ctx.branches) });

const csvCell = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

function exportCustomersCsv(rows) {
  const headers = [
    ['Customer ID', c => ref('CUS', c.id)],
    ['Name', c => c.name],
    ['Phone', c => c.phone],
    ['Email', c => c.email || ''],
    ['Branch', c => c.branch || ''],
    ['Invoices', c => c.sales_count || 0],
    ['Total Purchases (Rs)', c => (Number(c.total || 0) / 100).toFixed(2)],
    ['Outstanding Credit (Rs)', c => (Number(c.credit || 0) / 100).toFixed(2)],
    ['Next Due Date', c => c.next_due_date || ''],
    ['Wallet Balance (Rs)', c => (Number(c.wallet_balance || 0) / 100).toFixed(2)],
    ['Loyalty Points', c => Number(c.loyalty_points || 0)],
  ];
  const lines = [
    headers.map(h => csvCell(h[0])).join(','),
    ...rows.map(r => headers.map(h => csvCell(h[1](r))).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `customers_credit_${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FILTER_OPTIONS = [
  ['all', 'All'],
  ['credit', 'Credit Due'],
  ['overdue', 'Overdue'],
  ['wallet', 'Has Wallet'],
  ['vip', 'Top Buyers'],
];

export function Customers({ ctx }) {
  const state = useData(ctx, {
    customers: 'customers',
    sales: 'sales',
    repairs: 'repairs',
    settings: 'settings',
  });

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filterMode, setFilterMode] = useState(() => (ctx.intent === 'credit' ? 'credit' : 'all'));
  const [sortBy, setSortBy] = useState('top');
  const [dirLimit, setDirLimit] = useState(60);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('receivables');
  const [ledger, setLedger] = useState({ wallet_logs: [], credit_payments: [], reservations: [] });
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const ledgerCacheRef = useRef(new Map());
  const lastRevisionRef = useRef(ctx.revision);

  useEffect(() => {
    if (ctx.intent === 'credit') {
      setFilterMode('credit');
      ctx.clearIntent();
    }
  }, [ctx.intent]);

  useEffect(() => {
    if (lastRevisionRef.current !== ctx.revision) {
      ledgerCacheRef.current.clear();
      lastRevisionRef.current = ctx.revision;
    }
  }, [ctx.revision]);

  useEffect(() => {
    setDirLimit(60);
  }, [deferredQuery, filterMode, sortBy]);

  const customersList = state.data?.customers || [];
  const salesList = state.data?.sales || [];
  const repairsList = state.data?.repairs || [];
  const todayStr = today();

  const isOverdueCustomer = c =>
    Number(c.credit || 0) > 0 && Boolean(c.next_due_date) && String(c.next_due_date).slice(0, 10) < todayStr;

  const kpiSummary = useMemo(() => {
    let totalCredit = 0;
    let creditCustomersCount = 0;
    let overdueCustomersCount = 0;
    let totalWallet = 0;
    let walletHoldersCount = 0;
    let totalPoints = 0;
    let totalLifetimeSales = 0;
    let repeatBuyers = 0;

    for (const c of customersList) {
      const credit = Number(c.credit || 0);
      const wallet = Number(c.wallet_balance || 0);
      const salesCount = Number(c.sales_count || 0);
      if (credit > 0) {
        totalCredit += credit;
        creditCustomersCount++;
        if (c.next_due_date && String(c.next_due_date).slice(0, 10) < todayStr) {
          overdueCustomersCount++;
        }
      }
      if (wallet > 0) {
        totalWallet += wallet;
        walletHoldersCount++;
      }
      if (salesCount >= 2) repeatBuyers++;
      totalPoints += Number(c.loyalty_points || 0);
      totalLifetimeSales += Number(c.total || 0);
    }
    return {
      totalCredit,
      creditCustomersCount,
      overdueCustomersCount,
      totalWallet,
      walletHoldersCount,
      totalPoints,
      totalLifetimeSales,
      repeatBuyers,
    };
  }, [customersList, todayStr]);

  const { salesByCustomer, repairsByCustomer } = useMemo(() => {
    const sMap = new Map();
    for (const s of salesList) {
      const cid = Number(s.customer_id || 0);
      if (!cid) continue;
      let arr = sMap.get(cid);
      if (!arr) {
        arr = [];
        sMap.set(cid, arr);
      }
      arr.push(s);
    }
    const rMap = new Map();
    for (const r of repairsList) {
      const cid = Number(r.customer_id || 0);
      if (!cid) continue;
      let arr = rMap.get(cid);
      if (!arr) {
        arr = [];
        rMap.set(cid, arr);
      }
      arr.push(r);
    }
    return { salesByCustomer: sMap, repairsByCustomer: rMap };
  }, [salesList, repairsList]);

  const filteredCustomers = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = customersList.filter(c => {
      if (q) {
        const hay = `${c.name || ''} ${c.phone || ''} ${c.email || ''} ${ref('CUS', c.id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterMode === 'credit') return Number(c.credit || 0) > 0;
      if (filterMode === 'overdue') return isOverdueCustomer(c);
      if (filterMode === 'wallet') return Number(c.wallet_balance || 0) > 0;
      if (filterMode === 'vip') return Number(c.sales_count || 0) >= 2 || Number(c.total || 0) >= 5000000;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'credit') return Number(b.credit || 0) - Number(a.credit || 0) || b.id - a.id;
      if (sortBy === 'wallet') return Number(b.wallet_balance || 0) - Number(a.wallet_balance || 0) || b.id - a.id;
      if (sortBy === 'points') return Number(b.loyalty_points || 0) - Number(a.loyalty_points || 0) || b.id - a.id;
      if (sortBy === 'newest') return Number(b.id || 0) - Number(a.id || 0);
      return Number(b.total || 0) - Number(a.total || 0) || Number(b.sales_count || 0) - Number(a.sales_count || 0);
    });
  }, [customersList, deferredQuery, filterMode, sortBy, todayStr]);

  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, dirLimit),
    [filteredCustomers, dirLimit]
  );

  const activePerson = filteredCustomers.find(c => c.id === selected) || filteredCustomers[0] || null;
  const activePersonId = activePerson?.id || 0;

  useEffect(() => {
    if (!activePersonId) {
      setLedger({ wallet_logs: [], credit_payments: [] });
      setLedgerLoading(false);
      return;
    }
    const cached = ledgerCacheRef.current.get(activePersonId);
    if (cached) {
      setLedger(cached);
      setLedgerLoading(false);
    } else {
      setLedgerLoading(true);
    }

    let alive = true;
    ctx
      .get('customer.ledger', { customer_id: activePersonId, branch: activePerson?.branch_id || 0 })
      .then(res => {
        if (alive && res) {
          const normalized = {
            wallet_logs: res.wallet_logs || [],
            credit_payments: res.credit_payments || [],
            reservations: res.reservations || [],
            receivables: res.receivables,
            customer_id: activePersonId,
          };
          ledgerCacheRef.current.set(activePersonId, normalized);
          setLedger(normalized);
        }
      })
      .catch(() => {
        if (alive && !cached) setLedger({ wallet_logs: [], credit_payments: [] });
      })
      .finally(() => {
        if (alive) setLedgerLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activePersonId, ctx.revision]);

  const openCustomerForm = person =>
    ctx.setDialog({
      title: person ? `Edit Customer · ${person.name}` : 'New Customer',
      route: 'customer.save',
      submit: person ? 'Save Changes' : 'Create Customer',
      values: { ...person, branch: person?.branch_id || actionBranch(ctx) },
      fields: [
        ...(!person ? [branchField(ctx)] : []),
        { name: 'name', label: 'Full name' },
        { name: 'phone', label: 'Phone number', type: 'tel' },
        { name: 'email', label: 'Email address', type: 'email', optional: true },
        { name: 'notes', label: 'Notes / Address / Remarks', type: 'textarea', optional: true },
      ],
      onSuccess: r => {
        if (r?.id) setSelected(r.id);
      },
    });

  return (
    <DataView state={state}>
      {({ customers, settings }) => {
        const shopName = settings?.shop_name || 'ZEEDAT POS';
        const {
          totalCredit,
          creditCustomersCount,
          overdueCustomersCount,
          totalWallet,
          walletHoldersCount,
          totalPoints,
          totalLifetimeSales,
          repeatBuyers,
        } = kpiSummary;

        const person = activePerson;
        const personSales = person ? salesByCustomer.get(Number(person.id)) || [] : [];
        const activeLedger = String(ledger.customer_id ?? '') === String(person?.id ?? '');
        const reservations = activeLedger ? (ledger.reservations || []) : [];
        const receivables = activeLedger && Array.isArray(ledger.receivables)
          ? ledger.receivables
          : personSales.filter(s => Number(s.credit || 0) > 0);
        const personRepairs = person ? repairsByCustomer.get(Number(person.id)) || [] : [];

        const openCreditPayment = (targetInvoice = null) => {
          if (!person || !receivables.length) return;
          const initialInv = targetInvoice || receivables[0];
          const invoiceChoices = receivables.map(inv => [
            ref('INV', inv.id),
            `${inv.invoice_no || ref('INV', inv.id)} · Due ${money(inv.credit)}${inv.due_date ? ` (${dateLabel(inv.due_date)})` : ''}`,
          ]);
          ctx.setDialog({
            title: `Collect Credit Payment · ${person.name}`,
            description: `Total Open Receivables: ${money(person.credit)} across ${receivables.length} invoice(s)`,
            route: 'sale.credit',
            submit: 'Record Payment',
            values: {
              branch: person.branch_id,
              invoice: ref('INV', initialInv.id),
              amount: (Number(initialInv.credit || 0) / 100).toFixed(2),
              method: 'Cash',
              reference: '',
            },
            fields: v => [
              { name: 'invoice', label: 'Credit Invoice', choices: invoiceChoices },
              { name: 'amount', label: 'Payment Amount (LKR)', type: 'money', min: 0.01 },
              { name: 'method', label: 'Payment Method', choices: [...tenders, 'Wallet'] },
              ...(!['Cash', 'Wallet'].includes(v.method)
                ? [{ name: 'reference', label: 'Transaction Reference #' }]
                : []),
            ],
            transform: v => ({ ...v, amount: cents(v.amount) }),
            onSuccess: () => ctx.setNotice('Credit payment recorded & loyalty points updated.'),
          });
        };

        const openWalletTopUp = () => {
          if (!person) return;
          ctx.setDialog({
            title: `Top Up Customer Wallet · ${person.name}`,
            description: `Current Wallet Balance: ${money(person.wallet_balance || 0)}`,
            route: 'customer.wallet.topup',
            submit: 'Add Funds to Wallet',
            values: {
              branch: person.branch_id,
              customer_id: person.id,
              amount: '',
              method: 'Cash',
              reference: '',
            },
            fields: v => [
              { name: 'amount', label: 'Top-Up Amount (LKR)', type: 'money', min: 1, full: true },
              { name: 'method', label: 'Payment Method', choices: tenders },
              ...(v.method !== 'Cash'
                ? [{ name: 'reference', label: 'Transaction Reference', optional: true }]
                : []),
            ],
            transform: v => ({ ...v, amount: cents(v.amount || 0) }),
            onSuccess: () => ctx.setNotice('Customer wallet topped up successfully.'),
          });
        };

        const openPointsAdjust = () => {
          if (!person) return;
          ctx.setDialog({
            title: `Loyalty Points Adjustment · ${person.name}`,
            description: `Current Balance: ${Number(person.loyalty_points || 0).toLocaleString()} pts (Enter positive to award, negative like -500 to redeem)`,
            route: 'customer.points.adjust',
            submit: 'Update Points',
            values: {
              branch: person.branch_id,
              customer_id: person.id,
              delta: '',
              reason: '',
            },
            fields: [
              {
                name: 'delta',
                label: 'Points Change (+ Award / − Redeem)',
                type: 'number',
                placeholder: 'e.g. 500 or -500',
              },
              {
                name: 'reason',
                label: 'Reason / Gift Description',
                optional: true,
                placeholder: 'e.g. Voucher redemption or Goodwill bonus',
              },
            ],
            transform: v => ({ ...v, delta: parseInt(v.delta, 10) || 0 }),
            onSuccess: () => ctx.setNotice('Customer loyalty points updated.'),
          });
        };

        const handleDeleteCustomer = () => {
          ctx.setDialog({
            title: 'Delete customer · ' + person.name,
            description: 'Customer accounts with financial history or wallet funds must be retained.',
            route: 'customer.delete',
            submit: 'Delete Account',
            values: { id: person.id, branch: person.branch_id },
            fields: [{ name: 'pin', label: 'Owner Delete PIN', type: 'password' }],
            onSuccess: () => setSelected(null),
          });
        };

        const repairBalance = repair => Math.max(0,
          Number(repair.final_charge || repair.estimate || 0) - Number(repair.paid_amount ?? repair.advance_paid ?? 0));
        const openRepairPayment = repair => {
          const balance = repairBalance(repair);
          ctx.setDialog({
            title: 'Collect repair payment · ' + (repair.job_number || ref('RJ', repair.id)),
            description: 'Outstanding balance ' + money(balance),
            route: 'repair.payment',
            submit: 'Record Payment',
            values: { id: repair.id, branch: repair.branch_id, pay_amount: balance / 100, payment_method: 'Cash' },
            fields: [
              { name: 'pay_amount', label: 'Payment Amount (LKR)', type: 'money', min: 0.01, max: balance / 100 },
              { name: 'payment_method', label: 'Payment Method', choices: [...tenders, 'Wallet'] },
            ],
            transform: v => ({ ...v, pay_amount: cents(v.pay_amount) }),
            onSuccess: (_res, submitted) => {
              const paidAdd = Number(submitted?.pay_amount || 0);
              const updatedRepair = {
                ...repair,
                paid_amount: Number(repair.paid_amount ?? repair.advance_paid ?? 0) + paidAdd,
                customer: person?.name,
                phone: person?.phone,
                technician: repair.technician_name || repair.technician,
              };
              printBill(
                repairJobToBill(
                  updatedRepair,
                  settings || {},
                  person?.branch || '',
                  updatedRepair.status === 'Delivered' ? 'delivery' : 'intake'
                ),
                settings || {},
                { silent: true }
              );
              ctx.setNotice('Repair payment recorded · Bill printed.');
            },
          });
        };

        const reserveItem = async () => {
          try {
            const [products, units] = await Promise.all([
              ctx.get('products', { branch: person.branch_id }),
              ctx.get('units', { branch: person.branch_id }),
            ]);
            openReserveItem(ctx, person, products, units, {
              onSuccess: result => {
                if (result?.reservation) {
                  printBill(
                    reservationToBill(
                      { ...result.reservation, customer_name: person?.name, customer_phone: person?.phone },
                      settings || {},
                      person?.branch || ''
                    ),
                    settings || {},
                    { silent: true }
                  );
                  ctx.setNotice('Reservation created · Bill printed.');
                }
              },
            });
          } catch (error) {
            ctx.setNotice(error.message);
          }
        };

        const handleViewInvoice = async saleRow => {
          const invCode = saleRow.invoice_no || ref('INV', saleRow.id);
          try {
            const fullInv = await ctx.get('invoice', { id: saleRow.id, branch: saleRow.branch_id || 0 });
            printThermalReceipt(fullInv, settings || {}, { silent: true });
            ctx.setNotice(`Invoice ${invCode} printed.`);
          } catch {
            printThermalReceipt(
              {
                ...saleRow,
                customer: person?.name || 'Customer',
                customer_phone: person?.phone || '',
                customer_email: person?.email || '',
                customer_id: person?.id,
                items: [],
                payments: [],
              },
              settings || {},
              { silent: true }
            );
            ctx.setNotice(`Invoice ${invCode} printed.`);
          }
        };

        const handlePrintStatement = () => {
          if (!person) return;
          printHtmlDocument(
            buildCustomerStatementHtml({
              customer: person,
              sales: personSales,
              creditPayments: ledger.credit_payments,
              walletLogs: ledger.wallet_logs,
              repairs: personRepairs,
              shopName,
            })
          );
        };

        const handlePrintDirectory = () => {
          const filterLabel = FILTER_OPTIONS.find(f => f[0] === filterMode)?.[1] || 'All';
          printHtmlDocument(buildCustomerDirectoryHtml(filteredCustomers, { filterLabel, shopName }));
        };

        const personOverdue = person ? isOverdueCustomer(person) : false;

        return (
          <>
            <Heading
              title="Customers & Credit"
              description="Customer directory, open credit receivables, loyalty points, wallets, and printable statements"
            >
              <Button icon={Download} variant="ghost" onClick={() => exportCustomersCsv(filteredCustomers)}>
                Export CSV
              </Button>
              <Button icon={Printer} variant="soft" onClick={handlePrintDirectory}>
                Print List
              </Button>
              <Button icon={Plus} variant="primary" onClick={() => openCustomerForm()}>
                New Customer
              </Button>
            </Heading>

            <Stats
              items={[
                {
                  icon: Users,
                  label: 'Total Customers',
                  value: customers.length,
                  note: `${repeatBuyers} repeat buyers`,
                },
                {
                  icon: CreditCard,
                  label: 'Outstanding Credit',
                  value: money(totalCredit),
                  note: `${creditCustomersCount} account(s)${overdueCustomersCount ? ` · ${overdueCustomersCount} overdue` : ''}`,
                  tone: 'violet',
                },
                {
                  icon: Wallet,
                  label: 'Total Wallet Float',
                  value: money(totalWallet),
                  note: `${walletHoldersCount} active wallet(s)`,
                  tone: 'mint',
                },
                {
                  icon: Award,
                  label: 'Loyalty Points & Sales',
                  value: `${totalPoints.toLocaleString()} pts`,
                  note: `Lifetime sales: ${money(totalLifetimeSales)}`,
                  tone: 'amber',
                },
              ]}
            />

            <div className="zk-cust-workspace">
              {/* LEFT: DIRECTORY LIST */}
              <Panel
                className="zk-cust-directory"
                title={`Directory (${filteredCustomers.length})`}
                icon={Users}
              >
                <div className="zk-cust-dir-body">
                  <div className="zk-cust-dir-controls">
                    <div className="zk-cust-search-sort">
                      <SearchBox
                        value={query}
                        onChange={setQuery}
                        placeholder="Search name, phone, email or CUS ID…"
                      />
                      <select
                        aria-label="Sort customers"
                        className="zk-cust-sort"
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                      >
                        <option value="top">Top Buyers</option>
                        <option value="credit">Highest Credit</option>
                        <option value="wallet">Highest Wallet</option>
                        <option value="points">Most Points</option>
                        <option value="newest">Newest</option>
                      </select>
                    </div>
                    <div className="zk-cust-filter-bar">
                      <FilterTabs value={filterMode} onChange={setFilterMode} choices={FILTER_OPTIONS} />
                    </div>
                  </div>

                  <div className="zk-cust-cards-scroll">
                    {visibleCustomers.length > 0 ? (
                      <>
                        {visibleCustomers.map(c => {
                          const active = person && c.id === person.id;
                          const overdue = isOverdueCustomer(c);
                          const creditAmt = Number(c.credit || 0);
                          const walletAmt = Number(c.wallet_balance || 0);
                          const pts = Number(c.loyalty_points || 0);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`zk-cust-card-row${active ? ' active' : ''}`}
                              onClick={() => setSelected(c.id)}
                            >
                              <div className="zk-cust-row-top">
                                <span className="avatar mini">{initials(c.name)}</span>
                                <div className="zk-cust-row-info">
                                  <div className="zk-cust-row-name">
                                    <strong>{c.name}</strong>
                                    {overdue && <Badge tone="red">Overdue</Badge>}
                                  </div>
                                  <div className="zk-cust-row-sub">
                                    <span>{ref('CUS', c.id)}</span>
                                    <span>·</span>
                                    <span>{c.phone}</span>
                                    <span>·</span>
                                    <span>{c.branch}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="zk-cust-row-metrics">
                                <Badge tone="amber">{pts.toLocaleString()} pts</Badge>
                                <Badge tone="slate">Wallet {money(walletAmt)}</Badge>
                                {Number(c.wallet_credits) > 0 && <Badge tone="green">+{money(c.wallet_credits)}</Badge>}
                                {Number(c.wallet_debits) > 0 && <Badge tone="red">−{money(c.wallet_debits)}</Badge>}
                                {Number(c.reservation_count) > 0 && (
                                  <Badge tone="blue">RSV {money(c.reservation_total || 0)}</Badge>
                                )}
                                {creditAmt > 0 ? (
                                  <Badge tone={overdue ? 'red' : 'amber'}>Due {money(creditAmt)}</Badge>
                                ) : (
                                  <Badge tone="slate">{c.sales_count || 0} bills</Badge>
                                )}
                              </div>
                            </button>
                          );
                        })}
                        {filteredCustomers.length > visibleCustomers.length && (
                          <Button
                            variant="ghost"
                            onClick={() => setDirLimit(n => n + 60)}
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            Load more ({filteredCustomers.length - visibleCustomers.length} remaining)
                          </Button>
                        )}
                      </>
                    ) : (
                      <Empty>No matching customers found.</Empty>
                    )}
                  </div>
                </div>
              </Panel>

              {/* RIGHT: CUSTOMER 360 WORKSPACE */}
              {person ? (
                <div className="zk-cust-detail-col">
                  <Panel className="zk-cust-hero-panel">
                    <div className="zk-cust-hero-body">
                    <div className="zk-cust-hero-top">
                      <div className="zk-cust-hero-id">
                        <span className="avatar zk-cust-avatar-lg">{initials(person.name)}</span>
                        <div>
                          <div className="zk-cust-hero-title">
                            <h2>{person.name}</h2>
                            <Badge tone="slate">{ref('CUS', person.id)}</Badge>
                            {Number(person.credit || 0) > 0 ? (
                              <Badge tone={personOverdue ? 'red' : 'amber'}>
                                {personOverdue ? 'Credit Overdue' : 'Open Credit'}
                              </Badge>
                            ) : (
                              <Badge tone="green">Account Clear</Badge>
                            )}
                          </div>
                          <div className="zk-cust-contact-row">
                            <a href={`tel:${person.phone}`} className="zk-cust-contact-chip">
                              <Phone size={13} /> {person.phone}
                            </a>
                            {person.email && (
                              <span className="zk-cust-contact-chip">
                                <Mail size={13} /> {person.email}
                              </span>
                            )}
                            <span className="zk-cust-contact-chip">
                              <Building2 size={13} /> {person.branch}
                            </span>
                            {person.created_at && (
                              <span className="zk-cust-contact-chip">
                                <CalendarDays size={13} /> Since {dateLabel(person.created_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="zk-cust-hero-btns">
                        <Button icon={Printer} variant="soft" onClick={handlePrintStatement}>
                          Statement
                        </Button>
                        <Button icon={Pencil} onClick={() => openCustomerForm(person)}>
                          Edit
                        </Button>
                        {ctx.user.role === 'owner' && <Button
                          icon={Trash2}
                          className="icon-only text-red"
                          title="Delete customer"
                          aria-label={`Delete ${person.name}`}
                          onClick={handleDeleteCustomer}
                        />}
                      </div>
                    </div>

                    {person.notes && <p className="note-strip zk-cust-note-banner">{person.notes}</p>}

                    {/* 3 FINANCIAL ACCOUNT CARDS */}
                    <div className="zk-cust-accounts-grid">
                      <div className={`zk-cust-acct-card ${Number(person.credit || 0) > 0 ? 'due' : 'clear'}`}>
                        <div className="zk-cust-acct-head">
                          <span>
                            <CreditCard size={15} /> Outstanding Credit
                          </span>
                          {person.next_due_date && Number(person.credit || 0) > 0 && (
                            <Badge tone={personOverdue ? 'red' : 'amber'}>
                              Due {dateLabel(person.next_due_date)}
                            </Badge>
                          )}
                        </div>
                        <strong className="zk-cust-acct-val">{money(person.credit || 0)}</strong>
                        {Number(person.repair_due || 0) > 0 && (
                          <Button onClick={() => setDetailTab('repairs')}>Repair balance {money(person.repair_due)}</Button>
                        )}
                        <small className="muted">
                          {receivables.length > 0
                            ? `${receivables.length} unpaid invoice(s)`
                            : `Lifetime purchases: ${money(person.total || 0)} (${person.sales_count || 0} bills)`}
                        </small>
                        <Button
                          icon={CreditCard}
                          variant="primary"
                          disabled={!receivables.length}
                          onClick={() => openCreditPayment(null)}
                        >
                          Collect Credit Payment
                        </Button>
                      </div>

                      <div className="zk-cust-acct-card wallet">
                        <div className="zk-cust-acct-head">
                          <span>
                            <Wallet size={15} /> Customer Wallet
                          </span>
                          <Badge tone="green">Prepaid</Badge>
                        </div>
                        <strong className="zk-cust-acct-val">{money(person.wallet_balance || 0)}</strong>
                        <small className="muted">Available balance</small>
                        <div className="row-actions">
                          <Badge tone="green">Credits +{money(person.wallet_credits || 0)}</Badge>
                          <Badge tone="red">Debits −{money(person.wallet_debits || 0)}</Badge>
                          {Number(person.reservation_count || 0) > 0 ? (
                            <Badge
                              tone="blue"
                              onClick={() => setDetailTab('reservations')}
                              style={{ cursor: 'pointer' }}
                              title="Click to view customer reservations"
                            >
                              Reservations ({person.reservation_count}): {money(person.reservation_total || 0)}
                            </Badge>
                          ) : (
                            <Badge tone="slate">No Reservations</Badge>
                          )}
                        </div>
                        <Button icon={Wallet} variant="soft" onClick={openWalletTopUp}>
                          Top Up Wallet
                        </Button>
                        <Button variant="ghost" onClick={() => setDetailTab('wallet')}>View Wallet Activity</Button>
                      </div>

                      <div className="zk-cust-acct-card points">
                        <div className="zk-cust-acct-head">
                          <span>
                            <Award size={15} /> Loyalty Points
                          </span>
                          <Badge tone="amber">1 LKR = 1 pt</Badge>
                        </div>
                        <strong className="zk-cust-acct-val">
                          {Number(person.loyalty_points || 0).toLocaleString()} pts
                        </strong>
                        <small className="muted">Earned automatically on purchases & settlements</small>
                        <Button icon={Award} onClick={openPointsAdjust}>
                          Adjust / Redeem Points
                        </Button>
                      </div>
                    </div>
                    </div>
                  </Panel>

                  {/* TABBED ACTIVITY & LEDGERS */}
                  <Panel
                    className="zk-cust-ledger-panel"
                    title="Customer Activity & Ledgers"
                    icon={History}
                  >
                    <div className="zk-cust-ledger-tabs">
                      <FilterTabs
                        value={detailTab}
                        onChange={setDetailTab}
                        choices={[
                          ['receivables', `Open Credit (${receivables.length})`],
                          ['sales', `Sales (${personSales.length})`],
                          ['payments', `Credit Payments (${ledger.credit_payments.length})`],
                          ['wallet', `Wallet & Points (${ledger.wallet_logs.length})`],
                          ['repairs', `Repairs (${personRepairs.length})`],
                          ['reservations', `Reservations (${reservations.length})`],
                        ]}
                      />
                    </div>
                    {detailTab === 'reservations' && (
                      <>
                        <Button icon={Plus} variant="primary" onClick={reserveItem}>Reserve Item</Button>
                        <ReservationTable
                          rows={reservations}
                          canCancel={['owner', 'manager'].includes(ctx.user.role)}
                          onPrint={row => {
                            printBill(
                              reservationToBill(
                                { ...row, customer_name: person?.name, customer_phone: person?.phone },
                                settings || {},
                                person?.branch || ''
                              ),
                              settings || {},
                              { silent: true }
                            );
                            ctx.setNotice(`Reservation bill ${ref('RSV', row.id)} printed.`);
                          }}
                          onAction={(row, action) => openReservationAction(ctx, row, action, result => {
                            if (result?.invoice) {
                              printThermalReceipt(result.invoice, settings || {}, { silent: true });
                              ctx.setNotice('Handover bill printed.');
                            } else if (result?.reservation) {
                              printBill(
                                reservationToBill(
                                  { ...result.reservation, customer_name: person?.name, customer_phone: person?.phone },
                                  settings || {},
                                  person?.branch || ''
                                ),
                                settings || {},
                                { silent: true }
                              );
                              ctx.setNotice(`Reservation bill ${ref('RSV', row.id)} printed.`);
                            }
                          })}
                        />
                      </>
                    )}
                    {detailTab === 'receivables' && (
                      <Table
                        rows={receivables}
                        empty="This customer has no outstanding credit invoices."
                        columns={[
                          ['Invoice', r => <strong>{r.invoice_no || ref('INV', r.id)}</strong>],
                          ['Sale Date', r => dateLabel(r.created_at)],
                          [
                            'Due Date',
                            r => {
                              const od = r.due_date && String(r.due_date).slice(0, 10) < todayStr;
                              return r.due_date ? (
                                <Badge tone={od ? 'red' : 'amber'}>
                                  {od ? `Overdue (${dateLabel(r.due_date)})` : dateLabel(r.due_date)}
                                </Badge>
                              ) : (
                                '—'
                              );
                            },
                          ],
                          ['Items', r => <span className="muted">{r.items || '—'}</span>],
                          ['Total', r => money(r.total)],
                          ['Paid', r => money(r.paid_amount || 0)],
                          ['Credit Due', r => <strong className="text-red">{money(r.credit)}</strong>],
                          [
                            'Action',
                            r => (
                              <Button
                                size="sm"
                                variant="primary"
                                icon={CheckCircle2}
                                onClick={() => openCreditPayment(r)}
                              >
                                Collect
                              </Button>
                            ),
                          ],
                        ]}
                      />
                    )}

                    {detailTab === 'sales' && (
                      <Table
                        rows={personSales}
                        empty="No sales invoices for this customer yet."
                        columns={[
                          ['Invoice', r => <strong>{r.invoice_no || ref('INV', r.id)}</strong>],
                          ['Date', r => timeLabel(r.created_at)],
                          ['Items', r => <span className="muted">{r.items || '—'}</span>],
                          ['Payment', r => <Badge tone="slate">{r.payment_methods || 'Settled'}</Badge>],
                          ['Total', r => <strong>{money(r.total)}</strong>],
                          [
                            'Status',
                            r =>
                              Number(r.credit || 0) > 0 ? (
                                <Badge tone="red">Due {money(r.credit)}</Badge>
                              ) : (
                                <Badge tone="green">Paid</Badge>
                              ),
                          ],
                          [
                            'Receipt',
                            r => (
                              <Button
                                size="sm"
                                icon={Printer}
                                variant="ghost"
                                onClick={() => handleViewInvoice(r)}
                              >
                                Print Bill
                              </Button>
                            ),
                          ],
                        ]}
                      />
                    )}

                    {detailTab === 'payments' && (
                      <Table
                        rows={ledger.credit_payments}
                        empty={ledgerLoading ? 'Loading payment history…' : 'No credit settlement payments recorded yet.'}
                        columns={[
                          ['Date & Time', r => timeLabel(r.created_at)],
                          ['Invoice', r => <strong>{ref('INV', r.sale_id)}</strong>],
                          ['Method', r => <Badge tone="blue">{r.method}</Badge>],
                          ['Reference', r => r.reference || '—'],
                          ['Collected By', r => r.user_name],
                          ['Amount', r => <strong className="text-green">{money(r.amount)}</strong>],
                        ]}
                      />
                    )}

                    {detailTab === 'wallet' && (
                      <Table
                        rows={ledger.wallet_logs}
                        empty={ledgerLoading ? 'Loading wallet & points ledger…' : 'No wallet or loyalty point activity recorded yet.'}
                        columns={[
                          ['Date & Time', r => timeLabel(r.created_at)],
                          ['Activity', r => <Badge tone="slate">{r.kind}</Badge>],
                          ['Method', r => r.method || '—'],
                          ['Reference', r => r.reference || '—'],
                          ['By', r => r.user_name],
                          [
                            'Wallet Δ',
                            r => {
                              const amt = Number(r.wallet_delta ?? r.amount ?? 0);
                              if (!amt) return '—';
                              return (
                                <strong className={amt > 0 ? 'text-green' : 'text-red'}>
                                  {amt > 0 ? `+${money(amt)}` : money(amt)}
                                </strong>
                              );
                            },
                          ],
                          ['Payment activity', r => !Number(r.wallet_delta) && Number(r.amount) ? money(r.amount) : '—'],
                          [
                            'Points Δ',
                            r => {
                              const pts = Number(r.points_delta || 0);
                              if (!pts) return '—';
                              return (
                                <Badge tone={pts > 0 ? 'amber' : 'slate'}>
                                  {pts > 0 ? `+${pts.toLocaleString()} pts` : `${pts.toLocaleString()} pts`}
                                </Badge>
                              );
                            },
                          ],
                        ]}
                      />
                    )}

                    {detailTab === 'repairs' && (
                      <Table
                        rows={personRepairs}
                        empty="No repair tickets recorded for this customer."
                        columns={[
                          ['Balance Due', r => money(r.status === 'Cancelled' ? 0 : repairBalance(r))],
                          ['Payment', r => r.status !== 'Cancelled' && repairBalance(r) > 0
                            ? <Button onClick={() => openRepairPayment(r)}>Collect Payment</Button> : null],
                          ['Job #', r => <strong>{ref('REP', r.id)}</strong>],
                          ['Received', r => dateLabel(r.created_at)],
                          ['Device', r => r.device],
                          ['Technician', r => r.technician_name || 'Unassigned'],
                          [
                            'Status',
                            r => (
                              <Badge tone={r.status === 'Delivered' || r.status === 'Ready' ? 'green' : 'blue'}>
                                {r.status}
                              </Badge>
                            ),
                          ],
                          ['Paid / Est.', r => money(r.paid_amount || r.estimate || 0)],
                          [
                            'Bill',
                            r => (
                              <Button
                                size="sm"
                                icon={Printer}
                                variant="outline"
                                onClick={() => {
                                  printBill(
                                    repairJobToBill(
                                      {
                                        ...r,
                                        customer: person?.name,
                                        phone: person?.phone,
                                        technician: r.technician_name || r.technician,
                                      },
                                      settings || {},
                                      person?.branch || '',
                                      r.status === 'Delivered' ? 'delivery' : 'intake'
                                    ),
                                    settings || {},
                                    { silent: true }
                                  );
                                  ctx.setNotice(`Repair bill ${ref('REP', r.id)} printed.`);
                                }}
                              >
                                Bill
                              </Button>
                            ),
                          ],
                        ]}
                      />
                    )}
                  </Panel>
                </div>
              ) : (
                <Panel>
                  <Empty>Select a customer from the directory or create a new customer profile.</Empty>
                </Panel>
              )}
            </div>
          </>
        );
      }}
    </DataView>
  );
}
