import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

export default function DistDashboard() {
  const [profile, setProfile] = useState(null);
  const [schools, setSchools] = useState([]);
  const [commission, setCommission] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [profileRes, schoolsRes, commissionRes] = await Promise.all([
          api.get('/distributors/me'), api.get('/distributors/me/schools'), api.get('/distributors/me/commission')
        ]);
        setProfile(profileRes.data.distributor);
        setSchools(schoolsRes.data.schools);
        setCommission(commissionRes.data);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <Layout role="distributor"><div className="page-content">Loading...</div></Layout>;

  const active = schools.filter(s => s.status === 'active').length;
  const pending = schools.filter(s => s.status === 'pending').length;
  const rejected = schools.filter(s => s.status === 'rejected').length;

  return (
    <Layout role="distributor">
      <div className="page-header">
        <div><h2>Hello, {profile?.name}!</h2><p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Overview of your account</p></div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => navigate('/dist-schools')}><i className="fas fa-plus"></i> Add School</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="fa-school" color="var(--primary)" bg="rgba(26,111,212,.1)" value={schools.length} label="Total Schools" />
        <StatCard icon="fa-check-circle" color="var(--success)" bg="rgba(16,185,129,.1)" value={active} label="Approved" />
        <StatCard icon="fa-clock" color="var(--warning)" bg="rgba(245,158,11,.1)" value={pending} label="Pending" />
        <StatCard icon="fa-times-circle" color="var(--danger)" bg="rgba(239,68,68,.1)" value={rejected} label="Rejected" />
      </div>

      <div className="card" style={{ marginTop: 20, background: 'linear-gradient(135deg,#0F1E3D,#1A6FD4)', color: '#fff', border: 'none' }}>
        <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 4 }}>Total Commission</div>
            <div style={{ fontSize: 32, fontWeight: 800 }}>₹{(commission?.totalCommission || 0).toLocaleString('en-IN')}</div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>Calculated at {commission?.commissionRate}% rate</div>
          </div>
          <button className="btn" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }} onClick={() => navigate('/dist-commission')}>View Details</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h3 className="card-title">Recent Schools</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/dist-schools')}>View All</button>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>School Name</th><th>City</th><th>District</th><th>Status</th></tr></thead>
            <tbody>
              {schools.slice(0, 6).length === 0 ? (
                <tr><td colSpan={4}>No schools added yet.</td></tr>
              ) : schools.slice(0, 6).map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td><td>{s.city || '-'}</td><td>{s.district || '-'}</td>
                  <td><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon, color, bg, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg }}><i className={`fas ${icon}`} style={{ color }}></i></div>
      <div className="stat-content"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = { active: ['badge-success', 'Active'], pending: ['badge-warning', 'Pending'], rejected: ['badge-danger', 'Rejected'], suspended: ['badge-danger', 'Suspended'] };
  const [cls, label] = map[status] || ['badge-warning', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
