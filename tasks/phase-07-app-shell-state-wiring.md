# Phase 7 — App Shell & State Wiring

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T034 — Zustand (or reducer) store wiring engine to React**
  - Doc references: §17 (state management)
  - Dependencies: T015, T018, T024, T030, T031, T032, T033
  - File path hints: `/src/ui/store/gameStore.ts`
  - Acceptance criteria: A store exposes current `GameState` plus dispatchable actions that call into `/src/engine` functions only (no game logic duplicated in the store — it's a thin adapter). Actions cover trade, travel, stay, deposit/withdraw, loan take/repay, default resolution, CA hiring, save/load. A smoke test (React Testing Library or plain unit test against the store's exported hook) dispatches a buy action and asserts cash decreases.
  - Mobile/desktop note: N/A — state/store wiring layer only, no visual rendering; must not assume desktop-only interaction patterns since every screen that consumes it is mobile-first (§1/§12).

- [x] **T035 — App shell: persistent scene container + popup layer (mobile-first)**
  - Doc references: §1 (360×740 mobile-portrait target), §12 (updated 2026-07-26 — persistent-scene UI model, supersedes the earlier flat screen-router)
  - Dependencies: T034
  - File path hints: `/src/ui/App.tsx`, `/src/ui/scene/` (new — canvas mount point), `/src/ui/components/PopupLayer.tsx` (new)
  - Acceptance criteria: A root component renders a fixed-aspect mobile-portrait container (360×740 baseline, responsive scaling for larger viewports) containing (a) a persistent scene mount point that stays mounted across the whole session once a game exists, and (b) a popup/panel layer that can show/hide Market/Bank/Newspaper/Travel/Year-end/Game-over content on top of the scene without unmounting it. The Title screen (§12 item 1) remains a true standalone screen shown before a scene exists. Stubs acceptable for the scene's contents (real hub scene lands in T037); this task only needs the container/layering structure to work.
  - Mobile/desktop note: Primary target is mobile-portrait browsers at 360×740 per §1/§12; desktop must render as a responsive fallback (e.g., centered/scaled mobile viewport) — never a desktop-first redesign.
  - Note: earlier code in this repo (`App.tsx`, `screens/*.tsx`) implements the pre-2026-07-26 flat screen-router model instead — expect to significantly rework or replace it, not extend it.
