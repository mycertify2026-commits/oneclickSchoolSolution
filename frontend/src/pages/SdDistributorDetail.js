import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { StatusBadge } from './SdDashboard';
import api from '../api/client';

export default function SdDistributorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [distributor, setDistributor] = useState(null);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/super-distributors/me/distributors/${id}`)
      .then(res => {
        setDistributor(res.data.distributor);
        setSchools(res.data.schools);
      })
      .catch(() => navigate('/sd-distributors'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <Layout role="superDistributor"><div className="page-content">Loading...</div></Layout>;
  if (!distributor) return null;

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/sd-distributors')}><i className="fas fa-arrow-left"></i></button>
          <div>
            <h1 className="page-title">{distributor.name}</h1>
            <p className="page-subtitle">Distributor Details</p>
          </div>
        </div>
      </div>

      {/* Distributor Info Card */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 16 }}>Distributor Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          <InfoRow label="Name" value={distributor.name} />
          <InfoRow label="Email" value={distributor.email} />
          <InfoRow label="Mobile" value={distributor.mobile || '—'} />
          <InfoRow label="City" value={distributor.city || '—'} />
          <InfoRow label="District" value={distributor.district || '—'} />
          <InfoRow label="Commission Rate" value={`${distributor.commission_rate}%`} />
          <InfoRow label="Status" value={distributor.is_active ? '✅ Active' : '❌ Inactive'} />
        </div>
        {distributor.address && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Address</span>
            <p style={{ marginTop: 4 }}>{distributor.address}</p>
          </div>
        )}
      </div>

      {/* Schools Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Schools Added by This Distributor</h3>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{schools.length} school{schools.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School Name</th><th>Admin Name</th><th>Status</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {schools.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No schools yet.</td></tr>
              ) : schools.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.admin_name || '—'}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
