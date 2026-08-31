import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!token) { setError('Missing or invalid link. Please use the link from your email.'); return; }

    setLoading(true);
    try {
      await api.post('/auth/set-password', { token, password });
      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-right" style={{ width: '100%' }}>
          <div className="login-form-box" style={{ textAlign: 'center' }}>
            <h2>Password set!</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Redirecting you to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-right" style={{ width: '100%' }}>
        <div className="login-form-box">
          <h2 style={{ marginBottom: 4 }}>Set your password</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Choose a password with at least 8 characters.</p>

          {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">New password</label>
              <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm password</label>
              <input type="password" className="form-control" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 12 }} type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Set Password'}
            </button>
          </form>
          <Link to="/" style={{ display: 'block', textAlign: 'center', marginTop: 16, color: 'var(--primary)', fontSize: 13 }}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}
