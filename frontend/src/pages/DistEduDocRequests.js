import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const STATUSES = ['submitted', 'under_process', 'documents_processing', 'completed', 'closed'];
const LABELS = { submitted: 'Submitted', under_process: 'Under Process', documents_processing: 'Documents Processing', completed: 'Completed', closed: 'Closed' };
const BADGES = { submitted: 'badge-warning', under_process: 'badge-info', documents_processing: 'badge-info', completed: 'badge-success', closed: 'badge-primary' };
const DOC_TYPE_LABELS = {
  'caste-certificate': 'Caste Certificate',
  'income-certificate': 'Income Certificate',
  'age-domicile-nationality': 'Age, Domicile and Nationality',
  'non-creamy-layer': 'Non-Creamy Layer',
};

export default function DistEduDocRequests() {
  const [requests, setRequests] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [closingId, setClosingId] = useState(null);

  const load = useCallback(() => {
    api.get('/edu-doc-requests/distributor').then(res => setRequests(res.data.requests)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(r) {
    setEditing(r);
    setForm({ status: r.status, notes: '' });
    setError('');
  }

  async function handleSave() {
    setError(''); setSaving(true);
    try {
      await api.put(`/edu-doc-requests/distributor/${editing.id}`, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  }

  async function handleClose(r) {
    if (!window.confirm('Are you sure you want to close this request? All students in this request will be marked as completed.')) return;
    setClosingId(r.id);
    try {
      await api.post(`/edu-doc-requests/distributor/${r.id}/close`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close request');
    } finally { setClosingId(null); }
  }

  async function handleDownload(studentRowId, label) {
    setDownloadingId(studentRowId);
    try {
      const res = await api.get(`/edu-doc-requests/documents/${studentRowId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${label || 'document'}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not download this document.');
    } finally {
      setDownloadingId(null);
    }
  }

  // Flatten to one row per student, since each student in a request carries
  // its own document type and PDF — the request's status/actions still apply
  // to the whole batch, shown identically on every row that shares it.
  const flatRows = requests.flatMap(r => (r.students || []).map(s => ({ ...s, request: r })));

  return (
    <Layout role="distributor">
      <div className="page-header">
        <div><h1 className="page-title">Educational Certificate Requests</h1><p className="page-subtitle">Requests from your schools for real-world government documents</p></div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Request ID</th><th>School</th><th>Student</th><th>Certificate</th><th>Amount</th><th>Date</th><th>Status</th><th>Document</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {flatRows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No educational certificate requests from your schools.</td></tr>
              ) : flatRows.map(row => (
                <tr key={row.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.request.request_number}</td>
                  <td style={{ fontWeight: 600 }}>{row.request.school_name}</td>
                  <td>{row.student_name}</td>
                  <td style={{ fontSize: 12.5 }}>{DOC_TYPE_LABELS[row.doc_type] || row.doc_type}</td>
                  <td>₹{Number(row.price).toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: 12 }}>{new Date(row.request.created_at).toLocaleDateString('en-IN')}</td>
                  <td><span className={`badge ${BADGES[row.request.status] || 'badge-warning'}`}>{LABELS[row.request.status] || row.request.status}</span></td>
                  <td>
                    <button className="btn-icon" title="Download Document" onClick={() => handleDownload(row.id, `${row.student_name}-${row.doc_type}`)} disabled={downloadingId === row.id}>
                      <i className="fas fa-download"></i>
                    </button>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(row.request)}><i className="fas fa-edit"></i></button>
                    {row.request.status !== 'closed' && (
                      <button className="btn btn-sm btn-outline" onClick={() => handleClose(row.request)} disabled={closingId === row.request.id} title="Close Request">
                        <i className="fas fa-lock"></i>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setEditing(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Update Request — {editing.request_number}</h3>
              <button className="modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{LABELS[s]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
