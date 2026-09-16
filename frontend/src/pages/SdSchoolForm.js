import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import GeoPhotoCapture from '../components/GeoPhotoCapture';
import api from '../api/client';

const BLANK = {
  name: '', adminName: '', adminEmail: '', adminMobile: '',
  udise_code: '', village: '', city: '', district: '', taluka: '',
  pin_code: '', phone: '', medium: '', board: '', distributorId: '', class_from: '', class_to: '', school_section: ''
};
const EDIT_FIELDS = ['name', 'udise_code', 'city', 'district', 'taluka', 'pin_code', 'phone', 'medium', 'board', 'class_from', 'class_to', 'school_section'];

const LOWER_CLASS_OPTIONS = ['Nursery', 'Junior KG', 'Senior KG', '1st Standard', '4th Standard', '5th Standard'];
const UPPER_CLASS_OPTIONS = ['4th Standard', '5th Standard', '6th Standard', '7th Standard', '8th Standard', '9th Standard', '10th Standard', '11th Standard', '12th Standard'];
const SCHOOL_SECTION_OPTIONS = ['Primary', 'Upper Primary', 'Secondary', 'Higher Secondary', 'Secondary and Higher Secondary'];

export default function SdSchoolForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [distributors, setDistributors] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [schoolName, setSchoolName] = useState('');
  const [insidePhoto, setInsidePhoto] = useState(null);
  const [outsidePhoto, setOutsidePhoto] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    api.get('/super-distributors/me/distributors').then(res => setDistributors(res.data.distributors)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    function fillFrom(s) {
      const initial = { ...BLANK };
      EDIT_FIELDS.forEach(f => { initial[f] = s[f] || ''; });
      setForm(initial);
      setSchoolName(s.name);
      setLoading(false);
    }
    // Navigated here from the list — the row is already loaded, no refetch needed.
    if (location.state?.school) { fillFrom(location.state.school); return; }
    // Direct visit / refresh — no single-school GET endpoint exists, so pull
    // the list (same data the list page itself uses) and find this row.
    api.get('/super-distributors/me/schools').then(res => {
      const s = (res.data.schools || []).find(x => x.id === id);
      if (s) fillFrom(s); else { setError('School not found'); setLoading(false); }
    }).catch(() => { setError('Failed to load school'); setLoading(false); });
  }, [id, isEdit, location.state]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  async function handleSave() {
    setError('');
    if (isEdit) {
      if (!form.name?.trim()) { setError('School name is required'); return; }
    } else {
      if (!form.name || !form.adminName || !form.adminEmail) { setError('School name, admin name and admin email are required'); return; }
      if (!insidePhoto) { setError('Please upload the geo-tagged inside photo of the school.'); return; }
      if (!outsidePhoto) { setError('Please upload the geo-tagged outside photo of the school.'); return; }
    }
    setSaving(true);
    try {
      if (isEdit) {
        const payload = {};
        EDIT_FIELDS.forEach(f => { payload[f] = form[f]; });
        await api.put(`/super-distributors/me/schools/${id}`, payload);
      } else {
        const data = new FormData();
        Object.entries(form).forEach(([k, v]) => data.append(k, v || ''));
        data.append('insidePhoto', insidePhoto.file);
        data.append('insideLat', insidePhoto.lat);
        data.append('insideLng', insidePhoto.lng);
        data.append('outsidePhoto', outsidePhoto.file);
        data.append('outsideLat', outsidePhoto.lat);
        data.append('outsideLng', outsidePhoto.lng);
        await api.post('/super-distributors/me/schools', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      navigate('/sd-schools');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save school');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout role="superDistributor"><div className="page-content">Loading...</div></Layout>;

  return (
    <Layout role="superDistributor">
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={() => navigate('/sd-schools')}>
            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>{isEdit ? `Edit School — ${schoolName}` : 'Add School'}</h1>
        </div>
      </div>

      {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="form-section">
        <div className="form-section-title"><i className="fas fa-school"></i> School Information</div>
        <div className="form-row form-row-2">
          <Field label="School Name *" value={form.name} onChange={v => handleChange('name', v)} />
          <Field label="U-DISE Code" value={form.udise_code} onChange={v => handleChange('udise_code', v)} />
        </div>
        <div className="form-row form-row-3">
          <Field label="City" value={form.city} onChange={v => handleChange('city', v)} />
          <Field label="District" value={form.district} onChange={v => handleChange('district', v)} />
          <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
        </div>
        <div className="form-row form-row-2">
          <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
          <Field label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} />
        </div>
        {isEdit && (
          <div className="form-row form-row-2">
            <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
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
        {!isEdit && (
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Assign Distributor (optional)</label>
              <select className="form-select" value={form.distributorId} onChange={e => handleChange('distributorId', e.target.value)}>
                <option value="">— Direct (no distributor) —</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {!isEdit && (
        <>
          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-user-tie"></i> School Admin</div>
            <div className="form-row form-row-2">
              <Field label="Admin Name *" value={form.adminName} onChange={v => handleChange('adminName', v)} />
              <Field label="Admin Email *" value={form.adminEmail} onChange={v => handleChange('adminEmail', v)} />
            </div>
            <div className="form-row form-row-2">
              <Field label="Admin Mobile" value={form.adminMobile} onChange={v => handleChange('adminMobile', v)} />
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
        <button className="btn btn-outline" onClick={() => navigate('/sd-schools')}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit for Approval'}</button>
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
