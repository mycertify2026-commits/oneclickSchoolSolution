import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const TYPE_META = {
  lc:       { label: 'Leaving Certificate', color: '#1A6FD4', bg: 'rgba(26,111,212,.1)' },
  bonafide: { label: 'Bonafide Certificate',  color: '#10B981', bg: 'rgba(16,185,129,.1)' },
  idcard:   { label: 'Student ID Card',        color: '#F97316', bg: 'rgba(249,115,22,.1)' },
};

function RequestStatusBadge({ status }) {
  const cfg = {
    pending:  { bg: '#FEF9C3', color: '#854D0E', label: '⏳ Pending' },
    approved: { bg: '#DCFCE7', color: '#166534', label: '✅ Approved' },
    rejected: { bg: '#FEE2E2', color: '#991B1B', label: '❌ Rejected' },
  }[status] || { bg: '#F1F5F9', color: '#475569', label: status };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
      {cfg.label}
    </span>
  );
}

export default function SaCertApprovals() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/certificates/requests/admin', {
        params: filter ? { status: filter } : {}
      });
      setRequests(res.data.requests || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id) {
    if (!window.confirm('Approve this request? The school wallet will be debited and the certificate PDF will be generated.')) return;
    setProcessing(id);
    try {
      await api.post(`/certificates/requests/admin/${id}/approve`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Error while approving');
    } finally {
      setProcessing(null);
    }
  }

  async function confirmReject() {
    if (!rejectReason.trim()) { alert('Please provide a reason'); return; }
    setProcessing(rejectingId);
    try {
      await api.post(`/certificates/requests/admin/${rejectingId}/reject`, { reason: rejectReason });
      setRejectingId(null);
      setRejectReason('');
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Error while rejecting');
    } finally {
      setProcessing(null);
    }
  }

  const pendingCount = filter === 'pending' ? requests.length : 0;

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <i className="fas fa-certificate" style={{ color: '#F97316', marginRight: 10 }}></i>
            Certificate Approvals
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            School certificate requests — approving a request will debit the wallet and generate the PDF
          </p>
        </div>
        {pendingCount > 0 && (
          <div style={{ background: '#FEF9C3', border: '1px solid #FDE047', borderRadius: 8, padding: '8px 18px', fontSize: 14, color: '#854D0E', fontWeight: 700 }}>
            ⏳ {pendingCount} Pending Requests
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { val: 'pending',  label: '⏳ Pending' },
          { val: 'approved', label: '✅ Approved' },
          { val: 'rejected', label: '❌ Rejected' },
          { val: '',         label: 'All' },
        ].map(({ val, label }) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '7px 18px', borderRadius: 8, border: '1.5px solid',
            borderColor: filter === val ? '#1a6fd4' : '#e2e8f0',
            background: filter === val ? '#1a6fd4' : '#fff',
            color: filter === val ? '#fff' : '#475569',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s'
          }}>{label}</button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 13, color: '#475569' }}>
          <i className="fas fa-sync-alt"></i>
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>School</th>
                <th>Type</th>
                <th>Price</th>
                <th style={{ letterSpacing: 1 }}>Approval Code</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 30 }}>
                  <i className="fas fa-spinner fa-spin"></i> Loading...
                </td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 30 }}>
                  {filter === 'pending' ? '✅ There are no pending requests right now.' : 'No records found.'}
                </td></tr>
              ) : requests.map((r, i) => {
                const meta = TYPE_META[r.type] || {};
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: '#94a3b8' }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{r.student_name}</div>
                      {r.purpose && <div style={{ fontSize: 11, color: '#64748b' }}>Purpose: {r.purpose}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.school_name}</td>
                    <td>
                      <span style={{ background: meta.bg, color: meta.color, borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 600 }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>₹{Number(r.price).toFixed(2)}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>+ GST ₹{Number(r.gst_amount).toFixed(2)}</div>
                    </td>
                    <td>
                      <code style={{
                        background: '#0F1E3D', color: '#E7C065',
                        padding: '5px 12px', borderRadius: 6,
                        fontSize: 18, fontWeight: 800, letterSpacing: 4, display: 'block'
                      }}>{r.approval_code}</code>
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>
                      {new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td><RequestStatusBadge status={r.status} /></td>
                    <td>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm"
                            disabled={processing === r.id}
                            onClick={() => handleApprove(r.id)}
                            style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 700 }}>
                            {processing === r.id
                              ? <><i className="fas fa-spinner fa-spin"></i> Wait...</>
                              : <><i className="fas fa-check"></i> Approve</>}
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={processing === r.id}
                            onClick={() => { setRejectingId(r.id); setRejectReason(''); }}
                            style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff', fontWeight: 700 }}>
                            <i className="fas fa-times"></i> Reject
                          </button>
                        </div>
                      )}
                      {r.status === 'approved' && (
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                          <i className="fas fa-check-circle"></i> PDF Ready
                        </span>
                      )}
                      {r.status === 'rejected' && (
                        <span style={{ fontSize: 12, color: '#dc2626' }} title={r.rejection_reason}>
                          {(r.rejection_reason || 'Rejected').slice(0, 35)}
                          {(r.rejection_reason || '').length > 35 ? '…' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingId && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setRejectingId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>❌ Certificate Request Reject</h3>
              <button className="modal-close" onClick={() => setRejectingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#64748b', marginBottom: 12, fontSize: 14 }}>
                The school will be notified of the rejection. The wallet will not be debited.
              </p>
              <div className="form-group">
                <label className="form-label required">Rejection Reason</label>
                <textarea
                  className="form-control" rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Student data incomplete, Duplicate request, Wrong certificate type..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectingId(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                disabled={!!processing}
                onClick={confirmReject}>
                {processing ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
