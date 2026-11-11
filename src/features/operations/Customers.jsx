import { useEffect, useState } from 'react';
import { Award, CreditCard, DollarSign, Pencil, Plus, UserRound, Users, Wallet, Wrench } from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Heading,
  Panel,
  SearchBox,
  Stats,
  Table,
} from '../../components/common';
import { DataView, Empty } from '../../components/feedback';
import { cents, initials, money, options, ref, tenders } from '../../utils';

const actionBranch = ctx => ctx.branch || ctx.branches[0]?.id;
const branchField = ctx => ({ name: 'branch', label: 'Branch', choices: options(ctx.branches) });
const itemFilter = (item, q, fields) =>
  fields.some(key =>
    String(item[key] || '')
      .toLowerCase()
      .includes(q.trim().toLowerCase())
  );

export function Customers({ ctx }) {
  const state = useData(ctx, {
    customers: 'customers',
    sales: 'sales',
    repairs: 'repairs',
  });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [onlyCredit, setOnlyCredit] = useState(ctx.intent === 'credit');

  useEffect(() => {
    if (ctx.intent === 'credit') {
      setOnlyCredit(true);
      ctx.clearIntent();
    }
  }, [ctx.intent]);

  const form = person =>
    ctx.setDialog({
      title: person ? 'Edit customer' : 'New customer',
      route: 'customer.save',
      values: { ...person, branch: person?.branch_id || actionBranch(ctx) },
      fields: [
        ...(!person ? [branchField(ctx)] : []),
        { name: 'name', label: 'Full name' },
        { name: 'phone', label: 'Phone number', type: 'tel' },
        { name: 'email', label: 'Email', type: 'email', optional: true },
        { name: 'notes', label: 'Notes', type: 'textarea', optional: true },
      ],
      onSuccess: r => setSelected(r.id),
    });

  return (
    <DataView state={state}>
      {({ customers, sales, repairs }) => {
        const filtered = customers.filter(
          c => itemFilter(c, query, ['name', 'phone', 'email']) && (!onlyCredit || c.credit > 0)
        );
        const person = filtered.find(c => c.id === selected) || filtered[0];
        const personSales = person ? sales.filter(s => s.customer_id === person.id) : [];
        const receivables = personSales.filter(s => s.credit > 0);

        const payment = () =>
          ctx.setDialog({
            title: 'Record credit payment',
            description: person.name + ' · ' + money(person.credit) + ' outstanding',
            route: 'sale.credit',
            submit: 'Record payment',
            values: {
              branch: person.branch_id,
              method: 'Cash',
              invoice: receivables[0] ? ref('INV', receivables[0].id) : '',
            },
            fields: v => [
              { name: 'invoice', label: 'Invoice number' },
              { name: 'amount', label: 'Amount (LKR)', type: 'money', min: 0.01 },
              { name: 'method', label: 'Payment method', choices: tenders },
              ...(v.method !== 'Cash'
                ? [{ name: 'reference', label: 'Confirmed transaction reference' }]
                : []),
            ],
            transform: v => ({ ...v, amount: cents(v.amount) }),
          });

        return (
          <>
            <Heading
              title="Customers & Credit"
              description="Manage customer profiles, purchase history and outstanding credit."
            >
              <Button icon={Plus} variant="primary" onClick={() => form()}>
                New customer
              </Button>
            </Heading>

            <Stats
              items={[
                {
                  icon: Users,
                  label: 'Total Customers',
                  value: customers.length,
                  note: 'Selected branch scope',
                },
                {
                  icon: CreditCard,
                  label: 'Outstanding Credit',
                  value: money(customers.reduce((s, c) => s + Number(c.credit), 0)),
                  note: 'Open receivables',
                  tone: 'violet',
                },
                {
                  icon: DollarSign,
                  label: 'Total Purchases',
                  value: money(customers.reduce((s, c) => s + Number(c.total), 0)),
                  note: 'Posted sales to customers',
                  tone: 'mint',
                },
              ]}
            />

            <div className="split-grid">
              <Panel title="Customer List" icon={Users}>
                <div className="panel-tools toolbar">
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Search by name, phone or email…"
                  />
                  <Button
                    variant={onlyCredit ? 'primary' : ''}
                    onClick={() => setOnlyCredit(!onlyCredit)}
                  >
                    Credit only
                  </Button>
                </div>
                <Table
                  rows={filtered}
                  onRow={c => setSelected(c.id)}
                  columns={[
                    [
                      'Customer',
                      c => (
                        <div className="table-product">
                          <span className="avatar mini">{initials(c.name)}</span>
                          <span>
                            <strong>{c.name}</strong>
                            <small className="subtext">{ref('CUS', c.id)}</small>
                          </span>
                        </div>
                      ),
                    ],
                    ['Phone', 'phone'],
                    ['Branch', 'branch'],
                    [
                      'Points',
                      c => (
                        <Badge tone="amber">
                          {Number(c.loyalty_points || 0).toLocaleString()} pts
                        </Badge>
                      ),
                    ],
                    [
                      'Wallet',
                      c => (
                        <Badge tone={Number(c.wallet_balance || 0) > 0 ? 'green' : 'slate'}>
                          {money(c.wallet_balance || 0)}
                        </Badge>
                      ),
                    ],
                    [
                      'Credit',
                      c => (
                        <Badge tone={c.credit > 0 ? 'red' : 'green'}>{money(c.credit)}</Badge>
                      ),
                    ],
                  ]}
                />
              </Panel>

              {person ? (
                <div className="stack">
                  <Panel
                    title={person.name}
                    icon={UserRound}
                    action={<Button icon={Pencil} onClick={() => form(person)}>Edit</Button>}
                  >
                    <div className="detail">
                      <div>
                        <small>Customer ID</small>
                        <strong>{ref('CUS', person.id)}</strong>
                      </div>
                      <div>
                        <small>Phone</small>
                        <strong>{person.phone}</strong>
                      </div>
                      <div>
                        <small>Email</small>
                        <strong>{person.email || '—'}</strong>
                      </div>
                      <div>
                        <small>Branch</small>
                        <strong>{person.branch}</strong>
                      </div>
                      <div>
                        <small>Loyalty Points (1 LKR = 1 pt)</small>
                        <strong>{Number(person.loyalty_points || 0).toLocaleString()} pts</strong>
                      </div>
                      <div>
                        <small>Wallet Balance</small>
                        <strong style={{ color: '#0f766e' }}>{money(person.wallet_balance || 0)}</strong>
                      </div>
                    </div>
                    {person.notes && <p className="note-strip">{person.notes}</p>}
                    <div className="panel-tools toolbar">
                      <strong>Credit balance · {money(person.credit)}</strong>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button
                          icon={Wallet}
                          variant="soft"
                          onClick={() =>
                            ctx.setDialog({
                              title: `Top Up Wallet · ${person.name}`,
                              description: `Current Wallet: ${money(person.wallet_balance || 0)}`,
                              route: 'customer.wallet.topup',
                              submit: 'Add Funds',
                              values: { branch: person.branch_id, customer_id: person.id, amount: '', method: 'Cash', reference: '' },
                              fields: v => [
                                { name: 'amount', label: 'Top-Up Amount (LKR)', type: 'money', min: 1, full: true },
                                { name: 'method', label: 'Method', choices: tenders },
                                ...(v.method !== 'Cash'
                                  ? [{ name: 'reference', label: 'Reference', optional: true }]
                                  : []),
                              ],
                              transform: v => ({ ...v, amount: cents(v.amount || 0) }),
                            })
                          }
                        >
                          Top Up Wallet
                        </Button>
                        <Button
                          icon={CreditCard}
                          variant="primary"
                          disabled={!Number(person.credit)}
                          onClick={payment}
                        >
                          Record payment
                        </Button>
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Recent Sales" icon={CreditCard}>
                    <Table
                      rows={personSales.slice(0, 5)}
                      columns={[
                        ['Invoice', r => ref('INV', r.id)],
                        ['Items', 'items'],
                        ['Total', r => money(r.total)],
                        ['Credit', r => money(r.credit)],
                      ]}
                    />
                  </Panel>

                  <Panel title="Repair History" icon={Wrench}>
                    <Table
                      rows={repairs.filter(r => r.customer_id === person.id).slice(0, 5)}
                      columns={[
                        ['Job', r => ref('REP', r.id)],
                        ['Device', 'device'],
                        ['Status', r => <Badge>{r.status}</Badge>],
                      ]}
                    />
                  </Panel>
                </div>
              ) : (
                <Panel>
                  <Empty>Select a customer to view details.</Empty>
                </Panel>
              )}
            </div>
          </>
        );
      }}
    </DataView>
  );
}
