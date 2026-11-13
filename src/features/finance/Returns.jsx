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
  BillModal,
  Button,
  Field,
  FilterTabs,
  Heading,
  Panel,
  Stats,
  Table,
} from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { ReceiptModal } from '../pos/ReceiptModal';
import { managers, money, options, ref, returnToBill } from '../../utils';

const canManage = ctx => managers.includes(ctx.user.role);

export function Returns({ ctx }) {
  const state = useData(ctx, { returns: 'returns', settings: 'settings' });
  const [lookup, setLookup] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [catalog, setCatalog] = useState({ products: [], units: [] });
  const [viewReceipt, setViewReceipt] = useState(false);
  const [returnBill, setReturnBill] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(ctx.intent === 'pending' ? 'Pending' : 'All');

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
      if (found.payments.some(p => p.method === 'Cash')) {
        const [products, units] = await Promise.all(
          ['products', 'units'].map(route => ctx.get(route, { branch: found.branch_id }))
        );
        setCatalog({ products, units });
      }
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
        method: exchange ? 'Cash' : invoice.payments[0]?.method || 'Cash',
        replacement_qty: 1,
      },
      fields: v => {
        const product = catalog.products.find(p => p.id === Number(v.replacement_product_id));
        return [
          {
            name: 'qty',
            label: 'Quantity to return',
            type: 'number',
            min: 1,
            max: item.qty - item.refunded_qty,
          },
          ...(!exchange
            ? [
              {
                name: 'method',
                label: 'Original payment method',
                choices: [...new Set(invoice.payments.map(p => p.method))].concat(
                  invoice.payments.length ? [] : ['Cash']
                ),
              },
            ]
            : []),
          { name: 'condition_note', label: 'Item condition', full: true },
          { name: 'reason', label: 'Reason for return', type: 'textarea' },
          ...(!item.unit_id
            ? [{ name: 'restock', label: 'Item is sellable and can return to stock', type: 'checkbox' }]
            : []),
          ...(exchange
            ? [
              {
                name: 'replacement_product_id',
                label: 'Replacement product',
                choices: options(
                  catalog.products.filter(p => p.qty > 0 && p.category !== 'Services')
                ),
              },
              {
                name: 'replacement_qty',
                label: 'Replacement quantity',
                type: 'number',
                min: 1,
                max: product?.serialized ? 1 : product?.qty,
              },
              ...(product?.serialized
                ? [
                  {
                    name: 'replacement_unit_id',
                    label: 'Replacement device',
                    choices: options(
                      catalog.units.filter(
                        u => u.product_id === product.id && u.state === 'Available'
                      ),
                      'code'
                    ),
                  },
                ]
                : []),
            ]
            : []),
        ];
      },
      onSuccess: () =>
        ctx.setNotice(
          exchange ? 'Exchange submitted for approval' : 'Return submitted for approval'
        ),
    });

  const resolve = (row, decision) =>
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
          ? (row.quoted_total >= row.amount ? 'Cash to collect ' : 'Cash to refund ') +
          money(Math.abs(row.quoted_total - row.amount))
          : row.reason),
      route: 'return.resolve',
      submit:
        decision === 'Completed'
          ? row.replacement
            ? 'Process exchange'
            : 'Process refund'
          : 'Reject request',
      danger: decision === 'Rejected',
      values: { branch: row.branch_id, id: row.id, decision },
      fields:
        decision === 'Completed' && row.method !== 'Cash' && row.amount > 0
          ? [{ name: 'reference', label: 'Confirmed refund reference', full: true }]
          : [],
    });

  return (
    <DataView state={state}>
      {({ returns, settings }) => (
        <>
          <Heading
            title="Returns & Exchanges"
            description="Look up an invoice, record returned items and review refund or exchange requests."
          />
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
                    <Button onClick={() => setViewReceipt(true)}>View receipt</Button>
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
                              disabled={r.qty === r.refunded_qty || Boolean(invoice.credit)}
                              onClick={() => request(r)}
                            >
                              Request return
                            </Button>
                            {invoice.payments.some(p => p.method === 'Cash') && (
                              <Button
                                disabled={r.qty === r.refunded_qty || Boolean(invoice.credit)}
                                onClick={() => request(r, true)}
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
                  ['Amount', r => money(r.amount)],
                  ['Status', r => <Badge>{r.status}</Badge>],
                  [
                    'Actions',
                    r => (
                      <div className="row-actions">
                        <Button
                          icon={Printer}
                          variant="outline"
                          onClick={() => setReturnBill(returnToBill(r, settings))}
                        >
                          Bill
                        </Button>
                        {r.status === 'Pending' && canManage(ctx) && (
                          <>
                            <Button variant="soft" onClick={() => resolve(r, 'Completed')}>
                              Approve
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

          {viewReceipt && (
            <ReceiptModal
              invoice={invoice}
              settings={settings}
              onClose={() => setViewReceipt(false)}
            />
          )}

          {returnBill && (
            <BillModal
              bill={returnBill}
              settings={settings}
              onClose={() => setReturnBill(null)}
            />
          )}
        </>
      )}
    </DataView>
  );
}
