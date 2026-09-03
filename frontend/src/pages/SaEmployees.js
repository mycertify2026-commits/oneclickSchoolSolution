import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const BLANK_DIST = {
  name: '', email: '', mobile: '', city: '', district: '', area_of_operation: '', commission_rate: '10',
  pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '',
  password: '', confirmPassword: '',
};
const BLANK_SD = {
  name: '', email: '', mobile: '', city: '', district: '', address: '', area_of_operation: '', commission_rate: '2',
  pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '',
  password: '', confirmPassword: '',
};

function avatarToUrl(filePath) {
  if (!filePath) return null;
  return `/uploads/avatars/${String(filePath).split(/[\\/]/).pop()}`;
}

export default function SaEmployees() {
  const [tab, setTab] = useState('distributors');

  // ── Distributor state ──────────────────────────────────────────────────────
  const [distributors, setDistributors] = useState([]);
  const [showAddDistModal, setShowAddDistModal] = useState(false);
  const [showEditDistModal, setShowEditDistModal] = useState(false);
  const [editingDist, setEditingDist] = useState(null);
  const [distForm, setDistForm] = useState(BLANK_DIST);
  const [editDistForm, setEditDistForm] = useState({});
  const [distAvatarUrl, setDistAvatarUrl] = useState('');
  const [uploadingDistAvatar, setUploadingDistAvatar] = useState(false);
  const distAvatarInputRef = useRef(null);

  // ── Super Distributor state ────────────────────────────────────────────────
  const [superDistributors, setSuperDistributors] = useState([]);
  const [showAddSdModal, setShowAddSdModal] = useState(false);
  const [showEditSdModal, setShowEditSdModal] = useState(false);
  const [editingSd, setEditingSd] = useState(null);
  const [sdForm, setSdForm] = useState(BLANK_SD);
  const [editSdForm, setEditSdForm] = useState({});
  const [sdAvatarUrl, setSdAvatarUrl] = useState('');
  const [uploadingSdAvatar, setUploadingSdAvatar] = useState(false);
  const sdAvatarInputRef = useRef(null);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDist = useCallback(async () => {
    const res = await api.get('/distributors');
    setDistributors(res.data.distributors);
  }, []);

  const loadSd = useCallback(async () => {
    const res = await api.get('/super-distributors');
    setSuperDistributors(res.data.superDistributors);
  }, []);

  useEffect(() => { loadDist(); loadSd(); }, [loadDist, loadSd]);

  // ── Distributor CRUD ───────────────────────────────────────────────────────
  async function handleExport() {
    try {
      const res = await api.get('/distributors/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `distributors-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
    } catch { alert('Export failed.'); }
  }

  async function handleSaveDist() {
    setError('');
    if (!distForm.name || !distForm.email) { setError('Name and email are required'); return; }
    if (distForm.password) {
      if (distForm.password.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (distForm.password !== distForm.confirmPassword) { setError('Passwords do not match'); return; }
    }
    setSaving(true);
    try {
      await api.post('/distributors', distForm);
      setShowAddDistModal(false);
      setDistForm(BLANK_DIST);
      loadDist();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create distributor');
    } finally { setSaving(false); }
  }

  function openEditDist(d) {
    setEditingDist(d);
    setEditDistForm({
      name: d.name, mobile: d.mobile || '', city: d.city || '', district: d.district || '', address: d.address || '',
      area_of_operation: d.area_of_operation || '', commission_rate: d.commission_rate,
      pan_number: d.pan_number || '', bank_account_holder: d.bank_account_holder || '', bank_name: d.bank_name || '',
      bank_account_number: d.bank_account_number || '', bank_ifsc: d.bank_ifsc || '',
      is_active: d.is_active,
    });
    setDistAvatarUrl(d.avatar_url || '');
    setError('');
    setShowEditDistModal(true);
  }

  async function handleDistAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !editingDist) return;
    setError('');
    setUploadingDistAvatar(true);
    try {
      const data = new FormData();
      data.append('avatar', file);
      const res = await api.put(`/distributors/${editingDist.id}/avatar`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDistAvatarUrl(res.data.avatar_url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload profile photo');
    } finally {
      setUploadingDistAvatar(false);
      if (distAvatarInputRef.current) distAvatarInputRef.current.value = '';
    }
  }

  async function handleSaveEditDist() {
    setError('');
    if (!editDistForm.name?.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/distributors/${editingDist.id}`, editDistForm);
      setShowEditDistModal(false);
      loadDist();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update distributor');
    } finally { setSaving(false); }
  }

  async function handleDeleteDist(d) {
    if (!window.confirm(`Delete distributor "${d.name}"?`)) return;
    try {
      await api.delete(`/distributors/${d.id}`);
      loadDist();
    } catch (err) { alert(err.response?.data?.error || 'Failed to delete distributor'); }
  }

  // ── Super Distributor CRUD ─────────────────────────────────────────────────
  async function handleSaveSd() {
    setError('');
    if (!sdForm.name || !sdForm.email) { setError('Name and email are required'); return; }
    if (!sdForm.district) { setError('District is required'); return; }
    if (sdForm.password) {
      if (sdForm.password.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (sdForm.password !== sdForm.confirmPassword) { setError('Passwords do not match'); return; }
    }
    setSaving(true);
    try {
      await api.post('/super-distributors', sdForm);
      setShowAddSdModal(false);
      setSdForm(BLANK_SD);
      loadSd();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create super distributor');
    } finally { setSaving(false); }
  }

  function openEditSd(sd) {
    setEditingSd(sd);
    setEditSdForm({
      name: sd.name, mobile: sd.mobile || '', city: sd.city || '', district: sd.district || '', address: sd.address || '',
      area_of_operation: sd.area_of_operation || '', commission_rate: sd.commission_rate,
      pan_number: sd.pan_number || '', bank_account_holder: sd.bank_account_holder || '', bank_name: sd.bank_name || '',
      bank_account_number: sd.bank_account_number || '', bank_ifsc: sd.bank_ifsc || '',
      is_active: sd.is_active,
    });
    setSdAvatarUrl(sd.avatar_url || '');
    setError('');
    setShowEditSdModal(true);
  }

  async function handleSdAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !editingSd) return;
    setError('');
    setUploadingSdAvatar(true);
    try {
      const data = new FormData();
      data.append('avatar', file);
      const res = await api.put(`/super-distributors/${editingSd.id}/avatar`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSdAvatarUrl(res.data.avatar_url);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not upload profile photo');
    } finally {
      setUploadingSdAvatar(false);
      if (sdAvatarInputRef.current) sdAvatarInputRef.current.value = '';
    }
  }

  async function handleSaveEditSd() {
    setError('');
    if (!editSdForm.name?.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/super-distributors/${editingSd.id}`, editSdForm);
      setShowEditSdModal(false);
      loadSd();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update super distributor');
    } finally { setSaving(false); }
  }

  async function handleDeleteSd(sd) {
    if (!window.confirm(`Deactivate super distributor "${sd.name}"?`)) return;
    try {
      await api.delete(`/super-distributors/${sd.id}`);
      loadSd();
    } catch (err) { alert(err.response?.data?.error || 'Failed to delete super distributor'); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h2>{tab === 'distributors' ? 'Distributors' : 'Super Distributors'}</h2></div>
        <div className="page-header-actions">
          {tab === 'distributors' ? (
            <>
              <button className="btn btn-outline" onClick={handleExport}><i className="fas fa-file-export"></i> Export</button>
              <button className="btn btn-primary" onClick={() => { setDistForm(BLANK_DIST); setError(''); setShowAddDistModal(true); }}><i className="fas fa-plus"></i> Add Distributor</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => { setSdForm(BLANK_SD); setError(''); setShowAddSdModal(true); }}><i className="fas fa-plus"></i> Add Super Distributor</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'distributors' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('distributors')}><i className="fas fa-user-tie" style={{ marginRight: 6 }}></i>Distributors</button>
        <button className={`btn btn-sm ${tab === 'superDistributors' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('superDistributors')}><i className="fas fa-users-cog" style={{ marginRight: 6 }}></i>Super Distributors</button>
      </div>

      {/* Distributor Table */}
      {tab === 'distributors' && (
        <div className="card">
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>City</th><th>Commission Rate</th><th>Schools</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {distributors.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No distributors yet.</td></tr>
                ) : distributors.map(d => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.email}</td>
                    <td>{d.mobile || '-'}</td>
                    <td>{d.city || '-'}</td>
                    <td>{d.commission_rate}%</td>
                    <td>{d.school_count}</td>
                    <td><span className={`badge ${d.is_active ? 'badge-success' : 'badge-danger'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <button className="btn-icon" title="Edit" onClick={() => openEditDist(d)}><i className="fas fa-edit"></i></button>
                      <button className="btn-icon" title="Delete" onClick={() => handleDeleteDist(d)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Super Distributor Table */}
      {tab === 'superDistributors' && (
        <div className="card">
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>District</th><th>Commission Rate</th><th>Distributors</th><th>Direct Schools</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {superDistributors.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No super distributors yet.</td></tr>
                ) : superDistributors.map(sd => (
                  <tr key={sd.id}>
                    <td>{sd.name}</td>
                    <td>{sd.email}</td>
                    <td>{sd.mobile || '—'}</td>
                    <td>{sd.district || '—'}</td>
                    <td>{sd.commission_rate !== null && sd.commission_rate !== undefined ? `${sd.commission_rate}%` : '—'}</td>
                    <td>{sd.distributor_count ?? 0}</td>
                    <td>{sd.direct_school_count ?? 0}</td>
                    <td><span className={`badge ${sd.is_active ? 'badge-success' : 'badge-danger'}`}>{sd.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <button className="btn-icon" title="Edit" onClick={() => openEditSd(sd)}><i className="fas fa-edit"></i></button>
                      <button className="btn-icon" title="Deactivate" onClick={() => handleDeleteSd(sd)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Distributor Modal ── */}
      {showAddDistModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowAddDistModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-user-tie" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Add Distributor</h3>
              <button className="modal-close" onClick={() => setShowAddDistModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <ErrBox msg={error} />}
              <div className="form-row form-row-2">
                <Field label="Full Name *" value={distForm.name} onChange={v => setDistForm(p => ({ ...p, name: v }))} />
                <Field label="Email *" value={distForm.email} onChange={v => setDistForm(p => ({ ...p, email: v }))} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Mobile" value={distForm.mobile} onChange={v => setDistForm(p => ({ ...p, mobile: v }))} />
                <Field label="City" value={distForm.city} onChange={v => setDistForm(p => ({ ...p, city: v }))} />
                <Field label="District" value={distForm.district} onChange={v => setDistForm(p => ({ ...p, district: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Area of Operation" value={distForm.area_of_operation} onChange={v => setDistForm(p => ({ ...p, area_of_operation: v }))} />
                <Field label="Commission Rate (%)" value={distForm.commission_rate} onChange={v => setDistForm(p => ({ ...p, commission_rate: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="PAN Card Number" value={distForm.pan_number} onChange={v => setDistForm(p => ({ ...p, pan_number: v.toUpperCase() }))} placeholder="ABCDE1234F" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>Payout Bank Details</div>
              <div className="form-row form-row-2">
                <Field label="Account Holder Name" value={distForm.bank_account_holder} onChange={v => setDistForm(p => ({ ...p, bank_account_holder: v }))} />
                <Field label="Bank Name" value={distForm.bank_name} onChange={v => setDistForm(p => ({ ...p, bank_name: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Account Number" value={distForm.bank_account_number} onChange={v => setDistForm(p => ({ ...p, bank_account_number: v }))} />
                <Field label="IFSC Code" value={distForm.bank_ifsc} onChange={v => setDistForm(p => ({ ...p, bank_ifsc: v.toUpperCase() }))} placeholder="SBIN0001234" />
              </div>
              <div className="form-row form-row-2">
                <Field label="Password" value={distForm.password} onChange={v => setDistForm(p => ({ ...p, password: v }))} type="password" placeholder="Leave blank to email a setup link" />
                <Field label="Confirm Password" value={distForm.confirmPassword} onChange={v => setDistForm(p => ({ ...p, confirmPassword: v }))} type="password" />
              </div>
              <div className="form-hint">{distForm.password ? 'The distributor can log in with this password.' : 'A password setup email will be sent automatically.'}</div>
              <div className="form-hint" style={{ marginTop: 4 }}>Profile photo can be added after the distributor is created, from Edit.</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddDistModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveDist} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Distributor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Distributor Modal ── */}
      {showEditDistModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowEditDistModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Edit Distributor</h3>
              <button className="modal-close" onClick={() => setShowEditDistModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <ErrBox msg={error} />}

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)',
                }}>
                  {distAvatarUrl
                    ? <img src={avatarToUrl(distAvatarUrl)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <i className="fas fa-user" style={{ fontSize: 24, color: 'var(--text-light)' }}></i>}
                </div>
                <div>
                  <input ref={distAvatarInputRef} type="file" accept="image/*" onChange={handleDistAvatarChange} style={{ display: 'none' }} id="dist-admin-avatar-input" />
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => distAvatarInputRef.current?.click()} disabled={uploadingDistAvatar}>
                    {uploadingDistAvatar ? 'Uploading...' : 'Change Photo'}
                  </button>
                </div>
              </div>

              <div className="form-row form-row-2">
                <Field label="Full Name *" value={editDistForm.name} onChange={v => setEditDistForm(p => ({ ...p, name: v }))} />
                <Field label="Mobile" value={editDistForm.mobile} onChange={v => setEditDistForm(p => ({ ...p, mobile: v }))} />
              </div>
              <div className="form-row form-row-3">
                <Field label="City" value={editDistForm.city} onChange={v => setEditDistForm(p => ({ ...p, city: v }))} />
                <Field label="District" value={editDistForm.district} onChange={v => setEditDistForm(p => ({ ...p, district: v }))} />
                <Field label="Commission Rate (%)" value={editDistForm.commission_rate} onChange={v => setEditDistForm(p => ({ ...p, commission_rate: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Area of Operation" value={editDistForm.area_of_operation} onChange={v => setEditDistForm(p => ({ ...p, area_of_operation: v }))} />
                <Field label="PAN Card Number" value={editDistForm.pan_number} onChange={v => setEditDistForm(p => ({ ...p, pan_number: v.toUpperCase() }))} placeholder="ABCDE1234F" />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={editDistForm.address || ''} onChange={e => setEditDistForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>Payout Bank Details</div>
              <div className="form-row form-row-2">
                <Field label="Account Holder Name" value={editDistForm.bank_account_holder} onChange={v => setEditDistForm(p => ({ ...p, bank_account_holder: v }))} />
                <Field label="Bank Name" value={editDistForm.bank_name} onChange={v => setEditDistForm(p => ({ ...p, bank_name: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Account Number" value={editDistForm.bank_account_number} onChange={v => setEditDistForm(p => ({ ...p, bank_account_number: v }))} />
                <Field label="IFSC Code" value={editDistForm.bank_ifsc} onChange={v => setEditDistForm(p => ({ ...p, bank_ifsc: v.toUpperCase() }))} placeholder="SBIN0001234" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={Boolean(editDistForm.is_active)} onChange={e => setEditDistForm(p => ({ ...p, is_active: e.target.checked }))} />
                Account active
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditDistModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEditDist} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Super Distributor Modal ── */}
      {showAddSdModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowAddSdModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-users-cog" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Add Super Distributor</h3>
              <button className="modal-close" onClick={() => setShowAddSdModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <ErrBox msg={error} />}
              <div className="form-row form-row-2">
                <Field label="Full Name *" value={sdForm.name} onChange={v => setSdForm(p => ({ ...p, name: v }))} />
                <Field label="Email *" value={sdForm.email} onChange={v => setSdForm(p => ({ ...p, email: v }))} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Mobile" value={sdForm.mobile} onChange={v => setSdForm(p => ({ ...p, mobile: v }))} />
                <Field label="City" value={sdForm.city} onChange={v => setSdForm(p => ({ ...p, city: v }))} />
                <Field label="District *" value={sdForm.district} onChange={v => setSdForm(p => ({ ...p, district: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Area of Operation" value={sdForm.area_of_operation} onChange={v => setSdForm(p => ({ ...p, area_of_operation: v }))} />
                <Field label="Commission Rate (%)" value={sdForm.commission_rate} onChange={v => setSdForm(p => ({ ...p, commission_rate: v }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={sdForm.address} onChange={e => setSdForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="PAN Card Number" value={sdForm.pan_number} onChange={v => setSdForm(p => ({ ...p, pan_number: v.toUpperCase() }))} placeholder="ABCDE1234F" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>Payout Bank Details</div>
              <div className="form-row form-row-2">
                <Field label="Account Holder Name" value={sdForm.bank_account_holder} onChange={v => setSdForm(p => ({ ...p, bank_account_holder: v }))} />
                <Field label="Bank Name" value={sdForm.bank_name} onChange={v => setSdForm(p => ({ ...p, bank_name: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Account Number" value={sdForm.bank_account_number} onChange={v => setSdForm(p => ({ ...p, bank_account_number: v }))} />
                <Field label="IFSC Code" value={sdForm.bank_ifsc} onChange={v => setSdForm(p => ({ ...p, bank_ifsc: v.toUpperCase() }))} placeholder="SBIN0001234" />
              </div>
              <div className="form-row form-row-2">
                <Field label="Password" value={sdForm.password} onChange={v => setSdForm(p => ({ ...p, password: v }))} type="password" placeholder="Leave blank to email a setup link" />
                <Field label="Confirm Password" value={sdForm.confirmPassword} onChange={v => setSdForm(p => ({ ...p, confirmPassword: v }))} type="password" />
              </div>
              <div className="form-hint">{sdForm.password ? 'They can log in with this password.' : 'A password setup email will be sent automatically.'}</div>
              <div className="form-hint" style={{ marginTop: 4 }}>Profile photo can be added after the super distributor is created, from Edit.</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddSdModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveSd} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Super Distributor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Super Distributor Modal ── */}
      {showEditSdModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowEditSdModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Edit Super Distributor</h3>
              <button className="modal-close" onClick={() => setShowEditSdModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <ErrBox msg={error} />}

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)',
                }}>
                  {sdAvatarUrl
                    ? <img src={avatarToUrl(sdAvatarUrl)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <i className="fas fa-user" style={{ fontSize: 24, color: 'var(--text-light)' }}></i>}
                </div>
                <div>
                  <input ref={sdAvatarInputRef} type="file" accept="image/*" onChange={handleSdAvatarChange} style={{ display: 'none' }} id="sd-admin-avatar-input" />
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => sdAvatarInputRef.current?.click()} disabled={uploadingSdAvatar}>
                    {uploadingSdAvatar ? 'Uploading...' : 'Change Photo'}
                  </button>
                </div>
              </div>

              <div className="form-row form-row-2">
                <Field label="Full Name *" value={editSdForm.name} onChange={v => setEditSdForm(p => ({ ...p, name: v }))} />
                <Field label="Mobile" value={editSdForm.mobile} onChange={v => setEditSdForm(p => ({ ...p, mobile: v }))} />
              </div>
              <div className="form-row form-row-3">
                <Field label="City" value={editSdForm.city} onChange={v => setEditSdForm(p => ({ ...p, city: v }))} />
                <Field label="District *" value={editSdForm.district} onChange={v => setEditSdForm(p => ({ ...p, district: v }))} />
                <Field label="Commission Rate (%)" value={editSdForm.commission_rate} onChange={v => setEditSdForm(p => ({ ...p, commission_rate: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Area of Operation" value={editSdForm.area_of_operation} onChange={v => setEditSdForm(p => ({ ...p, area_of_operation: v }))} />
                <Field label="PAN Card Number" value={editSdForm.pan_number} onChange={v => setEditSdForm(p => ({ ...p, pan_number: v.toUpperCase() }))} placeholder="ABCDE1234F" />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={editSdForm.address || ''} onChange={e => setEditSdForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>Payout Bank Details</div>
              <div className="form-row form-row-2">
                <Field label="Account Holder Name" value={editSdForm.bank_account_holder} onChange={v => setEditSdForm(p => ({ ...p, bank_account_holder: v }))} />
                <Field label="Bank Name" value={editSdForm.bank_name} onChange={v => setEditSdForm(p => ({ ...p, bank_name: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Account Number" value={editSdForm.bank_account_number} onChange={v => setEditSdForm(p => ({ ...p, bank_account_number: v }))} />
                <Field label="IFSC Code" value={editSdForm.bank_ifsc} onChange={v => setEditSdForm(p => ({ ...p, bank_ifsc: v.toUpperCase() }))} placeholder="SBIN0001234" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={Boolean(editSdForm.is_active)} onChange={e => setEditSdForm(p => ({ ...p, is_active: e.target.checked }))} />
                Account active
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditSdModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEditSd} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type={type} className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ErrBox({ msg }) {
  return <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{msg}</div>;
}
