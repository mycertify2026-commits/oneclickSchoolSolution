import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const LABELS = { pending:'Pending', approved:'Approved', printing:'Printing', ready_for_dispatch:'Ready for Dispatch', dispatched:'Dispatched', delivered:'Delivered', rejected:'Rejected', cancelled:'Cancelled' };
const BADGES = { pending:'badge-warning', approved:'badge-info', printing:'badge-info', ready_for_dispatch:'badge-info', dispatched:'badge-primary', delivered:'badge-success', rejected:'badge-danger', cancelled:'badge-danger' };

export default function SdIdCardRequests() {
  const [requests, setRequests] = useState([]);

  const load = useCallback(() => {
    api.get('/id-cards/hard-copy/sd').then(res => setRequests(res.data.requests)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div><h1 className="page-title">ID Card Requests</h1><p className="page-subtitle">Hard copy ID card requests from your schools and distributors</p></div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School</th><th>Distributor</th><th>Student</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No hard copy requests.</td></tr>
              ) : requests.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                  <td>{r.distributor_name || '—'}</td>
                  <td>{r.student_name}</td>
                  <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${BADGES[r.status] || 'badge-warning'}`}>{LABELS[r.status] || r.status}</span></td>
                  <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
