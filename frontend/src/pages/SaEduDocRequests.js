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

export default function SaEduDocRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const url = filter ? `/edu-doc-requests?status=${filter}` : '/edu-doc-requests';
    api.get(url).then(res => setRequests(res.data.requests)).catch(() => {});
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function openEdit(r) { setEditing(r); setForm({ status: r.status, notes: '' }); setError(''); }

  async function handleSave() {
    setError(''); setSaving(true);
    try {
      await api.put(`/edu-doc-requests/${editing.id}`, form);
      setEditing(null); load();
    } catch (err) { setError(err.response?.data?.error || 'Failed to update'); }
    finally { setSaving(false); }
  }

  const totals = requests.reduce((acc, r) => {
    acc.total += 1;
    acc[r.status] = (acc[r.status] || 0) + 1;
    acc.amount += Number(r.total_amount) || 0;
    return acc;
  }, { total: 0, amount: 0 });

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h1 className="page-title">Educational Certificate Requests</h1><p className="page-subtitle">Monitor all educational document requests across every school</p></div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard label="Total Requests" value={totals.total} icon="fa-file-alt" color="#1A6FD4" />
        <StatCard label="Submitted" value={totals.submitted || 0} icon="fa-paper-plane" color="#F59E0B" />
        <StatCard label="Completed" value={totals.completed || 0} icon="fa-check-circle" color="#10B981" />
        <StatCard label="Total Amount" value={`₹${totals.amount.toLocaleString('en-IN')}`} icon="fa-rupee-sign" color="#7C3AED" />
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
              <tr><th>Request ID</th><th>School</th><th>Distributor</th><th>Students</th><th>Certificates</th><th>Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No educational certificate requests.</td></tr>
              ) : requests.map(r => {
                const docTypes = [...new Set((r.students || []).map(s => DOC_TYPE_LABELS[s.doc_type] || s.doc_type))];
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.request_number}</td>
                    <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                    <td>{r.distributor_name || '—'}</td>
                    <td>{(r.students || []).length}</td>
                    <td style={{ fontSize: 12 }}>{docTypes.join(', ') || '—'}</td>
                    <td>₹{Number(r.total_amount).toLocaleString('en-IN')}</td>
                    <td style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                    <td><span className={`badge ${BADGES[r.status] || 'badge-warning'}`}>{LABELS[r.status] || r.status}</span></td>
                    <td>
                      <button className="btn-icon" title="Update" onClick={() => openEdit(r)}><i className="fas fa-edit"></i></button>
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
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className={`fas ${icon}`} style={{ color, fontSize: 16 }}></i>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}
