import { useState } from 'react';
import { Banknote, FileText, LockKeyhole, Printer, Unlock } from 'lucide-react';
import { Badge, Button, Modal, Table } from '../../components/common';
import { dateLabel, hasCashInPayments, money, printThermalReceipt, ref, timeLabel } from '../../utils';

export function ReceiptModal({ invoice, settings, onClose }) {
  const [printing, setPrinting] = useState(false);
  if (!invoice) return null;

  const isCashSettlement =
    invoice.hasCashSettlement ??
    hasCashInPayments(invoice.payments, invoice.cashTendered ?? invoice.cash_tendered);
  const cashPaid =
    Number(invoice.cashTendered ?? invoice.cash_tendered ?? 0) ||
    (invoice.payments || [])
      .filter(p => String(p?.method || '').toLowerCase() === 'cash')
      .reduce((sum, p) => sum + Number(p?.amount || 0), 0);
  const settledTotal =
    Number(invoice.paid_amount || 0) ||
    (invoice.payments || []).reduce((sum, p) => sum + Number(p?.amount || 0), 0);
  const changeAmount = Number(invoice.change ?? invoice.change_amount ?? 0);
  const showTax =
    settings?.show_tax_on_receipt !== 0 && settings?.show_tax_on_receipt !== '0';
  const invNumber =
    invoice.invoice_no ||
    ref(String(settings?.invoice_prefix || 'INV').replace(/-+$/, '') || 'INV', invoice.id);
  const discPct = invoice.discount_bps
    ? ` (${(Number(invoice.discount_bps) / 100).toFixed(Number(invoice.discount_bps) % 100 === 0 ? 0 : 1)}%)`
    : '';
  const taxPct = invoice.tax_bps
    ? ` (${(Number(invoice.tax_bps) / 100).toFixed(Number(invoice.tax_bps) % 100 === 0 ? 0 : 1)}%)`
    : '';

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printThermalReceipt(invoice, settings, { silent: true });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      title={`${invNumber} · Full Invoice Details`}
      description={`${invoice.branch || 'Shop'} · ${timeLabel(invoice.created_at) || dateLabel(invoice.created_at)}`}
      onClose={onClose}
      wide={true}
    >
      <div className="modal-body" style={{ display: 'grid', gap: '0.9rem' }}>
        {/* Invoice Metadata Grid */}
        <div className="zk-inv-meta-grid">
          <div className="zk-inv-meta-box">
            <small>Invoice & Branch</small>
            <strong>{invNumber}</strong>
            <span>{invoice.branch || '—'}</span>
          </div>
          <div className="zk-inv-meta-box">
            <small>Customer</small>
            <strong>{invoice.customer || 'Walk-in customer'}</strong>
            <span>{[invoice.customer_phone, invoice.customer_email].filter(Boolean).join(' · ') || 'No phone saved'}</span>
          </div>
          <div className="zk-inv-meta-box">
            <small>Cashier / Status</small>
            <strong>{invoice.cashier || 'Staff'}</strong>
            <span>
              {Number(invoice.credit || 0) > 0
                ? `Credit Due: ${money(invoice.credit)}`
                : invoice.payment_methods || (invoice.payments || []).map(p => p.method).join(' + ') || 'Settled'}
            </span>
          </div>
        </div>

        {/* Cash Settlement Summary Banner */}
        <div
          className="zk-inv-settlement-card"
          style={{
            borderColor: isCashSettlement ? '#99f6e4' : '#e2e8f0',
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
                  <Unlock size={12} /> Cash Drawer Eligible
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <LockKeyhole size={12} /> Drawer Not Opened
                </span>
              )}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.5rem', fontSize: '0.84rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Invoice Total</span>
              <strong style={{ color: '#0f172a' }}>{money(invoice.total)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Cash Received</span>
              <strong style={{ color: '#0f172a' }}>{money(cashPaid)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Total Tendered</span>
              <strong style={{ color: '#0f172a' }}>{money(settledTotal)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block' }}>Change Return</span>
              <strong style={{ color: changeAmount > 0 ? '#0d9488' : '#0f172a' }}>
                {money(changeAmount)}
              </strong>
            </div>
          </div>
        </div>

        <div className="receipt-print" style={{ '--paper': (settings?.paper_width || 80) + 'mm' }}>
          <h2>{settings?.shop_name || 'ZEEDAT POS'}</h2>
          <p>{invoice.branch}</p>
          <p>
            {invNumber} · {dateLabel(invoice.created_at)}
            {invoice.cashier ? ` · Cashier: ${invoice.cashier}` : ''}
          </p>
          <p>
            {invoice.customer}
            {invoice.customer_phone ? ` (${invoice.customer_phone})` : ''}
          </p>
          <Table
            rows={invoice.items || []}
            columns={[
              [
                'Item',
                r => (
                  <>
                    <strong>{r.name}</strong>
                    {(r.sku || r.code) && (
                      <small className="subtext">
                        {r.sku ? `SKU: ${r.sku}` : ''}
                        {r.code ? `${r.sku ? ' · ' : ''}${r.code}` : ''}
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
              <span>Discount{discPct}</span>
              <strong>− {money(invoice.discount)}</strong>
            </div>
            {showTax && (
              <div>
                <span>Tax{taxPct}</span>
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
                  {p.reference ? ` (${p.reference})` : ''}
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
            {Boolean(changeAmount) && (
              <div>
                <span>Change returned</span>
                <strong>{money(changeAmount)}</strong>
              </div>
            )}
            {Boolean(invoice.refunded) && (
              <div>
                <span>Refunded</span>
                <strong>{money(invoice.refunded)}</strong>
              </div>
            )}
          </div>
          {invoice.notes && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.65rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left', fontSize: '0.82rem', color: '#334155' }}>
              <FileText size={13} style={{ verticalAlign: 'text-bottom', marginRight: '5px' }} />
              <strong>Notes:</strong> {invoice.notes}
            </div>
          )}
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
