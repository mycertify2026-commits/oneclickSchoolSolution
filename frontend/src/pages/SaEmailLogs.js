import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const STATUS_BADGE = { SENT: 'badge-success', FAILED: 'badge-danger', PENDING: 'badge-warning' };

export default function SaEmailLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ SENT: 0, FAILED: 0, PENDING: 0 });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    const params = { limit: 100 };
    if (status) params.status = status;
    if (search) params.search = search;
    api.get('/email-logs', { params })
      .then(res => { setLogs(res.data.emailLogs); setStats(res.data.stats); })
      .catch(err => setLoadError(err.response?.data?.error || 'Failed to load email logs'))
      .finally(() => setLoading(false));
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const total = stats.SENT + stats.FAILED + stats.PENDING;

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Logs</h1>
          <p className="page-subtitle">Every welcome, wallet, certificate, and camp email sent platform-wide — across all roles.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}><i className="fas fa-rotate" style={{ marginRight: 6 }}></i>Refresh</button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard icon="fa-paper-plane" color="var(--primary)" bg="rgba(26,111,212,.1)" value={total} label="Total Attempts" />
        <StatCard icon="fa-check-circle" color="#059669" bg="rgba(5,150,105,.1)" value={stats.SENT} label="Sent" />
        <StatCard icon="fa-triangle-exclamation" color="var(--danger)" bg="rgba(239,68,68,.1)" value={stats.FAILED} label="Failed" />
      </div>

      {stats.FAILED > 0 && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          <i className="fas fa-triangle-exclamation" style={{ marginRight: 8 }}></i>
          {stats.FAILED} email{stats.FAILED !== 1 ? 's have' : ' has'} failed to send. If every recent row shows the same error, email delivery (SMTP) is likely misconfigured or down — check the error message below and the server's startup log for "SMTP transport verification failed".
        </div>
      )}

      {loadError && (
        <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{loadError}</span>
          <button className="btn btn-sm btn-outline" onClick={load}>Retry</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {['', 'SENT', 'FAILED', 'PENDING'].map(s => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatus(s)}>
            {s || 'All'}
          </button>
        ))}
        <input
          className="form-control"
          style={{ maxWidth: 240, marginLeft: 'auto' }}
          placeholder="Search recipient email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Recipient</th><th>Type</th><th>Status</th><th>Attempts</th><th>Sent At</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No email log entries found.</td></tr>
              ) : logs.map(l => (
                <>
                  <tr key={l.id}>
                    <td>{l.recipient}</td>
                    <td style={{ fontSize: 12 }}>{l.email_type || '—'}</td>
                    <td><span className={`badge ${STATUS_BADGE[l.status] || 'badge-warning'}`}>{l.status}</span></td>
                    <td>{l.attempt_count}</td>
                    <td style={{ fontSize: 12 }}>{l.sent_at ? new Date(l.sent_at).toLocaleString('en-IN') : '—'}</td>
                    <td>
                      {l.error_message && (
                        <button className="btn-icon" title="Show error" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                          <i className={`fas fa-chevron-${expandedId === l.id ? 'up' : 'down'}`}></i>
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === l.id && l.error_message && (
                    <tr key={`${l.id}-err`}>
                      <td colSpan={6} style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 12, padding: '10px 14px', fontFamily: 'monospace' }}>
                        {l.error_message}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon, color, bg, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg }}><i className={`fas ${icon}`} style={{ color }}></i></div>
      <div className="stat-content"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}
