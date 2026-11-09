import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Plus,
  UserRound,
  Wrench,
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
import { DataView } from '../../components/feedback';
import {
  cents,
  dateLabel,
  money,
  options,
  ref,
  today,
  transitions,
} from '../../utils';

const actionBranch = ctx => ctx.branch || ctx.branches[0]?.id;
const itemFilter = (item, q, fields) =>
  fields.some(key =>
    String(item[key] || '')
      .toLowerCase()
      .includes(q.trim().toLowerCase())
  );

export function Repairs({ ctx }) {
  const tech = ctx.user.role === 'technician';
  const [intakeBranch, setIntakeBranch] = useState(actionBranch(ctx));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(ctx.intent === 'overdue' ? 'Overdue' : 'All jobs');
  const [view, setView] = useState('Board');
  const [assigned, setAssigned] = useState('');
  const [detail, setDetail] = useState(null);
  const state = useData(ctx, {
    jobs: 'repairs',
    ...(!tech
      ? {
          customers: ['customers', { branch: intakeBranch }],
          technicians: ['technicians', { branch: intakeBranch }],
        }
      : {}),
  });

  const intake = (customers, technicians) =>
    ctx.setDialog({
      title: 'New Repair Job',
      description: 'Record the customer, device condition and reported issue.',
      route: 'repair.create',
      wide: true,
      submit: 'Create repair job',
      values: { branch: intakeBranch, due_date: today(), estimate: 0 },
      fields: [
        { name: 'customer_id', label: 'Customer', choices: options(customers) },
        {
          name: 'technician_id',
          label: 'Assigned technician',
          choices: options(technicians),
          optional: true,
        },
        { name: 'device', label: 'Device brand and model' },
        { name: 'serial', label: 'IMEI / Serial number', optional: true },
        { name: 'issue', label: 'Reported issue', type: 'textarea' },
        { name: 'notes', label: 'Physical condition notes', type: 'textarea', optional: true },
        { name: 'accessories', label: 'Accessories handed over', optional: true },
        { name: 'estimate', label: 'Estimated cost (LKR)', type: 'money' },
        { name: 'due_date', label: 'Promised date', type: 'date' },
      ],
      transform: v => ({ ...v, estimate: cents(v.estimate) }),
    });

  useEffect(() => {
    if (ctx.intent === 'overdue') {
      setFilter('Overdue');
      ctx.clearIntent();
    }
    if (ctx.intent === 'new' && state.data && !tech) {
      intake(state.data.customers, state.data.technicians);
      ctx.clearIntent();
    }
  }, [ctx.intent, state.data]);

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
      title: ref('REP', job.id) + ' · ' + job.device,
      description: job.customer + ' · ' + job.issue + ' · ' + job.status,
      route: 'repair.status',
      submit: 'Update status',
      values: { branch: job.branch_id, id: job.id },
      fields: [{ name: 'status', label: 'Next status', choices: next, full: true }],
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
      {({ jobs, customers, technicians }) => {
        const active = jobs.filter(j => !['Delivered', 'Cancelled'].includes(j.status));
        const overdue = active.filter(j => j.due_date < today());
        const due = active.filter(j => j.due_date === today());
        const results = jobs.filter(
          j =>
            (!assigned || String(j.technician_id) === assigned) &&
            (filter === 'All jobs' || (filter === 'Overdue' ? overdue.includes(j) : due.includes(j))) &&
            (itemFilter(j, query, ['customer', 'device', 'issue', 'serial']) ||
              ref('REP', j.id).toLowerCase().includes(query.toLowerCase()))
        );

        return (
          <>
            <Heading
              title={tech ? 'My Repair Jobs' : 'Repair Jobs Board'}
              description="Manage and track devices from intake to delivery."
            >
              {!tech && (
                <>
                  <Select
                    aria-label="Intake branch"
                    value={intakeBranch}
                    onChange={e => setIntakeBranch(Number(e.target.value))}
                    options={options(ctx.branches)}
                  />
                  <Button
                    icon={Plus}
                    variant="primary"
                    disabled={state.pending}
                    onClick={() => intake(customers, technicians)}
                  >
                    New repair job
                  </Button>
                </>
              )}
            </Heading>

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
                  placeholder="Search job, device or customer…"
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
                              <strong className="mono">{ref('REP', j.id)}</strong>
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
                                aria-label={'Open ' + ref('REP', j.id)}
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
              <Panel title="Repair Jobs" icon={Wrench}>
                <Table
                  rows={results}
                  onRow={openJob}
                  columns={[
                    ['Job', r => ref('REP', r.id)],
                    ['Device', 'device'],
                    ['Customer', 'customer'],
                    ['Technician', 'technician'],
                    ['Promised date', r => dateLabel(r.due_date)],
                    ['Estimate', r => money(r.estimate)],
                    ['Status', r => <Badge>{r.status}</Badge>],
                  ]}
                />
              </Panel>
            )}

            {detail && (
              <Modal
                title={ref('REP', detail.id) + ' · ' + detail.device}
                description={detail.customer + ' · ' + detail.status}
                onClose={() => setDetail(null)}
              >
                <div className="modal-body">
                  <p>{detail.issue}</p>
                  <div className="detail">
                    <div>
                      <small>Technician</small>
                      <strong>{detail.technician || 'Unassigned'}</strong>
                    </div>
                    <div>
                      <small>Promised date</small>
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
          </>
        );
      }}
    </DataView>
  );
}
