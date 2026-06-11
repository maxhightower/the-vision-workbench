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
  orchard: () => request('GET', '/api/orchard'),
  plantSeed: (seedText, title) => request('POST', '/api/orchard', { seedText, title }),

  space: (id) => request('GET', `/api/spaces/${id}`),
  saveUnderstanding: (id, content) =>
    request('PUT', `/api/spaces/${id}/understanding`, { content }),

  branches: (id) => request('GET', `/api/spaces/${id}/branches`),
  createBranch: (id, body) => request('POST', `/api/spaces/${id}/branches`, body),
  switchBranch: (id, name) => request('POST', `/api/spaces/${id}/branches/switch`, { name }),
  renameBranch: (id, oldName, newName) =>
    request('POST', `/api/spaces/${id}/branches/rename`, { oldName, newName }),
  compareBranches: (id) => request('GET', `/api/spaces/${id}/branches/compare`),

  outputs: (id) => request('GET', `/api/spaces/${id}/outputs`),
  output: (id, oid) => request('GET', `/api/spaces/${id}/outputs/${oid}`),
  saveOutput: (id, body) => request('POST', `/api/spaces/${id}/outputs`, body),
  updateOutput: (id, oid, body) => request('PUT', `/api/spaces/${id}/outputs/${oid}`, body),
  deleteOutput: (id, oid) => request('DELETE', `/api/spaces/${id}/outputs/${oid}`),

  workstreams: (id) => request('GET', `/api/spaces/${id}/workstreams`),

  processes: (id) => request('GET', `/api/spaces/${id}/processes`),
  startProcess: (id, workstreamId) =>
    request('POST', `/api/spaces/${id}/processes`, { workstreamId }),
  process: (pid) => request('GET', `/api/processes/${pid}`),
  stopProcess: (pid) => request('POST', `/api/processes/${pid}/stop`, {}),
  setProcessVisibility: (pid, visibility) =>
    request('POST', `/api/processes/${pid}/visibility`, { visibility }),
  saveProcessOutput: (pid, title) =>
    request('POST', `/api/processes/${pid}/save-output`, { title }),

  toolShed: () => request('GET', '/api/toolshed'),
  saveToolShed: (config) => request('PUT', '/api/toolshed', config),
};

/**
 * Follow a process's output stream.
 * handlers: { onSnapshot(record), onChunk(text), onEnd(status, error) }
 * Returns a close() function.
 */
export function streamProcess(processId, handlers) {
  const source = new EventSource(`/api/processes/${processId}/stream`);
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
    // EventSource auto-reconnects; if the process ended the server closes us.
  };
  return () => source.close();
}
