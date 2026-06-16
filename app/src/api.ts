import type {
  Familiarity,
  Mode,
  ProcessRecord,
  Space,
  SpaceSummary,
  WebGraph,
  WebNode,
  Workstream,
} from './types';

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `${method} ${path} (${res.status})`);
  return data as T;
}

export interface KeepBody {
  text: string;
  label?: string;
  position?: { x: number; y: number };
  provenance?: unknown;
}

export type NodePatch = Partial<{
  familiarity: Familiarity;
  label: string;
  note: string;
  position: { x: number; y: number };
  tags: string[];
}>;

export const api = {
  orchard: () => http<SpaceSummary[]>('GET', '/orchard'),
  plantSeed: (seedText: string, title?: string) =>
    http<{ id: string }>('POST', '/orchard', { seedText, title }),
  space: (id: string) => http<Space>('GET', `/spaces/${id}`),
  saveUnderstanding: (id: string, content: string) =>
    http('PUT', `/spaces/${id}/understanding`, { content }),
  setMode: (id: string, mode: Mode) => http<{ mode: Mode }>('PUT', `/spaces/${id}/mode`, { mode }),
  workstreams: (id: string) => http<Workstream[]>('GET', `/spaces/${id}/workstreams`),
  startProcess: (id: string, workstreamId: string, input?: Record<string, string>) =>
    http<ProcessRecord>('POST', `/spaces/${id}/processes`, { workstreamId, input }),
  process: (pid: string) => http<ProcessRecord>('GET', `/processes/${pid}`),
  web: (id: string) => http<WebGraph>('GET', `/spaces/${id}/web`),
  keep: (id: string, body: KeepBody) => http<WebNode>('POST', `/spaces/${id}/web/nodes`, body),
  editNode: (id: string, nid: string, patch: NodePatch) =>
    http<WebNode>('PUT', `/spaces/${id}/web/nodes/${nid}`, patch),
  deleteNode: (id: string, nid: string) => http<{ ok: true }>('DELETE', `/spaces/${id}/web/nodes/${nid}`),
};
