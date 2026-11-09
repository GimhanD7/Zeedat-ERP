import { Printer } from 'lucide-react';
import { Button, Modal, Table } from '../../components/common';
import { dateLabel, money, ref } from '../../utils';

export function ReceiptModal({ invoice, settings, onClose }) {
  if (!invoice) return null;

  return (
    <Modal title={ref('INV', invoice.id)} description="Sales receipt" onClose={onClose}>
      <div className="modal-body">
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
            <div>
              <span>Tax</span>
              <strong>{money(invoice.tax)}</strong>
            </div>
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
        <Button icon={Printer} variant="primary" onClick={() => window.print()}>
          Print receipt
        </Button>
      </div>
    </Modal>
  );
}
