import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

const BLANK = { name: '', udise_code: '', village: '', city: '', taluka: '', district: '', phone: '', email: '', pin_code: '', medium: 'Marathi', board: 'Maharashtra SSC', distributorId: '', adminName: '', adminMobile: '', adminEmail: '', class_from: '', class_to: '', school_section: '' };

const LOWER_CLASS_OPTIONS = ['Nursery', 'Junior KG', 'Senior KG', '1st Standard', '4th Standard', '5th Standard'];
const UPPER_CLASS_OPTIONS = ['4th Standard', '5th Standard', '6th Standard', '7th Standard', '8th Standard', '9th Standard', '10th Standard', '11th Standard', '12th Standard'];
const SCHOOL_SECTION_OPTIONS = ['Primary', 'Upper Primary', 'Secondary', 'Higher Secondary', 'Secondary and Higher Secondary'];
const EDIT_FIELDS = ['name', 'udise_code', 'village', 'city', 'taluka', 'district', 'pin_code', 'phone', 'email', 'medium', 'board', 'class_from', 'class_to', 'school_section'];

export default function SaSchoolForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [distributors, setDistributors] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    api.get('/distributors').then(res => setDistributors(res.data.distributors)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/schools/${id}`).then(res => {
      const s = res.data.school;
      const initial = { ...BLANK };
      EDIT_FIELDS.forEach(f => { initial[f] = s[f] || ''; });
      setForm(initial);
      setSchoolName(s.name);
    }).catch(() => setError('Failed to load school'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  async function handleSave() {
    setError('');
    if (isEdit) {
      if (!form.name?.trim()) { setError('School name is required'); return; }
    } else if (!form.name || !form.adminName || !form.adminEmail) {
      setError('School name, admin name, and admin email are required');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const payload = {};
        EDIT_FIELDS.forEach(f => { payload[f] = form[f]; });
        await api.put(`/schools/${id}`, payload);
      } else {
        await api.post('/schools', form);
      }
      navigate('/sa-schools');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save school');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout role="superAdmin"><div className="page-content">Loading...</div></Layout>;

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-outline" style={{ marginBottom: 10 }} onClick={() => navigate('/sa-schools')}>
            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
          </button>
          <h2 style={{ margin: 0 }}>{isEdit ? `Edit School — ${schoolName}` : 'Add School'}</h2>
        </div>
      </div>

      {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 20 }}>
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-info-circle"></i><h4>School Information</h4></div>
          <div className="form-row form-row-2">
            <Field label="School Name *" value={form.name} onChange={v => handleChange('name', v)} />
            <Field label="U-DISE Number" value={form.udise_code} onChange={v => handleChange('udise_code', v)} placeholder="MH27010001" />
          </div>

          {isEdit ? (
            <>
              <div className="form-row form-row-3">
                <Field label="Village" value={form.village} onChange={v => handleChange('village', v)} />
                <Field label="City" value={form.city} onChange={v => handleChange('city', v)} />
                <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
              </div>
              <div className="form-row form-row-3">
                <Field label="District" value={form.district} onChange={v => handleChange('district', v)} />
                <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
                <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Email" value={form.email} onChange={v => handleChange('email', v)} />
                <Field label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} />
                <Field label="Board" value={form.board} onChange={v => handleChange('board', v)} />
              </div>
            </>
          ) : (
            <>
              <div className="form-row form-row-3">
                <Field label="City" value={form.city} onChange={v => handleChange('city', v)} />
                <Field label="Taluka" value={form.taluka} onChange={v => handleChange('taluka', v)} />
                <Field label="District" value={form.district} onChange={v => handleChange('district', v)} />
              </div>
              <div className="form-row form-row-3">
                <Field label="Phone" value={form.phone} onChange={v => handleChange('phone', v)} />
                <Field label="Email" value={form.email} onChange={v => handleChange('email', v)} />
                <Field label="PIN Code" value={form.pin_code} onChange={v => handleChange('pin_code', v)} />
              </div>
              <div className="form-row form-row-3">
                <SelectField label="Medium" value={form.medium} onChange={v => handleChange('medium', v)} options={['Marathi', 'English', 'Hindi', 'Semi-English']} />
                <SelectField label="Board" value={form.board} onChange={v => handleChange('board', v)} options={['Maharashtra SSC', 'CBSE', 'ICSE']} />
                <div className="form-group">
                  <label className="form-label">Assign Distributor</label>
                  <select className="form-select" value={form.distributorId} onChange={e => handleChange('distributorId', e.target.value)}>
                    <option value="">Self (Super Admin — Direct, no distributor)</option>
                    {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  {!form.distributorId && (
                    <div className="form-hint" style={{ marginTop: 4 }}>
                      No distributor assigned — 100% of the platform commission for this school goes to Super Admin.
                    </div>
                  )}
                </div>
              </div>
            </>
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
          <div className="form-section">
            <div className="form-section-title"><i className="fas fa-user"></i><h4>School Admin Details</h4></div>
            <div className="form-row form-row-3">
              <Field label="Admin Name *" value={form.adminName} onChange={v => handleChange('adminName', v)} placeholder="Principal Name" />
              <Field label="Mobile" value={form.adminMobile} onChange={v => handleChange('adminMobile', v)} placeholder="9876543210" />
              <Field label="Admin Email *" value={form.adminEmail} onChange={v => handleChange('adminEmail', v)} placeholder="admin@school.in" />
            </div>
            <div className="form-hint">A password setup email will be sent to this address automatically.</div>
          </div>
        )}

        <div className="form-section" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => navigate('/sa-schools')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save School'}</button>
          </div>
        </div>
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
function SelectField({ label, value, onChange, options }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
