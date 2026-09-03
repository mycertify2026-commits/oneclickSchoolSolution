import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { StatusBadge } from './DistDashboard';
import GeoPhotoCapture from '../components/GeoPhotoCapture';
import api from '../api/client';

const BLANK = { name: '', adminName: '', adminEmail: '', adminMobile: '', udise_code: '', village: '', city: '', district: '', taluka: '', pin_code: '', phone: '', medium: '', board: '', class_from: '', class_to: '' };
const TABS = [
  { key: '', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'active', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }
];

export default function DistSchools() {
  const [schools, setSchools] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [form, setForm] = useState(BLANK);
  const [insidePhoto, setInsidePhoto] = useState(null);
  const [outsidePhoto, setOutsidePhoto] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (status) => {
    const res = await api.get('/distributors/me/schools', { params: status ? { status } : {} });
    setSchools(res.data.schools);
  }, []);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  async function submitSchool() {
    setError(''); setSuccess('');
    if (!form.name || !form.adminName || !form.adminEmail) { setError('Please fill in all required information'); return; }
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
      await api.post('/distributors/me/schools', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccess('School submitted successfully! Please wait for approval.');
      setForm(BLANK);
      setInsidePhoto(null);
      setOutsidePhoto(null);
      setShowForm(false);
      setActiveTab('pending');
    } catch (err) {
      setError(err.response?.data?.error || 'Error while adding school');
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(school) {
    setEditingSchool(school);
    setEditForm({
      name: school.name || '', udise_code: school.udise_code || '', village: school.village || '',
      city: school.city || '', taluka: school.taluka || '', district: school.district || '',
      pin_code: school.pin_code || '', phone: school.phone || '', medium: school.medium || '', board: school.board || '',
      class_from: school.class_from || '', class_to: school.class_to || ''
    });
    setError('');
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    setError('');
    if (!editForm.name?.trim()) { setError('School name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/distributors/me/schools/${editingSchool.id}`, editForm);
      setShowEditModal(false);
      load(activeTab);
    } catch (err) {
      setError(err.response?.data?.error || 'Error while updating');
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw(school) {
    if (!window.confirm(`Withdraw the submission for "${school.name}"?`)) return;
    try {
      await api.delete(`/distributors/me/schools/${school.id}`);
      load(activeTab);
    } catch (err) {
      alert(err.response?.data?.error || 'Error while withdrawing');
    }
  }

  return (
    <Layout role="distributor">
      <div className="page-header">
        <div><h1 className="page-title">My Schools</h1><p className="page-subtitle">All schools you have added</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><i className="fas fa-plus"></i> {showForm ? 'Cancel' : 'Add School'}</button>
        </div>
      </div>

      {success && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{success}</div>}

      {showForm ? (
        <div>
          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-school"></i> School Information</div>
            {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
            <div className="form-row form-row-2">
              <Field label="School Name *" value={form.name} onChange={v => handleChange('name', v)} placeholder="Full school name" />
              <Field label="U-DISE Code" value={form.udise_code} onChange={v => handleChange('udise_code', v)} />
            </div>
            <div className="form-row form-row-3">
              <Field label="City/Village *" value={form.city} onChange={v => handleChange('city', v)} />
              <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
              <Field label="District *" value={form.district} onChange={v => handleChange('district', v)} />
            </div>
            <div className="form-row form-row-3">
              <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
              <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
              <Field label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} />
            </div>
            <div className="form-row form-row-2">
              <Field label="Lower Class" value={form.class_from} onChange={v => handleChange('class_from', v)} placeholder="e.g. 1st" />
              <Field label="Upper Class" value={form.class_to} onChange={v => handleChange('class_to', v)} placeholder="e.g. 10th" />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-user-tie"></i> Administrator Information</div>
            <div className="form-row form-row-2">
              <Field label="Principal Name *" value={form.adminName} onChange={v => handleChange('adminName', v)} />
              <Field label="Mobile *" value={form.adminMobile} onChange={v => handleChange('adminMobile', v)} />
            </div>
            <div className="form-row form-row-2">
              <Field label="Email *" value={form.adminEmail} onChange={v => handleChange('adminEmail', v)} />
            </div>
            <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <i className="fas fa-info-circle" style={{ color: '#f59e0b' }}></i> After adding the school, you will need to wait for approval from the Super Admin.
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-camera"></i> School Verification Photos</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8, marginBottom: 12 }}>
              Both photos are required and must be geo-tagged with your current location.
            </p>
            <div style={{ display: 'flex', gap: 24 }}>
              <GeoPhotoCapture label="School Inside Photo" value={insidePhoto} onChange={setInsidePhoto} />
              <GeoPhotoCapture label="School Outside Photo" value={outsidePhoto} onChange={setOutsidePhoto} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSchool} disabled={saving}><i className="fas fa-paper-plane"></i> {saving ? 'Submitting...' : 'Submit for Approval'}</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {TABS.map(tab => (
              <button key={tab.key} className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
            ))}
          </div>

          <div className="school-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {schools.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                <i className="fas fa-school" style={{ fontSize: 48, marginBottom: 12, display: 'block', opacity: 0.3 }}></i>
                No schools in this category
              </div>
            ) : schools.map(s => (
              <div key={s.id} className="school-card" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div className="school-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                  <div className="school-icon" style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(26,111,212,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--primary)', flexShrink: 0 }}>
                    <i className="fas fa-school"></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.city || '-'}, {s.district || '-'}</div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span><i className="fas fa-user"></i> {s.admin_name || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}><i className="fas fa-wallet"></i> ₹{Number(s.wallet_balance || 0).toLocaleString('en-IN')}</span>
                  {s.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-icon" title="Edit" onClick={() => openEditModal(s)}><i className="fas fa-edit"></i></button>
                      <button className="btn-icon" title="Withdraw" onClick={() => handleWithdraw(s)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showEditModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowEditModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Edit School</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
              <div className="form-row form-row-2">
                <Field label="School Name *" value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} />
                <Field label="U-DISE Code" value={editForm.udise_code} onChange={v => setEditForm(p => ({ ...p, udise_code: v }))} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Village" value={editForm.village} onChange={v => setEditForm(p => ({ ...p, village: v }))} />
                <Field label="City" value={editForm.city} onChange={v => setEditForm(p => ({ ...p, city: v }))} />
                <Field label="Taluka" value={editForm.taluka} onChange={v => setEditForm(p => ({ ...p, taluka: v }))} />
              </div>
              <div className="form-row form-row-3">
                <Field label="District" value={editForm.district} onChange={v => setEditForm(p => ({ ...p, district: v }))} />
                <Field label="PIN Code" value={editForm.pin_code} onChange={v => setEditForm(p => ({ ...p, pin_code: v }))} />
                <Field label="Phone" value={editForm.phone} onChange={v => setEditForm(p => ({ ...p, phone: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Medium" value={editForm.medium} onChange={v => setEditForm(p => ({ ...p, medium: v }))} />
                <Field label="Board" value={editForm.board} onChange={v => setEditForm(p => ({ ...p, board: v }))} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Lower Class" value={editForm.class_from} onChange={v => setEditForm(p => ({ ...p, class_from: v }))} placeholder="e.g. 1st" />
                <Field label="Upper Class" value={editForm.class_to} onChange={v => setEditForm(p => ({ ...p, class_to: v }))} placeholder="e.g. 10th" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
