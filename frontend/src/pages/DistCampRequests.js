import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const STATUS_MAP = {
  pending:      ['badge-warning',  'Pending'],
  under_review: ['badge-info',     'Under Review'],
  confirmed:    ['badge-success',  'Confirmed'],
  rejected:     ['badge-danger',   'Rejected'],
  completed:    ['badge-success',  'Completed'],
  cancelled:    ['badge-danger',   'Cancelled'],
};

export default function DistCampRequests() {
  const [requests, setRequests] = useState([]);
  const [editing, setEditing] = useState(null); // the request being edited
  const [form, setForm] = useState({ attender_name: '', attender_email: '', attender_phone: '', status: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get('/camp-requests/distributor').then(res => setRequests(res.data.campRequests)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(r) {
    setEditing(r);
    setForm({ attender_name: r.attender_name || '', attender_email: r.attender_email || '', attender_phone: r.attender_phone || '', status: r.status, notes: r.notes || '' });
    setError('');
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await api.put(`/camp-requests/distributor/${editing.id}`, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  }

  return (
    <Layout role="distributor">
      <div className="page-header">
        <div><h1 className="page-title">Camp Requests</h1><p className="page-subtitle">Manage camp requests from your schools</p></div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School</th><th>Camp Name</th><th>Start</th><th>End</th><th>Status</th><th>Camp Attender</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No camp requests from your schools.</td></tr>
              ) : requests.map(r => {
                const [badgeCls, label] = STATUS_MAP[r.status] || ['badge-warning', r.status];
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                    <td>{r.camp_name}</td>
                    <td>{r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td>{r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td><span className={`badge ${badgeCls}`}>{label}</span></td>
                    <td>{r.attender_name || <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Not set</span>}</td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(r)}>
                        <i className="fas fa-edit" style={{ marginRight: 4 }}></i>Update
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setEditing(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-edit" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Update Camp Request</h3>
              <button className="modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <strong>{editing.camp_name}</strong> — {editing.school_name}
              </div>
              <div className="form-row form-row-3">
                <F label="Attender Name" value={form.attender_name} onChange={v => setForm(p => ({ ...p, attender_name: v }))} />
                <F label="Attender Email" value={form.attender_email} onChange={v => setForm(p => ({ ...p, attender_email: v }))} />
                <F label="Attender Phone" value={form.attender_phone} onChange={v => setForm(p => ({ ...p, attender_phone: v }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Mark as Under Review</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.status === 'under_review'} onChange={e => setForm(p => ({ ...p, status: e.target.checked ? 'under_review' : p.status }))} />
                  Set status to "Under Review"
                </label>
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

function F({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
