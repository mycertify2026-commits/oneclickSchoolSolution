import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import ROLES from './rolesData';

export default function RolesSection() {
  return (
    <section style={{ background: 'var(--bg)' }}>
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Access</span>
          <h2>One Platform. Four Powerful Experiences.</h2>
          <p>Every role gets a dashboard built for exactly what they need to do.</p>
        </div>
        <div className="lp-grid lp-grid-4">
          {ROLES.map((role, i) => (
            <Reveal key={role.key} delay={i * 70} as="div" className="lp-role-card">
              <span className="lp-role-icon" aria-hidden="true"><i className={role.icon}></i></span>
              <h3>{role.desc}</h3>
              <p>{role.short}</p>
              <ul className="lp-role-features">
                {role.features.map((f) => (
                  <li key={f}><i className="fa-solid fa-check" aria-hidden="true"></i> {f}</li>
                ))}
              </ul>
              <Link to={role.path} className="lp-btn lp-btn-outline">
                {role.label} Login <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
