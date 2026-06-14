# gstack UI data model

gstack UI is local-first and keeps its own state — separate from the projects it
drives — under `GSTACK_UI_HOME` (default `~/.gstack-ui`). It never writes into a
project folder; only the gstack skills you run do, inside their own repo.

```
~/.gstack-ui/
  settings.json            global CLI settings
  projects.json            registered project directories
  runs/<projectId>.json    per-project run history (transcripts)
```

## Entities

### Skill (bundled catalog)
A gstack slash-command, described in `server/catalog.json`. The `id` is the
command name without the leading slash or any install prefix:
```json
{ "id": "review", "name": "Review", "phase": "review",
  "interactive": false, "hint": "optional args placeholder",
  "desc": "Staff-engineer code review; auto-fixes obvious issues." }
```
Skills are grouped into `phases` (Think → Plan → Design → Review → Test → Ship →
Document → Reflect → Utilities) and surfaced by `GET /api/catalog`. The catalog
is bundled and offline; edit the JSON and restart to change it.

### Project
A pointer to a real working directory where skills run. Stored in
`projects.json`:
```json
{
  "id": "my-app",
  "name": "My App",
  "path": "/Users/you/code/my-app",
  "createdAt": "2026-06-14T18:00:00.000Z",
  "lastUsedAt": "2026-06-14T19:00:00.000Z"
}
```
The `id` is a slug of the name and is the stable URL key. A path must already
exist on disk to be added.

### Run
One invocation of a skill via the Claude Code CLI. Records persist in
`runs/<projectId>.json` (newest first, capped at 50); live output is buffered in
server memory and streamed to the UI over SSE.
```json
{
  "id": "uuid",
  "projectId": "my-app",
  "skillId": "review",
  "skillName": "Review",
  "phase": "review",
  "promptText": "/review the auth module",
  "args": "the auth module",
  "command": "claude -p \"/review the auth module\" --output-format stream-json --verbose --permission-mode acceptEdits",
  "cwd": "/Users/you/code/my-app",
  "model": null,
  "permissionMode": "acceptEdits",
  "status": "running | completed | failed | stopped",
  "startedAt": "…", "endedAt": "…",
  "output": "…accumulated text parsed from the stream…",
  "error": null,
  "exitCode": 0
}
```

**How a run executes.** The server spawns the configured `claudeBin` with:
```
-p "<promptText>" --output-format stream-json --verbose
   [--permission-mode <mode>] [--model <model>] [<extraArgs…>]
```
in the project's `cwd`. Each stdout line is a stream-json event; the server turns
`assistant` text blocks into output, summarizes `tool_use` blocks as
`` `→ Tool …` `` lines, and reads the final `result` for errors. Runs left
`running` by a dead server are marked `stopped` on boot.

### Settings
Global, at `settings.json`:
```json
{
  "claudeBin": "claude",
  "model": "",
  "permissionMode": "acceptEdits",
  "commandPrefix": "",
  "extraArgs": ""
}
```
`permissionMode` is one of `acceptEdits`, `default`, `plan`, `bypassPermissions`.
`commandPrefix` is prepended inside the slash command (`gstack-` → `/gstack-review`).

## Safety boundaries

- Project and run ids are validated against `[a-z0-9-]` patterns; run files
  resolve only inside `RUNS_DIR`.
- A project path must be an existing directory; gstack UI itself writes nothing
  outside `GSTACK_UI_HOME`.
- All real side effects happen inside the Claude Code CLI you configure, in the
  project folder you point it at — choose `permissionMode` accordingly
  (`bypassPermissions` removes the CLI's own guards).
