export const money = value =>
  'LKR ' +
  (Number(value || 0) / 100).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const rupees = value => Number(value || 0) / 100;

export const cents = value => Math.round(Number(value || 0) * 100);

export const number = value => Number(value || 0).toLocaleString('en-LK');

export const ref = (prefix, id) => prefix + '-' + String(id).padStart(6, '0');

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const dateLabel = (date, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  date
    ? new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'Asia/Colombo' }).format(
        new Date(
          date.length === 10 ? date + 'T00:00:00+05:30' : date.replace(' ', 'T') + '+05:30'
        )
      )
    : '—';

export const timeLabel = date =>
  dateLabel(date, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

export const initials = name =>
  (name || '')
    .split(/\s+/)
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase();

export const options = (data, display = 'name') =>
  (data || []).map(row => [row.id, row[display]]);

export const stockStatus = item =>
  item.category === 'Services'
    ? 'Service'
    : !item.qty
      ? 'Out of Stock'
      : item.qty <= item.reorder_level
        ? 'Low Stock'
        : 'In Stock';
