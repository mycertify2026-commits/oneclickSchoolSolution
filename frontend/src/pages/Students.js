import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useTranslation } from '../context/TranslationContext';
import api from '../api/client';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStd, setFilterStd] = useState('');
  const [filterDiv, setFilterDiv] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const load = useCallback(async () => {
    const res = await api.get('/students', { params: { search, standard: filterStd, division: filterDiv, gender: filterGender } });
    setStudents(res.data.students);
  }, [search, filterStd, filterDiv, filterGender]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this student? This cannot be undone.')) return;
    await api.delete(`/students/${id}`);
    load();
  }

  async function downloadTemplate() {
    const res = await api.get('/students/import-template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url; link.download = 'student-import-template.xlsx'; link.click();
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const data = new FormData();
      data.append('file', importFile);
      const res = await api.post('/students/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      load();
    } catch (err) {
      setImportResult({ created: 0, failed: 0, errors: [{ row: '-', error: err.response?.data?.error || 'Import failed' }] });
    } finally {
      setImporting(false);
    }
  }

  function closeImportModal() {
    setShowImport(false);
    setImportFile(null);
    setImportResult(null);
  }

  const standards = [...new Set(students.map(s => s.admission_standard).filter(Boolean))];
  const divisions = [...new Set(students.map(s => s.admission_division).filter(Boolean))];

  return (
    <Layout role="schoolAdmin">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('students')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setShowImport(true)}><i className="fas fa-file-excel"></i> {t('importExcel') || 'Import Excel'}</button>
          <button className="btn btn-primary" onClick={() => navigate('/students/new')}><i className="fas fa-plus"></i> {t('addStudent')}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="filter-row">
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input type="text" placeholder={t('searchStudents')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <select className="form-control" style={{ width: 160 }} value={filterStd} onChange={e => setFilterStd(e.target.value)}>
            <option value="">{t('allStandards')}</option>
            {standards.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-control" style={{ width: 120 }} value={filterDiv} onChange={e => setFilterDiv(e.target.value)}>
            <option value="">{t('allDivisions')}</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="form-control" style={{ width: 130 }} value={filterGender} onChange={e => setFilterGender(e.target.value)}>
            <option value="">{t('allGender')}</option>
            <option value="Male">{t('male')}</option>
            <option value="Female">{t('female')}</option>
          </select>
          <button className="btn btn-outline" onClick={() => { setSearch(''); setFilterStd(''); setFilterDiv(''); setFilterGender(''); }}><i className="fas fa-times"></i></button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('studentList')}</h3>
          <span className="badge badge-info">{students.length} {t('students')}</span>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('srNo')}</th><th>{t('regNo')}</th><th>{t('studentName')}</th><th>{t('motherName')}</th>
                <th>{t('gender')}</th><th>{t('standard')}</th><th>{t('division')}</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr><td colSpan={8}>No students found.</td></tr>
              ) : students.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>{s.register_number || '-'}</td>
                  <td><span style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate(`/students/${s.id}`)}>{s.full_name}</span></td>
                  <td>{s.mother_name || '-'}</td>
                  <td>{s.gender || '-'}</td>
                  <td>{s.admission_standard || '-'}</td>
                  <td>{s.admission_division || '-'}</td>
                  <td>
                    <button className="btn-icon" onClick={() => navigate(`/students/${s.id}/edit`)}><i className="fas fa-edit"></i></button>
                    <button className="btn-icon" onClick={() => navigate(`/certificates?studentId=${s.id}`)}><i className="fas fa-certificate"></i></button>
                    <button className="btn-icon" onClick={() => handleDelete(s.id)}><i className="fas fa-trash" style={{ color: 'var(--danger)' }}></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={closeImportModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-file-excel" style={{ color: 'var(--success)', marginRight: 8 }}></i>Import Students from Excel</h3>
              <button className="modal-close" onClick={closeImportModal}>×</button>
            </div>
            <div className="modal-body">
              {!importResult ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Download the template, fill it in (one student per row), then upload it back here.
                  </p>
                  <button className="btn btn-outline btn-sm" style={{ marginBottom: 20 }} onClick={downloadTemplate}><i className="fas fa-download"></i> Download Template</button>

                  <div className="form-group">
                    <label className="form-label">Upload filled file (.xlsx, .xls, or .csv)</label>
                    <input type="file" accept=".xlsx,.xls,.csv" className="form-control" onChange={e => setImportFile(e.target.files[0] || null)} />
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ background: importResult.failed > 0 ? '#FFFBEB' : '#ECFDF5', color: importResult.failed > 0 ? '#92400E' : 'var(--success)', padding: 14, borderRadius: 8, marginBottom: 14 }}>
                    <strong>{importResult.created}</strong> students imported successfully.
                    {importResult.failed > 0 && <span> <strong>{importResult.failed}</strong> rows failed.</span>}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Row {e.row}: {e.error}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeImportModal}>{importResult ? 'Close' : 'Cancel'}</button>
              {!importResult && (
                <button className="btn btn-primary" onClick={handleImport} disabled={!importFile || importing}>
                  <i className="fas fa-upload"></i> {importing ? 'Importing...' : 'Upload & Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
