import fs from 'node:fs';
import path from 'node:path';
import { ORCHARD_DIR } from './config.js';
import {
  HttpError,
  nowIso,
  parseFrontmatter,
  slugify,
  uuid,
  withFrontmatter,
} from './util.js';

/**
 * Store: the file-structure layer for the Orchard and Idea Spaces.
 *
 * An Idea Space is a plain folder — portable, inspectable, human-readable:
 *
 *   <orchard>/<slug>/
 *     README.md
 *     .workbench/
 *       settings.json      { id, title, createdAt, lastOpenedAt, currentBranch }
 *       seed.md            the original raw idea, never overwritten
 *       branches.json      [{ name, createdAt, updatedAt, note }]
 *       processes.json     persisted process records (runtime state)
 *       workstreams/       optional custom workstream definitions (*.json)
 *     branches/
 *       <branch>/current_understanding.md
 *     outputs/             saved results, markdown with frontmatter
 *     notes/               free-form hand-entered notes
 *
 * "Branch" here is Workbench's own lightweight concept: an alternate
 * direction of the idea, each with its own Current Understanding.
 */

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function spaceDir(spaceId) {
  if (!SAFE_NAME_RE.test(spaceId)) throw new HttpError(400, `Invalid idea space id: ${spaceId}`);
  return path.join(ORCHARD_DIR, spaceId);
}

function wbDir(spaceId) {
  return path.join(spaceDir(spaceId), '.workbench');
}

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

function assertBranchName(name) {
  if (typeof name !== 'string' || !SAFE_NAME_RE.test(name) || name.length > 60) {
    throw new HttpError(400, `Invalid branch name: ${name}. Use lowercase letters, digits and dashes.`);
  }
}

// ---------------------------------------------------------------- settings

export function readSettings(spaceId) {
  const settings = readJson(path.join(wbDir(spaceId), 'settings.json'), null);
  if (!settings) throw new HttpError(404, `Idea space not found: ${spaceId}`);
  return settings;
}

export function writeSettings(spaceId, settings) {
  writeJson(path.join(wbDir(spaceId), 'settings.json'), settings);
}

export function touchSpace(spaceId) {
  const settings = readSettings(spaceId);
  settings.lastOpenedAt = nowIso();
  writeSettings(spaceId, settings);
  return settings;
}

// ---------------------------------------------------------------- orchard

export function listSpaces() {
  if (!fs.existsSync(ORCHARD_DIR)) return [];
  return fs
    .readdirSync(ORCHARD_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return getSpaceSummary(entry.name);
      } catch {
        return null; // skip folders that aren't idea spaces
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''));
}

export function getSpaceSummary(spaceId) {
  const settings = readSettings(spaceId);
  const understanding = readUnderstanding(spaceId);
  return {
    id: settings.id,
    title: settings.title,
    createdAt: settings.createdAt,
    lastOpenedAt: settings.lastOpenedAt,
    currentBranch: settings.currentBranch,
    understandingPreview: understanding.slice(0, 240),
    branchesCount: listBranches(spaceId).length,
    outputsCount: listOutputs(spaceId).length,
    runningProcesses: readProcesses(spaceId).filter((p) => p.status === 'running').length,
  };
}

export function plantSeed({ seedText, title }) {
  if (!seedText || !seedText.trim()) throw new HttpError(400, 'Seed text is required');
  seedText = seedText.trim();

  const derivedTitle = (title && title.trim()) || seedText.split('\n')[0].slice(0, 60);
  let slug = slugify(derivedTitle);
  let suffix = 1;
  while (fs.existsSync(path.join(ORCHARD_DIR, slug))) {
    slug = `${slugify(derivedTitle)}-${++suffix}`;
  }

  const dir = path.join(ORCHARD_DIR, slug);
  const createdAt = nowIso();
  const settings = {
    id: slug,
    uuid: uuid(),
    title: derivedTitle,
    createdAt,
    lastOpenedAt: createdAt,
    currentBranch: 'main',
  };

  fs.mkdirSync(path.join(dir, '.workbench', 'workstreams'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'branches', 'main'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });

  fs.writeFileSync(path.join(dir, '.workbench', 'seed.md'), seedText + '\n');
  writeJson(path.join(dir, '.workbench', 'settings.json'), settings);
  writeJson(path.join(dir, '.workbench', 'branches.json'), [
    { name: 'main', createdAt, updatedAt: createdAt, note: 'Original direction' },
  ]);
  writeJson(path.join(dir, '.workbench', 'processes.json'), []);

  // The seed starts as the current understanding until a workstream (or the
  // user) refines it.
  fs.writeFileSync(
    path.join(dir, 'branches', 'main', 'current_understanding.md'),
    seedText + '\n'
  );

  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${derivedTitle}\n\nA Workbench Idea Space. The original seed lives in ` +
      '`.workbench/seed.md`, the evolving understanding per branch in `branches/`, ' +
      'and saved results in `outputs/`.\n'
  );

  return settings;
}

// ---------------------------------------------------------------- seed + understanding

export function readSeed(spaceId) {
  try {
    return fs.readFileSync(path.join(wbDir(spaceId), 'seed.md'), 'utf8');
  } catch {
    return '';
  }
}

export function readUnderstanding(spaceId, branch) {
  branch = branch || readSettings(spaceId).currentBranch;
  assertBranchName(branch);
  try {
    return fs.readFileSync(
      path.join(spaceDir(spaceId), 'branches', branch, 'current_understanding.md'),
      'utf8'
    );
  } catch {
    return '';
  }
}

export function writeUnderstanding(spaceId, content, branch) {
  const settings = readSettings(spaceId);
  branch = branch || settings.currentBranch;
  assertBranchName(branch);
  const file = path.join(spaceDir(spaceId), 'branches', branch, 'current_understanding.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\s+$/, '') + '\n');
  updateBranchMeta(spaceId, branch, { updatedAt: nowIso() });
}

// ---------------------------------------------------------------- branches

export function listBranches(spaceId) {
  return readJson(path.join(wbDir(spaceId), 'branches.json'), []);
}

function writeBranches(spaceId, branches) {
  writeJson(path.join(wbDir(spaceId), 'branches.json'), branches);
}

function updateBranchMeta(spaceId, name, patch) {
  const branches = listBranches(spaceId);
  const branch = branches.find((b) => b.name === name);
  if (branch) {
    Object.assign(branch, patch);
    writeBranches(spaceId, branches);
  }
}

export function createBranch(spaceId, { name, note, startingUnderstanding, checkout = true }) {
  assertBranchName(name);
  const branches = listBranches(spaceId);
  if (branches.some((b) => b.name === name)) {
    throw new HttpError(409, `Branch already exists: ${name}`);
  }

  const settings = readSettings(spaceId);
  // New branches inherit the current understanding; a starting direction
  // (e.g. from Generate Branches) is layered on top of it.
  const base = readUnderstanding(spaceId, settings.currentBranch).trim();
  const content =
    startingUnderstanding && startingUnderstanding.trim()
      ? `${startingUnderstanding.trim()}\n\n---\n\n${base}\n`
      : base + '\n';

  const dir = path.join(spaceDir(spaceId), 'branches', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'current_understanding.md'), content);

  const now = nowIso();
  branches.push({ name, createdAt: now, updatedAt: now, note: note || '' });
  writeBranches(spaceId, branches);

  if (checkout) {
    settings.currentBranch = name;
    writeSettings(spaceId, settings);
  }
  return { name, createdAt: now };
}

export function switchBranch(spaceId, name) {
  assertBranchName(name);
  if (!listBranches(spaceId).some((b) => b.name === name)) {
    throw new HttpError(404, `Branch not found: ${name}`);
  }
  const settings = readSettings(spaceId);
  settings.currentBranch = name;
  writeSettings(spaceId, settings);
  return settings;
}

export function renameBranch(spaceId, oldName, newName) {
  assertBranchName(oldName);
  assertBranchName(newName);
  const branches = listBranches(spaceId);
  const branch = branches.find((b) => b.name === oldName);
  if (!branch) throw new HttpError(404, `Branch not found: ${oldName}`);
  if (branches.some((b) => b.name === newName)) {
    throw new HttpError(409, `Branch already exists: ${newName}`);
  }

  fs.renameSync(
    path.join(spaceDir(spaceId), 'branches', oldName),
    path.join(spaceDir(spaceId), 'branches', newName)
  );
  branch.name = newName;
  branch.updatedAt = nowIso();
  writeBranches(spaceId, branches);

  const settings = readSettings(spaceId);
  if (settings.currentBranch === oldName) {
    settings.currentBranch = newName;
    writeSettings(spaceId, settings);
  }
}

/** Side-by-side comparison data: every branch with its understanding. */
export function compareBranches(spaceId) {
  return listBranches(spaceId).map((branch) => ({
    ...branch,
    understanding: readUnderstanding(spaceId, branch.name),
  }));
}

// ---------------------------------------------------------------- outputs

const OUTPUT_FILE_RE = /\.md$/;

export function listOutputs(spaceId) {
  const dir = path.join(spaceDir(spaceId), 'outputs');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => OUTPUT_FILE_RE.test(f))
    .map((file) => {
      const { meta, content } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      return {
        id: file.replace(OUTPUT_FILE_RE, ''),
        title: meta.title || file,
        type: meta.type || 'note',
        workstream: meta.workstream || null,
        branch: meta.branch || null,
        createdAt: meta.createdAt || null,
        updatedAt: meta.updatedAt || meta.createdAt || null,
        preview: content.slice(0, 200),
      };
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function readOutput(spaceId, outputId) {
  const file = outputFile(spaceId, outputId);
  if (!fs.existsSync(file)) throw new HttpError(404, `Output not found: ${outputId}`);
  const { meta, content } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  return { id: outputId, ...meta, content };
}

function outputFile(spaceId, outputId) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(outputId)) {
    throw new HttpError(400, `Invalid output id: ${outputId}`);
  }
  return path.join(spaceDir(spaceId), 'outputs', `${outputId}.md`);
}

export function saveOutput(spaceId, { title, type, workstream, content }) {
  if (!content || !content.trim()) throw new HttpError(400, 'Output content is required');
  title = (title && title.trim()) || 'Untitled output';

  const settings = readSettings(spaceId);
  const stamp = nowIso().replace(/[:.]/g, '-').slice(0, 19).toLowerCase();
  let id = `${slugify(title, 'output')}-${stamp}`;
  let suffix = 1;
  while (fs.existsSync(outputFile(spaceId, id))) id = `${id}-${++suffix}`;

  const meta = {
    title,
    type: type || 'note',
    workstream: workstream || undefined,
    branch: settings.currentBranch,
    createdAt: nowIso(),
  };
  fs.writeFileSync(outputFile(spaceId, id), withFrontmatter(meta, content.trim() + '\n'));
  return { id, ...meta };
}

export function updateOutput(spaceId, outputId, { title, content }) {
  const existing = readOutput(spaceId, outputId);
  const { id, content: oldContent, ...meta } = existing;
  if (title !== undefined) meta.title = title;
  meta.updatedAt = nowIso();
  const newContent = content !== undefined ? content : oldContent;
  fs.writeFileSync(
    outputFile(spaceId, outputId),
    withFrontmatter(meta, newContent.replace(/\s+$/, '') + '\n')
  );
  return readOutput(spaceId, outputId);
}

export function deleteOutput(spaceId, outputId) {
  const file = outputFile(spaceId, outputId);
  if (!fs.existsSync(file)) throw new HttpError(404, `Output not found: ${outputId}`);
  fs.unlinkSync(file);
}

// ---------------------------------------------------------------- processes (persistence)

export function readProcesses(spaceId) {
  return readJson(path.join(wbDir(spaceId), 'processes.json'), []);
}

export function writeProcesses(spaceId, processes) {
  writeJson(path.join(wbDir(spaceId), 'processes.json'), processes);
}

// ---------------------------------------------------------------- custom workstreams

export function readCustomWorkstreams(spaceId) {
  const dir = path.join(wbDir(spaceId), 'workstreams');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((ws) => ws && ws.id && ws.name && ws.promptTemplate);
}
