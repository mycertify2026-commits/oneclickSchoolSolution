import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    upsertMeta('name', 'description', DESCRIPTION);
    upsertMeta('property', 'og:title', TITLE);
    upsertMeta('property', 'og:description', DESCRIPTION);
    upsertMeta('property', 'og:type', 'website');
    return () => { document.title = prevTitle; };
  }, []);

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
      {loginModalOpen && <LoginSelectorModal onClose={closeLoginModal} />}
    </div>
  );
}
