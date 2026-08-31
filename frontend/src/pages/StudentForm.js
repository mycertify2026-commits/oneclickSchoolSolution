import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

const BLANK = {
  register_number: '', serial_id: '', full_name: '', mother_name: '', father_name: '', aadhaar: '',
  nationality: 'Indian', mother_tongue: 'Marathi', gender: '', religion: '', caste: '', sub_caste: '',
  dob: '', birth_village: '', birth_taluka: '', birth_district: '', birth_state: 'Maharashtra', birth_country: 'India',
  prev_school: '', prev_standard: '', admission_standard: '', admission_division: '', admission_date: '',
  current_standard: '', current_division: '',
  roll_number: '', blood_group: '', parent_mobile: '', address: ''
};

export default function StudentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(BLANK);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isEdit) {
      api.get(`/students/${id}`).then(res => {
        setForm({ ...BLANK, ...res.data.student });
        if (res.data.student.photo_url) {
          const filename = res.data.student.photo_url.split('/').pop();
          setPhotoPreview(`/uploads/photos/${filename}`);
        }
      });
    }
  }, [id, isEdit]);

  function handleChange(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  function dobWords(dobStr) {
    if (!dobStr) return 'Will be filled in automatically once a date of birth is selected';
    const d = new Date(dobStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
    } catch (e) {
      setError('Could not access camera. Check browser permissions, or use file upload instead.');
    }
  }

  function stopCamera() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraOpen(false);
  }

  function capturePhoto() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(blob));
      stopCamera();
    }, 'image/jpeg', 0.9);
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setImporting(true);
    setImportResult(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/students/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Excel import failed');
    } finally {
      setImporting(false);
    }
  }

  async function downloadImportTemplate() {
    const res = await api.get('/students/import-template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student-import-template.xlsx';
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.full_name.trim()) { setError('Student full name is required'); return; }

    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => { if (value !== null && value !== undefined) data.append(key, value); });
      if (photoFile) data.append('photo', photoFile);

      if (isEdit) await api.put(`/students/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      else await api.post('/students', data, { headers: { 'Content-Type': 'multipart/form-data' } });

      navigate('/students');
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred while saving');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout role="schoolAdmin">
      {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {!isEdit && (
        <div className="card" style={{ padding: 16, marginBottom: 18, borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}><i className="fas fa-file-excel" style={{ color: 'var(--success)', marginRight: 7 }}></i>Import students from Excel</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Add many students at once, then generate an LC for any imported student.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={downloadImportTemplate}><i className="fas fa-download"></i> Download template</button>
              <label className="btn btn-primary btn-sm" style={{ cursor: importing ? 'wait' : 'pointer', margin: 0 }}>
                <i className="fas fa-upload"></i> {importing ? 'Importing...' : 'Upload Excel'}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={importing} onChange={handleImportFile} />
              </label>
            </div>
          </div>
          {importResult && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ color: importResult.failed ? '#92400E' : 'var(--success)', fontSize: 13, marginBottom: 8 }}>
                <strong>{importResult.created}</strong> students imported successfully.
                {importResult.failed > 0 && <> <strong>{importResult.failed}</strong> rows failed.</>}
              </div>
              {importResult.importedStudents?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {importResult.importedStudents.map(student => (
                    <div key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span>{student.full_name}</span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/certificates?studentId=${student.id}&type=lc`)}>
                        <i className="fas fa-certificate"></i> Generate LC
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* ── STUDENT ID ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-id-card"></i> Student Identification</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* Photo */}
            <div>
              <label className="form-label">Photo</label>
              {cameraOpen ? (
                <div>
                  <video ref={videoRef} autoPlay playsInline style={{ width: 160, borderRadius: 8, background: '#000' }} />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={capturePhoto}>Capture</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={stopCamera}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="photo-upload" onClick={() => document.getElementById('photoInput').click()} style={{ width: 120, height: 150, border: '2px dashed var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    {photoPreview ? (
                      <img src={photoPreview} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    ) : (
                      <>
                        <i className="fas fa-camera" style={{ fontSize: 28, color: 'var(--text-secondary)', marginBottom: 8 }}></i>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Upload photo</span>
                      </>
                    )}
                    <input type="file" id="photoInput" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8, width: 120 }} onClick={startCamera}><i className="fas fa-camera"></i> Use Camera</button>
                </div>
              )}
            </div>

            {/* ID fields */}
            <div style={{ flex: 1, minWidth: 300 }}>
              <div className="form-grid-2">
                <Field label="Register Number" required value={form.register_number} onChange={v => handleChange('register_number', v)} placeholder="e.g. 2024001" />
                <Field label="Serial ID" value={form.serial_id} onChange={v => handleChange('serial_id', v)} placeholder="e.g. S001" />
                <div style={{ gridColumn: '1/-1' }}><Field label="Student Full Name" required value={form.full_name} onChange={v => handleChange('full_name', v)} placeholder="Enter full name" /></div>
                <Field label="Mother's Name" required value={form.mother_name} onChange={v => handleChange('mother_name', v)} placeholder="Mother's name" />
                <Field label="Father's Name" value={form.father_name} onChange={v => handleChange('father_name', v)} placeholder="Father's name" />
                <Field label="Aadhaar Number" value={form.aadhaar} onChange={v => handleChange('aadhaar', v)} placeholder="12-digit Aadhaar number" maxLength={12} />
              </div>
            </div>
          </div>
        </div>

        {/* ── PERSONAL DETAILS ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-info-circle"></i> Personal Details</div>
          <div className="form-grid-3">
            <Select label="Nationality" value={form.nationality} onChange={v => handleChange('nationality', v)} options={[['Indian', 'Indian'], ['Other', 'Other']]} />
            <Select label="Mother Tongue" value={form.mother_tongue} onChange={v => handleChange('mother_tongue', v)} options={[['Marathi', 'Marathi'], ['Hindi', 'Hindi'], ['Urdu', 'Urdu'], ['Other', 'Other']]} />
            <Select label="Gender" required value={form.gender} onChange={v => handleChange('gender', v)} options={[['', 'Select'], ['Male', 'Male'], ['Female', 'Female']]} />
            <Field label="Religion" value={form.religion} onChange={v => handleChange('religion', v)} />
            <Field label="Caste" value={form.caste} onChange={v => handleChange('caste', v)} />
            <Field label="Sub-caste" value={form.sub_caste} onChange={v => handleChange('sub_caste', v)} placeholder="Sub-caste" />
          </div>
        </div>

        {/* ── BIRTH INFORMATION ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-birthday-cake"></i> Birth Information</div>
          <div className="form-grid-3">
            <Field label="Date of Birth" type="date" required value={form.dob} onChange={v => handleChange('dob', v)} />
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Date of Birth (in words)</label>
              <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>{dobWords(form.dob)}</div>
            </div>
            <Field label="Birth Village" value={form.birth_village} onChange={v => handleChange('birth_village', v)} placeholder="Birth village" />
            <Field label="Birth Taluka" value={form.birth_taluka} onChange={v => handleChange('birth_taluka', v)} />
            <Field label="Birth District" value={form.birth_district} onChange={v => handleChange('birth_district', v)} />
            <Field label="Birth State" value={form.birth_state} onChange={v => handleChange('birth_state', v)} />
            <Field label="Birth Country" value={form.birth_country} onChange={v => handleChange('birth_country', v)} />
          </div>
        </div>

        {/* ── PREVIOUS SCHOOL ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-school"></i> Previous School Information</div>
          <div className="form-grid-2">
            <Field label="Previous School Name" value={form.prev_school} onChange={v => handleChange('prev_school', v)} />
            <Field label="Previous Standard" value={form.prev_standard} onChange={v => handleChange('prev_standard', v)} />
          </div>
        </div>

        {/* ── ADMISSION ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-graduation-cap"></i> Admission Information</div>
          <div className="form-grid-4">
            <Field label="Admission Standard" required value={form.admission_standard} onChange={v => handleChange('admission_standard', v)} />
            <Field label="Division" required value={form.admission_division} onChange={v => handleChange('admission_division', v)} />
            <Field label="Admission Date" type="date" required value={form.admission_date} onChange={v => handleChange('admission_date', v)} />
            <Field label="Roll Number" value={form.roll_number} onChange={v => handleChange('roll_number', v)} />
          </div>
        </div>

        {/* ── CURRENT CLASS ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-layer-group"></i> Current Class</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8, marginBottom: 12 }}>
            Certificates show the student's current class. Leave blank to keep using the admission standard/division above (e.g. for a student who hasn't been promoted yet).
          </p>
          <div className="form-grid-4">
            <Field label="Current Standard" value={form.current_standard} onChange={v => handleChange('current_standard', v)} placeholder={form.admission_standard || 'Same as admission'} />
            <Field label="Current Division" value={form.current_division} onChange={v => handleChange('current_division', v)} placeholder={form.admission_division || 'Same as admission'} />
          </div>
        </div>

        {/* ── CONTACT ── */}
        <div className="form-section">
          <div className="form-section-title"><i className="fas fa-phone"></i> Contact Information</div>
          <div className="form-grid-3">
            <Field label="Blood Group" value={form.blood_group} onChange={v => handleChange('blood_group', v)} placeholder="B+" />
            <Field label="Parent Mobile" value={form.parent_mobile} onChange={v => handleChange('parent_mobile', v)} />
            <Field label="Address" value={form.address} onChange={v => handleChange('address', v)} />
          </div>
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div className="form-section" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={() => setForm(BLANK)}><i className="fas fa-redo"></i> Clear</button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/students')}><i className="fas fa-times"></i> Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}><i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

      </form>
    </Layout>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder, maxLength }) {
  return (
    <div className="form-group">
      <label className={`form-label ${required ? 'required' : ''}`}>{label}</label>
      <input type={type} className="form-control" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
    </div>
  );
}
function Select({ label, value, onChange, options, required }) {
  return (
    <div className="form-group">
      <label className={`form-label ${required ? 'required' : ''}`}>{label}</label>
      <select className="form-control" value={value || ''} onChange={e => onChange(e.target.value)}>
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </div>
  );
}
