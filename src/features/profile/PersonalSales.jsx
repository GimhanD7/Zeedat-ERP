import { useState } from 'react';
import { CalendarDays, Package, ReceiptText, ShoppingBag } from 'lucide-react';
import { useData } from '../../hooks/useData';
import { DataView } from '../../components/feedback';
import { Badge, Field, Select, Stats, Table } from '../../components/common';
import { dateLabel, money, number, ref, today } from '../../utils';

export function PersonalSales({ ctx }) {
  const [from, setFrom] = useState(() => today().slice(0, 7) + '-01');
  const [to, setTo] = useState(today);
  const [branding, setBranding] = useState('all');
  const [query, setQuery] = useState('');
  const validRange = from && to && from <= to;
  const state = useData(ctx, { sales: ['profile.sales', { from: validRange ? from : today(), to: validRange ? to : today() }] });
  return <section className="personal-sales">
    <div className="profile-options">
      <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
      <Field label="Product type"><Select value={branding} onChange={e => setBranding(e.target.value)}
        options={['all', 'Branded', 'Non-branded', 'Service'].map(value => [value, value === 'all' ? 'All products & services' : value])} /></Field>
      <Field label="Find item or invoice"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, SKU, brand or invoice" /></Field>
    </div>
    {!validRange ? <p role="alert" className="text-red">Choose a valid date range.</p> : <DataView state={state}>{({ sales }) => {
      const items = sales.items.filter(row => (branding === 'all' || branding === row.branding)
        && [row.name, row.sku, row.brand, row.invoice_no || ref('INV', row.sale_id)].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
      const total = key => items.reduce((sum, row) => sum + Number(row[key] || 0), 0);
      return <>
        <p className="muted">Sales assigned to your staff ID in POS. Returned units are deducted from net sales and commission shown here.</p>
        <Stats items={[
          { icon: ReceiptText, label: 'Invoices', value: number(new Set(items.map(row => row.sale_id)).size), tone: 'blue' },
          { icon: Package, label: 'Units sold', value: number(total('units')), tone: 'teal' },
          { icon: ShoppingBag, label: 'Net sales', value: money(total('net_amount')), tone: 'mint' },
          { icon: CalendarDays, label: 'Commission', value: money(total('earned_commission')), tone: 'amber' },
        ]} />
        <div className="personal-sales-totals">
          <span>Branded <b>{money(items.filter(row => row.branding === 'Branded').reduce((sum, row) => sum + row.net_amount, 0))}</b></span>
          <span>Non-branded <b>{money(items.filter(row => row.branding === 'Non-branded').reduce((sum, row) => sum + row.net_amount, 0))}</b></span>
          <span>Returns <b>{money(total('returned_amount'))}</b></span>
        </div>
        <Table rows={items} empty="No sales assigned to you in this date range." columns={[
          ['Date', row => dateLabel(row.created_at)], ['Invoice', row => row.invoice_no || ref('INV', row.sale_id)],
          ['Item', row => <div><strong>{row.name}</strong><small className="subtext">{row.sku}</small></div>],
          ['Type', row => <Badge tone={row.branding === 'Branded' ? 'blue' : 'slate'}>{row.branding}</Badge>],
          ['Brand', row => row.brand || '—'], ['Branch', 'branch'],
          ['Sold', 'qty'], ['Returned', 'refunded_qty'],
          ['Net total', row => money(row.net_amount)], ['Commission', row => money(row.earned_commission)],
        ]} />
      </>;
    }}</DataView>}
  </section>;
}
