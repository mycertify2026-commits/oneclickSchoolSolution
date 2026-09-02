const { sendMail } = require('../utils/email');

const INQUIRY_LABELS = {
  school: 'School',
  distributor: 'Distributor',
  superDistributor: 'Super Distributor',
  general: 'General Inquiry',
  support: 'Support',
  partnership: 'Partnership',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Public landing-page contact form. Delivers straight to the platform's own
// SMTP account (the same address the app already sends OTP/welcome emails
// from) - no separate inbox/table to maintain, and every attempt is logged
// via email_logs same as every other email in the app.
async function submitContactInquiry(req, res) {
  const { name, email, phone, organization, inquiryType, message } = req.body;
  const recipient = process.env.CONTACT_INBOX || process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER;

  if (!recipient) {
    return res.status(503).json({ error: 'Contact form is not configured. Please try again later.' });
  }

  const inquiryLabel = INQUIRY_LABELS[inquiryType] || 'General Inquiry';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
      <h2 style="color:#1A6FD4;margin-bottom:16px">New website inquiry — ${escapeHtml(inquiryLabel)}</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Name</td><td style="padding:6px 0;font-weight:600">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Phone</td><td style="padding:6px 0">${escapeHtml(phone) || '—'}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Organization</td><td style="padding:6px 0">${escapeHtml(organization) || '—'}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap">Inquiry Type</td><td style="padding:6px 0">${escapeHtml(inquiryLabel)}</td></tr>
      </table>
      <p style="color:#64748b;margin-top:16px">Message</p>
      <p style="white-space:pre-wrap;border-left:3px solid #1A6FD4;padding-left:12px">${escapeHtml(message)}</p>
    </div>`;

  const result = await sendMail({
    to: recipient,
    subject: `Website inquiry (${inquiryLabel}) from ${name}`,
    html,
    emailType: 'contact_inquiry',
  });

  if (!result.success) {
    return res.status(502).json({ error: 'Could not send your message right now. Please try again later or email us directly.' });
  }

  res.json({ success: true, message: 'Thanks — your message has been sent. We will get back to you shortly.' });
}

module.exports = { submitContactInquiry };
