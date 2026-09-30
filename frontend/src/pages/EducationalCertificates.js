import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';
import EDUCATIONAL_CERTIFICATES from '../data/educationalCertificates';

// The workflow diagram shown under the banner — now a real, working flow
// (Request from Distributor is live), kept purely as a visual step-by-step
// guide rather than clickable navigation.
const WORKFLOW_STEPS = [
  { icon: 'fa-user-shield', label: 'Select Certificate' },
  { icon: 'fa-user-graduate', label: 'Select Student' },
  { icon: 'fa-paper-plane', label: 'Request Sent' },
  { icon: 'fa-truck', label: 'Distributor Collects' },
  { icon: 'fa-inbox', label: 'You Receive Documents' },
];

export default function EducationalCertificates() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const selected = EDUCATIONAL_CERTIFICATES.find(c => c.id === selectedId) || null;

  // Prices are never hardcoded on the frontend — fetched from the same
  // database-backed lookup the backend uses to recalculate every request.
  const [prices, setPrices] = useState({});
  useEffect(() => {
    api.get('/edu-doc-requests/types').then(res => {
      const map = {};
      (res.data.types || []).forEach(t => { map[t.docType] = t.price; });
      setPrices(map);
    }).catch(() => {});
  }, []);

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={() => navigate('/school-dashboard')}>
            <i className="fas fa-arrow-left" style={{ marginRight: 6 }} aria-hidden="true"></i>Back to Dashboard
          </button>
          <h1 className="page-title mr-text">विद्यार्थ्यांना लागणारे शैक्षणिक कागदपपत्रे</h1>
          <p className="page-subtitle">View the documents required for applying for student certificates.</p>
        </div>
      </div>

      <RequestBanner onRequest={() => navigate('/edu-doc-requests/new')} />

      {selected ? (
        <CertificateDetail cert={selected} price={prices[selected.id]} onBack={() => setSelectedId(null)} onRequest={() => navigate(`/edu-doc-requests/new?type=${selected.id}`)} />
      ) : (
        <div className="edu-cert-grid">
          {EDUCATIONAL_CERTIFICATES.map(cert => (
            <CertificateCard key={cert.id} cert={cert} price={prices[cert.id]} onOpen={() => setSelectedId(cert.id)} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function RequestBanner({ onRequest }) {
  return (
    <div
      className="card"
      style={{
        marginBottom: 24, border: 'none', overflow: 'hidden', position: 'relative',
        background: 'linear-gradient(135deg,#0F1E3D,#1A6FD4)', color: '#fff',
      }}
    >
      <div style={{ padding: '26px 28px', position: 'relative', zIndex: 1 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,.16)', color: '#fff',
          fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
          padding: '4px 12px', borderRadius: 999, marginBottom: 14,
        }}>
          <i className="fas fa-paper-plane" aria-hidden="true"></i> Now Available
        </span>

        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Request Documents from Your Distributor</h2>
        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.82)', marginTop: 8, maxWidth: 640, lineHeight: 1.6 }}>
          Request any of these certificates for a student directly from your assigned distributor —
          upload the supporting documents, pay from your school wallet, and track the request right here.
        </p>

        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={onRequest}
            className="btn"
            style={{
              background: '#fff', color: 'var(--primary)', border: 'none',
              fontSize: 14, fontWeight: 700, padding: '12px 24px',
              borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            }}
          >
            Request Documents <i className="fas fa-arrow-right" aria-hidden="true" style={{ fontSize: 12 }}></i>
          </button>
        </div>

        {/* Informational step-by-step guide, not clickable navigation. */}
        <div style={{
          marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,.18)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        }}>
          {WORKFLOW_STEPS.map((step, i) => (
            <span key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.14)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className={`fas ${step.icon}`} aria-hidden="true" style={{ fontSize: 11 }}></i>
                </span>
                {step.label}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <i className="fas fa-arrow-right" aria-hidden="true" style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}></i>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CertificateCard({ cert, price, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card"
      style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', font: 'inherit' }}
    >
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`fas ${cert.icon}`} aria-hidden="true" style={{ fontSize: 18, color: 'var(--primary)' }}></i>
          </div>
          {price !== undefined && (
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>₹{price}</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{cert.title}</div>
          <div className="mr-text" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{cert.marathiTitle}</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
          {cert.documents.length} Document{cert.documents.length === 1 ? '' : 's'}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>
          View Documents <i className="fas fa-arrow-right" aria-hidden="true" style={{ fontSize: 11, marginLeft: 2 }}></i>
        </div>
      </div>
    </button>
  );
}

function CertificateDetail({ cert, price, onBack, onRequest }) {
  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div>
            <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={onBack}>
              <i className="fas fa-arrow-left" aria-hidden="true" style={{ marginRight: 6 }}></i>Back to all certificates
            </button>
            <h3 className="card-title" style={{ fontSize: 18 }}>{cert.title}</h3>
            <div className="mr-text" style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{cert.marathiTitle}</div>
          </div>
          {price !== undefined && (
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>₹{price}</div>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
          Required Documents ({cert.documents.length}) · आवश्यक कागदपत्रे
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {cert.documents.map((doc, i) => (
            <div
              key={doc.en}
              style={{
                display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 4px',
                borderBottom: i < cert.documents.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)', width: 22, flexShrink: 0, paddingTop: 2 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <i className="fas fa-check-circle" aria-hidden="true" style={{ color: 'var(--success)', fontSize: 15, marginTop: 3, flexShrink: 0 }}></i>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{doc.en}</div>
                {doc.mr && <div className="mr-text" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{doc.mr}</div>}
              </div>
            </div>
          ))}
        </div>

        {cert.downloadAction && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="This form is not yet available for download"
              className="btn btn-outline edu-coming-soon-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}
            >
              <i className="fas fa-download" aria-hidden="true"></i>
              {cert.downloadAction.label}
              <span style={{
                fontSize: 10, fontWeight: 800, color: 'var(--warning)', background: '#FEF3C7',
                padding: '2px 8px', borderRadius: 999, marginLeft: 4,
              }}>COMING SOON</span>
            </button>
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={onRequest}
            className="btn btn-primary"
            style={{ fontSize: 14, fontWeight: 700, padding: '12px 24px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            Request Documents from Distributor <i className="fas fa-arrow-right" aria-hidden="true" style={{ fontSize: 12 }}></i>
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
            You'll select a student, upload supporting documents, and confirm via OTP.
          </div>
        </div>
      </div>
    </div>
  );
}
