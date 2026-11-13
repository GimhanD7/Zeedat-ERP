import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { dateLabel, timeLabel } from '../../utils/formatters';
import { billLogo } from '../../utils/receiptPrint';

export function buildCashbookPdf({ shop, branch, statement, operator }) {
  const doc = new jsPDF({ format: 'a4', compress: true });
  const title = 'Daily Cashbook Statement';
  doc.setProperties({ title, subject: branch });
  const margin = 14;
  const width = 182;
  const teal = [17, 94, 86];
  const amount = value => (Number(value || 0) / 100).toLocaleString('en-LK', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const logo = billLogo(shop);
  let y = 17;
  if (logo) {
    const image = doc.getImageProperties(logo);
    const scale = Math.min(44 / image.width, 16 / image.height);
    doc.addImage(logo, margin, y, image.width * scale, image.height * scale);
    y += image.height * scale + 6;
  }
  const text = (value, size, color = [20, 38, 56]) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(value), width);
    doc.text(lines, margin, y);
    y += lines.length * size * 0.42 + 2;
  };
  text(shop?.shop_name || 'ZEEDAT POS', 12, teal);
  text(title, 21);
  const period = [...new Set([statement.from, statement.to].filter(Boolean))].map(date => dateLabel(date)).join(' to ');
  text([branch, period, operator && 'Prepared by ' + operator].filter(Boolean).join(' | '), 9);

  const rows = statement.rows;
  const cashIn = rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount)), 0);
  const cashOut = rows.reduce((sum, row) => sum + Math.max(0, -Number(row.amount)), 0);
  const hasClosing = statement.closing != null;
  const totals = [
    ...(statement.opening == null ? [] : [['Opening float', statement.opening]]),
    ['Cash received', cashIn],
    ['Cash paid out', cashOut],
    [hasClosing ? 'Closing balance' : 'Net cash movement', statement.closing ?? cashIn - cashOut],
  ];
  const cardWidth = width / totals.length;
  totals.forEach(([label, value], index) => {
    const x = margin + index * cardWidth;
    doc.setFillColor(232, 243, 241);
    doc.roundedRect(x, y, cardWidth - 2, 17, 2, 2, 'F');
    doc.setTextColor(...teal);
    doc.setFontSize(8);
    doc.text(label, x + 3, y + 5);
    doc.setFontSize(10);
    doc.text('LKR ' + amount(value), x + 3, y + 12, { maxWidth: cardWidth - 8 });
  });

  autoTable(doc, {
    startY: y + 23,
    margin: { top: 15, left: margin, right: margin, bottom: 18 },
    head: [['Date / time', 'Category', 'Description / ref', 'Operator', 'Cash in (LKR)', 'Cash out (LKR)']],
    body: rows.length ? rows.map(row => [
      [dateLabel(row.business_date || row.created_at), timeLabel(row.created_at)].filter(Boolean).join(' '),
      row.kind || '', row.reference || '', row.operator_name || '',
      row.amount > 0 ? amount(row.amount) : '', row.amount < 0 ? amount(-row.amount) : '',
    ]) : [[{ content: 'No cash movements match this statement.', colSpan: 6 }]],
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: teal },
    columnStyles: { 0: { cellWidth: 30 }, 4: { cellWidth: 26, halign: 'right' }, 5: { cellWidth: 26, halign: 'right' } },
  });

  let signatureY = doc.lastAutoTable.finalY + 17;
  if (signatureY > 265) {
    doc.addPage();
    signatureY = 33;
  }
  doc.setDrawColor(100, 116, 139);
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  for (const [label, x] of [['Cashier signature', margin], ['Manager / owner signature', margin + 97]]) {
    doc.line(x, signatureY, x + 85, signatureY);
    doc.text(label, x, signatureY + 5);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.text(`Page ${page} of ${pages}`, 196, 285, { align: 'right' });
  }
  return doc;
}
