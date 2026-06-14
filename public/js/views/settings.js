import { api } from '../api.js';
import { escapeHtml } from '../md.js';
import { toast } from '../app.js';

/**
 * Settings: how gstack UI invokes the Claude Code CLI that runs the skills.
 */
export async function renderSettings(app) {
  app.innerHTML = '<p class="muted">Loading settings…</p>';
  const s = await api.settings();

  const modeOptions = s.permissionModes
    .map((m) => `<option value="${m}" ${m === s.permissionMode ? 'selected' : ''}>${m}</option>`)
    .join('');

  app.innerHTML = `
    <h1>Settings</h1>
    <p class="subtitle">gstack UI shells out to the Claude Code CLI to run each skill. Tell it how.</p>

    <div class="card" style="max-width:680px">
      <label>Claude Code binary</label>
      <input type="text" id="s-bin" value="${escapeHtml(s.claudeBin)}" placeholder="claude" spellcheck="false" />
      <p class="faint">Name or absolute path of the CLI. Default <code>claude</code> works if it's on your PATH.</p>

      <label>Model <span class="faint">(optional)</span></label>
      <input type="text" id="s-model" value="${escapeHtml(s.model)}" placeholder="leave blank for the CLI default" spellcheck="false" />
      <p class="faint">Passed as <code>--model</code>, e.g. <code>claude-opus-4-8</code> or <code>claude-sonnet-4-6</code>.</p>

      <label>Permission mode</label>
      <select id="s-mode">${modeOptions}</select>
      <p class="faint">gstack skills edit files and run commands. <code>acceptEdits</code> lets them work without prompting;
        <code>bypassPermissions</code> skips all guards (use only in trusted repos); <code>plan</code> dry-runs.</p>

      <label>Command prefix <span class="faint">(optional)</span></label>
      <input type="text" id="s-prefix" value="${escapeHtml(s.commandPrefix)}" placeholder="e.g. gstack-" spellcheck="false" />
      <p class="faint">If you installed gstack with the default prefix, set this to <code>gstack-</code> so skills run as
        <code>/gstack-review</code>. Leave blank if you used <code>./setup --no-prefix</code>.</p>

      <label>Extra CLI arguments <span class="faint">(optional)</span></label>
      <input type="text" id="s-extra" value="${escapeHtml(s.extraArgs)}" placeholder="--add-dir ../shared" spellcheck="false" />

      <div class="row" style="margin-top:18px;justify-content:flex-end">
        <button class="btn btn-primary" id="s-save">Save settings</button>
      </div>
    </div>

    <div class="card" style="max-width:680px;margin-top:18px">
      <h3 style="margin-top:0">Don't have gstack installed?</h3>
      <p class="faint">Install Garry Tan's gstack into Claude Code, then add a project and run skills here:</p>
      <pre class="md"><code>git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git \\
  ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup</code></pre>
    </div>`;

  app.querySelector('#s-save').addEventListener('click', async () => {
    try {
      await api.saveSettings({
        claudeBin: app.querySelector('#s-bin').value,
        model: app.querySelector('#s-model').value,
        permissionMode: app.querySelector('#s-mode').value,
        commandPrefix: app.querySelector('#s-prefix').value,
        extraArgs: app.querySelector('#s-extra').value,
      });
      toast('Settings saved.');
    } catch (err) {
      toast(err.message, true);
    }
  });
}
