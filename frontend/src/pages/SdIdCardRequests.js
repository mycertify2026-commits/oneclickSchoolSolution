import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const LABELS = { pending:'Pending', approved:'Approved', printing:'Printing', ready_for_dispatch:'Ready for Dispatch', dispatched:'Dispatched', delivered:'Delivered', rejected:'Rejected', cancelled:'Cancelled' };
const BADGES = { pending:'badge-warning', approved:'badge-info', printing:'badge-info', ready_for_dispatch:'badge-info', dispatched:'badge-primary', delivered:'badge-success', rejected:'badge-danger', cancelled:'badge-danger' };

export default function SdIdCardRequests() {
  const [requests, setRequests] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(() => {
    api.get('/id-cards/hard-copy/sd').then(res => setRequests(res.data.requests)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDownload(id) {
    setDownloadingId(id);
    try {
      const res = await api.get(`/id-cards/hard-copy/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `id-card-${id}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not download this ID card yet.');
    } finally {
      setDownloadingId(null);
    }
  }

  const batchSizes = requests.reduce((acc, r) => {
    if (r.batch_id) acc[r.batch_id] = (acc[r.batch_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div><h1 className="page-title">ID Card Requests</h1><p className="page-subtitle">Hard copy ID card requests from your schools and distributors</p></div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School</th><th>Distributor</th><th>Student</th><th>Batch</th><th>Amount</th><th>Status</th><th>Date</th><th>ID Card</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No hard copy requests.</td></tr>
              ) : requests.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                  <td>{r.distributor_name || '—'}</td>
                  <td>{r.student_name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.batch_id ? `${batchSizes[r.batch_id]} card${batchSizes[r.batch_id] !== 1 ? 's' : ''}` : '—'}</td>
                  <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${BADGES[r.status] || 'badge-warning'}`}>{LABELS[r.status] || r.status}</span></td>
                  <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                  <td>
                    {r.pdf_path ? (
                      <button className="btn-icon" title="Download ID Card" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id}>
                        <i className="fas fa-download"></i>
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>
                    )}
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
