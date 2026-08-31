import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import api from '../api/client';

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api.get('/notifications');
    setNotifications(res.data.notifications);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(id) {
    await api.put(`/notifications/${id}/read`);
    load();
  }
  async function markAllRead() {
    await api.put('/notifications/read-all');
    load();
  }

  return (
    <Layout role={user?.role}>
      <div className="page-header">
        <div><h1 className="page-title">Notifications</h1></div>
        <div><button className="btn btn-outline btn-sm" onClick={markAllRead}>Mark All as Read</button></div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 24 }}>Loading...</div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No notifications</div>
        ) : (
          <div>
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{ display: 'flex', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--border)', cursor: n.is_read ? 'default' : 'pointer', background: n.is_read ? '#fff' : 'var(--primary-light)' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(26,111,212,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fas fa-bell" style={{ color: 'var(--primary)', fontSize: 14 }}></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{n.text}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{new Date(n.created_at).toLocaleString('en-IN')}</div>
                </div>
                {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0, marginTop: 6 }}></span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
