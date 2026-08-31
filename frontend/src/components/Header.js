import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SETTINGS_LINK = {
  superAdmin: '/sa-settings',
  distributor: '/dist-settings',
  schoolAdmin: '/school-settings'
};

// Ported verbatim (markup, classes, inline styles) from the prototype's
// buildHeader() in js/ui.js - only the templating mechanism changed
// (innerHTML string -> JSX), not the visual output.
export default function Header({ role, notifications = [] }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const wrapRef = useRef(null);

  const unread = notifications.filter(n => !n.read).length;
  const userName = user?.name || 'Admin';
  const userInitial = userName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'A';
  const settingsLink = SETTINGS_LINK[role] || '/school-settings';

  useEffect(() => {
    function handleOutsideClick() {
      setNotifOpen(false);
      setProfileOpen(false);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  async function handleLogout(e) {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="app-header" ref={wrapRef}>
      <button className="mobile-menu-btn" id="mobileSidebarToggle" onClick={() => document.getElementById('sidebar')?.classList.toggle('open')}>
        <i className="fas fa-bars"></i>
      </button>
      <div className="header-title" id="headerTitle">One Click School Solutions</div>
      <div className="header-actions">
        <div className="dropdown" style={{ position: 'relative' }}>
          <button
            className="header-btn"
            id="notifBtn"
            title="Notifications"
            style={{ position: 'relative' }}
            onClick={(e) => { e.stopPropagation(); setProfileOpen(false); setNotifOpen(o => !o); }}
          >
            <i className="fas fa-bell"></i>
            {unread > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }}></span>
            )}
          </button>
          {notifOpen && (
            <div id="notifPanel" style={{ display: 'block', position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 320, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.15)', border: '1px solid var(--border)', zIndex: 2000 }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Notifications</h4>
                {unread > 0 && <span className="badge badge-primary">{unread} new</span>}
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No notifications</div>
                ) : (
                  notifications.slice(0, 5).map((n, i) => (
                    <div className={`notif-item ${n.read ? '' : 'unread'}`} key={i}>
                      <div className="notif-icon"><i className="fas fa-bell"></i></div>
                      <div>
                        <div className="notif-text">{n.text}</div>
                        <div className="notif-time">{n.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <a href="/notifications" style={{ display: 'block', textAlign: 'center', padding: '10px', fontSize: 12, color: 'var(--primary)', borderTop: '1px solid var(--border)', textDecoration: 'none' }}>View all notifications</a>
            </div>
          )}
        </div>

        <div className="dropdown" style={{ position: 'relative' }}>
          <div
            id="profileTrigger"
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, transition: 'background .2s' }}
            onClick={(e) => { e.stopPropagation(); setNotifOpen(false); setProfileOpen(o => !o); }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div className="user-avatar" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{userInitial}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</span>
            <i className="fas fa-chevron-down" style={{ fontSize: 10, color: 'var(--text-secondary)' }}></i>
          </div>
          {profileOpen && (
            <div id="profileMenu" style={{ display: 'block', position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 200, background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.15)', border: '1px solid var(--border)', zIndex: 2000, overflow: 'hidden' }}>
              <a href={settingsLink} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <i className="fas fa-cog" style={{ color: 'var(--primary)', width: 16 }}></i> Settings
              </a>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}></div>
              <div onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 13, color: '#ef4444', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#fff5f5'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <i className="fas fa-sign-out-alt" style={{ width: 16 }}></i> Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
