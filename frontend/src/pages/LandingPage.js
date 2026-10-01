import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import LandingNavbar from '../components/landing/LandingNavbar';
import LoginSelectorModal from '../components/landing/LoginSelectorModal';
import HeroSection from '../components/landing/HeroSection';
import TrustSection from '../components/landing/TrustSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import ServicesSection from '../components/landing/ServicesSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import RolesSection from '../components/landing/RolesSection';
import SecuritySection from '../components/landing/SecuritySection';
import CertificateShowcase from '../components/landing/CertificateShowcase';
import WhyChooseUs from '../components/landing/WhyChooseUs';
import CTASection from '../components/landing/CTASection';
import ContactSection from '../components/landing/ContactSection';
import LandingFooter from '../components/landing/LandingFooter';
import WhatsAppButton from '../components/landing/WhatsAppButton';

const TITLE = 'One Click School Solutions | Digital Certificate & School Document Management Platform';
const DESCRIPTION = 'Generate, manage and securely deliver school certificates, ID cards and digital documents through one powerful platform.';

function upsertMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export default function LandingPage() {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    upsertMeta('name', 'description', DESCRIPTION);
    upsertMeta('property', 'og:title', TITLE);
    upsertMeta('property', 'og:description', DESCRIPTION);
    upsertMeta('property', 'og:type', 'website');
    return () => { document.title = prevTitle; };
  }, []);

  // Arriving here from another page's nav (e.g. clicking "Contact" from
  // /logistics) carries the target section id in location.state — finish
  // the scroll once this page's sections have actually mounted, then clear
  // the state so a later back/forward doesn't re-trigger it.
  useEffect(() => {
    const targetId = location.state?.scrollTo;
    if (!targetId) return;
    const t = setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    navigate(location.pathname, { replace: true, state: {} });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  function openLoginModal() { setLoginModalOpen(true); }
  function closeLoginModal() { setLoginModalOpen(false); }

  function scrollToFeatures() {
    document.getElementById('lp-features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="landing-page">
      <LandingNavbar onLoginClick={openLoginModal} />
      <main>
        <HeroSection onLoginClick={openLoginModal} onExploreClick={scrollToFeatures} />
        <TrustSection />
        <FeaturesSection />
        <ServicesSection />
        <HowItWorksSection />
        <RolesSection />
        <SecuritySection />
        <CertificateShowcase />
        <WhyChooseUs />
        <CTASection onLoginClick={openLoginModal} />
        <ContactSection />
      </main>
      <LandingFooter />
      <WhatsAppButton />
      {loginModalOpen && <LoginSelectorModal onClose={closeLoginModal} />}
    </div>
  );
}
