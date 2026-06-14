import fs from 'node:fs';
import path from 'node:path';
import { GSTACK_UI_HOME } from './config.js';
import { HttpError } from './util.js';

/**
 * Global settings: how to invoke the Claude Code CLI that actually runs gstack
 * skills. Stored in <home>/settings.json.
 *
 *   claudeBin       path/name of the Claude Code binary (default "claude")
 *   model           optional model override passed as --model
 *   permissionMode  --permission-mode value; gstack skills do real work
 *                   (edit files, run commands), so headless runs need a mode
 *                   that doesn't block on prompts.
 *   commandPrefix   install prefix; gstack's `./setup --no-prefix` gives bare
 *                   "/review", the default install gives "/gstack-review".
 *   extraArgs       any additional CLI flags, appended verbatim.
 */

const SETTINGS_FILE = path.join(GSTACK_UI_HOME, 'settings.json');

export const PERMISSION_MODES = ['acceptEdits', 'default', 'plan', 'bypassPermissions'];

const DEFAULTS = {
  claudeBin: 'claude',
  model: '',
  permissionMode: 'acceptEdits',
  commandPrefix: '',
  extraArgs: '',
};

export function readSettings() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    stored = {};
  }
  return { ...DEFAULTS, ...stored };
}

export function writeSettings(patch) {
  const next = { ...readSettings(), ...(patch || {}) };

  next.claudeBin = String(next.claudeBin || '').trim() || DEFAULTS.claudeBin;
  next.model = String(next.model || '').trim();
  next.commandPrefix = String(next.commandPrefix || '').trim().replace(/^\/+/, '');
  next.extraArgs = String(next.extraArgs || '').trim();
  if (!PERMISSION_MODES.includes(next.permissionMode)) {
    throw new HttpError(400, `permissionMode must be one of: ${PERMISSION_MODES.join(', ')}`);
  }

  // keep only known keys
  const clean = {};
  for (const key of Object.keys(DEFAULTS)) clean[key] = next[key];

  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(clean, null, 2) + '\n');
  return clean;
}
