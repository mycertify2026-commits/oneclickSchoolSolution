import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const BLANK = { name: '', mobile: '', city: '', district: '', address: '' };
const BLANK_PW = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function DistSettings() {
  const [form, setForm] = useState(BLANK);
  const [email, setEmail] = useState('');
  const [commissionRate, setCommissionRate] = useState(null);
  const [pwForm, setPwForm] = useState(BLANK_PW);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get('/distributors/me');
    const d = res.data.distributor;
    setForm({ name: d.name || '', mobile: d.mobile || '', city: d.city || '', district: d.district || '', address: d.address || '' });
    setEmail(d.email || '');
    setCommissionRate(d.commission_rate);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setError(''); setSuccess('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      await api.put('/distributors/me', form);
      setSuccess('Profile saved successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Error while saving');
    } finally { setSaving(false); }
  }

  async function handlePasswordChange() {
    setPwError(''); setPwSuccess('');
    if (pwForm.newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Passwords do not match'); return; }
    setChangingPw(true);
    try {
      await api.put('/distributors/me/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwSuccess('Password changed successfully');
      setPwForm(BLANK_PW);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Error while changing password');
    } finally { setChangingPw(false); }
  }

  return (
    <Layout role="distributor">
      <div className="page-header"><div><h1 className="page-title">Settings</h1></div></div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 16 }}>Profile Information</h4>
        {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
        {success && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{success}</div>}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Email (cannot be changed)</label><input className="form-control" value={email} disabled style={{ background: 'var(--bg-secondary)' }} /></div>
          <div className="form-group"><label className="form-label">Commission Rate</label><input className="form-control" value={commissionRate !== null ? `${commissionRate}%` : ''} disabled style={{ background: 'var(--bg-secondary)' }} /></div>
          <Field label="Full Name *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
          <Field label="Mobile" value={form.mobile} onChange={v => setForm(p => ({ ...p, mobile: v }))} />
          <Field label="City" value={form.city} onChange={v => setForm(p => ({ ...p, city: v }))} />
          <Field label="District" value={form.district} onChange={v => setForm(p => ({ ...p, district: v }))} />
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Address</label>
          <textarea className="form-control" rows={3} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}></textarea>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h4 style={{ marginBottom: 16 }}>Change Password</h4>
        {pwError && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{pwError}</div>}
        {pwSuccess && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{pwSuccess}</div>}
        <div className="form-grid-3">
          <div className="form-group"><label className="form-label">Current Password</label><input type="password" className="form-control" value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">New Password</label><input type="password" className="form-control" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Confirm Password</label><input type="password" className="form-control" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} /></div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handlePasswordChange} disabled={changingPw}>{changingPw ? 'Changing...' : 'Change Password'}</button>
      </div>
    </Layout>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
