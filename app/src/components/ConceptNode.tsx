import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FAM_COLOR } from '../familiarity';
import type { Familiarity } from '../types';

interface ConceptNodeData {
  label: string;
  familiarity: Familiarity;
}

export function ConceptNode({ data, selected }: NodeProps) {
  const d = data as unknown as ConceptNodeData;
  return (
    <div
      className={`concept-node ${selected ? 'selected' : ''}`}
      style={{ ['--n-color' as string]: FAM_COLOR[d.familiarity] } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span className="dot" />
      {d.label}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
