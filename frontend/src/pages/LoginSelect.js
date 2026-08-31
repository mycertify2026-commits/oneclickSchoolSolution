import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';

const REDIRECTS = { superAdmin: '/sa-dashboard', schoolAdmin: '/school-dashboard', distributor: '/dist-dashboard', superDistributor: '/sd-dashboard' };

const ROLES = [
  { path: '/login/super-admin',       icon: 'fa-user-shield',    title: 'Super Admin',       desc: 'Platform administration' },
  { path: '/login/school',            icon: 'fa-school',         title: 'School Admin',      desc: 'Manage students & certificates' },
  { path: '/login/distributor',       icon: 'fa-handshake',      title: 'Distributor',       desc: 'Manage your schools' },
  { path: '/login/super-distributor', icon: 'fa-network-wired',  title: 'Super Distributor', desc: 'Manage your distributors' },
];

export default function LoginSelect() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && REDIRECTS[user.role]) navigate(REDIRECTS[user.role]);
  }, [user, navigate]);

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-brand-icon"><i className="fas fa-graduation-cap"></i></div>
          <div className="login-brand-text">
            <h2>{t('platformName')}</h2>
            <p>{t('platformTagline')}</p>
          </div>
        </div>
        <div className="login-hero-text">
          <h1>Modernize Your School Certificate Workflow</h1>
          <p>Generate, manage, and distribute school certificates with ease. Built for Maharashtra schools in Marathi, Hindi & English.</p>
        </div>
        <div className="login-features">
          <div className="login-feature"><i className="fas fa-check-circle"></i> Leaving Certificates in seconds</div>
          <div className="login-feature"><i className="fas fa-check-circle"></i> Bonafide Certificates anytime</div>
          <div className="login-feature"><i className="fas fa-check-circle"></i> Student ID Cards with photo</div>
          <div className="login-feature"><i className="fas fa-check-circle"></i> Full Marathi language support</div>
          <div className="login-feature"><i className="fas fa-check-circle"></i> Cloud-based & secure</div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-box">
          <h2 style={{ marginBottom: 4 }}>Welcome 👋</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Choose your login type to continue</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ROLES.map(r => (
              <Link
                key={r.path}
                to={r.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 12, textDecoration: 'none', color: 'inherit',
                  background: '#fff', transition: 'box-shadow .15s',
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 10, background: 'var(--bg, #f1f5f9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--primary)', fontSize: 17, flexShrink: 0,
                }}>
                  <i className={`fas ${r.icon}`}></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{r.desc}</div>
                </div>
                <i className="fas fa-chevron-right" style={{ color: 'var(--text-light)', fontSize: 12 }}></i>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: 28, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>
            © 2026 One Click School Solutions. All rights reserved. | v2.0
          </div>
        </div>
      </div>
    </div>
  );
}
