import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';
import EDUCATIONAL_CERTIFICATES from '../data/educationalCertificates';
import EduDocOtpModal from '../components/EduDocOtpModal';

const CART_STORAGE_KEY = 'eduDocCart';
const MAX_FILE_SIZE = 7 * 1024 * 1024;

function loadCartFromStorage() {
  try {
    const raw = sessionStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export default function EduDocRequestFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedType = searchParams.get('type');

  const [certTypes, setCertTypes] = useState([]);
  const [students, setStudents] = useState([]);
  const [walletBalance, setWalletBalance] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedType, setSelectedType] = useState(preselectedType || '');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [file, setFile] = useState(null);
  const [fileToken, setFileToken] = useState('');
  const [uploading, setUploading] = useState(false);
  const [itemError, setItemError] = useState('');

  const [cart, setCart] = useState(loadCartFromStorage);
  const [view, setView] = useState('flow'); // flow | review | success
  const [submitError, setSubmitError] = useState('');
  const [insufficientInfo, setInsufficientInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [otpModalData, setOtpModalData] = useState(null); // { cartTotal, itemCount, expiresInMinutes, email }
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  const load = useCallback(async () => {
    setLoadingInitial(true);
    setLoadError('');
    try {
      const [typesRes, studentsRes, walletRes] = await Promise.all([
        api.get('/edu-doc-requests/types'),
        api.get('/students', { params: { limit: 5000 } }),
        api.get('/wallet/balance'),
      ]);
      setCertTypes(typesRes.data.types || []);
      setStudents(studentsRes.data.students || []);
      setWalletBalance(walletRes.data.balance);
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Failed to load. Please refresh the page.');
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedTypeInfo = useMemo(() => certTypes.find(t => t.docType === selectedType), [certTypes, selectedType]);
  const staticCertInfo = useMemo(() => EDUCATIONAL_CERTIFICATES.find(c => c.id === selectedType), [selectedType]);
  const selectedStudent = useMemo(() => students.find(s => s.id === selectedStudentId), [students, selectedStudentId]);

  const cartTotal = useMemo(() => Math.round(cart.reduce((sum, it) => sum + Number(it.price), 0) * 100) / 100, [cart]);
  const remainingBalance = walletBalance !== null ? Math.round((Number(walletBalance) - cartTotal) * 100) / 100 : null;

  const studentMissingInfo = selectedStudent && (
    !selectedStudent.father_name || !selectedStudent.birth_village || !selectedStudent.birth_taluka || !selectedStudent.birth_district
  );

  function handleFileChange(e) {
    setItemError('');
    setFileToken('');
    const f = e.target.files[0];
    if (!f) { setFile(null); return; }
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setItemError('Only PDF files are allowed.');
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setItemError('Maximum file size is 7 MB.');
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setItemError('');
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const { data } = await api.post('/edu-doc-requests/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFileToken(data.fileToken);
    } catch (e) {
      setItemError(e.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleAddToCart() {
    setItemError('');
    if (!selectedType) { setItemError('Please select a certificate.'); return; }
    if (!selectedStudentId) { setItemError('Please select a student.'); return; }
    if (!fileToken) { setItemError('Please upload the combined document PDF first.'); return; }
    if (cart.some(it => it.studentId === selectedStudentId && it.docType === selectedType)) {
      setItemError('This certificate is already in the cart for this student.');
      return;
    }
    const typeInfo = certTypes.find(t => t.docType === selectedType);
    setCart(prev => [...prev, {
      studentId: selectedStudentId,
      studentName: selectedStudent?.full_name || '',
      docType: selectedType,
      docTypeName: typeInfo?.name || selectedType,
      price: typeInfo?.price || 0,
      fileToken,
      fileName: file?.name || 'document.pdf',
    }]);
    // Reset per-item fields, keep the certificate locked so "Add Another
    // Student" just returns to student selection, per the spec's requirement
    // that the certificate never needs to be re-selected.
    setSelectedStudentId('');
    setFile(null);
    setFileToken('');
  }

  function handleRemoveFromCart(index) {
    setCart(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitRequest() {
    setSubmitError('');
    setInsufficientInfo(null);
    setSubmitting(true);
    try {
      const { data } = await api.post('/edu-doc-requests/submit', {
        items: cart.map(it => ({ studentId: it.studentId, docType: it.docType, fileToken: it.fileToken })),
      });
      if (data.insufficientBalance) {
        setInsufficientInfo(data);
        return;
      }
      setOtpModalData({ cartTotal: data.cartTotal, itemCount: data.itemCount, expiresInMinutes: data.expiresInMinutes, email: data.email });
    } catch (e) {
      setSubmitError(e.response?.data?.error || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOtpVerified(data) {
    setOtpModalData(null);
    setSuccessData(data);
    setCart([]);
    sessionStorage.removeItem(CART_STORAGE_KEY);
    setView('success');
  }

  if (loadingInitial) {
    return (
      <Layout role="schoolAdmin">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24, color: 'var(--primary)' }}></i>
        </div>
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout role="schoolAdmin">
        <div className="alert alert-danger">{loadError}</div>
      </Layout>
    );
  }

  if (view === 'success' && successData) {
    return (
      <Layout role="schoolAdmin">
        <div className="page-header">
          <div><h1 className="page-title">Request Submitted</h1></div>
        </div>
        <div className="card" style={{ maxWidth: 560, margin: '0 auto', padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <i className="fas fa-check" style={{ fontSize: 28, color: 'var(--success)' }}></i>
          </div>
          <h2 style={{ margin: '0 0 6px' }}>Request Submitted Successfully</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            Your educational certificate request has been submitted and sent to your assigned distributor.
          </p>
          <div style={{ textAlign: 'left', background: 'var(--bg)', borderRadius: 10, padding: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Request ID" value={successData.requestNumber} bold />
            <Row label="Students" value={successData.studentsCount} />
            <Row label="Total Amount" value={`₹${successData.totalAmount}`} />
            <Row label="Remaining Wallet Balance" value={`₹${successData.walletBalance}`} />
            <Row label="Distributor" value={successData.distributorName || '—'} />
            <Row label="Status" value={<span className="badge badge-warning">Submitted</span>} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center' }}>
            <button className="btn btn-outline" onClick={() => navigate('/edu-doc-requests')}>View My Requests</button>
            <button className="btn btn-primary" onClick={() => navigate('/educational-certificates')}>Back to Educational Documents</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={() => navigate('/educational-certificates')}>
            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back to Educational Documents
          </button>
          <h1 className="page-title">Request Documents from Distributor</h1>
          <p className="page-subtitle">Select a student, upload the supporting documents, and submit your request.</p>
        </div>
      </div>

      {view === 'flow' && (
        <div className="edu-doc-flow-grid">
          <div>
            {/* Step 1: Certificate (locked if pre-selected from the Educational Documents page) */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><h3 className="card-title">Selected Certificate</h3></div>
              <div className="card-body">
                {preselectedType ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--primary-light)', borderRadius: 10, padding: '14px 16px' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{selectedTypeInfo?.name || staticCertInfo?.title}</div>
                      <div className="mr-text" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{staticCertInfo?.marathiTitle}</div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>₹{selectedTypeInfo?.price}</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {certTypes.map(t => {
                      const info = EDUCATIONAL_CERTIFICATES.find(c => c.id === t.docType);
                      return (
                        <button
                          key={t.docType}
                          type="button"
                          onClick={() => setSelectedType(t.docType)}
                          className="card"
                          style={{
                            textAlign: 'left', cursor: 'pointer', padding: '14px 16px',
                            border: selectedType === t.docType ? '2px solid var(--primary)' : '1px solid var(--border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>{t.name}</div>
                            {info && <div className="mr-text" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{info.marathiTitle}</div>}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>₹{t.price}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {selectedType && (
              <>
                {/* Step 2: Select Student */}
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header"><h3 className="card-title">1. Select Student</h3></div>
                  <div className="card-body">
                    <select className="form-control" value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
                      <option value="">-- Select Student --</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} {s.register_number ? `(GR ${s.register_number})` : ''}</option>
                      ))}
                    </select>

                    {selectedStudent && (
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
                        <div style={{ width: 80, height: 96, borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                          {selectedStudent.photo_url ? (
                            <img src={selectedStudent.photo_url.startsWith('http') ? selectedStudent.photo_url : `${api.defaults.baseURL.replace(/\/api$/, '')}${selectedStudent.photo_url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <i className="fas fa-user" style={{ fontSize: 24, color: 'var(--text-light)' }}></i>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                          <Field label="Student Name" value={selectedStudent.full_name} />
                          <Field label="Father Name" value={selectedStudent.father_name} />
                          <Field label="Village" value={selectedStudent.birth_village} />
                          <Field label="Taluka" value={selectedStudent.birth_taluka} />
                          <Field label="District" value={selectedStudent.birth_district} />
                        </div>
                      </div>
                    )}
                    {studentMissingInfo && (
                      <div className="alert alert-warning" style={{ marginTop: 12, fontSize: 13 }}>
                        Some student information is missing. Please update the student's profile for a complete request.
                      </div>
                    )}
                  </div>
                </div>

                {selectedStudentId && (
                  <>
                    {/* Step 3: Required Documents */}
                    {staticCertInfo && (
                      <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header"><h3 className="card-title">2. Required Documents</h3></div>
                        <div className="card-body">
                          {staticCertInfo.documents.map(doc => (
                            <div key={doc.en} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                              <i className="fas fa-check-circle" style={{ color: 'var(--success)' }}></i>
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{doc.en}</div>
                                {doc.mr && <div className="mr-text" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{doc.mr}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step 4: Upload */}
                    <div className="card" style={{ marginBottom: 20 }}>
                      <div className="card-header"><h3 className="card-title">3. Upload All Required Documents (One PDF)</h3></div>
                      <div className="card-body">
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                          Please combine all required documents into one PDF. Maximum file size: 7 MB.
                        </p>
                        <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
                        {file && !fileToken && (
                          <button className="btn btn-sm btn-primary" style={{ marginLeft: 10 }} disabled={uploading} onClick={handleUpload}>
                            {uploading ? 'Uploading...' : 'Upload'}
                          </button>
                        )}
                        {fileToken && (
                          <div style={{ marginTop: 10, color: 'var(--success)', fontSize: 13 }}>
                            <i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>{file?.name} uploaded
                          </div>
                        )}
                        {itemError && <div className="alert alert-danger" style={{ marginTop: 10 }}>{itemError}</div>}
                      </div>
                    </div>

                    <button className="btn btn-primary" disabled={!fileToken} onClick={handleAddToCart}>
                      <i className="fas fa-cart-plus" style={{ marginRight: 6 }}></i>Add to Cart
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Cart sidebar */}
          <div className="card edu-doc-cart-sidebar" style={{ position: 'sticky', top: 20 }}>
            <div className="card-header"><h3 className="card-title">Cart ({cart.length})</h3></div>
            <div className="card-body">
              {cart.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No students added yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {cart.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: 13 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{it.studentName}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{it.docTypeName} — ₹{it.price}</div>
                      </div>
                      <button className="btn-icon" title="Remove" onClick={() => handleRemoveFromCart(i)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
                <Row label="Total Students" value={cart.length} />
                <Row label="Total Amount" value={`₹${cartTotal}`} bold />
                <Row label="Wallet Balance" value={`₹${walletBalance}`} />
                <Row label="Remaining Balance" value={`₹${remainingBalance}`} negative={remainingBalance < 0} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={cart.length === 0} onClick={() => setView('review')}>
                Review &amp; Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'review' && (
        <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="card-header">
            <button className="btn btn-sm btn-outline" onClick={() => setView('flow')}><i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back</button>
            <h3 className="card-title" style={{ marginTop: 10 }}>Review Educational Document Request</h3>
          </div>
          <div className="card-body">
            {cart.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                <div>
                  <strong>{i + 1}. {it.studentName}</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{it.docTypeName}</div>
                </div>
                <div style={{ fontWeight: 700 }}>₹{it.price}</div>
              </div>
            ))}
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              <Row label="Total Students" value={cart.length} />
              <Row label="Total Amount" value={`₹${cartTotal}`} bold />
              <Row label="Wallet Balance" value={`₹${walletBalance}`} />
              <Row label="Balance After Request" value={`₹${remainingBalance}`} negative={remainingBalance < 0} />
            </div>

            {insufficientInfo && (
              <div className="alert alert-danger" style={{ marginTop: 16 }}>
                <strong>Insufficient Wallet Balance</strong>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Required: ₹{insufficientInfo.cartTotal} · Available: ₹{insufficientInfo.walletBalance} · Shortfall: ₹{insufficientInfo.shortfall}
                </div>
              </div>
            )}
            {submitError && <div className="alert alert-danger" style={{ marginTop: 16 }}>{submitError}</div>}

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} disabled={submitting} onClick={handleSubmitRequest}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {otpModalData && (
        <EduDocOtpModal
          show={!!otpModalData}
          email={otpModalData.email}
          expiresInMinutes={otpModalData.expiresInMinutes}
          itemCount={otpModalData.itemCount}
          cartTotal={otpModalData.cartTotal}
          onVerified={handleOtpVerified}
          onClose={() => setOtpModalData(null)}
        />
      )}
    </Layout>
  );
}

function Row({ label, value, bold, negative }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: negative ? 'var(--danger)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-light)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}
