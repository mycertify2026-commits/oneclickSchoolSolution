import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const BLANK = {
  name: '', mobile: '', city: '', district: '', address: '', area_of_operation: '',
  pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '',
};
const BLANK_PW = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function SdSettings() {
  const [form, setForm] = useState(BLANK);
  const [email, setEmail] = useState('');
  const [commissionRate, setCommissionRate] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [pwForm, setPwForm] = useState(BLANK_PW);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  function avatarToUrl(filePath) {
    if (!filePath) return null;
    return `/uploads/avatars/${String(filePath).split(/[\\/]/).pop()}`;
  }

  const load = useCallback(async () => {
    const res = await api.get('/super-distributors/me');
    const p = res.data.profile;
    setForm({
      name: p.name || '', mobile: p.mobile || '', city: p.city || '', district: p.district || '', address: p.address || '',
      area_of_operation: p.area_of_operation || '', pan_number: p.pan_number || '',
      bank_account_holder: p.bank_account_holder || '', bank_name: p.bank_name || '',
      bank_account_number: p.bank_account_number || '', bank_ifsc: p.bank_ifsc || '',
    });
    setEmail(p.email || '');
    setCommissionRate(p.commission_rate);
    setAvatarUrl(p.avatar_url || '');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setSuccess('');
    setUploadingAvatar(true);
    try {
      const data = new FormData();
      data.append('avatar', file);
      const res = await api.put('/super-distributors/me/avatar', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAvatarUrl(res.data.avatar_url);
      setSuccess('Profile photo updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload profile photo');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    setError(''); setSuccess('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      await api.put('/super-distributors/me', form);
      setSuccess('Profile saved successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally { setSaving(false); }
  }

  async function handlePasswordChange() {
    setPwError(''); setPwSuccess('');
    if (pwForm.newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Passwords do not match'); return; }
    setChangingPw(true);
    try {
      await api.put('/super-distributors/me/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwSuccess('Password changed successfully');
      setPwForm(BLANK_PW);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    } finally { setChangingPw(false); }
  }

  return (
    <Layout role="superDistributor">
      <div className="page-header"><div><h1 className="page-title">Settings</h1></div></div>

      {/* Profile */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 16 }}>Profile Information</h4>
        {error && <Alert msg={error} type="danger" />}
        {success && <Alert msg={success} type="success" />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)',
          }}>
            {avatarUrl
              ? <img src={avatarToUrl(avatarUrl)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <i className="fas fa-user" style={{ fontSize: 28, color: 'var(--text-light)' }}></i>}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} id="sd-avatar-input" />
            <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
              {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
            </button>
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Email (cannot be changed)</label>
            <input className="form-control" value={email} disabled style={{ background: 'var(--bg-secondary)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Commission Rate</label>
            <input className="form-control" value={commissionRate !== null ? `${commissionRate}%` : ''} disabled style={{ background: 'var(--bg-secondary)' }} />
          </div>
          <F label="Full Name *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} />
          <F label="Mobile" value={form.mobile} onChange={v => setForm(p => ({ ...p, mobile: v }))} />
          <F label="City" value={form.city} onChange={v => setForm(p => ({ ...p, city: v }))} />
          <F label="District" value={form.district} onChange={v => setForm(p => ({ ...p, district: v }))} />
          <F label="Area of Operation" value={form.area_of_operation} onChange={v => setForm(p => ({ ...p, area_of_operation: v }))} />
          <F label="PAN Card Number" value={form.pan_number} onChange={v => setForm(p => ({ ...p, pan_number: v.toUpperCase() }))} placeholder="ABCDE1234F" />
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Address</label>
          <textarea className="form-control" rows={3} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
        </div>

        <h4 style={{ margin: '24px 0 16px' }}>Payout Bank Details</h4>
        <div className="form-grid-2">
          <F label="Account Holder Name" value={form.bank_account_holder} onChange={v => setForm(p => ({ ...p, bank_account_holder: v }))} />
          <F label="Bank Name" value={form.bank_name} onChange={v => setForm(p => ({ ...p, bank_name: v }))} />
          <F label="Account Number" value={form.bank_account_number} onChange={v => setForm(p => ({ ...p, bank_account_number: v }))} />
          <F label="IFSC Code" value={form.bank_ifsc} onChange={v => setForm(p => ({ ...p, bank_ifsc: v.toUpperCase() }))} placeholder="SBIN0001234" />
        </div>

        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
      </div>

      {/* Change Password */}
      <div className="card" style={{ padding: 20 }}>
        <h4 style={{ marginBottom: 16 }}>Change Password</h4>
        {pwError && <Alert msg={pwError} type="danger" />}
        {pwSuccess && <Alert msg={pwSuccess} type="success" />}
        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input type="password" className="form-control" value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input type="password" className="form-control" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input type="password" className="form-control" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handlePasswordChange} disabled={changingPw}>{changingPw ? 'Changing...' : 'Change Password'}</button>
      </div>
    </Layout>
  );
}

function F({ label, value, onChange, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Alert({ msg, type }) {
  const bg = type === 'danger' ? '#FEE2E2' : '#ECFDF5';
  const color = type === 'danger' ? 'var(--danger)' : 'var(--success)';
  return <div style={{ background: bg, color, padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{msg}</div>;
}
