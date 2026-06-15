import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useUI } from '../store';
import type { Mode, Space, WebNode } from '../types';
import { Forge } from './Forge';
import { ConceptMap } from './ConceptMap';
import { NodeInspector } from './NodeInspector';

export function Workspace({ spaceId }: { spaceId: string }) {
  const openSpace = useUI((s) => s.openSpace);
  const toggleTheme = useUI((s) => s.toggleTheme);

  const [space, setSpace] = useState<Space | null>(null);
  const [nodes, setNodes] = useState<WebNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFraction, setMapFraction] = useState(0.55);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    api.space(spaceId).then((s) => alive && setSpace(s)).catch(() => {});
    api.web(spaceId).then((w) => alive && setNodes(w.nodes)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [spaceId]);

  const keep = useCallback(
    async (text: string, position?: { x: number; y: number }, provenance?: unknown) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        const node = await api.keep(spaceId, { text: trimmed, position, provenance });
        setNodes((prev) => [...prev.filter((n) => n.id !== node.id), node]);
        setJustAdded(node.id);
        setSelectedId(node.id);
        window.setTimeout(() => setJustAdded((id) => (id === node.id ? null : id)), 1400);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [spaceId],
  );

  const updateNode = useCallback(
    (node: WebNode) => setNodes((prev) => prev.map((n) => (n.id === node.id ? node : n))),
    [],
  );

  const removeNode = useCallback(
    async (nid: string) => {
      await api.deleteNode(spaceId, nid).catch(() => {});
      setNodes((prev) => prev.filter((n) => n.id !== nid));
      setSelectedId((id) => (id === nid ? null : id));
    },
    [spaceId],
  );

  async function setMode(mode: Mode) {
    if (!space) return;
    setSpace({ ...space, mode });
    await api.setMode(spaceId, mode).catch(() => {});
  }

  function onSplitterDown(e: React.MouseEvent) {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    function move(ev: MouseEvent) {
      const f = (ev.clientY - rect.top) / rect.height;
      setMapFraction(Math.min(0.85, Math.max(0.15, f)));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  if (!space) {
    return (
      <div className="app">
        <div className="muted" style={{ padding: 24 }}>
          Loading…
        </div>
      </div>
    );
  }

  const selected = nodes.find((n) => n.id === selectedId) || null;

  return (
    <div className="app">
      <div className="topbar">
        <button onClick={() => openSpace(null)}>← Orchard</button>
        <span className="title">{space.title}</span>
        <span className="badge">⎇ {space.currentBranch}</span>
        <div className="spacer" />
        <div className="segmented" title="Posture: how the AI helps">
          <button className={space.mode === 'solution' ? 'on' : ''} onClick={() => setMode('solution')}>
            Solution
          </button>
          <button className={space.mode === 'learning' ? 'on' : ''} onClick={() => setMode('learning')}>
            Learning
          </button>
        </div>
        <button onClick={toggleTheme} title="Toggle theme">
          ◐
        </button>
      </div>

      <div className="workspace" ref={containerRef}>
        <div className="region-map" style={{ flex: `${mapFraction} 1 0` }}>
          <div className="region-title map-title">✦ Web</div>
          <ConceptMap
            spaceId={spaceId}
            nodes={nodes}
            selectedId={selectedId}
            justAdded={justAdded}
            onSelect={setSelectedId}
            onUpdate={updateNode}
            onKeepAt={keep}
          />
          {selected && (
            <NodeInspector
              spaceId={spaceId}
              node={selected}
              onUpdate={updateNode}
              onDelete={removeNode}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
        <div className="splitter" onMouseDown={onSplitterDown} />
        <div className="region-forge" style={{ flex: `${1 - mapFraction} 1 0` }}>
          <Forge space={space} onSpaceChange={setSpace} onKeep={(t, p) => keep(t, undefined, p)} />
        </div>
      </div>
    </div>
  );
}
