import Reveal from './Reveal';

const LOGISTICS_SERVICES = [
  { icon: 'fa-solid fa-truck', title: 'B2B Trucking & Transportation', text: 'Reliable road transportation with flexible vehicle capacities, Full Truck Load (FTL), Less Than Truck Load (LTL), temperature-controlled transportation, and customized load matching.' },
  { icon: 'fa-solid fa-ship', title: 'End-to-End Shipping Solutions', text: 'Complete shipping management covering pickup, fulfillment, transportation, storage, documentation, container management, and continuous shipment tracking.' },
  { icon: 'fa-solid fa-route', title: 'Middle-Mile & Last-Mile Delivery', text: 'Efficient delivery solutions connecting distribution centers to the final destination, including door-to-door, pier-to-door, and pier-to-pier transportation.' },
  { icon: 'fa-solid fa-dolly', title: 'Movers & Packers', text: 'Domestic and international relocation solutions for residential, commercial, and industrial requirements, including packing, transportation, storage, and specialized moving services.' },
  { icon: 'fa-solid fa-warehouse', title: 'Warehousing & Storage', text: 'Flexible warehousing solutions including temperature-controlled, private, specialized, and bonded storage, along with packaging, labeling, distribution, cross-docking, and reverse logistics.' },
];

const TECH_POINTS = [
  { icon: 'fa-solid fa-location-crosshairs', title: 'Real-Time Tracking', text: 'Monitor shipment movement and logistics operations in real time.' },
  { icon: 'fa-solid fa-satellite-dish', title: 'GPS Monitoring', text: 'Track transportation activity and vehicle movement for better control.' },
  { icon: 'fa-solid fa-chart-line', title: 'Smart Reporting', text: 'Access customized reports and operational insights for better decision-making.' },
  { icon: 'fa-solid fa-bolt', title: 'Faster & Reliable Delivery', text: 'Optimize transportation and delivery operations to improve turnaround times.' },
];

export default function LogisticsSection() {
  function scrollToContact() {
    document.getElementById('lp-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section id="lp-logistics" style={{ background: 'var(--bg)' }}>
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow lp-eyebrow-logistics">Logistics Services</span>
          <h2>Complete Logistics Solutions. From Pickup to Final Delivery.</h2>
          <p>
            Beyond certificates and school management, we also provide end-to-end logistics
            solutions to help businesses move goods efficiently, reliably, and securely — from
            road transportation and shipping to warehousing and last-mile delivery.
          </p>
        </div>

        <div className="lp-grid lp-grid-3">
          {LOGISTICS_SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 60} className="lp-card lp-card-logistics" style={{ background: 'var(--white)' }}>
              <span className="lp-card-icon lp-card-icon-logistics" aria-hidden="true"><i className={s.icon}></i></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>

        <div className="lp-logistics-tech">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h3 style={{ fontSize: 'clamp(20px,2.2vw,26px)', fontWeight: 800, margin: '0 0 8px' }}>Technology-Driven Logistics</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>
              Technology-enabled tracking and monitoring for full visibility across the transportation journey.
            </p>
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

        <div className="lp-logistics-cta">
          <h3>Move Smarter. Deliver Better.</h3>
          <p>
            Whether you need transportation, shipping, warehousing, relocation, or last-mile
            delivery, our integrated logistics solutions help simplify your supply chain from
            origin to destination.
          </p>
          <div className="lp-cta-ctas">
            <button className="lp-btn lp-btn-primary" onClick={scrollToContact}>
              Explore Logistics Services <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            <button className="lp-btn lp-btn-outline" onClick={scrollToContact}>
              Contact Us
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
