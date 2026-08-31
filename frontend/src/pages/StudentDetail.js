import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

const TYPE_LABELS = { lc: 'Leaving Certificate', bonafide: 'Bonafide Certificate', idcard: 'Student ID Card' };

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [studentRes, certsRes] = await Promise.all([
        api.get(`/students/${id}`),
        api.get('/certificates')
      ]);
      setStudent(studentRes.data.student);
      setCertificates(certsRes.data.certificates.filter(c => c.student_id === id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleDownload(certId, serial) {
    try {
      const res = await api.get(`/certificates/${certId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${serial}.pdf`;
      link.click();
    } catch (err) {
      alert(err.response?.data?.error || 'Download failed');
    }
  }

  if (loading) return <Layout role="schoolAdmin"><div>Loading...</div></Layout>;
  if (!student) return <Layout role="schoolAdmin"><div>Student not found. <Link to="/students">Back to Students</Link></div></Layout>;

  const aadhaarFormatted = student.aadhaar ? student.aadhaar.replace(/(\d{4})/g, '$1 ').trim() : '-';

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Student Details</h1>
          <nav style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <Link to="/students" style={{ color: 'var(--primary)' }}>Students</Link> › <span>{student.full_name}</span>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => navigate(`/students/${id}/edit`)}><i className="fas fa-edit"></i> Edit</button>
          <button className="btn btn-primary" onClick={() => navigate(`/certificates?studentId=${id}`)}><i className="fas fa-file-certificate"></i> Certificate</button>
          <button className="btn btn-outline" onClick={() => navigate('/students')}><i className="fas fa-arrow-left"></i> Back</button>
        </div>
      </div>

      <div className="profile-card" style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, flexShrink: 0 }}>
          {(student.full_name || '?').charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>{student.full_name}</h2>
          <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Register No.: {student.register_number || '-'}</p>
          <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Serial No.: {student.serial_id || '-'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <span className="profile-badge" style={{ background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: 14, fontSize: 12 }}>{student.gender === 'Male' ? 'Male' : 'Female'}</span>
            <span className="profile-badge" style={{ background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: 14, fontSize: 12 }}>Standard {student.admission_standard || '-'} - {student.admission_division || '-'}</span>
            <span className="profile-badge" style={{ background: 'var(--bg-secondary)', padding: '4px 12px', borderRadius: 14, fontSize: 12 }}>{student.religion || '-'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Aadhaar No.</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>{aadhaarFormatted}</div>
        </div>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[['personal', 'Personal Information'], ['academic', 'Academic Information'], ['certificates', 'Certificates']].map(([key, label]) => (
          <button
            key={key}
            className={`tab-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
            style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', borderBottom: activeTab === key ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === key ? 'var(--primary)' : 'var(--text-secondary)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'personal' && (
        <>
          <div className="card">
            <div className="card-header"><h3 className="card-title"><i className="fas fa-user"></i> Personal Information</h3></div>
            <div style={{ padding: 16 }}>
              <DetailGrid items={[
                ['Full Name', student.full_name], ['Mother\'s Name', student.mother_name],
                ['Gender', student.gender === 'Male' ? 'Male' : 'Female'],
                ['Nationality', student.nationality], ['Mother Tongue', student.mother_tongue],
                ['Religion', student.religion], ['Caste', student.caste], ['Sub-caste', student.sub_caste], ['Aadhaar No.', student.aadhaar]
              ]} />
            </div>
          </div>
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header"><h3 className="card-title"><i className="fas fa-birthday-cake"></i> Birth Information</h3></div>
            <div style={{ padding: 16 }}>
              <DetailGrid items={[
                ['Date of Birth', student.dob ? new Date(student.dob).toLocaleDateString('en-IN') : '-'],
                ['Birth Village', student.birth_village], ['Birth Taluka', student.birth_taluka],
                ['Birth District', student.birth_district], ['Birth State', student.birth_state], ['Birth Country', student.birth_country]
              ]} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'academic' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><i className="fas fa-graduation-cap"></i> Admission Information</h3></div>
          <div style={{ padding: 16 }}>
            <DetailGrid items={[
              ['Admission Standard', student.admission_standard], ['Division', student.admission_division],
              ['Admission Date', student.admission_date ? new Date(student.admission_date).toLocaleDateString('en-IN') : '-'],
              ['Previous School', student.prev_school], ['Previous Standard', student.prev_standard]
            ]} />
          </div>
        </div>
      )}

      {activeTab === 'certificates' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
            <CertActionCard icon="fa-file-alt" color="var(--primary)" bg="rgba(26,111,212,.1)" title="Leaving Certificate" sub="Generate LC" onClick={() => navigate(`/certificates?studentId=${id}`)} />
            <CertActionCard icon="fa-certificate" color="var(--success)" bg="rgba(16,185,129,.1)" title="Bonafide Certificate" sub="Generate Bonafide" onClick={() => navigate(`/certificates?studentId=${id}`)} />
            <CertActionCard icon="fa-id-card" color="#f97316" bg="rgba(249,115,22,.1)" title="Student ID Card" sub="Generate ID Card" onClick={() => navigate(`/certificates?studentId=${id}`)} />
          </div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Certificate History</h3></div>
            <table className="mini-cert-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr><th style={th}>Type</th><th style={th}>Date</th><th style={th}>Validity</th><th style={th}>Action</th></tr></thead>
              <tbody>
                {certificates.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No certificates generated yet</td></tr>
                ) : certificates.map(c => {
                  const daysLeft = Math.ceil((new Date(c.expires_at) - Date.now()) / 86400000);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}><span className="badge badge-info">{TYPE_LABELS[c.type] || c.type}</span></td>
                      <td style={td}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                      <td style={td}>{daysLeft > 0 ? <span style={{ color: 'var(--success)' }}>{daysLeft} days left</span> : <span style={{ color: 'var(--text-secondary)' }}>Expired</span>}</td>
                      <td style={td}><button className="btn-icon" title="Download" onClick={() => handleDownload(c.id, c.serial_number)}><i className="fas fa-eye"></i></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}

const th = { background: 'var(--bg-secondary)', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' };
const td = { padding: '12px 14px' };

function DetailGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
      {items.map(([label, val]) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{val || '-'}</div>
        </div>
      ))}
    </div>
  );
}
function CertActionCard({ icon, color, bg, title, sub, onClick }) {
  return (
    <div className="cert-action-card" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', background: '#fff' }}>
      <div className="cert-icon" style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className={`fas ${icon}`} style={{ color }}></i></div>
      <div><div style={{ fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div></div>
      <i className="fas fa-arrow-right" style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}></i>
    </div>
  );
}
