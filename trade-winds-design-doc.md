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
- **Currency:** Denari, symbol **Ð**
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

**Cargo capacity:** starts at 40 units. Upgradable: 100 units (Ð2,500), 250 (Ð12,000), 600 (Ð60,000), 1,500 (Ð300,000). ⚙

---

## 3. Difficulty Modes

| | Noob | Pro | Expert |
|---|---|---|---|
| Starting cash | Ð2,000 | Ð1,000 | Ð500 |
| Starting city | Farrow | Farrow | Copperfell |
| Rumor accuracy bonus | +15% | — | −10% |
| First tax year | waived | normal | normal |
| Price volatility multiplier | 0.8× | 1.0× | 1.3× |
| Loan interest multiplier | 0.8× | 1.0× | 1.25× |
| Score multiplier | 0.75× | 1.0× | 1.5× |

⚙ All values in config. High-score table records difficulty; score multiplier applies to leaderboard score only.

---

## 4. World — 15 Cities in 4 Unlock Tiers

Cities unlock by **net worth** (cash + deposits + goods at last-known prices − debt). A newspaper headline announces each unlock ("Trade routes to Port Vela now open to licensed merchants!").

City count is config-driven: each city is a data object; removing one from the config removes it from the game cleanly. **v1 may ship with only Tier 1+2 (8 cities) if 15 feels heavy — the design supports both.**

### Tier 1 — available from start (net worth Ð0)
| City | Character | Bank size | Hotel/night | Produces (cheap) | Wants (dear) |
|---|---|---|---|---|---|
| **Farrow** | Farming town | Small | Ð15 | Grain, Cotton | Iron, Salt |
| **Saltmere** | Fishing/salt port | Small | Ð20 | Salt, Spices | Grain, Textiles |
| **Copperfell** | Mining town | Small | Ð18 | Iron | Grain, Cotton |
| **Millbrook** | Textile mills | Small | Ð22 | Textiles | Cotton, Iron |

### Tier 2 — unlock at net worth **Ð25,000** ⚙
| City | Character | Bank size | Hotel | Produces | Wants |
|---|---|---|---|---|---|
| **Port Vela** | Big trading port, volatile | Medium | Ð45 | Spices, Silk (imports) | everything, swingy |
| **Ironvale** | Steel city | Medium | Ð40 | Steel | Iron, Fuel |
| **Silkden** | Luxury bazaar | Medium | Ð60 | — | Silk, Spices, Electronics |
| **Greyharbor** | Grey-market port | Small | Ð30 | random cheap lots | high spreads, risky |

### Tier 3 — unlock at net worth **Ð250,000** ⚙
| City | Character | Bank size | Hotel | Produces | Wants |
|---|---|---|---|---|---|
| **Auren City** | Capital. Huge bank, best loans | Huge | Ð120 | — | Electronics, Silk, Steel |
| **Voltspire** | Tech city | Large | Ð90 | Electronics | Rare Metals, Steel |
| **Duskfield** | Oil fields | Medium | Ð50 | Fuel | Steel, Electronics |
| **Kessler Mines** | Deep mining colony | Small | Ð70 | Rare Metals | Fuel, Grain (remote, pricey food) |

### Tier 4 — unlock at net worth **Ð2,000,000** ⚙
| City | Character | Bank size | Hotel | Special |
|---|---|---|---|---|
| **Novara Heights** | Financial district | Huge | Ð200 | Best deposit rates; insider-info hub (cheapest, most accurate) |
| **Frosthelm** | Frozen far north | Small | Ð150 | Rare Metals at extreme discount; travel there costs 3 days + high fare; brutal spreads |
| **The Freeport** | Island tax haven | Large | Ð180 | Profit realized while based here during year-end taxed at 12% flat (no CA needed) — but no loans offered here |

### Travel
Distance matrix (days): within same tier cluster = 1 day; adjacent tier = 2 days; Tier 1 ↔ Tier 3/4 = 3 days. Frosthelm always 3 days from anywhere except Kessler Mines (2).
Fare = Ð10 × days × (1 + destination tier × 0.5), doubled if carrying > 60% cargo capacity ⚙.
Exact matrix: generate a 15×15 table in config following these rules; hand-tweak later.

---

## 5. Commodities — start with 3, unlock to 10

Unlocks are tied to city unlocks (you meet the commodity where it's traded) plus a license fee paid once at any bank.

| # | Commodity | Unlock | License | Base price Ð | Volatility class | Daily drift |
|---|---|---|---|---|---|---|
| 1 | Grain | start | — | 10 | Stable | ±4% |
| 2 | Cotton | start | — | 16 | Stable | ±5% |
| 3 | Iron | start | — | 25 | Low | ±7% |
| 4 | Salt | Tier 1, day 5+ | Ð200 | 14 | Stable | ±4% |
| 5 | Textiles | Tier 1, day 5+ | Ð400 | 40 | Low | ±8% |
| 6 | Spices | Tier 2 | Ð1,500 | 90 | Medium | ±12% |
| 7 | Fuel | Tier 2 | Ð2,500 | 60 | Medium | ±14% |
| 8 | Steel | Tier 2 | Ð4,000 | 120 | Medium | ±12% |
| 9 | Silk | Tier 3 | Ð10,000 | 300 | High | ±18% |
| 10 | Electronics | Tier 3 | Ð25,000 | 800 | High | ±22% |
| — | **Rare Metals** | Tier 3 (Kessler) | Ð60,000 | 2,500 | Extreme | ±30% |

Rare Metals is one commodity in v1. **v2 idea (do NOT build in v1):** split into periodic-table variants (Lithium, Cobalt, Platinum, Iridium) as sub-lots.

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
- < Ð50k: rumors name the exact city and good.
- Ð50k–500k: rumors name the good but only the region ("northern mining towns").
- > Ð500k: rumors are directional only ("industrial metals face turbulence").

### Insider information
- Available in Medium+ bank cities via an **Informant** contact; best (cheapest per accuracy) in Novara Heights.
- A tip = exact city, good, direction, and day. **70% accurate** ⚙ (75% in Novara).
- Price scales with net worth: `max(Ð500, 1% of net worth)` per tip ⚙.
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
- baseCap: Small Ð1,000 · Medium Ð10,000 · Large Ð50,000 · Huge Ð250,000 ⚙
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
2. **Restructure (debt pressure):** debt refinanced at 2× interest + Ð p.d. collector fee = 0.5% of debt; if debt still > 2× net worth after 15 more days → forced game over; repaymentRecord −0.3.
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
| — none — | Ð0 | 30% | — | — |
| Junior CA | Ð25,000 | 20% | Ð1,000,000 | 30% |
| Senior CA | Ð100,000 | 12% | Ð5,000,000 | 30% |
| Elite Firm | Ð500,000 | 8% | Ð25,000,000 | 30% |
⚙ all values. Hiring available at Medium+ bank cities. The Freeport (§4) is the endgame alternative: be physically there at year-end → flat 12%, no CA, no cap — but you sacrifice being elsewhere and it has no loans.

---

## 11. Balance Targets (tune everything toward these)

A competent Pro-mode player, no save-scumming:
| Day | Net worth target |
|---|---|
| 10 | Ð4,000–6,000 |
| 30 | Ð30,000–60,000 (Tier 2 open) |
| 90 (year 1) | Ð200,000–400,000 |
| 180 | Ð1.5M–3M (Tier 4 opening) |
| 360 | Ð10M–30M |

**Balance test harness (build this before the UI):** three scripted bots — (a) random trader, (b) greedy spread-chaser ignoring news, (c) news-follower using rumors + loans. Run 1,000 seeded games each, 360 days. Health checks:
- Random bot should hover near broke (median < Ð10k at day 90).
- Greedy bot ≈ 0.5× targets. News bot ≈ targets.
- No strategy should exceed 3× targets → if it does, find and nerf the exploit (usually loan stacking or an event multiplier).
- Bankruptcy rate on Expert ≈ 25–40% by day 90.

---

## 12. UI Screens (mobile portrait, pixel style)

1. **Title / difficulty select / continue**
2. **City screen (hub):** pixel skyline, buttons → Market, Bank, Newspaper, Travel, Stay, Informant (if available). Top bar: day, cash, cargo used, city name.
3. **Market:** commodity list — price, owned qty, avg buy cost, buy/sell steppers (+1/+10/+max).
4. **Newspaper:** full-screen paper, 2–4 stories with source styling; yesterday's resolution stories at top.
5. **Bank:** deposits, loan offer/repay, CA hiring (in season), account book.
6. **Travel map:** unlocked cities, fare + days per destination, last-seen prices tooltip per city.
7. **Year-end tax statement:** profit breakdown, CA effect, tax paid.
8. **Game over / score screen:** peak net worth, days, graph of net worth over time, local high-score table.

Placeholder art first (colored rectangles + emoji). Pixel assets are a later pass: Kenney.nl packs + AI-generated icons.

---

## 13. v1 Scope Fence

**IN:** everything above except—
**OUT (v2+):** online leaderboard, Rare Metal sub-variants, travel ambush/storm events, multiple save slots, achievements, sound/music, warehouse storage per city, hired traders/automation, Greyharbor smuggling mini-mechanic (v1: it's just a normal city with wider spreads).

---

## 14. Tech & Handoff Notes for Claude Code

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
  9. Playtest build → deploy to Vercel/Netlify
- **First prompt to Claude Code:** *"Read trade-winds-design-doc.md fully. Scaffold the Vite+React+TS project with the /src/engine and /src/ui split described in §14. Then implement §5–§6 (commodities, price engine) with config.ts and unit tests. Do not build any UI yet."*
- Keep this doc in the repo root. When a design decision changes during development, update the doc in the same commit.
