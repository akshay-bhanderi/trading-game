# Trade Winds of Selvara — TASK.md

> Generated from `trade-winds-design-doc.md` (single source of truth — if a task and the doc disagree, the doc wins; update this file to match).
> Executed one task at a time by separate Claude Code agents, each starting cold with no memory of other tasks.

## How to use this file

Tasks are listed in dependency order within numbered phases. To pick work: find the lowest-numbered unchecked task whose **Dependencies** are all already checked off, and execute it — read only the **Doc references** listed (plus the design doc's own cross-references if it points elsewhere) and the **File path hints**. Each task is self-contained: a fresh agent with no memory of other tasks should be able to complete it using only `trade-winds-design-doc.md` and the task's own text. When a task's **Acceptance criteria** all pass (including any required tests), check the box and move to the next eligible task. Do not skip ahead out of dependency order even if a later task looks easy — later tasks assume earlier files/exports exist exactly as specified. **Phase 10–13 tasks must not start until T045 (the locked v1 bot-harness baseline) is checked off**, per §13/§17 of the design doc.

---

## Phase 0 — Foundation

- [x] **T001 — Scaffold Vite+React+TS project with engine/ui split**
  - Doc references: §17
  - Dependencies: none
  - File path hints: repo root (`vite.config.ts`, `tsconfig.json`, `package.json`), `/src/engine/`, `/src/ui/`
  - Acceptance criteria: `npm run dev` and `npm run build` succeed on a blank scaffold; `/src/engine` and `/src/ui` directories exist with a README or comment stating the "no React imports in engine" rule; a lint rule or CI check (e.g. ESLint `no-restricted-imports`) blocks `react` imports inside `/src/engine`; a test runner (Vitest recommended, since it runs headless in Node matching the §17 bot-harness requirement) is configured and a trivial passing test exists.
  - Mobile/desktop note: N/A — tooling/scaffold only, no rendered UI yet.

- [x] **T002 — Core TypeScript types (City, Good, Event, GameState, etc.)**
  - Doc references: §4, §5, §6, §7, §9, §10, §17
  - Dependencies: T001
  - File path hints: `/src/engine/types.ts`
  - Acceptance criteria: Types/interfaces exist for `City`, `Good`, `CityGoodModifier`, `PriceState`, `Event`, `NewspaperStory`, `Cargo`, `BankAccount` (loan+deposit), `TaxRecord`, `Rank` inputs, `GameState` (day, currentCity, cash, cargo, deposits/loans map, owned goods with cost basis, unlocked cities/goods, peakNetWorth, seed, difficulty, repaymentRecord, rank cache). File compiles with `strict: true`, zero `any`. A short comment block notes these types will be extended in Phase 2 (warehouse/hotel/aviation fields added later, not now).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T003 — config.ts skeleton with all ⚙ tunable constants**
  - Doc references: §3, §4, §5, §6, §7, §9, §10 (Phase 2 sections §14–§16 get placeholder stubs only, filled in later tasks)
  - Dependencies: T002
  - File path hints: `/src/engine/config.ts`
  - Acceptance criteria: A single exported `CONFIG` object (or several named exports re-exported from one barrel file) contains every ⚙-marked number from §3–§10 (difficulty multipliers, cargo upgrade costs, mean-reversion pull %, floor/ceiling multipliers, wire/gossip accuracy, insider pricing formula constants, rank weights, loan baseCaps/rankFactor/interest rates, deposit interest rates, default thresholds, tax year length, CA tiers). Values match the doc's tables exactly. Empty/commented placeholder sections exist for Warehouse/Hotel/Aviation constants (to be populated in T046/T053/T059) so the file's structure doesn't need reshaping later. No magic numbers for these systems exist anywhere else in the codebase (this is the acceptance bar to enforce going forward).
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T004 — Seeded RNG utility with unit tests**
  - Doc references: §6 ("Deterministic seeded RNG per run")
  - Dependencies: T002
  - File path hints: `/src/engine/rng.ts`, `/src/engine/rng.test.ts`
  - Acceptance criteria: A `createRng(seed: number)` function returns a generator object with at least `next(): number` (0–1 float) and `int(min,max)`/`pick<T>(arr:T[])` helpers; same seed always produces the identical sequence (test asserts this); different seeds produce different sequences (test asserts this with statistical/inequality check, not just "not equal once"); no use of `Math.random` anywhere else in `/src/engine` going forward (documented as a rule for future tasks).
  - Mobile/desktop note: N/A — engine only, no UI.

---

## Phase 1 — Core World & Price Engine

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

---

## Phase 2 — Events & Newspaper Engine

- [x] **T016 — Base event table data + scheduling engine**
  - Doc references: §7 (event types table; pipeline steps 1–2)
  - Dependencies: T015, T004, T005, T006
  - File path hints: `/src/engine/events/eventTable.ts`, `/src/engine/events/eventEngine.ts`
  - Acceptance criteria: All 11 base event types from §7's table are data-defined (affected good(s), city-or-global scope, multiplier range, duration). `scheduleEvent(state, rng)` schedules an event 2–4 days in the future with a hidden truth flag. Events are stored in `state` so the daily tick (T015) can check for events becoming due. Unit test: scheduling produces an event whose fire date is strictly 2–4 days after the current day.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T017 — Event resolution (fire/fizzle) + price multiplier application**
  - Doc references: §7 (pipeline steps 3–5)
  - Dependencies: T016, T008
  - File path hints: `/src/engine/events/resolution.ts`
  - Acceptance criteria: On an event's due date, `resolveEvent(state, rng)` decides fire-vs-fizzle based on the event's hidden truth flag and applies the correct price multiplier (feeding T008's `eventMultiplier` term) for its duration if fired; does nothing to prices if fizzled. A resolution record is stored for next-day newspaper consumption (T018). Unit test: a "fired" event measurably shifts the affected good's price relative to a control run with the event disabled; a "fizzled" event does not.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T018 — Newspaper generation pipeline (rumors, filler, false rumors, source styles, resolution stories, unlock headlines)**
  - Doc references: §7 (pipeline, resolution-story requirement), §4 (city-unlock headline)
  - Dependencies: T016, T017, T010
  - File path hints: `/src/engine/newspaper.ts`
  - Acceptance criteria: `generateDailyPaper(state, rng)` produces 2–4 stories per day mixing scheduled-event rumors, filler, and deliberate false rumors, each tagged with a source style ("wire" ≈80% accurate, "gossip" ≈50%, values from config). The morning after any event's due date, a resolution story explaining why it fired or fizzled is always included (unit test enforces this is non-optional — every resolved event produces exactly one resolution story the next day). When a city unlocks (via T010), a headline story is generated that day. Unit test: over many simulated days, resolution stories appear 1:1 with resolved events.
  - Mobile/desktop note: N/A — engine only, no UI (consumed by UI in T039).

- [x] **T019 — Fog of wealth (rumor specificity scaling by net worth)**
  - Doc references: §7 (Fog of wealth)
  - Dependencies: T018, T009
  - File path hints: `/src/engine/fogOfWealth.ts`
  - Acceptance criteria: Rumor text generation applies exact city+good detail below $50k net worth, good+region only from $50k–$500k, and directional-only phrasing above $500k, per the three tiers in §7. Unit test asserts the same underlying rumor event produces progressively vaguer text as a mocked net worth increases across the three bands.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T020 — Insider information / Informant system**
  - Doc references: §7 (Insider information), §9 (bank size tiers, for Medium+ gating)
  - Dependencies: T018, T009, T005
  - File path hints: `/src/engine/informant.ts`
  - Acceptance criteria: Informant tips are only offerable in Medium+ bank cities (Port Vela, Ironvale, Silkden in v1 — note in code comment that Novara Heights' 75%-accuracy bonus and cheapest pricing are unreachable in v1 since Novara is Tier 4/out of scope per §13, so only the generic 70% base accuracy applies; the formula should still be written generically so a future Tier 4 addition needs no special-casing). Tip price = `max($500, 1% of net worth)`. Tip accuracy is 70% (config-driven), adjusted by difficulty's rumor-accuracy-bonus per §3. Purchased tips resolve through the same resolution-story mechanism as regular rumors (reuses T017/T018). Unit test covers price formula at low and high net worth, and gating rejection in a Small-bank city.
  - Mobile/desktop note: N/A — engine only, no UI (consumed by UI in T039).

---

## Phase 3 — Rank & Banking

- [x] **T021 — Hidden trader rank engine**
  - Doc references: §8
  - Dependencies: T002, T009, T012, T015
  - File path hints: `/src/engine/rank.ts`
  - Acceptance criteria: `computeRank(state)` implements the exact formula (0.5×log10(netWorth+1) + 0.3×log10(cumulativeTradeVolume+1) + 1.5×repaymentRecord[-2,+2] + 0.2×log10(daysSurvived+1)), clamps floor to [1,10], weights read from config. Recomputation is wired to occur every 7 days via the turn loop (T015 hook or an explicit `maybeRecomputeRank(state)` called from `advanceDay`). Rank value is never exposed by any exported "display" helper (acceptance check: no function in this file formats rank for direct UI display — that's a deliberate design constraint, per §8, not an oversight). Unit test verifies the formula against hand-computed example inputs.
  - Mobile/desktop note: N/A — engine only, no UI.

- [x] **T022 — Bank deposits (per-city, compounding interest)**
  - Doc references: §9 (Deposits)
  - Dependencies: T002, T003, T005
  - File path hints: `/src/engine/bank/deposits.ts`
  - Acceptance criteria: `deposit(state, cityId, amount)` and `withdraw(state, cityId, amount)` only succeed while `state.currentCity === cityId` (v1's explicit simplification — deposits/loans live at the specific city's bank, no cross-city routing). Daily compounding interest rates by bank size (Small 0.10%, Medium 0.14%, Large 0.18%, Huge/Novara 0.25% — Large/Huge/Novara unreachable in v1 scope per §13, implement generically anyway) accrue via a `accrueDepositInterest(state)` hook intended to be called once per day-tick. Unit test covers multi-day compounding matches a hand-computed value within floating-point tolerance.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T023 — Bank loans (issuance, rank-scaled cap, interest, repayment)**
  - Doc references: §9 (Loans)
  - Dependencies: T021, T022, T003
  - File path hints: `/src/engine/bank/loans.ts`
  - Acceptance criteria: `takeLoan(state, cityId, amount)` computes max principal as `baseCap(bankSize) × rankFactor(rank)` (rankFactor = 1.8^(rank-1)) and rejects amounts above it. Enforces one active loan per bank and a max of 3 concurrent banks with active loans. Daily simple interest accrues by bank size (0.9/0.7/0.55/0.4%) × difficulty's loan-interest multiplier (§3). `repayLoan(state, cityId, amount)` reduces principal+accrued interest and, on full on-time repayment, bumps `repaymentRecord` by +0.1 (clamped). Unit tests cover cap rejection at low rank, interest accrual over N days, and the repayment-record bump.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T024 — Default flow (three player-choice branches)**
  - Doc references: §9 (Default)
  - Dependencies: T023, T009
  - File path hints: `/src/engine/bank/default.ts`
  - Acceptance criteria: `checkDefaultTrigger(state)` detects (a) a loan 15 days past its 60-day term, or (b) total debt > 2× net worth for 7 consecutive days, and flags the game state as "awaiting default decision" (never auto-resolves — must be surfaced for a player choice, later wired to UI in T040/T043). `resolveDefault(state, choice)` implements: Surrender (seize deposits+cargo at 70% value, repaymentRecord −0.5, run continues), Restructure (2× interest + 0.5%/day collector fee, repaymentRecord −0.3, forced game-over if still >2× net worth after 15 more days — implement as a re-check hook), Bankruptcy (run ends, final score = peakNetWorth). Unit tests cover trigger detection for both conditions and each of the three resolution branches' state mutations.
  - Mobile/desktop note: N/A — engine only, no UI.

---

## Phase 4 — Bots & Balance Harness (First Pass)

- [ ] **T025 — Random bot strategy**
  - Doc references: §11 ("random trader")
  - Dependencies: T011, T012, T013, T014, T015, T004
  - File path hints: `/src/engine/bots/randomBot.ts`
  - Acceptance criteria: A pure function `randomBotStep(state, rng)` picks a random valid action each day (random buy/sell qty within limits, random travel-or-stay) using only the seeded RNG — no use of newspaper/rank/loans. Runs 90 simulated days without throwing in a smoke test.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T026 — Greedy spread-chaser bot strategy**
  - Doc references: §11 ("greedy spread-chaser ignoring news")
  - Dependencies: T011, T012, T013, T014, T015, T008, T004
  - File path hints: `/src/engine/bots/greedyBot.ts`
  - Acceptance criteria: `greedyBotStep(state, rng)` always buys the currently-cheapest-relative-to-base good it can afford/carry and travels toward the best known remembered sell price, ignoring newspaper/rumor state entirely (must not import `newspaper.ts` — enforce via code review/comment). Smoke test runs 90 days without throwing.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T027 — News-follower bot strategy (uses rumors + loans)**
  - Doc references: §11 ("news-follower using rumors + loans")
  - Dependencies: T018, T023, T015, T004
  - File path hints: `/src/engine/bots/newsBot.ts`
  - Acceptance criteria: `newsBotStep(state, rng)` reads the current day's newspaper (T018) to bias buy/sell/travel decisions toward rumored price moves, and opportunistically takes/repays loans (T023) to fund larger trades when a high-confidence wire rumor is active. Smoke test runs 90 days without throwing.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T028 — Bot harness runner + health-check assertions**
  - Doc references: §11 (harness description, health checks)
  - Dependencies: T025, T026, T027, T004
  - File path hints: `/src/engine/harness/botHarness.ts`, `/src/engine/harness/botHarness.test.ts`
  - Acceptance criteria: `runHarness({ bot, seedsCount, days })` simulates N seeded games (must support the full spec of 1,000 seeds × 360 days, though CI-run tests may use a smaller sample for speed) and returns per-day-checkpoint net worth stats (median, etc.) per bot. A test/report step checks: random bot median net worth at day 90 < $10k; greedy bot ≈0.5× the §11 targets; news bot ≈ the §11 targets; no bot exceeds 3× targets; Expert-mode bankruptcy rate ≈25–40% by day 90. This test is REQUIRED to exist and pass (or to clearly report which check fails, feeding into T029) — per the task's mandate that harness/price-engine tests are non-negotiable.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T029 — First balance pass (tune config.ts against §11 targets)**
  - Doc references: §11 (targets table), §3 (difficulty multipliers)
  - Dependencies: T028, T003
  - File path hints: `/src/engine/config.ts` (edits only — no new files)
  - Acceptance criteria: Iteratively adjust ⚙ constants in `config.ts` (and only that file — per §17's "balancing = editing one file" rule) until T028's harness health checks all pass on Pro mode for day-10/30/90 targets (day-180/360 are explicitly aspirational/v2 per §13 and not required to pass in v1). Document which constants were changed and why in the commit message. Re-run and paste the passing harness output as part of the PR/commit description.
  - Mobile/desktop note: N/A — engine only, no UI.

---

## Phase 5 — Tax & CA

- [ ] **T030 — Tax engine (FIFO realized profit, 90-day year-end, forced loan on shortfall)**
  - Doc references: §10 (tax rules, no-CA rate, forced loan)
  - Dependencies: T012, T015, T023
  - File path hints: `/src/engine/tax.ts`
  - Acceptance criteria: `runYearEnd(state)` triggers on days 90/180/270… computing taxable base = FIFO realized profit for the elapsed year + deposit interest earned, taxed at 30% absent a CA (unrealized cargo gains excluded). If cash+deposits can't cover the tax bill, the shortfall becomes a forced Huge-bank-rate loan (note: v1 has no Huge bank city reachable — implement generically using the Huge rate constant from config regardless, per §13's instruction that CA/tax "still apply in full"). Unit tests cover a profitable year's tax deduction and a shortfall producing the forced loan.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T031 — CA hiring system (Junior/Senior/Elite tiers)**
  - Doc references: §10 (CA tiers table)
  - Dependencies: T030, T005
  - File path hints: `/src/engine/ca.ts`
  - Acceptance criteria: `hireCA(state, tier)` is only available at Medium+ bank cities while `state.currentCity` matches, deducts the annual fee, and applies the correct tax rate/profit cap/above-cap rate for that fiscal year in `runYearEnd` (T030). Unit tests cover all three tiers plus the no-CA default, verifying the correct blended rate is applied when realized profit exceeds a tier's cap.
  - Mobile/desktop note: N/A — engine only, no UI.

---

## Phase 6 — Persistence

- [ ] **T032 — localStorage save/load with schema versioning**
  - Doc references: §17 (localStorage persistence, schema version), §1 (Save)
  - Dependencies: T031
  - File path hints: `/src/engine/persistence/saveLoad.ts`
  - Acceptance criteria: `saveGame(state)` serializes full `GameState` (including RNG seed) to a single localStorage key with an embedded `schemaVersion` number; `loadGame()` deserializes and, if the stored version is older than current, runs a migration function (a no-op passthrough stub is acceptable for v1 as long as the mechanism exists and is documented). Round-trip test: save then load produces a deep-equal state.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T033 — Local high-score table (top 10 runs)**
  - Doc references: §1 (local high-score table)
  - Dependencies: T032
  - File path hints: `/src/engine/persistence/highScore.ts`
  - Acceptance criteria: `recordScore({ peakNetWorth, daysSurvived, difficulty })` maintains a sorted (descending by peakNetWorth) top-10 list in a separate localStorage key, evicting the lowest entry when full. Unit test covers insertion, ordering, and eviction at exactly 11 entries.
  - Mobile/desktop note: N/A — engine only, no UI.

---

## Phase 7 — App Shell & State Wiring

- [ ] **T034 — Zustand (or reducer) store wiring engine to React**
  - Doc references: §17 (state management)
  - Dependencies: T015, T018, T024, T030, T031, T032, T033
  - File path hints: `/src/ui/store/gameStore.ts`
  - Acceptance criteria: A store exposes current `GameState` plus dispatchable actions that call into `/src/engine` functions only (no game logic duplicated in the store — it's a thin adapter). Actions cover trade, travel, stay, deposit/withdraw, loan take/repay, default resolution, CA hiring, save/load. A smoke test (React Testing Library or plain unit test against the store's exported hook) dispatches a buy action and asserts cash decreases.
  - Mobile/desktop note: N/A — state/store wiring layer only, no visual rendering; must not assume desktop-only interaction patterns since every screen that consumes it is mobile-first (§1/§12).

- [ ] **T035 — App shell & screen navigation (mobile-first layout container)**
  - Doc references: §1 (360×740 mobile-portrait target), §12
  - Dependencies: T034
  - File path hints: `/src/ui/App.tsx`, `/src/ui/navigation/`
  - Acceptance criteria: A root component renders a fixed-aspect mobile-portrait container (360×740 baseline, responsive scaling for larger viewports) with a simple screen-router (state-based or a lightweight router) capable of switching between the 8 v1 screens (stubs acceptable for now — real screens land in T036–T043). No screen content is rendered yet beyond placeholders.
  - Mobile/desktop note: Primary target is mobile-portrait browsers at 360×740 per §1/§12; desktop must render as a responsive fallback (e.g., centered/scaled mobile viewport) — never a desktop-first redesign.

---

## Phase 8 — UI Screens (1–8)

- [ ] **T036 — Screen 1: Title / difficulty select / continue**
  - Doc references: §12 (screen 1), §3
  - Dependencies: T035, T032
  - File path hints: `/src/ui/screens/TitleScreen.tsx`
  - Acceptance criteria: Renders difficulty selector (Noob/Pro/Expert) with §3's starting values previewed, a "New Game" action that seeds a fresh `GameState`, and a "Continue" action enabled only when a saved game exists (via T032). Placeholder art (colored rectangles/emoji) per §12's stated art-pass deferral.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; buttons sized for touch (minimum ~44px tap targets); desktop is a secondary responsive fallback only.

- [ ] **T037 — Screen 2: City screen (hub)**
  - Doc references: §12 (screen 2)
  - Dependencies: T035, T015, T005
  - File path hints: `/src/ui/screens/CityScreen.tsx`
  - Acceptance criteria: Renders pixel-skyline placeholder, buttons to Market/Bank/Newspaper/Travel/Stay, an Informant button placeholder (shown only when the current city qualifies per T020's gating — wired for real once T039 lands), and a top bar showing day/cash/cargo-used/city name. Note in code: this file will be modified again by T039 (Informant hookup) and T058 (Hotel screen's "buy hotel here" button) — keep the button layout extensible.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; hub buttons must be reachable one-handed (bottom-anchored layout recommended); desktop secondary fallback only.

- [ ] **T038 — Screen 3: Market**
  - Doc references: §12 (screen 3)
  - Dependencies: T035, T012, T008, T011
  - File path hints: `/src/ui/screens/MarketScreen.tsx`, `/src/ui/components/CapacityBar.tsx`
  - Acceptance criteria: Lists unlocked commodities with live price (current city only), owned qty, avg buy cost, and +1/+10/+max buy/sell steppers wired to the store's trade action. A reusable `CapacityBar` component is created here (used for cargo fill) and explicitly designed for reuse by the Warehouse screen later (T052) for its "same bar-fill visual language" requirement per §14.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; steppers must be large-tap-friendly; desktop secondary fallback only.

- [ ] **T039 — Screen 4: Newspaper (+ Informant)**
  - Doc references: §12 (screen 4), §7 (resolution stories, source styling), §7 (Insider information)
  - Dependencies: T035, T018, T019, T020, T037
  - File path hints: `/src/ui/screens/NewspaperScreen.tsx`, `/src/ui/screens/InformantModal.tsx`
  - Acceptance criteria: Full-screen paper renders 2–4 stories with distinct visual source styling (wire vs. gossip), with yesterday's resolution stories pinned at the top per §7's non-negotiable requirement. The Informant button added as a placeholder in T037 now opens a real modal/subview offering a tip purchase (only rendered when the current city qualifies), wired to T020's engine function.
  - Mobile/desktop note: Primary target mobile-portrait 360×740, full-screen scrollable paper layout; desktop secondary fallback only.

- [ ] **T040 — Screen 5: Bank**
  - Doc references: §12 (screen 5), §9, §10 (CA hiring "in season")
  - Dependencies: T035, T022, T023, T024, T031
  - File path hints: `/src/ui/screens/BankScreen.tsx`
  - Acceptance criteria: Shows deposits (deposit/withdraw controls), loan offer/repay (respecting the 1-loan-per-bank / 3-bank-concurrent rule), CA hiring section shown only at Medium+ bank cities, and an account book (transaction history or balance summary). If T024 flags an "awaiting default decision" state, this screen presents the three-choice UI and calls `resolveDefault`.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.

- [ ] **T041 — Screen 6: Travel map**
  - Doc references: §12 (screen 6), §4
  - Dependencies: T035, T013, T007
  - File path hints: `/src/ui/screens/TravelScreen.tsx`
  - Acceptance criteria: Lists unlocked cities with fare + days computed via T007/T013, and a tooltip/expand showing each city's last-seen prices + staleness (never live remote prices, per §6). Selecting a destination dispatches the travel action.
  - Mobile/desktop note: Primary target mobile-portrait 360×740, scrollable city list; desktop secondary fallback only.

- [ ] **T042 — Screen 7: Year-end tax statement**
  - Doc references: §12 (screen 7), §10
  - Dependencies: T035, T030, T031
  - File path hints: `/src/ui/screens/YearEndScreen.tsx`
  - Acceptance criteria: Shown automatically when `runYearEnd` fires; displays profit breakdown, CA effect (rate/cap applied), and tax paid (or forced-loan notice if a shortfall occurred). Dismissing returns to the City screen.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.

- [ ] **T043 — Screen 8: Game over / score screen**
  - Doc references: §12 (screen 8), §1, §9 (bankruptcy declare option)
  - Dependencies: T035, T033, T024, T009
  - File path hints: `/src/ui/screens/GameOverScreen.tsx`
  - Acceptance criteria: Triggered by declaring bankruptcy (T024) or a forced default game-over; shows peak net worth, days survived, a net-worth-over-time graph (placeholder chart acceptable), and the local top-10 high-score table (via T033), with the current run's score recorded before display.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.

---

## Phase 9 — Deploy Checkpoint (v1 Core Loop Ships)

- [ ] **T044 — Playtest build polish & deploy configuration**
  - Doc references: §17 (build step 9)
  - Dependencies: T036, T037, T038, T039, T040, T041, T042, T043
  - File path hints: repo root (`vercel.json` or Netlify config, `package.json` build scripts)
  - Acceptance criteria: `npm run build` produces a deployable static bundle; a Vercel or Netlify config is committed; a manual playtest checklist (new game → trade → travel → bank → year-end → default → game over) is walked through and confirmed working end-to-end on a 360×740 viewport (browser devtools device emulation is acceptable evidence).
  - Mobile/desktop note: Verify specifically at 360×740 viewport before signing off, per §1's mobile-first mandate.

- [ ] **T045 — Re-run §11 bot harness against v1 as locked baseline**
  - Doc references: §17 (build step 10, first half), §11
  - Dependencies: T044, T028
  - File path hints: `/src/engine/harness/baseline.v1.json` (or similar snapshot output), `/src/engine/harness/botHarness.test.ts` (extended)
  - Acceptance criteria: Run the full-spec harness (1,000 seeds × 360 days ×3 bots) against the shipped v1 build and persist the resulting summary stats as a committed baseline snapshot file. This snapshot is the reference T068 will diff against after Phase 2 lands. All §11 health checks pass at this checkpoint. **No Phase 2 task may begin until this task is checked off** — this is the explicit gate from §13's "Phase 2… sequenced after the core loop ships and clears the bot-harness balance pass."
  - Mobile/desktop note: N/A — engine/tooling only, no UI.

---

## Phase 10 — Phase 2: Warehouse Storage

- [ ] **T046 — Warehouse config & data (floor costs/capacities/maintenance)**
  - Doc references: §14 (floor table)
  - Dependencies: T045, T003, T005
  - File path hints: `/src/engine/config.ts` (fill in the Warehouse placeholder section from T003), `/src/engine/data/warehouse.ts`
  - Acceptance criteria: All 6 floor tiers' capacity-added, cumulative capacity, build cost, and annual maintenance values from §14's table are entered into config, keyed for lookup by floor number. Unit test asserts cumulative capacity sums correctly floor-by-floor (150→400→800→1,450→2,450→4,050).
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T047 — Warehouse build/ownership engine (sequential floor purchase)**
  - Doc references: §14 (Ownership, Floors)
  - Dependencies: T046, T002
  - File path hints: `/src/engine/warehouse.ts`
  - Acceptance criteria: `buildWarehouseFloor(state, cityId)` allows purchasing the next floor in order only (rejects skip-ahead), tracks ownership per city (a player can own warehouses in multiple cities), deducts build cost. `state` gains a `warehouses: Record<cityId, { floorsBuilt: number, insured: boolean }>` field (extend types from T002 here). Unit tests cover sequential build success and skip-ahead rejection.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T048 — Warehouse store/withdraw goods (separate from cargo)**
  - Doc references: §14 (separate capacity system, no remote trading, net worth inclusion)
  - Dependencies: T047, T008, T009
  - File path hints: `/src/engine/warehouse.ts` (extend)
  - Acceptance criteria: `storeGoods(state, cityId, good, qty)` / `withdrawGoods(state, cityId, good, qty)` only succeed while `state.currentCity === cityId` (no remote trading, matching §6/§14's rule), respect the city's total built floor capacity, and do not consume cargo capacity (T011 untouched). Stored goods are included in net worth (T009 extended to sum warehouse goods at last-known local price). Unit test: storing goods does not change `cargoUsed`; net worth increases by stored value.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T049 — Warehouse annual maintenance billing**
  - Doc references: §14 (maintenance bills at year-end, unpaid → Small-bank-rate debt)
  - Dependencies: T047, T030
  - File path hints: `/src/engine/warehouse.ts` (extend), `/src/engine/tax.ts` (extend `runYearEnd` to include warehouse maintenance)
  - Acceptance criteria: `runYearEnd` now sums maintenance across every owned warehouse/floor and deducts it alongside tax; if unpayable, the shortfall accrues as Small-bank-rate debt (per §14, distinct from the Huge-rate tax shortfall loan in T030 — confirm this distinction explicitly in the implementation). Unit test covers a payable and an unpayable maintenance scenario.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T050 — Warehouse fire event + insurance mitigation**
  - Doc references: §14 (Risk: Warehouse fire, insurance), §7 (event table extension)
  - Dependencies: T016, T017, T048
  - File path hints: `/src/engine/events/eventTable.ts` (extend), `/src/engine/warehouse.ts` (extend)
  - Acceptance criteria: A new low-probability "Warehouse fire" event type is added to the event table (city-scoped), destroying 10–40% of that city's stored goods when it fires. `buyWarehouseInsurance(state, cityId)` costs 2%/year of stored goods' value (billed with maintenance, T049) and caps fire loss at 10% when active. Unit tests cover an uninsured fire's loss range and an insured fire capped at 10%.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T051 — Warehouse sell-back**
  - Doc references: §14 (Sell-back)
  - Dependencies: T047
  - File path hints: `/src/engine/warehouse.ts` (extend)
  - Acceptance criteria: `sellWarehouse(state, cityId)` liquidates all floors for 50% of total cumulative build cost, removes ownership and any stored goods' value from net worth (goods themselves — decide and document whether they're forfeited or must be withdrawn first; recommended: reject sell-back if goods are still stored, requiring withdrawal first, to avoid ambiguous value loss). Unit test covers the 50% payout calculation and the reject-if-not-empty rule.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T052 — UI Screen 9: Warehouse screen**
  - Doc references: §12 (screen 9), §14 (graphic description)
  - Dependencies: T035, T038, T047, T048, T049, T050, T051
  - File path hints: `/src/ui/screens/WarehouseScreen.tsx`
  - Acceptance criteria: Renders a vertical building elevation, one row per floor, lit/filled = built, dim outline = not-yet-built with an inline "buy next floor" button. Each built floor shows its own used/free capacity bar reusing the `CapacityBar` component from T038, stacked to read as one building-height meter, per §14's explicit visual-consistency requirement. Includes store/withdraw controls, insurance toggle, and sell-back button.
  - Mobile/desktop note: Primary target mobile-portrait 360×740, vertically-scrolling elevation view suits portrait well; desktop secondary fallback only.

---

## Phase 11 — Phase 2: Hotel Ownership

- [ ] **T053 — Hotel config & data (tier costs/revenue/license off city nightly rate)**
  - Doc references: §15 (tier table)
  - Dependencies: T045, T003, T005
  - File path hints: `/src/engine/config.ts` (fill Hotel placeholder section), `/src/engine/data/hotel.ts`
  - Acceptance criteria: The 4 tiers' build/upgrade multiplier, passive revenue multiplier, and annual license multiplier (all × city nightly rate, per §15's table) are entered as config multipliers, not hardcoded per-city values, matching the doc's explicit config-driven intent. Unit test reproduces the doc's own worked example (Silkden $60/night Inn = $30,000 cost, $48/day revenue, $1,200/yr license).
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T054 — Hotel build/upgrade engine (marginal cost stacking)**
  - Doc references: §15 (Ownership, upgrade cost is marginal)
  - Dependencies: T053, T002
  - File path hints: `/src/engine/hotel.ts`
  - Acceptance criteria: `buildOrUpgradeHotel(state, cityId)` purchases the next tier in order (Inn→Lodge→Grand→Resort), charging only the marginal upgrade cost on top of what was already paid (e.g. Lodge's "+1,200×" charged on top of Inn's cost, not replacing it). Ownership tracked per city, multiple cities allowed simultaneously. Unit test covers the Silkden example across two upgrade steps, confirming cumulative spend matches manual calculation.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T055 — Hotel passive revenue accrual + free stays for owner**
  - Doc references: §15 (Free stays, Passive revenue accrues daily)
  - Dependencies: T054, T015
  - File path hints: `/src/engine/hotel.ts` (extend), `/src/engine/actions/stay.ts` (extend)
  - Acceptance criteria: A daily-tick hook (called from `advanceDay`, T015) credits passive revenue for every owned hotel regardless of the player's current location, including while traveling multiple days. `stay()` (T014) is modified so it costs $0 in a city where the player owns the hotel. Unit test: revenue accrues for an owned hotel in a city the player is NOT currently in, across a multi-day travel simulation.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T056 — Hotel epidemic-pause interaction**
  - Doc references: §15 (Epidemic pauses revenue), §7 (epidemic event's "hotel closed" effect)
  - Dependencies: T055, T016
  - File path hints: `/src/engine/hotel.ts` (extend)
  - Acceptance criteria: The existing epidemic event (already in the §7 base table from T016) is checked in the daily revenue-accrual hook; while an epidemic is active in a city, that city's owned-hotel revenue is $0 for the event's duration, then resumes automatically. No new event type is added (explicitly reuses the existing effect, per §15). Unit test covers revenue pausing during an active epidemic and resuming after.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T057 — Hotel annual license fee billing + sell-back**
  - Doc references: §15 (Annual license fee, Sell-back)
  - Dependencies: T054, T030
  - File path hints: `/src/engine/hotel.ts` (extend), `/src/engine/tax.ts` (extend `runYearEnd`)
  - Acceptance criteria: `runYearEnd` now also deducts each owned hotel's annual license fee (× nightly rate, per tier). `sellHotel(state, cityId)` liquidates for 50% of total invested (build + all upgrade costs), matching the Warehouse salvage rate per §15's explicit parity note. Unit tests cover license billing and the 50% sell-back payout.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T058 — UI Screen 10: Real Estate/Hotels screen + City-screen "buy hotel here" button**
  - Doc references: §12 (screen 10)
  - Dependencies: T035, T037, T054, T055, T056, T057
  - File path hints: `/src/ui/screens/RealEstateScreen.tsx`, `/src/ui/screens/CityScreen.tsx` (modify — this file was created in T037)
  - Acceptance criteria: Real Estate screen lists owned hotels by city with tier, daily revenue, and an upgrade button. The City screen (T037) gains a "buy hotel here" button shown only when the current city's hotel is not yet owned, per §12's explicit placement requirement.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.

---

## Phase 12 — Phase 2: Aviation Leasing

- [ ] **T059 — Aviation config & data (4 plane classes)**
  - Doc references: §16 (class table)
  - Dependencies: T045, T003
  - File path hints: `/src/engine/config.ts` (fill Aviation placeholder section), `/src/engine/data/aviation.ts`
  - Acceptance criteria: Prop Feeder, Regional Jet, Freighter, Widebody data entries (purchase price, monthly/annual lease rate, fare/day/cargo personal-travel bonuses) match §16's table exactly, with the doc's clarification that "annual" = one 90-day game year, not a calendar year, encoded as a named constant (reused by tax/CA/warehouse/hotel year-end cadence — ideally the same `YEAR_LENGTH_DAYS = 90` constant is reused everywhere, not redefined here).
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T060 — Aviation plane purchase**
  - Doc references: §16 (Purchase — Medium+ bank city, no fleet cap), §9
  - Dependencies: T059, T005
  - File path hints: `/src/engine/aviation.ts`
  - Acceptance criteria: `buyPlane(state, cityId, class)` only succeeds at Medium+ bank cities (Port Vela/Ironvale/Silkden in v1 — note in a comment that Large/Huge-tier cities are unreachable in v1 per §13, same pattern as T031's CA gating) and only if cash covers the price; no cap on fleet size beyond cash. Unit test covers a rejected purchase in a Small-bank city and a successful purchase in a Medium one.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T061 — Plane status management (Idle/Leased Monthly/Leased Annual/Personal) + income accrual**
  - Doc references: §16 (per-plane status table)
  - Dependencies: T060, T015
  - File path hints: `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: `setPlaneStatus(state, planeId, status)` and a daily-tick hook (from `advanceDay`) credit income correctly per status: Leased Monthly = price×monthlyRate÷30 per day; Leased Annual = price×annualRate÷90 per day for a firm 90-day term; Idle and Personal earn $0. Unit tests cover each status's daily income calculation matching the doc's per-day division rules exactly.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T062 — Lease cancellation (Monthly, 3-day notice) and early-termination penalty (Annual)**
  - Doc references: §16 (cancellation/termination rules)
  - Dependencies: T061
  - File path hints: `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: `cancelMonthlyLease(state, planeId)` stops income after a 3-day notice period elapses (not instantly). `terminateAnnualLease(state, planeId)` charges the lessee 50% of the term's remaining revenue immediately and forfeits the rest to the lessor (i.e. the player, as owner, either pays or receives depending on which side is modeled — clarify in implementation that the player is always the lessor in this game, so early termination initiated by the "lessee" is an event/mechanic the player can trigger to exit a bad commitment, paying the 50% penalty themselves; document this interpretation clearly since §16 doesn't specify who initiates it). Unit tests cover both cancellation paths' payout math.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T063 — Personal-use travel bonus integration**
  - Doc references: §16 (Personal use), §4 (fare/day/cargo formula it modifies)
  - Dependencies: T061, T013
  - File path hints: `/src/engine/actions/travel.ts` (extend), `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: When a plane is set to Personal-use status, the next `travel()` call (T013) applies that plane's fare reduction, travel-days reduction (min 1 day), and cargo-capacity bonus exactly per §16's per-class table, then the bonus is consumed (single-use per the doc's "applies... to your next Travel action"). Unit test confirms a Regional Jet trip both reduces fare by 35% and shaves 1 day off a >1-day trip, and does not apply to the following travel action.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T064 — Plane maintenance/insurance billing + depreciation & resale**
  - Doc references: §16 (Carrying cost, Depreciation & resale)
  - Dependencies: T060, T030
  - File path hints: `/src/engine/aviation.ts` (extend), `/src/engine/tax.ts` (extend `runYearEnd`)
  - Acceptance criteria: `runYearEnd` bills 0.3%/month × purchase price maintenance for every owned plane (leased or idle) alongside tax/CA/warehouse/hotel billing. Plane net-worth/sale value starts at 90% of purchase price, depreciates 2%/game-year, floored at 40% of purchase price. `sellPlane(state, planeId)` pays current depreciated value minus a 10% liquidation fee. Unit tests cover multi-year depreciation reaching the floor, and the sale payout formula.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T065 — Aviation events (Fuel spike surcharge, safety incident grounding)**
  - Doc references: §16 (Events table extension), §7, §5 (existing Fuel commodity event)
  - Dependencies: T016, T017, T061
  - File path hints: `/src/engine/events/eventTable.ts` (extend), `/src/engine/aviation.ts` (extend)
  - Acceptance criteria: The existing Fuel price-spike event (already present from T016's base table) is extended so that, when active, all plane maintenance is also raised +30% for the event's 5–8 day duration. A new "Aviation safety incident" event type grounds one random leased plane for 5–10 days (income paused, maintenance still owed during grounding). Unit tests cover both effects independently.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T066 — UI Screen 11: Aviation/Fleet screen**
  - Doc references: §12 (screen 11)
  - Dependencies: T035, T060, T061, T062, T063, T064, T065
  - File path hints: `/src/ui/screens/AviationScreen.tsx`
  - Acceptance criteria: Lists owned planes, each with a status toggle (Idle/Leased Monthly/Leased Annual/Personal use) wired to T061/T062, and running income/maintenance totals per plane and fleet-wide.
  - Mobile/desktop note: Primary target mobile-portrait 360×740; desktop secondary fallback only.

---

## Phase 13 — Final Balance Pass (Phase 2 Included)

- [ ] **T067 — Extend bots to optionally use Phase 2 wealth systems**
  - Doc references: §11 (bots), §14, §15, §16
  - Dependencies: T025, T026, T027, T048, T054, T061, T062, T063
  - File path hints: `/src/engine/bots/newsBot.ts` (extend, primary candidate for using these systems since it's the most sophisticated bot; document if greedy/random are left unchanged), `/src/engine/harness/botHarness.ts` (extend to record Phase 2 asset holdings in stats)
  - Acceptance criteria: At least one bot strategy (news-follower recommended) is extended to opportunistically build warehouses, buy hotels, and buy/lease planes when cash allows, so the harness can measure Phase 2's effect on net worth growth. Harness output now reports Phase 2 asset value as a stat alongside net worth.
  - Mobile/desktop note: N/A — engine only, no UI.

- [ ] **T068 — Re-run §11 bot harness with §14–§16 included; re-tune Phase 2 ⚙ numbers**
  - Doc references: §17 (build step 13), §11
  - Dependencies: T067, T028, T045
  - File path hints: `/src/engine/config.ts` (edits only, Phase 2 sections), `/src/engine/harness/baseline.v2.json` (or similar new snapshot)
  - Acceptance criteria: Run the full-spec harness again with Phase 2 systems active. Confirm the original day-10/30/90 targets (T029's baseline) still hold — Phase 2 income must not be assumed by or silently inflate those numbers, per §13's explicit warning. Iteratively tune Warehouse/Hotel/Aviation ⚙ constants (still only editing `config.ts`) so that no strategy exceeds 3× targets and Phase 2 assets meaningfully move net worth without being a dominant no-brainer over pure trading. Persist the new snapshot and document the diff from T045's baseline in the commit message. This is the final gate before Phase 2 ships.
  - Mobile/desktop note: N/A — engine/tooling only, no UI.
