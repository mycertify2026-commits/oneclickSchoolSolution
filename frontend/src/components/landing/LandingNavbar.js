import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LandingLogo from './LandingLogo';

const NAV_ITEMS = [
  { id: 'lp-home', label: 'Home' },
  { id: 'lp-features', label: 'Features' },
  { id: 'lp-how-it-works', label: 'How It Works' },
  { id: 'lp-services', label: 'Services' },
  { id: 'lp-about', label: 'About' },
  { to: '/logistics', label: 'Logistics' },
  { id: 'lp-contact', label: 'Contact' },
];

export default function LandingNavbar({ onLoginClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Section links only exist on the home page. From any other page (e.g.
  // /logistics), navigate home first and let LandingPage's own effect pick
  // up `scrollTo` from location state and finish the scroll once mounted.
  function scrollToSection(id) {
    setMobileOpen(false);
    if (location.pathname !== '/') {
      navigate('/', { state: { scrollTo: id } });
      return;
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goHome() {
    setMobileOpen(false);
    if (location.pathname !== '/') navigate('/');
    else scrollToSection('lp-home');
  }

  function handleNavClick(item) {
    if (item.to) { setMobileOpen(false); navigate(item.to); }
    else scrollToSection(item.id);
  }

  return (
    <nav className={`lp-navbar${scrolled ? ' lp-scrolled' : ''}`}>
      <div className="lp-container lp-navbar-inner">
        <a
          href="/"
          className="lp-brand"
          onClick={(e) => { e.preventDefault(); goHome(); }}
        >
          <LandingLogo variant="nav" />
        </a>

        <ul className="lp-nav-links">
          {NAV_ITEMS.map((item) => (
            <li key={item.to || item.id}>
              <button onClick={() => handleNavClick(item)}>{item.label}</button>
            </li>
          ))}
        </ul>

        <div className="lp-nav-actions">
          <button className="lp-btn lp-btn-outline" onClick={() => scrollToSection('lp-contact')}>
            Request Demo
          </button>
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
          <button key={item.to || item.id} onClick={() => handleNavClick(item)}>{item.label}</button>
        ))}
        <button onClick={() => scrollToSection('lp-contact')}>Request Demo</button>
        <button onClick={() => { setMobileOpen(false); onLoginClick(); }}>Login</button>
      </div>
    </nav>
  );
}
