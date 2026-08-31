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

export default function SdCampRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    api.get('/camp-requests/sd').then(res => setRequests(res.data.campRequests)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = filter ? requests.filter(r => r.status === filter) : requests;

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div><h1 className="page-title">Camp Requests</h1><p className="page-subtitle">Camp requests from your schools and distributors</p></div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['', 'pending', 'under_review', 'confirmed', 'rejected', 'completed', 'cancelled'].map(s => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(s)}>
            {s ? STATUS_MAP[s]?.[1] || s : 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>School</th><th>Distributor</th><th>Camp Name</th><th>Start</th><th>End</th><th>Camp Attender</th><th>Status</th></tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No camp requests found.</td></tr>
              ) : visible.map(r => {
                const [badgeCls, label] = STATUS_MAP[r.status] || ['badge-warning', r.status];
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.school_name}</td>
                    <td>{r.distributor_name || <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Direct</span>}</td>
                    <td>{r.camp_name}</td>
                    <td>{r.start_date ? new Date(r.start_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td>{r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : '—'}</td>
                    <td>{r.attender_name || '—'}</td>
                    <td><span className={`badge ${badgeCls}`}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
