import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { id: 'lp-home', label: 'Home' },
  { id: 'lp-features', label: 'Features' },
  { id: 'lp-how-it-works', label: 'How It Works' },
  { id: 'lp-services', label: 'Services' },
  { id: 'lp-about', label: 'About' },
  { id: 'lp-contact', label: 'Contact' },
];

export default function LandingNavbar({ onLoginClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToSection(id) {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className={`lp-navbar${scrolled ? ' lp-scrolled' : ''}`}>
      <div className="lp-container lp-navbar-inner">
        <a
          href="#lp-home"
          className="lp-brand"
          onClick={(e) => { e.preventDefault(); scrollToSection('lp-home'); }}
        >
          <span className="lp-brand-icon" aria-hidden="true"><i className="fa-solid fa-graduation-cap"></i></span>
          One Click School Solutions
        </a>

        <ul className="lp-nav-links">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button onClick={() => scrollToSection(item.id)}>{item.label}</button>
            </li>
          ))}
        </ul>

        <div className="lp-nav-actions">
          <button className="lp-btn lp-btn-primary" onClick={onLoginClick}>
            Login
          </button>
          <button
            className="lp-hamburger"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <div className={`lp-mobile-menu${mobileOpen ? ' lp-open' : ''}`}>
        {NAV_ITEMS.map((item) => (
          <button key={item.id} onClick={() => scrollToSection(item.id)}>{item.label}</button>
        ))}
        <button onClick={() => { setMobileOpen(false); onLoginClick(); }}>Login</button>
      </div>
    </nav>
  );
}
