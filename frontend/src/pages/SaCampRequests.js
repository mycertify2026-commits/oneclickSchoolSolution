import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const STATUS_OPTIONS = ['pending','under_review','confirmed','rejected','completed','cancelled'];
const STATUS_LABELS  = { pending:'Pending', under_review:'Under Review', confirmed:'Confirmed', rejected:'Rejected', completed:'Completed', cancelled:'Cancelled' };
const STATUS_BADGE   = { pending:'badge-warning', under_review:'badge-info', confirmed:'badge-success', rejected:'badge-danger', completed:'badge-success', cancelled:'badge-danger' };

export default function SaCampRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ attender_name: '', attender_email: '', attender_phone: '', status: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(() => {
    const url = filter ? `/camp-requests?status=${filter}` : '/camp-requests';
    api.get(url).then(res => setRequests(res.data.campRequests)).catch(() => {});
  }, [filter]);

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
      await api.put(`/camp-requests/${editing.id}`, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  }

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h1 className="page-title">Camp Requests</h1><p className="page-subtitle">All camp requests across all schools</p></div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filter === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('')}>All</button>
        {STATUS_OPTIONS.map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(s)}>{STATUS_LABELS[s]}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School</th><th>Distributor</th><th>Super Distributor</th><th>Camp</th><th>Start</th><th>End</th><th>Attender</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No camp requests.</td></tr>
              ) : requests.map(r => (
                <>
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                    <td>{r.distributor_name || '—'}</td>
                    <td>{r.super_distributor_name || '—'}</td>
                    <td>{r.camp_name}</td>
                    <td style={{ fontSize: 12 }}>{r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td>{r.attender_name || '—'}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-warning'}`}>{STATUS_LABELS[r.status] || r.status}</span></td>
                    <td>
                      <button className="btn-icon" title="Details" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                        <i className={`fas fa-chevron-${expandedId === r.id ? 'up' : 'down'}`}></i>
                      </button>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(r)}>
                        <i className="fas fa-edit"></i>
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr key={`${r.id}-exp`}>
                      <td colSpan={9} style={{ background: '#f8fafc', padding: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                          <Info label="Attender Name"  value={r.attender_name} />
                          <Info label="Attender Email" value={r.attender_email} />
                          <Info label="Attender Phone" value={r.attender_phone} />
                          {r.notes && <Info label="Notes" value={r.notes} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>REQUIRED DOCUMENTS</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(Array.isArray(r.required_docs) ? r.required_docs : JSON.parse(r.required_docs || '[]')).map((d, i) => (
                              <span key={i} className="badge badge-primary" style={{ fontWeight: 400, fontSize: 11 }}>{d}</span>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
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
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
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

function F({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '—'}</div>
    </div>
  );
}
