import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import api from '../api/client';

export default function Layout({ role, pendingCount, children }) {
  const [notifications, setNotifications] = useState([]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications.map(n => ({ text: n.text, time: new Date(n.created_at).toLocaleString('en-IN'), read: Boolean(n.is_read) })));
    } catch (e) {
      // Non-fatal - header just shows an empty bell if this fails (e.g. on the login page where there's no Layout/no token yet).
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  return (
    <div className="app-layout">
      <Sidebar role={role} pendingCount={pendingCount} />
      <div className="main-content">
        <div id="headerMount">
          <Header role={role} notifications={notifications} />
        </div>
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}
