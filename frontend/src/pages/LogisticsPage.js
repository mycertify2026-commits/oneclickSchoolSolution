import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import LandingNavbar from '../components/landing/LandingNavbar';
import LandingFooter from '../components/landing/LandingFooter';
import LoginSelectorModal from '../components/landing/LoginSelectorModal';
import Reveal from '../components/landing/Reveal';

const TITLE = 'Logistics Services | One Click School Solutions';
const DESCRIPTION = 'End-to-end logistics solutions — B2B trucking, shipping, middle/last-mile delivery, movers & packers, and warehousing — powered by real-time tracking.';

function upsertMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

const SERVICES = [
  {
    id: 'trucking',
    icon: 'fa-solid fa-truck',
    tagline: 'Road Freight',
    title: 'B2B Trucking & Transportation',
    description: 'Reliable road transportation with flexible vehicle capacities, matched to the size and sensitivity of your load — from a single pallet to a full fleet dispatch.',
    features: ['Full Truck Load (FTL)', 'Less Than Truck Load (LTL)', 'Temperature-controlled transportation', 'Customized load matching'],
  },
  {
    id: 'shipping',
    icon: 'fa-solid fa-ship',
    tagline: 'Shipping Management',
    title: 'End-to-End Shipping Solutions',
    description: 'Complete shipping management covering pickup, fulfillment, transportation, storage and documentation — with continuous visibility from the first mile to the last.',
    features: ['Pickup & fulfillment', 'Storage & documentation', 'Container management', 'Continuous shipment tracking'],
  },
  {
    id: 'delivery',
    icon: 'fa-solid fa-route',
    tagline: 'Middle & Last-Mile',
    title: 'Middle-Mile & Last-Mile Delivery',
    description: 'Efficient delivery solutions connecting distribution centers to the final destination, with routing built for speed and reliability on every leg of the journey.',
    features: ['Door-to-door delivery', 'Pier-to-door transportation', 'Pier-to-pier transportation', 'Optimized route planning'],
  },
  {
    id: 'movers',
    icon: 'fa-solid fa-dolly',
    tagline: 'Relocation',
    title: 'Movers & Packers',
    description: 'Domestic and international relocation solutions for residential, commercial and industrial requirements, handled with the same care as our own cargo.',
    features: ['Residential & commercial moving', 'Professional packing', 'Secure storage', 'Specialized moving services'],
  },
  {
    id: 'warehousing',
    icon: 'fa-solid fa-warehouse',
    tagline: 'Storage & Fulfillment',
    title: 'Warehousing & Storage',
    description: 'Flexible warehousing built around how you actually move inventory — from short-term overflow storage to ongoing distribution and reverse logistics.',
    features: ['Temperature-controlled & bonded storage', 'Packaging & labeling', 'Cross-docking', 'Reverse logistics'],
  },
];

const TECH_POINTS = [
  { icon: 'fa-solid fa-location-crosshairs', title: 'Real-Time Tracking', text: 'Monitor shipment movement and logistics operations in real time.' },
  { icon: 'fa-solid fa-satellite-dish', title: 'GPS Monitoring', text: 'Track transportation activity and vehicle movement for better control.' },
  { icon: 'fa-solid fa-chart-line', title: 'Smart Reporting', text: 'Access customized reports and operational insights for better decision-making.' },
  { icon: 'fa-solid fa-bolt', title: 'Faster & Reliable Delivery', text: 'Optimize transportation and delivery operations to improve turnaround times.' },
];

export default function LogisticsPage() {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    upsertMeta('name', 'description', DESCRIPTION);
    upsertMeta('property', 'og:title', TITLE);
    upsertMeta('property', 'og:description', DESCRIPTION);
    upsertMeta('property', 'og:type', 'website');
    window.scrollTo(0, 0);
    return () => { document.title = prevTitle; };
  }, []);

  function openLoginModal() { setLoginModalOpen(true); }
  function closeLoginModal() { setLoginModalOpen(false); }
  function goToContact() { navigate('/', { state: { scrollTo: 'lp-contact' } }); }
  function scrollToServices() {
    document.getElementById('lg-services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="landing-page">
      <LandingNavbar onLoginClick={openLoginModal} />
      <main>
        {/* Banner */}
        <section className="lg-hero">
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-text">
              <span className="lp-eyebrow lp-eyebrow-logistics">Logistics Services</span>
              <h1>
                Complete Logistics Solutions.<br />
                <span className="lp-highlight">From Pickup to Final Delivery.</span>
              </h1>
              <p className="lp-lede">
                We provide end-to-end logistics solutions designed to help businesses move
                goods efficiently, reliably and securely — from road transportation and
                shipping to warehousing and last-mile delivery, built around technology,
                visibility and operational efficiency.
              </p>
              <div className="lp-hero-ctas">
                <button className="lp-btn lp-btn-primary" onClick={scrollToServices} style={{ background: 'linear-gradient(135deg,#B45309,#D97706)' }}>
                  Explore Services <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>
                <button className="lp-btn lp-btn-outline" onClick={goToContact}>
                  Request a Quote
                </button>
              </div>
              <div className="lp-hero-trustline">
                <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> Real-time tracking</span>
                <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> Pan-India network</span>
                <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> Secure handling</span>
              </div>
            </div>

            <div className="lp-hero-visual" aria-hidden="true">
              <div className="lp-dash-frame">
                <div className="lp-dash-topbar">
                  <span className="lp-dash-dot" style={{ background: '#EF4444' }}></span>
                  <span className="lp-dash-dot" style={{ background: '#F59E0B' }}></span>
                  <span className="lp-dash-dot" style={{ background: '#10B981' }}></span>
                  <span className="lp-dash-topbar-title">Live Shipment Tracking</span>
                </div>
                <div className="lp-dash-body">
                  <div className="lg-tracking-map">
                    <span className="lg-map-pin origin"><i className="fa-solid fa-warehouse"></i>Warehouse</span>
                    <span className="lg-map-pin destination"><i className="fa-solid fa-location-dot"></i>Customer</span>
                    <svg className="lg-map-route" viewBox="0 0 320 210" preserveAspectRatio="none">
                      <path d="M50,40 C 140,40 120,150 260,170" fill="none" stroke="#D97706" strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" />
                    </svg>
                    <span className="lg-map-truck"><i className="fa-solid fa-truck"></i></span>
                  </div>
                  <div className="lg-tracking-stats">
                    <div className="lg-tracking-stat"><strong>18.4 km</strong><span>Distance</span></div>
                    <div className="lg-tracking-stat"><strong>24 min</strong><span>ETA</span></div>
                    <div className="lg-tracking-stat"><strong>In Transit</strong><span>Status</span></div>
                  </div>
                </div>
              </div>
              <div className="lp-float-card lp-float-1"><i className="fa-solid fa-circle-check"></i> On-Time Delivery Rate 98%</div>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="lg-services" style={{ background: 'var(--bg)' }}>
          <div className="lp-container">
            <div className="lp-section-head">
              <span className="lp-eyebrow lp-eyebrow-logistics">Our Services</span>
              <h2>Everything Your Supply Chain Needs</h2>
              <p>Five integrated services, one point of contact — from first pickup to final delivery.</p>
            </div>

            {SERVICES.map((s, i) => {
              const visual = (
                <div className="lg-service-visual" key="visual">
                  <i className={`${s.icon} lg-ghost-icon`} aria-hidden="true"></i>
                  <span className="lg-main-icon"><i className={s.icon} aria-hidden="true"></i></span>
                </div>
              );
              const text = (
                <div className="lg-service-text" key="text">
                  <div className="lg-service-tagline">{s.tagline}</div>
                  <h2>{s.title}</h2>
                  <p>{s.description}</p>
                  <ul className="lg-service-features">
                    {s.features.map((f) => (
                      <li key={f}><i className="fa-solid fa-circle-check" aria-hidden="true"></i>{f}</li>
                    ))}
                  </ul>
                </div>
              );
              return (
                <Reveal key={s.id} as="div" className="lg-service-row">
                  {i % 2 === 1 ? [text, visual] : [visual, text]}
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Technology */}
        <section>
          <div className="lp-container">
            <div className="lp-section-head">
              <span className="lp-eyebrow lp-eyebrow-logistics">Technology-Driven</span>
              <h2>Built for Visibility, End to End</h2>
              <p>Technology-enabled tracking and monitoring across the entire transportation journey.</p>
            </div>
            <div className="lp-grid lp-grid-4">
              {TECH_POINTS.map((p, i) => (
                <Reveal key={p.title} delay={i * 60} as="div" style={{ display: 'flex', gap: 14 }}>
                  <span className="lp-card-icon lp-card-icon-logistics" aria-hidden="true" style={{ flexShrink: 0 }}><i className={p.icon}></i></span>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{p.title}</h3>
                    <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{p.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section style={{ background: 'var(--bg)' }}>
          <div className="lp-container">
            <div className="lp-logistics-cta">
              <h3>Move Smarter. Deliver Better.</h3>
              <p>
                Whether you need transportation, shipping, warehousing, relocation, or
                last-mile delivery, our integrated logistics solutions help simplify your
                supply chain from origin to destination.
              </p>
              <div className="lp-cta-ctas">
                <button className="lp-btn lp-btn-primary" onClick={goToContact}>
                  Request a Quote <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>
                <button className="lp-btn lp-btn-outline" onClick={() => navigate('/')}>
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
      {loginModalOpen && <LoginSelectorModal onClose={closeLoginModal} />}
    </div>
  );
}
