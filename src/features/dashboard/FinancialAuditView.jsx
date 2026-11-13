import { useState } from 'react';
import { Banknote, CreditCard, FileText, ReceiptText } from 'lucide-react';
import { Badge, Button, Panel, SearchBox, Select, Stats, Table } from '../../components/common';
import { Alert } from '../../components/feedback';
import { ReceiptModal } from '../pos/ReceiptModal';
import { money } from '../../utils/formatters';
import { auditReportTables } from './financialAudit';
import './financialAudit.css';

export function FinancialAuditView({ ctx, report, tab }) {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('');
  const [day, setDay] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [table] = auditReportTables(report, tab);
  const isPayments = tab === 'payment-audit' || tab === 'koko';
  const methods = [...new Set(table.rows.map(r => r.method).filter(Boolean))];
  const search = query.trim().toLowerCase();
  const rows = table.rows.filter(row =>
    (!method || row.method === method) &&
    (!day || String(row.created_at).startsWith(day)) &&
    (!search || table.columns.some(([, value]) => String(value(row) ?? '').toLowerCase().includes(search)))
  );

  async function view(row) {
    setLoading(true);
    setError('');
    try {
      setInvoice({ ...await ctx.get('invoice', { id: row.sale_id ?? row.id, branch: row.branch_id }), isReprint: true });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="financial-audit stack">
      {tab === 'koko' && <section className="koko-report-header">
        <div><span>Koko</span><h2>Payment activity</h2><p>Transactions recorded in ZEEDAT POS. Settlement status is available in the Koko merchant portal.</p></div>
        <Badge tone="violet">POS records</Badge>
      </section>}
      <Stats items={isPayments ? [
        { icon: CreditCard, label: 'Recorded payments', value: rows.length, tone: 'violet' },
        { icon: Banknote, label: 'Recorded amount', value: money(rows.reduce((sum, r) => sum + Number(r.amount), 0)), tone: 'teal' },
        { icon: ReceiptText, label: 'Linked invoices', value: new Set(rows.map(r => r.sale_id).filter(Boolean)).size, tone: 'blue' },
      ] : tab === 'invoice-audit' ? [
        { icon: ReceiptText, label: 'Invoices', value: rows.length, tone: 'blue' },
        { icon: Banknote, label: 'Billed', value: money(rows.reduce((sum, r) => sum + Number(r.total), 0)), tone: 'teal' },
        { icon: CreditCard, label: 'Outstanding', value: money(rows.reduce((sum, r) => sum + Number(r.credit), 0)), tone: 'amber' },
      ] : [{ icon: FileText, label: 'Audit events', value: rows.length, tone: 'blue' }]} />
      <Panel title={table.title} icon={FileText}>
        <div className="financial-audit-filters">
          <SearchBox value={query} onChange={setQuery} placeholder="Search this ledger…" />
          <label>Day <input type="date" value={day} onChange={event => setDay(event.target.value)} /></label>
          {tab === 'payment-audit' && <Select aria-label="Payment method" value={method} blank="All payment methods"
            options={methods} onChange={event => setMethod(event.target.value)} />}
        </div>
        {(query || day || method) && <p className="muted">Print and CSV use the report date, branch, and staff filters above.</p>}
        <Alert>{error}</Alert>
        <Table rows={rows.map(row => ({ record: row, id: `${row.source || tab}-${row.id}` }))}
          empty="No records match the selected filters."
          columns={[
            ...table.columns.map(([label, get]) => [label, ({ record }) => get(record)]),
            ...(tab === 'activity-audit' ? [] : [['Details', ({ record }) => (tab === 'invoice-audit' || record.sale_id) &&
              <Button disabled={loading} onClick={() => view(record)}>View invoice</Button>]]),
          ]} />
      </Panel>
      {invoice && <ReceiptModal invoice={invoice} settings={report.shop} onClose={() => setInvoice(null)} />}
    </div>
  );
}
