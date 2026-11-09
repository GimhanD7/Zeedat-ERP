import { useState } from 'react';
import { ArrowRight, CreditCard, ReceiptText } from 'lucide-react';
import {
  Button,
  Field,
  FilterTabs,
  Modal,
  Panel,
  ProductArt,
} from '../../components/common';
import { Alert } from '../../components/feedback';
import { cents, managers, money, rupees, tenders, today } from '../../utils';

const keys = ['Cash', 'Card', 'Bank Transfer', 'Koko'];

export function CheckoutModal({
  ctx,
  onClose,
  onComplete,
  lines,
  subtotal,
  discount,
  tax,
  total,
  customer,
  discountBps,
  draftId,
}) {
  const [method, setMethod] = useState('Cash');
  const [tender, setTender] = useState({ Cash: String(rupees(total)) });
  const [refs, setRefs] = useState({});
  const [credit, setCredit] = useState(false);
  const [due, setDue] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const split = method === 'Split';
  const activeMethods = method === 'Credit' ? [] : split ? keys : [method];
  const paid = activeMethods.reduce((sum, key) => sum + cents(tender[key]), 0);
  const balance = Math.max(total - paid, 0);
  const change = Math.max(paid - total, 0);
  const canCredit = managers.includes(ctx.user.role) && customer;

  const selectMethod = value => {
    setMethod(value);
    setTender(value === 'Split' || value === 'Credit' ? {} : { [value]: String(rupees(total)) });
    setCredit(value === 'Credit');
    setError('');
  };

  const complete = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const invoice = await ctx.mutate('sale.checkout', {
        items: lines.map(({ product_id, unit_id, qty }) => ({ product_id, unit_id, qty })),
        discount_bps: discountBps,
        customer_id: customer,
        draft_id: draftId,
        expected_total: total,
        payments: activeMethods
          .filter(key => cents(tender[key]) > 0)
          .map(key => ({
            method: key,
            amount: cents(tender[key]),
            reference: refs[key] || '',
          })),
        allow_credit: credit,
        due_date: due,
      });
      onComplete(invoice);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Checkout / Payment"
      description="Review the bill, record the tender and complete the sale."
      onClose={onClose}
      wide
      busy={busy}
    >
      <form onSubmit={complete}>
        <div className="modal-body">
          <Alert>{error}</Alert>
          <div className="checkout-grid">
            <Panel title="Current Bill" icon={ReceiptText}>
              <div className="checkout-items">
                {lines.map(line => (
                  <div key={line.id}>
                    <ProductArt item={line.product} small />
                    <span>
                      <strong>{line.product.name}</strong>
                      <small>
                        {line.qty} × {money(line.product.price)}
                      </small>
                    </span>
                    <b>{money(line.qty * line.product.price)}</b>
                  </div>
                ))}
              </div>
              <div className="totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>− {money(discount)}</strong>
                </div>
                <div>
                  <span>Tax</span>
                  <strong>{money(tax)}</strong>
                </div>
                <div className="total">
                  <span>Total payable</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
            </Panel>

            <Panel title="Payment Method" icon={CreditCard}>
              <div className="payment-body">
                <FilterTabs
                  choices={[...tenders, 'Split', ...(canCredit ? ['Credit'] : [])]}
                  value={method}
                  onChange={selectMethod}
                />
                <div className="form-grid">
                  {activeMethods.map(key => (
                    <div className="tender-fields" key={key}>
                      <Field label={key + ' amount (LKR)'}>
                        <input
                          type="number"
                          min="0"
                          step=".01"
                          value={tender[key] ?? ''}
                          onChange={e => setTender({ ...tender, [key]: e.target.value })}
                          placeholder="0.00"
                          required={!split}
                        />
                      </Field>
                      {key !== 'Cash' && cents(tender[key]) > 0 && (
                        <Field
                          label={
                            key === 'Koko'
                              ? 'Verified Koko merchant reference'
                              : 'Confirmed transaction reference'
                          }
                        >
                          <input
                            value={refs[key] ?? ''}
                            onChange={e => setRefs({ ...refs, [key]: e.target.value })}
                            maxLength={100}
                            required
                          />
                        </Field>
                      )}
                    </div>
                  ))}
                </div>

                {canCredit && balance > 0 && method !== 'Credit' && (
                  <label className="inline-field">
                    <input
                      type="checkbox"
                      checked={credit}
                      onChange={e => setCredit(e.target.checked)}
                    />{' '}
                    Record remainder as shop credit
                  </label>
                )}

                {credit && balance > 0 && (
                  <Field label="Credit due date">
                    <input
                      type="date"
                      min={today()}
                      value={due}
                      onChange={e => setDue(e.target.value)}
                      required
                    />
                  </Field>
                )}

                <div className="totals payment-totals">
                  <div>
                    <span>{credit ? 'Credit balance' : 'Balance due'}</span>
                    <strong>{money(balance)}</strong>
                  </div>
                  <div className="total">
                    <span>Change</span>
                    <strong>{money(change)}</strong>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <div className="modal-footer">
          <Button onClick={onClose} disabled={busy}>
            Back to bill
          </Button>
          <Button
            type="submit"
            icon={ArrowRight}
            variant="primary"
            disabled={busy || (balance > 0 && !credit)}
          >
            {busy ? 'Posting sale…' : 'Complete sale'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
