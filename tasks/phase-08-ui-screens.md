# Phase 8 — UI Screens (1–8)

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T036 — Screen 1: Title / difficulty select / continue**
  - Doc references: §12 (screen 1), §3
  - Dependencies: T035, T032
  - File path hints: `/src/ui/screens/TitleScreen.tsx`
  - Acceptance criteria: Renders difficulty selector (Noob/Pro/Expert) with §3's starting values previewed, a "New Game" action that seeds a fresh `GameState`, and a "Continue" action enabled only when a saved game exists (via T032). Placeholder art (colored rectangles/emoji) per §12's stated art-pass deferral.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; buttons sized for touch (minimum ~44px tap targets); desktop is a secondary responsive fallback only.

- [x] **T037 — Screen 2: Persistent hub scene (replaces the old flat "City screen")**
  - Doc references: §12 (screen 2, rewritten 2026-07-26)
  - Dependencies: T035, T015, T005, T069
  - File path hints: `/src/ui/scene/HubScene.tsx` (new), `/src/ui/components/Hud.tsx` (new)
  - Acceptance criteria: Renders a full-screen pixelated background for the current city (placeholder background acceptable — real per-city art is a later pass per §12) with the character sprite from T069 standing/idling in the single starting room (room-growth mechanic is explicitly OUT of this task — §12 flags the room-growth-vs-Warehouse reconciliation as an open design question not yet decided; ship one static room only). HUD overlay on top of the scene, not a separate screen: top-left city name, top-right cash balance + owned commodities, bottom-left bank icon opening the Bank popup (via T035's popup layer), bottom-right market icon opening the Market popup as a list. Newspaper/Travel/Stay/Informant entry points also live in this HUD (exact icon/menu placement left to implementation). Note in code: this file will be modified again by T039 (Informant hookup) and T058 (Hotel screen's "buy hotel here" button) — keep the HUD extensible.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; HUD icons must be reachable one-handed (bottom corners recommended, matches §12); desktop secondary fallback only.

- [x] **T069 — PixiJS scene engine + character sprite integration**
  - Doc references: §12 ("Implementation approach", "Character asset")
  - Dependencies: T035
  - File path hints: `/src/ui/scene/` (new — PixiJS `<canvas>` mount, `AnimatedSprite` setup), `package.json` (add `pixi.js`)
  - Acceptance criteria: A reusable scene component mounts a PixiJS `Application` into a container `<canvas>` sized to the 360×740 (scaled) frame, cleans up on unmount (no leaked WebGL context on screen/route changes), and exposes a way to place/animate sprites on it. The character sprite uses the CraftPix "Free City Trader Character" pack (§12 has the download link and confirmed license — free commercial use, no attribution required, don't redistribute the raw files) with at least an idle animation working end-to-end (walk-cycle wiring can follow later once movement is designed). React (HUD, popups) continues to render in the DOM above/around this canvas — this task does not move any UI logic into PixiJS.
  - Mobile/desktop note: Verify canvas scaling holds at 360×740 and on a larger desktop fallback viewport; canvas must not overflow or blur at either size.

- [x] **T038 — Screen 3: Market**
  - Doc references: §12 (screen 3)
  - Dependencies: T035, T012, T008, T011
  - File path hints: `/src/ui/screens/MarketScreen.tsx`, `/src/ui/components/CapacityBar.tsx`
  - Acceptance criteria: Lists unlocked commodities with live price (current city only), owned qty, avg buy cost, and +1/+10/+max buy/sell steppers wired to the store's trade action. A reusable `CapacityBar` component is created here (used for cargo fill) and explicitly designed for reuse by the Warehouse screen later (T052) for its "same bar-fill visual language" requirement per §14.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; steppers must be large-tap-friendly; desktop secondary fallback only.
  - Note (2026-07-26, §12 rewrite): renders inside T035's popup layer, over the persistent hub scene — not as a full-page screen swap.
  - Note (user-directed redesign): the +1/+10/+max always-visible steppers were replaced, at the user's explicit request, with a simple list (name, colored Buy/Sell price) that drills into a tap-to-trade panel (`TradePanel.tsx`) offering Buy/Sell tabs, a numeric input, -/+ buttons, a slider, and Max — a superset of the stepper functionality, chosen for lower friction. `CapacityBar` is built and wired in as specified (Market's cargo fill), reusable as-is by T052.

- [x] **T039 — Screen 4: Newspaper (+ Informant)**
  - Doc references: §12 (screen 4), §7 (resolution stories, source styling), §7 (Insider information)
  - Dependencies: T035, T018, T019, T020, T037
  - File path hints: `/src/ui/screens/NewspaperScreen.tsx`, `/src/ui/screens/InformantModal.tsx`
  - Acceptance criteria: Full-screen paper renders 2–4 stories with distinct visual source styling (wire vs. gossip), with yesterday's resolution stories pinned at the top per §7's non-negotiable requirement. The Informant button added as a placeholder in T037 now opens a real modal/subview offering a tip purchase (only rendered when the current city qualifies), wired to T020's engine function.
  - Mobile/desktop note: Primary target mobile-portrait 360×740, full-screen scrollable paper layout; desktop secondary fallback only.
  - Note (2026-07-26, §12 rewrite): renders inside T035's popup layer, over the persistent hub scene — not as a full-page screen swap.

- [x] **T040 — Screen 5: Bank**
  - Doc references: §12 (screen 5), §9, §10 (CA hiring "in season")
  - Dependencies: T035, T022, T023, T024, T031
  - File path hints: `/src/ui/screens/BankScreen.tsx`
  - Acceptance criteria: Shows deposits (deposit/withdraw controls), loan offer/repay (respecting the 1-loan-per-bank / 3-bank-concurrent rule), CA hiring section shown only at Medium+ bank cities, and an account book (transaction history or balance summary). If T024 flags an "awaiting default decision" state, this screen presents the three-choice UI and calls `resolveDefault`.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.
  - Note (2026-07-26, §12 rewrite): opened via the HUD's bank icon (bottom-left, T037), renders inside T035's popup layer over the persistent hub scene — not as a full-page screen swap.

- [x] **T041 — Screen 6: Travel map**
  - Doc references: §12 (screen 6), §4
  - Dependencies: T035, T013, T007
  - File path hints: `/src/ui/screens/TravelScreen.tsx`
  - Acceptance criteria: Lists unlocked cities with fare + days computed via T007/T013, and a tooltip/expand showing each city's last-seen prices + staleness (never live remote prices, per §6). Selecting a destination dispatches the travel action.
  - Mobile/desktop note: Primary target mobile-portrait 360×740, scrollable city list; desktop secondary fallback only.
  - Note (2026-07-26, §12 rewrite): renders inside T035's popup layer, over the persistent hub scene — not as a full-page screen swap.

- [x] **T042 — Screen 7: Year-end tax statement**
  - Doc references: §12 (screen 7), §10
  - Dependencies: T035, T030, T031
  - File path hints: `/src/ui/screens/YearEndScreen.tsx`
  - Acceptance criteria: Shown automatically when `runYearEnd` fires; displays profit breakdown, CA effect (rate/cap applied), and tax paid (or forced-loan notice if a shortfall occurred). Dismissing returns to the hub scene.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.
  - Note (2026-07-26, §12 rewrite): renders inside T035's popup layer, over the persistent hub scene — not as a full-page screen swap.

- [x] **T043 — Screen 8: Game over / score screen**
  - Doc references: §12 (screen 8), §1, §9 (bankruptcy declare option)
  - Dependencies: T035, T033, T024, T009
  - File path hints: `/src/ui/screens/GameOverScreen.tsx`
  - Acceptance criteria: Triggered by declaring bankruptcy (T024) or a forced default game-over; shows peak net worth, days survived, a net-worth-over-time graph (placeholder chart acceptable), and the local top-10 high-score table (via T033), with the current run's score recorded before display.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.
  - Note (2026-07-26, §12 rewrite): this one may remain a true full-screen takeover (run has ended) rather than a popup — confirm against §12 at implementation time.
