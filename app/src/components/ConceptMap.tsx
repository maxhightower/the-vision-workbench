import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { api } from '../api';
import type { WebNode } from '../types';
import { ConceptNode } from './ConceptNode';

const nodeTypes = { concept: ConceptNode };

interface Props {
  spaceId: string;
  nodes: WebNode[];
  selectedId: string | null;
  justAdded: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (node: WebNode) => void;
  onKeepAt: (text: string, position: { x: number; y: number }, provenance?: unknown) => void;
}

function Flow({ spaceId, nodes, selectedId, justAdded, onSelect, onUpdate, onKeepAt }: Props) {
  const rf = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    setRfNodes(
      nodes.map((n) => ({
        id: n.id,
        type: 'concept',
        position: n.position,
        data: { label: n.label, familiarity: n.familiarity },
        selected: n.id === selectedId,
        className: justAdded === n.id ? 'just-added' : undefined,
      })),
    );
  }, [nodes, selectedId, justAdded, setRfNodes]);

  // latent-neighbour glow: faint animated edges from the selected node to its nearest kin
  const rfEdges: Edge[] = useMemo(() => {
    if (!selectedId) return [];
    const sel = nodes.find((n) => n.id === selectedId);
    if (!sel) return [];
    return sel.neighbors
      .filter((nb) => nb.score > 0.55)
      .map((nb) => ({
        id: `${selectedId}-${nb.id}`,
        source: selectedId,
        target: nb.id,
        animated: true,
        style: { stroke: 'var(--accent)', opacity: 0.5 },
      }));
  }, [selectedId, nodes]);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => onSelect(node.id), [onSelect]);

  const onNodeDragStop = useCallback(
    async (_e: unknown, node: Node) => {
      const updated = await api
        .editNode(spaceId, node.id, { position: { x: node.position.x, y: node.position.y } })
        .catch(() => null);
      if (updated) onUpdate(updated);
    },
    [spaceId, onUpdate],
  );

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const text = e.dataTransfer.getData('text/plain');
        if (!text?.trim()) return;
        let provenance: unknown = null;
        try {
          provenance = JSON.parse(e.dataTransfer.getData('application/x-wb-provenance') || 'null');
        } catch {
          provenance = null;
        }
        const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        onKeepAt(text, position, provenance);
      }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => onSelect(null)}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={26} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!nodes.length && (
        <div className="map-empty">
          Your web is empty. Select text in the forge below and keep it — it lands here as a node.
        </div>
      )}
    </div>
  );
}

export function ConceptMap(props: Props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
