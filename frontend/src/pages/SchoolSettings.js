import { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Layout from '../components/Layout';
import api from '../api/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

// Extracts the first hex colour from a value that may be a plain hex or a CSS gradient string.
// Stored legacy values used "linear-gradient(..." format; new ones are plain hex.
function normaliseColor(val) {
  if (!val) return '';
  const m = String(val).match(/#[0-9a-fA-F]{3,8}/);
  return m ? m[0] : val;
}

const BLANK = { name: '', udise_code: '', village: '', city: '', district: '', taluka: '', pin_code: '', phone: '', email: '', medium: '', board: '', principal_name: '', recog_no: '' };
const ID_CARD_PRESET_COLORS = [
  '#1a6fd4','#1557b0','#059669','#047857','#7c3aed','#5b21b6',
  '#dc2626','#b91c1c','#0891b2','#0e7490','#1f2937','#d97706',
  '#be185d','#0f766e','#4338ca','#b45309',
];
const DEFAULT_FEATURE_ICONS = [
  { key: 'shield', visible: true, caption1: '760 MICRON PVC', caption2: '' },
  { key: 'drop', visible: true, caption1: 'WATER RESISTANT', caption2: '' },
  { key: 'sun', visible: true, caption1: 'ANTI FADE PRINT', caption2: '' },
  { key: 'arrows', visible: true, caption1: 'SCRATCH RESISTANT', caption2: '' },
  { key: 'hourglass', visible: true, caption1: 'LONG LIFE', caption2: '(5-10 YEARS)' },
];
const FEATURE_ICON_LABELS = { shield: 'Shield', drop: 'Water drop', sun: 'Sun', arrows: 'Arrows', hourglass: 'Hourglass' };

function parseFeatureIcons(raw) {
  if (!raw) return DEFAULT_FEATURE_ICONS;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_FEATURE_ICONS;
  } catch (e) {
    return DEFAULT_FEATURE_ICONS;
  }
}
const ID_CARD_BLANK = {
  id_card_primary_color: '#1a6fd4', id_card_school_name: '', id_card_subtitle: 'Student ID Card',
  id_card_footer_text: 'If found, please contact the school office.',
  id_card_show_register_number: true, id_card_show_aadhaar: true, id_card_show_dob: true,
  id_card_show_address: false, id_card_show_emergency_contact: true,
  id_card_border_color: '', id_card_bg_opacity: 0.15, id_card_show_feature_strip: true,
  id_card_feature_icons: DEFAULT_FEATURE_ICONS
};

export default function SchoolSettings() {
  const [activePanel, setActivePanel] = useState('schoolInfo');
  const [form, setForm] = useState(BLANK);
  const [school, setSchool] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [stampFile, setStampFile] = useState(null);
  const [templateFiles, setTemplateFiles] = useState({ bonafide: null, lc: null, idcard: null });
  const [certHeader, setCertHeader] = useState('');
  const [certFooter, setCertFooter] = useState('');
  const [idCardForm, setIdCardForm] = useState(ID_CARD_BLANK);
  const [bgVersion, setBgVersion] = useState(0);
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [bankDetails, setBankDetails] = useState(null);
  const [rechargeRequests, setRechargeRequests] = useState([]);
  const [rechargeForm, setRechargeForm] = useState({ amount: '', utrNumber: '', paymentDate: '', screenshot: null, remarks: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [submittingRecharge, setSubmittingRecharge] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get('/schools/me');
    setSchool(res.data.school);
    setForm({ ...BLANK, ...res.data.school });
    setCertHeader(res.data.school.cert_header || '');
    setCertFooter(res.data.school.cert_footer || '');
    setIdCardForm({
      id_card_primary_color: normaliseColor(res.data.school.id_card_primary_color) || ID_CARD_BLANK.id_card_primary_color,
      id_card_school_name: res.data.school.id_card_school_name || res.data.school.name || '',
      id_card_subtitle: res.data.school.id_card_subtitle || ID_CARD_BLANK.id_card_subtitle,
      id_card_footer_text: res.data.school.id_card_footer_text || ID_CARD_BLANK.id_card_footer_text,
      id_card_show_register_number: Boolean(res.data.school.id_card_show_register_number ?? true),
      id_card_show_aadhaar: Boolean(res.data.school.id_card_show_aadhaar ?? true),
      id_card_show_dob: Boolean(res.data.school.id_card_show_dob ?? true),
      id_card_show_address: Boolean(res.data.school.id_card_show_address ?? false),
      id_card_show_emergency_contact: Boolean(res.data.school.id_card_show_emergency_contact ?? true),
      id_card_border_color: res.data.school.id_card_border_color || '',
      id_card_bg_opacity: res.data.school.id_card_bg_opacity !== null && res.data.school.id_card_bg_opacity !== undefined
        ? Number(res.data.school.id_card_bg_opacity) : ID_CARD_BLANK.id_card_bg_opacity,
      id_card_show_feature_strip: Boolean(res.data.school.id_card_show_feature_strip ?? true),
      id_card_feature_icons: parseFeatureIcons(res.data.school.id_card_feature_icons)
    });
  }, []);
  const loadWallet = useCallback(async () => {
    const balRes = await api.get('/wallet/balance');
    setBalance(balRes.data.balance);
    const txRes = await api.get('/wallet/transactions');
    setTransactions(txRes.data.transactions);
    const reqRes = await api.get('/wallet/recharge-requests/mine');
    setRechargeRequests(reqRes.data.requests);
    try {
      const bankRes = await api.get('/bank-details');
      setBankDetails(bankRes.data.bankDetails);
    } catch (e) {
      setBankDetails(null);
    }
  }, []);

  useEffect(() => { load(); loadWallet(); }, [load, loadWallet]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  function fileToUrl(filePath) {
    if (!filePath) return null;
    // Use a relative URL — the backend serves /uploads as static,
    // and the CRA dev proxy forwards it to port 3001.
    return `/uploads/branding/${String(filePath).split('/').pop()}`;
  }

  function templateToUrl(filePath) {
    if (!filePath) return null;
    return `/uploads/templates/${String(filePath).split('/').pop()}`;
  }

  async function saveTemplate(type, file) {
    if (!file) return;
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      setError('Only PNG templates are accepted');
      return;
    }
    setError(''); setSuccess('');
    try {
      const data = new FormData();
      data.append('template', file);
      const res = await api.put(`/schools/me/certificate-template/${type}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSchool(res.data.school);
      setTemplateFiles(p => ({ ...p, [type]: null }));
      setSuccess('PNG template saved. It will be used in the next PDF.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save PNG template');
    }
  }

  async function removeTemplate(type) {
    try {
      await api.delete(`/schools/me/certificate-template/${type}`);
      setSchool(prev => ({ ...prev, [`${type === 'idcard' ? 'id_card' : type}_template_url`]: null }));
      setSuccess('PNG template removed.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove template');
    }
  }

  async function handleSaveInfo() {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => { if (value !== null && value !== undefined) data.append(key, value); });
      if (logoFile) data.append('logo', logoFile);
      if (signatureFile) data.append('signature', signatureFile);
      if (stampFile) data.append('stamp', stampFile);

      const res = await api.put('/schools/me', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSchool(res.data.school);
      setLogoFile(null); setSignatureFile(null); setStampFile(null);
      setSuccess('School information saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Error while saving');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCertText() {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const data = new FormData();
      data.append('cert_header', certHeader);
      data.append('cert_footer', certFooter);
      const res = await api.put('/schools/me', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSchool(res.data.school);
      setSuccess('Text saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Error while saving');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveIdCardDesign() {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const res = await api.put('/schools/me/id-card-design', idCardForm);
      setSchool(res.data.school);
      setSuccess('ID card design saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Error while saving');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitRecharge() {
    setError(''); setSuccess('');
    const amt = Number(rechargeForm.amount);
    if (!amt || amt < 50) { setError('Minimum amount is ₹50'); return; }
    if (!rechargeForm.utrNumber.trim()) { setError('UTR number is required'); return; }
    if (!rechargeForm.paymentDate) { setError('Payment date is required'); return; }

    setSubmittingRecharge(true);
    try {
      const data = new FormData();
      data.append('amount', amt);
      data.append('utrNumber', rechargeForm.utrNumber.trim());
      data.append('paymentDate', rechargeForm.paymentDate);
      if (rechargeForm.remarks) data.append('remarks', rechargeForm.remarks);
      if (rechargeForm.screenshot) data.append('screenshot', rechargeForm.screenshot);

      await api.post('/wallet/recharge-requests', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccess('Request submitted successfully. Please wait for verification from the Super Admin.');
      setRechargeForm({ amount: '', utrNumber: '', paymentDate: '', screenshot: null, remarks: '' });
      loadWallet();
    } catch (err) {
      setError(err.response?.data?.error || 'Error while submitting');
    } finally {
      setSubmittingRecharge(false);
    }
  }

  function handleDownloadReceipt() {
    const rows = [
      ['One Click School Solutions Wallet Ledger', school?.name || '', new Date().toLocaleDateString('en-IN')],
      [],
      ['Date', 'Type', 'Description', 'Opening Balance', 'Amount', 'Closing Balance']
    ];
    transactions.forEach(tx => rows.push([
      new Date(tx.created_at).toLocaleDateString('en-IN'),
      tx.type, tx.description,
      tx.opening_balance, tx.amount, tx.balance_after
    ]));
    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wallet-ledger-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }

  async function handleExportLedgerExcel() {
    try {
      const res = await api.get('/wallet/transactions/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `wallet-transactions-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
    } catch (err) {
      alert('Export failed');
    }
  }

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div><h1 className="page-title">School Settings</h1><p className="page-subtitle">{school?.name}</p></div>
      </div>

      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        <div className="settings-sidebar">
          <div className="settings-nav">
            <div className={`settings-nav-item ${activePanel === 'schoolInfo' ? 'active' : ''}`} onClick={() => setActivePanel('schoolInfo')}><i className="fas fa-school"></i> School Information</div>
            <div className={`settings-nav-item ${activePanel === 'certHeader' ? 'active' : ''}`} onClick={() => setActivePanel('certHeader')}><i className="fas fa-heading"></i> Certificate Header</div>
            <div className={`settings-nav-item ${activePanel === 'templates' ? 'active' : ''}`} onClick={() => setActivePanel('templates')}><i className="fas fa-file-image"></i> PNG Templates</div>
            <div className={`settings-nav-item ${activePanel === 'idDesigner' ? 'active' : ''}`} onClick={() => setActivePanel('idDesigner')}><i className="fas fa-sliders-h"></i> ID Card Settings</div>
            <div className={`settings-nav-item ${activePanel === 'wallet' ? 'active' : ''}`} onClick={() => setActivePanel('wallet')}><i className="fas fa-wallet"></i> Wallet</div>
          </div>
        </div>

        <div className="settings-main">
          {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{success}</div>}

          {activePanel === 'schoolInfo' && (
            <div className="setting-panel active">
              <div className="card" style={{ padding: 20 }}>
                <div className="form-grid-2">
                  <Field label="School Name" value={form.name} onChange={v => handleChange('name', v)} />
                  <Field label="U-DISE Code" value={form.udise_code} onChange={v => handleChange('udise_code', v)} />
                  <Field label="Email (Email ID)" value={form.email} onChange={v => handleChange('email', v)} type="email" />
                  <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
                  <Field label="Village" value={form.village} onChange={v => handleChange('village', v)} />
                  <Field label="City" value={form.city} onChange={v => handleChange('city', v)} />
                  <Field label="District" value={form.district} onChange={v => handleChange('district', v)} />
                  <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
                  <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
                  <Field label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} />
                  <Field label="Board" value={form.board} onChange={v => handleChange('board', v)} />
                  <Field label="Principal Name" value={form.principal_name} onChange={v => handleChange('principal_name', v)} />
                  <Field label="Recognition No." value={form.recog_no} onChange={v => handleChange('recog_no', v)} />
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSaveInfo} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>

              <div className="card" style={{ padding: 20, marginTop: 20 }}>
                <h4 style={{ marginBottom: 4 }}>Logo, Signature and Stamp</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>These appear on all certificates and ID cards.</p>
                <div className="form-grid-3">
                  <UploadBox label="School Logo" icon="fa-image" file={logoFile} existingUrl={fileToUrl(school?.logo_url)} onChange={setLogoFile} />
                  <UploadBox label="Principal's Signature" icon="fa-signature" file={signatureFile} existingUrl={fileToUrl(school?.signature_url)} onChange={setSignatureFile} />
                  <UploadBox label="School Stamp" icon="fa-stamp" file={stampFile} existingUrl={fileToUrl(school?.stamp_url)} onChange={setStampFile} />
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSaveInfo} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          )}

          {activePanel === 'certHeader' && (
            <div className="setting-panel active">
              <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                <h4 style={{ marginBottom: 4 }}>Logo, Signature and Stamp</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>These appear on all certificates and ID cards. (Can also be changed in the School Information tab.)</p>
                <div className="form-grid-3">
                  <UploadBox label="School Logo" icon="fa-image" file={logoFile} existingUrl={fileToUrl(school?.logo_url)} onChange={setLogoFile} />
                  <UploadBox label="Principal's Signature" icon="fa-signature" file={signatureFile} existingUrl={fileToUrl(school?.signature_url)} onChange={setSignatureFile} />
                  <UploadBox label="School Stamp" icon="fa-stamp" file={stampFile} existingUrl={fileToUrl(school?.stamp_url)} onChange={setStampFile} />
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSaveInfo} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <h4 style={{ marginBottom: 6 }}>Certificate Header Text</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Additional text shown below the school name and logo (e.g. recognition number, board information).</p>
                <RichTextEditor value={certHeader} onChange={setCertHeader} placeholder="Enter the school header here..." />
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSaveCertText} disabled={saving}>{saving ? 'Saving...' : 'Save Header'}</button>
              </div>

              <div className="card" style={{ padding: 20, marginTop: 20 }}>
                <h4 style={{ marginBottom: 6 }}>Certificate Footer Text</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Text shown above the signature/stamp (e.g. terms, notes).</p>
                <RichTextEditor value={certFooter} onChange={setCertFooter} placeholder="Enter the school footer here..." />
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSaveCertText} disabled={saving}>{saving ? 'Saving...' : 'Save Footer'}</button>
              </div>
            </div>
          )}

          {activePanel === 'idDesigner' && (
            <div className="id-designer" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
              <div className="card">
                <div className="card-header"><h3 className="card-title"><i className="fas fa-sliders-h"></i> ID Card Settings</h3></div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Primary Color</label>
                    <ColorPicker
                      value={idCardForm.id_card_primary_color}
                      onChange={c => setIdCardForm(p => ({ ...p, id_card_primary_color: c }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">School Name (on card)</label>
                    <input type="text" className="form-control" value={idCardForm.id_card_school_name} onChange={e => setIdCardForm(p => ({ ...p, id_card_school_name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subtitle</label>
                    <input type="text" className="form-control" value={idCardForm.id_card_subtitle} onChange={e => setIdCardForm(p => ({ ...p, id_card_subtitle: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Footer Text</label>
                    <input type="text" className="form-control" value={idCardForm.id_card_footer_text} onChange={e => setIdCardForm(p => ({ ...p, id_card_footer_text: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Border Line Color</label>
                    <ColorPicker
                      value={idCardForm.id_card_border_color || '#d1d5db'}
                      onChange={c => setIdCardForm(p => ({ ...p, id_card_border_color: c }))}
                    />
                    {idCardForm.id_card_border_color && (
                      <button className="btn btn-sm btn-outline" style={{ marginTop: 6 }} onClick={() => setIdCardForm(p => ({ ...p, id_card_border_color: '' }))}>Reset to default</button>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Information to Display</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <CheckboxRow label="Register Number" checked={idCardForm.id_card_show_register_number} onChange={v => setIdCardForm(p => ({ ...p, id_card_show_register_number: v }))} />
                      <CheckboxRow label="Aadhaar Number" checked={idCardForm.id_card_show_aadhaar} onChange={v => setIdCardForm(p => ({ ...p, id_card_show_aadhaar: v }))} />
                      <CheckboxRow label="Date of Birth" checked={idCardForm.id_card_show_dob} onChange={v => setIdCardForm(p => ({ ...p, id_card_show_dob: v }))} />
                      <CheckboxRow label="Address" checked={idCardForm.id_card_show_address} onChange={v => setIdCardForm(p => ({ ...p, id_card_show_address: v }))} />
                      <CheckboxRow label="Emergency Contact" checked={idCardForm.id_card_show_emergency_contact} onChange={v => setIdCardForm(p => ({ ...p, id_card_show_emergency_contact: v }))} />
                      <CheckboxRow label="Card material feature strip (master on/off)" checked={idCardForm.id_card_show_feature_strip} onChange={v => setIdCardForm(p => ({ ...p, id_card_show_feature_strip: v }))} />
                    </div>
                  </div>

                  {idCardForm.id_card_show_feature_strip && (
                    <div className="form-group">
                      <label className="form-label">Feature Strip Icons — show/hide and relabel each one</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {idCardForm.id_card_feature_icons.map((icon, i) => (
                          <div key={icon.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                            <input type="checkbox" checked={icon.visible !== false}
                              onChange={e => setIdCardForm(p => ({ ...p, id_card_feature_icons: p.id_card_feature_icons.map((ic, j) => j === i ? { ...ic, visible: e.target.checked } : ic) }))} />
                            <span style={{ fontSize: 11, width: 60, flexShrink: 0, color: 'var(--text-secondary)' }}>{FEATURE_ICON_LABELS[icon.key] || icon.key}</span>
                            <input type="text" className="form-control" placeholder="Line 1 (e.g. WATER RESISTANT)" style={{ fontSize: 11, padding: '4px 8px' }}
                              value={icon.caption1} disabled={icon.visible === false}
                              onChange={e => setIdCardForm(p => ({ ...p, id_card_feature_icons: p.id_card_feature_icons.map((ic, j) => j === i ? { ...ic, caption1: e.target.value } : ic) }))} />
                            <input type="text" className="form-control" placeholder="Line 2 (optional)" style={{ fontSize: 11, padding: '4px 8px' }}
                              value={icon.caption2} disabled={icon.visible === false}
                              onChange={e => setIdCardForm(p => ({ ...p, id_card_feature_icons: p.id_card_feature_icons.map((ic, j) => j === i ? { ...ic, caption2: e.target.value } : ic) }))} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && activePanel === 'idDesigner' && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13 }}>{error}</div>}
                  {success && activePanel === 'idDesigner' && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13 }}>{success}</div>}
                  <button className="btn btn-primary" onClick={handleSaveIdCardDesign} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Design'}</button>

                  {/* Background image */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ID Card Background Image</div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                      Uploaded on top of the Primary Color panel, at reduced opacity so it never overpowers the design — confined within the card border, and always drawn underneath the photo/text/QR (never covering them).
                    </p>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: 12 }}>Background image opacity: {Math.round(idCardForm.id_card_bg_opacity * 100)}%</label>
                      <input type="range" min="0" max="1" step="0.05" value={idCardForm.id_card_bg_opacity}
                        onChange={e => setIdCardForm(p => ({ ...p, id_card_bg_opacity: Number(e.target.value) }))}
                        style={{ width: '100%' }} />
                    </div>
                    <BgImageUploader schoolId={school?.id} onSuccess={() => { setSuccess('Background saved!'); setBgVersion(v => v + 1); }} />
                  </div>
                </div>
              </div>

              <div>
                <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Live Preview (Landscape) — exact same PDF a real card uses</div>
                <IdCardLivePreview formValues={idCardForm} refreshKey={bgVersion} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>Standard CR80 landscape card size (3.37" x 2.125") — unaffected by these settings.</div>
              </div>
            </div>
          )}

          {activePanel === 'templates' && (
            <div className="setting-panel active">
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ marginBottom: 6 }}><i className="fas fa-file-image"></i> Custom Certificate PNG Designs</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
                  Upload a separate PNG for each certificate. The PNG will be used as the full background, and student information, photo, signature, stamp, and QR code will be placed on top of it. If no template is provided, One Click School Solutions' default design will be used.
                </p>
                <div className="form-grid-3">
                  <CertificateTemplateBox label="Bonafide PNG" type="bonafide" file={templateFiles.bonafide} existingUrl={templateToUrl(school?.bonafide_template_url)} onChange={file => { setTemplateFiles(p => ({ ...p, bonafide: file })); saveTemplate('bonafide', file); }} onRemove={() => removeTemplate('bonafide')} />
                  <CertificateTemplateBox label="LC PNG" type="lc" file={templateFiles.lc} existingUrl={templateToUrl(school?.lc_template_url)} onChange={file => { setTemplateFiles(p => ({ ...p, lc: file })); saveTemplate('lc', file); }} onRemove={() => removeTemplate('lc')} />
                  <CertificateTemplateBox label="Student ID Card PNG" type="idcard" file={templateFiles.idcard} existingUrl={templateToUrl(school?.id_card_template_url)} onChange={file => { setTemplateFiles(p => ({ ...p, idcard: file })); saveTemplate('idcard', file); }} onRemove={() => removeTemplate('idcard')} />
                </div>
                <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12 }}>
                  Note: the PNG can be transparent or fully colored. Use A4 size for Bonafide/LC and CR80 landscape proportions for the ID Card. Leave enough empty space in the design so that dynamic text is not obscured.
                </div>
              </div>
            </div>
          )}

          {activePanel === 'wallet' && (
            <div className="setting-panel active">
              <div className="card" style={{ background: 'linear-gradient(135deg,#0F1E3D,#1A6FD4)', color: '#fff', padding: 24, marginBottom: 20, border: 'none' }}>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Current Balance</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{balance === null ? '...' : `₹${Number(balance).toLocaleString('en-IN')}`}</div>
              </div>

              <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                <h4 style={{ marginBottom: 14 }}>Add Funds (Bank Transfer)</h4>
                {bankDetails ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 20, marginBottom: 20 }}>
                    <div>
                      <InfoRow label="Account Holder" value={bankDetails.account_holder} />
                      <InfoRow label="Bank Name" value={bankDetails.bank_name} />
                      <InfoRow label="Account Number" value={bankDetails.account_number} />
                      <InfoRow label="IFSC" value={bankDetails.ifsc} />
                      <InfoRow label="Branch" value={bankDetails.branch || '-'} />
                      <InfoRow label="UPI ID" value={bankDetails.upi_id || '-'} />
                    </div>
                    {bankDetails.qr_code_path && (
                      <div style={{ textAlign: 'center' }}>
                        <img src={`/uploads/bank-qr/${bankDetails.qr_code_path}`} alt="Payment QR" style={{ width: 160, height: 160, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8 }} />
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Scan QR</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>Bank details are not yet available.</div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <h4 style={{ marginBottom: 12, fontSize: 14 }}>Submit Transaction Details</h4>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Amount *</label>
                      <input type="number" className="form-control" placeholder="Minimum ₹50" value={rechargeForm.amount} onChange={e => setRechargeForm(p => ({ ...p, amount: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">UTR / Reference Number *</label>
                      <input type="text" className="form-control" value={rechargeForm.utrNumber} onChange={e => setRechargeForm(p => ({ ...p, utrNumber: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Payment Date *</label>
                      <input type="date" className="form-control" value={rechargeForm.paymentDate} onChange={e => setRechargeForm(p => ({ ...p, paymentDate: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Screenshot (optional)</label>
                      <input type="file" accept="image/*" className="form-control" onChange={e => setRechargeForm(p => ({ ...p, screenshot: e.target.files[0] || null }))} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Remarks</label>
                    <textarea className="form-control" rows={2} value={rechargeForm.remarks} onChange={e => setRechargeForm(p => ({ ...p, remarks: e.target.value }))}></textarea>
                  </div>
                  {error && activePanel === 'wallet' && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
                  {success && activePanel === 'wallet' && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{success}</div>}
                  <button className="btn btn-primary" onClick={handleSubmitRecharge} disabled={submittingRecharge}><i className="fas fa-paper-plane"></i> {submittingRecharge ? 'Submitting...' : 'Submit'}</button>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><h3 className="card-title">Recharge Requests</h3></div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Amount</th><th>UTR</th><th>Status</th></tr></thead>
                    <tbody>
                      {rechargeRequests.length === 0 ? (
                        <tr><td colSpan={4}>No requests yet.</td></tr>
                      ) : rechargeRequests.map(r => (
                        <tr key={r.id}>
                          <td>{new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                          <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.utr_number}</td>
                          <td>
                            <span className={`badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                              {r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </span>
                            {r.status === 'rejected' && r.rejection_reason && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{r.rejection_reason}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Transaction History (Ledger)</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={handleExportLedgerExcel}><i className="fas fa-file-excel"></i> Excel</button>
                    <button className="btn btn-outline btn-sm" onClick={handleDownloadReceipt}><i className="fas fa-download"></i> Download Receipt</button>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Opening Balance</th><th>Amount</th><th>Closing Balance</th></tr></thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr><td colSpan={6}>No transactions yet.</td></tr>
                      ) : transactions.map(tx => (
                        <tr key={tx.id}>
                          <td>{new Date(tx.created_at).toLocaleDateString('en-IN')}</td>
                          <td><span className={`badge ${tx.type === 'credit' ? 'badge-success' : 'badge-danger'}`}>{tx.type === 'credit' ? 'Credit' : 'Debit'}</span></td>
                          <td>{tx.description}</td>
                          <td>₹{Number(tx.opening_balance).toLocaleString('en-IN')}</td>
                          <td style={{ color: tx.type === 'credit' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{tx.type === 'credit' ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN')}</td>
                          <td>₹{Number(tx.balance_after).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type={type} className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function UploadBox({ label, icon, file, existingUrl, onChange }) {
  const preview = file ? URL.createObjectURL(file) : existingUrl;
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        style={{ width: '100%', height: 120, border: '2px dashed var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}
        onClick={() => document.getElementById(`upload-${label}`).click()}
      >
        {preview ? (
          <img src={preview} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <><i className={`fas ${icon}`} style={{ fontSize: 28, color: 'var(--text-secondary)', marginBottom: 6 }}></i><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Upload</span></>
        )}
      </div>
      <input type="file" id={`upload-${label}`} accept="image/*" style={{ display: 'none' }} onChange={e => onChange(e.target.files[0] || null)} />
    </div>
  );
}

function CertificateTemplateBox({ label, type, file, existingUrl, onChange, onRemove }) {
  const preview = file ? URL.createObjectURL(file) : existingUrl;
  const inputId = `certificate-template-${type}`;
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ height: 150, border: '2px dashed var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        {preview ? <img src={preview} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <i className="fas fa-file-image" style={{ fontSize: 32, color: 'var(--text-secondary)' }} />}
      </div>
      <input id={inputId} type="file" accept="image/png,.png" style={{ display: 'none' }} onChange={e => onChange(e.target.files[0] || null)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => document.getElementById(inputId).click()}><i className="fas fa-upload"></i> {preview ? 'Replace' : 'Upload PNG'}</button>
        {existingUrl && <button type="button" className="btn btn-outline btn-sm" onClick={onRemove}><i className="fas fa-trash"></i></button>}
      </div>
    </div>
  );
}

// Rich-text editor matching the prototype's mechanism: a contenteditable div
// with a small formatting toolbar driven by document.execCommand. React
// doesn't manage contenteditable's inner HTML directly (that would fight the
// browser's own cursor handling), so this syncs outward via onInput and only
// sets innerHTML once on mount / when the value changes from outside.
function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (editorRef.current && (isFirstRender.current || document.activeElement !== editorRef.current)) {
      editorRef.current.innerHTML = value || '';
      isFirstRender.current = false;
    }
  }, [value]);

  function exec(command) {
    document.execCommand(command, false, null);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        <button type="button" className="rich-btn" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} title="Bold"><b>B</b></button>
        <button type="button" className="rich-btn" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} title="Italic"><i>I</i></button>
        <button type="button" className="rich-btn" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} title="Underline"><u>U</u></button>
      </div>
      <div
        ref={editorRef}
        className="rich-content"
        contentEditable="true"
        data-placeholder={placeholder}
        onInput={e => onChange(e.currentTarget.innerHTML)}
      ></div>
    </div>
  );
}

function CheckboxRow({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={Boolean(checked)} onChange={e => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function ColorPicker({ value, onChange }) {
  const [hex, setHex] = useState(value || '#1a6fd4');

  // Keep local hex in sync when parent changes (e.g. on load)
  useEffect(() => { if (value && value !== hex) setHex(value); }, [value]); // eslint-disable-line

  function commit(raw) {
    // Accept with or without the leading #
    const cleaned = raw.startsWith('#') ? raw : '#' + raw;
    setHex(cleaned);
    // Only fire onChange when it looks like a full valid hex (#rrggbb or #rgb)
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) onChange(cleaned);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Native colour picker + hex text input side by side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1a6fd4'}
            onChange={e => commit(e.target.value)}
            style={{ width: 48, height: 48, padding: 2, borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'none' }}
            title="Choose color"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden', height: 40 }}>
          <span style={{ padding: '0 8px', fontSize: 15, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', height: '100%', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border)' }}>#</span>
          <input
            type="text"
            value={hex.replace(/^#/, '')}
            onChange={e => commit('#' + e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
            maxLength={6}
            placeholder="1a6fd4"
            style={{ width: 90, height: '100%', border: 'none', outline: 'none', padding: '0 10px', fontFamily: 'monospace', fontSize: 14, letterSpacing: 1 }}
          />
        </div>
        {/* Live swatch of current colour */}
        <div style={{ width: 48, height: 48, borderRadius: 10, background: hex, border: '1.5px solid var(--border)', flexShrink: 0 }} title="Current color" />
      </div>

      {/* Preset swatches */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Quick Presets</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {ID_CARD_PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { setHex(c); onChange(c); }}
              title={c}
              style={{
                width: 30, height: 30, borderRadius: 6,
                background: c,
                border: hex.toLowerCase() === c.toLowerCase() ? '2.5px solid #111827' : '2px solid transparent',
                outline: hex.toLowerCase() === c.toLowerCase() ? '2px solid #fff' : 'none',
                outlineOffset: -3,
                cursor: 'pointer', padding: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,.2)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Renders the exact same PDF a real ID card generation would produce — using
// the CURRENT (possibly unsaved) Designer form values via the preview
// endpoint — instead of a hand-approximated CSS mock, so what's shown here
// is guaranteed to match the real card, not just resemble it.
function IdCardLivePreview({ formValues, refreshKey }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const formKey = JSON.stringify(formValues);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;

    debounceRef.current = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const res = await api.post('/schools/me/id-card-preview', formValues);
        if (cancelled) return;
        const binary = atob(res.data.pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 3 }); // card is small (242x163pt) — scale up for a crisp preview
        if (cancelled) return;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.cssText = 'width:100%;max-width:480px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.15);display:block;';

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';
        container.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e.response?.data?.error || e.message); setLoading(false); }
      }
    }, 500);

    return () => { cancelled = true; clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, refreshKey]);

  return (
    <div style={{ position: 'relative', minHeight: 200 }}>
      {loading && (
        <div style={{ textAlign: 'center', padding: 30 }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 20, color: 'var(--primary)' }}></i>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Updating preview…</div>
        </div>
      )}
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, padding: 10 }}>Could not render preview: {error}</div>}
      <div ref={containerRef} style={{ display: loading ? 'none' : 'block' }} />
    </div>
  );
}

// Uploads immediately on file selection — no separate "Upload" click step.
// (A prior two-step version — pick file, then click a separate Upload
// button — turned out to be a real source of confusion: color/text
// changes saved fine via the main Save Design button, but the background
// image silently never reached the server because the second click was
// easy to miss.) A local thumbnail shows the instant the file is picked,
// before the network request even finishes, so there's never ambiguity
// about whether a file was received.
function BgImageUploader({ onSuccess }) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(''); setErr('');
    setLocalPreviewUrl(URL.createObjectURL(file));

    setUploading(true);
    const formData = new FormData();
    formData.append('bg_image', file);
    try {
      await api.put('/schools/me/id-card-bg', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg('Background uploaded — updating preview below…');
      if (onSuccess) onSuccess();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Upload failed — please try a JPG, PNG, or WEBP file under 3MB.');
      setLocalPreviewUrl(null);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove the background image?')) return;
    try {
      await api.delete('/schools/me/id-card-bg');
      setMsg('Background removed.');
      setLocalPreviewUrl(null);
      if (onSuccess) onSuccess();
    } catch (e) { setErr(e.response?.data?.error || 'Delete failed'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {msg && <div style={{ background: '#ECFDF5', color: '#15803d', padding: 8, borderRadius: 6, fontSize: 12 }}>{msg}</div>}
      {err && <div style={{ background: '#FEE2E2', color: '#b91c1c', padding: 8, borderRadius: 6, fontSize: 12 }}>{err}</div>}
      {localPreviewUrl && (
        <img src={localPreviewUrl} alt="Selected background" style={{ width: 120, height: 76, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept="image/*" onChange={handleFileSelected} disabled={uploading} style={{ fontSize: 12 }} />
        {uploading && <i className="fas fa-spinner fa-spin" style={{ color: 'var(--primary)' }}></i>}
        <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleDelete}>
          <i className="fas fa-trash"></i> Remove
        </button>
      </div>
    </div>
  );
}
