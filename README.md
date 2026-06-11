# Workbench 🌱

A **local-first Idea Developer**. Plant a Seed, let Workbench help you refine it,
branch it into alternate directions, run agentic workstreams over it, and save
what you learn — all in plain files on your machine.

This is the MVP: the Idea Developer loop only.

```
Seed → Current Understanding → Workstreams → Process → Output → Branch → Refine
```

## Run it

```bash
node server/index.js     # or: npm start
```

Open http://localhost:4810. No dependencies, no build step — just Node ≥ 18.

Your data lives in `~/Workbench` (override with `WORKBENCH_HOME`). It works
fully offline out of the box; configure a model provider in the **Tool Shed**
to get real generation.

## The metaphor

| Term | Meaning |
| --- | --- |
| **Seed** | An early concept, not fully fleshed out — the raw idea text you start with. |
| **Orchard** | The home screen: every Idea Space you've planted. |
| **Idea Space** | A repo-like container for one idea. If Workbench is GitHub, an Idea Space is a repo. |
| **Current Understanding** | Workbench's evolving interpretation of the Seed. Always editable — the system can misunderstand you. |
| **Branch** | An alternate version/direction of the idea, each with its own Current Understanding. |
| **Workstream** | An agentic workflow you send the idea through (Cultivate Seed, Prune Scope, …). |
| **Process** | A running instance of a workstream. Foreground = visible; background = hidden but still running (see the Processes tab). |
| **Output** | A saved result — generated or hand-entered. Temporary process results become Outputs only when you save them. |
| **Tool Shed** | Where model providers and tools are configured. |

## Workstreams (V1)

- **Cultivate Seed** — clearer understanding, key themes, missing details. Can apply its revision straight to the Current Understanding.
- **Generate Branches** — 3–5 divergent directions; create a real branch from any of them in one click.
- **Prune Scope** — MVP scope / later features / non-goals.
- **Test the Pitch** — one-liners, positioning options, clarity critique.
- **Find Weak Roots** — assumptions, contradictions, missing info, risky unknowns.
- **Market Scan** — adjacent tools, competitors, positioning risks (enabled when a search tool is configured in the Tool Shed).

Custom workstreams: drop a JSON file into an Idea Space's
`.workbench/workstreams/` — see `docs/DATA_MODEL.md`.

## Providers (Tool Shed)

- **OpenAI-compatible** — any `/chat/completions` endpoint (OpenAI, vLLM, LM Studio, …)
- **Anthropic** — the Messages API
- **Ollama** — local models
- **Offline** — no provider; workstreams emit structured fill-in templates so the loop still works

All providers stream. API keys never leave the server or appear in the browser.

## On disk

Everything is plain, portable, human-readable files:

```
~/Workbench/
  tool_shed.json                    provider/tool config (global)
  orchard/
    my-idea/                        one folder per Idea Space
      README.md
      .workbench/
        seed.md                     the original raw idea (never overwritten)
        settings.json               id, title, timestamps, current branch
        branches.json               branch metadata
        processes.json              process history
        workstreams/                custom workstream definitions (*.json)
      branches/
        main/current_understanding.md
        bold-pivot/current_understanding.md
      outputs/                      saved results: markdown + frontmatter
      notes/                        free-form notes
```

See `docs/DATA_MODEL.md` for the full data model and `docs/API.md` for the HTTP API.

## Boundaries (deliberate non-goals for this MVP)

No CAD/PCB/hardware benches, no shopping, no VR/AR, no code-generation benches,
no branch merging, no accounts, no cloud. Processes can only call configured
model APIs and only write inside their own Idea Space.
