import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  xl = false,
  busy = false,
  closeOnBackdrop = false,
  className = '',
}) {
  useEffect(() => {
    const previous = document.activeElement;
    const handle = e => {
      if (e.key === 'Escape' && !busy && closeOnBackdrop) onClose();
      if (e.key === 'Tab') {
        const modals = [...document.querySelectorAll('.modal')];
        const activeModal = modals.at(-1);
        if (!activeModal) return;
        const items = [
          ...activeModal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
          ),
        ].filter(el => el.getClientRects().length);
        if (!items.length) return;
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1).focus();
        }
        if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    const modals = [...document.querySelectorAll('.modal')];
    const topModal = modals.at(-1);
    topModal?.querySelector('[autofocus], button')?.focus();
    return () => {
      document.removeEventListener('keydown', handle);
      previous?.focus?.();
    };
  }, [busy, closeOnBackdrop, onClose]);

  const modalNode = (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (closeOnBackdrop && e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={
          'modal ' +
          (xl ? 'xl ' : wide ? 'wide ' : '') +
          (className ? `${className} ` : '')
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <Button
            icon={X}
            className="icon-only"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          />
        </div>
        {children}
      </section>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
