import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Space, Workstream } from '../types';
import { KeepMenu } from './KeepMenu';

interface Props {
  space: Space;
  onSpaceChange: (s: Space) => void;
  onKeep: (text: string, provenance?: unknown) => void;
}

export function Forge({ space, onSpaceChange, onKeep }: Props) {
  const [understanding, setUnderstanding] = useState(space.understanding);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [stream, setStream] = useState('');
  const [running, setRunning] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => setUnderstanding(space.understanding), [space.id]);

  useEffect(() => {
    api.workstreams(space.id).then(setWorkstreams).catch(() => {});
    return () => esRef.current?.close();
  }, [space.id]);

  function editUnderstanding(v: string) {
    setUnderstanding(v);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.saveUnderstanding(space.id, v).catch(() => {});
      onSpaceChange({ ...space, understanding: v });
    }, 900);
  }

  async function run(ws: Workstream) {
    if (running || !ws.available) return;
    if (ws.inputs.length) {
      alert(`"${ws.name}" needs typed input — that lands in the forge soon. Try Cultivate Seed or Prune Scope.`);
      return;
    }
    setStream('');
    setRunning(ws.id);
    try {
      const proc = await api.startProcess(space.id, ws.id);
      esRef.current?.close();
      const es = new EventSource(`/api/processes/${proc.id}/stream`);
      esRef.current = es;
      es.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'snapshot') setStream(msg.record.output || '');
        else if (msg.type === 'chunk') setStream((s) => s + msg.text);
        else if (msg.type === 'end') {
          es.close();
          setRunning(null);
        }
      };
      es.onerror = () => {
        es.close();
        setRunning(null);
      };
    } catch (e) {
      setRunning(null);
      alert((e as Error).message);
    }
  }

  function selectionText(): string {
    return (window.getSelection()?.toString() || '').trim();
  }

  return (
    <div
      className="forge"
      onContextMenu={(e) => {
        const text = selectionText();
        if (!text) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, text });
      }}
    >
      <div className="forge-head">
        <span className="forge-section-label">Current Understanding</span>
        <div style={{ flex: 1 }} />
        <div className="keep-toolbar">
          <span
            className="drag-chip"
            draggable
            onDragStart={(e) => {
              const text = selectionText() || stream.trim();
              e.dataTransfer.setData('text/plain', text);
              e.dataTransfer.setData(
                'application/x-wb-provenance',
                JSON.stringify({ sourceDoc: 'forge', ts: new Date().toISOString() }),
              );
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title="Select text, then drag this onto the map to place it yourself"
          >
            ⇧ drag to map
          </span>
          <button
            onClick={() => {
              const text = selectionText();
              if (text) onKeep(text, { sourceDoc: 'forge', ts: new Date().toISOString() });
            }}
            title="Keep the selected text as a node (auto-placed)"
          >
            ＋ Keep selection
          </button>
        </div>
      </div>

      <textarea value={understanding} onChange={(e) => editUnderstanding(e.target.value)} spellCheck={false} />

      <div className="ws-row">
        {workstreams.map((ws) => (
          <button key={ws.id} disabled={!ws.available || !!running} onClick={() => run(ws)} title={ws.description}>
            {running === ws.id ? '▶ ' : ''}
            {ws.name}
          </button>
        ))}
      </div>

      <div className="forge-section-label">Workstream output</div>
      <div className="stream">{stream}</div>
      {stream.trim() && (
        <div>
          <button onClick={() => onKeep(stream.trim(), { sourceDoc: 'workstream', ts: new Date().toISOString() })}>
            ＋ Keep whole output
          </button>
        </div>
      )}

      {menu && (
        <KeepMenu
          x={menu.x}
          y={menu.y}
          onKeep={() => {
            onKeep(menu.text, { sourceDoc: 'forge', ts: new Date().toISOString() });
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
