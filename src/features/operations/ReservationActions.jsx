import { Printer } from 'lucide-react';
import { Badge, Button, Table } from '../../components/common';
import { cents, money, ref, tenders } from '../../utils';

export const reservationPaymentMethods = [...tenders, 'Wallet'];
const balance = reservation => Math.max(0, Number(reservation.total) - Number(reservation.paid));

export function reservationStock(products, units, branch) {
  const bId = Number(branch || 0);
  const quantity = product => {
    if (bId > 0 && Array.isArray(product.branch_stocks)) {
      const hit = product.branch_stocks.find(stock => Number(stock.branch_id) === bId);
      if (hit) return Number(hit.available_qty ?? hit.qty ?? 0);
    }
    return Number(product.qty ?? 0);
  };
  const availableUnits = product => units.filter(unit =>
    (bId <= 0 || Number(unit.branch_id) === bId) && Number(unit.product_id) === Number(product.id) &&
    unit.state === 'Available' && !Number(unit.reserved)
  );
  const available = products.filter(product =>
    product.category !== 'Services' && quantity(product) > 0 &&
    (!Number(product.serialized) || availableUnits(product).length > 0)
  );
  return { available, availableUnits, quantity };
}

export function openReserveItem(ctx, customer, products, units, { productId, onSuccess } = {}) {
  const branch = Number(customer.branch_id);
  const { available, availableUnits, quantity } = reservationStock(products, units, branch);
  if (!available.length) {
    ctx.setNotice('There are no items available to reserve at this branch.');
    return;
  }

  const selected = values => available.find(product => String(product.id) === String(values.product_id));
  ctx.setDialog({
    title: 'Reserve item · ' + customer.name,
    route: 'reservation.create',
    submit: 'Reserve, Record Deposit & Print Bill',
    values: {
      customer_id: customer.id,
      branch,
      product_id: available.find(item => String(item.id) === String(productId))?.id ?? '',
      qty: 1,
      method: 'Cash',
    },
    fields: values => {
      const product = selected(values);
      return [
        { name: 'product_id', label: 'Product', choices: available.map(item => [item.id, item.name + ' · ' + money(item.price)]) },
        Number(product?.serialized)
          ? { name: 'unit_id', label: 'Device Unit', choices: availableUnits(product).map(unit => [unit.id, unit.code]) }
          : { name: 'qty', label: 'Quantity', type: 'number', min: 1, max: product ? quantity(product) : undefined },
        { name: 'amount', label: 'Deposit (LKR)', type: 'money', min: 0.01 },
        { name: 'method', label: 'Payment Method', choices: reservationPaymentMethods },
      ];
    },
    transform: values => ({
      ...values,
      qty: Number(selected(values)?.serialized) ? 1 : values.qty,
      amount: cents(values.amount),
    }),
    onSuccess,
  });
}

export function openReservationAction(ctx, reservation, action, onSuccess) {
  const due = balance(reservation);
  const titles = {
    pay: 'Collect Reservation Payment & Print Bill',
    deliver: 'Hand Over Item & Print Bill',
    cancel: 'Cancel Reservation',
  };
  ctx.setDialog({
    title: titles[action],
    description: action === 'cancel'
      ? 'Deposits will be returned to the customer wallet.'
      : reservation.product + ' · ' + ref('RSV', reservation.id),
    route: 'reservation.' + action,
    submit: titles[action],
    values: { id: reservation.id, branch: reservation.branch_id, amount: due / 100, method: 'Cash' },
    fields: action === 'pay' ? [
      { name: 'amount', label: 'Payment Amount (LKR)', type: 'money', min: 0.01, max: due / 100 },
      { name: 'method', label: 'Payment Method', choices: reservationPaymentMethods },
    ] : [],
    transform: values => ({ ...values, amount: cents(values.amount) }),
    onSuccess,
  });
}

export function ReservationTable({ rows, onAction, onPrint, canCancel = false, disabled = false }) {
  return (
    <Table rows={rows} empty="No reserved items for this customer." columns={[
      ['Reservation #', row => <strong>{ref('RSV', row.id)}</strong>],
      ['Item', row => row.product + (row.unit_code ? ' · ' + row.unit_code : '')],
      ['Qty', row => row.qty],
      ['Total', row => money(row.total)],
      ['Paid', row => money(row.paid)],
      ['Balance', row => money(balance(row))],
      ['Status', row => (
        <Badge tone={row.status === 'Delivered' ? 'green' : row.status === 'Cancelled' ? 'slate' : balance(row) > 0 ? 'amber' : 'blue'}>
          {row.status === 'Delivered' ? 'Handed Over' : row.status}
        </Badge>
      )],
      ['Actions', row => (
        <div className="row-actions">
          {onPrint && <Button icon={Printer} variant="outline" onClick={() => onPrint(row)}>Print Bill</Button>}
          {row.status === 'Held' && (
            <>
              {balance(row) > 0
                ? <Button variant="primary" disabled={disabled} onClick={() => onAction(row, 'pay')}>Collect Payment</Button>
                : <Button variant="primary" disabled={disabled} onClick={() => onAction(row, 'deliver')}>Hand Over</Button>}
              {canCancel && <Button disabled={disabled} onClick={() => onAction(row, 'cancel')}>Cancel</Button>}
            </>
          )}
        </div>
      )],
    ]} />
  );
}
