import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { StatusBadge } from './DistDashboard';
import api from '../api/client';

const TABS = [
  { key: '', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'active', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }
];

export default function DistSchools() {
  const [schools, setSchools] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async (status) => {
    const res = await api.get('/distributors/me/schools', { params: status ? { status } : {} });
    setSchools(res.data.schools);
  }, []);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  async function handleWithdraw(school) {
    if (!window.confirm(`Withdraw the submission for "${school.name}"?`)) return;
    try {
      await api.delete(`/distributors/me/schools/${school.id}`);
      load(activeTab);
    } catch (err) {
      alert(err.response?.data?.error || 'Error while withdrawing');
    }
  }

  return (
    <Layout role="distributor">
      <div className="page-header">
        <div><h1 className="page-title">My Schools</h1><p className="page-subtitle">All schools you have added</p></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dist-schools/new')}><i className="fas fa-plus"></i> Add School</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {TABS.map(tab => (
          <button key={tab.key} className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      <div className="school-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {schools.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            <i className="fas fa-school" style={{ fontSize: 48, marginBottom: 12, display: 'block', opacity: 0.3 }}></i>
            No schools in this category
          </div>
        ) : schools.map(s => (
          <div key={s.id} className="school-card" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div className="school-card-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
              <div className="school-icon" style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(26,111,212,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--primary)', flexShrink: 0 }}>
                <i className="fas fa-school"></i>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.city || '-'}, {s.district || '-'}</div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span><i className="fas fa-user"></i> {s.admin_name || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}><i className="fas fa-wallet"></i> ₹{Number(s.wallet_balance || 0).toLocaleString('en-IN')}</span>
              {s.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-icon" title="Edit" onClick={() => navigate(`/dist-schools/${s.id}/edit`, { state: { school: s } })}><i className="fas fa-edit"></i></button>
                  <button className="btn-icon" title="Withdraw" onClick={() => handleWithdraw(s)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
