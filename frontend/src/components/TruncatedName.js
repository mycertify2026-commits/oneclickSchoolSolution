import { useState } from 'react';

// Shows just the first word + "…" for a long name (e.g. a long school name
// in a narrow table column); click reveals the full name in a small
// tooltip. Short names render as plain text with no interaction.
export default function TruncatedName({ name, maxWords = 1 }) {
  const [open, setOpen] = useState(false);

  if (!name) return <span>—</span>;
  const words = String(name).trim().split(/\s+/);
  const isLong = words.length > maxWords || name.length > 20;
  if (!isLong) return <span>{name}</span>;

  const short = words.slice(0, maxWords).join(' ') + '…';

  return (
    <span
      style={{ position: 'relative', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3, color: 'inherit' }}
      onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      onMouseLeave={() => setOpen(false)}
      title=""
    >
      {short}
      {open && (
        <span
          style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
            background: '#1a1a1a', color: '#fff', padding: '6px 10px', borderRadius: 6,
            fontSize: 12, whiteSpace: 'nowrap', zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,.25)',
          }}
        >
          {name}
        </span>
      )}
    </span>
  );
}
