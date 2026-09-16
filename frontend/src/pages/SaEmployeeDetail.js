import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

// Distributor and Super Distributor detail share the same shape closely
// enough (profile + ledger-based commission till date + a monthly trend +
// a breakdown table) to be one page, switched by the :type route param.
export default function SaEmployeeDetail() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const isSd = type === 'super-distributor';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get(isSd ? `/super-distributors/${id}` : `/distributors/${id}`);
      setData(res.data);
    } catch (err) {
      setLoadError(err.response?.data?.error || err.message || 'Failed to load detail');
    } finally {
      setLoading(false);
    }
  }, [id, isSd]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Layout role="superAdmin"><div className="page-content">Loading...</div></Layout>;
  if (loadError || !data) return (
    <Layout role="superAdmin">
      <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        {loadError || 'Not found'}
      </div>
      <Link to="/sa-employees">Back to Employees</Link>
    </Layout>
  );

  const profile = isSd ? data.superDistributor : data.distributor;
  const totalCertificates = isSd ? data.earnings?.totalCertificates ?? 0 : data.totalCertificates ?? 0;
  const totalRevenue = isSd ? data.revenue ?? 0 : data.totalRevenue ?? 0;
  // Ledger-based monthly trend for both roles — the same "real" commission
  // the stat card total comes from, not the separate legacy flat-rate figure.
  const monthly = isSd
    ? (data.earnings?.byMonth || []).map(m => ({ month: m.month, certificateCount: m.count, commission: m.commission }))
    : (data.monthly || []).map(m => ({ month: m.month, certificateCount: m.certificateCount, revenue: m.revenue, commission: m.commission }));
  const breakdown = isSd
    ? (data.earnings?.byDistributor || []).map(r => ({ name: r.name, commission: r.total }))
    : (data.perSchool || []).map(r => ({ name: r.schoolName, commission: r.commission, revenue: r.revenue, certificateCount: r.certificateCount }));

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={() => navigate('/sa-employees')}>
            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
          </button>
          <h2 style={{ margin: 0 }}>{profile.name}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            {isSd ? 'Super Distributor' : 'Distributor'} · {profile.email}
          </p>
        </div>
        <span className={`badge ${profile.is_active ? 'badge-success' : 'badge-danger'}`} style={{ height: 'fit-content' }}>
          {profile.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="stat-grid">
        <StatCard icon="fa-rupee-sign" color="#f59e0b" bg="rgba(245,158,11,.1)" value={`₹${Number(totalRevenue).toLocaleString('en-IN')}`} label="Total Revenue Generated" />
        <StatCard icon="fa-certificate" color="var(--primary)" bg="rgba(26,111,212,.1)" value={totalCertificates} label="Certificates Issued" />
        <StatCard
          icon={isSd ? 'fa-user-tie' : 'fa-school'}
          color="#7c3aed" bg="rgba(124,58,237,.1)"
          value={isSd ? (data.totalDistributors ?? 0) : (profile.school_count ?? 0)}
          label={isSd ? 'Distributors' : 'Schools Assigned'}
        />
      </div>

      <div className="card" style={{ marginTop: 20, padding: 20 }}>
        <h3 style={{ marginBottom: 14 }}>Profile</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, fontSize: 13 }}>
          <InfoRow label="Mobile" value={profile.mobile || '—'} />
          <InfoRow label="City" value={profile.city || '—'} />
          <InfoRow label="District" value={profile.district || '—'} />
          <InfoRow label="Area of Operation" value={profile.area_of_operation || '—'} />
          <InfoRow label="Commission Rate (flat, legacy)" value={profile.commission_rate !== null && profile.commission_rate !== undefined ? `${profile.commission_rate}%` : '—'} />
          {!isSd && <InfoRow label="Reports to (Super Distributor)" value={profile.super_distributor_id ? 'Assigned' : 'Direct (none)'} />}
          <InfoRow label="PAN" value={profile.pan_number || '—'} />
          <InfoRow label="Bank" value={profile.bank_name ? `${profile.bank_name} · ${profile.bank_account_number || ''}` : '—'} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h3 className="card-title">Monthly Commission (last {monthly.length || 0} months)</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Month</th><th>Certificates</th><th>Revenue</th><th>Commission</th></tr></thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>No activity yet.</td></tr>
              ) : monthly.map((m, i) => (
                <tr key={i}>
                  <td>{m.month}</td>
                  <td>{m.certificateCount}</td>
                  <td>₹{Number(m.revenue).toLocaleString('en-IN')}</td>
                  <td style={{ fontWeight: 600, color: '#059669' }}>₹{Number(m.commission).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h3 className="card-title">{isSd ? 'Commission by Distributor' : 'Commission by School'}</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>{isSd ? 'Distributor' : 'School'}</th>{!isSd && <><th>Certificates</th><th>Revenue</th></>}<th>Commission</th></tr></thead>
            <tbody>
              {breakdown.length === 0 ? (
                <tr><td colSpan={isSd ? 2 : 4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>No activity yet.</td></tr>
              ) : breakdown.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  {!isSd && <><td>{r.certificateCount}</td><td>₹{Number(r.revenue).toLocaleString('en-IN')}</td></>}
                  <td style={{ fontWeight: 600, color: '#059669' }}>₹{Number(r.commission).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon, color, bg, value, label, onClick }) {
  return (
    <div className="stat-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="stat-icon" style={{ background: bg }}><i className={`fas ${icon}`} style={{ color }}></i></div>
      <div className="stat-content"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
