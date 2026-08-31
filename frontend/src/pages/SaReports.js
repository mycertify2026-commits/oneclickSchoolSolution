import { useState, useEffect } from 'react';
import { Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Legend } from 'chart.js';
import Layout from '../components/Layout';
import api from '../api/client';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Legend);

export default function SaReports() {
  const [overview, setOverview] = useState(null);
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [certByType, setCertByType] = useState([]);
  const [topSchools, setTopSchools] = useState([]);
  const [distPerformance, setDistPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ov, rev, cert, top, dist] = await Promise.all([
          api.get('/reports/overview'),
          api.get('/reports/revenue', { params: { months: 6 } }),
          api.get('/reports/certificates-by-type'),
          api.get('/reports/top-schools', { params: { limit: 10 } }),
          api.get('/reports/distributor-performance')
        ]);
        setOverview(ov.data);
        setRevenueTrend(rev.data.trend);
        setCertByType(cert.data.breakdown);
        setTopSchools(top.data.schools);
        setDistPerformance(dist.data.distributors);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleExportUsers() {
    try {
      const res = await api.get('/reports/export-users', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `users-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
    } catch (err) {
      alert('Export failed. Please try again.');
    }
  }

  if (loading) return <Layout role="superAdmin"><div>Loading...</div></Layout>;

  const revenueChartData = {
    labels: revenueTrend.map(r => r.month),
    datasets: [{ label: 'Revenue (₹)', data: revenueTrend.map(r => r.revenue), borderColor: '#1A6FD4', backgroundColor: 'rgba(26,111,212,.1)', tension: 0.4, fill: true }]
  };
  const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card' };
  const certPieData = {
    labels: certByType.map(c => TYPE_LABELS[c.type] || c.type),
    datasets: [{ data: certByType.map(c => c.count), backgroundColor: ['#1A6FD4', '#10B981', '#F59E0B'] }]
  };
  const commissionByMonth = overview.earnings.byMonth || [];
  const commissionChartData = {
    labels: commissionByMonth.map(r => r.month),
    datasets: [{ label: 'Super Admin Commission (₹)', data: commissionByMonth.map(r => r.total), borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,.1)', tension: 0.4, fill: true }]
  };

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h2>Reports</h2><p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Platform-wide analytics</p></div>
        <div className="page-header-actions">
          <button className="btn btn-outline" onClick={handleExportUsers}><i className="fas fa-file-export"></i> Export Users</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="fa-school" color="var(--primary)" bg="rgba(26,111,212,.1)" value={overview.schools.total} label="Total Schools" />
        <StatCard icon="fa-certificate" color="var(--success)" bg="rgba(16,185,129,.1)" value={overview.certificates.total} label="Certificates Issued" />
        <StatCard icon="fa-rupee-sign" color="#7c3aed" bg="rgba(124,58,237,.1)" value={`₹${overview.certificates.revenue.toLocaleString('en-IN')}`} label="Total Revenue" />
        <StatCard icon="fa-wallet" color="#f97316" bg="rgba(249,115,22,.1)" value={`₹${overview.wallets.totalBalance.toLocaleString('en-IN')}`} label="Wallet Balance (all schools)" />
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-chart-line" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Revenue Trend (6 months)</h3></div>
          <div className="card-body"><div className="chart-container"><Line data={revenueChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div></div>
        </div>
        <div className="card">
          <div className="card-header"><h3><i className="fas fa-chart-pie" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Certificates by Type</h3></div>
          <div className="card-body"><div className="chart-container"><Pie data={certPieData} options={{ maintainAspectRatio: false }} /></div></div>
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-chart-line" style={{ color: '#7c3aed', marginRight: 8 }}></i>Super Admin Commission Trend (6 months)</h3></div>
        <div className="card-body">
          {commissionByMonth.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No commission data yet.</p>
          ) : (
            <div className="chart-container"><Line data={commissionChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          )}
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3><i className="fas fa-trophy" style={{ color: 'var(--warning)', marginRight: 8 }}></i>Top Schools by Revenue</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>School</th><th>City</th><th>District</th><th>Certificates</th><th>Revenue</th></tr></thead>
            <tbody>
              {topSchools.length === 0 ? (
                <tr><td colSpan={5}>No data yet.</td></tr>
              ) : topSchools.map(s => (
                <tr key={s.id}><td>{s.name}</td><td>{s.city || '-'}</td><td>{s.district || '-'}</td><td>{s.certificateCount}</td><td>₹{s.revenue.toLocaleString('en-IN')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3><i className="fas fa-user-tie" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Distributor Performance</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Distributor</th><th>Schools</th><th>Commission Rate</th><th>Revenue Generated</th><th>Est. Commission</th></tr></thead>
            <tbody>
              {distPerformance.length === 0 ? (
                <tr><td colSpan={5}>No distributors yet.</td></tr>
              ) : distPerformance.map(d => (
                <tr key={d.id}><td>{d.name}</td><td>{d.schoolCount}</td><td>{d.commissionRate}%</td><td>₹{d.totalRevenue.toLocaleString('en-IN')}</td><td>₹{d.estimatedCommission.toLocaleString('en-IN')}</td></tr>
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
