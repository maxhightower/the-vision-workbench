import fs from 'node:fs';
import path from 'node:path';
import { GSTACK_UI_HOME, RUNS_DIR } from './config.js';
import { HttpError, nowIso, slugify, uuid } from './util.js';

/**
 * Store: the registry of Projects and the history of Runs.
 *
 * A Project is just a pointer to a real working directory on disk — gstack
 * skills run there via the Claude Code CLI. We never write into the project
 * itself; all UI state lives under GSTACK_UI_HOME:
 *
 *   projects.json            [{ id, name, path, createdAt, lastUsedAt }]
 *   runs/<projectId>.json    [ run records, newest first ]
 */

const PROJECTS_FILE = path.join(GSTACK_UI_HOME, 'projects.json');
const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_RUNS = 50;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------- projects

export function listProjects() {
  return readJson(PROJECTS_FILE, []).sort((a, b) =>
    (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '')
  );
}

export function getProject(projectId) {
  if (!SAFE_ID_RE.test(projectId)) throw new HttpError(400, `Invalid project id: ${projectId}`);
  const project = listProjects().find((p) => p.id === projectId);
  if (!project) throw new HttpError(404, `Project not found: ${projectId}`);
  return project;
}

export function addProject({ name, path: rawPath }) {
  if (!rawPath || !String(rawPath).trim()) throw new HttpError(400, 'A project path is required');
  const dir = path.resolve(rawPath.trim().replace(/^~(?=\/|$)/, process.env.HOME || ''));

  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    throw new HttpError(400, `Path does not exist: ${dir}`);
  }
  if (!stat.isDirectory()) throw new HttpError(400, `Not a directory: ${dir}`);

  const projects = readJson(PROJECTS_FILE, []);
  if (projects.some((p) => p.path === dir)) {
    throw new HttpError(409, `That directory is already a project: ${dir}`);
  }

  const title = (name && name.trim()) || path.basename(dir);
  let id = slugify(title, 'project');
  while (projects.some((p) => p.id === id)) id = `${slugify(title, 'project')}-${uuid().slice(0, 4)}`;

  const now = nowIso();
  const project = { id, name: title, path: dir, createdAt: now, lastUsedAt: now };
  projects.push(project);
  writeJson(PROJECTS_FILE, projects);
  return project;
}

export function touchProject(projectId) {
  const projects = readJson(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new HttpError(404, `Project not found: ${projectId}`);
  project.lastUsedAt = nowIso();
  writeJson(PROJECTS_FILE, projects);
  return project;
}

export function removeProject(projectId) {
  const projects = readJson(PROJECTS_FILE, []);
  const next = projects.filter((p) => p.id !== projectId);
  if (next.length === projects.length) throw new HttpError(404, `Project not found: ${projectId}`);
  writeJson(PROJECTS_FILE, next);
  // Drop its run history too.
  try {
    fs.rmSync(runsFile(projectId), { force: true });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- runs

function runsFile(projectId) {
  if (!SAFE_ID_RE.test(projectId)) throw new HttpError(400, `Invalid project id: ${projectId}`);
  return path.join(RUNS_DIR, `${projectId}.json`);
}

export function readRuns(projectId) {
  return readJson(runsFile(projectId), []);
}

export function writeRuns(projectId, runs) {
  writeJson(runsFile(projectId), runs.slice(0, MAX_RUNS));
}

/** Every project's run file (used to find a run by id after a restart). */
export function allRunFiles() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}
