# web/ conventions

- React + TypeScript (strict) + Vite. Lint with `npm run lint` (oxlint), typecheck with `tsc -b`.
- `public/data/` holds generated contract files only. Never hand-edit them, except
  `constraints.schema.json`, which is authored there and is the single schema source.
- `src/engine/engine.ts` (P1+) is pure: no DOM, no React, no globals. HUD numbers come from it.
- No runtime network calls except the optional Gemini routes and the mission room.
- Deploy: `npm run build && npx wrangler deploy` (config in `wrangler.jsonc`).
