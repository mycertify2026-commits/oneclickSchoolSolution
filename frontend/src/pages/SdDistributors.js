import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

const BLANK = { name: '', email: '', mobile: '', city: '', district: '', address: '', commission_rate: '10', password: '', confirmPassword: '' };

export default function SdDistributors() {
  const [distributors, setDistributors] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDist, setEditingDist] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const res = await api.get('/super-distributors/me/distributors');
    setDistributors(res.data.distributors);
  }, []);

  useEffect(() => { load(); }, [load]);

  function hc(field, value) { setForm(p => ({ ...p, [field]: value })); }

  async function handleAdd() {
    setError('');
    if (!form.name || !form.email) { setError('Name and email are required'); return; }
    if (form.password) {
      if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    }
    setSaving(true);
    try {
      await api.post('/super-distributors/me/distributors', form);
      setShowAddModal(false);
      setForm(BLANK);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create distributor');
    } finally { setSaving(false); }
  }

  function openEdit(d) {
    setEditingDist(d);
    setEditForm({ name: d.name, mobile: d.mobile || '', city: d.city || '', district: d.district || '', address: d.address || '', commission_rate: d.commission_rate, is_active: d.is_active });
    setError('');
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    setError('');
    if (!editForm.name?.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/super-distributors/me/distributors/${editingDist.id}`, editForm);
      setShowEditModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update distributor');
    } finally { setSaving(false); }
  }

  async function handleDelete(d) {
    if (!window.confirm(`Delete distributor "${d.name}"?`)) return;
    try {
      await api.delete(`/super-distributors/me/distributors/${d.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete distributor');
    }
  }

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div><h1 className="page-title">Distributors</h1><p className="page-subtitle">Distributors under your supervision</p></div>
        <button className="btn btn-primary" onClick={() => { setForm(BLANK); setError(''); setShowAddModal(true); }}><i className="fas fa-plus"></i> Add Distributor</button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Mobile</th><th>District</th><th>Commission</th><th>Schools</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {distributors.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No distributors yet.</td></tr>
              ) : distributors.map(d => (
                <tr key={d.id}>
                  <td>
                    <button className="btn-link" style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                      onClick={() => navigate(`/sd-distributors/${d.id}`)}>
                      {d.name}
                    </button>
                  </td>
                  <td>{d.email}</td>
                  <td>{d.mobile || '—'}</td>
                  <td>{d.district || '—'}</td>
                  <td>{d.commission_rate}%</td>
                  <td>{d.school_count}</td>
                  <td><span className={`badge ${d.is_active ? 'badge-success' : 'badge-danger'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <button className="btn-icon" title="View" onClick={() => navigate(`/sd-distributors/${d.id}`)}><i className="fas fa-eye"></i></button>
                    <button className="btn-icon" title="Edit" onClick={() => openEdit(d)}><i className="fas fa-edit"></i></button>
                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(d)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowAddModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-user-tie" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Add Distributor</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <Err msg={error} />}
              <div className="form-row form-row-2">
                <F label="Full Name *" value={form.name} onChange={v => hc('name', v)} />
                <F label="Email *" value={form.email} onChange={v => hc('email', v)} />
              </div>
              <div className="form-row form-row-3">
                <F label="Mobile" value={form.mobile} onChange={v => hc('mobile', v)} />
                <F label="City" value={form.city} onChange={v => hc('city', v)} />
                <F label="District" value={form.district} onChange={v => hc('district', v)} />
              </div>
              <div className="form-row form-row-2">
                <F label="Commission Rate (%)" value={form.commission_rate} onChange={v => hc('commission_rate', v)} />
              </div>
              <div className="form-row form-row-2">
                <F label="Password" value={form.password} onChange={v => hc('password', v)} type="password" />
                <F label="Confirm Password" value={form.confirmPassword} onChange={v => hc('confirmPassword', v)} type="password" />
              </div>
              <div className="form-hint">{form.password ? 'Distributor can log in with this password.' : 'Leave blank to email a password setup link.'}</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Distributor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowEditModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Edit Distributor</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <Err msg={error} />}
              <div className="form-row form-row-2">
                <F label="Full Name *" value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} />
                <F label="Mobile" value={editForm.mobile} onChange={v => setEditForm(p => ({ ...p, mobile: v }))} />
              </div>
              <div className="form-row form-row-3">
                <F label="City" value={editForm.city} onChange={v => setEditForm(p => ({ ...p, city: v }))} />
                <F label="District" value={editForm.district} onChange={v => setEditForm(p => ({ ...p, district: v }))} />
                <F label="Commission Rate (%)" value={editForm.commission_rate} onChange={v => setEditForm(p => ({ ...p, commission_rate: v }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={editForm.address || ''} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={Boolean(editForm.is_active)} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} />
                Account active
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function F({ label, value, onChange, type = 'text' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type={type} className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function Err({ msg }) {
  return <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{msg}</div>;
}
