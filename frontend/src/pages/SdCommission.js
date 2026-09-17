import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

// A Super Distributor's commission is a flat rate (their own commission_rate)
// applied to certificate revenue across their whole hierarchy — not the
// commission_ledger split Distributors have — see the backend endpoint's
// comment for why. Structured like DistCommission.js (Distributor's own
// page) so the two stay visually consistent, with "School" swapped for
// "Distributor" in the breakdown table.
export default function SdCommission() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/super-distributors/me/commission').then(res => setData(res.data)).catch(err => setError(err.response?.data?.error || 'Error loading data'));
  }, []);

  if (error) return <Layout role="superDistributor"><div style={{ color: 'var(--danger)' }}>{error}</div></Layout>;
  if (!data) return <Layout role="superDistributor"><div>Loading...</div></Layout>;

  return (
    <Layout role="superDistributor">
      <div className="page-header"><div><h1 className="page-title">Commission</h1></div></div>

      <div className="card" style={{ background: 'linear-gradient(135deg,#0F1E3D,#1A6FD4)', color: '#fff', border: 'none', marginBottom: 20 }}>
        <div style={{ padding: 24, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Stat label="Total Revenue" value={`₹${data.totalRevenue.toLocaleString('en-IN')}`} big />
          <Divider />
          <Stat label="Flat Commission Rate" value={`${data.commissionRate}%`} />
          <Divider />
          <Stat label="Total Commission" value={`₹${data.totalCommission.toLocaleString('en-IN')}`} />
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
                  <td>₹{row.commission.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Breakdown by Distributor</h3></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Distributor</th><th>Certificates</th><th>Revenue</th><th>Commission</th></tr></thead>
            <tbody>
              {data.perDistributor.length === 0 ? (
                <tr><td colSpan={4}>No distributors yet.</td></tr>
              ) : data.perDistributor.map(row => (
                <tr key={row.distributorId || 'direct'}>
                  <td>{row.distributorName}</td><td>{row.certificateCount}</td>
                  <td>₹{row.revenue.toLocaleString('en-IN')}</td>
                  <td>₹{row.commission.toLocaleString('en-IN')}</td>
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
