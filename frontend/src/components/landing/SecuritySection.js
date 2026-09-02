import Reveal from './Reveal';

const SECURITY_ITEMS = [
  { icon: 'fa-solid fa-user-lock', title: 'Role-Based Access', text: 'Users only access the functionality they are authorized to use.' },
  { icon: 'fa-solid fa-key', title: 'OTP Verification', text: 'Certificate submission is verified through a one-time code.' },
  { icon: 'fa-solid fa-money-check-dollar', title: 'Secure Transactions', text: 'Financial calculations are validated on the server, not the browser.' },
  { icon: 'fa-solid fa-file-shield', title: 'Document Integrity', text: 'Generated documents preserve their configured templates and settings.' },
  { icon: 'fa-solid fa-qrcode', title: 'QR Verification', text: 'Certificates can include a QR code for instant, independent verification.' },
];

export default function SecuritySection() {
  return (
    <section>
      <div className="lp-container lp-security-wrap">
        <div>
          <span className="lp-eyebrow">Security</span>
          <h2 style={{ fontSize: 'clamp(26px,3vw,36px)', fontWeight: 800, margin: '0 0 28px', letterSpacing: '-0.02em' }}>
            Secure by Design
          </h2>
          <div className="lp-security-list">
            {SECURITY_ITEMS.map((item, i) => (
              <Reveal key={item.title} delay={i * 60} as="div" className="lp-security-item">
                <span className="lp-card-icon" aria-hidden="true"><i className={item.icon}></i></span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <div className="lp-security-visual" aria-hidden="true">
          <i className="fa-solid fa-shield-halved"></i>
        </div>
      </div>
    </section>
  );
}
