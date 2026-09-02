import { useState } from 'react';
import api from '../../api/client';

const INQUIRY_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'superDistributor', label: 'Super Distributor' },
  { value: 'general', label: 'General Inquiry' },
  { value: 'support', label: 'Support' },
  { value: 'partnership', label: 'Partnership' },
];

const EMPTY_FORM = { name: '', email: '', phone: '', organization: '', inquiryType: 'general', message: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errors.phone = 'Enter a valid phone number';
  if (!form.message.trim()) errors.message = 'Message is required';
  return errors;
}

export default function ContactSection() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [statusMsg, setStatusMsg] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setStatus('loading');
    setStatusMsg('');
    try {
      const res = await api.post('/contact', form);
      setStatus('success');
      setStatusMsg(res.data?.message || 'Thanks — your message has been sent.');
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus('error');
      setStatusMsg(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
  }

  return (
    <section id="lp-contact" style={{ background: 'var(--bg)' }}>
      <div className="lp-container lp-contact-wrap">
        <div className="lp-contact-info">
          <span className="lp-eyebrow">Contact</span>
          <h2>Let's Connect</h2>
          <p>
            Schools, distributors and partners can reach our team directly —
            we typically respond within one business day.
          </p>
          <div className="lp-contact-detail">
            <span className="lp-card-icon" aria-hidden="true"><i className="fa-solid fa-envelope"></i></span>
            <a href="mailto:mycertify2026@gmail.com">mycertify2026@gmail.com</a>
          </div>
        </div>

        <form className="lp-form" onSubmit={handleSubmit} noValidate>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 20px' }}>Contact Us</h2>

          {status === 'success' && <div className="lp-form-status lp-success" role="status">{statusMsg}</div>}
          {status === 'error' && <div className="lp-form-status lp-error" role="alert">{statusMsg}</div>}

          <div className="lp-form-row">
            <div className={`lp-field${errors.name ? ' lp-invalid' : ''}`}>
              <label htmlFor="lp-name">Full Name</label>
              <input
                id="lp-name" type="text" value={form.name}
                onChange={(e) => update('name', e.target.value)}
                aria-invalid={!!errors.name} aria-describedby={errors.name ? 'lp-name-err' : undefined}
              />
              {errors.name && <div className="lp-field-error" id="lp-name-err">{errors.name}</div>}
            </div>
            <div className={`lp-field${errors.email ? ' lp-invalid' : ''}`}>
              <label htmlFor="lp-email">Email Address</label>
              <input
                id="lp-email" type="email" value={form.email}
                onChange={(e) => update('email', e.target.value)}
                aria-invalid={!!errors.email} aria-describedby={errors.email ? 'lp-email-err' : undefined}
              />
              {errors.email && <div className="lp-field-error" id="lp-email-err">{errors.email}</div>}
            </div>
          </div>

          <div className="lp-form-row">
            <div className={`lp-field${errors.phone ? ' lp-invalid' : ''}`}>
              <label htmlFor="lp-phone">Phone Number</label>
              <input
                id="lp-phone" type="tel" value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'lp-phone-err' : undefined}
              />
              {errors.phone && <div className="lp-field-error" id="lp-phone-err">{errors.phone}</div>}
            </div>
            <div className="lp-field">
              <label htmlFor="lp-org">Organization / School Name</label>
              <input id="lp-org" type="text" value={form.organization} onChange={(e) => update('organization', e.target.value)} />
            </div>
          </div>

          <div className="lp-field">
            <label htmlFor="lp-inquiry">Inquiry Type</label>
            <select id="lp-inquiry" value={form.inquiryType} onChange={(e) => update('inquiryType', e.target.value)}>
              {INQUIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className={`lp-field${errors.message ? ' lp-invalid' : ''}`}>
            <label htmlFor="lp-message">Message</label>
            <textarea
              id="lp-message" value={form.message}
              onChange={(e) => update('message', e.target.value)}
              aria-invalid={!!errors.message} aria-describedby={errors.message ? 'lp-message-err' : undefined}
            />
            {errors.message && <div className="lp-field-error" id="lp-message-err">{errors.message}</div>}
          </div>

          <button type="submit" className="lp-btn lp-btn-primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Sending…' : 'Send Message'}
          </button>
        </form>
      </div>
    </section>
  );
}
