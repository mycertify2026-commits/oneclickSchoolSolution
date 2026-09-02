export default function HeroSection({ onLoginClick, onExploreClick }) {
  return (
    <section id="lp-home" className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-text">
          <span className="lp-eyebrow">Digital Certificate &amp; Document Platform</span>
          <h1>
            Simplify School Certificates.<br />
            <span className="lp-highlight">Digitize Every Document.</span>
          </h1>
          <p className="lp-lede">
            Generate, manage and securely deliver school certificates and documents
            through one powerful platform — built for schools, distributors and
            administrators.
          </p>
          <div className="lp-hero-ctas">
            <button className="lp-btn lp-btn-primary" onClick={onLoginClick}>
              Get Started <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            <button className="lp-btn lp-btn-outline" onClick={onExploreClick}>
              Explore Platform
            </button>
          </div>
          <div className="lp-hero-trustline">
            <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> Role-based access</span>
            <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> OTP-verified</span>
            <span><i className="fa-solid fa-circle-check" aria-hidden="true"></i> QR-verified documents</span>
          </div>
        </div>

        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-mock-frame">
            <div className="lp-mock-bar"><span></span><span></span><span></span></div>
            <div className="lp-mock-body">
              <div className="lp-mock-title">Recent Certificates</div>

              <div className="lp-mock-row">
                <span className="lp-mock-icon"><i className="fa-solid fa-file-lines"></i></span>
                <span className="lp-mock-info"><strong>Leaving Certificate</strong><span>Sample Student · LC-2026-0142</span></span>
                <span className="lp-mock-pill"><i className="fa-solid fa-check"></i> Generated</span>
              </div>

              <div className="lp-mock-row">
                <span className="lp-mock-icon"><i className="fa-solid fa-id-card"></i></span>
                <span className="lp-mock-info"><strong>Bonafide Certificate</strong><span>Sample Student · BF-2026-0098</span></span>
                <span className="lp-mock-qr"></span>
              </div>

              <div className="lp-mock-row">
                <span className="lp-mock-icon"><i className="fa-solid fa-receipt"></i></span>
                <span className="lp-mock-info"><strong>Receipt Generated</strong><span>Transaction confirmed</span></span>
                <span className="lp-mock-pill">₹100</span>
              </div>
            </div>
          </div>

          <div className="lp-float-card lp-float-1"><i className="fa-solid fa-circle-check"></i> Certificate Generated</div>
          <div className="lp-float-card lp-float-2"><i className="fa-solid fa-shield"></i> OTP Verified</div>
          <div className="lp-float-card lp-float-3"><i className="fa-solid fa-lock"></i> Secure &amp; Verified</div>
        </div>
      </div>
    </section>
  );
}
