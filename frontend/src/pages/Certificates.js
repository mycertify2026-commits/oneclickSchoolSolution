import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import CartOtpModal from '../components/CartOtpModal';
import PdfPreviewModal from '../components/PdfPreviewModal';

const BASE_TYPES = [
  { key: 'lc',       label: 'Leaving Certificate',  price: 50 },
  { key: 'bonafide', label: 'Bonafide Certificate', price: 30 },
  { key: 'idcard',   label: 'ID Card',              price: 20 }
];

const LC_REASON_OPTIONS = [
  'Passed',
  'Other',
];

export default function Certificates() {
  const { user } = useAuth();
  const [tab, setTab] = useState('new');
  const [students, setStudents] = useState([]);
  const queryParams = new URLSearchParams(window.location.search);
  const [selectedType, setSelectedType] = useState(queryParams.get('type') === 'idcard' ? 'idcard' : 'lc');
  const [selectedStudent, setSelectedStudent] = useState(queryParams.get('studentId') || '');
  const [purpose, setPurpose] = useState('');
  const [cart, setCart] = useState({ items: [], total: 0, walletBalance: 0 });
  const [recent, setRecent] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [cartNotice, setCartNotice] = useState(null);

  const [otpModal, setOtpModal] = useState(null);
  const [insufficient, setInsufficient] = useState(null);
  const [resultView, setResultView] = useState(null);

  const [preview, setPreview] = useState({ show: false, pdfBase64: null, title: '' });

  // ID card: soft vs hard copy
  const [idCardCopyType, setIdCardCopyType] = useState('soft');
  const [idCardPricing, setIdCardPricing] = useState({ soft: 20, hard: 100 });
  const [hardCopyLoading, setHardCopyLoading] = useState(false);
  const [hardCopyStudentIds, setHardCopyStudentIds] = useState([]);

  function toggleHardCopyStudent(id) {
    setHardCopyStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // LC-specific fields
  const [lcType, setLcType] = useState('Original');
  const [lcDateOfLeaving, setLcDateOfLeaving] = useState('');
  const [lcReason, setLcReason] = useState('Passed');
  const [lcReasonOther, setLcReasonOther] = useState('');
  const [lcRemarks, setLcRemarks] = useState('');
  const [lcClassInWhichStudying, setLcClassInWhichStudying] = useState('');

  // Merge live idcard prices into TYPES
  const TYPES = BASE_TYPES.map(t => t.key === 'idcard' ? { ...t, price: idCardPricing.soft } : t);

  // Build the purpose string sent to backend:
  // For LC, encode all extra fields as JSON so they survive the cart pipeline.
  function buildPurpose() {
    if (selectedType === 'lc') {
      return JSON.stringify({
        lcType,
        dateOfLeaving: lcDateOfLeaving,
        reasonForLeaving: lcReason === 'Other' ? (lcReasonOther || 'Other') : lcReason,
        remarks: lcRemarks,
        classInWhichStudying: lcClassInWhichStudying,
      });
    }
    return purpose;
  }

  const loadCart = useCallback(async () => {
    try {
      const { data } = await api.get('/cart');
      setCart(data);
      return data;
    } catch (e) {
      return null;
    }
  }, []);

  const loadRecent = useCallback(() => {
    api.get('/certificates').then(({ data }) => setRecent(data.certificates || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/students?limit=1000').then(({ data }) => setStudents(data.students || [])).catch(() => {});
    api.get('/schools/me').then(({ data }) => setSchoolEmail(data.school?.email || '')).catch(() => {});
    api.get('/id-cards/pricing').then(({ data }) => {
      const soft = data.pricing?.find ? data.pricing.find(p => p.copy_type === 'soft') : null;
      const hard = data.pricing?.find ? data.pricing.find(p => p.copy_type === 'hard') : null;
      setIdCardPricing({
        soft: soft ? Number(soft.price) : (data.pricing?.soft ?? 20),
        hard: hard ? Number(hard.price) : (data.pricing?.hard ?? 100),
      });
    }).catch(() => {});
    loadCart();
    loadRecent();
  }, [loadCart, loadRecent]);

  useEffect(() => {
    if (!cartNotice) return undefined;
    const timer = setTimeout(() => setCartNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [cartNotice]);

  async function handlePreview() {
    if (!selectedStudent) { setError('Select a student first'); return; }
    setError('');
    setPreview({ show: true, pdfBase64: null, title: TYPES.find(t => t.key === selectedType).label });
    try {
      const { data } = await api.post('/cart/preview', {
        studentId: selectedStudent,
        type: selectedType,
        purpose: buildPurpose(),
      });
      setPreview(p => ({ ...p, pdfBase64: data.pdfBase64 }));
    } catch (e) {
      setPreview({ show: false, pdfBase64: null, title: '' });
      setError(e.response?.data?.message || 'Preview failed');
    }
  }

  async function handleAddToCart() {
    // Hard copy ID card goes through the same cart -> OTP -> submit flow as
    // every other certificate type, just with copyType:'hard' per item, so
    // one submission can cover many students and the school sees one
    // consistent checkout experience regardless of copy type.
    if (selectedType === 'idcard' && idCardCopyType === 'hard') {
      if (hardCopyStudentIds.length === 0) { setError('Select at least one student'); return; }
      setError(''); setMessage('');
      setHardCopyLoading(true);
      let added = 0;
      const failures = [];
      for (const studentId of hardCopyStudentIds) {
        try {
          await api.post('/cart/items', { studentId, type: 'idcard', copyType: 'hard' });
          added += 1;
        } catch (e) {
          const student = students.find(s => s.id === studentId);
          failures.push(`${student?.full_name || studentId}: ${e.response?.data?.message || 'failed'}`);
        }
      }
      setHardCopyLoading(false);
      if (added > 0) {
        setCartNotice({ message: `${added} hard copy ID card${added !== 1 ? 's' : ''} added to cart`, itemCount: cart.items.length + added });
        setHardCopyStudentIds([]);
        await loadCart();
        setTab('cart');
      }
      if (failures.length) setError(`Some students could not be added: ${failures.join('; ')}`);
      return;
    }
    if (!selectedStudent) { setError('Select a student first'); return; }
    if (selectedType === 'lc' && !lcDateOfLeaving) {
      setError('Please enter the Date of Leaving for the LC'); return;
    }
    setError(''); setMessage('');
    try {
      await api.post('/cart/items', {
        studentId: selectedStudent,
        type: selectedType,
        purpose: buildPurpose(),
      });
      const typeLabel = TYPES.find(t => t.key === selectedType)?.label || 'Certificate';
      setCartNotice({ message: `${typeLabel} added to cart`, itemCount: cart.items.length + 1 });
      setSelectedStudent(''); setPurpose('');
      await loadCart();
      setTab('cart');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to add to cart');
    }
  }

  async function removeItem(id) {
    await api.delete(`/cart/items/${id}`);
    loadCart();
  }

  async function submitCart() {
    setError(''); setInsufficient(null);
    try {
      const { data } = await api.post('/cart/submit');
      if (data.insufficientBalance) {
        setInsufficient(data);
      } else if (data.otpRequired) {
        setOtpModal({ ...data, email: data.schoolEmail || schoolEmail || user?.email || 'your registered email' });
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to submit cart');
    }
  }

  function onOtpVerified(data) {
    setOtpModal(null);
    setResultView(data.results);
    loadCart();
    loadRecent();
  }

  async function downloadCert(id, serial) {
    try {
      const res = await api.get(`/certificates/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `${serial}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Download failed'); }
  }

  async function downloadReceipt(id, serial) {
    try {
      const res = await api.get(`/certificates/${id}/receipt`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `Receipt-${serial}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert('Receipt download failed'); }
  }

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Certificates</h1>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Generate and manage student certificates</div>
        </div>
        {cart.walletBalance !== undefined && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 16px', fontSize: 14, color: '#15803d', fontWeight: 600 }}>
            <i className="fas fa-wallet" style={{ marginRight: 6 }}></i>
            Wallet: ₹{Number(cart.walletBalance).toLocaleString('en-IN')}
          </div>
        )}
      </div>

      {cartNotice && (
        <div className="toast-container cart-toast-container" aria-live="polite" aria-atomic="true">
          <div className="toast toast-success cart-toast" role="status">
            <i className="fas fa-check-circle"></i>
            <div className="toast-msg">
              <strong>{cartNotice.message}</strong>
              <span>{cartNotice.itemCount} item{cartNotice.itemCount === 1 ? '' : 's'} in your cart</span>
            </div>
            <button className="cart-toast-action" onClick={() => { setTab('cart'); setCartNotice(null); }}>
              View cart
            </button>
            <button className="toast-close" aria-label="Dismiss cart notice" onClick={() => setCartNotice(null)}>×</button>
          </div>
        </div>
      )}

      <div className="tabs">
        <div className={`tab-item${tab === 'new' ? ' active' : ''}`} onClick={() => setTab('new')}>
          <i className="fas fa-plus-circle" style={{ marginRight: 6 }}></i>New Request
        </div>
        <div className={`tab-item${tab === 'cart' ? ' active' : ''}`} onClick={() => setTab('cart')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fas fa-shopping-cart"></i>Cart
          {cart.items.length > 0 && (
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
              {cart.items.length}
            </span>
          )}
        </div>
      </div>

      {error   && <div className="alert alert-danger"  style={{ marginBottom: 14 }}>{error}</div>}
      {message && <div className="alert alert-success" style={{ marginBottom: 14 }}>{message}</div>}

      {tab === 'new' && (
        <div className="card">
          {/* Certificate type cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
            {TYPES.map(t => (
              <div key={t.key} className={`cert-type-card${selectedType === t.key ? ' active' : ''}`}
                onClick={() => { setSelectedType(t.key); setError(''); }}>
                <h4 style={{ margin: '0 0 6px' }}>{t.label}</h4>
                <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 20 }}>₹{t.price}</div>
              </div>
            ))}
          </div>

          {/* ID Card copy type selector */}
          {selectedType === 'idcard' && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0369a1', marginRight: 8 }}>
                <i className="fas fa-id-card" style={{ marginRight: 6 }}></i>Select Copy Type:
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="radio" name="idCardCopyType" value="soft" checked={idCardCopyType === 'soft'} onChange={() => setIdCardCopyType('soft')} />
                Soft Copy (PDF) — <span style={{ color: 'var(--primary)' }}>₹{idCardPricing.soft}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <input type="radio" name="idCardCopyType" value="hard" checked={idCardCopyType === 'hard'} onChange={() => setIdCardCopyType('hard')} />
                Hard Copy (Physical) — <span style={{ color: 'var(--primary)' }}>₹{idCardPricing.hard}</span>
              </label>
              {idCardCopyType === 'hard' && (
                <div style={{ width: '100%', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
                  Hard copy requests go into your cart just like other certificates — add students, then Submit All to confirm with OTP. Once confirmed, they're processed and dispatched by your distributor.
                </div>
              )}
            </div>
          )}

          {/* Student selector + common fields */}
          {selectedType === 'idcard' && idCardCopyType === 'hard' ? (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Select Students ({hardCopyStudentIds.length} selected)</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setHardCopyStudentIds(students.map(s => s.id))}>Select All</button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setHardCopyStudentIds([])}>Clear</button>
                </div>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {students.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No students found.</div>
                ) : students.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={hardCopyStudentIds.includes(s.id)} onChange={() => toggleHardCopyStudent(s.id)} />
                    {s.full_name} ({s.admission_standard}-{s.admission_division})
                  </label>
                ))}
              </div>
              {hardCopyStudentIds.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                  Total: <strong style={{ color: 'var(--primary)' }}>₹{(idCardPricing.hard * hardCopyStudentIds.length).toLocaleString('en-IN')}</strong> for {hardCopyStudentIds.length} card{hardCopyStudentIds.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Select Student</label>
                <select className="form-control" value={selectedStudent} onChange={e => { setSelectedStudent(e.target.value); setError(''); }}>
                  <option value="">-- Select --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.admission_standard}-{s.admission_division})</option>
                  ))}
                </select>
              </div>
              {selectedType === 'bonafide' && (
                <div className="form-group">
                  <label className="form-label">Purpose</label>
                  <input className="form-control" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Passport application" />
                </div>
              )}
            </div>
          )}

          {/* LC-specific fields */}
          {selectedType === 'lc' && (
            <div style={{ background: '#f8faff', border: '1px solid #c7d7f0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 12 }}>
                <i className="fas fa-file-alt" style={{ marginRight: 6 }}></i>LC Details (entered by Head Master)
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">LC Type *</label>
                  <select className="form-control" value={lcType} onChange={e => setLcType(e.target.value)}>
                    <option value="Original">Original</option>
                    <option value="Duplicate">Duplicate</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Leaving *</label>
                  <input type="date" className="form-control" value={lcDateOfLeaving} onChange={e => setLcDateOfLeaving(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Reason for Leaving</label>
                  <select className="form-control" value={lcReason} onChange={e => setLcReason(e.target.value)}>
                    {LC_REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {lcReason === 'Other' && (
                  <div className="form-group">
                    <label className="form-label">Specify Reason *</label>
                    <input className="form-control" value={lcReasonOther} onChange={e => setLcReasonOther(e.target.value)} placeholder="Enter reason manually" />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Class in which Studying</label>
                  <input className="form-control" value={lcClassInWhichStudying} onChange={e => setLcClassInWhichStudying(e.target.value)} placeholder="e.g. 9th Standard (B)" />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Remarks</label>
                  <input className="form-control" value={lcRemarks} onChange={e => setLcRemarks(e.target.value)} placeholder="e.g. No dues" />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {!(selectedType === 'idcard' && idCardCopyType === 'hard') && (
              <button className="btn btn-outline" onClick={handlePreview} disabled={!selectedStudent}>
                <i className="fas fa-eye" style={{ marginRight: 6 }}></i>Preview
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleAddToCart}
              disabled={selectedType === 'idcard' && idCardCopyType === 'hard' ? (hardCopyStudentIds.length === 0 || hardCopyLoading) : !selectedStudent}
            >
              {selectedType === 'idcard' && idCardCopyType === 'hard'
                ? <><i className="fas fa-cart-plus" style={{ marginRight: 6 }}></i>{hardCopyLoading ? 'Adding...' : `Add ${hardCopyStudentIds.length > 0 ? `${hardCopyStudentIds.length} ` : ''}Hard ${hardCopyStudentIds.length === 1 ? 'Copy' : 'Copies'} to Cart${hardCopyStudentIds.length > 0 ? ` — ₹${(idCardPricing.hard * hardCopyStudentIds.length).toLocaleString('en-IN')}` : ''}`}</>
                : <><i className="fas fa-cart-plus" style={{ marginRight: 6 }}></i>Add to Cart</>
              }
            </button>
          </div>
        </div>
      )}

      {tab === 'cart' && (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Student</th><th>Type</th><th>Price</th><th></th></tr></thead>
            <tbody>
              {cart.items.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>Cart is empty</td></tr>
              ) : cart.items.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.student_name}</td>
                  <td>
                    <span className="badge badge-primary">{item.type?.toUpperCase()}</span>
                    {item.type === 'idcard' && item.certificate_variant === 'hard' && (
                      <span className="badge badge-warning" style={{ marginLeft: 6 }}>HARD COPY</span>
                    )}
                  </td>
                  <td>₹{item.price}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => removeItem(item.id)}>
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Total: ₹{Number(cart.total).toFixed(2)}</div>
              <div style={{ fontSize: 13, color: Number(cart.total) > Number(cart.walletBalance) ? '#dc2626' : '#15803d', marginTop: 4 }}>
                Wallet: ₹{Number(cart.walletBalance).toLocaleString('en-IN')}
                {Number(cart.total) > Number(cart.walletBalance) && ' ⚠ Insufficient'}
              </div>
            </div>
            <button className="btn btn-primary" disabled={cart.items.length === 0} onClick={submitCart}>
              <i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Submit All
            </button>
          </div>
        </div>
      )}

      {insufficient && (
        <div className="alert alert-danger" style={{ marginTop: 14 }}>
          <b>Insufficient wallet balance.</b> Cart total ₹{insufficient.cartTotal}, wallet ₹{insufficient.walletBalance}. You need ₹{insufficient.shortfall} more.
          <div style={{ marginTop: 8 }}>
            <a href="/school-settings" className="btn btn-sm btn-primary">Recharge Wallet</a>
          </div>
        </div>
      )}

      {resultView && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Submission Result</h3>
          {resultView.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{r.studentName || ''} — <span className="badge badge-primary">{r.type?.toUpperCase()}</span>{r.variant === 'hard' && <span className="badge badge-warning" style={{ marginLeft: 6 }}>HARD COPY</span>}</span>
              {r.status === 'generated' ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="badge badge-success">Generated</span>
                  <button className="btn btn-sm btn-primary" onClick={() => downloadCert(r.certificateId, r.serial)}>
                    <i className="fas fa-download" style={{ marginRight: 4 }}></i>Download Certificate
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => downloadReceipt(r.certificateId, r.serial)}>
                    <i className="fas fa-receipt" style={{ marginRight: 4 }}></i>Download Receipt
                  </button>
                </span>
              ) : (
                <span className="badge badge-danger">Failed — Refunded</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 className="card-title" style={{ margin: 0 }}>Recent Certificates</h3>
          <button className="btn btn-outline btn-sm" onClick={loadRecent}><i className="fas fa-sync-alt"></i></button>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Serial No.</th><th>Student</th><th>Type</th><th>Price</th><th>Issue Date</th><th></th></tr></thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No certificates yet</td></tr>
              ) : recent.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.serial_number}</td>
                  <td>{c.student_name}</td>
                  <td><span className="badge badge-primary">{c.type?.toUpperCase()}</span></td>
                  <td>₹{c.price}</td>
                  <td>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-outline" onClick={() => downloadCert(c.id, c.serial_number)}>
                      <i className="fas fa-download" style={{ marginRight: 4 }}></i>Certificate
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => downloadReceipt(c.id, c.serial_number)}>
                      <i className="fas fa-receipt" style={{ marginRight: 4 }}></i>Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CartOtpModal
        show={!!otpModal}
        email={otpModal?.email}
        expiresInMinutes={otpModal?.expiresInMinutes}
        itemCount={otpModal?.itemCount}
        cartTotal={otpModal?.cartTotal}
        onVerified={onOtpVerified}
        onClose={() => setOtpModal(null)}
      />

      <PdfPreviewModal
        show={preview.show}
        pdfBase64={preview.pdfBase64}
        title={preview.title}
        onClose={() => setPreview({ show: false, pdfBase64: null, title: '' })}
      />
    </Layout>
  );
}
