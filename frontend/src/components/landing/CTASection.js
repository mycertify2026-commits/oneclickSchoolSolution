export default function CTASection({ onLoginClick }) {
  return (
    <section aria-labelledby="lp-cta-heading">
      <div className="lp-cta">
        <h2 id="lp-cta-heading">Ready to Simplify Certificate Management?</h2>
        <p>
          Bring certificate generation, document management and school operations
          into one streamlined platform.
        </p>
        <div className="lp-cta-ctas">
          <button className="lp-btn lp-btn-primary" onClick={onLoginClick}>
            Get Started <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
          <button className="lp-btn lp-btn-outline" onClick={onLoginClick}>
            Login
          </button>
        </div>
      </div>
    </section>
  );
}
