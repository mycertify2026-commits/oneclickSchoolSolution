import Reveal from './Reveal';

// Illustrative CSS mockups only — not real certificate templates or real
// student data, per the spec's rule against fabricating official-looking
// documents. Clearly-fictional placeholder name/fields.
const SAMPLES = [
  { label: 'Leaving Certificate', badge: 'LC' },
  { label: 'Bonafide Certificate', badge: 'Bonafide' },
  { label: 'Student ID Card', badge: 'ID Card' },
];

export default function CertificateShowcase() {
  return (
    <section style={{ background: 'var(--bg)' }}>
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Sample Output</span>
          <h2>Professional Documents, Every Time</h2>
          <p>A preview of the certificate styles generated on the platform (sample data shown).</p>
        </div>
        <div className="lp-grid lp-grid-3">
          {SAMPLES.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="lp-cert-card">
              <div className="lp-cert-head">{s.label}</div>
              <div className="lp-cert-body">
                <div className="lp-cert-name">Sample Student</div>
                <div className="lp-cert-line"></div>
                <div className="lp-cert-line"></div>
                <div className="lp-cert-line short"></div>
                <div className="lp-cert-foot">
                  <span className="lp-mock-qr" aria-hidden="true"></span>
                  <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 700 }}>{s.badge}-2026-XXXX</span>
                </div>
              </div>
              <div className="lp-cert-badge">Sample Preview</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
