# Phase 1 — Core World & Price Engine

[← Back to index](../TASK.md)

Status: **Complete** (all tasks below are shipped).

- [x] **T005 — City data (Tier 1+2, 8 cities)**
  - Doc references: §4, §13
  - Dependencies: T002, T003
  - File path hints: `/src/engine/data/cities.ts`
  - Acceptance criteria: Exactly 8 `City` records (Farrow, Saltmere, Copperfell, Millbrook, Port Vela, Ironvale, Silkden, Greyharbor) with tier, bankSize, hotelPerNight, produces[], wants[] matching §4's tables exactly. Tier 3/4 cities are NOT present but a code comment references §13 explaining why (config-driven exclusion, easy to re-add later). Unit test asserts array length is 8 and each city has a unique id.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T006 — Commodity/goods data (9 v1 goods)**
  - Doc references: §5, §13
  - Dependencies: T002, T003
  - File path hints: `/src/engine/data/goods.ts`
  - Acceptance criteria: Exactly 9 `Good` records (Grain, Cotton, Iron, Salt, Textiles, Spices, Fuel, Steel, Silk) with unlock condition, license fee, base price, volatility class, daily drift % matching §5's table. Electronics and Rare Metals are explicitly excluded, with a comment citing §13 as authoritative over the ambiguous "Rare Metals is one commodity in v1 scope" sentence in §5 (§13's OUT list and the "9 commodities, all but Electronics" + Kessler-gating logic together confirm Rare Metals is also out since its only source city, Kessler Mines, is Tier 3). Unit test asserts array length is 9.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T007 — Travel distance matrix and fare calculation**
  - Doc references: §4 (Travel subsection)
  - Dependencies: T005
  - File path hints: `/src/engine/travel.ts`, `/src/engine/travel.test.ts`
  - Acceptance criteria: A generated 8×8 (v1 scope) distance-in-days matrix follows the doc's rules (same tier cluster = 1 day, adjacent tier = 2 days; Tier1↔Tier3/4 and Frosthelm special rules are N/A in v1 and may be omitted/commented as out-of-scope). `calcFare(days, destinationTier, cargoUsedPct)` implements `$10 × days × (1 + tier×0.5)`, doubled if cargo > 60% capacity, reading the multiplier from `config.ts`. Unit tests cover a same-tier trip, a cross-tier trip, and the >60% cargo doubling case.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T008 — Price engine (formula, floors/ceilings, mean reversion) with unit tests**
  - Doc references: §6
  - Dependencies: T004, T005, T006, T003
  - File path hints: `/src/engine/priceEngine.ts`, `/src/engine/priceEngine.test.ts`
  - Acceptance criteria: `computePrice(city, good, day, rngState, activeEvents)` implements the full pipeline: base × cityModifier × trend (sine/random-walk, 20–40 day period, ±15% amplitude) × dailyNoise (per volatility class) × eventMultiplier × meanReversion. Hard floor 0.3× and ceiling 4× of (base×cityModifier) enforced last. Unit tests explicitly verify: (a) mean reversion pulls a price that's >2.2× base×cityMod back by ~10%/day, (b) same for <0.45×, (c) floor/ceiling are never violated across a randomized stress test of many days/seeds, (d) same seed reproduces identical price sequences. This is the price-engine task the doc calls out by name for required unit tests — do not skip them.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T009 — Net worth calculation + peak net worth tracking**
  - Doc references: §4 ("Cities unlock by net worth…"), §1 ("Score = peak net worth ever reached")
  - Dependencies: T002, T008
  - File path hints: `/src/engine/netWorth.ts`
  - Acceptance criteria: `calcNetWorth(state)` returns cash + deposits + (owned goods valued at each city's last-known price) − debt. A `updatePeakNetWorth(state)` helper updates `state.peakNetWorth = max(current, netWorth)`; documented as intended to be called once per day-tick (wired in T015). Unit tests cover: pure cash-only case, case with stale/last-known good prices, case with outstanding debt exceeding assets (negative net worth allowed).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T010 — City and commodity unlock logic (incl. license purchase)**
  - Doc references: §4, §5
  - Dependencies: T009, T005, T006
  - File path hints: `/src/engine/unlocks.ts`
  - Acceptance criteria: `checkCityUnlocks(state)` unlocks Tier 2 cities at net worth ≥ $25,000 (Tier 1 unlocked from game start). `checkGoodUnlocks(state)` gates Salt/Textiles behind "Tier 1 reached AND day ≥ 5", and Spices/Fuel/Steel/Silk behind Tier 2 city unlock; `buyLicense(state, good)` deducts the license fee once and marks the good tradeable. Unit tests: a fresh-game state has only Grain/Cotton/Iron unlocked and only Tier 1 cities; simulating net worth crossing $25,000 unlocks Tier 2; buying a license before its prerequisite is met is rejected.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T011 — Cargo capacity and upgrade purchase**
  - Doc references: §2 (cargo capacity paragraph, cargo unit model)
  - Dependencies: T002, T003
  - File path hints: `/src/engine/cargo.ts`
  - Acceptance criteria: Starting capacity 40; `buyCargoUpgrade(state)` steps through the fixed tier list (100/$2,500 → 250/$12,000 → 600/$60,000 → 1,500/$300,000) in order, rejecting skip-ahead purchases or purchases when cash is insufficient. `cargoUsed(state)` sums units across all owned goods regardless of type (1 slot per unit, any good). Unit tests cover a full upgrade path and an insufficient-cash rejection.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T012 — Trade action (buy/sell, avg cost + FIFO cost-basis tracking)**
  - Doc references: §2 (cargo unit model), §10 (realized profit FIFO — forward reference, needed later by T030)
  - Dependencies: T008, T011, T005, T006
  - File path hints: `/src/engine/actions/trade.ts`
  - Acceptance criteria: `buy(state, good, qty)` and `sell(state, good, qty)` validate cash/cargo/ownership limits, update cash, update per-good owned qty + running average buy cost (for UI display), and maintain a FIFO lot ledger per good (buy lots with qty+cost, consumed oldest-first on sell) so realized profit can later be computed exactly as "sell proceeds − matched buy costs, FIFO". Selling more than owned, or buying more than cargo capacity allows, is rejected with no state mutation. Also increments `state.cumulativeTradeVolume` (used later by rank, T021). Unit tests cover partial-lot FIFO consumption across multiple buys at different prices.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T013 — Travel action (fare calc, day advance, cargo lock, remote price staleness)**
  - Doc references: §2 (Travel bullet), §4 (fare formula, distance matrix), §6 (information model — never leak live remote prices)
  - Dependencies: T007, T011, T005
  - File path hints: `/src/engine/actions/travel.ts`
  - Acceptance criteria: `travel(state, destinationCityId)` computes fare via T007's `calcFare`, deducts cash, sets `state.currentCity` after the correct number of days elapse (multi-day travel produces a "days remaining" state the turn loop can advance), and marks all cities left behind as showing only their last-seen price + age (never a live computed price) until revisited. While traveling, trading is disallowed (enforced by returning/throwing if `travel action in progress`). Unit test: traveling 2 days leaves the origin city's prices frozen at last-seen values while the destination's price is fresh on arrival.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T014 — Stay action (hotel cost per city tier)**
  - Doc references: §2 (Stay bullet), §4 (Hotel/night column)
  - Dependencies: T005, T002
  - File path hints: `/src/engine/actions/stay.ts`
  - Acceptance criteria: `stay(state)` deducts the current city's nightly rate from cash, advances the day by 1. Rejects if cash insufficient. Unit test covers a stay in a specific city matching its documented nightly rate exactly.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T015 — Turn loop / day-advance engine tying trade/travel/stay together**
  - Doc references: §2 (core loop), §17 (build step 3)
  - Dependencies: T012, T013, T014, T008, T009
  - File path hints: `/src/engine/turnLoop.ts`
  - Acceptance criteria: A single `advanceDay(state)` function recomputes all city×good prices for the new day (via T008), updates net worth and peak net worth (via T009), and increments `state.day`. Travel/Stay actions (T013/T014) call `advanceDay` the correct number of times. The whole loop is runnable headlessly in Node with no DOM/React dependency (a Node script or test that runs 100 simulated days using only `/src/engine` exports and asserts no exceptions is the acceptance test). This is the "headless in Node" checkpoint the doc requires before any UI work begins.
  - Mobile/desktop note: N/A — engine only, no UI.
