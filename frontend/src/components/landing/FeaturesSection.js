import Reveal from './Reveal';

const FEATURES = [
  { icon: 'fa-solid fa-file-signature', title: 'Digital Certificate Generation', text: 'Generate professional school certificates in seconds, ready to download or share.' },
  { icon: 'fa-solid fa-swatchbook', title: 'Smart Templates', text: 'Use customized PNG borders and certificate templates matched to your school.' },
  { icon: 'fa-solid fa-qrcode', title: 'QR Verification', text: 'Every document can carry a QR code so anyone can verify it instantly.' },
  { icon: 'fa-solid fa-key', title: 'Secure OTP Verification', text: 'Confirm certificate generation using the registered School Admin email.' },
  { icon: 'fa-solid fa-receipt', title: 'Automated Receipts', text: 'A receipt is generated automatically for every confirmed certificate.' },
  { icon: 'fa-solid fa-users-line', title: 'Student Document Management', text: 'Certificate generation stays connected to complete student records.' },
  { icon: 'fa-solid fa-user-shield', title: 'Role-Based Access', text: 'Dedicated dashboards for Super Admin, School Admin, Distributor and more.' },
  { icon: 'fa-solid fa-chart-line', title: 'Transactions & Earnings', text: 'Track certificate transactions and platform earnings in one place.' },
];

export default function FeaturesSection() {
  return (
    <section id="lp-features">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Features</span>
          <h2>Everything You Need to Manage School Documents</h2>
          <p>A complete toolkit for certificate generation, verification and school administration.</p>
        </div>
        <div className="lp-grid lp-grid-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="lp-card">
              <span className="lp-card-icon" aria-hidden="true"><i className={f.icon}></i></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
