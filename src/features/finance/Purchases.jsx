import { useState } from 'react';
import { Package, Plus, Printer, ShoppingBag, Truck, Wallet } from 'lucide-react';
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
import { DataView } from '../../components/feedback';
import { cents, managers, money, options, printBill, purchaseToBill, ref } from '../../utils';

const branchOf = ctx => ctx.branch || ctx.branches[0]?.id;
const canManage = ctx => managers.includes(ctx.user.role);
const amountField = { name: 'amount', label: 'Amount (LKR)', type: 'money', min: 0.01 };
const deviceFields = [
  { name: 'code', label: 'Internal unit code' },
  { name: 'imei', label: 'IMEI / serial', optional: true },
  { name: 'grade', label: 'Condition grade', choices: ['New', 'Used', 'Refurbished'] },
];

export function Purchases({ ctx }) {
  const state = useData(ctx, {
    purchases: 'purchases',
    suppliers: 'suppliers',
    products: 'products',
    settings: 'settings',
  });
  const [query, setQuery] = useState('');
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const supplier = () =>
    ctx.setDialog({
      title: 'New supplier',
      route: 'supplier.create',
      fields: [
        { name: 'name', label: 'Supplier name' },
        { name: 'phone', label: 'Phone', type: 'tel', optional: true },
      ],
    });

  const receive = (suppliers, products) =>
    ctx.setDialog({
      title: 'Receive stock',
      description: 'Record the supplier invoice and add accepted stock to the branch.',
      route: 'purchase.receive',
      wide: true,
      submit: 'Receive stock',
      values: { branch: branchOf(ctx), qty: 1, grade: 'New' },
      fields: v => {
        const serialized = products.find(p => p.id === Number(v.product_id))?.serialized;
        return [
          { name: 'branch', label: 'Receiving branch', choices: options(ctx.branches) },
          { name: 'supplier_id', label: 'Supplier', choices: options(suppliers) },
          { name: 'invoice', label: 'Supplier invoice number' },
          {
            name: 'product_id',
            label: 'Product',
            choices: options(products.filter(p => p.category !== 'Services')),
          },
          {
            name: 'qty',
            label: 'Quantity',
            type: 'number',
            min: 1,
            max: serialized ? 1 : 10000,
          },
          { name: 'unit_cost', label: 'Unit cost (LKR)', type: 'money' },
          ...(serialized ? deviceFields : []),
        ];
      },
      transform: v => ({ ...v, unit_cost: cents(v.unit_cost) }),
      onSuccess: res => {
        if (res?.id) {
          printBill(purchaseToBill(res, state.data?.settings), state.data?.settings, { silent: true });
        }
      },
    });

  const pay = r =>
    ctx.setDialog({
      title: 'Pay supplier from drawer',
      description: r.supplier + ' · ' + money(r.balance) + ' remaining',
      route: 'purchase.pay',
      submit: 'Record payment',
      values: { branch: r.branch_id, id: r.id },
      fields: [amountField],
      transform: v => ({ ...v, amount: cents(v.amount) }),
    });

  return (
    <DataView state={state}>
      {({ purchases, suppliers, products, settings }) => (
        <>
          <Heading
            title="Purchasing & Suppliers"
            description="Receive stock, track supplier invoices and settle outstanding balances."
          >
            <Button icon={Plus} onClick={supplier}>
              New supplier
            </Button>
            <Button
              variant="primary"
              icon={Package}
              onClick={() => receive(suppliers, products)}
            >
              Receive stock
            </Button>
          </Heading>

          <Stats
            items={[
              {
                icon: ShoppingBag,
                label: 'Purchases Received',
                value: purchases.length,
                note: 'Recent supplier invoices',
              },
              {
                icon: Wallet,
                label: 'Outstanding Payables',
                value: money(purchases.reduce((s, r) => s + Number(r.balance), 0)),
                note: 'Remaining supplier balances',
                tone: 'amber',
              },
              {
                icon: Truck,
                label: 'Suppliers',
                value: suppliers.length,
                note: 'Supplier directory',
                tone: 'mint',
              },
            ]}
          />

          <div className="stack">
            <Panel title="Purchase History" icon={ShoppingBag}>
              <div className="panel-tools toolbar">
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  placeholder="Search supplier, item or invoice…"
                />
                <Button
                  variant={onlyUnpaid ? 'primary' : ''}
                  onClick={() => setOnlyUnpaid(!onlyUnpaid)}
                >
                  Unpaid only
                </Button>
              </div>
              <Table
                rows={purchases.filter(
                  r =>
                    (!onlyUnpaid || r.balance > 0) &&
                    [r.supplier, r.invoice, r.product].some(v =>
                      v.toLowerCase().includes(query.toLowerCase())
                    )
                )}
                columns={[
                  ['Reference', r => ref('PO', r.id)],
                  ['Supplier invoice', 'invoice'],
                  ['Supplier', 'supplier'],
                  ['Product', 'product'],
                  ['Qty', 'qty'],
                  ['Total', r => money(r.qty * r.unit_cost)],
                  [
                    'Balance',
                    r => (
                      <Badge tone={r.balance ? 'amber' : 'green'}>{money(r.balance)}</Badge>
                    ),
                  ],
                  [
                    'Actions',
                    r => (
                      <div className="row-actions">
                        <Button
                          icon={Printer}
                          variant="outline"
                          onClick={() => {
                            printBill(purchaseToBill(r, settings), settings, { silent: true, reprint: true });
                            ctx.setNotice(`Purchase bill ${ref('PO', r.id)} printed.`);
                          }}
                        >
                          Bill
                        </Button>
                        {canManage(ctx) && Boolean(r.balance) && (
                          <Button variant="soft" onClick={() => pay(r)}>
                            Pay supplier
                          </Button>
                        )}
                      </div>
                    ),
                  ],
                ]}
              />
            </Panel>
            <Panel title="Suppliers" icon={Truck}>
              <Table
                rows={suppliers}
                columns={[
                  ['Supplier', 'name'],
                  ['Phone', 'phone'],
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </DataView>
  );
}
