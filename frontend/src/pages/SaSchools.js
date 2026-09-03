import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { StatusBadge } from './SaDashboard';
import api from '../api/client';

const BLANK = { name: '', udise_code: '', city: '', taluka: '', district: '', phone: '', email: '', pin_code: '', medium: 'Marathi', board: 'Maharashtra SSC', distributorId: '', adminName: '', adminMobile: '', adminEmail: '', class_from: '', class_to: '' };

// Long school names get cut to the first word in the list view (hover/title
// shows the rest); the full name is always shown on the school's own detail
// page after clicking through.
function shortName(name) {
  if (!name) return '—';
  const words = String(name).trim().split(/\s+/);
  return (words.length > 1 || name.length > 20) ? words[0] + '…' : name;
}
const EDIT_FIELDS = ['name', 'udise_code', 'village', 'city', 'taluka', 'district', 'pin_code', 'phone', 'email', 'medium', 'board', 'class_from', 'class_to'];

export default function SaSchools() {
  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [distributors, setDistributors] = useState([]);
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [assigningSchool, setAssigningSchool] = useState(null);
  const [assignDistributorId, setAssignDistributorId] = useState('');
  const [form, setForm] = useState(BLANK);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (page = 1) => {
    const res = await api.get('/schools', { params: { page, limit: 50 } });
    setSchools(res.data.schools);
    if (res.data.pagination) setPagination(res.data.pagination);
  }, []);
  const loadDistributors = useCallback(async () => {
    const res = await api.get('/distributors');
    setDistributors(res.data.distributors);
  }, []);

  useEffect(() => { load(1); loadDistributors(); }, [load, loadDistributors]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }
  function handleEditChange(field, value) { setEditForm(prev => ({ ...prev, [field]: value })); }

  async function handleExport() {
    try {
      const res = await api.get('/schools/export', { params: { status: statusFilter || undefined }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `schools-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
    } catch (err) {
      alert('Export failed. Please try again.');
    }
  }

  async function handleSave() {
    setError('');
    if (!form.name || !form.adminName || !form.adminEmail) {
      setError('School name, admin name, and admin email are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/schools', form);
      setShowAddModal(false);
      setForm(BLANK);
      load(pagination.page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save school');
    } finally {
      setSaving(false);
    }
  }

  function openEditModal(school) {
    setEditingSchool(school);
    const initial = {};
    EDIT_FIELDS.forEach(f => { initial[f] = school[f] || ''; });
    setEditForm(initial);
    setError('');
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    setError('');
    if (!editForm.name?.trim()) { setError('School name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/schools/${editingSchool.id}`, editForm);
      setShowEditModal(false);
      load(pagination.page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update school');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(school) {
    if (!window.confirm(`Delete "${school.name}" permanently? This cannot be undone. (Blocked if certificates have been issued.)`)) return;
    try {
      await api.delete(`/schools/${school.id}`);
      load(pagination.page);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete school');
    }
  }

  function openAssignModal(school) {
    setAssigningSchool(school);
    setAssignDistributorId(school.distributor_id || '');
    setShowAssignModal(true);
  }

  async function handleAssignDistributor() {
    try {
      await api.put(`/schools/${assigningSchool.id}/assign-distributor`, { distributorId: assignDistributorId || null });
      setShowAssignModal(false);
      load(pagination.page);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign distributor');
    }
  }

  async function updateStatus(id, status) {
    await api.put(`/schools/${id}/status`, { status });
    load(pagination.page);
  }

  const filtered = schools.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (districtFilter && s.district !== districtFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h2>Schools</h2></div>
        <div className="page-header-actions">
          <button className="btn btn-outline" onClick={handleExport}><i className="fas fa-file-export"></i> Export</button>
          <button className="btn btn-primary" onClick={() => { setForm(BLANK); setError(''); setShowAddModal(true); }}><i className="fas fa-plus"></i> Add School</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="filter-row" style={{ margin: 0, flex: 1 }}>
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder="Search schools..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="filter-select" value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}>
              <option value="">All Districts</option>
              {[...new Set(schools.map(s => s.district).filter(Boolean))].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School Name</th><th>City</th><th>District</th><th>Admin</th><th>Distributor</th><th>Wallet</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}>No schools found.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id}>
                  <td><span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }} title={s.name} onClick={() => navigate(`/sa-schools/${s.id}`)}>{shortName(s.name)}</span></td>
                  <td>{s.city || '-'}</td>
                  <td>{s.district || '-'}</td>
                  <td>{s.admin_name}<br /><span style={{ fontSize: 11, color: 'var(--text-light)' }}>{s.admin_email}</span></td>
                  <td>
                    <span style={{ cursor: 'pointer', color: s.distributor_name ? 'inherit' : 'var(--text-light)' }} onClick={() => openAssignModal(s)} title="Click to reassign">
                      {s.distributor_name || 'Unassigned'} <i className="fas fa-pen" style={{ fontSize: 10, marginLeft: 4, opacity: 0.5 }}></i>
                    </span>
                  </td>
                  <td>₹{Number(s.wallet_balance || 0).toLocaleString('en-IN')}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <button className="btn-icon" title="View Details" onClick={() => navigate(`/sa-schools/${s.id}`)}><i className="fas fa-eye"></i></button>
                    <button className="btn-icon" title="Edit" onClick={() => openEditModal(s)}><i className="fas fa-edit"></i></button>
                    {s.status === 'pending' && (
                      <>
                        <button className="btn-icon" title="Approve" onClick={() => updateStatus(s.id, 'active')}><i className="fas fa-check" style={{ color: 'var(--success)' }}></i></button>
                        <button className="btn-icon" title="Reject" onClick={() => updateStatus(s.id, 'rejected')}><i className="fas fa-times" style={{ color: 'var(--danger)' }}></i></button>
                      </>
                    )}
                    {s.status === 'active' && (
                      <button className="btn-icon" title="Suspend" onClick={() => updateStatus(s.id, 'suspended')}><i className="fas fa-pause" style={{ color: 'var(--warning)' }}></i></button>
                    )}
                    {s.status === 'suspended' && (
                      <button className="btn-icon" title="Reactivate" onClick={() => updateStatus(s.id, 'active')}><i className="fas fa-play" style={{ color: 'var(--success)' }}></i></button>
                    )}
                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(s)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 16 }}>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={`btn btn-sm ${p === pagination.page ? 'btn-primary' : 'btn-outline'}`} onClick={() => load(p)}>{p}</button>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowAddModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-school" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Add School</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
              <div className="form-section">
                <div className="form-section-title"><i className="fas fa-info-circle"></i><h4>School Information</h4></div>
                <div className="form-row form-row-2">
                  <Field label="School Name *" value={form.name} onChange={v => handleChange('name', v)} />
                  <Field label="U-DISE Number" value={form.udise_code} onChange={v => handleChange('udise_code', v)} placeholder="MH27010001" />
                </div>
                <div className="form-row form-row-3">
                  <Field label="City" value={form.city} onChange={v => handleChange('city', v)} />
                  <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
                  <Field label="District" value={form.district} onChange={v => handleChange('district', v)} />
                </div>
                <div className="form-row form-row-3">
                  <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
                  <Field label="Email" value={form.email} onChange={v => handleChange('email', v)} />
                  <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
                </div>
                <div className="form-row form-row-3">
                  <SelectField label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} options={['Marathi', 'English', 'Hindi', 'Semi-English']} />
                  <SelectField label="Board" value={form.board} onChange={v => handleChange('board', v)} options={['Maharashtra SSC', 'CBSE', 'ICSE']} />
                  <div className="form-group">
                    <label className="form-label">Assign Distributor</label>
                    <select className="form-select" value={form.distributorId} onChange={e => handleChange('distributorId', e.target.value)}>
                      <option value="">-- None --</option>
                      {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row form-row-2">
                  <Field label="Lower Class" value={form.class_from} onChange={v => handleChange('class_from', v)} placeholder="e.g. 1st" />
                  <Field label="Upper Class" value={form.class_to} onChange={v => handleChange('class_to', v)} placeholder="e.g. 10th" />
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-title"><i className="fas fa-user"></i><h4>School Admin Details</h4></div>
                <div className="form-row form-row-3">
                  <Field label="Admin Name *" value={form.adminName} onChange={v => handleChange('adminName', v)} placeholder="Principal Name" />
                  <Field label="Mobile" value={form.adminMobile} onChange={v => handleChange('adminMobile', v)} placeholder="9876543210" />
                  <Field label="Admin Email *" value={form.adminEmail} onChange={v => handleChange('adminEmail', v)} placeholder="admin@school.in" />
                </div>
                <div className="form-hint">A password setup email will be sent to this address automatically.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save School'}</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowEditModal(false)}>
          <div className="modal-box modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Edit School - {editingSchool?.name}</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
              <div className="form-row form-row-2">
                <Field label="School Name *" value={editForm.name} onChange={v => handleEditChange('name', v)} />
                <Field label="U-DISE Number" value={editForm.udise_code} onChange={v => handleEditChange('udise_code', v)} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Village" value={editForm.village} onChange={v => handleEditChange('village', v)} />
                <Field label="City" value={editForm.city} onChange={v => handleEditChange('city', v)} />
                <Field label="Taluka" value={editForm.taluka} onChange={v => handleEditChange('taluka', v)} />
              </div>
              <div className="form-row form-row-3">
                <Field label="District" value={editForm.district} onChange={v => handleEditChange('district', v)} />
                <Field label="PIN Code" value={editForm.pin_code} onChange={v => handleEditChange('pin_code', v)} />
                <Field label="Phone" value={editForm.phone} onChange={v => handleEditChange('phone', v)} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Email" value={editForm.email} onChange={v => handleEditChange('email', v)} />
                <Field label="Medium" value={editForm.medium} onChange={v => handleEditChange('medium', v)} />
                <Field label="Board" value={editForm.board} onChange={v => handleEditChange('board', v)} />
              </div>
              <div className="form-row form-row-2">
                <Field label="Lower Class" value={editForm.class_from} onChange={v => handleEditChange('class_from', v)} placeholder="e.g. 1st" />
                <Field label="Upper Class" value={editForm.class_to} onChange={v => handleEditChange('class_to', v)} placeholder="e.g. 10th" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowAssignModal(false)}>
          <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Distributor</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>For school: <strong>{assigningSchool?.name}</strong></p>
              <div className="form-group">
                <label className="form-label">Distributor</label>
                <select className="form-select" value={assignDistributorId} onChange={e => setAssignDistributorId(e.target.value)}>
                  <option value="">-- None (Direct) --</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssignDistributor}>Save</button>
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
      <input type="text" className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function SelectField({ label, value, onChange, options }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
