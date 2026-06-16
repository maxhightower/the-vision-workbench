import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FAM_COLOR } from '../familiarity';
import type { Familiarity } from '../types';

interface ConceptNodeData {
  label: string;
  familiarity: Familiarity;
  size: 'sm' | 'md' | 'lg';
}

export function ConceptNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConceptNodeData;
  return (
    <div
      className={`concept-node size-${d.size} ${selected ? 'selected' : ''}`}
      style={{ ['--n-color' as string]: FAM_COLOR[d.familiarity] } as React.CSSProperties}
    >
      <div className="node-label">{d.label}</div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
