import { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeftRight, BarChart3, Box, CalendarDays, CheckCircle2, Cloud, FileText, Layers, Plus, RefreshCw, ShoppingCart, Wallet, Wifi, WifiOff, Wrench } from 'lucide-react';
import { useData } from '../../hooks/useData';
import { DataView } from '../../components/feedback';
import { Badge, Button, Panel, Table } from '../../components/common';
import { dateLabel, money, number, ref, timeLabel, today } from '../../utils';
import { TrendChart } from './TrendChart';
import './dashboard.css';

export const saleColumns = [
  ['Invoice #', r => <strong>{r.invoice_no || ref('INV', r.id)}</strong>],
  ['Date & time', r => timeLabel(r.created_at)], ['Branch', 'branch'],
  ['Type', () => <Badge tone="green">Sale</Badge>], ['Customer', 'customer'],
  ['Items', 'items'], ['Amount', r => money(r.total)],
];
const changeLabel = (value, prior) => prior > 0
  ? `${value >= prior ? '+' : ''}${(((value - prior) / prior) * 100).toFixed(1)}% vs previous day`
  : 'No previous-day sales';
const palette = ['#0284c7', '#009b86', '#9770d5', '#efab43', '#e26d80'];

export function DashboardPage({ ctx }) {
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState('day');
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const state = useData(ctx, { dashboard: ['dashboard', { days: 7, date }] });
  const branchName = ctx.branches.find(b => Number(b.id) === Number(ctx.branch))?.name || 'All branches';
  const go = (page, intent = '') => ctx.navigate(page, intent);
  const allowed = page => ctx.hasPermission?.(page === 'reports' ? 'reports' : page) || ctx.user.role === 'owner';
  async function sync() {
    setSyncing(true);
    try {
      if (window.electronAPI?.triggerBackgroundSync) {
        const result = await window.electronAPI.triggerBackgroundSync();
        if (result?.error) throw new Error(result.error);
        ctx.setNotice(result?.ran ? 'Synchronization completed.' : 'Synchronization checked. Open Cloud Sync settings for connection details.');
      } else ctx.setNotice('This web workspace uses the server database.');
      setOnline(navigator.onLine);
      state.refresh();
    } catch (error) { ctx.setNotice(error.message); }
    finally { setSyncing(false); }
  }
  return <DataView state={state}>{({ dashboard: d }) => {
    const cash = d.cash_drawer || {};
    const returns = d.returns_today || [];
    const categoryTotal = (d.category_breakdown || []).reduce((sum, row) => sum + Number(row.total), 0);
    let offset = 0;
    const slices = (d.category_breakdown || []).map((row, index) => {
      const percent = categoryTotal ? Number(row.total) / categoryTotal * 100 : 0;
      const slice = { ...row, percent, start: offset, color: palette[index % palette.length] };
      offset += percent;
      return slice;
    });
    const cards = [
      [ShoppingCart, "Day's sales", money(d.sales), changeLabel(d.sales, d.previous_sales), 'teal'],
      [Box, 'Items sold', number(d.items_sold), `${number(d.bills)} invoices`, 'blue'],
      [Wrench, 'Current open repairs', number(d.repairs?.open_count || 0), `${number(d.repairs?.in_progress || 0)} in progress`, 'steel'],
      [ArrowLeftRight, 'Returns / exchanges', number(returns.length), money(returns.reduce((sum, r) => sum + Number(r.amount), 0)), 'violet'],
      [Wallet, 'Cash in drawer', money(cash.balance || 0), 'Includes opening float', 'green'],
    ];
    const actions = [
      ['pos', ShoppingCart, 'New sale'], ['repairs', Wrench, 'New repair'],
      ['returns', ArrowLeftRight, 'Return / exchange'], ['inventory', Plus, 'Products & stock'],
      ['reports', FileText, 'View reports'], ['drawer', Wallet, 'Cash drawer'],
    ];
    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
    return <div className="branch-dashboard">
      <header className="branch-dash-heading">
        <div><span className="branch-dash-eyebrow">WORKSPACE OVERVIEW</span><h1>{greeting}, {ctx.user.name.split(' ')[0]}.</h1>
          <p>{branchName} <span>·</span> {dateLabel(date)}</p></div>
        <label className="branch-dash-date"><CalendarDays size={16} /><input aria-label="Dashboard date" type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} /></label>
      </header>
      <div className="branch-dash-metrics">{cards.map(([Icon, label, value, note, tone]) =>
        <article className="branch-dash-metric" key={label}><span className={`branch-dash-icon ${tone}`}><Icon size={21} /></span>
          <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>)}</div>
      <div className="branch-dash-actions">{actions.filter(([page]) => allowed(page)).map(([page, Icon, label], i) =>
        <button type="button" key={page} className={i === 0 ? 'primary-action' : ''} onClick={() => go(page)}><Icon size={24} /><span>{label}</span><ArrowRight size={14} /></button>)}</div>
      <div className="branch-dash-grid">
        <Panel title="Repair orders" icon={Wrench} action={allowed('repairs') && <Button variant="link" onClick={() => go('repairs')}>View all <ArrowRight size={13} /></Button>}>
          <Table rows={d.repair_orders || []} empty="No repair orders for this branch." columns={[
            ['Job', r => ref('RJ', r.id)], ['Device', 'device'], ['Customer', 'customer'], ['Status', r => <Badge>{r.status}</Badge>],
          ]} />
        </Panel>
        <Panel title={period === 'day' ? "Day's sales overview" : 'Seven-day sales trend'} icon={BarChart3} action={
          <div className="branch-dash-toggle">{[['day', 'Hourly'], ['week', '7 days']].map(([id, label]) =>
            <button type="button" key={id} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}</button>)}</div>}>
          <div className="branch-dash-chart-total"><strong>{money(period === 'day' ? d.sales : d.trend.reduce((sum, row) => sum + Number(row.total), 0))}</strong>
            <small>{period === 'day' ? 'Cumulative sales · LKR' : 'Daily sales · LKR'}</small></div>
          <TrendChart trend={period === 'day' ? d.hourly_trend : d.trend} />
        </Panel>
        <Panel title="Cash drawer" icon={Wallet} action={<Badge tone={Number(cash.open_shifts) ? 'green' : 'slate'}>{Number(cash.open_shifts) ? `${cash.open_shifts} open` : 'Closed'}</Badge>}>
          <dl className="branch-cash-summary">{[
            ['Opening float', cash.opening], ['Cash sales & exchanges', cash.sales], ['Other cash in', cash.other_in], ['Cash out / refunds', -Number(cash.cash_out)], ['Current balance', cash.balance],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value < 0 ? 'text-red' : ''}>{money(value || 0)}</dd></div>)}</dl>
          {allowed('drawer') && <Button variant="primary" icon={Wallet} onClick={() => go('drawer')}>Manage drawer</Button>}
        </Panel>
        <Panel title="Returns & exchanges" icon={ArrowLeftRight} action={allowed('returns') && <Button variant="link" onClick={() => go('returns')}>View all <ArrowRight size={13} /></Button>}>
          <Table rows={returns.slice(0, 5)} empty="No returns on the selected date." columns={[
            ['Ref', r => ref('RET', r.id)], ['Type', r => <Badge tone={r.quoted_total == null ? 'red' : 'blue'}>{r.quoted_total == null ? 'Return' : 'Exchange'}</Badge>],
            ['Invoice', r => ref('INV', r.sale_id)], ['Credit', r => money(r.amount)], ['Status', r => <Badge>{r.status}</Badge>],
          ]} />
        </Panel>
        <Panel title="Pending offline transactions" icon={Layers} action={<Badge tone={d.pending_offline ? 'amber' : 'green'}>{d.pending_offline} pending</Badge>}>
          <div className="branch-sync-empty"><CheckCircle2 size={42} /><strong>{d.pending_offline ? 'Transactions waiting to sync' : 'Transactions are up to date'}</strong>
            <p>{d.database_driver === 'sqlite' ? 'Local sales, repairs and returns.' : 'Connected directly to the server database.'}</p></div>
        </Panel>
        <Panel title="Synchronization" icon={Cloud} action={<Badge tone={online ? 'green' : 'amber'}>{online ? 'Online' : 'Offline'}</Badge>}>
          <dl className="branch-cash-summary"><div><dt>Storage</dt><dd>{d.database_driver === 'sqlite' ? 'Local SQLite' : 'Server MySQL'}</dd></div>
            <div><dt>Last data sync</dt><dd>{d.last_synced_at ? timeLabel(d.last_synced_at) : 'Not recorded'}</dd></div>
            <div><dt>Pending transactions</dt><dd>{d.pending_offline}</dd></div></dl>
      {window.electronAPI && allowed('settings') && <Button icon={RefreshCw} onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</Button>}
        </Panel>
      </div>
      <div className="branch-dash-bottom">
        <Panel title="Sales by category" icon={Box}>
          <div className="branch-category"><div className="branch-category-donut" style={{ background: slices.length ? `conic-gradient(${slices.map(s => `${s.color} ${s.start}% ${s.start + s.percent}%`).join(',')})` : 'var(--line)' }}><span><b>7 days</b><small>sales mix</small></span></div>
            <ul>{slices.length ? slices.map(s => <li key={s.category}><i style={{ background: s.color }} /><span>{s.category}</span><b>{s.percent.toFixed(1)}%</b></li>) : <li>No sales in this period.</li>}</ul></div>
        </Panel>
        <Panel title="Branch performance" icon={BarChart3}>
          <Table rows={d.branches || []} columns={[['Branch', 'name'], ['Sales', r => money(r.sales)], ['Bills', 'bills'], ['Repairs received', 'repairs']]} />
        </Panel>
      </div>
      <footer className="branch-dash-footer">{online ? <Wifi size={15} /> : <WifiOff size={15} />}<span>{online ? 'Internet connected' : 'Working offline'}</span><span>{branchName}</span><span>Current stock at cost {money(d.stock_value)}</span><span>{dateLabel(date)}</span></footer>
    </div>;
  }}</DataView>;
}
