import { AlertTriangle, ChartNoAxesCombined, CreditCard, Package, Store, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../../hooks/useData';
import { FilterTabs, Heading, Panel, Stats, Table } from '../../components/common';
import { DataView } from '../../components/feedback';
import { money } from '../../utils';
import { TrendChart } from './TrendChart';

const ranges = [
  [7, '7 Days'],
  [30, '30 Days'],
  [90, '3 Months'],
  [365, 'Year'],
];

export function ReportsPage({ ctx }) {
  const [days, setDays] = useState(7);
  const state = useData(ctx, { dashboard: ['dashboard', { days }] });

  return (
    <DataView state={state}>
      {({ dashboard: d }) => (
        <>
          <Heading
            title="Reports"
            description="Review sales, payments and inventory across your selected branches."
          >
            <FilterTabs choices={ranges} value={days} onChange={setDays} />
          </Heading>

          <Stats
            items={[
              {
                icon: ChartNoAxesCombined,
                label: 'Gross Sales',
                value: money(d.trend.reduce((sum, r) => sum + r.total, 0)),
                note: 'Last ' + days + ' days',
              },
              {
                icon: CreditCard,
                label: 'Payments Collected',
                value: money(d.collections.reduce((sum, r) => sum + Number(r.total), 0)),
                note: 'Last ' + days + ' days',
                tone: 'violet',
              },
              {
                icon: Wrench,
                label: 'Open Repairs',
                value: d.repairs.open_count,
                note: d.repairs.overdue + ' overdue',
                tone: 'blue',
              },
              {
                icon: AlertTriangle,
                label: 'Reorder Alerts',
                value: d.low.length,
                note: 'Current branch stock',
                tone: 'red',
              },
            ]}
          />

          <div className="dashboard-grid">
            <div className="stack">
              <Panel title="Daily Gross Sales" icon={ChartNoAxesCombined}>
                <TrendChart trend={d.trend} />
              </Panel>
              <Panel title="Low Stock Report" icon={Package}>
                <Table
                  rows={d.low}
                  columns={[
                    ['Product', 'name'],
                    ['SKU', 'sku'],
                    ['Branch', 'branch'],
                    ['On hand', 'qty'],
                    ['Reorder level', 'reorder_level'],
                  ]}
                />
              </Panel>
            </div>
            <div className="stack">
              <Panel title="Payments by Method" icon={CreditCard}>
                <Table
                  rows={d.collections}
                  columns={[
                    ['Method', 'method'],
                    ['Amount', r => money(r.total)],
                  ]}
                />
              </Panel>
              <Panel title="Branch Performance Today" icon={Store}>
                <Table
                  rows={d.branches}
                  columns={[
                    ['Branch', 'name'],
                    ['Gross sales', r => money(r.sales)],
                    ['Bills', 'bills'],
                  ]}
                />
              </Panel>
            </div>
          </div>
        </>
      )}
    </DataView>
  );
}
