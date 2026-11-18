import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Download, FileClock, ReceiptText, TrendingUp, RotateCcw } from 'lucide-react';
import { useData } from '../../hooks/useData';
import { DataView } from '../../components/feedback';
import { Button, Panel, Stats, Table } from '../../components/common';
import { dateLabel, money, number } from '../../utils';
import { TrendChart } from './TrendChart';
import './historicalRevenue.css';

const metrics = ['revenue', 'subtotal', 'discount', 'card_fees', 'invoices', 'units', 'refunds', 'returns'];
export function aggregateHistory(days, from, to, group) {
  const groups = new Map();
  for (const row of days) {
    if (row.day < from || row.day > to) continue;
    const key = group === 'month' ? row.day.slice(0, 7) : group === 'year' ? row.day.slice(0, 4) : row.day;
    const result = groups.get(key) || Object.fromEntries([['day', key], ...metrics.map(key => [key, 0])]);
    for (const key of metrics) result[key] += Number(row[key] || 0);
    groups.set(key, result);
  }
  return [...groups.values()].map(row => ({ ...row, net: row.revenue - row.refunds }));
}

function RevenueView({ data }) {
  const first = data.days[0]?.day || '';
  const last = data.days.at(-1)?.day || '';
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [group, setGroup] = useState('month');
  const [metric, setMetric] = useState('net');
  const rows = useMemo(() => aggregateHistory(data.days, from, to, group), [data.days, from, to, group]);
  const totals = rows.reduce((total, row) => {
    for (const key of [...metrics, 'net']) total[key] += row[key];
    return total;
  }, Object.fromEntries([...metrics, 'net'].map(key => [key, 0])));
  const chart = rows.map(row => ({
    day: row.day,
    label: group === 'day' ? dateLabel(row.day, { day: '2-digit', month: 'short' }) : row.day,
    total: row[metric],
  }));
  const best = rows.reduce((highest, row) => !highest || row.net > highest.net ? row : highest, null);
  function exportRows() {
    const csv = [
      ['Period', 'Invoices', 'Units', 'Invoice total LKR', 'Discount LKR', 'Card fees LKR', 'Completed refunds LKR', 'Net revenue LKR'],
      ...rows.map(row => [row.day, row.invoices, row.units, ...['revenue', 'discount', 'card_fees', 'refunds', 'net'].map(key => (row[key] / 100).toFixed(2))]),
    ].map(row => row.join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `historical-revenue-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <div className="history-revenue">
    <header className="history-revenue-heading">
      <div><span className="history-eyebrow">LEGACY BUSINESS RECORDS</span><h1>Historical revenue</h1>
        <p>{dateLabel(first)} — {dateLabel(last)} · LKR</p></div>
      <Button icon={Download} onClick={exportRows} disabled={!rows.length || from > to}>Export analysis</Button>
    </header>
    <div className="history-source"><FileClock size={19} /><div><strong>{data.source}</strong>
      <p>Invoice revenue analysis from the backup. Original invoices have no branch field, so this page shows all legacy records together.</p></div></div>
    <section className="history-filters" aria-label="Historical revenue filters">
      <label><span>From</span><input type="date" min={first} max={to || last} value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label><span>To</span><input type="date" min={from || first} max={last} value={to} onChange={e => setTo(e.target.value)} /></label>
      <label><span>Group by</span><select value={group} onChange={e => setGroup(e.target.value)}>
        <option value="day">Day</option><option value="month">Month</option><option value="year">Year</option>
      </select></label>
      <Button icon={CalendarDays} onClick={() => { setFrom(first); setTo(last); }}>Full history</Button>
    </section>
    {from > to && <p role="alert" className="text-red">Choose an end date after the start date.</p>}
    <Stats items={[
      { icon: ReceiptText, label: 'Invoice revenue', value: money(totals.revenue), note: `${number(totals.invoices)} invoices`, tone: 'teal' },
      { icon: RotateCcw, label: 'Completed returns', value: money(totals.refunds), note: `${number(totals.returns)} returns`, tone: 'amber' },
      { icon: TrendingUp, label: 'Net revenue', value: money(totals.net), note: 'Invoice totals less completed refunds', tone: 'mint' },
      { icon: BarChart3, label: 'Average invoice', value: money(totals.invoices ? Math.round(totals.revenue / totals.invoices) : 0), note: `${number(totals.units)} units sold`, tone: 'blue' },
    ]} />
    <Panel title="Revenue timeline" icon={TrendingUp} action={<select aria-label="Chart metric" value={metric} onChange={e => setMetric(e.target.value)}>
      <option value="net">Net revenue</option><option value="revenue">Invoice revenue</option><option value="refunds">Completed refunds</option>
    </select>}>
      {rows.length ? <TrendChart trend={chart} /> : <p className="history-empty">No records in this date range.</p>}
    </Panel>
    <div className="history-insights">
      <Panel title="Period overview" icon={BarChart3}><dl>
        <div><dt>Best {group}</dt><dd>{best ? best.day : '—'}</dd></div>
        <div><dt>Best period net revenue</dt><dd>{money(best?.net || 0)}</dd></div>
        <div><dt>Discounts</dt><dd>{money(totals.discount)}</dd></div>
        <div><dt>Card fees on invoices</dt><dd>{money(totals.card_fees)}</dd></div>
      </dl></Panel>
      <Panel title="About these figures" icon={FileClock}><div className="history-method">
        <p>Revenue uses each saved invoice total, rounded to cents. Completed returns reduce revenue on their return date.</p>
        <p>Discounts use the saved amount, or subtotal × discount percentage when the amount is missing. Card fees appear separately as recorded.</p>
        <p>Payment methods and collection dates are absent from this backup. These figures describe billed revenue.</p>
        <p>Legacy product store names are {data.legacy_product_stores.join(', ')}. They are not used to assign invoice revenue to current branches.</p>
      </div></Panel>
    </div>
    <Panel title={`${group === 'day' ? 'Daily' : group === 'month' ? 'Monthly' : 'Yearly'} revenue ledger`} icon={ReceiptText}>
      <Table rows={rows.map(row => ({ ...row, id: row.day }))} empty="No revenue records in this period." columns={[
        ['Period', 'day'], ['Invoices', r => number(r.invoices)], ['Units', r => number(r.units)],
        ['Invoice revenue', r => money(r.revenue)], ['Discount', r => money(r.discount)],
        ['Card fees', r => money(r.card_fees)], ['Refunds', r => money(r.refunds)],
        ['Net revenue', r => <strong>{money(r.net)}</strong>],
      ]} />
    </Panel>
  </div>;
}

export function HistoricalRevenuePage({ ctx }) {
  const state = useData(ctx, { history: 'historical.revenue' });
  return <DataView state={state}>{({ history }) => <RevenueView data={history} />}</DataView>;
}
