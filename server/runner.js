import { spawn } from 'node:child_process';
import {
  readRuns,
  writeRuns,
  getProject,
  touchProject,
  allRunFiles,
} from './store.js';
import { getSkill } from './catalog.js';
import { readSettings } from './settings.js';
import { HttpError, nowIso, uuid } from './util.js';

/**
 * Run manager. A Run is one invocation of a gstack skill via the Claude Code
 * CLI inside a project's working directory.
 *
 * We launch `claude -p "/<skill>" --output-format stream-json --verbose ...`,
 * parse the JSON-line stream into readable text, and broadcast it to SSE
 * subscribers. Runs keep going if the browser navigates away; reopening one
 * replays everything produced so far, then follows live.
 */

// id -> { record, listeners:Set<res>, child }
const live = new Map();

function persist(record) {
  const all = readRuns(record.projectId).filter((r) => r.id !== record.id);
  all.unshift(record);
  writeRuns(record.projectId, all);
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

/** Build the slash-command prompt and the full CLI argv for a run. */
export function buildInvocation(skill, settings, args) {
  const prefix = settings.commandPrefix ? settings.commandPrefix.replace(/\/+$/, '') : '';
  const slash = `/${prefix}${skill.id}`;
  const promptText = args && args.trim() ? `${slash} ${args.trim()}` : slash;

  const argv = ['-p', promptText, '--output-format', 'stream-json', '--verbose'];
  if (settings.permissionMode) argv.push('--permission-mode', settings.permissionMode);
  if (settings.model) argv.push('--model', settings.model);
  if (settings.extraArgs) argv.push(...settings.extraArgs.split(/\s+/).filter(Boolean));

  const command = `${settings.claudeBin} ${argv
    .map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))
    .join(' ')}`;
  return { promptText, argv, command };
}

export function startRun(projectId, skillId, args) {
  const project = getProject(projectId);
  const skill = getSkill(skillId);
  const settings = readSettings();
  const { promptText, argv, command } = buildInvocation(skill, settings, args);

  const record = {
    id: uuid(),
    projectId,
    skillId: skill.id,
    skillName: skill.name,
    phase: skill.phase,
    promptText,
    args: (args || '').trim(),
    command,
    cwd: project.path,
    model: settings.model || null,
    permissionMode: settings.permissionMode,
    status: 'running',
    startedAt: nowIso(),
    endedAt: null,
    output: '',
    error: null,
    exitCode: null,
  };

  let child;
  try {
    child = spawn(settings.claudeBin, argv, {
      cwd: project.path,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    record.status = 'failed';
    record.error = `Could not launch "${settings.claudeBin}": ${err.message}`;
    record.endedAt = nowIso();
    persist(record);
    return record;
  }

  live.set(record.id, { record, listeners: new Set(), child });
  persist(record);
  touchProject(projectId);
  drive(record, child);
  return record;
}

function append(record, text) {
  if (!text) return;
  record.output += text;
  broadcast(record.id, { type: 'chunk', text });
}

/** Wire a spawned child's streams into the run record + SSE broadcast. */
function drive(record, child) {
  let stdoutBuf = '';
  let stderrBuf = '';
  let launchError = null;

  child.on('error', (err) => {
    launchError = err.message;
  });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (data) => {
    stdoutBuf += data;
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line) handleStreamLine(record, line);
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data) => {
    stderrBuf += data;
  });

  child.on('close', (code, signal) => {
    if (stdoutBuf.trim()) handleStreamLine(record, stdoutBuf.trim());
    record.exitCode = code;

    const entry = live.get(record.id);
    const stopped = entry?.stopped || signal === 'SIGTERM';
    if (stopped) {
      record.status = 'stopped';
    } else if (launchError) {
      record.status = 'failed';
      record.error = `Could not launch "${record.command.split(' ')[0]}": ${launchError}. Set the Claude Code binary path in Settings.`;
    } else if (code === 0) {
      record.status = 'completed';
    } else {
      record.status = 'failed';
      record.error = stderrBuf.trim() || `Claude Code exited with code ${code}.`;
    }
    record.endedAt = nowIso();
    persist(record);
    broadcast(record.id, { type: 'end', status: record.status, error: record.error });
    live.delete(record.id);
  });
}

/** Parse one stream-json line into human-readable text appended to the run. */
function handleStreamLine(record, line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    // Not JSON (e.g. a stray log line) — surface it verbatim.
    append(record, line + '\n');
    return;
  }

  if (msg.type === 'assistant' && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === 'text' && block.text) {
        append(record, block.text);
      } else if (block.type === 'tool_use') {
        append(record, `\n\n\`→ ${block.name}${toolHint(block.input)}\`\n\n`);
      }
    }
  } else if (msg.type === 'result') {
    if (msg.is_error) {
      record.error = msg.error || msg.result || 'Run reported an error.';
    } else if (!record.output.trim() && msg.result) {
      append(record, msg.result);
    }
  }
}

function toolHint(input) {
  if (!input || typeof input !== 'object') return '';
  const key = input.command || input.file_path || input.path || input.pattern || input.url;
  if (!key) return '';
  const s = String(key).replace(/\s+/g, ' ');
  return ` ${s.length > 60 ? s.slice(0, 60) + '…' : s}`;
}

export function getRun(runId) {
  const entry = live.get(runId);
  if (entry) return entry.record;
  for (const projectId of allRunFiles()) {
    const found = readRuns(projectId).find((r) => r.id === runId);
    if (found) return found;
  }
  throw new HttpError(404, `Run not found: ${runId}`);
}

export function listProjectRuns(projectId) {
  return readRuns(projectId).map((r) => live.get(r.id)?.record || r);
}

export function stopRun(runId) {
  const entry = live.get(runId);
  if (!entry) {
    const record = getRun(runId);
    if (record.status === 'running') {
      record.status = 'stopped';
      record.endedAt = nowIso();
      persist(record);
    }
    return record;
  }
  entry.stopped = true;
  entry.child.kill('SIGTERM');
  return entry.record;
}

/** Subscribe an HTTP response to a run's output stream (SSE). */
export function subscribe(runId, res) {
  const record = getRun(runId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'snapshot', record })}\n\n`);
  if (record.status !== 'running') {
    res.write(`data: ${JSON.stringify({ type: 'end', status: record.status, error: record.error })}\n\n`);
    res.end();
    return;
  }
  const entry = live.get(runId);
  entry.listeners.add(res);
  res.on('close', () => entry.listeners.delete(res));
}

/** On boot, mark anything left "running" by a previous server as stopped. */
export function reconcileOnBoot() {
  for (const projectId of allRunFiles()) {
    const runs = readRuns(projectId);
    let changed = false;
    for (const r of runs) {
      if (r.status === 'running') {
        r.status = 'stopped';
        r.error = 'Interrupted by server restart';
        r.endedAt = r.endedAt || nowIso();
        changed = true;
      }
    }
    if (changed) writeRuns(projectId, runs);
  }
}
