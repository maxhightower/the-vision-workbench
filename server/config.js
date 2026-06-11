import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Workbench keeps all user data in a single, inspectable home folder:
 *
 *   <WORKBENCH_HOME>/
 *     tool_shed.json          global provider/tool configuration
 *     orchard/
 *       <idea-space-slug>/    one git repo per Idea Space
 *
 * Default home is ~/Workbench; override with the WORKBENCH_HOME env var.
 */
export const WORKBENCH_HOME =
  process.env.WORKBENCH_HOME || path.join(os.homedir(), 'Workbench');

export const ORCHARD_DIR = path.join(WORKBENCH_HOME, 'orchard');

export const PORT = Number(process.env.PORT || 4810);

export function ensureHome() {
  fs.mkdirSync(ORCHARD_DIR, { recursive: true });
}
