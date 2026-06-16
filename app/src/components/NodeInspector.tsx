import { motion } from 'framer-motion';
import { api } from '../api';
import { FAMILIARITIES, FAM_COLOR } from '../familiarity';
import type { Familiarity, WebNode } from '../types';

interface Props {
  spaceId: string;
  node: WebNode;
  onUpdate: (n: WebNode) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function NodeInspector({ spaceId, node, onUpdate, onDelete, onClose }: Props) {
  async function setFamiliarity(f: Familiarity) {
    const updated = await api.editNode(spaceId, node.id, { familiarity: f }).catch(() => null);
    if (updated) onUpdate(updated);
  }

  async function rename() {
    const label = prompt('Rename node:', node.label);
    if (label == null) return;
    const updated = await api.editNode(spaceId, node.id, { label }).catch(() => null);
    if (updated) onUpdate(updated);
  }

  return (
    <motion.div
      className="inspector"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ flex: 1 }}>{node.label}</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="faint">
        {node.source === 'user' ? 'familiarity set by you' : 'familiarity inferred'}
        {node.provenance?.sourceDoc ? ` · from ${node.provenance.sourceDoc}` : ''}
        {node.hasEmbedding ? '' : ' · no embedding'}
      </div>

      <div className="fam-row">
        {FAMILIARITIES.map((f) => (
          <button
            key={f}
            className={node.familiarity === f ? 'on' : ''}
            style={{ ['--f-color' as string]: FAM_COLOR[f] } as React.CSSProperties}
            onClick={() => setFamiliarity(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="node-text">{node.text}</div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={rename}>Rename</button>
        <button onClick={() => onDelete(node.id)} style={{ marginLeft: 'auto' }}>
          Delete
        </button>
      </div>
    </motion.div>
  );
}
