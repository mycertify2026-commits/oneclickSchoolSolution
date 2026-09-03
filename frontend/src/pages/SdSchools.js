import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { StatusBadge } from './SdDashboard';
import GeoPhotoCapture from '../components/GeoPhotoCapture';
import api from '../api/client';

const BLANK = {
  name: '', adminName: '', adminEmail: '', adminMobile: '',
  udise_code: '', village: '', city: '', district: '', taluka: '',
  pin_code: '', phone: '', medium: '', board: '', distributorId: '', class_from: '', class_to: ''
};

export default function SdSchools() {
  const [schools, setSchools] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [form, setForm] = useState(BLANK);
  const [insidePhoto, setInsidePhoto] = useState(null);
  const [outsidePhoto, setOutsidePhoto] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [schRes, distRes] = await Promise.all([
      api.get('/super-distributors/me/schools'),
      api.get('/super-distributors/me/distributors')
    ]);
    setSchools(schRes.data.schools);
    setDistributors(distRes.data.distributors);
  }, []);

  useEffect(() => { load(); }, [load]);

  function hc(field, value) { setForm(p => ({ ...p, [field]: value })); }

  async function handleAdd() {
    setError('');
    if (!form.name || !form.adminName || !form.adminEmail) { setError('School name, admin name and admin email are required'); return; }
    if (!insidePhoto) { setError('Please upload the geo-tagged inside photo of the school.'); return; }
    if (!outsidePhoto) { setError('Please upload the geo-tagged outside photo of the school.'); return; }
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v || ''));
      data.append('insidePhoto', insidePhoto.file);
      data.append('insideLat', insidePhoto.lat);
      data.append('insideLng', insidePhoto.lng);
      data.append('outsidePhoto', outsidePhoto.file);
      data.append('outsideLat', outsidePhoto.lat);
      data.append('outsideLng', outsidePhoto.lng);
      await api.post('/super-distributors/me/schools', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setShowModal(false);
      setForm(BLANK);
      setInsidePhoto(null);
      setOutsidePhoto(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add school');
    } finally { setSaving(false); }
  }

  function openEdit(s) {
    setEditingSchool(s);
    setEditForm({ name: s.name, udise_code: s.udise_code || '', city: s.city || '', district: s.district || '', taluka: s.taluka || '', pin_code: s.pin_code || '', phone: s.phone || '', medium: s.medium || '', board: s.board || '', class_from: s.class_from || '', class_to: s.class_to || '' });
    setError('');
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    setError('');
    if (!editForm.name?.trim()) { setError('School name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/super-distributors/me/schools/${editingSchool.id}`, editForm);
      setShowEditModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update school');
    } finally { setSaving(false); }
  }

  async function handleDelete(s) {
    if (!window.confirm(`Withdraw "${s.name}"? Only pending schools can be withdrawn.`)) return;
    try {
      await api.delete(`/super-distributors/me/schools/${s.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete school');
    }
  }

  const TABS = [
    { key: '', label: 'All' }, { key: 'pending', label: 'Pending' },
    { key: 'active', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }
  ];

  const visible = filter ? schools.filter(s => s.status === filter) : schools;

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div><h1 className="page-title">Schools</h1><p className="page-subtitle">All schools under your supervision</p></div>
        <button className="btn btn-primary" onClick={() => { setForm(BLANK); setError(''); setShowModal(true); }}><i className="fas fa-plus"></i> Add School</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map(tab => (
          <button key={tab.key} className={`btn btn-sm ${filter === tab.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(tab.key)}>{tab.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School Name</th><th>Admin Name</th><th>Distributor</th><th>District</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No schools found.</td></tr>
              ) : visible.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.admin_name || '—'}</td>
                  <td>{s.distributor_name || <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Direct</span>}</td>
                  <td>{s.district || '—'}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <button className="btn-icon" title="Edit" onClick={() => openEdit(s)}><i className="fas fa-edit"></i></button>
                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(s)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add School Modal */}
      {showModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-school" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Add School</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {error && <Err msg={error} />}
              <div className="form-row form-row-2">
                <F label="School Name *" value={form.name} onChange={v => hc('name', v)} />
                <F label="U-DISE Code" value={form.udise_code} onChange={v => hc('udise_code', v)} />
              </div>
              <div className="form-row form-row-3">
                <F label="City" value={form.city} onChange={v => hc('city', v)} />
                <F label="District" value={form.district} onChange={v => hc('district', v)} />
                <F label="Taluka" value={form.taluka} onChange={v => hc('taluka', v)} />
              </div>
              <div className="form-row form-row-2">
                <F label="Phone" value={form.phone} onChange={v => hc('phone', v)} />
                <F label="Medium" value={form.medium} onChange={v => hc('medium', v)} />
              </div>
              <div className="form-row form-row-2">
                <F label="Lower Class" value={form.class_from} onChange={v => hc('class_from', v)} placeholder="e.g. 1st" />
                <F label="Upper Class" value={form.class_to} onChange={v => hc('class_to', v)} placeholder="e.g. 10th" />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Assign Distributor (optional)</label>
                  <select className="form-control" value={form.distributorId} onChange={e => hc('distributorId', e.target.value)}>
                    <option value="">— Direct (no distributor) —</option>
                    {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>School Admin</div>
              <div className="form-row form-row-2">
                <F label="Admin Name *" value={form.adminName} onChange={v => hc('adminName', v)} />
                <F label="Admin Email *" value={form.adminEmail} onChange={v => hc('adminEmail', v)} />
              </div>
              <div className="form-row form-row-2">
                <F label="Admin Mobile" value={form.adminMobile} onChange={v => hc('adminMobile', v)} />
              </div>
              <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>
                School Verification Photos <span style={{ fontWeight: 400 }}>(required, geo-tagged)</span>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <GeoPhotoCapture label="School Inside Photo" value={insidePhoto} onChange={setInsidePhoto} />
                <GeoPhotoCapture label="School Outside Photo" value={outsidePhoto} onChange={setOutsidePhoto} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Submit for Approval'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit School Modal */}
      {showEditModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowEditModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Edit School</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <Err msg={error} />}
              <div className="form-row form-row-2">
                <F label="School Name *" value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} />
                <F label="U-DISE Code" value={editForm.udise_code} onChange={v => setEditForm(p => ({ ...p, udise_code: v }))} />
              </div>
              <div className="form-row form-row-3">
                <F label="City" value={editForm.city} onChange={v => setEditForm(p => ({ ...p, city: v }))} />
                <F label="District" value={editForm.district} onChange={v => setEditForm(p => ({ ...p, district: v }))} />
                <F label="Taluka" value={editForm.taluka} onChange={v => setEditForm(p => ({ ...p, taluka: v }))} />
              </div>
              <div className="form-row form-row-2">
                <F label="Phone" value={editForm.phone} onChange={v => setEditForm(p => ({ ...p, phone: v }))} />
                <F label="Medium" value={editForm.medium} onChange={v => setEditForm(p => ({ ...p, medium: v }))} />
              </div>
              <div className="form-row form-row-2">
                <F label="Lower Class" value={editForm.class_from} onChange={v => setEditForm(p => ({ ...p, class_from: v }))} placeholder="e.g. 1st" />
                <F label="Upper Class" value={editForm.class_to} onChange={v => setEditForm(p => ({ ...p, class_to: v }))} placeholder="e.g. 10th" />
              </div>
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

function F({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type={type} className="form-control" value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Err({ msg }) {
  return <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{msg}</div>;
}
