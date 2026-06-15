export type Familiarity = 'unknown' | 'unfamiliar' | 'somewhat' | 'known';
export type Mode = 'solution' | 'learning';

export interface Provenance {
  sourceDoc?: string;
  lines?: string;
  agentRun?: string;
  ts?: string;
}

export interface WebNode {
  id: string;
  label: string;
  text: string;
  provenance: Provenance | null;
  tags: string[];
  familiarity: Familiarity;
  source: 'inferred' | 'user';
  position: { x: number; y: number };
  links: string[];
  note?: string;
  hasEmbedding: boolean;
  neighbors: { id: string; score: number }[];
  createdAt: string;
  updatedAt: string;
}

export interface WebGraph {
  nodes: WebNode[];
  edges: { from: string; to: string }[];
}

export interface Branch {
  name: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Space {
  id: string;
  title: string;
  seed: string;
  understanding: string;
  currentBranch: string;
  tags: string[];
  mode: Mode;
  branches: Branch[];
  outputsCount: number;
  createdAt: string;
}

export interface SpaceSummary {
  id: string;
  title: string;
  understandingPreview: string;
  mode: Mode;
  tags: string[];
  branchesCount: number;
  outputsCount: number;
  lastOpenedAt: string;
}

export interface WorkstreamInput {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

export interface Workstream {
  id: string;
  name: string;
  description: string;
  available: boolean;
  missingTools: string[];
  inputs: WorkstreamInput[];
}

export interface ProcessRecord {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  output: string;
  workstreamName: string;
  error: string | null;
}
