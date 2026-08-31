import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
      setIsError(false);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Something went wrong. Please try again.');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-right" style={{ width: '100%' }}>
        <div className="login-form-box">
          <h2 style={{ marginBottom: 4 }}>Forgot Password</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Enter your email and we will send you a reset link.</p>

          {message && (
            <div style={{
              background: isError ? '#FEF2F2' : '#ECFDF5',
              color: isError ? '#DC2626' : 'var(--success)',
              padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16
            }}>{message}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 12 }} type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
          <Link to="/" style={{ display: 'block', textAlign: 'center', marginTop: 16, color: 'var(--primary)', fontSize: 13 }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
