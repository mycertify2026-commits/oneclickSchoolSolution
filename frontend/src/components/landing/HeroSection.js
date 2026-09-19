// Illustrative sample numbers for the dashboard preview graphic only — this
// is a mockup of what the product's UI looks like (same idea as the old
// mockup's sample "LC-2026-0142" row), never a claim about real usage, so it
// doesn't run into the "don't fabricate platform stats" rule that governs
// TrustSection's copy.
const DASH_STATS = [
  { icon: 'fa-solid fa-user-graduate', value: '1,248', label: 'Total Students', color: '#7C3AED', bg: 'rgba(124,58,237,.12)' },
  { icon: 'fa-solid fa-chalkboard-user', value: '86', label: 'Total Teachers', color: '#10B981', bg: 'rgba(16,185,129,.12)' },
  { icon: 'fa-solid fa-calendar-check', value: '92.6%', label: 'Attendance Today', color: '#3B82F6', bg: 'rgba(59,130,246,.12)' },
  { icon: 'fa-solid fa-sack-dollar', value: '₹8.45L', label: 'Fee Collection', color: '#F59E0B', bg: 'rgba(245,158,11,.14)' },
];
const DASH_BARS = [46, 72, 58, 84, 64, 38];
const DASH_BAR_COLORS = ['#7C3AED', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#7C3AED'];

export default function HeroSection({ onLoginClick, onExploreClick }) {
  return (
    <section id="lp-home" className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-text">
          <span className="lp-eyebrow">Digital Certificate &amp; Document Platform</span>
          <h1>
            Simplify School Certificates.<br />
            <span className="lp-highlight">Digitize Every Document.</span>
          </h1>
          <p className="lp-lede">
            Generate, manage and securely deliver school certificates and documents
            through one powerful platform — built for schools, distributors and
            administrators.
          </p>
          <div className="lp-hero-ctas">
            <button className="lp-btn lp-btn-primary" onClick={onLoginClick}>
              Get Started <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            <button className="lp-btn lp-btn-outline" onClick={onExploreClick}>
              Explore Platform
            </button>
          </div>
          <div className="lp-hero-trustline">
            <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> Role-based access</span>
            <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> OTP-verified</span>
            <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> QR-verified documents</span>
          </div>
        </div>

        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-dash-frame">
            <div className="lp-dash-topbar">
              <span className="lp-dash-dot" style={{ background: '#EF4444' }}></span>
              <span className="lp-dash-dot" style={{ background: '#F59E0B' }}></span>
              <span className="lp-dash-dot" style={{ background: '#10B981' }}></span>
              <span className="lp-dash-topbar-title">Dashboard Preview</span>
            </div>
            <div className="lp-dash-body">
              <div className="lp-dash-stats">
                {DASH_STATS.map((s) => (
                  <div className="lp-dash-stat" key={s.label}>
                    <span className="lp-dash-stat-icon" style={{ background: s.bg, color: s.color }}><i className={s.icon}></i></span>
                    <div><strong>{s.value}</strong><span>{s.label}</span></div>
                  </div>
                ))}
              </div>

              <div className="lp-dash-charts">
                <div className="lp-dash-chart-card">
                  <span className="lp-dash-chart-title">Attendance Overview</span>
                  <svg viewBox="0 0 220 74" className="lp-dash-line-chart" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lpLineFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,50 L30,38 L60,44 L90,24 L120,32 L150,16 L180,24 L220,8 L220,74 L0,74 Z" fill="url(#lpLineFill)" />
                    <path d="M0,50 L30,38 L60,44 L90,24 L120,32 L150,16 L180,24 L220,8" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="lp-dash-chart-card lp-dash-donut-card">
                  <span className="lp-dash-chart-title">Fee Collection</span>
                  <svg viewBox="0 0 80 80" className="lp-dash-donut">
                    <circle cx="40" cy="40" r="30" fill="none" stroke="var(--border)" strokeWidth="12" />
                    <circle cx="40" cy="40" r="30" fill="none" stroke="#7C3AED" strokeWidth="12"
                      strokeDasharray="141 188" strokeLinecap="round" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="30" fill="none" stroke="#F59E0B" strokeWidth="12"
                      strokeDasharray="28 188" strokeDashoffset="-141" strokeLinecap="round" transform="rotate(-90 40 40)" />
                  </svg>
                  <div className="lp-dash-donut-legend">
                    <span><i style={{ background: '#7C3AED' }}></i>Collected</span>
                    <span><i style={{ background: '#F59E0B' }}></i>Pending</span>
                  </div>
                </div>
              </div>

              <div className="lp-dash-bars">
                <span className="lp-dash-chart-title">Students by Class</span>
                <div className="lp-dash-bar-row">
                  {DASH_BARS.map((h, i) => (
                    <span key={i} className="lp-dash-bar" style={{ height: `${h}%`, background: DASH_BAR_COLORS[i % DASH_BAR_COLORS.length] }}></span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lp-float-card lp-float-1"><i className="fa-solid fa-circle-check"></i> Certificate Generated</div>
        </div>
      </div>
    </section>
  );
}
