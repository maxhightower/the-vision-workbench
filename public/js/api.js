async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${method} ${url} failed (${res.status})`);
  return data;
}

export const api = {
  catalog: () => request('GET', '/api/catalog'),

  projects: () => request('GET', '/api/projects'),
  addProject: (name, path) => request('POST', '/api/projects', { name, path }),
  project: (id) => request('GET', `/api/projects/${id}`),
  removeProject: (id) => request('DELETE', `/api/projects/${id}`),

  runs: (id) => request('GET', `/api/projects/${id}/runs`),
  startRun: (id, skillId, args) => request('POST', `/api/projects/${id}/runs`, { skillId, args }),
  run: (rid) => request('GET', `/api/runs/${rid}`),
  stopRun: (rid) => request('POST', `/api/runs/${rid}/stop`, {}),

  settings: () => request('GET', '/api/settings'),
  saveSettings: (config) => request('PUT', '/api/settings', config),
};

/**
 * Follow a run's output stream.
 * handlers: { onSnapshot(record), onChunk(text), onEnd(status, error) }
 * Returns a close() function.
 */
export function streamRun(runId, handlers) {
  const source = new EventSource(`/api/runs/${runId}/stream`);
  source.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'snapshot') handlers.onSnapshot?.(msg.record);
    if (msg.type === 'chunk') handlers.onChunk?.(msg.text);
    if (msg.type === 'end') {
      handlers.onEnd?.(msg.status, msg.error);
      source.close();
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects; if the run ended the server closes us.
  };
  return () => source.close();
}
