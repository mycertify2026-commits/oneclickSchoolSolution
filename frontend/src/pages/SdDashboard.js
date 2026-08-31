import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import Layout from '../components/Layout';
import api from '../api/client';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

export default function SdDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/super-distributors/me/dashboard')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout role="superDistributor"><div className="page-content">Loading...</div></Layout>;

  const recent = data?.recentSchools || [];
  const flat = data?.flatCommission || { rate: 0, total: 0, byMonth: [] };
  const flatChartData = {
    labels: flat.byMonth.map(r => r.month),
    datasets: [{ label: `Flat Commission (${flat.rate}%)`, data: flat.byMonth.map(r => r.commission), borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,.1)', tension: 0.4, fill: true }]
  };

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div>
          <h2>Super Distributor Dashboard</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Your district-level overview</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => navigate('/sd-schools')}><i className="fas fa-plus"></i> Add School</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="fa-users" color="var(--primary)" bg="rgba(26,111,212,.1)" value={data?.totalDistributors ?? 0} label="Total Distributors" />
        <StatCard icon="fa-school" color="var(--success)" bg="rgba(16,185,129,.1)" value={data?.totalSchools ?? 0} label="Total Schools" />
        <StatCard icon="fa-rupee-sign" color="#f59e0b" bg="rgba(245,158,11,.1)" value={`₹${(data?.revenue ?? 0).toLocaleString('en-IN')}`} label="Revenue" />
        <StatCard icon="fa-clock" color="var(--danger)" bg="rgba(239,68,68,.1)" value={data?.pendingSchools ?? 0} label="Pending Schools" />
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <StatCard icon="fa-hand-holding-usd" color="#7c3aed" bg="rgba(124,58,237,.1)" value={`₹${(data?.earnings?.total ?? 0).toLocaleString('en-IN')}`} label="Platform-Split Earnings" />
        <StatCard icon="fa-percent" color="#10B981" bg="rgba(16,185,129,.1)" value={`₹${flat.total.toLocaleString('en-IN')}`} label={`Flat Commission (${flat.rate}%)`} />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h3 className="card-title">Flat Commission Trend (6 months)</h3></div>
        <div className="card-body">
          {flat.byMonth.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No commission data yet.</p>
          ) : (
            <div className="chart-container"><Line data={flatChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h3 className="card-title">Recently Added Schools</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/sd-schools')}>View All</button>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>School Name</th>
                <th>Distributor Name</th>
                <th>Distributor Phone</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No schools yet.</td></tr>
              ) : recent.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.distributor_name || <span style={{ color: 'var(--text-secondary)' }}>Direct</span>}</td>
                  <td>{s.distributor_phone || '—'}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/sd-schools')}>View</button>
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

function StatCard({ icon, color, bg, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg }}><i className={`fas ${icon}`} style={{ color }}></i></div>
      <div className="stat-content"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active:    ['badge-success', 'Approved'],
    pending:   ['badge-warning', 'Pending'],
    rejected:  ['badge-danger',  'Rejected'],
    suspended: ['badge-danger',  'Suspended'],
  };
  const [cls, label] = map[status] || ['badge-warning', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
