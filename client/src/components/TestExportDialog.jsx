import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, X } from 'lucide-react';

export default function TestExportDialog({ test, format, includeAnswers, setIncludeAnswers, exporting, onClose, onDownload }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (exporting) panelRef.current?.focus();
  }, [exporting]);

  const handleKeys = event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!exporting) onClose();
    }
    if (event.key !== 'Tab') return;
    const controls = panelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); panelRef.current.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
      event.preventDefault(); first.focus();
    }
  };

  // Portalling out of the animated/scrolling dashboard prevents fixed-position
  // containing blocks and clipping, regardless of list/detail view or scroll position.
  return createPortal(
    <div className="modal-overlay test-export-overlay" onKeyDown={handleKeys}
      onMouseDown={event => { if (event.target === event.currentTarget && !exporting) onClose(); }}>
      <div ref={panelRef} className="modal-content test-export-dialog" role="dialog" aria-modal="true"
        aria-labelledby="test-export-heading" aria-describedby="test-export-description" aria-busy={exporting} tabIndex={-1}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <h3 id="test-export-heading" style={{ margin: 0 }}>Export {format.toUpperCase()}</h3>
          <button ref={closeRef} type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={exporting} aria-label="Close export"><X size={16} /></button>
        </div>
        <p style={{ overflowWrap: 'anywhere' }}>{test.title}</p>
        <p id="test-export-description" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Includes the E-Data logo, instructions, questions with domain labels, answer options and page numbers.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '1.25rem 0' }}>
          <input type="checkbox" checked={includeAnswers} disabled={exporting} onChange={event => setIncludeAnswers(event.target.checked)} style={{ width: 18, flexShrink: 0 }} />
          Highlight correct answers in dark red (administrator copy)
        </label>
        <button type="button" className="btn btn-primary" onClick={onDownload} disabled={exporting}><FileDown size={16} /> {exporting ? 'Preparing document...' : 'Download'}</button>
      </div>
    </div>, document.body
  );
}
