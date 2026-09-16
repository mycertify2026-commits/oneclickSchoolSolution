import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import GeoPhotoCapture from '../components/GeoPhotoCapture';
import api from '../api/client';

const BLANK = { name: '', adminName: '', adminEmail: '', adminMobile: '', udise_code: '', village: '', city: '', district: '', taluka: '', pin_code: '', phone: '', medium: '', board: '', class_from: '', class_to: '', school_section: '' };
const EDIT_FIELDS = ['name', 'udise_code', 'village', 'city', 'taluka', 'district', 'pin_code', 'phone', 'medium', 'board', 'class_from', 'class_to', 'school_section'];

const LOWER_CLASS_OPTIONS = ['Nursery', 'Junior KG', 'Senior KG', '1st Standard', '4th Standard', '5th Standard'];
const UPPER_CLASS_OPTIONS = ['4th Standard', '5th Standard', '6th Standard', '7th Standard', '8th Standard', '9th Standard', '10th Standard', '11th Standard', '12th Standard'];
const SCHOOL_SECTION_OPTIONS = ['Primary', 'Upper Primary', 'Secondary', 'Higher Secondary', 'Secondary and Higher Secondary'];

export default function DistSchoolForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(BLANK);
  const [schoolName, setSchoolName] = useState('');
  const [insidePhoto, setInsidePhoto] = useState(null);
  const [outsidePhoto, setOutsidePhoto] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    function fillFrom(s) {
      const initial = { ...BLANK };
      EDIT_FIELDS.forEach(f => { initial[f] = s[f] || ''; });
      setForm(initial);
      setSchoolName(s.name);
      setLoading(false);
    }
    if (location.state?.school) { fillFrom(location.state.school); return; }
    api.get('/distributors/me/schools').then(res => {
      const s = (res.data.schools || []).find(x => x.id === id);
      if (s) fillFrom(s); else { setError('School not found'); setLoading(false); }
    }).catch(() => { setError('Failed to load school'); setLoading(false); });
  }, [id, isEdit, location.state]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  async function handleSave() {
    setError(''); setSuccess('');
    if (isEdit) {
      if (!form.name?.trim()) { setError('School name is required'); return; }
    } else {
      if (!form.name || !form.adminName || !form.adminEmail) { setError('Please fill in all required information'); return; }
      if (!insidePhoto) { setError('Please upload the geo-tagged inside photo of the school.'); return; }
      if (!outsidePhoto) { setError('Please upload the geo-tagged outside photo of the school.'); return; }
    }
    setSaving(true);
    try {
      if (isEdit) {
        const payload = {};
        EDIT_FIELDS.forEach(f => { payload[f] = form[f]; });
        await api.put(`/distributors/me/schools/${id}`, payload);
        navigate('/dist-schools');
      } else {
        const data = new FormData();
        Object.entries(form).forEach(([k, v]) => data.append(k, v || ''));
        data.append('insidePhoto', insidePhoto.file);
        data.append('insideLat', insidePhoto.lat);
        data.append('insideLng', insidePhoto.lng);
        data.append('outsidePhoto', outsidePhoto.file);
        data.append('outsideLat', outsidePhoto.lat);
        data.append('outsideLng', outsidePhoto.lng);
        await api.post('/distributors/me/schools', data, { headers: { 'Content-Type': 'multipart/form-data' } });
        navigate('/dist-schools');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error while saving school');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout role="distributor"><div className="page-content">Loading...</div></Layout>;

  return (
    <Layout role="distributor">
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={() => navigate('/dist-schools')}>
            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>{isEdit ? `Edit School — ${schoolName}` : 'Add School'}</h1>
        </div>
      </div>

      {success && <div style={{ background: '#ECFDF5', color: 'var(--success)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{success}</div>}
      {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="form-section">
        <div className="form-section-title"><i className="fas fa-school"></i> School Information</div>
        <div className="form-row form-row-2">
          <Field label="School Name *" value={form.name} onChange={v => handleChange('name', v)} placeholder="Full school name" />
          <Field label="U-DISE Code" value={form.udise_code} onChange={v => handleChange('udise_code', v)} />
        </div>
        {isEdit && (
          <div className="form-row form-row-3">
            <Field label="Village" value={form.village} onChange={v => handleChange('village', v)} />
            <Field label="City" value={form.city} onChange={v => handleChange('city', v)} />
            <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
          </div>
        )}
        <div className="form-row form-row-3">
          {!isEdit && <Field label="City/Village *" value={form.city} onChange={v => handleChange('city', v)} />}
          {!isEdit && <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />}
          <Field label={isEdit ? 'District' : 'District *'} value={form.district} onChange={v => handleChange('district', v)} />
          {isEdit && <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />}
          {isEdit && <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />}
        </div>
        {!isEdit && (
          <div className="form-row form-row-3">
            <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
            <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
            <Field label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} />
          </div>
        )}
        {isEdit && (
          <div className="form-row form-row-2">
            <Field label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} />
            <Field label="Board" value={form.board} onChange={v => handleChange('board', v)} />
          </div>
        )}
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Lower Class</label>
            <select className="form-select" value={form.class_from} onChange={e => handleChange('class_from', e.target.value)}>
              <option value="">-- Select --</option>
              {LOWER_CLASS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Upper Class</label>
            <select className="form-select" value={form.class_to} onChange={e => handleChange('class_to', e.target.value)}>
              <option value="">-- Select --</option>
              {UPPER_CLASS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">School Section</label>
            <select className="form-select" value={form.school_section} onChange={e => handleChange('school_section', e.target.value)}>
              <option value="">-- Select --</option>
              {SCHOOL_SECTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!isEdit && (
        <>
          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-user-tie"></i> Administrator Information</div>
            <div className="form-row form-row-2">
              <Field label="Principal Name *" value={form.adminName} onChange={v => handleChange('adminName', v)} />
              <Field label="Mobile *" value={form.adminMobile} onChange={v => handleChange('adminMobile', v)} />
            </div>
            <div className="form-row form-row-2">
              <Field label="Email *" value={form.adminEmail} onChange={v => handleChange('adminEmail', v)} />
            </div>
            <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <i className="fas fa-info-circle" style={{ color: '#f59e0b' }}></i> After adding the school, you will need to wait for approval from the Super Admin.
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-camera"></i> School Verification Photos</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8, marginBottom: 12 }}>
              Both photos are required and must be geo-tagged with your current location.
            </p>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <GeoPhotoCapture label="School Inside Photo" value={insidePhoto} onChange={setInsidePhoto} />
              <GeoPhotoCapture label="School Outside Photo" value={outsidePhoto} onChange={setOutsidePhoto} />
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button className="btn btn-outline" onClick={() => navigate('/dist-schools')}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="fas fa-paper-plane"></i> {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit for Approval'}</button>
      </div>
    </Layout>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type="text" className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
