# gstack UI ⚡

A local web UI for **[gstack](https://github.com/garrytan/gstack)** — Garry Tan's
opinionated Claude Code setup. Browse the gstack skills as a sprint pipeline,
point them at any project folder, and **run them from the browser** while the
output streams back live.

```
Think → Plan → Design → Review → Test → Ship → Document → Reflect
```

## What it does

gstack skills are Claude Code slash commands (`/office-hours`, `/review`, `/qa`,
`/ship`, …). gstack UI shells out to the **Claude Code CLI** to run them inside a
project's working directory and streams the result into the page. It's a control
deck on top of your existing gstack install — it doesn't reimplement any skill.

## Run it

```bash
node server/index.js     # or: npm start
```

Open http://localhost:4810. No dependencies, no build step — just Node ≥ 18.

You'll need the **Claude Code CLI** on your PATH (or set its path in Settings)
and **gstack installed** into Claude Code:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git \
  ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

## How to use it

1. **Add a project** — point gstack UI at a code folder on your machine.
2. **Pick a skill** from the pipeline. Optionally pass arguments.
3. **Run** — gstack UI invokes the Claude Code CLI in that folder:

   ```
   claude -p "/review the auth module" --output-format stream-json --verbose \
     --permission-mode acceptEdits
   ```

   Output streams into the run panel; the full history is kept per project.

## Settings (how skills are launched)

| Setting | Meaning |
| --- | --- |
| **Claude Code binary** | Name or path of the CLI. Default `claude`. |
| **Model** | Optional `--model` override (e.g. `claude-opus-4-8`). |
| **Permission mode** | `acceptEdits` (skills work without prompting), `bypassPermissions` (skips all guards — trusted repos only), `plan` (dry run), or `default`. |
| **Command prefix** | If you installed gstack with its default prefix, set `gstack-` so skills run as `/gstack-review`. Blank for `./setup --no-prefix`. |
| **Extra CLI arguments** | Appended verbatim, e.g. `--add-dir ../shared`. |

## A note on interactive skills

Some skills (e.g. `/office-hours`, `/design-consultation`) are conversational.
Headless runs are one-shot, so they're marked with `◐` — pass any answers they'd
ask for as arguments. Autonomous skills (`/review`, `/qa`, `/ship`, …) work great
unattended.

## On disk

gstack UI keeps its own state in one inspectable folder and **never writes into
your projects** (only the skills you run do, in their own repo):

```
~/.gstack-ui/                 (override with GSTACK_UI_HOME)
  settings.json               claude binary, model, permission mode, prefix
  projects.json               registered project directories
  runs/<projectId>.json       per-project run history (transcripts)
```

The skill catalog is bundled at `server/catalog.json` — edit it to add, remove,
or re-group skills; the server reloads it on restart.

See `docs/DATA_MODEL.md` for the data model and `docs/API.md` for the HTTP API.

## Boundaries

gstack UI only launches the configured Claude Code binary against folders you
register. It doesn't manage the gstack install itself, doesn't merge or deploy on
its own, and has no accounts or cloud — it's a local companion to your CLI.
