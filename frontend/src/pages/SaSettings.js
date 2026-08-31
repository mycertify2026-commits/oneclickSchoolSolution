import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/client';

const MASTER_SECTIONS = [
  { key: 'standard', label: 'Standards', icon: 'fa-list-ol' },
  { key: 'division', label: 'Divisions', icon: 'fa-layer-group' },
  { key: 'district', label: 'Districts', icon: 'fa-map-marker-alt' },
  { key: 'taluka', label: 'Talukas', icon: 'fa-map' },
  { key: 'city', label: 'Cities', icon: 'fa-city' },
  { key: 'medium', label: 'Mediums', icon: 'fa-language' },
  { key: 'religion', label: 'Religions', icon: 'fa-om' },
  { key: 'caste', label: 'Castes', icon: 'fa-users' },
  { key: 'grant_type', label: 'Grant Types', icon: 'fa-hand-holding-usd' },
  { key: 'board_name', label: 'Board Names', icon: 'fa-university' },
  { key: 'management_type', label: 'Management Types', icon: 'fa-building' }
];

export default function SaSettings() {
  const [currentSection, setCurrentSection] = useState('standard');
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  // ID Card Pricing
  const [idCardPricing, setIdCardPricing] = useState({ soft: '', hard: '' });
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingMsg, setPricingMsg] = useState('');
  const [pricingErr, setPricingErr] = useState('');

  const load = useCallback(async (category) => {
    const res = await api.get('/master-data', { params: { category } });
    setItems(res.data.items);
  }, []);

  useEffect(() => { load(currentSection); setSearch(''); }, [currentSection, load]);

  useEffect(() => {
    api.get('/id-cards/pricing').then(({ data }) => {
      const soft = data.pricing?.find(p => p.copy_type === 'soft');
      const hard = data.pricing?.find(p => p.copy_type === 'hard');
      setIdCardPricing({ soft: soft ? String(soft.price) : '20', hard: hard ? String(hard.price) : '100' });
    }).catch(() => {});
  }, []);

  async function handleSavePricing() {
    setPricingMsg(''); setPricingErr('');
    if (!idCardPricing.soft || !idCardPricing.hard || isNaN(idCardPricing.soft) || isNaN(idCardPricing.hard)) {
      setPricingErr('Both prices must be valid numbers'); return;
    }
    setPricingSaving(true);
    try {
      await api.put('/id-cards/pricing', { softPrice: Number(idCardPricing.soft), hardPrice: Number(idCardPricing.hard) });
      setPricingMsg('ID card pricing saved successfully!');
    } catch (e) { setPricingErr(e.response?.data?.error || 'Failed to save pricing'); }
    finally { setPricingSaving(false); }
  }

  async function handleAdd() {
    setError('');
    if (!newValue.trim()) { setError('Value is required'); return; }
    try {
      await api.post('/master-data', { category: currentSection, value: newValue.trim() });
      setShowModal(false);
      setNewValue('');
      load(currentSection);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add item');
    }
  }

  async function handleSaveEdit(id) {
    if (!editValue.trim()) return;
    try {
      await api.put(`/master-data/${id}`, { value: editValue.trim() });
      setEditingId(null);
      load(currentSection);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update item');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this item?')) return;
    await api.delete(`/master-data/${id}`);
    load(currentSection);
  }

  async function handleExportMasterData() {
    try {
      const res = await api.get('/master-data/export', { params: { category: currentSection }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `master-data-${currentSection}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
    } catch (err) {
      alert('Export failed. Please try again.');
    }
  }

  async function handleDownloadMasterDataTemplate() {
    const res = await api.get('/master-data/import-template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'master-data-import-template.xlsx';
    link.click();
  }

  async function handleImportMasterData() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const data = new FormData();
      data.append('file', importFile);
      const res = await api.post('/master-data/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      load(currentSection);
    } catch (err) {
      setImportResult({ successCount: 0, failedCount: 0, duplicateCount: 0, errors: [{ row: '-', message: err.response?.data?.error || 'Import failed' }] });
    } finally {
      setImporting(false);
    }
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportFile(null);
    setImportResult(null);
  }

  const sectionMeta = MASTER_SECTIONS.find(s => s.key === currentSection);
  const filtered = items.filter(i => !search || i.value.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout role="superAdmin">
      <div className="page-header">
        <div><h2>Settings</h2><p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Manage all master data used across the platform</p></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        <div className="card" style={{ height: 'fit-content', padding: '8px 0' }}>
          {MASTER_SECTIONS.map(s => (
            <div
              key={s.key}
              className={`nav-item ${s.key === currentSection ? 'active' : ''}`}
              onClick={() => setCurrentSection(s.key)}
              style={s.key === currentSection ? { background: 'var(--primary-light)', color: 'var(--primary)', cursor: 'pointer' } : { color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <i className={`fas ${s.icon}`}></i>
              <span style={{ fontSize: 13 }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-list" style={{ color: 'var(--primary)', marginRight: 8 }}></i>{sectionMeta?.label}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={handleExportMasterData}><i className="fas fa-file-export"></i> Export</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowImportModal(true)}><i className="fas fa-file-import"></i> Import</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><i className="fas fa-plus"></i> Add</button>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="filter-row" style={{ padding: '16px 16px 0' }}>
              <div className="search-bar" style={{ maxWidth: 280 }}>
                <i className="fas fa-search"></i>
                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {filtered.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No items yet.</p>
              ) : filtered.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', padding: '8px 14px', borderRadius: 20, fontSize: 13 }}>
                  {editingId === item.id ? (
                    <>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditingId(null); }}
                        style={{ border: '1px solid var(--primary)', borderRadius: 6, padding: '2px 8px', fontSize: 13, width: 140 }}
                      />
                      <i className="fas fa-check" style={{ cursor: 'pointer', color: 'var(--success)', fontSize: 12 }} onClick={() => handleSaveEdit(item.id)}></i>
                      <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-light)', fontSize: 12 }} onClick={() => setEditingId(null)}></i>
                    </>
                  ) : (
                    <>
                      <span style={{ cursor: 'pointer' }} onClick={() => { setEditingId(item.id); setEditValue(item.value); }}>{item.value}</span>
                      <i className="fas fa-pen" style={{ cursor: 'pointer', color: 'var(--text-light)', fontSize: 10 }} onClick={() => { setEditingId(item.id); setEditValue(item.value); }}></i>
                      <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-light)', fontSize: 11 }} onClick={() => handleDelete(item.id)}></i>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={() => setShowModal(false)}>
          <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Item</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input type="text" className="form-control" value={newValue} onChange={e => setNewValue(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Save</button>
            </div>
          </div>
        </div>
      )}
      {showImportModal && (
        <div className="modal-overlay show" style={{ display: 'flex' }} onClick={closeImportModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-file-import" style={{ color: 'var(--success)', marginRight: 8 }}></i>Import Master Data</h3>
              <button className="modal-close" onClick={closeImportModal}>×</button>
            </div>
            <div className="modal-body">
              {!importResult ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Download the template, fill in Category and Value for each row, then upload it back here. Categories must exactly match: {MASTER_SECTIONS.map(s => s.key).join(', ')}.
                  </p>
                  <button className="btn btn-outline btn-sm" style={{ marginBottom: 20 }} onClick={handleDownloadMasterDataTemplate}><i className="fas fa-download"></i> Download Template</button>
                  <div className="form-group">
                    <label className="form-label">Upload filled file (.xlsx, .xls, or .csv)</label>
                    <input type="file" accept=".xlsx,.xls,.csv" className="form-control" onChange={e => setImportFile(e.target.files[0] || null)} />
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, background: '#ECFDF5', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>{importResult.successCount}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Success</div>
                    </div>
                    <div style={{ flex: 1, background: '#FEF3C7', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#B45309' }}>{importResult.duplicateCount}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Duplicate</div>
                    </div>
                    <div style={{ flex: 1, background: '#FEE2E2', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{importResult.failedCount}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Failed</div>
                    </div>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Row {e.row}{e.field ? ` (${e.field})` : ''}: {e.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeImportModal}>{importResult ? 'Close' : 'Cancel'}</button>
              {!importResult && (
                <button className="btn btn-primary" onClick={handleImportMasterData} disabled={!importFile || importing}>
                  <i className="fas fa-upload"></i> {importing ? 'Importing...' : 'Upload & Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ID Card Pricing Section */}
      <div className="card" style={{ marginTop: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <i className="fas fa-id-card" style={{ color: 'var(--primary)', fontSize: 18 }}></i>
          <h3 style={{ margin: 0 }}>ID Card Pricing</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Set the prices charged to schools for generating ID cards (soft copy = PDF download, hard copy = physical card dispatched).
        </p>
        {pricingMsg && <div style={{ background: '#ECFDF5', color: '#15803d', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{pricingMsg}</div>}
        {pricingErr && <div style={{ background: '#FEE2E2', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{pricingErr}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 400, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Soft Copy Price (₹)</label>
            <input type="number" min="0" className="form-control" value={idCardPricing.soft} onChange={e => setIdCardPricing(p => ({ ...p, soft: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Hard Copy Price (₹)</label>
            <input type="number" min="0" className="form-control" value={idCardPricing.hard} onChange={e => setIdCardPricing(p => ({ ...p, hard: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSavePricing} disabled={pricingSaving}>
          <i className="fas fa-save"></i> {pricingSaving ? 'Saving...' : 'Save Pricing'}
        </button>
      </div>
    </Layout>
  );
}
