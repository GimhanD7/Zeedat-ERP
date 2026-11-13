import { useState } from 'react';
import { Banknote, LockKeyhole, Printer, Unlock } from 'lucide-react';
import { Badge, BillPreview, Button, Modal } from '../../components/common';
import {
  billPaperWidth,
  buildThermalReceiptHtml,
  dateLabel,
  hasCashInPayments,
  money,
  printThermalReceipt,
  ref,
  timeLabel,
} from '../../utils';

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
  const invNumber =
    invoice.invoice_no ||
    ref(String(settings?.invoice_prefix || 'INV').replace(/-+$/, '') || 'INV', invoice.id);

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
            {invoice.customer_id && (
              <span style={{ color: '#0f766e', fontWeight: 700, fontSize: '11.5px', marginTop: '2px' }}>
                Points: {Number(invoice.customer_points || 0).toLocaleString()} pts
                {Number(invoice.points_earned || 0) > 0 ? ` (+${Number(invoice.points_earned).toLocaleString()} pts)` : ''}
                {' · '}Wallet: {money(invoice.customer_wallet || 0)}
              </span>
            )}
          </div>
          <div className="zk-inv-meta-box">
            <small>Cashier / Seller</small>
            <strong>{invoice.cashier || 'Staff'}</strong>
            {invoice.seller_name && (
              <span style={{ color: '#0f766e', fontWeight: 600, fontSize: '11.5px' }}>
                Bill Maker: #{invoice.commission_user_id || ''} · {invoice.seller_name}
                {Number(invoice.total_commission || 0) > 0 ? ` (Comm: ${money(invoice.total_commission)})` : ''}
              </span>
            )}
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

        <BillPreview html={buildThermalReceiptHtml(invoice, settings)} paperWidth={billPaperWidth(settings)} />
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
