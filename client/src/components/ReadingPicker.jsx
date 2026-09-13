import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isStoredFile } from '../api.js';
import LessonIcon from './LessonIcon.jsx';
import LineIcon from './LineIcon.jsx';

// What the Teacher notes chip opens when there is more than one thing to
// open: the notes slot and every file a mentor pushed onto the lesson, its
// session and its week, as one list. Tapping a PDF hands it to the in-page reader;
// a link that is not a PDF (a Drive file, say) opens in a new tab, because an
// HTML page in the PDF reader is a blank box.
//
// Small and centred rather than a dropdown under the chip: the chip row
// scrolls sideways on a phone, and anything anchored to it gets clipped.

export const opensInReader = (url) => isStoredFile(url) || /\.pdf(\?|#|$)/i.test(url || '');

export default function ReadingPicker({ title, items, onOpen, onClose, label = 'Teacher notes' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);

  return createPortal(
    <div className="rp-overlay" onClick={onClose}>
      <div className="rp" ref={panelRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${label} for ${title}`}>
        <div className="rp-head">
          <div>
            <div className="fv-kicker">{label}</div>
            <div className="rp-title">{title}</div>
          </div>
          <button className="fv-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {/* Notes first — what was taught — then the resources that go with
            it. A heading only when both groups exist; a list of three notes
            does not need to be told they are notes. */}
        {[['notes', 'Notes'], ['resource', 'Resources']].map(([kind, heading]) => {
          const group = items.filter((it) => (it.kind || 'notes') === kind);
          if (!group.length) return null;
          const both = items.some((it) => (it.kind || 'notes') !== kind);
          return (
        <ul className="rp-list" key={kind} aria-label={heading}>
          {both && <li className="rp-group">{heading}</li>}
          {group.map((it, i) => (
            <li key={`${it.url}-${i}`}>
              {opensInReader(it.url) ? (
                <button type="button" className="rp-item" onClick={() => onOpen(it)}>
                  <span className="rp-icon"><LessonIcon type="pdf" size={16} /></span>
                  <span className="rp-copy">
                    <span className="rp-name">{it.name}</span>
                    <span className="rp-from">{it.from}</span>
                  </span>
                  <span className="rp-go"><LineIcon name="chevron" size={14} /></span>
                </button>
              ) : (
                <a className="rp-item" href={it.url} target="_blank" rel="noreferrer" onClick={onClose}>
                  <span className="rp-icon"><LineIcon name="video" size={16} /></span>
                  <span className="rp-copy">
                    <span className="rp-name">{it.name}</span>
                    <span className="rp-from">{it.from} · opens in a new tab</span>
                  </span>
                  <span className="rp-go"><LineIcon name="chevron" size={14} /></span>
                </a>
              )}
            </li>
          ))}
        </ul>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
