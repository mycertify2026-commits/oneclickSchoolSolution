// Spec explicitly forbids fabricating customer/school counts that aren't
// real platform data, so this uses non-numeric trust statements instead of
// invented stats (no fake school names/logos either, for the same reason).
const TRUST_ITEMS = [
  { icon: 'fa-solid fa-lock', label: 'Secure by Design', color: '#7C3AED', bg: 'rgba(124,58,237,.12)' },
  { icon: 'fa-solid fa-cloud', label: 'Cloud-Ready', color: '#10B981', bg: 'rgba(16,185,129,.12)' },
  { icon: 'fa-solid fa-user-shield', label: 'Role-Based Access', color: '#3B82F6', bg: 'rgba(59,130,246,.12)' },
  { icon: 'fa-solid fa-bolt', label: 'Digital-First', color: '#F59E0B', bg: 'rgba(245,158,11,.14)' },
];

export default function TrustSection() {
  return (
    <div className="lp-trust">
      <div className="lp-container lp-trust-inner">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label} className="lp-trust-item">
            <span className="lp-trust-icon" style={{ background: item.bg, color: item.color }} aria-hidden="true">
              <i className={item.icon}></i>
            </span>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
