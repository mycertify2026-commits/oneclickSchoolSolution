// Shared logo lockup for the navbar and footer — one icon badge + wordmark +
// tagline, so both places stay in sync if the brand ever changes again.
export default function LandingLogo({ variant = 'nav' }) {
  const isFooter = variant === 'footer';
  return (
    <span className={`lp-logo${isFooter ? ' lp-logo-footer' : ''}`}>
      <span className="lp-logo-mark" aria-hidden="true"><i className="fa-solid fa-graduation-cap"></i></span>
      <span className="lp-logo-text">
        <span className="lp-logo-word">Smart<span className="lp-logo-word-accent">india</span></span>
        <span className="lp-logo-caption">Innovative Solutions · One Click School Solution</span>
      </span>
    </span>
  );
}
