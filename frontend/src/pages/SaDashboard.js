import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Legend } from 'chart.js';
import Layout from '../components/Layout';
import api from '../api/client';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ArcElement, Tooltip, Legend);

export default function SaDashboard() {
  const [schools, setSchools] = useState([]);
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [certByType, setCertByType] = useState([]);
  const [pendingWalletCount, setPendingWalletCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [schoolsRes, revenueRes, certRes, walletReqRes] = await Promise.all([
        api.get('/schools'),
        api.get('/reports/revenue', { params: { months: 6 } }),
        api.get('/reports/certificates-by-type'),
        api.get('/wallet/recharge-requests', { params: { status: 'pending' } })
      ]);
      setSchools(schoolsRes.data.schools);
      setRevenueTrend(revenueRes.data.trend);
      setCertByType(certRes.data.breakdown);
      setPendingWalletCount(walletReqRes.data.requests.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalSchools = schools.length;
  const activeSchools = schools.filter(s => s.status === 'active').length;
  const pendingSchools = schools.filter(s => s.status === 'pending').length;
  const totalWallet = schools.reduce((sum, s) => sum + Number(s.wallet_balance || 0), 0);
  const recentSchools = schools.slice(0, 6);
  const pendingList = schools.filter(s => s.status === 'pending').slice(0, 6);

  const revenueData = {
    labels: revenueTrend.map(r => r.month),
    datasets: [{ label: 'Revenue (₹)', data: revenueTrend.map(r => r.revenue), borderColor: '#1A6FD4', backgroundColor: 'rgba(26,111,212,.1)', tension: 0.4, fill: true }]
  };
  const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide', idcard: 'ID Card' };
  const certData = {
    labels: certByType.map(c => TYPE_LABELS[c.type] || c.type),
    datasets: [{ data: certByType.map(c => c.count), backgroundColor: ['#1A6FD4', '#10B981', '#F59E0B'], borderWidth: 0 }]
  };

  async function handleExportReport() {
    setExporting(true);
    try {
      const [overviewRes, topSchoolsRes] = await Promise.all([
        api.get('/reports/overview'),
        api.get('/reports/top-schools', { params: { limit: 50 } })
      ]);
      const ov = overviewRes.data;
      const rows = [
        ['One Click School Solutions Platform Report', new Date().toLocaleDateString('en-IN')],
        [],
        ['Metric', 'Value'],
        ['Total Schools', ov.schools.total],
        ['Active Schools', ov.schools.active],
        ['Pending Schools', ov.schools.pending],
        ['Total Students', ov.students.total],
        ['Total Certificates Issued', ov.certificates.total],
        ['Total Revenue', ov.certificates.revenue],
        ['Total Wallet Balance (all schools)', ov.wallets.totalBalance],
        ['Total Distributors', ov.distributors.total],
        [],
        ['Top Schools by Revenue'],
        ['School', 'City', 'District', 'Certificates', 'Revenue']
      ];
      topSchoolsRes.data.schools.forEach(s => rows.push([s.name, s.city || '', s.district || '', s.certificateCount, s.revenue]));

      const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `certifypro-report-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (err) {
      alert('Failed to generate export. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Layout role="superAdmin" pendingCount={pendingSchools}>
      <div className="page-header">
        <div>
          <h2>Dashboard Overview</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Welcome back, Super Admin! Here is what is happening.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleExportReport} disabled={exporting}><i className="fas fa-download"></i> {exporting ? 'Exporting...' : 'Export Report'}</button>
          <button className="btn btn-primary" onClick={() => navigate('/sa-schools')}><i className="fas fa-plus"></i> Add School</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="fa-school" color="var(--primary)" bg="rgba(26,111,212,.1)" value={totalSchools} label="Total Schools" />
        <StatCard icon="fa-check-circle" color="var(--success)" bg="rgba(16,185,129,.1)" value={activeSchools} label="Active Schools" />
        <StatCard icon="fa-clock" color="var(--warning)" bg="rgba(245,158,11,.1)" value={pendingSchools} label="Pending Approvals" />
        <StatCard icon="fa-wallet" color="#7c3aed" bg="rgba(124,58,237,.1)" value={`₹${totalWallet.toLocaleString('en-IN')}`} label="Combined Wallet Balance" />
        <StatCard icon="fa-receipt" color="#f97316" bg="rgba(249,115,22,.1)" value={pendingWalletCount} label="Pending Wallet Requests" onClick={() => navigate('/sa-wallet')} />
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-line" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Revenue Trend</h3>
            <select className="filter-select" style={{ width: 'auto' }}>
              <option value="6m">Last 6 Months</option>
              <option value="1y">Last 1 Year</option>
            </select>
          </div>
          <div className="card-body">
            <div className="chart-container"><Line data={revenueData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-pie" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Certificate Usage</h3>
          </div>
          <div className="card-body">
            <div className="chart-container"><Doughnut data={certData} options={{ maintainAspectRatio: false }} /></div>
          </div>
        </div>
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <h3><i className="fas fa-school" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Recently Added Schools</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/sa-schools')}>View All</button>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School Name</th><th>City</th><th>District</th><th>School Admin</th><th>Wallet</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading...</td></tr>
              ) : recentSchools.length === 0 ? (
                <tr><td colSpan={7}>No schools yet.</td></tr>
              ) : recentSchools.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city || '-'}</td>
                  <td>{s.district || '-'}</td>
                  <td>{s.admin_name || '-'}</td>
                  <td>₹{Number(s.wallet_balance || 0).toLocaleString('en-IN')}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td><button className="btn-icon" onClick={() => navigate('/sa-schools')}><i className="fas fa-eye"></i></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-clock" style={{ color: 'var(--warning)', marginRight: 8 }}></i>Pending Approvals</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/sa-requested')}>View All</button>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>School Name</th><th>City</th><th>Distributor</th><th>Applied</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {pendingList.length === 0 ? (
                <tr><td colSpan={6}>No pending approvals.</td></tr>
              ) : pendingList.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city || '-'}</td>
                  <td>{s.distributor_name || '-'}</td>
                  <td>{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td><button className="btn-icon" onClick={() => navigate('/sa-requested')}><i className="fas fa-eye"></i></button></td>
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

export function StatusBadge({ status }) {
  const map = { active: ['badge-success', 'Active'], pending: ['badge-warning', 'Pending'], rejected: ['badge-danger', 'Rejected'], suspended: ['badge-danger', 'Suspended'] };
  const [cls, label] = map[status] || ['badge-warning', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
