import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { StatusBadge } from './SaDashboard';
import api from '../api/client';

export default function SaRequested() {
  const [schools, setSchools] = useState([]);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    const res = await api.get('/schools');
    setSchools(res.data.schools.filter(s => s.status === 'pending'));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id) {
    await api.put(`/schools/${id}/status`, { status: 'active' });
    load();
  }

  async function confirmReject() {
    await api.put(`/schools/${rejectingId}/status`, { status: 'rejected', rejectionReason: rejectReason });
    setRejectingId(null);
    setRejectReason('');
    load();
  }

  return (
    <Layout role="superAdmin" pendingCount={schools.length}>
      <div className="page-header">
        <div><h2>Requested Schools</h2><p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Schools awaiting approval, submitted by Super Admin or Distributors</p></div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>School Name</th><th>City</th><th>District</th><th>Distributor</th><th>Admin</th><th>Applied</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {schools.length === 0 ? (
                <tr><td colSpan={8}>No pending school requests.</td></tr>
              ) : schools.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city || '-'}</td>
                  <td>{s.district || '-'}</td>
                  <td>{s.distributor_name || <span style={{ color: 'var(--text-light)' }}>Direct</span>}</td>
                  <td>{s.admin_name}<br /><span style={{ fontSize: 11, color: 'var(--text-light)' }}>{s.admin_email}</span></td>
                  <td>{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => approve(s.id)} style={{ marginRight: 6 }}><i className="fas fa-check"></i> Approve</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => setRejectingId(s.id)}><i className="fas fa-times"></i> Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rejectingId && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setRejectingId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject School</h3>
              <button className="modal-close" onClick={() => setRejectingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Reason for rejection</label>
                <textarea className="form-control" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this school is being rejected..."></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectingId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={confirmReject}>Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
