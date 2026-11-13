import { useCallback, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { billPaperWidth, buildBillHtml, printBill } from '../../utils/receiptPrint';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * On-screen bill preview. Renders the SAME HTML that is sent to the printer
 * (buildBillHtml), so what staff see on screen is exactly what gets printed.
 */
export function BillPreview({ html, paperWidth = 80, maxHeight = 560 }) {
  const frameRef = useRef(null);
  const [height, setHeight] = useState(420);

  const fit = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const h = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0);
    if (h) setHeight(h + 4);
  }, []);

  return (
    <div className="zk-bill-preview" style={{ maxHeight }}>
      <div className="zk-bill-paper" style={{ width: `${paperWidth}mm` }}>
        <iframe
          ref={frameRef}
          title="Bill preview"
          srcDoc={html}
          onLoad={fit}
          style={{ width: `${paperWidth}mm`, height, border: 0, display: 'block', background: '#fff' }}
        />
      </div>
    </div>
  );
}

/**
 * Reusable modal that displays any unified bill object and prints it with one click.
 */
export function BillModal({ bill, settings = {}, onClose }) {
  const [printing, setPrinting] = useState(false);
  if (!bill) return null;

  const html = buildBillHtml(bill, settings);
  const paperWidth = billPaperWidth(settings);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printBill(bill, settings, { silent: true });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      title={`${bill.number || 'Bill'} · ${bill.title || 'Bill Preview'}`}
      description={bill.branch || settings?.shop_name || 'ZEEDAT POS'}
      onClose={onClose}
    >
      <div className="modal-body">
        <BillPreview html={html} paperWidth={paperWidth} />
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Close</Button>
        <Button icon={Printer} variant="primary" disabled={printing} onClick={handlePrint}>
          {printing ? 'Printing...' : 'Print Bill'}
        </Button>
      </div>
    </Modal>
  );
}
