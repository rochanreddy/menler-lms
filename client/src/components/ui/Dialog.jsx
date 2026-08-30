import { useEffect, useRef } from 'react';
import { CloseIcon } from './icons.jsx';
import './ui.css';

/**
 * A modal that takes the whole screen's attention.
 *
 * Handles the four things a hand-rolled modal usually misses: Escape closes
 * it, focus moves into it on open and returns to the opener on close, focus
 * cannot leave it while open, and the page behind cannot scroll.
 *
 * WHEN NOT TO USE IT
 * - For a confirmation that is not destructive. Interrupting someone to ask
 *   "are you sure?" about a reversible action trains them to click through.
 * - For anything with its own URL — that is a page.
 * - For a message. A dialog demands an answer; if there is nothing to answer,
 *   use Alert or Toast.
 */
export default function Dialog({ open, onClose, title, children, footer }) {
  const panelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusables = () => panel.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    const first = focusables()[0];
    (first || panel).focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      // Wrap focus at both ends so Tab cannot walk out into the inert page.
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); firstItem.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      // Returning focus is what makes a modal survivable by keyboard: without
      // it, closing drops you back at the top of the document.
      if (openerRef.current && openerRef.current.focus) openerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-dialog__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-dialog" ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="ui-dialog__header">
          <div>{title}</div>
          <button className="ui-dialog__close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
        {footer && <div className="ui-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
