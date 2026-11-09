import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  LockKeyhole,
  Plus,
  Wallet,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Button,
  Heading,
  Panel,
  Stats,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, dateLabel, managers, money, timeLabel, today } from '../../utils';

const canManage = ctx => managers.includes(ctx.user.role);
const dateField = { name: 'business_date', label: 'Business date', type: 'date' };
const amountField = { name: 'amount', label: 'Amount (LKR)', type: 'money', min: 0.01 };

export function CashRegister({ ctx }) {
  const state = useData(ctx, { register: 'drawer' });

  const open = () =>
    ctx.setDialog({
      title: 'Open cash drawer',
      description: 'Record the opening float for the current business day.',
      route: 'drawer.open',
      submit: 'Open drawer',
      fields: [{ name: 'opening', label: 'Opening float (LKR)', type: 'money', full: true }],
      values: { opening: 0 },
      transform: v => ({ ...v, opening: cents(v.opening) }),
    });

  const close = drawer =>
    ctx.setDialog({
      title: 'Reconcile and close drawer',
      description: 'Expected cash · ' + money(drawer.expected),
      route: 'drawer.close',
      submit: 'Close drawer',
      fields: v => [
        { name: 'counted', label: 'Counted cash (LKR)', type: 'money', full: true },
        {
          name: 'notes',
          label: 'Variance notes',
          type: 'textarea',
          optional: cents(v.counted) === drawer.expected,
        },
      ],
      transform: v => ({ ...v, counted: cents(v.counted) }),
      onSuccess: r => ctx.setNotice('Drawer closed · variance ' + money(r.variance)),
    });

  const movement = direction =>
    ctx.setDialog({
      title: 'Cash ' + direction.toLowerCase(),
      route: 'drawer.movement',
      values: { direction },
      fields: [amountField, { name: 'reason', label: 'Reason / reference', full: true }],
      transform: v => ({ ...v, amount: cents(v.amount) }),
    });

  return (
    <DataView state={state}>
      {({ register: { drawer, movements, history, blocked } }) => {
        const inflow = movements.reduce((s, r) => s + Math.max(0, r.amount), 0);
        const outflow = movements.reduce((s, r) => s + Math.min(0, r.amount), 0);
        const current = drawer?.business_date === today();

        return (
          <>
            <Heading
              title="Cash Register"
              description="Track physical cash, reconcile the drawer and close your business day."
            >
              <span className="date-chip">
                <CalendarDays size={16} />
                {dateLabel(today())}
              </span>
              {drawer ? (
                <Button icon={LockKeyhole} variant="primary" onClick={() => close(drawer)}>
                  Close drawer
                </Button>
              ) : (
                <Button icon={Plus} variant="primary" disabled={blocked} onClick={open}>
                  Open drawer
                </Button>
              )}
            </Heading>

            {blocked && <Alert>This branch has an open drawer assigned to another cashier.</Alert>}
            {drawer && !current && (
              <Alert>
                The previous business date is still open. Reconcile it before starting today's
                sales.
              </Alert>
            )}

            <Stats
              items={[
                {
                  icon: Wallet,
                  label: 'Opening Float',
                  value: money(drawer?.opening),
                  note: drawer?.operator || 'Drawer closed',
                },
                {
                  icon: ArrowDownLeft,
                  label: 'Cash In',
                  value: money(inflow),
                  note: 'Confirmed cash movements',
                  tone: 'mint',
                },
                {
                  icon: ArrowUpRight,
                  label: 'Cash Out',
                  value: money(-outflow),
                  note: 'Refunds and disbursements',
                  tone: 'red',
                },
                {
                  icon: Banknote,
                  label: 'Expected Cash',
                  value: money(drawer?.expected),
                  note: drawer ? 'Live drawer balance' : 'No open session',
                  tone: 'violet',
                },
              ]}
            />

            <div className="stack">
              <Panel
                title="Drawer Movements"
                icon={Wallet}
                action={
                  drawer &&
                  current &&
                  canManage(ctx) && (
                    <div className="row-actions">
                      <Button icon={ArrowDownLeft} onClick={() => movement('In')}>
                        Cash in
                      </Button>
                      <Button icon={ArrowUpRight} onClick={() => movement('Out')}>
                        Cash out
                      </Button>
                    </div>
                  )
                }
              >
                <Table
                  rows={movements}
                  columns={[
                    ['Date & time', r => timeLabel(r.created_at)],
                    ['Movement', 'kind'],
                    ['Reference', 'reference'],
                    [
                      'Amount',
                      r => (
                        <strong className={r.amount < 0 ? 'text-red' : 'text-green'}>
                          {money(r.amount)}
                        </strong>
                      ),
                    ],
                  ]}
                />
              </Panel>

              <Panel
                title="Closed Sessions"
                icon={LockKeyhole}
                action={
                  canManage(ctx) && (
                    <Button
                      onClick={() =>
                        ctx.setDialog({
                          title: 'Close business day',
                          route: 'cycle.close',
                          values: { business_date: today() },
                          fields: [dateField],
                          submit: 'Close day',
                        })
                      }
                    >
                      Close business day
                    </Button>
                  )
                }
              >
                <Table
                  rows={history}
                  columns={[
                    ['Business date', r => dateLabel(r.business_date)],
                    ['Operator', 'operator'],
                    ['Opening', r => money(r.opening)],
                    ['Expected', r => money(r.expected)],
                    ['Counted', r => money(r.counted)],
                    ['Variance', r => money(r.counted - r.expected)],
                    ['Notes', 'notes'],
                  ]}
                />
              </Panel>
            </div>
          </>
        );
      }}
    </DataView>
  );
}
