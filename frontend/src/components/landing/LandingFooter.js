import { Link } from 'react-router-dom';
import ROLES from './rolesData';

const PLATFORM_LINKS = [
  { id: 'lp-home', label: 'Home' },
  { id: 'lp-features', label: 'Features' },
  { id: 'lp-services', label: 'Services' },
  { id: 'lp-how-it-works', label: 'How It Works' },
  { id: 'lp-about', label: 'About' },
  { id: 'lp-contact', label: 'Contact' },
];

export default function LandingFooter() {
  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontWeight: 800, fontSize: 17 }}>
              <span className="lp-brand-icon" aria-hidden="true"><i className="fa-solid fa-graduation-cap"></i></span>
              One Click School Solutions
            </div>
            <p>School Certificate Management Platform — digital certificate generation and document management for schools, distributors and administrators.</p>
          </div>

          <div>
            <h4>Platform</h4>
            <ul>
              {PLATFORM_LINKS.map((l) => (
                <li key={l.id}><button onClick={() => scrollToSection(l.id)}>{l.label}</button></li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Access</h4>
            <ul>
              {ROLES.map((role) => (
                <li key={role.key}><Link to={role.path}>{role.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Support</h4>
            <ul>
              <li><button onClick={() => scrollToSection('lp-contact')}>Contact</button></li>
              <li><a href="mailto:mycertify2026@gmail.com">Help</a></li>
            </ul>
          </div>
        </div>

        <div className="lp-footer-bottom">
          © {new Date().getFullYear()} One Click School Solutions. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
