import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

export default function DistCommission() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/distributors/me/commission').then(res => setData(res.data)).catch(err => setError(err.response?.data?.error || 'Error loading data'));
  }, []);

  if (error) return <Layout role="distributor"><div style={{ color: 'var(--danger)' }}>{error}</div></Layout>;
  if (!data) return <Layout role="distributor"><div>Loading...</div></Layout>;

  return (
    <Layout role="distributor">
      <div className="page-header"><div><h1 className="page-title">Commission</h1></div></div>

      <div className="card" style={{ background: 'linear-gradient(135deg,#0F1E3D,#1A6FD4)', color: '#fff', border: 'none', marginBottom: 20 }}>
        <div style={{ padding: 24, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Stat label="Total Commission" value={`₹${data.totalCommission.toLocaleString('en-IN')}`} big />
          <Divider />
          <Stat label="Commission Rate" value={`${data.commissionRate}%`} />
          <Divider />
          <Stat label="Total Revenue" value={`₹${data.totalRevenue.toLocaleString('en-IN')}`} />
          <Divider />
          <Stat label="Certificates" value={data.totalCertificates} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3 className="card-title">Monthly Breakdown</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Month</th><th>Certificates</th><th>Revenue</th><th>Commission</th></tr></thead>
            <tbody>
              {data.monthly.length === 0 ? (
                <tr><td colSpan={4}>No transactions yet.</td></tr>
              ) : data.monthly.map(row => (
                <tr key={row.month}>
                  <td>{formatMonth(row.month)}</td><td>{row.certificateCount}</td>
                  <td>₹{row.revenue.toLocaleString('en-IN')}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 600 }}>₹{row.commission.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Breakdown by School</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>School</th><th>Certificates</th><th>Revenue</th><th>Commission</th></tr></thead>
            <tbody>
              {data.perSchool.length === 0 ? (
                <tr><td colSpan={4}>No schools yet.</td></tr>
              ) : data.perSchool.map(row => (
                <tr key={row.schoolId}>
                  <td>{row.schoolName}</td><td>{row.certificateCount}</td>
                  <td>₹{row.revenue.toLocaleString('en-IN')}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 600 }}>₹{row.commission.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value, big }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 28 : 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
function Divider() { return <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,.2)' }}></div>; }
function formatMonth(monthStr) {
  const [year, month] = monthStr.split('-');
  return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
