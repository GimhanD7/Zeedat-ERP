import { useState } from 'react';
import { ArrowLeftRight, Plus, Printer } from 'lucide-react';
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
import { managers, options, printBill, ref, transferToBill } from '../../utils';

const branchOf = ctx => ctx.branch || ctx.branches[0]?.id;
const canManage = ctx => managers.includes(ctx.user.role);

export function StockTransfers({ ctx }) {
  const source = branchOf(ctx);
  const state = useData(ctx, {
    items: ['products', { branch: source }],
    units: ['units', { branch: source }],
    transfers: 'transfers',
    settings: 'settings',
  });
  const [filter, setFilter] = useState('All');

  const request = (items, units, settings) =>
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
      onSuccess: (res, submitted) => {
        const prod = items.find(p => Number(p.id) === Number(submitted?.product_id));
        const srcBranch = ctx.branches.find(b => Number(b.id) === Number(source))?.name || 'Source';
        const dstBranch = ctx.destinations.find(b => Number(b.id) === Number(submitted?.to_branch))?.name || 'Destination';
        const billRow = {
          id: res?.id || 0,
          source: srcBranch,
          destination: dstBranch,
          product: prod?.name || 'Product',
          qty: Number(submitted?.qty || 1),
          status: 'Requested',
          requested_by: ctx.user?.name || 'Staff',
        };
        printBill(transferToBill(billRow, settings), settings, { silent: true });
        ctx.setNotice('Transfer requested · Bill printed.');
      },
    });

  const update = (r, status, branch, settings) =>
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
      onSuccess: () => {
        printBill(transferToBill({ ...r, status }, settings), settings, { silent: true });
        ctx.setNotice(`Transfer ${ref('ST', r.id)} ${status.toLowerCase()} · Bill printed.`);
      },
    });

  return (
    <DataView state={state}>
      {({ items, units, transfers, settings }) => (
        <>
          <Heading
            title="Stock Transfers"
            description="Move inventory between branches and confirm receipt at the destination."
          >
            <Button icon={Plus} variant="primary" onClick={() => request(items, units, settings)}>
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
                  r => (
                    <div className="row-actions">
                      <Button
                        icon={Printer}
                        variant="outline"
                        onClick={() => {
                          printBill(transferToBill(r, settings), settings, { silent: true, reprint: true });
                          ctx.setNotice(`Transfer bill ${ref('ST', r.id)} printed.`);
                        }}
                      >
                        Bill
                      </Button>
                      {r.status === 'Requested' &&
                        canManage(ctx) &&
                        (ctx.user.role === 'owner' || ctx.branch === r.from_branch) && (
                        <>
                          <Button
                            variant="soft"
                            onClick={() => update(r, 'Dispatched', r.from_branch, settings)}
                          >
                            Dispatch
                          </Button>
                          <Button
                            variant="outline-red"
                            onClick={() => update(r, 'Rejected', r.from_branch, settings)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {r.status === 'Dispatched' &&
                        (ctx.user.role === 'owner' || ctx.branch === r.to_branch) && (
                        <Button
                          variant="soft"
                          onClick={() => update(r, 'Received', r.to_branch, settings)}
                        >
                          Receive
                        </Button>
                      )}
                    </div>
                  ),
                ],
              ]}
            />
          </Panel>
        </>
      )}
    </DataView>
  );
}
