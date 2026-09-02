import Reveal from './Reveal';

const POINTS = [
  { icon: 'fa-solid fa-gauge-high', title: 'Faster Certificate Processing', text: 'Go from student record to finished document in minutes.' },
  { icon: 'fa-solid fa-hand-sparkles', title: 'Reduced Manual Work', text: 'Automated templates and receipts cut repetitive paperwork.' },
  { icon: 'fa-solid fa-swatchbook', title: 'Consistent Certificate Design', text: 'Every document follows your school’s configured template.' },
  { icon: 'fa-solid fa-lock', title: 'Secure Document Workflow', text: 'OTP verification and role-based access protect every step.' },
  { icon: 'fa-solid fa-scale-balanced', title: 'Transparent Transactions', text: 'Every certificate ties to a clear, auditable transaction.' },
  { icon: 'fa-solid fa-layer-group', title: 'Centralized Management', text: 'Students, certificates and school operations in one place.' },
];

export default function WhyChooseUs() {
  return (
    <section id="lp-about">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Why Choose Us</span>
          <h2>Why Schools Choose Our Platform</h2>
        </div>
        <div className="lp-grid lp-grid-3">
          {POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 60} as="div" style={{ display: 'flex', gap: 16 }}>
              <span className="lp-card-icon" aria-hidden="true" style={{ flexShrink: 0 }}><i className={p.icon}></i></span>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{p.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
