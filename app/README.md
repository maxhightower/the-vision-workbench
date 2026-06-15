# Workbench — frontend (v1)

The React + React Flow interface for the ideation workbench (see `../docs/VISION.md`).
Built beside the original vanilla SPA so the MVP keeps working while this grows.

## Run

```bash
# 1. start the existing Node API
node ../server/index.js        # serves on :4810

# 2. start the React dev server (proxies /api -> :4810)
npm install
npm run dev                    # http://localhost:5173
```

## What's here (v1)

- **Two regions:** the **map** (top, the woven web of kept nodes) and the **forge**
  (bottom, where you read, run workstreams, and work). Resizable split.
- **Keep-to-map:** select text in the forge and record it as a node via the toolbar
  button, the right-click menu, or by dragging it onto the map. The server-side mapper
  embeds it, places it by meaning, and proposes a label.
- **Posture toggle:** Solution vs Learning, fed into every workstream prompt.
- **Node inspector:** re-tag familiarity (known / somewhat / unfamiliar / unknown),
  rename, jump to provenance, delete.
- **Dark + light** themes; motion is reactive (on action), not ambient.

Stack: Vite + React + TS, `@xyflow/react` for the map, Framer Motion for transitions,
Zustand for UI state. The Node/file backend is unchanged.
