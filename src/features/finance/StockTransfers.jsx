import { useState } from 'react';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Panel,
  Table,
} from '../../components/common';
import { DataView } from '../../components/feedback';
import { managers, options, ref } from '../../utils';

const branchOf = ctx => ctx.branch || ctx.branches[0]?.id;
const canManage = ctx => managers.includes(ctx.user.role);

export function StockTransfers({ ctx }) {
  const source = branchOf(ctx);
  const state = useData(ctx, {
    items: ['products', { branch: source }],
    units: ['units', { branch: source }],
    transfers: 'transfers',
  });
  const [filter, setFilter] = useState('All');

  const request = (items, units) =>
    ctx.setDialog({
      title: 'Request stock transfer',
      description: 'From ' + ctx.branches.find(b => b.id === source)?.name,
      route: 'transfer.request',
      submit: 'Request transfer',
      values: { branch: source, qty: 1 },
      fields: v => {
        const serialized = items.find(p => p.id === Number(v.product_id))?.serialized;
        return [
          {
            name: 'to_branch',
            label: 'Destination branch',
            choices: options(ctx.destinations.filter(b => b.id !== source)),
          },
          {
            name: 'product_id',
            label: 'Product',
            choices: options(items.filter(p => p.qty > 0 && p.category !== 'Services')),
          },
          {
            name: 'qty',
            label: 'Quantity',
            type: 'number',
            min: 1,
            max: serialized ? 1 : undefined,
          },
          ...(serialized
            ? [
                {
                  name: 'unit_id',
                  label: 'Available device',
                  choices: options(
                    units.filter(
                      u => u.product_id === Number(v.product_id) && u.state === 'Available'
                    ),
                    'code'
                  ),
                },
              ]
            : []),
        ];
      },
    });

  const update = (r, status, branch) =>
    ctx.setDialog({
      title:
        status === 'Dispatched'
          ? 'Approve & dispatch'
          : status === 'Received'
            ? 'Confirm receipt'
            : 'Reject transfer',
      description:
        ref('ST', r.id) +
        ' · ' +
        r.qty +
        ' × ' +
        r.product +
        ' · ' +
        r.source +
        ' → ' +
        r.destination,
      route: 'transfer.update',
      submit:
        status === 'Received'
          ? 'Receive stock'
          : status === 'Dispatched'
            ? 'Dispatch stock'
            : 'Reject transfer',
      danger: status === 'Rejected',
      values: { id: r.id, status, branch },
      fields: [],
    });

  return (
    <DataView state={state}>
      {({ items, units, transfers }) => (
        <>
          <Heading
            title="Stock Transfers"
            description="Move inventory between branches and confirm receipt at the destination."
          >
            <Button icon={Plus} variant="primary" onClick={() => request(items, units)}>
              Request transfer
            </Button>
          </Heading>

          <Panel
            title="Transfer History"
            icon={ArrowLeftRight}
            action={
              <FilterTabs
                choices={['All', 'Requested', 'Dispatched', 'Received', 'Rejected']}
                value={filter}
                onChange={setFilter}
              />
            }
          >
            <Table
              rows={transfers.filter(r => filter === 'All' || r.status === filter)}
              columns={[
                ['Reference', r => ref('ST', r.id)],
                ['Source', 'source'],
                ['Destination', 'destination'],
                ['Product', 'product'],
                ['Qty', 'qty'],
                ['Status', r => <Badge>{r.status}</Badge>],
                [
                  'Actions',
                  r =>
                    r.status === 'Requested' &&
                    canManage(ctx) &&
                    (ctx.user.role === 'owner' || ctx.branch === r.from_branch) ? (
                      <div className="row-actions">
                        <Button
                          variant="soft"
                          onClick={() => update(r, 'Dispatched', r.from_branch)}
                        >
                          Dispatch
                        </Button>
                        <Button
                          variant="outline-red"
                          onClick={() => update(r, 'Rejected', r.from_branch)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : r.status === 'Dispatched' &&
                      (ctx.user.role === 'owner' || ctx.branch === r.to_branch) ? (
                      <Button
                        variant="soft"
                        onClick={() => update(r, 'Received', r.to_branch)}
                      >
                        Receive
                      </Button>
                    ) : null,
                ],
              ]}
            />
          </Panel>
        </>
      )}
    </DataView>
  );
}
