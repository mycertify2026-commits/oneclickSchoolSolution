import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import PdfPreviewModal from '../components/PdfPreviewModal';
import api from '../api/client';

// Mirrors backend/src/utils/templateFieldDetector.js's FIELD_VOCABULARY —
// the dropdown a School Admin picks from when adding a field manually (the
// OCR suggestions arrive already tagged; this list is only for fields the
// scan missed, or when starting a template from scratch).
const FIELD_OPTIONS = [
  { value: 'student.full_name', label: 'Student Name' },
  { value: 'student.mother_name', label: "Mother's Name" },
  { value: 'student.father_name', label: "Father's Name" },
  { value: 'student.caste', label: 'Religion / Caste' },
  { value: 'student.nationality', label: 'Nationality' },
  { value: 'student.dob', label: 'Date of Birth' },
  { value: 'student.dob_words', label: 'DOB in Words' },
  { value: 'student.birth_place', label: 'Place of Birth' },
  { value: 'student.admission_date', label: 'Date of Admission' },
  { value: 'student.prev_school', label: 'Last School Attended' },
  { value: 'student.class_display', label: 'Class / Standard' },
  { value: 'student.register_number', label: 'GR Number' },
  { value: 'student.serial_id', label: 'Saral ID' },
  { value: 'student.aadhaar_masked', label: 'Aadhaar (masked)' },
  { value: 'student.roll_number', label: 'Roll Number' },
  { value: 'student.gender', label: 'Gender' },
  { value: 'lc.leaving_date', label: 'Date of Leaving' },
  { value: 'lc.since_when', label: 'Admitted Since' },
  { value: 'lc.reason_for_leaving', label: 'Reason for Leaving' },
  { value: 'lc.remarks', label: 'Remarks' },
  { value: 'lc.progress', label: 'Progress' },
  { value: 'lc.conduct', label: 'Conduct' },
  { value: 'school.name', label: 'School Name' },
  { value: 'school.udise_code', label: 'U-DISE Code' },
  { value: 'school.recog_no', label: 'Recognition No.' },
  { value: 'school.principal_name', label: 'Principal / Head Master' },
  { value: 'certificate.serial_number', label: 'Certificate No.' },
  { value: 'static_text', label: 'Static text (fixed, not per-student)' },
];

const FIELD_TYPE_COLOR = { text: '#1A6FD4', photo: '#7c3aed', qr: '#10B981', protected_zone: '#f59e0b' };
const DISPLAY_WIDTH = 700; // on-screen canvas width in px, scaled from page_width_pt

function backgroundToUrl(filePath) {
  if (!filePath) return null;
  return `/uploads/cert-templates/${String(filePath).split(/[\\/]/).pop()}`;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function findCollisions(fields) {
  const dynamic = fields.filter(f => ['text', 'photo', 'qr'].includes(f.field_type));
  const zones = fields.filter(f => f.field_type === 'protected_zone');
  const pairs = [];
  for (let i = 0; i < dynamic.length; i++) {
    for (let j = i + 1; j < dynamic.length; j++) {
      if (rectsOverlap(dynamic[i], dynamic[j])) pairs.push([dynamic[i]._key, dynamic[j]._key]);
    }
    for (const z of zones) {
      if (rectsOverlap(dynamic[i], z)) pairs.push([dynamic[i]._key, z._key]);
    }
  }
  return pairs;
}

let nextKey = 1;

export default function CertificateTemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [addMode, setAddMode] = useState(null); // 'text' | 'photo' | 'qr' | 'protected_zone' | null
  const [pendingFieldKey, setPendingFieldKey] = useState(FIELD_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [previewPdf, setPreviewPdf] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);
  const dragState = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/certificate-templates/${id}`);
      setTemplate(res.data.template);
      setFields(res.data.fields.map(f => ({ ...f, _key: `f${nextKey++}`, x: Number(f.x), y: Number(f.y), width: Number(f.width), height: Number(f.height) })));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading || !template) {
    return <Layout role="schoolAdmin"><div className="page-content">Loading template…</div></Layout>;
  }

  const pageWidthPt = Number(template.page_width_pt);
  const pageHeightPt = Number(template.page_height_pt);
  const scale = DISPLAY_WIDTH / pageWidthPt;
  const displayHeight = pageHeightPt * scale;
  const bgUrl = backgroundToUrl(template.background_url);
  const collisionPairs = findCollisions(fields);
  const collidingKeys = new Set(collisionPairs.flat());

  function ptToPx(v) { return v * scale; }
  function pxToPt(v) { return v / scale; }

  function updateField(key, patch) {
    setFields(prev => prev.map(f => (f._key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key) {
    setFields(prev => prev.filter(f => f._key !== key));
    if (selectedKey === key) setSelectedKey(null);
  }

  // ── Canvas click-to-place (when in "add" mode) ──────────────────────────
  function handleCanvasClick(e) {
    if (!addMode) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const defaults = {
      text: { width: 150, height: 16 },
      photo: { width: 90, height: 108 },
      qr: { width: 90, height: 90 },
      protected_zone: { width: 120, height: 40 },
    }[addMode];

    const newField = {
      _key: `f${nextKey++}`,
      field_type: addMode,
      field_key: addMode === 'text' ? pendingFieldKey : null,
      static_text: addMode === 'text' && pendingFieldKey === 'static_text' ? 'Text' : null,
      label: addMode === 'text' ? (FIELD_OPTIONS.find(o => o.value === pendingFieldKey)?.label || 'Field') : addMode === 'photo' ? 'Photo' : addMode === 'qr' ? 'QR Code' : 'Protected Zone',
      x: Number(pxToPt(xPx).toFixed(2)),
      y: Number(pxToPt(yPx).toFixed(2)),
      width: Number(pxToPt(defaults.width).toFixed(2)),
      height: Number(pxToPt(defaults.height).toFixed(2)),
      font_size: 11, font_weight: 'normal', align: 'left', color: '#1a1a1a',
      source: 'manual', confidence: null,
    };
    setFields(prev => [...prev, newField]);
    setSelectedKey(newField._key);
    setAddMode(null);
  }

  // ── Drag to move ─────────────────────────────────────────────────────────
  function startDrag(e, field) {
    e.stopPropagation();
    setSelectedKey(field._key);
    dragState.current = { mode: 'move', key: field._key, startX: e.clientX, startY: e.clientY, origX: field.x, origY: field.y };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function startResize(e, field) {
    e.stopPropagation();
    setSelectedKey(field._key);
    dragState.current = { mode: 'resize', key: field._key, startX: e.clientX, startY: e.clientY, origW: field.width, origH: field.height };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    const d = dragState.current;
    if (!d) return;
    const dxPt = pxToPt(e.clientX - d.startX);
    const dyPt = pxToPt(e.clientY - d.startY);
    if (d.mode === 'move') {
      updateField(d.key, { x: Math.max(0, Number((d.origX + dxPt).toFixed(2))), y: Math.max(0, Number((d.origY + dyPt).toFixed(2))) });
    } else {
      updateField(d.key, { width: Math.max(10, Number((d.origW + dxPt).toFixed(2))), height: Math.max(8, Number((d.origH + dyPt).toFixed(2))) });
    }
  }

  function onDragEnd() {
    dragState.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/certificate-templates/${id}/fields`, { fields });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save mapping');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestGenerate() {
    await handleSave();
    try {
      const res = await api.post(`/certificate-templates/${id}/test-generate`);
      if (res.data.collisions?.length) {
        alert(`${res.data.collisions.length} overlapping field(s) detected — check the highlighted boxes below before activating.`);
      }
      setPreviewPdf(res.data.pdfBase64);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not generate preview.');
    }
  }

  async function handleActivate() {
    await handleSave();
    try {
      await api.put(`/certificate-templates/${id}/activate`);
      navigate('/certificate-templates');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to activate');
    }
  }

  const selected = fields.find(f => f._key === selectedKey);

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">{template.name || 'Template'} — Field Mapping</h1>
          <p className="page-subtitle">Drag boxes to reposition, drag the corner to resize. Blank/OCR-suggested fields are pre-filled — review and correct them.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/certificate-templates')}>Back</button>
          <button className="btn btn-outline" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Mapping'}</button>
          <button className="btn btn-outline" onClick={handleTestGenerate}><i className="fas fa-file-pdf"></i> Test Generate</button>
          <button className="btn btn-primary" onClick={handleActivate}><i className="fas fa-check"></i> Save & Activate</button>
        </div>
      </div>

      {template.analysis_error && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          <i className="fas fa-exclamation-triangle"></i> {template.analysis_error}
        </div>
      )}
      {collisionPairs.length > 0 && (
        <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          <i className="fas fa-exclamation-circle"></i> {collisionPairs.length} field(s) overlap (highlighted in red below) — drag them apart before activating.
        </div>
      )}

      {/* Precise drag/resize field placement needs real screen width to stay
          usable, so this keeps its fixed desktop layout rather than
          reflowing — on a narrow screen it scrolls horizontally instead of
          breaking off-screen. Best used on a larger screen. */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', minWidth: 940 }}>
        {/* Toolbar */}
        <div className="card" style={{ padding: 16, width: 220, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add Field</div>
          <select className="form-control" style={{ marginBottom: 8, fontSize: 12 }} value={pendingFieldKey} onChange={e => setPendingFieldKey(e.target.value)}>
            {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className={`btn btn-sm ${addMode === 'text' ? 'btn-primary' : 'btn-outline'}`} style={{ width: '100%', marginBottom: 6 }} onClick={() => setAddMode(addMode === 'text' ? null : 'text')}>
            <i className="fas fa-font"></i> {addMode === 'text' ? 'Click canvas to place…' : 'Add Text Field'}
          </button>
          <button className={`btn btn-sm ${addMode === 'photo' ? 'btn-primary' : 'btn-outline'}`} style={{ width: '100%', marginBottom: 6 }} onClick={() => setAddMode(addMode === 'photo' ? null : 'photo')}>
            <i className="fas fa-image"></i> Add Photo Box
          </button>
          <button className={`btn btn-sm ${addMode === 'qr' ? 'btn-primary' : 'btn-outline'}`} style={{ width: '100%', marginBottom: 6 }} onClick={() => setAddMode(addMode === 'qr' ? null : 'qr')}>
            <i className="fas fa-qrcode"></i> Add QR Box
          </button>
          <button className={`btn btn-sm ${addMode === 'protected_zone' ? 'btn-primary' : 'btn-outline'}`} style={{ width: '100%', marginBottom: 16 }} onClick={() => setAddMode(addMode === 'protected_zone' ? null : 'protected_zone')}>
            <i className="fas fa-shield-alt"></i> Mark Protected Zone
          </button>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>Fields ({fields.length})</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {fields.map(f => (
              <div key={f._key}
                onClick={() => setSelectedKey(f._key)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginBottom: 2,
                  background: selectedKey === f._key ? 'rgba(26,111,212,.1)' : collidingKeys.has(f._key) ? '#FEE2E2' : 'transparent',
                }}>
                <span style={{ color: FIELD_TYPE_COLOR[f.field_type] }}>
                  <i className="fas fa-circle" style={{ fontSize: 7, marginRight: 6 }}></i>{f.label || f.field_key}
                </span>
                <button className="btn-icon" style={{ padding: 2 }} onClick={(e) => { e.stopPropagation(); removeField(f._key); }}><i className="fas fa-times"></i></button>
              </div>
            ))}
          </div>

          {selected && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Properties</div>
              {selected.field_type === 'text' && selected.field_key === 'static_text' && (
                <input type="text" className="form-control" style={{ marginBottom: 6, fontSize: 12 }} value={selected.static_text || ''} placeholder="Text to print" onChange={e => updateField(selected._key, { static_text: e.target.value })} />
              )}
              {selected.field_type === 'text' && (
                <>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Font size</label>
                  <input type="number" className="form-control" style={{ marginBottom: 6, fontSize: 12 }} value={selected.font_size} onChange={e => updateField(selected._key, { font_size: Number(e.target.value) })} />
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Weight</label>
                  <select className="form-control" style={{ marginBottom: 6, fontSize: 12 }} value={selected.font_weight} onChange={e => updateField(selected._key, { font_weight: e.target.value })}>
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                  </select>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Align</label>
                  <select className="form-control" style={{ marginBottom: 6, fontSize: 12 }} value={selected.align} onChange={e => updateField(selected._key, { align: e.target.value })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Color</label>
                  <input type="color" className="form-control" style={{ marginBottom: 6, height: 32 }} value={selected.color} onChange={e => updateField(selected._key, { color: e.target.value })} />
                </>
              )}
              <button className="btn btn-sm btn-outline" style={{ width: '100%', color: 'var(--danger)' }} onClick={() => removeField(selected._key)}>
                <i className="fas fa-trash"></i> Remove
              </button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="card" style={{ padding: 16, overflow: 'auto' }}>
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{
              position: 'relative', width: DISPLAY_WIDTH, height: displayHeight,
              backgroundImage: bgUrl ? `url(${bgUrl})` : 'none', backgroundSize: 'cover',
              backgroundColor: '#fff', border: '1px solid var(--border)',
              cursor: addMode ? 'crosshair' : 'default',
            }}>
            {fields.map(f => (
              <div key={f._key}
                onMouseDown={e => startDrag(e, f)}
                style={{
                  position: 'absolute', left: ptToPx(f.x), top: ptToPx(f.y), width: ptToPx(f.width), height: ptToPx(f.height),
                  border: `1.5px ${f.field_type === 'protected_zone' ? 'dashed' : 'solid'} ${collidingKeys.has(f._key) ? '#dc2626' : FIELD_TYPE_COLOR[f.field_type]}`,
                  background: collidingKeys.has(f._key) ? 'rgba(220,38,38,.12)' : `${FIELD_TYPE_COLOR[f.field_type]}1a`,
                  cursor: 'move', fontSize: 9, color: FIELD_TYPE_COLOR[f.field_type], overflow: 'hidden', whiteSpace: 'nowrap',
                  boxSizing: 'border-box', userSelect: 'none',
                }}>
                <span style={{ background: '#fff', padding: '0 2px' }}>{f.label || f.field_key}</span>
                <div
                  onMouseDown={e => startResize(e, f)}
                  style={{ position: 'absolute', right: -4, bottom: -4, width: 10, height: 10, background: FIELD_TYPE_COLOR[f.field_type], borderRadius: 2, cursor: 'nwse-resize' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      <PdfPreviewModal show={!!previewPdf} pdfBase64={previewPdf} title="Test Certificate Preview" onClose={() => setPreviewPdf(null)} />
    </Layout>
  );
}
