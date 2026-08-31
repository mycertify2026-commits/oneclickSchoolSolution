import { useState, useRef } from 'react';

// Mandatory geo-tagged photo input — captures a photo (camera on mobile via
// `capture="environment"`, file picker on desktop) and stamps it with the
// device's current GPS location via the browser Geolocation API. Used for
// the School Inside/Outside photos that a Distributor/Super Distributor
// must supply when adding a school — the backend independently re-validates
// both the file and the coordinates are present, this is UX, not the only check.
export default function GeoPhotoCapture({ label, value, onChange }) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const inputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocError('');
    setLocating(true);
    if (!navigator.geolocation) {
      setLocating(false);
      setLocError('Location is not available on this device/browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          file,
          preview: URL.createObjectURL(file),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setLocating(false);
        setLocError('Could not get location — please allow location access and try again.');
        console.error('Geolocation error:', err.message);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function clear() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="form-group">
      <label className="form-label required">{label}</label>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={value.preview} alt={label} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <div><i className="fas fa-map-marker-alt" style={{ color: 'var(--success)' }}></i> {value.lat.toFixed(5)}, {value.lng.toFixed(5)}</div>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={clear}>Retake</button>
          </div>
        </div>
      ) : (
        <div>
          <label
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, width: 140, height: 100, border: '2px dashed var(--border)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12 }}
          >
            {locating ? (
              <><i className="fas fa-spinner fa-spin"></i> Getting location...</>
            ) : (
              <><i className="fas fa-camera" style={{ fontSize: 20 }}></i> Take / Upload Photo</>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFile}
              disabled={locating}
            />
          </label>
          {locError && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4, maxWidth: 200 }}>{locError}</div>}
        </div>
      )}
    </div>
  );
}
