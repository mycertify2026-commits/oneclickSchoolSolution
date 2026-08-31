import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';

export default function CartOtpModal({ show, email, expiresInMinutes, itemCount, cartTotal, onVerified, onClose }) {
  const [otp, setOtp]                       = useState('');
  const [error, setError]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [secondsLeft, setSecondsLeft]       = useState((expiresInMinutes || 10) * 60);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    setSecondsLeft((expiresInMinutes || 10) * 60);
    setResendCooldown(60);
    setOtp('');
    setError('');
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => (s > 0 ? s - 1 : 0));
      setResendCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [show, expiresInMinutes]);

  if (!show) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  async function verify() {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/cart/verify-otp', { otp });
      onVerified(data);
    } catch (e) {
      setError(e.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    try {
      await api.post('/cart/resend-otp');
      setSecondsLeft((expiresInMinutes || 10) * 60);
      setResendCooldown(60);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not resend OTP');
    }
  }

  return (
    <div className="modal-overlay show">
      <div className="modal-box modal-sm">
        <div className="card-header">
          <h3>Verify OTP</h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
        </div>
        <p style={{ color: 'var(--text-secondary)', margin: '12px 0' }}>
          Enter the 6-digit code sent to <b>{email}</b> to confirm {itemCount} certificate request(s) totalling ₹{cartTotal}.
        </p>
        <div className="otp-input-group">
          <input
            className="form-control"
            style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
            maxLength={6}
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>Expires in {mm}:{ss}</span>
          <button
            disabled={resendCooldown > 0}
            onClick={resend}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}
          >
            {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
          </button>
        </div>
        {error && <div className="alert alert-danger" style={{ marginBottom: 10, padding: '8px 12px' }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || otp.length !== 6} onClick={verify}>
          {loading ? 'Verifying...' : 'Verify OTP'}
        </button>
      </div>
    </div>
  );
}
