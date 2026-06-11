import {
  readProcesses,
  writeProcesses,
  readSeed,
  readUnderstanding,
  readSettings,
  saveOutput,
  listSpaces,
} from './store.js';
import { streamCompletion } from './providers.js';
import { SYSTEM_PROMPT } from './workstreams.js';
import { HttpError, nowIso, uuid } from './util.js';

/**
 * Process manager. A Process is a running instance of a Workstream.
 *
 * - Records are persisted per-space in .workbench/processes.json.
 * - Live output is buffered in memory and broadcast to SSE subscribers, so a
 *   process keeps running while hidden ("background") and can be reopened
 *   with its full output replayed.
 * - foreground/background is purely a visibility flag for the UI.
 * - Results are temporary until the user saves them as an Output.
 */

// id -> { record, listeners:Set<res>, abort:AbortController }
const live = new Map();

function persist(record) {
  const all = readProcesses(record.spaceId).filter((p) => p.id !== record.id);
  all.unshift(record);
  writeProcesses(record.spaceId, all.slice(0, 100)); // keep history bounded
}

function broadcast(id, event) {
  const entry = live.get(id);
  if (!entry) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of entry.listeners) {
    res.write(payload);
    if (event.type === 'end') res.end();
  }
  if (event.type === 'end') entry.listeners.clear();
}

export function startProcess(spaceId, workstream, toolShed) {
  const settings = readSettings(spaceId);
  const ctx = {
    seed: readSeed(spaceId),
    understanding: readUnderstanding(spaceId),
    branch: settings.currentBranch,
  };

  const record = {
    id: uuid(),
    spaceId,
    workstreamId: workstream.id,
    workstreamName: workstream.name,
    outputType: workstream.outputType,
    outputTitle: workstream.outputTitle,
    branch: settings.currentBranch,
    provider: toolShed.activeProvider,
    status: 'running',
    visibility: 'foreground',
    startedAt: nowIso(),
    endedAt: null,
    output: '',
    error: null,
    savedOutputId: null,
  };

  const abort = new AbortController();
  live.set(record.id, { record, listeners: new Set(), abort });
  persist(record);
  run(record, workstream, ctx, toolShed, abort).catch(() => {});
  return record;
}

async function run(record, workstream, ctx, toolShed, abort) {
  try {
    const stream = streamCompletion(
      toolShed,
      {
        system: SYSTEM_PROMPT,
        prompt: workstream.prompt(ctx),
        offlineTemplate: workstream.offlineTemplate,
        workstreamName: workstream.name,
      },
      abort.signal
    );
    for await (const chunk of stream) {
      if (abort.signal.aborted) break;
      record.output += chunk;
      broadcast(record.id, { type: 'chunk', text: chunk });
    }
    record.status = abort.signal.aborted ? 'stopped' : 'completed';
  } catch (err) {
    if (abort.signal.aborted) {
      record.status = 'stopped';
    } else {
      record.status = 'failed';
      record.error = err.message;
    }
  }
  record.endedAt = nowIso();
  persist(record);
  broadcast(record.id, { type: 'end', status: record.status, error: record.error });
}

export function getProcess(processId) {
  const entry = live.get(processId);
  if (entry) return entry.record;
  // Fall back to persisted records (e.g. after a server restart).
  for (const space of listSpaces()) {
    const found = readProcesses(space.id).find((p) => p.id === processId);
    if (found) return found;
  }
  throw new HttpError(404, `Process not found: ${processId}`);
}

export function listSpaceProcesses(spaceId) {
  const persisted = readProcesses(spaceId);
  // Live records are the source of truth for anything currently running.
  return persisted.map((p) => live.get(p.id)?.record || p);
}

export function stopProcess(processId) {
  const entry = live.get(processId);
  if (!entry) {
    const record = getProcess(processId);
    if (record.status === 'running') {
      // Was running when the server died; mark it stopped.
      record.status = 'stopped';
      record.endedAt = nowIso();
      persist(record);
    }
    return record;
  }
  entry.abort.abort();
  return entry.record;
}

export function setVisibility(processId, visibility) {
  if (!['foreground', 'background'].includes(visibility)) {
    throw new HttpError(400, 'visibility must be "foreground" or "background"');
  }
  const record = getProcess(processId);
  record.visibility = visibility;
  persist(record);
  return record;
}

export function saveProcessAsOutput(processId, { title } = {}) {
  const record = getProcess(processId);
  if (record.status === 'running') {
    throw new HttpError(409, 'Process is still running; stop it or wait for completion.');
  }
  if (!record.output.trim()) throw new HttpError(409, 'Process produced no output to save.');
  const output = saveOutput(record.spaceId, {
    title: title || `${record.outputTitle} (${record.branch})`,
    type: record.outputType,
    workstream: record.workstreamId,
    content: record.output,
  });
  record.savedOutputId = output.id;
  persist(record);
  return { process: record, output };
}

/** Subscribe an HTTP response to a process's output stream (SSE). */
export function subscribe(processId, res) {
  const record = getProcess(processId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  // Replay whatever has been produced so far, then follow live.
  res.write(`data: ${JSON.stringify({ type: 'snapshot', record })}\n\n`);
  if (record.status !== 'running') {
    res.write(
      `data: ${JSON.stringify({ type: 'end', status: record.status, error: record.error })}\n\n`
    );
    res.end();
    return;
  }
  const entry = live.get(processId);
  entry.listeners.add(res);
  res.on('close', () => entry.listeners.delete(res));
}

/** On boot, mark anything left "running" by a previous server as stopped. */
export function reconcileOnBoot() {
  for (const space of listSpaces()) {
    const processes = readProcesses(space.id);
    let changed = false;
    for (const p of processes) {
      if (p.status === 'running') {
        p.status = 'stopped';
        p.error = 'Interrupted by server restart';
        p.endedAt = p.endedAt || nowIso();
        changed = true;
      }
    }
    if (changed) writeProcesses(space.id, processes);
  }
}
