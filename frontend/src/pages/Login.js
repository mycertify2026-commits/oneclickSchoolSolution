import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';


const REDIRECTS = { superAdmin: '/sa-dashboard', schoolAdmin: '/school-dashboard', distributor: '/dist-dashboard', superDistributor: '/sd-dashboard' };

export default function Login({ role }) {
  const [currentRole, setCurrentRole] = useState(role || 'superAdmin');
  const fixedRole = !!role;
  const [saEmail, setSaEmail] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [schLoginId, setSchLoginId] = useState('');
  const [schPassword, setSchPassword] = useState('');
  const [distUsername, setDistUsername] = useState('');
  const [distPassword, setDistPassword] = useState('');
  const [showSaPass, setShowSaPass] = useState(false);
  const [showSchPass, setShowSchPass] = useState(false);
  const [showDistPass, setShowDistPass] = useState(false);
  const [showSdPass, setShowSdPass] = useState(false);
  const [sdEmail, setSdEmail] = useState('');
  const [sdPassword, setSdPassword] = useState('');
  const [error, setError] = useState({ sa: '', sch: '', dist: '', sd: '' });
  const [errorCode, setErrorCode] = useState({ sa: null, sch: null, dist: null, sd: null });
  const [loading, setLoading] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState(false);

  const { user, login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && REDIRECTS[user.role]) navigate(REDIRECTS[user.role]);
  }, [user, navigate]);

  // Picks up the flag set by api/client.js's clearSessionAndRedirect() when
  // a refresh-token failure forced a logout (as opposed to the user
  // clicking Logout themselves) - shows "Session Expired" once, then clears
  // the flag so a later manual logout->login doesn't show it again.
  useEffect(() => {
    if (sessionStorage.getItem('cp_session_expired') === '1') {
      setSessionExpiredMsg(true);
      sessionStorage.removeItem('cp_session_expired');
    }
  }, []);

  async function doLogin(role) {
    setError({ sa: '', sch: '', dist: '', sd: '' });
    setErrorCode({ sa: null, sch: null, dist: null, sd: null });
    setLoading(true);
    try {
      let identifier, password;
      if (role === 'superAdmin') { identifier = saEmail; password = saPassword; }
      else if (role === 'schoolAdmin') { identifier = schLoginId; password = schPassword; }
      else if (role === 'superDistributor') { identifier = sdEmail; password = sdPassword; }
      else { identifier = distUsername; password = distPassword; }

      const loggedInUser = await login(identifier, password, role);
      navigate(REDIRECTS[loggedInUser.role]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid credentials. Please check your login details.';
      const code = err.response?.data?.code;
      const key = role === 'superAdmin' ? 'sa' : role === 'schoolAdmin' ? 'sch' : role === 'superDistributor' ? 'sd' : 'dist';
      setError(prev => ({ ...prev, [key]: msg }));
      setErrorCode(prev => ({ ...prev, [key]: code || null }));
    } finally {
      setLoading(false);
    }
  }

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
          {sessionExpiredMsg && (
            <div style={{ background: '#FEF3C7', color: '#92400E', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-clock"></i> Your session has expired. Please log in again.
            </div>
          )}
          <h2 style={{ marginBottom: 4 }}>Welcome Back 👋</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Sign in to your account to continue</p>

          {fixedRole ? (
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                {currentRole === 'superAdmin' ? t('superAdminLogin')
                  : currentRole === 'schoolAdmin' ? t('schoolAdminLogin')
                  : currentRole === 'distributor' ? t('distributorLogin')
                  : 'Super Distributor Login'}
              </span>
            </div>
          ) : (
            <div className="login-role-tabs">
              <div className={`login-role-tab ${currentRole === 'superAdmin' ? 'active' : ''}`} onClick={() => setCurrentRole('superAdmin')}>{t('superAdminLogin')}</div>
              <div className={`login-role-tab ${currentRole === 'schoolAdmin' ? 'active' : ''}`} onClick={() => setCurrentRole('schoolAdmin')}>{t('schoolAdminLogin')}</div>
              <div className={`login-role-tab ${currentRole === 'distributor' ? 'active' : ''}`} onClick={() => setCurrentRole('distributor')}>{t('distributorLogin')}</div>
              <div className={`login-role-tab ${currentRole === 'superDistributor' ? 'active' : ''}`} onClick={() => setCurrentRole('superDistributor')}>Super Distributor</div>
            </div>
          )}

          {currentRole === 'superAdmin' && (
            <div className="login-tabs-content active" id="superAdminForm">
              <div className="form-group">
                <label className="form-label">{t('email')}</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-envelope" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type="email" className="form-control" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder="admin@certifypro.in" style={{ paddingLeft: 38 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('password')}</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type={showSaPass ? 'text' : 'password'} className="form-control" value={saPassword} onChange={e => setSaPassword(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 38, paddingRight: 40 }} />
                  <button className="show-password-btn" type="button" onClick={() => setShowSaPass(s => !s)}><i className={`fas ${showSaPass ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked /> <span>{t('rememberMe')}</span>
                </label>
                <a href="/forgot-password" style={{ fontSize: 13, color: 'var(--primary)' }}>{t('forgotPassword')}</a>
              </div>
              {error.sa && <div className="form-error" style={{ display: 'block', color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: 10, background: '#FEE2E2', borderRadius: 8 }}>{error.sa}</div>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => doLogin('superAdmin')} disabled={loading}>
                <i className="fas fa-sign-in-alt"></i> <span>{loading ? '...' : t('loginBtn')}</span>
              </button>
            </div>
          )}

          {currentRole === 'schoolAdmin' && (
            <div className="login-tabs-content active" id="schoolAdminForm">
              <div className="form-group">
                <label className="form-label">{t('loginId')}</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-id-badge" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type="text" className="form-control" value={schLoginId} onChange={e => setSchLoginId(e.target.value)} placeholder="SCH001" style={{ paddingLeft: 38 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('password')}</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type={showSchPass ? 'text' : 'password'} className="form-control" value={schPassword} onChange={e => setSchPassword(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 38, paddingRight: 40 }} />
                  <button className="show-password-btn" type="button" onClick={() => setShowSchPass(s => !s)}><i className={`fas ${showSchPass ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <a href="/forgot-password" style={{ fontSize: 13, color: 'var(--primary)' }}>{t('forgotPassword')}</a>
              </div>
              {error.sch && (
                <div
                  className="form-error"
                  style={{
                    display: 'block', fontSize: 13, marginBottom: 12, padding: 10, borderRadius: 8,
                    ...(errorCode.sch === 'SCHOOL_PENDING_APPROVAL'
                      ? { color: '#92400E', background: '#FEF3C7' }
                      : { color: 'var(--danger)', background: '#FEE2E2' })
                  }}
                >
                  {errorCode.sch === 'SCHOOL_PENDING_APPROVAL' && <i className="fas fa-clock" style={{ marginRight: 6 }}></i>}
                  {error.sch}
                </div>
              )}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => doLogin('schoolAdmin')} disabled={loading}>
                <i className="fas fa-sign-in-alt"></i> <span>{loading ? '...' : t('loginBtn')}</span>
              </button>
            </div>
          )}

          {currentRole === 'distributor' && (
            <div className="login-tabs-content active" id="distributorForm">
              <div className="form-group">
                <label className="form-label">{t('username')}</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-user" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type="text" className="form-control" value={distUsername} onChange={e => setDistUsername(e.target.value)} placeholder="dist01" style={{ paddingLeft: 38 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('password')}</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type={showDistPass ? 'text' : 'password'} className="form-control" value={distPassword} onChange={e => setDistPassword(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 38, paddingRight: 40 }} />
                  <button className="show-password-btn" type="button" onClick={() => setShowDistPass(s => !s)}><i className={`fas ${showDistPass ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <a href="/forgot-password" style={{ fontSize: 13, color: 'var(--primary)' }}>{t('forgotPassword')}</a>
              </div>
              {error.dist && <div className="form-error" style={{ display: 'block', color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: 10, background: '#FEE2E2', borderRadius: 8 }}>{error.dist}</div>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => doLogin('distributor')} disabled={loading}>
                <i className="fas fa-sign-in-alt"></i> <span>{loading ? '...' : t('loginBtn')}</span>
              </button>
            </div>
          )}

          {currentRole === 'superDistributor' && (
            <div className="login-tabs-content active" id="sdForm">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-envelope" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type="email" className="form-control" value={sdEmail} onChange={e => setSdEmail(e.target.value)} placeholder="superDist@example.com" style={{ paddingLeft: 38 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-group" style={{ position: 'relative' }}>
                  <i className="fas fa-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', fontSize: 13 }}></i>
                  <input type={showSdPass ? 'text' : 'password'} className="form-control" value={sdPassword} onChange={e => setSdPassword(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 38, paddingRight: 40 }} />
                  <button className="show-password-btn" type="button" onClick={() => setShowSdPass(s => !s)}><i className={`fas ${showSdPass ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <a href="/forgot-password" style={{ fontSize: 13, color: 'var(--primary)' }}>Forgot Password?</a>
              </div>
              {error.sd && <div className="form-error" style={{ display: 'block', color: 'var(--danger)', fontSize: 13, marginBottom: 12, padding: 10, background: '#FEE2E2', borderRadius: 8 }}>{error.sd}</div>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => doLogin('superDistributor')} disabled={loading}>
                <i className="fas fa-sign-in-alt"></i> <span>{loading ? '...' : 'Sign In'}</span>
              </button>
            </div>
          )}

          <div style={{ marginTop: 28, textAlign: 'center', color: 'var(--text-light)', fontSize: 12 }}>
            © 2026 One Click School Solutions. All rights reserved. | v2.0
          </div>
        </div>
      </div>
    </div>
  );
}
