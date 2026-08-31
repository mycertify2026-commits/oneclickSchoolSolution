import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

export default function VerifyCertificate() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await api.get(`/certificates/verify/${id}`);
        setResult(res.data);
      } catch (err) {
        setResult({ valid: false, error: err.response?.data?.error || 'Certificate not found' });
      } finally {
        setLoading(false);
      }
    }
    check();
  }, [id]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, background: 'var(--primary-gradient)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24, color: '#fff' }}>
            <i className="fas fa-shield-alt"></i>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>One Click School Solutions Verification</h2>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, marginBottom: 12, display: 'block' }}></i>
              Verifying...
            </div>
          ) : result?.valid ? (
            <>
              <div style={{ background: '#ECFDF5', padding: 20, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                <i className="fas fa-check-circle" style={{ fontSize: 36, color: 'var(--success)', marginBottom: 8, display: 'block' }}></i>
                <div style={{ fontWeight: 700, color: '#059669', fontSize: 16 }}>Valid Certificate</div>
              </div>
              <div style={{ padding: 24 }}>
                <DetailRow label="Certificate Type" value={result.certificate.typeLabel} />
                <DetailRow label="Certificate Number" value={result.certificate.serialNumber} mono />
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  {result.certificate.studentPhoto ? (
                    <img
                      src={result.certificate.studentPhoto}
                      alt={result.certificate.studentName}
                      style={{ width: 72, height: 86, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--primary)', background: 'var(--bg-secondary)' }}
                    />
                  ) : (
                    <div style={{ width: 72, height: 86, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <i className="fas fa-user" style={{ fontSize: 28 }}></i>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 5 }}>Student Name</div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{result.certificate.studentName || '-'}</div>
                  </div>
                </div>
                {result.certificate.standard && <DetailRow label="Class / Division" value={`${result.certificate.standard}${result.certificate.division ? ' - ' + result.certificate.division : ''}`} />}
                {result.certificate.dob && <DetailRow label="Date of Birth" value={result.certificate.dob} />}
                {result.certificate.motherName && <DetailRow label="Mother's Name" value={result.certificate.motherName} />}
                {result.certificate.caste && <DetailRow label="Caste" value={result.certificate.caste} />}
                <DetailRow label="School" value={result.certificate.schoolName} />
                <DetailRow label="Location" value={[result.certificate.schoolCity, result.certificate.schoolDistrict].filter(Boolean).join(', ') || '-'} />
                <div style={{ marginTop: 18, marginBottom: 4, fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                  <i className="fas fa-school" style={{ marginRight: 6 }}></i> School Principal / Contact
                </div>
                <DetailRow label="Principal" value={result.certificate.principalName} />
                {result.certificate.schoolTaluka && <DetailRow label="Taluka" value={result.certificate.schoolTaluka} />}
                {result.certificate.udiseCode && <DetailRow label="U-DISE Code" value={result.certificate.udiseCode} mono />}
                {result.certificate.schoolPhone && <DetailRow label="School Phone" value={result.certificate.schoolPhone} />}
                {result.certificate.schoolEmail && <DetailRow label="School Email" value={result.certificate.schoolEmail} />}
                <DetailRow label="Issue Date" value={new Date(result.certificate.issueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} />
                <DetailRow label="Status" value={<span className="badge badge-success">Active</span>} />
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#FEE2E2', padding: 20, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                <i className="fas fa-times-circle" style={{ fontSize: 36, color: 'var(--danger)', marginBottom: 8, display: 'block' }}></i>
                <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 16 }}>Certificate Not Found</div>
              </div>
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                This certificate could not be verified. It may not exist, or the QR code / link may be invalid.
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-light)' }}>
          Verified via One Click School Solutions
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right' }}>{value || '-'}</span>
    </div>
  );
}
