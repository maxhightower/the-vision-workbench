import { useEffect, useState } from 'react';
import { api } from '../api';
import { useUI } from '../store';
import type { SpaceSummary } from '../types';

export function Orchard() {
  const openSpace = useUI((s) => s.openSpace);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.orchard().then(setSpaces).catch(() => {});
  }, []);

  async function plant() {
    if (!seed.trim() || busy) return;
    setBusy(true);
    try {
      const { id } = await api.plantSeed(seed.trim());
      openSpace(id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="orchard">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1>Workbench 🌱</h1>
        <div style={{ flex: 1 }} />
        <button onClick={toggleTheme}>◐ theme</button>
      </div>
      <p className="muted">Plant a seed and develop it — keep the good fibers onto the map as you go.</p>

      <div className="seed-box">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && plant()}
          placeholder="An early idea, in a sentence or two…"
        />
        <button className="primary" onClick={plant} disabled={busy || !seed.trim()}>
          Plant
        </button>
      </div>

      {spaces.map((s) => (
        <div key={s.id} className="space-card" onClick={() => openSpace(s.id)}>
          <div className="st">{s.title}</div>
          <div className="faint">
            {s.mode} · {s.branchesCount} branch{s.branchesCount === 1 ? '' : 'es'} · {s.outputsCount} outputs
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {s.understandingPreview}
          </div>
        </div>
      ))}
      {!spaces.length && <p className="faint">No idea spaces yet — plant your first seed above.</p>}
    </div>
  );
}
