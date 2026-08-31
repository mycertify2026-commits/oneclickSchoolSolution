import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const STATUSES = ['pending','approved','printing','ready_for_dispatch','dispatched','delivered','rejected','cancelled'];
const LABELS   = { pending:'Pending', approved:'Approved', printing:'Printing', ready_for_dispatch:'Ready for Dispatch', dispatched:'Dispatched', delivered:'Delivered', rejected:'Rejected', cancelled:'Cancelled' };
const BADGES   = { pending:'badge-warning', approved:'badge-info', printing:'badge-info', ready_for_dispatch:'badge-info', dispatched:'badge-primary', delivered:'badge-success', rejected:'badge-danger', cancelled:'badge-danger' };

export default function SaIdCardRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const url = filter ? `/id-cards/hard-copy?status=${filter}` : '/id-cards/hard-copy';
    api.get(url).then(res => setRequests(res.data.requests)).catch(() => {});
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function openEdit(r) { setEditing(r); setForm({ status: r.status, notes: r.notes || '' }); setError(''); }

  async function handleSave() {
    setError(''); setSaving(true);
    try {
      await api.put(`/id-cards/hard-copy/${editing.id}`, form);
      setEditing(null); load();
    } catch (err) { setError(err.response?.data?.error || 'Failed to update'); }
    finally { setSaving(false); }
  }

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h1 className="page-title">ID Card Requests (Hard Copy)</h1><p className="page-subtitle">Manage hard copy ID card requests from all schools</p></div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filter === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('')}>All</button>
        {STATUSES.map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(s)}>{LABELS[s]}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School</th><th>Student</th><th>Student UID</th><th>Distributor</th><th>Super Dist.</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No hard copy ID card requests.</td></tr>
              ) : requests.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                  <td>{r.student_name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.student_uid || '—'}</td>
                  <td>{r.distributor_name || '—'}</td>
                  <td>{r.super_distributor_name || '—'}</td>
                  <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${BADGES[r.status] || 'badge-warning'}`}>{LABELS[r.status] || r.status}</span></td>
                  <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                  <td>
                    <button className="btn-icon" title="Update" onClick={() => openEdit(r)}><i className="fas fa-edit"></i></button>
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
              <h3>Update Request — {editing.student_name}</h3>
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
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
