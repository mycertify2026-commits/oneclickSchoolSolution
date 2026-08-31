import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const CAMP_TYPES = [
  'Scholarship Exam Camp',
  'Health Camp',
  'Vaccination Camp',
  'APAAR ID Registration Camp',
  'Biometric Registration Camp',
  'Educational Tour',
  'Other',
];

const DOCUMENTS = [
  'Aadhaar Card',
  'Domicile Certificate',
  'Passport Size Photo',
  'Age, Domicile & Nationality Certificate',
  'Income Certificate',
  'Caste Certificate — if applicable',
  'Caste Validity Certificate — if applicable',
  'EWS Certificate — if applicable',
  'Non-Creamy Layer Certificate — if applicable',
  'Disability Certificate — if applicable',
  'Bank Passbook / Student Bank Account',
  'APAAR ID / ABC ID',
  'Scholarship Application Documents — if applicable',
  'Parent Consent Letter — if required',
];

const BLANK = { camp_name: '', start_date: '', end_date: '', required_docs: [] };

const STATUS_MAP = {
  pending:     ['badge-warning',  'Pending'],
  under_review:['badge-info',     'Under Review'],
  confirmed:   ['badge-success',  'Confirmed'],
  rejected:    ['badge-danger',   'Rejected'],
  completed:   ['badge-success',  'Completed'],
  cancelled:   ['badge-danger',   'Cancelled'],
};

export default function SchoolCampRequests() {
  const [requests, setRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(() => {
    api.get('/camp-requests/mine').then(res => setRequests(res.data.campRequests)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleDoc(doc) {
    setForm(p => ({
      ...p,
      required_docs: p.required_docs.includes(doc)
        ? p.required_docs.filter(d => d !== doc)
        : [...p.required_docs, doc]
    }));
  }

  async function handleSubmit() {
    setError('');
    if (!form.camp_name || !form.start_date || !form.end_date) {
      setError('Camp name, start date and end date are required');
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      setError('End date must be on or after start date');
      return;
    }
    setSaving(true);
    try {
      await api.post('/camp-requests/mine', form);
      setShowModal(false);
      setForm(BLANK);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    } finally { setSaving(false); }
  }

  async function handleCancel(id) {
    if (!window.confirm('Cancel this camp request?')) return;
    try {
      await api.delete(`/camp-requests/mine/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel request');
    }
  }

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div><h1 className="page-title">Camp Requests</h1><p className="page-subtitle">Request and track government/health camps for your school</p></div>
        <button className="btn btn-primary" onClick={() => { setForm(BLANK); setError(''); setShowModal(true); }}>
          <i className="fas fa-plus"></i> Request Camp
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Camp Name</th><th>Distributor</th><th>Start</th><th>End</th><th>Status</th><th>Camp Attender</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No camp requests yet.</td></tr>
              ) : requests.map(r => {
                const [badgeCls, label] = STATUS_MAP[r.status] || ['badge-warning', r.status];
                return (
                  <>
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.camp_name}</td>
                      <td>{r.distributor_name || <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Direct</span>}</td>
                      <td>{r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td>{r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td><span className={`badge ${badgeCls}`}>{label}</span></td>
                      <td>
                        {r.status === 'confirmed'
                          ? <span style={{ fontWeight: 600 }}>{r.attender_name || '—'}</span>
                          : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <button className="btn-icon" title="Details" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                          <i className={`fas fa-chevron-${expandedId === r.id ? 'up' : 'down'}`}></i>
                        </button>
                        {['pending', 'under_review'].includes(r.status) && (
                          <button className="btn-icon" title="Cancel" onClick={() => handleCancel(r.id)}>
                            <i className="fas fa-times" style={{ color: 'var(--danger)' }}></i>
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={7} style={{ background: '#f8fafc', padding: 16 }}>
                          {r.status === 'confirmed' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 12 }}>
                              <Info label="Attender Name"  value={r.attender_name} />
                              <Info label="Attender Email" value={r.attender_email} />
                              <Info label="Attender Phone" value={r.attender_phone} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>REQUIRED DOCUMENTS</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {(Array.isArray(r.required_docs) ? r.required_docs : JSON.parse(r.required_docs || '[]')).map((d, i) => (
                                <span key={i} className="badge badge-primary" style={{ fontWeight: 400, fontSize: 11 }}>{d}</span>
                              ))}
                            </div>
                          </div>
                          {r.notes && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}><strong>Notes:</strong> {r.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-campground" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Request a Camp</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}

              <div className="form-group">
                <label className="form-label">Camp Name / Camp Type *</label>
                <select className="form-control" value={form.camp_name} onChange={e => setForm(p => ({ ...p, camp_name: e.target.value }))}>
                  <option value="">— Select a camp type —</option>
                  {CAMP_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input type="date" className="form-control" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input type="date" className="form-control" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Required Documents</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginTop: 8 }}>
                  {DOCUMENTS.map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.required_docs.includes(d)} onChange={() => toggleDoc(d)} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                <i className="fas fa-paper-plane"></i> {saving ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value || '—'}</div>
    </div>
  );
}
