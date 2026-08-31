import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

export default function SaWallet() {
  const [activeTab, setActiveTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [bankDetails, setBankDetails] = useState(null);
  const [bankForm, setBankForm] = useState({ account_holder: '', bank_name: '', account_number: '', ifsc: '', branch: '', upi_id: '' });
  const [qrFile, setQrFile] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const apiBase = (process.env.REACT_APP_UPLOADS_URL || 'http://66.116.246.220:5000');

  const loadRequests = useCallback(async (status) => {
    const res = await api.get('/wallet/recharge-requests', { params: status ? { status } : {} });
    setRequests(res.data.requests);
  }, []);

  const loadBankDetails = useCallback(async () => {
    try {
      const res = await api.get('/bank-details');
      setBankDetails(res.data.bankDetails);
      setBankForm({
        account_holder: res.data.bankDetails.account_holder, bank_name: res.data.bankDetails.bank_name,
        account_number: res.data.bankDetails.account_number, ifsc: res.data.bankDetails.ifsc,
        branch: res.data.bankDetails.branch || '', upi_id: res.data.bankDetails.upi_id || ''
      });
    } catch (e) {
      setBankDetails(null);
    }
  }, []);

  useEffect(() => { loadRequests(statusFilter); }, [statusFilter, loadRequests]);
  useEffect(() => { loadBankDetails(); }, [loadBankDetails]);

  async function handleApprove(id) {
    if (!window.confirm('Approve this recharge request? The school wallet will be updated immediately.')) return;
    try {
      await api.put(`/wallet/recharge-requests/${id}/approve`);
      loadRequests(statusFilter);
    } catch (err) {
      alert(err.response?.data?.error || 'Error while approving');
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setError('A rejection reason is required'); return; }
    try {
      await api.put(`/wallet/recharge-requests/${rejectingId}/reject`, { reason: rejectReason.trim() });
      setRejectingId(null);
      setRejectReason('');
      loadRequests(statusFilter);
    } catch (err) {
      alert(err.response?.data?.error || 'Error while rejecting');
    }
  }

  async function handleSaveBankDetails() {
    setError(''); setSuccess('');
    if (!bankForm.account_holder || !bankForm.bank_name || !bankForm.account_number || !bankForm.ifsc) {
      setError('Account holder, bank name, account number and IFSC are required');
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(bankForm).forEach(([k, v]) => data.append(k, v));
      if (qrFile) data.append('qrCode', qrFile);
      const res = await api.put('/bank-details', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBankDetails(res.data.bankDetails);
      setQrFile(null);
      setSuccess(qrFile ? 'Bank details saved. A notification about the QR change was sent by email.' : 'Bank details saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Error while saving');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h2>Wallet Management</h2></div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button className={`btn btn-sm ${activeTab === 'requests' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('requests')}>Recharge Requests</button>
        <button className={`btn btn-sm ${activeTab === 'bank' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('bank')}>Bank Details / QR</button>
      </div>

      {activeTab === 'requests' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recharge Requests</h3>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>School</th><th>Amount</th><th>UTR</th><th>Screenshot</th><th>Date</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan={7}>No requests found.</td></tr>
                ) : requests.map(r => (
                  <tr key={r.id}>
                    <td>{r.school_name}<br /><span style={{ fontSize: 11, color: 'var(--text-light)' }}>{r.school_city}</span></td>
                    <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.utr_number}</td>
                    <td>
                      {r.screenshot_path ? (
                        <a href={`${apiBase}/uploads/wallet/${r.screenshot_path.split('/').pop()}`} target="_blank" rel="noopener noreferrer">
                          <i className="fas fa-image" style={{ color: 'var(--primary)' }}></i> View
                        </a>
                      ) : '-'}
                    </td>
                    <td>{new Date(r.payment_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <span className={`badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                        {r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      {r.status === 'pending' && (
                        <>
                          <button className="btn-icon" title="Approve" onClick={() => handleApprove(r.id)}><i className="fas fa-check" style={{ color: 'var(--success)' }}></i></button>
                          <button className="btn-icon" title="Reject" onClick={() => { setRejectingId(r.id); setRejectReason(''); setError(''); }}><i className="fas fa-times" style={{ color: 'var(--danger)' }}></i></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'bank' && (
        <div className="card" style={{ padding: 20, maxWidth: 600 }}>
          {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{success}</div>}
          <div className="form-grid-2">
            <Field label="Account Holder Name *" value={bankForm.account_holder} onChange={v => setBankForm(p => ({ ...p, account_holder: v }))} />
            <Field label="Bank Name *" value={bankForm.bank_name} onChange={v => setBankForm(p => ({ ...p, bank_name: v }))} />
          </div>
          <div className="form-grid-2">
            <Field label="Account Number *" value={bankForm.account_number} onChange={v => setBankForm(p => ({ ...p, account_number: v }))} />
            <Field label="IFSC *" value={bankForm.ifsc} onChange={v => setBankForm(p => ({ ...p, ifsc: v }))} />
          </div>
          <div className="form-grid-2">
            <Field label="Branch" value={bankForm.branch} onChange={v => setBankForm(p => ({ ...p, branch: v }))} />
            <Field label="UPI ID" value={bankForm.upi_id} onChange={v => setBankForm(p => ({ ...p, upi_id: v }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Upload QR Code</label>
            {bankDetails?.qr_code_path && !qrFile && (
              <div style={{ marginBottom: 8 }}>
                <img src={`${apiBase}/uploads/bank-qr/${bankDetails.qr_code_path}`} alt="Current QR" style={{ width: 100, height: 100, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8 }} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Current QR</div>
              </div>
            )}
            <input type="file" accept="image/*" className="form-control" onChange={e => setQrFile(e.target.files[0] || null)} />
            <div className="form-hint">If you change the QR, an email alert will be sent to all Super Admins.</div>
          </div>
          <button className="btn btn-primary" onClick={handleSaveBankDetails} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save'}</button>
        </div>
      )}

      {rejectingId && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setRejectingId(null)}>
          <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject Request</h3>
              <button className="modal-close" onClick={() => setRejectingId(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <div className="form-group">
                <label className="form-label">Reason *</label>
                <textarea className="form-control" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. UTR does not match, incorrect amount..."></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRejectingId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={handleReject}>Reject</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
