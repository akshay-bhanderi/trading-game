# TRADE WINDS OF SELVARA — Game Design Document v1.0

> Single source of truth for development. Every system, formula, and number lives here.
> If code and this doc disagree, fix one of them — never let them drift apart.
> Tunable numbers are marked ⚙ — they live in one config file, never hardcoded.

---

## 1. Game Identity

- **Working title:** Trade Winds of Selvara (rename freely later)
- **Genre:** Turn-based commodity trading RPG, pixel-art style
- **Pitch:** You are a small trader in the fictional continent of Selvara. Buy low in one city, travel, sell high in another. Read the newspapers, predict crashes and booms, borrow from banks, dodge the taxman with a good CA, and build a fortune. Endless play — your score is your peak net worth.
- **Platform:** Mobile-portrait web app first (360×740 design target). Wrap with Capacitor later.
- **Session length target:** 5–15 minutes per sitting; progress saved locally, resume anytime.
- **Currency:** Dollar, symbol **$**
- **Save:** localStorage, single save slot + local high-score table (top 10 runs: peak net worth, days survived, difficulty).
- **End condition:** Endless. Run ends only on bankruptcy (see §9). Score = **peak net worth ever reached** during the run.

---

## 2. Core Loop (one turn = one day)

Each day the player is in exactly one city and may, in any order:

1. **Read** today's newspaper (free) and optionally buy insider info (§7).
2. **Trade** at the city market — buy/sell any unlocked commodity, limited by cash and cargo capacity.
3. **Bank** — deposit, withdraw, take/repay loans (if the city has a bank).
4. Then choose ONE to end the day:
   - **Travel** to another city (costs money + 1–3 days, §4), or
   - **Stay** the night — hotel cost charged per city tier (§4).

While traveling multiple days, the player still receives newspapers each morning but cannot trade.

**Cargo capacity:** starts at 40 units. Upgradable: 100 units ($2,500), 250 ($12,000), 600 ($60,000), 1,500 ($300,000). ⚙
**Cargo unit model:** 1 cargo slot = 1 unit of ANY commodity, regardless of type. No weight/bulk mechanic — a unit of Grain and a unit of Electronics each cost 1 slot; the strategic tradeoff comes purely from each commodity's own base price (§5), not from bulk.
**Warehouse storage** (§14) is a separate, per-city system: goods stored there don't count against cargo capacity and don't travel with you when you leave — see §14 for how it differs from what you carry.

---

## 3. Difficulty Modes

| | Noob | Pro | Expert |
|---|---|---|---|
| Starting cash | $2,000 | $1,000 | $500 |
| Starting city | Farrow | Farrow | Copperfell |
| Rumor accuracy bonus | +15% | — | −10% |
| First tax year | waived | normal | normal |
| Price volatility multiplier | 0.8× | 1.0× | 1.3× |
| Loan interest multiplier | 0.8× | 1.0× | 1.25× |
| Score multiplier | 0.75× | 1.0× | 1.5× |

⚙ All values in config. High-score table records difficulty; score multiplier applies to leaderboard score only.

---

## 4. World — 15 Cities in 4 Unlock Tiers (Tier 1+2 / 8 cities in v1)

Cities unlock by **net worth** (cash + deposits + goods at last-known prices − debt). A newspaper headline announces each unlock ("Trade routes to Port Vela now open to licensed merchants!").

City count is config-driven: each city is a data object; removing one from the config removes it from the game cleanly. **Decision: v1 ships with only Tier 1+2 (8 cities: Farrow, Saltmere, Copperfell, Millbrook, Port Vela, Ironvale, Silkden, Greyharbor). Tier 3 and Tier 4 (7 cities) are defined below for design completeness and config compatibility, but are OUT of v1 scope — see §13.** Since city unlock is net-worth-gated, capping at Tier 2 also caps v1's addressable net-worth range at roughly the §11 day-90 target; the $2,000,000 and $250,000 unlock thresholds simply go unused until Tier 3/4 ship.

### Tier 1 — available from start (net worth $0)
| City | Character | Bank size | Hotel/night | Produces (cheap) | Wants (dear) |
|---|---|---|---|---|---|
| **Farrow** | Farming town | Small | $15 | Grain, Cotton | Iron, Salt |
| **Saltmere** | Fishing/salt port | Small | $20 | Salt, Spices | Grain, Textiles |
| **Copperfell** | Mining town | Small | $18 | Iron | Grain, Cotton |
| **Millbrook** | Textile mills | Small | $22 | Textiles | Cotton, Iron |

### Tier 2 — unlock at net worth **$25,000** ⚙
| City | Character | Bank size | Hotel | Produces | Wants |
|---|---|---|---|---|---|
| **Port Vela** | Big trading port, volatile | Medium | $45 | Spices, Silk (imports) | everything, swingy |
| **Ironvale** | Steel city | Medium | $40 | Steel | Iron, Fuel |
| **Silkden** | Luxury bazaar | Medium | $60 | — | Silk, Spices |
| **Greyharbor** | Grey-market port | Small | $30 | random cheap lots | high spreads, risky |

### Tier 3 — unlock at net worth **$250,000** ⚙
| City | Character | Bank size | Hotel | Produces | Wants |
|---|---|---|---|---|---|
| **Auren City** | Capital. Huge bank, best loans | Huge | $120 | — | Electronics, Silk, Steel |
| **Voltspire** | Tech city | Large | $90 | Electronics | Rare Metals, Steel |
| **Duskfield** | Oil fields | Medium | $50 | Fuel | Steel, Electronics |
| **Kessler Mines** | Deep mining colony | Small | $70 | Rare Metals | Fuel, Grain (remote, pricey food) |

### Tier 4 — unlock at net worth **$2,000,000** ⚙
| City | Character | Bank size | Hotel | Special |
|---|---|---|---|---|
| **Novara Heights** | Financial district | Huge | $200 | Best deposit rates; insider-info hub (cheapest, most accurate) |
| **Frosthelm** | Frozen far north | Small | $150 | Rare Metals at extreme discount; travel there costs 3 days + high fare; brutal spreads |
| **The Freeport** | Island tax haven | Large | $180 | Profit realized while based here during year-end taxed at 12% flat (no CA needed) — but no loans offered here |

### Travel
Distance matrix (days): within same tier cluster = 1 day; adjacent tier = 2 days; Tier 1 ↔ Tier 3/4 = 3 days. Frosthelm always 3 days from anywhere except Kessler Mines (2).
Fare = $10 × days × (1 + destination tier × 0.5), doubled if carrying > 60% cargo capacity ⚙.
Exact matrix: generate a 15×15 table in config following these rules; hand-tweak later.

---

## 5. Commodities — start with 3, unlock to 10 (9 reachable in v1; Electronics is Tier 3, out of v1 scope — §13)

Unlocks are tied to city unlocks (you meet the commodity where it's traded) plus a license fee paid once at any bank.

| # | Commodity | Unlock | License | Base price $ | Volatility class | Daily drift |
|---|---|---|---|---|---|---|
| 1 | Grain | start | — | 10 | Stable | ±4% |
| 2 | Cotton | start | — | 16 | Stable | ±5% |
| 3 | Iron | start | — | 25 | Low | ±7% |
| 4 | Salt | Tier 1, day 5+ | $200 | 14 | Stable | ±4% |
| 5 | Textiles | Tier 1, day 5+ | $400 | 40 | Low | ±8% |
| 6 | Spices | Tier 2 | $1,500 | 90 | Medium | ±12% |
| 7 | Fuel | Tier 2 | $2,500 | 60 | Medium | ±14% |
| 8 | Steel | Tier 2 | $4,000 | 120 | Medium | ±12% |
| 9 | Silk | Tier 2 | $10,000 | 300 | High | ±18% |
| 10 | Electronics | Tier 3 | $25,000 | 800 | High | ±22% |
| — | **Rare Metals** | Tier 3 (Kessler) | $60,000 | 2,500 | Extreme | ±30% |

Silk's unlock tier was moved from Tier 3 to Tier 2 to match Port Vela and Silkden, both Tier 2 cities that produce/want it — see §4. Electronics and Rare Metals remain Tier 3 and are OUT of v1 scope (§13) along with all Tier 3/4 cities.

Rare Metals is one commodity in v1 scope for later (Tier 3). **v2 idea (do NOT build in v1):** split into periodic-table variants (Lithium, Cobalt, Platinum, Iridium) as sub-lots.

---

## 6. Price Engine

Prices are per-city, per-commodity, recomputed at the start of every day.

```
price(city, good, day) =
    basePrice(good)
  × cityModifier(city, good)        // producer 0.65–0.8, neutral 0.9–1.1, consumer 1.2–1.6
  × trend(good, day)                // slow global sine/random-walk, period 20–40 days, amplitude ±15%
  × dailyNoise                      // uniform within the good's volatility class
  × eventMultiplier(city, good, day) // from active events, see §7
  × meanReversion                   // if price > 2.2× or < 0.45× base×cityMod, pull 10%/day back ⚙
```

- Hard floor 0.3× and ceiling 4× of (base × cityModifier) — no infinite spikes.
- **Information model:** the player sees live prices only in the current city. Other cities show *last-seen price + how many days old*, greyed out. Newspapers and insider info are the only remote signals. This is the heart of the game — never leak live remote prices to the UI.
- Deterministic seeded RNG per run (seed saved with the game) so bugs are reproducible.

---

## 7. Newspaper & Rumor Engine

### Event types (each defines affected good(s), city or global, multiplier, duration)
| Event | Effect example |
|---|---|
| Bumper harvest | Grain/Cotton −40% in producer cities, 4–6 days |
| Drought / crop failure | Grain +60–120%, regional |
| Mine collapse | Iron/Rare Metals +50–150% at source city |
| Workers' strike | Producer city output halts: its good +30% everywhere else |
| War scare (regional) | Steel/Fuel +40–80%; Silk/luxury −20% |
| Tech breakthrough | Electronics −35% globally over 5 days |
| New deposit discovered | Rare Metals −50% for 8 days |
| Ship sinking / route closed | Import goods +25–60% at affected port |
| Festival season | Luxury (Silk, Spices) +30% in one city, 3 days |
| Government tariff/policy | One good ±20–40% in one tier of cities, 10 days |
| Epidemic | City demand drops: all goods −15% there; hotel closed |

### Pipeline (how rumors work)
1. Engine schedules an event **2–4 days in the future**.
2. Each morning's paper carries 2–4 items: scheduled-event rumors, filler news, and deliberate false rumors.
3. Every rumor has a **hidden truth flag** and a **visible source style** ("Reuters-like wire" vs "bazaar gossip column") — wire is right ~80%, gossip ~50% ⚙.
4. When the event date arrives, the event either **fires** (prices move per table) or **fizzles**.
5. **The next day's paper always runs a resolution story explaining WHY**: "Spice prices soared as the drought proved real" / "Panic unfounded — the 'mine collapse' was a minor tunnel closure; iron prices ease." This teaches the player to read sources. Non-negotiable feature.

### Fog of wealth
As net worth grows, public papers get vaguer ⚙:
- < $50k: rumors name the exact city and good.
- $50k–500k: rumors name the good but only the region ("northern mining towns").
- > $500k: rumors are directional only ("industrial metals face turbulence").

### Insider information
- Available in Medium+ bank cities via an **Informant** contact; best (cheapest per accuracy) in Novara Heights.
- A tip = exact city, good, direction, and day. **70% accurate** ⚙ (75% in Novara).
- Price scales with net worth: `max($500, 1% of net worth)` per tip ⚙.
- Resolution stories also cover insider tips ("your informant's warehouse-fire tip proved false — the fire was staged").

---

## 8. Hidden Trader Rank (never shown to player)

Rank 1–10, recomputed weekly (every 7 days):

```
score = 0.5 × log10(netWorth + 1)
      + 0.3 × log10(cumulativeTradeVolume + 1)
      + 1.5 × repaymentRecord        // +0.1 per loan fully repaid on time, −0.5 per default event, clamp [−2, +2]
      + 0.2 × log10(daysSurvived + 1)
rank = clamp(floor(score), 1, 10)
```
⚙ weights in config. The player only *feels* rank through loan offers and bankers' dialogue tone ("The manager greets you by name now…"). Never render a rank number.

---

## 9. Banking

### Loans (city bank size × trader rank)
Max principal = `baseCap(bankSize) × rankFactor(rank)`
- baseCap: Small $1,000 · Medium $10,000 · Large $50,000 · Huge $250,000 ⚙
- rankFactor: rank 1 = 1×, each rank ×1.8 (rank 10 ≈ 198×) ⚙
- Interest: Small 0.9%/day · Medium 0.7% · Large 0.55% · Huge 0.4% ⚙ (× difficulty multiplier). Simple daily interest added to balance.
- One active loan per bank; up to 3 banks concurrently.
- Collateral note: goods aren't locked, but total debt feeds default checks below.

### Deposits
- Any bank, no cap, from day 1. Interest compounds daily: Small 0.10%/day · Medium 0.14% · Large 0.18% · Huge/Novara 0.25% ⚙.
- Money deposited is safe from all events. Withdrag anywhere the same chain… **simplification for v1: one global bank account per bank-size class is too complex — instead, deposits/loans live at the specific city's bank; you must be in that city to transact with it.** (This creates real routing decisions.)

### Default — player's choice
Trigger: a loan is 15 days past its 60-day term, OR total debt > 2× net worth for 7 straight days ⚙. The bank confronts the player with three options (player picks — per design decision):
1. **Surrender assets:** bank seizes deposits + cargo at 70% value until debt cleared; run continues; repaymentRecord −0.5.
2. **Restructure (debt pressure):** debt refinanced at 2× interest + $ p.d. collector fee = 0.5% of debt; if debt still > 2× net worth after 15 more days → forced game over; repaymentRecord −0.3.
3. **Declare bankruptcy:** run ends now; score = peak net worth reached (a dignified exit).

---

## 10. Tax & CA System

- **1 game year = 90 days** (keeps the yearly loop alive in an endless game). Year-end statement appears on days 90, 180, 270…
- Taxable base = **realized profit** for the year (sum of sell proceeds − matched buy costs, FIFO) + deposit interest earned. Unrealized cargo gains untaxed.
- **No CA: 30% of taxable profit.** ⚙
- Tax is auto-deducted at year end; if cash + deposits can't cover it, the shortfall becomes a forced Huge-bank loan at penalty rate 1.2%/day.

### CA tiers (hire for the year, fee due on hiring, effective that fiscal year)
| Tier | Annual fee | Tax rate on profit | Profit cap at this rate | Above cap |
|---|---|---|---|---|
| — none — | $0 | 30% | — | — |
| Junior CA | $25,000 | 20% | $1,000,000 | 30% |
| Senior CA | $100,000 | 12% | $5,000,000 | 30% |
| Elite Firm | $500,000 | 8% | $25,000,000 | 30% |
⚙ all values. Hiring available at Medium+ bank cities. The Freeport (§4) is the endgame alternative: be physically there at year-end → flat 12%, no CA, no cap — but you sacrifice being elsewhere and it has no loans.

---

## 11. Balance Targets (tune everything toward these)

A competent Pro-mode player, no save-scumming:
| Day | Net worth target |
|---|---|
| 10 | $4,000–6,000 |
| 30 | $30,000–60,000 (Tier 2 open) |
| 90 (year 1) | $200,000–400,000 |
| 180 | $1.5M–3M (Tier 4 opening) |
| 360 | $10M–30M |

**Balance test harness (build this before the UI):** three scripted bots — (a) random trader, (b) greedy spread-chaser ignoring news, (c) news-follower using rumors + loans. Run 1,000 seeded games each, 360 days. Health checks:
- Random bot should hover near broke (median < $10k at day 90).
- Greedy bot ≈ 0.5× targets. News bot ≈ targets.
- No strategy should exceed 3× targets → if it does, find and nerf the exploit (usually loan stacking or an event multiplier).
- Bankruptcy rate on Expert ≈ 25–40% by day 90.

---

## 12. UI Screens (mobile portrait, pixel style)

**UI model (superseded from the original flat screen-router):** a persistent pixel-art scene, not a stack of full-page screens. The player's current city/building is always visible; screens 3–8 below render as popups/panels over that scene instead of full-page navigation swaps. Only the Title screen (1) is a true standalone screen, shown before a scene exists. A first implementation pass built screens 1–4/6 as a flat CSS-pixel-bordered screen-router (chunky borders, pixel font, no persistent scene) — that pass is superseded by this direction; do not extend that pattern to new screens.

1. **Title / difficulty select / continue**
2. **Persistent scene (hub, replaces the old flat "City screen"):** full-screen pixelated background, per city. A pixel-art businessman character stands/animates inside the player's current room (see **Rooms & character** below). HUD is overlaid on the scene, not a separate screen: top-left = city name, top-right = cash balance + owned commodities, bottom-left = bank icon (opens the Bank popup), bottom-right = market icon (opens the Market popup as a list). Newspaper/Travel/Stay/Informant are reached from this same persistent HUD (exact icon/menu placement TBD at implementation time).
3. **Market:** commodity list — price, owned qty, avg buy cost, buy/sell steppers (+1/+10/+max).
4. **Newspaper:** full-screen paper, 2–4 stories with source styling; yesterday's resolution stories at top.
5. **Bank:** deposits, loan offer/repay, CA hiring (in season), account book.
6. **Travel map:** unlocked cities, fare + days per destination, last-seen prices tooltip per city.
7. **Year-end tax statement:** profit breakdown, CA effect, tax paid.
8. **Game over / score screen:** peak net worth, days, graph of net worth over time, local high-score table.
9. **Warehouse screen** (§14): vertical building elevation, one row per floor, each floor its own fill/empty capacity bar stacked into one building-height meter; buy-next-floor button inline.
10. **Real Estate / Hotels screen** (§15): list of owned hotels by city with tier, daily revenue, and an upgrade button; "buy hotel here" available from the hub scene when not yet owned.
11. **Aviation / Fleet screen** (§16): list of owned planes, each with a status toggle (Idle / Leased Monthly / Leased Annual / Personal use) and running income/maintenance totals.

**Rooms & character:** the player starts in one room. As they grow, additional rooms are added, stacked vertically on top of each other — a building growing floor by floor. Room 1 (the starting room) displays the game's own name/brand as in-scene signage. Growth trigger (net worth threshold, warehouse floors, or something else) is not yet decided.

**Open design question — reconcile before implementing either:** this room-growth mechanic and §14's Warehouse floor-elevation visual are two building-cross-section systems specified somewhat independently. Decide whether they're the same building, two separate buildings, or whether §14's visual is retired in favor of this one.

**Implementation approach:** the scene (background, rooms, character) renders on a `<canvas>` via a lightweight 2D engine — **PixiJS**, chosen over Phaser/Kaboom since nothing here needs physics or platforming, just layered sprite animation. React continues to own the HUD and all popups/panels drawn on top of the canvas; this is not a rewrite away from React, only the scene layer moves to canvas.

**Character asset:** [CraftPix "Free City Trader Character"](https://free-game-assets.itch.io/free-city-trader-character-sprite-sheets-pixel-art/purchase) pixel sprite pack — three city-merchant characters, idle/dialogue/movement animations, PNG+PSD. License confirmed: free for unlimited personal/commercial use, no royalties, no attribution required; only restriction is no reselling/redistributing the raw files as a standalone pack.

**Background/room art:** not yet sourced. Later pass — candidates are a CC0 pack or AI-generated art, same sourcing plan as the rest of this section's placeholder-art fallback.

Non-hub popups (Market/Bank/Newspaper/etc.) may still ship with simple placeholder art initially. Pixel assets beyond the character are a later pass: Kenney.nl packs + AI-generated icons.

---

## 13. v1 Scope Fence

**IN:** everything above except—
**OUT (v2+):** Tier 3 and Tier 4 cities (Auren City, Voltspire, Duskfield, Kessler Mines, Novara Heights, Frosthelm, The Freeport) and their unlocks; Electronics and Rare Metals commodities; online leaderboard, Rare Metal sub-variants, travel ambush/storm events, multiple save slots, achievements, sound/music, hired traders/automation, Greyharbor smuggling mini-mechanic (v1: it's just a normal city with wider spreads).

With Tier 3/4 out, v1's world is 8 cities (§4) and 9 commodities (§5, all but Electronics), and the CA/tax system (§10) and hidden rank (§8) still apply in full since they aren't tier-gated. The §11 day-180/360 targets assume the full 15-city game and are aspirational for v2; v1 balancing should focus on the day-10/30/90 targets, which fit entirely within Tier 1+2.

**Phase 2 — Wealth Systems (§14–§16):** Warehouse storage, Hotel ownership, and Aviation leasing are now fully specified (this was "warehouse storage per city," previously listed as a vague OUT item — it's designed in full below, just sequenced after the core loop). Build them only after the v1 core loop ships and clears the §11 bot-harness balance pass; they are new sources of net worth and must be balance-tested on their own before release, per §17's build order. None of the §11 targets above assume their income.

---

## 14. Warehouse Storage (per-city, floor-based)

A second, separate capacity system from Cargo (§2). Cargo is what you *carry* while traveling; a Warehouse is a building you *own in one specific city* — goods stored there don't count against cargo capacity and don't move with you, but (same rule as §6) you can only buy/sell them while physically in that city. No remote trading, ever.

**Ownership:** one warehouse per city, buildable in any city you've unlocked. You can own warehouses in several cities at once — a distributed storage network, letting you stockpile a producer city's cheap goods beyond what you can carry, without committing cargo space to them while you go sell elsewhere.

**Floors:** up to 6 per warehouse, built in order (can't skip ahead). Floor 1 is the base purchase; floors 2–6 add capacity at rising cost and rising upkeep:

| Floor | Capacity added | Cumulative capacity | Build cost | Annual maintenance ⚙ |
|---|---|---|---|---|
| 1 (Ground) — base purchase | 150 | 150 | $3,000 | $150/yr |
| 2 | +250 | 400 | $8,000 | $300/yr |
| 3 | +400 | 800 | $20,000 | $600/yr |
| 4 | +650 | 1,450 | $50,000 | $1,200/yr |
| 5 | +1,000 | 2,450 | $120,000 | $2,500/yr |
| 6 (Penthouse) | +1,600 | 4,050 | $300,000 | $5,000/yr |

- Maintenance across every owned warehouse/floor bills at year-end alongside tax (§10); unpaid maintenance accrues as Small-bank-rate debt against the player, same as an unpaid tax shortfall.
- Stored goods count toward net worth (§4) at last-known local price, exactly like carried cargo.
- **Graphic (§12 screen 9):** a vertical building elevation, one row per floor — lit/filled = built, dim outline = not yet built and purchasable inline. Each built floor is its own mini used/free capacity bar; stacked, they read as one building-height meter. Same bar-fill visual language as the Market screen's cargo bar, for consistency.
- **Risk:** extend §7's event table with **Warehouse fire** — low-probability, destroys 10–40% of one city's stored goods ⚙. Optional **insurance** (2%/year of stored goods' value, billed with maintenance) caps fire loss at 10%.
- **Sell-back:** the whole warehouse (all floors) liquidates for 50% of total build cost.

---

## 15. Hotel Ownership (city-wise real estate)

Distinct from the flat **Stay** cost already in §4's "Hotel/night" column — that's what a non-owner pays as a guest. Buying a hotel makes you the owner of that city's lodging business instead.

**Ownership:** one hotel per city, in any unlocked city. Own hotels in as many cities as you want — a hospitality portfolio, not a single building.

Cost and revenue scale off each city's *existing* nightly rate (§4) rather than a new hardcoded per-city table, keeping the system config-driven like the rest of the doc — pricier cities (higher nightly rate) mean pricier hotels with proportionally bigger yield.

| Tier | Name | Build/upgrade cost (× city nightly rate) | Passive revenue (× nightly rate /day) | Annual license fee (× nightly rate /yr) |
|---|---|---|---|---|
| 1 | Inn | 500× | 0.8× | 20× |
| 2 | Lodge | +1,200× | 1.8× | 45× |
| 3 | Grand Hotel | +3,000× | 3.6× | 100× |
| 4 | Resort | +7,500× | 7.0× | 220× |

⚙ all multipliers. Upgrade cost is the marginal amount on top of the previous tier (Lodge's "+1,200×" is paid on top of what Inn already cost). Example — Silkden at $60/night: Tier 1 Inn costs $30,000, earns $48/day (~$4,320 per 90-day game year), annual license $1,200/yr.

- **Free stays:** while you own a city's hotel, the Stay action (§2/§4) there costs you $0.
- **Passive revenue accrues daily**, whether you're in that city or not, riding the same daily tick that already delivers newspapers while you travel (§2) — no extra turn cost, and it keeps earning while you're on the road or trading elsewhere.
- **Epidemic** events (§7 already specifies "hotel closed") pause an owned hotel's revenue for the event's duration in that city — reuses the existing effect, no new event type needed.
- **Sell-back:** 50% of total invested (build + all upgrades), matching the Warehouse salvage rate (§14).
- Annual license fee bills at the same year-end cadence as CA fees and warehouse maintenance (§10).

---

## 16. Aviation — Plane Ownership & Leasing

A third asset class: buy planes, then either lease them out for passive income or fly them yourself. Loosely modeled on real aircraft leasing, where lessors earn a monthly "lease rate factor" of roughly 0.6–1.2% of hull value, and longer commitments pay a lower per-month rate in exchange for guaranteed income.

**Purchase:** available at any Medium+ bank city (§9), reflecting the financing an aircraft purchase needs. No fleet-size cap beyond cash on hand.

| Class | Purchase price | Monthly lease rate (× price) | Annual lease rate\* (× price) | Personal-travel benefit |
|---|---|---|---|---|
| Prop Feeder | $150,000 | 1.0%/mo | 10%/yr | Fare −20% |
| Regional Jet | $600,000 | 0.9%/mo | 9%/yr | Fare −35%, travel days −1 (min 1) |
| Freighter | $1,200,000 | 1.1%/mo | 10.5%/yr | Fare −25%, +50% effective cargo capacity while flying |
| Widebody | $4,000,000 | 0.8%/mo | 8%/yr | Fare −50%, travel days −1 (min 1), +25% cargo |

\* "Annual" here means one 90-day game year (§10's tax-year length), not a real calendar year — every recurring system in the game runs on that same clock.

**Per plane, the owner picks a status:**
- **Idle** — earns nothing; still owes maintenance (below). A pure drain — don't leave a plane idle.
- **Leased Monthly** — revenue = price × monthly rate, credited daily (rate ÷ 30/day). Cancellable anytime with 3 days' notice, at which point income stops. Highest rate, zero commitment.
- **Leased Annual** — revenue = price × annual rate, credited daily (rate ÷ 90/day) for a firm 90-day term. Neither side can cancel early without penalty: the lessee must pay 50% of the term's remaining revenue immediately, and the lessor forfeits the rest. Lower rate than 12 months of Monthly, but guaranteed.
- **Personal use** — no lease income; applies that plane's fare/day/cargo bonus to your next Travel action instead.

**Carrying cost:** every owned plane — leased or not — owes maintenance/insurance of 0.3%/month of purchase price ⚙, billed at year-end alongside tax, CA fee, warehouse maintenance, and hotel license (§10).

**Depreciation & resale:** a plane's value for net worth (§4) and for sale starts at 90% of purchase price and depreciates 2%/game-year ⚙, floored at 40% of purchase price. Selling pays out current depreciated value minus a 10% liquidation fee.

**Events** — extend §7's table:
| Event | Effect |
|---|---|
| Fuel price spike | (existing Fuel-commodity event, §5) also raises all plane maintenance +30% for 5–8 days |
| Aviation safety incident | One random leased plane grounded 5–10 days — income paused, maintenance still owed |

---

## 17. Tech & Handoff Notes for Claude Code

- **Stack:** Vite + React + TypeScript. Zustand (or plain reducer) for game state. No backend. localStorage persistence with schema version number for migrations.
- **Architecture rule #1:** `/src/engine` is pure TypeScript with ZERO React imports — cities, prices, events, bank, tax, rank, RNG. `/src/ui` renders state and dispatches actions. The engine must run headless in Node for the §11 bot harness.
- **Config rule:** every ⚙ number lives in `/src/engine/config.ts`. Balancing = editing one file.
- **Build order:**
  1. `config.ts` + types (City, Good, Event, GameState)
  2. Price engine + seeded RNG + unit tests (mean reversion, floors/ceilings)
  3. Turn loop: travel/stay/trade actions, headless
  4. Event + newspaper engine (incl. resolution stories)
  5. Bot harness → first balance pass
  6. Bank, rank, default flows
  7. Tax + CA year-end
  8. UI screens 1–8 with placeholder art
  9. Playtest build → deploy to Vercel/Netlify (v1 core loop ships here)
  10. Re-run the §11 bot harness against v1 as a locked baseline, then build Warehouse storage (§14)
  11. Hotel ownership (§15)
  12. Aviation leasing (§16)
  13. Re-run the §11 bot harness with §14–§16 included and re-tune their ⚙ numbers before shipping — these are net new sources of net worth and must not be assumed by the original day-10/30/90 targets
- **First prompt to Claude Code:** *"Read trade-winds-design-doc.md fully. Scaffold the Vite+React+TS project with the /src/engine and /src/ui split described in §17. Then implement §5–§6 (commodities, price engine) with config.ts and unit tests. Do not build any UI yet."*
- Keep this doc in the repo root. When a design decision changes during development, update the doc in the same commit.
