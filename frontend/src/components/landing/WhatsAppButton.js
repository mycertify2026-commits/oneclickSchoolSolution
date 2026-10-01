const WHATSAPP_NUMBER = '919765446236';
const DEFAULT_MESSAGE = "Hi! I'd like to know more about One Click School Solutions.";

export default function WhatsAppButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="lp-whatsapp-btn"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
    >
      <i className="fa-brands fa-whatsapp" aria-hidden="true"></i>
      <span className="lp-whatsapp-tooltip">Chat with us</span>
    </a>
  );
}
