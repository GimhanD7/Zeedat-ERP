import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  CircleCheck,
  Clock3,
  FileText,
  Printer,
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
  Stats,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { cents, managers, money, options, printBill, printThermalReceipt, ref, returnToBill, tenders } from '../../utils';
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
  const state = useData(ctx, { returns: 'returns', settings: 'settings' });
  const [lookup, setLookup] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [catalog, setCatalog] = useState({ products: [], units: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(ctx.intent === 'pending' ? 'Pending' : 'All');
  const [lookupRevision, setLookupRevision] = useState(0);
  const [exchangeItem, setExchangeItem] = useState(null);

  const exchangeDone = async (outcome, settings) => {
    if (!outcome.failed) setExchangeItem(null);
    setLookupRevision(value => value + 1);
    if (!outcome.processed) {
      if (!outcome.failed) ctx.setNotice('Exchange request saved. Process it in Return History below.');
      return;
    }
    const { result, difference } = outcome;
    ctx.setNotice(difference > 0
      ? `Exchange complete. Collected ${money(difference)}; change ${money(result.change)}.`
      : difference < 0 ? `Exchange complete. Refunded ${money(-difference)}.` : 'Exchange complete. No cash changed hands.');
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

  const find = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInvoice(null);
    try {
      const found = await ctx.get('invoice', { id: lookup });
      if (refundMethods(found).length) {
        const [products, units] = await Promise.all(
          ['products', 'units'].map(route => ctx.get(route, { branch: found.branch_id }))
        );
        setCatalog({ products, units });
      } else setCatalog({ products: [], units: [] });
      setInvoice(found);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const request = (item, exchange = false) =>
    ctx.setDialog({
      title: exchange ? 'New exchange request' : 'New return request',
      description: ref('INV', invoice.id) + ' · ' + item.name,
      route: 'return.request',
      submit: 'Submit request',
      values: {
        branch: invoice.branch_id,
        item_id: item.id,
        qty: 1,
        method: refundMethods(invoice)[0] || '',
        addon_ids: [],
        next_addon_id: 1,
        replacement_qty: 1,
      },
      transform: values => {
        const { branch, item_id, qty, method, condition_note, reason, restock } = values;
        const body = { branch, item_id, qty, method, condition_note, reason, restock };
        if (!exchange) return body;
        const itemValues = (productKey, qtyKey, unitKey) => {
          const product = catalog.products.find(p => Number(p.id) === Number(values[productKey]));
          return {
            product_id: values[productKey],
            qty: product?.serialized ? 1 : values[qtyKey] || 1,
            unit_id: product?.serialized ? values[unitKey] : undefined,
          };
        };
        const replacement = itemValues('replacement_product_id', 'replacement_qty', 'replacement_unit_id');
        return {
          ...body,
          replacement_product_id: replacement.product_id,
          replacement_qty: replacement.qty,
          replacement_unit_id: replacement.unit_id,
          addons: values.addon_ids.map(id => itemValues(`addon_${id}_product`, `addon_${id}_qty`, `addon_${id}_unit`)),
        };
      },
      actions: exchange ? (values, update) => (
        <div className="row-actions">
          <Button variant="soft" disabled={values.addon_ids.length >= 99} onClick={() => {
            update('addon_ids', [...values.addon_ids, values.next_addon_id]);
            update('next_addon_id', values.next_addon_id + 1);
          }}>Add another item</Button>
          {!!values.addon_ids.length && <Button onClick={() => update('addon_ids', values.addon_ids.slice(0, -1))}>
            Remove last item
          </Button>}
        </div>
      ) : undefined,
      fields: v => {
        const products = catalog.products.filter(p =>
          Number(p.branch_stocks?.find(s => Number(s.branch_id) === Number(invoice.branch_id))?.available_qty ?? p.qty) > 0 && p.category !== 'Services'
        );
        const itemFields = (productKey, qtyKey, unitKey, label) => {
          const product = products.find(p => Number(p.id) === Number(v[productKey]));
          return [
            { name: productKey, label, choices: options(products) },
            ...(product?.serialized
              ? [{
                name: unitKey, label: 'Device', choices: options(catalog.units.filter(
                  u => Number(u.product_id) === Number(product.id) && u.state === 'Available' && !Number(u.reserved)
                ), 'code'),
              }]
              : [{ name: qtyKey, label: 'Quantity (defaults to 1)', type: 'number', min: 1, optional: true }]),
          ];
        };
        return [
          {
            name: 'qty',
            label: 'Quantity to return',
            type: 'number',
            min: 1,
            max: item.qty - item.refunded_qty,
          },
          { name: 'method', label: exchange ? 'Original method for any refund' : 'Original payment method', choices: refundMethods(invoice) },
          { name: 'condition_note', label: 'Item condition', full: true },
          { name: 'reason', label: 'Reason for return', type: 'textarea' },
          ...(!item.unit_id
            ? [{ name: 'restock', label: 'Item is sellable and can return to stock', type: 'checkbox' }]
            : []),
          ...(exchange ? [
            ...itemFields('replacement_product_id', 'replacement_qty', 'replacement_unit_id', 'Replacement product'),
            ...v.addon_ids.flatMap((id, index) => itemFields(`addon_${id}_product`, `addon_${id}_qty`, `addon_${id}_unit`, `Extra item ${index + 1}`)),
          ] : []),
        ];
      },
      onSuccess: () => {
        setLookupRevision(value => value + 1);
        ctx.setNotice(exchange ? 'Exchange request saved. Process it in Return History below.' : 'Return request saved. Process it in Return History below.');
      },
    });

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
      {({ returns, settings }) => (
        <>
          {!embedded && <Heading
            title="Returns & Exchanges"
            description="Look up an invoice, record returned items and review refund or exchange requests."
          />}
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
            <Panel title="Original Invoice" icon={FileText}>
              <form className="panel-tools toolbar" onSubmit={find}>
                <Field label="Search by invoice number">
                  <input
                    value={lookup}
                    placeholder="INV-000042"
                    onChange={e => setLookup(e.target.value)}
                    required
                  />
                </Field>
                <Button type="submit" icon={Search} variant="primary" disabled={loading}>
                  {loading ? 'Searching…' : 'Find invoice'}
                </Button>
              </form>
              <div className="inset">
                <Alert>{error}</Alert>
              </div>
              {invoice && (
                <>
                  <div className="detail">
                    <div>
                      <small>Invoice</small>
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
                      <small>Total</small>
                      <strong>{money(invoice.total)}</strong>
                    </div>
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
                  <Table
                    rows={invoice.items}
                    columns={[
                      ['Item', 'name'],
                      ['IMEI / serial', r => r.imei || r.code || '—'],
                      ['Sold', 'qty'],
                      ['Returned', 'refunded_qty'],
                      ['Total', r => money(r.total)],
                      [
                        'Action',
                        r => (
                          <div className="row-actions">
                            <Button
                              variant="soft"
                              disabled={r.qty === r.refunded_qty || Boolean(invoice.credit) || !refundMethods(invoice).length}
                              onClick={() => request(r)}
                            >
                              Request return
                            </Button>
                            {refundMethods(invoice).length > 0 && (
                              <Button
                                disabled={r.qty === r.refunded_qty || Boolean(invoice.credit)}
                                onClick={() => setExchangeItem(r)}
                              >
                                Request exchange
                              </Button>
                            )}
                          </div>
                        ),
                      ],
                    ]}
                  />
                  {Boolean(invoice.credit) && (
                    <p className="note-strip">
                      Settle the outstanding credit before requesting a refund.
                    </p>
                  )}
                </>
              )}
            </Panel>

            <Panel
              title="Return History"
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
                  ['Item', 'product'],
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
                  ['Settlement', r => r.replacement
                    ? r.status !== 'Completed'
                      ? settlementAction(exchangeDifference(r))
                      : exchangeDifference(r) > 0
                        ? `Collected ${money(exchangeDifference(r))}`
                        : exchangeDifference(r) < 0 ? `Refunded ${money(-exchangeDifference(r))}` : 'Even exchange'
                    : money(r.amount)],
                  ['Status', r => <Badge>{r.status}</Badge>],
                  [
                    'Actions',
                    r => (
                      <div className="row-actions">
                        <Button
                          icon={Printer}
                          variant="outline"
                          onClick={() => {
                            printBill(returnToBill(r, settings), settings, { silent: true, reprint: true });
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
          {exchangeItem && invoice && (
            <ExchangeModal
              ctx={ctx}
              invoice={invoice}
              item={exchangeItem}
              catalog={catalog}
              settings={settings}
              refundMethods={refundMethods(invoice)}
              onClose={() => setExchangeItem(null)}
              onDone={outcome => exchangeDone(outcome, settings)}
            />
          )}
        </>
      )}
    </DataView>
  );
}
