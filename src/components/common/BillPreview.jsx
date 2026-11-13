import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { billPaperWidth, buildBillHtml, printBill } from '../../utils/receiptPrint';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * On-screen bill preview. Renders the SAME HTML that is sent to the printer
 * (buildBillHtml), so what staff see on screen is exactly what gets printed.
 */
export function BillPreview({ html, paperWidth = 80, maxHeight = 560, fullHeight = false }) {
  const frameRef = useRef(null);
  const viewportRef = useRef(null);
  const [height, setHeight] = useState(420);
  const [width, setWidth] = useState(0);
  const paperPixels = paperWidth * 96 / 25.4;
  const scale = fullHeight && width ? Math.min(1, width / paperPixels) : 1;

  const fit = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const h = doc.querySelector('.bill')?.getBoundingClientRect().height || doc.body?.offsetHeight;
    if (h) setHeight(Math.ceil(h) + 4);
  }, []);

  useEffect(() => {
    if (!fullHeight || !viewportRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [fullHeight]);

  return (
    <div ref={viewportRef} className="zk-bill-preview" style={{ maxHeight: fullHeight ? undefined : maxHeight }}>
      <div className="zk-bill-paper" style={{ width: paperPixels * scale, height: height * scale, overflow: 'hidden' }}>
        <iframe
          ref={frameRef}
          title="Bill preview"
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={fit}
          style={{ width: `${paperWidth}mm`, height, border: 0, display: 'block', background: '#fff',
            transform: `scale(${scale})`, transformOrigin: 'top left' }}
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
      wide={paperWidth === 210}
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
