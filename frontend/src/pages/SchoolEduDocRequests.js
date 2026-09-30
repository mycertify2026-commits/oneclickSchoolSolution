import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

const LABELS = { submitted: 'Submitted', under_process: 'Under Process', documents_processing: 'Documents Processing', completed: 'Completed', closed: 'Closed' };
const BADGES = { submitted: 'badge-warning', under_process: 'badge-info', documents_processing: 'badge-info', completed: 'badge-success', closed: 'badge-primary' };

export default function SchoolEduDocRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/edu-doc-requests/mine').then(res => setRequests(res.data.requests)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Educational Certificate Requests</h1>
          <p className="page-subtitle">Requests you've submitted to your distributor for real-world documents.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/educational-certificates')}>
          <i className="fas fa-plus" style={{ marginRight: 6 }}></i>New Request
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Request ID</th><th>Certificate(s)</th><th>Students</th><th>Amount</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}><i className="fas fa-spinner fa-spin"></i></td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No educational document requests yet.</td></tr>
              ) : requests.map(r => {
                const docTypes = [...new Set((r.students || []).map(s => s.doc_type))];
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.request_number}</td>
                    <td style={{ fontSize: 12.5 }}>{docTypes.join(', ') || '—'}</td>
                    <td>{(r.students || []).length}</td>
                    <td>₹{Number(r.total_amount).toLocaleString('en-IN')}</td>
                    <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td><span className={`badge ${BADGES[r.status] || 'badge-warning'}`}>{LABELS[r.status] || r.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
