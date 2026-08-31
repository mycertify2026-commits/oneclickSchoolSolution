import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker served from /public so it stays on the same origin — no CSP issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

export default function PdfPreviewModal({ show, pdfBase64, title, onClose }) {
  const containerRef = useRef(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (!pdfBase64) { setLoading(true); return; }

    setLoading(true);
    setError(null);

    let cancelled = false;

    (async () => {
      try {
        const binary = atob(pdfBase64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page     = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas  = document.createElement('canvas');
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText =
            'display:block;margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,.18);border-radius:4px;max-width:100%';

          container.appendChild(canvas);

          await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport
          }).promise;

          if (cancelled) return;
        }

        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [show, pdfBase64]);

  // Reset on close
  useEffect(() => {
    if (!show && containerRef.current) containerRef.current.innerHTML = '';
    if (!show) { setError(null); setLoading(false); }
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="modal-overlay show"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ zIndex: 1050 }}
    >
      <div
        className="modal-box"
        style={{
          width: '90vw', maxWidth: 860,
          height: '90vh', display: 'flex', flexDirection: 'column',
          padding: 0, overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          flexShrink: 0, background: '#fff'
        }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            <i className="fas fa-file-pdf" style={{ color: '#e53e3e', marginRight: 8 }}></i>
            {title || 'Preview'}
          </span>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕ Close</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#f1f5f9' }}>
          {/* Loading spinner */}
          {loading && (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, color: 'var(--primary)' }}></i>
              <div style={{ marginTop: 12, fontWeight: 600 }}>Generating preview…</div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ textAlign: 'center', paddingTop: 60, color: '#dc2626' }}>
              <i className="fas fa-exclamation-circle" style={{ fontSize: 32 }}></i>
              <div style={{ marginTop: 12 }}>Could not render preview: {error}</div>
            </div>
          )}

          {/* PDF canvas pages */}
          <div ref={containerRef} />
        </div>
      </div>
    </div>
  );
}
