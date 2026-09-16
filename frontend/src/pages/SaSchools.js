import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { StatusBadge } from './SaDashboard';
import api from '../api/client';

// Long school names get cut to the first word in the list view (hover/title
// shows the rest); the full name is always shown on the school's own detail
// page after clicking through.
function shortName(name) {
  if (!name) return '—';
  const words = String(name).trim().split(/\s+/);
  return (words.length > 1 || name.length > 20) ? words[0] + '…' : name;
}

export default function SaSchools() {
  const [schools, setSchools] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [distributors, setDistributors] = useState([]);
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningSchool, setAssigningSchool] = useState(null);
  const [assignDistributorId, setAssignDistributorId] = useState('');
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
          <button className="btn btn-primary" onClick={() => navigate('/sa-schools/new')}><i className="fas fa-plus"></i> Add School</button>
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
                    <button className="btn-icon" title="Edit" onClick={() => navigate(`/sa-schools/${s.id}/edit`)}><i className="fas fa-edit"></i></button>
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
                  <option value="">Self (Super Admin — Direct, no distributor)</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {!assignDistributorId && (
                  <div className="form-hint" style={{ marginTop: 4 }}>
                    No distributor assigned — 100% of the platform commission for this school goes to Super Admin.
                  </div>
                )}
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
