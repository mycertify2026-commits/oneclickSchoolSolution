// Spec explicitly forbids fabricating customer/school counts that aren't
// real platform data, so this uses non-numeric trust statements instead of
// invented stats.
const TRUST_ITEMS = [
  { icon: 'fa-solid fa-lock', label: 'Secure by Design' },
  { icon: 'fa-solid fa-cloud', label: 'Cloud-Ready' },
  { icon: 'fa-solid fa-user-shield', label: 'Role-Based Access' },
  { icon: 'fa-solid fa-bolt', label: 'Digital-First' },
];

export default function TrustSection() {
  return (
    <div className="lp-trust">
      <div className="lp-container lp-trust-inner">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label} className="lp-trust-item">
            <i className={item.icon} aria-hidden="true"></i> {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
