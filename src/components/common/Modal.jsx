import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export function Modal({ title, description, children, onClose, wide = false, busy = false }) {
  useEffect(() => {
    const previous = document.activeElement;
    const handle = e => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const items = [
          ...document.querySelectorAll(
            '.modal button:not([disabled]), .modal input:not([disabled]), .modal select:not([disabled]), .modal textarea:not([disabled])'
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
    document.querySelector('.modal [autofocus], .modal button')?.focus();
    return () => {
      document.removeEventListener('keydown', handle);
      previous?.focus?.();
    };
  }, [busy, onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={'modal ' + (wide ? 'wide' : '')}
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
}
