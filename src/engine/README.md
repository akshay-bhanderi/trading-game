# /src/engine

Pure TypeScript. **Zero React imports.** This is the game engine: cities, prices,
events, bank, tax, rank, RNG. It must run headless in Node (no DOM) so the
§11 bot harness can simulate thousands of seeded games in CI/scripts.

`/src/ui` renders engine state and dispatches actions into it — the engine
never imports from `/src/ui`. This boundary is enforced by an ESLint
`no-restricted-imports` rule (see repo root `eslint.config.js`) that blocks
`react`/`react-dom` imports anywhere under this directory.

Rule: never use `Math.random` in this directory — always use the seeded RNG
from `rng.ts` so runs are reproducible (see §6 of the design doc).
