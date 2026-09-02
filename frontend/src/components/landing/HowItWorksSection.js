import Reveal from './Reveal';

const STEPS = [
  { num: '01', title: 'Select Student', text: 'Choose the student and the required certificate.' },
  { num: '02', title: 'Customize & Preview', text: "Apply the school's template, border and design." },
  { num: '03', title: 'Verify with OTP', text: 'Submit the cart and verify through OTP sent to the School Admin email.' },
  { num: '04', title: 'Generate & Download', text: 'Download the certificate and its corresponding receipt.' },
];

export default function HowItWorksSection() {
  return (
    <section id="lp-how-it-works">
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How It Works</span>
          <h2>From Student to Certificate in 4 Steps</h2>
        </div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} delay={i * 90} className="lp-step">
              <div className="lp-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
