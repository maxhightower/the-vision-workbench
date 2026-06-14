import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * gstack UI keeps its own state in a single, inspectable home folder — it never
 * writes into the projects it drives. Your code repos stay clean; only the UI's
 * project registry, settings and run history live here:
 *
 *   <GSTACK_UI_HOME>/
 *     settings.json        claude binary, model, permission mode, prefix
 *     projects.json        registered project directories
 *     runs/<projectId>.json  per-project run history (transcripts)
 *
 * Default home is ~/.gstack-ui; override with the GSTACK_UI_HOME env var.
 */
export const GSTACK_UI_HOME =
  process.env.GSTACK_UI_HOME || path.join(os.homedir(), '.gstack-ui');

export const RUNS_DIR = path.join(GSTACK_UI_HOME, 'runs');

export const PORT = Number(process.env.PORT || 4810);

export function ensureHome() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}
