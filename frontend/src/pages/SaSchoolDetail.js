import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

function ResetPasswordButton({ schoolId, loginId }) {
  const [show, setShow]       = useState(false);
  const [pwd, setPwd]         = useState('School@123');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');

  async function doReset() {
    setLoading(true); setMsg('');
    try {
      await api.post(`/schools/${schoolId}/reset-admin-password`, { newPassword: pwd });
      setMsg(`✅ Password reset to "${pwd}". Share it with the school admin.`);
      setShow(false);
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.error || 'Reset failed'));
    } finally { setLoading(false); }
  }

  return (
    <>
      <button className="btn btn-sm btn-outline" onClick={() => { setShow(true); setMsg(''); }}>
        <i className="fas fa-key" style={{ marginRight: 6 }}></i>Reset Password
      </button>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.startsWith('✅') ? '#15803d' : '#dc2626' }}>{msg}</div>}
      {show && (
        <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) setShow(false); }}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="card-header">
              <h3>Reset Password — {loginId}</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShow(false)}>✕</button>
            </div>
            <div style={{ padding: '16px 0' }}>
              <label className="form-label">New Password</label>
              <input className="form-control" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Min 6 characters" style={{ marginBottom: 16 }} />
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || pwd.length < 6} onClick={doReset}>
                {loading ? 'Resetting…' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const TABS = [
  { key: 'info', label: 'School Information' },
  { key: 'lc', label: 'Leaving Certificate' },
  { key: 'bonafide', label: 'Bonafide Certificate' },
  { key: 'idcard', label: 'Student ID Card' }
];

export default function SaSchoolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [schoolRes, studentsRes, certsRes] = await Promise.all([
        api.get(`/schools/${id}`),
        api.get(`/schools/${id}/students`),
        api.get(`/schools/${id}/certificates`)
      ]);
      setSchool(schoolRes.data.school);
      setStudents(studentsRes.data.students);
      setCertificates(certsRes.data.certificates);
    } catch (err) {
      // Show the real reason (401/403/500/network) instead of always
      // saying "School not found", which was masking the actual problem.
      setLoadError(err.response?.data?.error || err.message || 'Failed to load school');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Layout role="superAdmin"><div>Loading...</div></Layout>;
  if (loadError || !school) return (
    <Layout role="superAdmin">
      <div style={{ padding: 20 }}>
        <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          {loadError || 'School not found'}
        </div>
        <Link to="/sa-schools">Back to Schools</Link>
      </div>
    </Layout>
  );

  const lcList = certificates.filter(c => c.type === 'lc');
  const bonList = certificates.filter(c => c.type === 'bonafide');
  const idList = certificates.filter(c => c.type === 'idcard');

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">School Details</h1>
          <nav style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <Link to="/sa-schools" style={{ color: 'var(--primary)' }}>Schools</Link> › <span>{school.name}</span>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => navigate('/sa-schools')}><i className="fas fa-arrow-left"></i> Back</button>
        </div>
      </div>

      <div className="school-hero" style={{ background: 'linear-gradient(135deg,#0F1E3D,#1A6FD4)', borderRadius: 16, padding: 28, color: '#fff', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,.15)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}><i className="fas fa-school"></i></div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{school.name}</h2>
              <div style={{ opacity: 0.7, fontSize: 13 }}>U-DISE: {school.udise_code || '-'}</div>
            </div>
            <span className={`badge ${school.status === 'active' ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: 'auto' }}>{school.status === 'active' ? 'Active' : school.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
            <HeroMetaItem icon="fa-map-marker-alt" text={school.district || '-'} />
            <HeroMetaItem icon="fa-phone" text={school.phone || '-'} />
            <HeroMetaItem icon="fa-envelope" text={school.email || '-'} />
            <HeroMetaItem icon="fa-chalkboard-teacher" text={`${school.medium || '-'} Medium`} />
            <HeroMetaItem icon="fa-award" text={school.board || '-'} />
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard icon="fa-users" color="var(--primary)" bg="rgba(26,111,212,.1)" value={students.length} label="Total Students" />
        <StatCard icon="fa-file-alt" color="#f97316" bg="rgba(249,115,22,.1)" value={lcList.length} label="Leaving Certificate" />
        <StatCard icon="fa-certificate" color="var(--success)" bg="rgba(16,185,129,.1)" value={bonList.length} label="Bonafide Certificate" />
        <StatCard icon="fa-id-card" color="#7c3aed" bg="rgba(124,58,237,.1)" value={idList.length} label="Student ID Card" />
      </div>

      <div className="tabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-header"><h3 className="card-title">Basic Information</h3></div>
              <div style={{ padding: 16 }}>
                <InfoGrid items={[
                  ['School Name', school.name], ['U-DISE No.', school.udise_code], ['Village/City', school.city],
                  ['Taluka', school.taluka], ['District', school.district], ['PIN Code', school.pin_code],
                  ['Phone', school.phone], ['Email', school.email], ['Login ID', school.login_id]
                ]} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="card-title">School Classification</h3></div>
              <div style={{ padding: 16 }}>
                <InfoGrid items={[
                  ['Medium', school.medium], ['Board', school.board], ['Status', school.status],
                  ['Wallet Balance', `₹${Number(school.wallet_balance || 0).toLocaleString('en-IN')}`]
                ]} />
              </div>
            </div>
          </div>
          {(school.inside_photo_url || school.outside_photo_url) && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header"><h3 className="card-title">School Verification Photos</h3></div>
              <div style={{ padding: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <SchoolPhotoCard label="Inside" url={school.inside_photo_url} lat={school.inside_photo_lat} lng={school.inside_photo_lng} />
                <SchoolPhotoCard label="Outside" url={school.outside_photo_url} lat={school.outside_photo_lat} lng={school.outside_photo_lng} />
              </div>
            </div>
          )}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <h3 className="card-title">School Administrator</h3>
              <ResetPasswordButton schoolId={school.id} loginId={school.login_id} />
            </div>
            <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>
                {(school.admin_name || '?').charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{school.admin_name || '-'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                  <i className="fas fa-envelope"></i> {school.admin_email || '-'} &nbsp; <i className="fas fa-phone"></i> {school.phone || '-'}
                </div>
                <div style={{ marginTop: 6 }}><span className="badge badge-info">Login ID: {school.login_id || '-'}</span></div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'lc' && <CertTable list={lcList} columns={['Sr. No.', 'Certificate No.', 'Student', 'Standard', 'Date']} />}
      {activeTab === 'bonafide' && <CertTable list={bonList} columns={['Sr. No.', 'Certificate No.', 'Student', 'Standard', 'Date']} />}
      {activeTab === 'idcard' && <CertTable list={idList} columns={['Sr. No.', 'ID Card No.', 'Student', 'Standard', 'Date', 'Validity']} showValidity />}
    </Layout>
  );
}

async function handleAdminDownload(certId, serial) {
  try {
    const res = await api.get(`/certificates/${certId}/admin-download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${serial}.pdf`;
    link.click();
  } catch (err) {
    alert(err.response?.data?.error || 'Download failed');
  }
}

function HeroMetaItem({ icon, text }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.85 }}><i className={`fas ${icon}`}></i> {text}</div>;
}
function StatCard({ icon, color, bg, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg }}><i className={`fas ${icon}`} style={{ color }}></i></div>
      <div className="stat-content"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
    </div>
  );
}
function InfoGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {items.map(([label, val], i) => (
        <div key={label} style={{ padding: '14px 16px', borderRight: (i + 1) % 3 !== 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{val || '-'}</div>
        </div>
      ))}
    </div>
  );
}
function SchoolPhotoCard({ label, url, lat, lng }) {
  if (!url) return null;
  const src = `/uploads/school-photos/${String(url).split(/[\\/]/).pop()}`;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <img src={src} alt={`School ${label.toLowerCase()}`} style={{ width: 220, height: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
      {lat && lng && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          <i className="fas fa-map-marker-alt"></i> {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
        </div>
      )}
    </div>
  );
}
function CertTable({ list, columns, showValidity }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">List ({list.length})</h3></div>
      <table className="cert-mini-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{columns.map(c => <th key={c} style={{ background: 'var(--bg-secondary)', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{c}</th>)}<th style={{ background: 'var(--bg-secondary)', padding: '10px 14px' }}>Action</th></tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No certificates yet</td></tr>
          ) : list.map((c, i) => {
            const daysLeft = Math.ceil((new Date(c.expires_at) - Date.now()) / 86400000);
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px' }}>{i + 1}</td>
                <td style={{ padding: '12px 14px' }}><span style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{c.serial_number}</span></td>
                <td style={{ padding: '12px 14px' }}>{c.student_name}</td>
                <td style={{ padding: '12px 14px' }}>{c.admission_standard || '-'}</td>
                <td style={{ padding: '12px 14px' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                {showValidity && <td style={{ padding: '12px 14px' }}>{daysLeft > 0 ? <span style={{ color: 'var(--success)' }}>{daysLeft} days</span> : <span style={{ color: 'var(--danger)' }}>Expired</span>}</td>}
                <td style={{ padding: '12px 14px' }}><button className="btn-icon" title="View / Download" onClick={() => handleAdminDownload(c.id, c.serial_number)}><i className="fas fa-eye"></i></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
