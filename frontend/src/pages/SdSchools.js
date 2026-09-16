import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { StatusBadge } from './SdDashboard';
import api from '../api/client';

export default function SdSchools() {
  const [schools, setSchools] = useState([]);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const res = await api.get('/super-distributors/me/schools');
    setSchools(res.data.schools);
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <button className="btn btn-primary" onClick={() => navigate('/sd-schools/new')}><i className="fas fa-plus"></i> Add School</button>
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
                    <button className="btn-icon" title="Edit" onClick={() => navigate(`/sd-schools/${s.id}/edit`, { state: { school: s } })}><i className="fas fa-edit"></i></button>
                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(s)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
