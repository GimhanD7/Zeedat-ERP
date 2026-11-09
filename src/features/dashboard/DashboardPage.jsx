import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BellRing,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileText,
  List,
  Package,
  Store,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Empty,
  FilterTabs,
  Heading,
  Panel,
  Stats,
  Table,
} from '../../components/common';
import { DataView } from '../../components/feedback';
import { dateLabel, money, number, ref, timeLabel } from '../../utils';
import { TrendChart } from './TrendChart';

const ranges = [
  [7, '7 Days'],
  [30, '30 Days'],
  [90, '3 Months'],
  [365, 'Year'],
];

export const saleColumns = [
  ['Invoice #', r => <strong className="mono">{ref('INV', r.id)}</strong>],
  ['Date & time', r => timeLabel(r.created_at)],
  ['Branch', 'branch'],
  ['Type', () => <Badge tone="green">Sale</Badge>],
  ['Customer', 'customer'],
  ['Items', 'items'],
  ['Amount', r => <strong>{money(r.total)}</strong>],
];

function LinkButton({ children, onClick }) {
  return (
    <Button variant="link" onClick={onClick} icon={undefined}>
      {children}
      <ArrowRight size={15} />
    </Button>
  );
}

export function DashboardPage({ ctx }) {
  const [days, setDays] = useState(7);
  const state = useData(ctx, { dashboard: ['dashboard', { days }] });

  useEffect(() => {
    if (ctx.intent === 'alerts' && state.data) {
      document
        .getElementById('dashboard-alerts')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      ctx.clearIntent();
    }
  }, [ctx.intent, state.data]);

  return (
    <DataView state={state}>
      {({ dashboard: d }) => {
        const alerts = [
          [AlertTriangle, 'Low Stock Items', 'Items at or below reorder level', d.low.length, 'red', 'inventory', 'low'],
          [Clock3, 'Pending Approvals', 'Return requests awaiting review', d.pending.length, 'blue', 'returns', 'pending'],
          [Wrench, 'Overdue Repairs', 'Open jobs past their promised date', d.repairs.overdue, 'blue', 'repairs', 'overdue'],
          [UserRound, 'Unpaid Balances', 'Customers with an outstanding balance', d.credit_accounts, 'blue', 'customers', 'credit'],
        ];

        return (
          <>
            <Heading
              title={ctx.branch ? 'Branch Dashboard' : 'Owner Dashboard'}
              description={
                'Business overview ' +
                (ctx.branch ? 'for your branch' : 'across all branches') +
                ' — sales, repairs, inventory and operations.'
              }
            >
              <span className="date-chip">
                <CalendarDays size={17} /> Today, {dateLabel(d.today)}
              </span>
            </Heading>

            <Stats
              items={[
                {
                  icon: ChartNoAxesCombined,
                  label: 'Total Sales Today',
                  value: money(d.sales),
                  note: (
                    <>
                      <ArrowUpRight size={14} /> {number(d.bills)} posted invoices
                    </>
                  ),
                },
                {
                  icon: Banknote,
                  label: 'Collections',
                  value: money(d.collected),
                  note: 'Payments received today',
                  tone: 'mint',
                },
                {
                  icon: CreditCard,
                  label: 'Outstanding Credit',
                  value: money(d.credit),
                  note: number(d.credit_accounts) + ' customer accounts',
                  tone: 'violet',
                },
                {
                  icon: Wrench,
                  label: 'Open Repairs',
                  value: number(d.repairs.open_count),
                  note: number(d.repairs.overdue) + ' overdue',
                  tone: 'teal',
                },
                {
                  icon: AlertTriangle,
                  label: 'Low Stock Alerts',
                  value: number(d.low.length),
                  note: 'At or below reorder level',
                  tone: 'red',
                },
              ]}
            />

            <div className="dashboard-grid">
              <div className="stack">
                <Panel
                  title="Branch Performance"
                  icon={Store}
                  action={<LinkButton onClick={() => ctx.navigate('reports')}>View branch report</LinkButton>}
                >
                  <div className="branch-grid">
                    {d.branches.map((b, i) => (
                      <div className={'branch-card ' + (i === 0 ? 'featured' : '')} key={b.id}>
                        <strong>
                          <Store size={17} />
                          {b.name}
                        </strong>
                        <b>{money(b.sales)}</b>
                        <span>
                          {number(b.bills)} sales <i /> {number(b.repairs)} repairs
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel
                  title={'Sales Trend ' + (!ctx.branch ? '– All Branches' : '')}
                  icon={ChartNoAxesCombined}
                  action={<FilterTabs choices={ranges} value={days} onChange={setDays} />}
                >
                  <TrendChart trend={d.trend} />
                </Panel>

                <Panel
                  title="Recent Transactions"
                  icon={List}
                  action={<LinkButton onClick={() => ctx.navigate('sales')}>View all transactions</LinkButton>}
                >
                  <Table columns={saleColumns} rows={d.recent} />
                </Panel>
              </div>

              <div className="stack" id="dashboard-alerts">
                <Panel title="Alerts & Notices" icon={BellRing}>
                  <div className="alert-list">
                    {alerts.map(([Icon, label, note, count, tone, page, intent]) => (
                      <button
                        key={label}
                        className="alert-row"
                        onClick={() => ctx.navigate(page, intent)}
                      >
                        <span className={'stat-icon ' + tone}>
                          <Icon size={19} />
                        </span>
                        <span>
                          <strong>{label}</strong>
                          <small>{note}</small>
                        </span>
                        <Badge tone={count ? tone : 'green'}>{number(count)}</Badge>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel
                  title={'Approvals (' + d.pending.length + ' Pending)'}
                  icon={ClipboardCheck}
                  action={<LinkButton onClick={() => ctx.navigate('returns', 'pending')}>View all</LinkButton>}
                >
                  {d.pending.length ? (
                    <div className="alert-list">
                      {d.pending.map(r => (
                        <button
                          className="alert-row approval"
                          key={r.id}
                          onClick={() => ctx.navigate('returns', 'pending')}
                        >
                          <span className="stat-icon teal">
                            <FileText size={18} />
                          </span>
                          <span>
                            <strong>Return request · {ref('RET', r.id)}</strong>
                            <small>
                              {r.branch} · {money(r.amount)}
                            </small>
                          </span>
                          <Badge tone="amber">Review</Badge>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty>No requests awaiting review.</Empty>
                  )}
                </Panel>

                <Panel title="Quick Actions" icon={Package}>
                  <div className="quick-actions">
                    <Button variant="primary" onClick={() => ctx.navigate('pos')}>
                      New sale <ArrowRight size={15} />
                    </Button>
                    <Button onClick={() => ctx.navigate('repairs', 'new')}>
                      New repair <ArrowRight size={15} />
                    </Button>
                  </div>
                </Panel>
              </div>
            </div>
          </>
        );
      }}
    </DataView>
  );
}
