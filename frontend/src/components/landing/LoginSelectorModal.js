import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ROLES from './rolesData';

export default function LoginSelectorModal({ onClose }) {
  const boxRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current?.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const focusables = boxRef.current.querySelectorAll(
        'a[href], button:not([disabled])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="lp-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="lp-modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-modal-title"
        ref={boxRef}
      >
        <div className="lp-modal-head">
          <div>
            <h2 id="lp-modal-title">Welcome Back</h2>
            <p>Select your account type to continue.</p>
          </div>
          <button
            className="lp-modal-close"
            onClick={onClose}
            aria-label="Close login selector"
            ref={closeBtnRef}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div className="lp-role-options">
          {ROLES.map((role) => (
            <Link key={role.key} to={role.path} className="lp-role-option" onClick={onClose}>
              <span className="lp-role-option-icon" aria-hidden="true">
                <i className={role.icon}></i>
              </span>
              <span className="lp-role-option-text">
                <strong>{role.label}</strong>
                <span>{role.short}</span>
              </span>
              <i className="fa-solid fa-arrow-right lp-role-arrow" aria-hidden="true"></i>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
