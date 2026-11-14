import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  CircleCheck,
  Clock3,
  FileText,
  Printer,
  Repeat2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  Field,
  FilterTabs,
  Heading,
  Panel,
  SearchSelect,
  Stats,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, managers, money, printBill, printThermalReceipt, ref, returnToBill, tenders } from '../../utils';
import { ExchangeModal } from './ExchangeModal';

const canManage = ctx => managers.includes(ctx.user.role) || ctx.user.role === 'cashier';
const exchangeDifference = row => Number(row.quoted_total) - Number(row.amount);
const settlementAction = difference =>
  difference > 0 ? `Collect ${money(difference)}`
    : difference < 0 ? `Refund ${money(-difference)}`
      : 'Even exchange · no payment due';
const refundMethods = invoice => [...new Set(invoice.payments.map(p => p.method === 'Exchange Credit' ? invoice.exchange_refund_method : p.method))]
  .filter(method => tenders.includes(method));

export function Returns({ ctx, embedded = false }) {
  const state = useData(ctx, { returns: 'returns', sales: 'sales', settings: 'settings' });
  const [lookup, setLookup] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [catalog, setCatalog] = useState({ products: [], units: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(ctx.intent === 'pending' ? 'Pending' : 'All');
  const [lookupRevision, setLookupRevision] = useState(0);
  const [modalTarget, setModalTarget] = useState(null); // { item, mode: 'exchange' | 'return' }

  const exchangeDone = async (outcome, settings) => {
    if (!outcome.failed) setModalTarget(null);
    setLookupRevision(value => value + 1);
    const isReturnOnly = outcome.mode === 'return';
    if (!outcome.processed) {
      if (!outcome.failed) {
        ctx.setNotice(
          isReturnOnly
            ? 'Return request saved. Process it in Return History below.'
            : 'Exchange request saved. Process it in Return History below.'
        );
      }
      return;
    }
    const { result, difference } = outcome;
    if (isReturnOnly) {
      ctx.setNotice(`Item return complete. Refunded ${money(result?.amount ?? Math.abs(difference || 0))}.`);
    } else {
      ctx.setNotice(
        difference > 0
          ? `Exchange complete. Collected ${money(difference)}; change ${money(result.change)}.`
          : difference < 0
            ? `Exchange complete. Refunded ${money(-difference)}.`
            : 'Exchange complete. No cash changed hands.'
      );
    }
    try {
      const list = await ctx.get('returns');
      const row = list.find(r => Number(r.id) === Number(outcome.id)) || { id: outcome.id };
      printBill(returnToBill({ ...row, ...result }, settings), settings, { silent: true });
    } catch {
      /* bill can be reprinted from Return History */
    }
  };

  useEffect(() => {
    if (!invoice) return;
    let active = true;
    ctx.get('invoice', { id: invoice.id, branch: invoice.branch_id })
      .then(found => { if (active) setInvoice(found); })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [ctx.revision, lookupRevision]);

  useEffect(() => {
    if (ctx.intent === 'pending') {
      setFilter('Pending');
      ctx.clearIntent();
    }
  }, [ctx.intent]);

  const loadInvoiceById = async targetId => {
    const query = String(targetId || '').trim();
    if (!query) return;
    setLookup(query);
    setLoading(true);
    setError('');
    setInvoice(null);
    try {
      const found = await ctx.get('invoice', { id: query });
      if (refundMethods(found).length) {
        const [products, units] = await Promise.all(
          ['products', 'units'].map(route => ctx.get(route, { branch: found.branch_id }))
        );
        setCatalog({ products, units });
      } else {
        setCatalog({ products: [], units: [] });
      }
      setInvoice(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const find = async e => {
    e.preventDefault();
    await loadInvoiceById(lookup);
  };

  const resolve = (row, decision) => {
    const difference = row.replacement ? exchangeDifference(row) : null;
    const collectPayment = decision === 'Completed' && difference > 0;
    ctx.setDialog({
      title:
        decision === 'Completed'
          ? row.replacement
            ? 'Approve & process exchange'
            : 'Approve & process return'
          : 'Reject request',
      description:
        ref('RET', row.id) +
        ' · ' +
        row.product +
        ' · ' +
        (row.replacement
          ? `Return credit: ${money(row.amount)} · New items: ${money(row.quoted_total)} · ${settlementAction(difference)}${difference < 0 ? ` via ${row.method}` : ''}`
          : row.reason),
      route: 'return.resolve',
      submit:
        decision === 'Completed'
          ? row.replacement
            ? difference > 0 ? 'Record payment' : difference < 0 ? 'Confirm refund' : 'Complete exchange'
            : 'Process refund'
          : 'Reject request',
      danger: decision === 'Rejected',
      values: { branch: row.branch_id, id: row.id, decision, method: 'Cash' },
      transform: collectPayment ? ({ branch, id, decision, method, ...values }) => ({
        branch, id, decision,
        payments: (method === 'Split payment' ? tenders : [method]).flatMap(tender => {
          const amount = method === 'Split payment' ? cents(values[tender]) : tender === 'Cash' ? cents(values.Cash) : difference;
          return amount > 0 ? [{ method: tender, amount, reference: values[`${tender}_reference`] }] : [];
        }),
      }) : undefined,
      fields: values => {
        if (!collectPayment) {
          return decision === 'Completed' && row.method !== 'Cash' && (row.replacement ? difference < 0 : true)
            ? [{ name: 'reference', label: `Confirmed ${row.method} refund reference`, full: true }]
            : [];
        }
        const split = values.method === 'Split payment';
        const methods = split ? tenders : [values.method];
        const entered = methods.reduce((sum, tender) => sum + cents(values[tender]), 0);
        return [
          { name: 'method', label: 'Payment method', choices: [...tenders, 'Split payment'], full: true },
          ...methods.flatMap(tender => [
            ...(split || tender === 'Cash' ? [{
              name: tender, label: `${tender} received (LKR)`, type: 'money', min: split ? 0 : difference / 100, optional: split,
            }] : []),
            ...(tender !== 'Cash' && (!split || cents(values[tender]) > 0) ? [{
              name: `${tender}_reference`, label: `${tender} payment reference`,
            }] : []),
          ]),
          ...(split || values.method === 'Cash' ? [{
            name: 'change_preview', label: entered < difference ? 'Remaining to pay' : 'Change to give',
            readOnly: true, placeholder: money(Math.abs(entered - difference)),
          }] : []),
        ];
      },
      onSuccess: result => {
        setLookupRevision(value => value + 1);
        if (decision === 'Completed') {
          if (row.replacement) {
            ctx.setNotice(difference > 0
              ? `Exchange complete. Collected ${money(difference)}; change ${money(result.change)}.`
              : difference < 0 ? `Exchange complete. Refunded via ${row.method}: ${money(-difference)}.` : 'Exchange complete. No cash changed hands.');
          }
          printBill(
            returnToBill({ ...row, ...result }, state.data?.settings),
            state.data?.settings,
            { silent: true }
          );
        }
      },
    });
  };

  return (
    <DataView state={state}>
      {({ returns, sales = [], settings }) => {
        const recentSales = sales.slice(0, 6);
        const firstEligibleItem = invoice?.items?.find(it => Number(it.qty) > Number(it.refunded_qty));
        const canActOnBill = Boolean(
          invoice &&
          firstEligibleItem &&
          !invoice.credit &&
          refundMethods(invoice).length > 0
        );

        return (
          <>
            {!embedded && (
              <Heading
                title="Returns & Exchanges"
                description="Select a bill, view all items on that bill, and exchange or return specific item(s) without exchanging the whole bill."
              />
            )}
            <Stats
              items={[
                {
                  icon: ArrowLeftRight,
                  label: 'Return Requests',
                  value: returns.length,
                  note: 'Recent requests',
                },
                {
                  icon: Clock3,
                  label: 'Pending',
                  value: returns.filter(r => r.status === 'Pending').length,
                  note: 'Awaiting review',
                  tone: 'amber',
                },
                {
                  icon: CircleCheck,
                  label: 'Completed',
                  value: returns.filter(r => r.status === 'Completed').length,
                  note: 'Processed refunds',
                  tone: 'mint',
                },
              ]}
            />

            <div className="stack">
              <Panel title="Original Bill & Items Lookup" icon={FileText}>
                <form className="panel-tools toolbar ret-bill-toolbar" onSubmit={find}>
                  <Field label="Select bill from sales list (type bill # or customer)">
                    <SearchSelect
                      value={invoice ? String(invoice.id) : ''}
                      blank="Type invoice number or customer name to view bill items…"
                      options={sales.map(s => [
                        String(s.id),
                        `${ref('INV', s.id)} · ${s.customer || 'Walk-in'} · ${money(s.total)} · ${s.payment_methods || 'Cash'}`,
                      ])}
                      onChange={ev => {
                        if (ev.target.value) loadInvoiceById(ev.target.value);
                      }}
                    />
                  </Field>
                  <Field label="Or enter invoice number">
                    <input
                      value={lookup}
                      placeholder="INV-000042"
                      onChange={e => setLookup(e.target.value)}
                      required
                    />
                  </Field>
                  <Button type="submit" icon={Search} variant="primary" disabled={loading}>
                    {loading ? 'Loading Bill…' : 'Show Bill Items'}
                  </Button>
                </form>

                {recentSales.length > 0 && (
                  <div className="ret-recent-strip">
                    <small>Recent Bills:</small>
                    {recentSales.map(s => (
                      <button
                        type="button"
                        key={s.id}
                        className={'ret-recent-chip' + (Number(invoice?.id) === Number(s.id) ? ' active' : '')}
                        onClick={() => loadInvoiceById(ref('INV', s.id))}
                      >
                        <strong>{ref('INV', s.id)}</strong>
                        <span>{s.customer || 'Walk-in'}</span>
                        <span>· {money(s.total)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="inset">
                  <Alert>{error}</Alert>
                </div>

                {invoice && (
                  <>
                    <div className="detail">
                      <div>
                        <small>Bill Number</small>
                        <strong>{ref('INV', invoice.id)}</strong>
                      </div>
                      <div>
                        <small>Customer</small>
                        <strong>{invoice.customer}</strong>
                      </div>
                      <div>
                        <small>Branch</small>
                        <strong>{invoice.branch}</strong>
                      </div>
                      <div>
                        <small>Bill Items</small>
                        <strong>{invoice.items.length} item(s)</strong>
                      </div>
                      <div>
                        <small>Bill Total</small>
                        <strong>{money(invoice.total)}</strong>
                      </div>
                      <div className="row-actions">
                        {canActOnBill && (
                          <>
                            <Button
                              variant="soft"
                              icon={RotateCcw}
                              onClick={() =>
                                setModalTarget({ item: firstEligibleItem, mode: 'return' })
                              }
                            >
                              Return Bill Item(s)
                            </Button>
                            <Button
                              variant="primary"
                              icon={Repeat2}
                              onClick={() =>
                                setModalTarget({ item: firstEligibleItem, mode: 'exchange' })
                              }
                            >
                              Exchange Bill Item(s)
                            </Button>
                          </>
                        )}
                        <Button
                          icon={Printer}
                          onClick={() => {
                            printThermalReceipt(invoice, settings, { silent: true });
                            ctx.setNotice(`Invoice ${ref('INV', invoice.id)} printed.`);
                          }}
                        >
                          Print Bill
                        </Button>
                      </div>
                    </div>

                    <div className="ret-bill-banner">
                      <span>
                        Showing all <strong>{invoice.items.length} item(s)</strong> on bill{' '}
                        <strong>{ref('INV', invoice.id)}</strong>. Click{' '}
                        <strong>Exchange Item</strong> or <strong>Return Item</strong> on any
                        specific item below — remaining items stay on the bill.
                      </span>
                    </div>

                    <Table
                      rows={invoice.items}
                      columns={[
                        ['Bill Item', 'name'],
                        ['IMEI / Serial', r => r.imei || r.code || '—'],
                        ['Unit Price', r => money(r.price)],
                        ['Sold Qty', 'qty'],
                        ['Returned', 'refunded_qty'],
                        [
                          'Remaining on Bill',
                          r => {
                            const rem = Math.max(0, Number(r.qty) - Number(r.refunded_qty));
                            return (
                              <Badge tone={rem > 0 ? 'mint' : 'slate'}>
                                {rem > 0 ? `${rem} on bill` : 'Fully returned'}
                              </Badge>
                            );
                          },
                        ],
                        ['Line Total', r => money(r.total)],
                        [
                          'Item Action',
                          r => (
                            <div className="row-actions">
                              <Button
                                variant="soft"
                                icon={RotateCcw}
                                disabled={
                                  r.qty === r.refunded_qty ||
                                  Boolean(invoice.credit) ||
                                  !refundMethods(invoice).length
                                }
                                onClick={() => setModalTarget({ item: r, mode: 'return' })}
                              >
                                Return Item
                              </Button>
                              {refundMethods(invoice).length > 0 && (
                                <Button
                                  variant="primary"
                                  icon={Repeat2}
                                  disabled={r.qty === r.refunded_qty || Boolean(invoice.credit)}
                                  onClick={() => setModalTarget({ item: r, mode: 'exchange' })}
                                >
                                  Exchange Item
                                </Button>
                              )}
                            </div>
                          ),
                        ],
                      ]}
                    />
                    {Boolean(invoice.credit) && (
                      <p className="note-strip">
                        Settle the outstanding credit before requesting a refund or exchange.
                      </p>
                    )}
                  </>
                )}
              </Panel>

              <Panel
                title="Return & Exchange History"
                icon={ArrowLeftRight}
                action={
                  <FilterTabs
                    choices={['All', 'Pending', 'Completed', 'Rejected']}
                    value={filter}
                    onChange={setFilter}
                  />
                }
              >
                <Table
                  rows={returns.filter(r => filter === 'All' || r.status === filter)}
                  columns={[
                    ['Return #', r => ref('RET', r.id)],
                    ['Invoice', r => ref('INV', r.sale_id)],
                    ['Returned Item(s)', 'product'],
                    ['Customer', 'customer'],
                    [
                      'Type',
                      r =>
                        r.replacement ? (
                          <>
                            <Badge tone="blue">Exchange</Badge>
                            {r.replacement_sale_id && (
                              <small className="subtext">{ref('INV', r.replacement_sale_id)}</small>
                            )}
                          </>
                        ) : (
                          <Badge tone="violet">Refund</Badge>
                        ),
                    ],
                    ['Refund method', 'method'],
                    [
                      'Settlement',
                      r =>
                        r.replacement
                          ? r.status !== 'Completed'
                            ? settlementAction(exchangeDifference(r))
                            : exchangeDifference(r) > 0
                              ? `Collected ${money(exchangeDifference(r))}`
                              : exchangeDifference(r) < 0
                                ? `Refunded ${money(-exchangeDifference(r))}`
                                : 'Even exchange'
                          : money(r.amount),
                    ],
                    ['Status', r => <Badge>{r.status}</Badge>],
                    [
                      'Actions',
                      r => (
                        <div className="row-actions">
                          <Button
                            icon={Printer}
                            variant="outline"
                            onClick={() => {
                              printBill(returnToBill(r, settings), settings, {
                                silent: true,
                                reprint: true,
                              });
                              ctx.setNotice(`Return bill ${ref('RET', r.id)} printed.`);
                            }}
                          >
                            Bill
                          </Button>
                          {r.status === 'Pending' && canManage(ctx) && (
                            <>
                              <Button variant="soft" onClick={() => resolve(r, 'Completed')}>
                                Process
                              </Button>
                              <Button variant="outline-red" onClick={() => resolve(r, 'Rejected')}>
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      ),
                    ],
                  ]}
                />
              </Panel>
            </div>
            {modalTarget && invoice && (
              <ExchangeModal
                ctx={ctx}
                invoice={invoice}
                item={modalTarget.item}
                initialMode={modalTarget.mode}
                catalog={catalog}
                settings={settings}
                refundMethods={refundMethods(invoice)}
                onClose={() => setModalTarget(null)}
                onDone={outcome => exchangeDone(outcome, settings)}
              />
            )}
          </>
        );
      }}
    </DataView>
  );
}
