import Reveal from './Reveal';

const SERVICES = [
  { icon: 'fa-solid fa-file-export', title: 'LC / Leaving Certificate', text: 'Create professional Leaving Certificates with customized templates and QR verification.' },
  { icon: 'fa-solid fa-id-card', title: 'Bonafide Certificate', text: 'Generate Bonafide certificates quickly using your school-specific templates.' },
  { icon: 'fa-solid fa-address-card', title: 'ID Cards', text: 'Create customizable student ID cards with configurable design and colors.' },
  { icon: 'fa-solid fa-folder-open', title: 'Digital Document Management', text: 'Manage certificate generation and document workflows from one platform.' },
  { icon: 'fa-solid fa-school', title: 'School Administration', text: 'Manage students, certificates, settings and everyday school operations.' },
  { icon: 'fa-solid fa-diagram-project', title: 'Distributor Management', text: "Manage the platform's distributor and super distributor ecosystem." },
];

export default function ServicesSection() {
  return (
    <section id="lp-services" style={{ background: 'var(--bg)' }}>
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Services</span>
          <h2>Our Services</h2>
          <p>From certificates to network management — one platform covers it all.</p>
        </div>
        <div className="lp-grid lp-grid-3">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 60} className="lp-card" style={{ background: 'var(--white)' }}>
              <span className="lp-card-icon" aria-hidden="true"><i className={s.icon}></i></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
