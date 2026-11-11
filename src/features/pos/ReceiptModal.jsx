import { useState } from 'react';
import { Banknote, LockKeyhole, Printer, Unlock } from 'lucide-react';
import { Badge, Button, Modal, Table } from '../../components/common';
import { dateLabel, hasCashInPayments, money, printThermalReceipt, ref } from '../../utils';

export function ReceiptModal({ invoice, settings, onClose }) {
  const [printing, setPrinting] = useState(false);
  if (!invoice) return null;

  const isCashSettlement =
    invoice.hasCashSettlement ??
    hasCashInPayments(invoice.payments, invoice.cashTendered);
  const cashPaid =
    Number(invoice.cashTendered || 0) ||
    (invoice.payments || [])
      .filter(p => String(p?.method || '').toLowerCase() === 'cash')
      .reduce((sum, p) => sum + Number(p?.amount || 0), 0);
  const settledTotal = (invoice.payments || []).reduce(
    (sum, p) => sum + Number(p?.amount || 0),
    0
  );
  const showTax =
    settings?.show_tax_on_receipt !== 0 && settings?.show_tax_on_receipt !== '0';

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printThermalReceipt(invoice, settings, { silent: true });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal title={ref('INV', invoice.id)} description="Sales receipt & cash settlement" onClose={onClose}>
      <div className="modal-body">
        {/* Cash Settlement Summary Banner */}
        <div
          style={{
            display: 'grid',
            gap: '0.5rem',
            padding: '0.75rem 0.9rem',
            marginBottom: '0.85rem',
            borderRadius: '10px',
            border: isCashSettlement ? '1px solid #99f6e4' : '1px solid #e2e8f0',
            background: isCashSettlement ? '#f0fdfa' : '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.92rem', color: '#0f172a' }}>
              <Banknote size={16} style={{ color: isCashSettlement ? '#0d9488' : '#64748b' }} />
              {isCashSettlement ? 'Cash Settlement Summary' : 'Non-Cash / Credit Settlement'}
            </strong>
            <Badge tone={isCashSettlement ? 'green' : 'slate'}>
              {isCashSettlement ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Unlock size={12} /> Cash Drawer Auto-Opened
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <LockKeyhole size={12} /> Cash Drawer Not Opened
                </span>
              )}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', fontSize: '0.84rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Cash Received</span>
              <strong style={{ color: '#0f172a' }}>{money(cashPaid)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Settled Amount</span>
              <strong style={{ color: '#0f172a' }}>{money(settledTotal)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Change Return</span>
              <strong style={{ color: Number(invoice.change || 0) > 0 ? '#0d9488' : '#0f172a' }}>
                {money(invoice.change || 0)}
              </strong>
            </div>
          </div>
        </div>

        <div className="receipt-print" style={{ '--paper': (settings?.paper_width || 80) + 'mm' }}>
          <h2>{settings?.shop_name || 'ZEEDAT POS'}</h2>
          <p>{invoice.branch}</p>
          <p>
            {ref('INV', invoice.id)} · {dateLabel(invoice.created_at)}
          </p>
          <p>{invoice.customer}</p>
          <Table
            rows={invoice.items || []}
            columns={[
              [
                'Item',
                r => (
                  <>
                    {r.name}
                    {r.code && (
                      <small className="subtext">
                        {r.code}
                        {r.imei ? ' · ' + r.imei : ''}
                      </small>
                    )}
                  </>
                ),
              ],
              ['Qty', 'qty'],
              ['Price', r => money(r.price)],
              ['Total', r => money(r.total)],
            ]}
          />
          <div className="totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(invoice.subtotal)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>− {money(invoice.discount)}</strong>
            </div>
            {showTax && (
              <div>
                <span>Tax</span>
                <strong>{money(invoice.tax)}</strong>
              </div>
            )}
            <div className="total">
              <span>Total</span>
              <strong>{money(invoice.total)}</strong>
            </div>
            {(invoice.payments || []).map((p, i) => (
              <div key={i}>
                <span>
                  {p.method}
                  {p.kind === 'Credit' ? ' repayment' : ''}
                </span>
                <strong>{money(p.amount)}</strong>
              </div>
            ))}
            {Boolean(invoice.credit) && (
              <div>
                <span>Balance due · {dateLabel(invoice.due_date)}</span>
                <strong>{money(invoice.credit)}</strong>
              </div>
            )}
            {Boolean(invoice.change) && (
              <div>
                <span>Change</span>
                <strong>{money(invoice.change)}</strong>
              </div>
            )}
            {Boolean(invoice.refunded) && (
              <div>
                <span>Refunded</span>
                <strong>{money(invoice.refunded)}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Close</Button>
        <Button icon={Printer} variant="primary" disabled={printing} onClick={handlePrint}>
          {printing ? 'Printing...' : 'Print receipt'}
        </Button>
      </div>
    </Modal>
  );
}
