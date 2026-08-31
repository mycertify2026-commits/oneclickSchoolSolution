import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import Layout from '../components/Layout';
import api from '../api/client';

ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const ACTIONS = [
  {
    icon: 'fa-user-plus',
    label: 'Add Student',
    desc: 'Enroll a new student',
    path: '/students/new',
    gradient: 'linear-gradient(135deg,#1A6FD4,#0d4fa8)',
    shadow: 'rgba(26,111,212,.35)',
  },
  {
    icon: 'fa-file-alt',
    label: 'Generate LC',
    desc: 'Leaving Certificate',
    path: '/certificates',
    gradient: 'linear-gradient(135deg,#10B981,#059669)',
    shadow: 'rgba(16,185,129,.35)',
  },
  {
    icon: 'fa-certificate',
    label: 'Bonafide',
    desc: 'Bonafide Certificate',
    path: '/certificates',
    gradient: 'linear-gradient(135deg,#F59E0B,#d97706)',
    shadow: 'rgba(245,158,11,.35)',
  },
  {
    icon: 'fa-id-card',
    label: 'ID Card',
    desc: 'Student Identity Card',
    path: '/certificates',
    gradient: 'linear-gradient(135deg,#8B5CF6,#6d28d9)',
    shadow: 'rgba(139,92,246,.35)',
  },
  {
    icon: 'fa-campground',
    label: 'Request Camp',
    desc: 'Health / Scholarship camp',
    path: '/camp-requests',
    gradient: 'linear-gradient(135deg,#EC4899,#be185d)',
    shadow: 'rgba(236,72,153,.35)',
  },
  {
    icon: 'fa-file-excel',
    label: 'Import Student',
    desc: 'Import from Excel',
    path: '/students/new',
    gradient: 'linear-gradient(135deg,#0F9D58,#087f46)',
    shadow: 'rgba(15,157,88,.35)',
  },
];

export default function SchoolDashboard() {
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [balance, setBalance] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [schoolRes, studentsRes, certsRes, balRes] = await Promise.all([
      api.get('/schools/me'),
      api.get('/students'),
      api.get('/certificates'),
      api.get('/wallet/balance'),
    ]);
    setSchool(schoolRes.data.school);
    setStudents(studentsRes.data.students);
    setCertificates(certsRes.data.certificates);
    setBalance(balRes.data.balance);
  }, []);

  useEffect(() => { load(); }, [load]);

  const certTrendData = {
    labels: ['LC', 'Bonafide', 'ID Card'],
    datasets: [{
      label: 'Issued',
      data: [
        certificates.filter(c => c.type === 'lc').length,
        certificates.filter(c => c.type === 'bonafide').length,
        certificates.filter(c => c.type === 'idcard').length,
      ],
      backgroundColor: ['#1A6FD4', '#10B981', '#F59E0B'],
      borderRadius: 8,
      borderSkipped: false,
    }],
  };

  const studentGrowthData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [{
      label: 'Students',
      data: [students.length * 0.6, students.length * 0.7, students.length * 0.8, students.length * 0.85, students.length * 0.95, students.length].map(Math.round),
      borderColor: '#1A6FD4',
      backgroundColor: 'rgba(26,111,212,.12)',
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#1A6FD4',
      pointRadius: 4,
    }],
  };

  const lcCount       = certificates.filter(c => c.type === 'lc').length;
  const bonafideCount = certificates.filter(c => c.type === 'bonafide').length;
  const idCardCount   = certificates.filter(c => c.type === 'idcard').length;

  return (
    <Layout role="schoolAdmin">

      {/* ── School header ─────────────────────────────────────────── */}
      <div className="school-header-preview" style={{ marginBottom: 28 }}>
        <h2>{school?.name || 'My School'}</h2>
        <p style={{ opacity: 0.85, marginTop: 4, fontSize: 13 }}>
          {[school?.city, school?.district].filter(Boolean).join(', ')}
          {school?.udise_code ? ` | U-DISE: ${school.udise_code}` : ''}
          {school?.medium    ? ` | ${school.medium} Medium`       : ''}
        </p>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
          color: 'var(--text-secondary)', textTransform: 'uppercase',
          marginBottom: 14,
        }}>Quick Actions</div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 14,
          maxWidth: 1120,
          margin: '0 auto',
        }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              style={{
                background: a.gradient,
                border: 'none',
                borderRadius: 16,
                padding: '22px 12px 18px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                boxShadow: `0 8px 24px ${a.shadow}`,
                transition: 'transform 0.18s, box-shadow 0.18s',
                textAlign: 'center',
                 flex: '1 1 145px',
                 maxWidth: 190,
                 minWidth: 145,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 14px 32px ${a.shadow}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${a.shadow}`;
              }}
            >
              {/* Icon circle */}
              <div style={{
                width: 52, height: 52,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)',
              }}>
                <i className={`fas ${a.icon}`} style={{ fontSize: 22, color: '#fff' }}></i>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', marginTop: 3 }}>{a.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3,1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        <StatCard
          icon="fa-user-graduate"
          value={students.length}
          label="Total Students"
          gradient="linear-gradient(135deg,#1A6FD4,#0d4fa8)"
          iconBg="rgba(255,255,255,0.18)"
          sub={`${students.filter(s => s.gender === 'Male').length} boys · ${students.filter(s => s.gender === 'Female').length} girls`}
        />
        <StatCard
          icon="fa-certificate"
          value={certificates.length}
          label="Certificates Issued"
          gradient="linear-gradient(135deg,#10B981,#059669)"
          iconBg="rgba(255,255,255,0.18)"
          sub={`LC ${lcCount} · Bonafide ${bonafideCount} · ID ${idCardCount}`}
        />
        <StatCard
          icon="fa-wallet"
          value={balance === null ? '...' : `₹${Number(balance).toLocaleString('en-IN')}`}
          label="Wallet Balance"
          gradient="linear-gradient(135deg,#8B5CF6,#6d28d9)"
          iconBg="rgba(255,255,255,0.18)"
          sub="Available for certificates"
          onAction={() => navigate('/school-settings')}
          actionLabel="Recharge →"
        />
      </div>

      {/* ── Charts ────────────────────────────────────────────────── */}
      <div className="chart-grid" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-bar" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Certificate Trends</h3>
          </div>
          <div className="card-body">
            <div className="chart-container">
              <Bar
                data={certTrendData}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
                }}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-line" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Student Growth</h3>
          </div>
          <div className="card-body">
            <div className="chart-container">
              <Line
                data={studentGrowthData}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Students ───────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3><i className="fas fa-user-graduate" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Recent Students</h3>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/students')}>View All</button>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reg No</th><th>Student Name</th><th>Gender</th><th>Standard</th><th>Division</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.slice(0, 6).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                    No students yet. <button className="btn btn-sm btn-primary" onClick={() => navigate('/students/new')} style={{ marginLeft: 10 }}>Add First Student</button>
                  </td>
                </tr>
              ) : students.slice(0, 6).map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.register_number || '-'}</td>
                  <td style={{ fontWeight: 600 }}>{s.full_name}</td>
                  <td>{s.gender || '-'}</td>
                  <td>
                    <span className="badge badge-primary" style={{ fontSize: 11 }}>{s.admission_standard || '-'}</span>
                  </td>
                  <td>{s.admission_division || '-'}</td>
                  <td>
                    <button className="btn-icon" title="Edit" onClick={() => navigate(`/students/${s.id}/edit`)}>
                      <i className="fas fa-edit"></i>
                    </button>
                    <button className="btn-icon" title="View" onClick={() => navigate(`/students/${s.id}`)}>
                      <i className="fas fa-eye"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </Layout>
  );
}

function StatCard({ icon, value, label, gradient, iconBg, sub, onAction, actionLabel }) {
  return (
    <div style={{
      background: gradient,
      borderRadius: 16,
      padding: '22px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      boxShadow: '0 4px 20px rgba(0,0,0,.12)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* decorative circle */}
      <div style={{
        position: 'absolute', right: -20, top: -20,
        width: 100, height: 100, borderRadius: '50%',
        background: 'rgba(255,255,255,0.07)',
        pointerEvents: 'none',
      }} />
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        backdropFilter: 'blur(4px)',
      }}>
        <i className={`fas ${icon}`} style={{ fontSize: 22, color: '#fff' }}></i>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: -0.5 }}>{value}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>{sub}</div>}
        {onAction && (
          <button
            onClick={onAction}
            style={{
              background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px',
              marginTop: 8, cursor: 'pointer',
            }}
          >{actionLabel}</button>
        )}
      </div>
    </div>
  );
}
