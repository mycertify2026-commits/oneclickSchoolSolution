import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';

// Nav structure ported exactly from the prototype's static sidebar markup
// (sa-dashboard.html / school-dashboard.html pattern) - same sections,
// same icons, same hrefs (converted from .html to React Router paths),
// same badge styling. Distributor is upgraded from the prototype's simpler
// dynamic navItem() builder to this same richer chrome, since both
// mechanisms exist across the approved zip and this is the more complete one.
const NAV_CONFIG = {
  superAdmin: {
    logoSub: 'Super Admin',
    userRole: 'Platform Administrator',
    sections: [
      { label: 'MAIN', items: [
        { to: '/sa-dashboard',       icon: 'fa-tachometer-alt', labelKey: 'dashboard',        label: 'Dashboard' },
        { to: '/sa-requested',       icon: 'fa-clock',          labelKey: 'requestedSchools', label: 'Requested Schools' },
        { to: '/sa-schools',         icon: 'fa-school',         labelKey: 'schools',          label: 'Schools' },
        { to: '/sa-employees',       icon: 'fa-users',          labelKey: 'employees',        label: 'Distributors' }
      ]},
      { label: 'CAMPS & ID CARDS', items: [
        { to: '/sa-camp-requests',     icon: 'fa-campground',  label: 'Camp Requests' },
        { to: '/sa-id-card-requests',  icon: 'fa-id-card',     label: 'ID Card Requests' }
      ]},
      { label: 'SYSTEM', items: [
        { to: '/sa-settings', icon: 'fa-cog',       labelKey: 'settings', label: 'Settings' },
        { to: '/sa-reports',  icon: 'fa-chart-bar', labelKey: 'reports',  label: 'Reports' },
        { to: '/sa-wallet',   icon: 'fa-wallet',    labelKey: 'wallet',   label: 'Wallet' }
      ]}
    ]
  },
  schoolAdmin: {
    logoSub: 'School Admin',
    userRole: 'School Administrator',
    sections: [
      { label: 'MAIN', items: [
        { to: '/school-dashboard', icon: 'fa-tachometer-alt', labelKey: 'dashboard',    label: 'Dashboard' },
        { to: '/students',         icon: 'fa-user-graduate',  labelKey: 'students',     label: 'Students' },
        { to: '/certificates',     icon: 'fa-certificate',    labelKey: 'certificates', label: 'Certificates' },
        { to: '/camp-requests',    icon: 'fa-campground',                               label: 'Camp Requests' }
      ]},
      { label: 'SCHOOL', items: [
        { to: '/certificate-templates', icon: 'fa-drafting-compass', label: 'Certificate Templates' },
        { to: '/school-settings', icon: 'fa-cog', labelKey: 'settings', label: 'Settings' }
      ]}
    ]
  },
  distributor: {
    logoSub: 'Distributor',
    userRole: 'Distribution Partner',
    sections: [
      { label: 'MAIN', items: [
        { to: '/dist-dashboard',  icon: 'fa-tachometer-alt', labelKey: 'dashboard',  label: 'Dashboard' },
        { to: '/dist-schools',    icon: 'fa-school',         labelKey: 'schools',    label: 'My Schools' },
        { to: '/dist-commission', icon: 'fa-rupee-sign',     labelKey: 'commission', label: 'Commission' }
      ]},
      { label: 'CAMPS & ID CARDS', items: [
        { to: '/dist-camp-requests',    icon: 'fa-campground', label: 'Camp Requests' },
        { to: '/dist-id-card-requests', icon: 'fa-id-card',    label: 'ID Card Requests' }
      ]},
      { label: 'ACCOUNT', items: [
        { to: '/dist-settings', icon: 'fa-cog', labelKey: 'settings', label: 'Settings' }
      ]}
    ]
  },
  superDistributor: {
    logoSub: 'Super Distributor',
    userRole: 'District Partner',
    sections: [
      { label: 'MAIN', items: [
        { to: '/sd-dashboard',    icon: 'fa-tachometer-alt', label: 'Dashboard' },
        { to: '/sd-schools',      icon: 'fa-school',         label: 'Schools' },
        { to: '/sd-distributors', icon: 'fa-users',          label: 'Distributors' }
      ]},
      { label: 'CAMPS & ID CARDS', items: [
        { to: '/sd-camp-requests',    icon: 'fa-campground', label: 'Camp Requests' },
        { to: '/sd-id-card-requests', icon: 'fa-id-card',    label: 'ID Card Requests' }
      ]},
      { label: 'ACCOUNT', items: [
        { to: '/sd-settings', icon: 'fa-cog', label: 'Settings' }
      ]}
    ]
  }
};

const DASHBOARD_LINK = { superAdmin: '/sa-dashboard', schoolAdmin: '/school-dashboard', distributor: '/dist-dashboard', superDistributor: '/sd-dashboard' };

export default function Sidebar({ role, pendingCount = 0 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const config = NAV_CONFIG[role];
  if (!config) return null;

  const userInitial = (user?.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  async function handleLogout() {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
      navigate('/', { replace: true });
    }
  }

  return (
    <aside className="sidebar" id="sidebar">
      <Link className="sidebar-logo" to={DASHBOARD_LINK[role]}>
        <div className="sidebar-logo-icon"><i className="fas fa-graduation-cap"></i></div>
        <div className="sidebar-logo-text">
          <h3>{t('platformName')}</h3>
          <span>{config.logoSub}</span>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {config.sections.map(section => (
          <div key={section.label}>
            <div className="nav-section">{section.label}</div>
            {section.items.map(item => {
              const isActive = location.pathname === item.to;
              return (
                <Link key={item.to} to={item.to} className={`nav-item ${isActive ? 'active' : ''}`}>
                  <i className={`fas ${item.icon}`}></i>
                  <span>{t(item.labelKey) || item.label}</span>
                  {item.to === '/sa-requested' && pendingCount > 0 && (
                    <span style={{ background: '#EF4444', color: 'white', fontSize: 10, padding: '1px 6px', borderRadius: 10, marginLeft: 'auto' }}>{pendingCount}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={handleLogout}>
          <div className="user-avatar">{userInitial}</div>
          <div className="user-info">
            <div className="user-name">{user?.name || config.logoSub}</div>
            <div className="user-role">{config.userRole}</div>
          </div>
          <i className="fas fa-sign-out-alt" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}></i>
        </div>
      </div>
    </aside>
  );
}
