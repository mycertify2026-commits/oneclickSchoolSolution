import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import PdfPreviewModal from '../components/PdfPreviewModal';
import api from '../api/client';

const DOC_TYPES = [
  { key: 'lc', label: 'Leaving Certificate' },
  { key: 'bonafide', label: 'Bonafide Certificate' },
  { key: 'idcard', label: 'School ID Card' },
];

const STATUS_BADGE = {
  draft: ['badge-warning', 'Draft'],
  active: ['badge-success', 'Active'],
};

export default function CertificateTemplates() {
  const [docType, setDocType] = useState('lc');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewPdf, setPreviewPdf] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/certificate-templates', { params: { docType } });
      setTemplates(res.data.templates);
    } finally {
      setLoading(false);
    }
  }, [docType]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload() {
    setError('');
    if (!file) { setError('Please choose a PDF, PNG, or JPEG file of your existing format.'); return; }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('template', file);
      data.append('name', name);
      data.append('version', version);
      const res = await api.post(`/certificate-templates/${docType}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      const templateId = res.data.template.id;
      await api.post(`/certificate-templates/${templateId}/analyze`);
      setShowUpload(false);
      setFile(null); setName(''); setVersion('');
      navigate(`/certificate-templates/${templateId}/edit`);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleActivate(t) {
    try {
      await api.put(`/certificate-templates/${t.id}/activate`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to activate template');
    }
  }

  async function handleDeactivate(t) {
    try {
      await api.put(`/certificate-templates/${t.id}/deactivate`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate template');
    }
  }

  async function handleDelete(t) {
    if (!window.confirm(`Delete "${t.name || 'this template'}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/certificate-templates/${t.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete template');
    }
  }

  async function handleTestGenerate(t) {
    try {
      const res = await api.post(`/certificate-templates/${t.id}/test-generate`);
      if (res.data.collisions?.length) {
        alert(`Warning: ${res.data.collisions.length} field(s) overlap. Open the editor to fix positions before activating.`);
      }
      setPreviewPdf(res.data.pdfBase64);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not generate a preview.');
    }
  }

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Certificate Templates</h1>
          <p className="page-subtitle">Upload your school's existing LC / Bonafide / ID Card format and use it for generated certificates.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setShowUpload(true); }}>
          <i className="fas fa-plus"></i> Add Template
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {DOC_TYPES.map(dt => (
          <button key={dt.key} className={`btn btn-sm ${docType === dt.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setDocType(dt.key)}>{dt.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Version</th><th>Status</th><th>Analysis</th><th>Uploaded</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>Loading…</td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No {DOC_TYPES.find(d => d.key === docType)?.label} templates yet. Certificates use the default platform design until you add one.
                </td></tr>
              ) : templates.map(t => {
                const [badgeCls, badgeLabel] = STATUS_BADGE[t.status] || STATUS_BADGE.draft;
                return (
                  <tr key={t.id}>
                    <td>{t.name || '(unnamed)'}</td>
                    <td>{t.version || '—'}</td>
                    <td><span className={`badge ${badgeCls}`}>{badgeLabel}</span></td>
                    <td>
                      {t.analysis_status === 'processing' && <span className="badge badge-warning">Analyzing…</span>}
                      {t.analysis_status === 'done' && <span className="badge badge-success">Analyzed</span>}
                      {t.analysis_status === 'failed' && <span className="badge badge-danger" title={t.analysis_error}>Failed</span>}
                      {t.analysis_status === 'pending' && <span className="badge badge-warning">Pending</span>}
                    </td>
                    <td>{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn-icon" title="Edit Mapping" onClick={() => navigate(`/certificate-templates/${t.id}/edit`)}><i className="fas fa-drafting-compass"></i></button>
                      <button className="btn-icon" title="Test Generate" onClick={() => handleTestGenerate(t)}><i className="fas fa-file-pdf"></i></button>
                      {t.is_active ? (
                        <button className="btn-icon" title="Deactivate" onClick={() => handleDeactivate(t)}><i className="fas fa-toggle-on" style={{ color: 'var(--success)' }}></i></button>
                      ) : (
                        <button className="btn-icon" title="Activate" onClick={() => handleActivate(t)}><i className="fas fa-toggle-off"></i></button>
                      )}
                      <button className="btn-icon" title="Delete" onClick={() => handleDelete(t)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowUpload(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-upload" style={{ color: 'var(--primary)', marginRight: 8 }}></i>Upload {DOC_TYPES.find(d => d.key === docType)?.label} Format</h3>
              <button className="modal-close" onClick={() => setShowUpload(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}
              <div className="form-group">
                <label className="form-label">Template Name</label>
                <input type="text" className="form-control" placeholder="e.g. ZP School LC Format 2026" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Version</label>
                <input type="text" className="form-control" placeholder="e.g. 2026" value={version} onChange={e => setVersion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">File (PDF, PNG, or JPEG)</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="form-control" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                After upload, the system will scan the document for existing labels (Name, DOB, Class, etc.) and suggest where to place each field — you'll confirm or adjust these in the next step.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                <i className="fas fa-upload"></i> {uploading ? 'Uploading & analyzing…' : 'Upload & Analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PdfPreviewModal show={!!previewPdf} pdfBase64={previewPdf} title="Test Certificate Preview" onClose={() => setPreviewPdf(null)} />
    </Layout>
  );
}
