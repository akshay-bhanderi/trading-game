/**
 * City data — Trade Winds of Selvara.
 *
 * Source of truth: trade-winds-design-doc.md §4 (World — cities). Reuses
 * the existing `City`/`CityId`/`CityTier`/`BankSize` types from ./../types.ts
 * — no redefinition here.
 *
 * Good ids referenced in `produces`/`wants` below use the lowercase ids of
 * the 11 goods defined in /src/engine/data/goods.ts: 'grain', 'cotton',
 * 'iron', 'salt', 'textiles', 'spices', 'fuel', 'steel', 'silk',
 * 'electronics', 'rare-metals'.
 *
 * TIER 3/4 EXPANSION (2026-08, user-requested) — the original §13 v1 scope
 * fence excluded Auren City/Voltspire/Duskfield/Kessler Mines (Tier 3) and
 * Novara Heights/Frosthelm/The Freeport (Tier 4) entirely. That fence is
 * lifted below; all 15 cities now ship. City count stays config-driven
 * exactly as the original T005 doc comment promised: this was purely
 * "adding more `City` records to this array — no structural change
 * required" everywhere else in the engine (price engine, unlocks, events,
 * banking, informant, hotel, warehouse, aviation all derive city behavior
 * generically from `City.tier`/`produces`/`wants`/`bankSize` — verified
 * file-by-file before writing these records; see travel.ts/tax.ts/loans.ts
 * for the small number of places that genuinely needed NEW code, not just
 * new data, for Tier 3/4's special-cased mechanics).
 *
 * Tier 4's §4 table has NO "Produces"/"Wants" columns at all (unlike
 * Tier 1-3) — only City/Character/Bank size/Hotel/Special. Per-good
 * producer/consumer roles for the three Tier 4 cities below are therefore
 * an INTERPRETATION CALL, following the same precedent this file already
 * sets for Port Vela/Greyharbor's loosely-worded Tier 1/2 rows: read each
 * city's "Special" text and its stated character, and assign the goods that
 * text most directly implies, rather than leaving them faceless in the
 * price engine (an empty produces/wants pair silently makes a city
 * 'neutral' for every good, which would waste the flavor text entirely).
 */

import type { City } from '../types'

export const CITIES: City[] = [
  // ---------------------------------------------------------------------
  // Tier 1 — available from start (net worth $0)
  // ---------------------------------------------------------------------
  {
    id: 'farrow',
    name: 'Farrow',
    tier: 1,
    character: 'Farming town',
    bankSize: 'Small',
    hotelPerNight: 15,
    produces: ['grain', 'cotton'],
    wants: ['iron', 'salt'],
  },
  {
    id: 'saltmere',
    name: 'Saltmere',
    tier: 1,
    character: 'Fishing/salt port',
    bankSize: 'Small',
    hotelPerNight: 20,
    produces: ['salt', 'spices'],
    wants: ['grain', 'textiles'],
  },
  {
    id: 'copperfell',
    name: 'Copperfell',
    tier: 1,
    character: 'Mining town',
    bankSize: 'Small',
    hotelPerNight: 18,
    produces: ['iron'],
    wants: ['grain', 'cotton'],
  },
  {
    id: 'millbrook',
    name: 'Millbrook',
    tier: 1,
    character: 'Textile mills',
    bankSize: 'Small',
    hotelPerNight: 22,
    produces: ['textiles'],
    wants: ['cotton', 'iron'],
  },

  // ---------------------------------------------------------------------
  // Tier 2 — unlock at net worth $25,000 (CITY_UNLOCKS.tier2NetWorth)
  // ---------------------------------------------------------------------
  {
    id: 'port-vela',
    name: 'Port Vela',
    tier: 2,
    character: 'Big trading port, volatile',
    bankSize: 'Medium',
    hotelPerNight: 45,
    // §4 lists Spices, Silk as Port Vela's "Produces (cheap)" column, noting
    // "(imports)" — it's a trading entrepot, not a source producer, but §4's
    // table is the literal source of truth so both are kept as `produces`.
    produces: ['spices', 'silk'],
    // INTERPRETATION CALL: §4 gives Port Vela's "Wants" as the loose phrase
    // "everything, swingy" rather than an explicit good list. Since it's
    // described as a big, volatile trading port (the opposite of a
    // specialized producer town), the reasonable reading is that it has
    // meaningful consumer demand for every v1 good it does NOT itself
    // produce/import. We represent that as the full remaining good set
    // (all 9 v1 goods minus the 2 it produces above), which also captures
    // "swingy" via the sheer breadth of exposure across the whole basket.
    wants: ['grain', 'cotton', 'iron', 'salt', 'textiles', 'fuel', 'steel'],
  },
  {
    id: 'ironvale',
    name: 'Ironvale',
    tier: 2,
    character: 'Steel city',
    bankSize: 'Medium',
    hotelPerNight: 40,
    produces: ['steel'],
    wants: ['iron', 'fuel'],
  },
  {
    id: 'silkden',
    name: 'Silkden',
    tier: 2,
    character: 'Luxury bazaar',
    bankSize: 'Medium',
    hotelPerNight: 60,
    // §4's "Produces" column is literally "—" for Silkden: a pure consumer
    // city with no producer role of its own.
    produces: [],
    wants: ['silk', 'spices'],
  },
  {
    id: 'greyharbor',
    name: 'Greyharbor',
    tier: 2,
    character: 'Grey-market port',
    bankSize: 'Small',
    hotelPerNight: 30,
    // INTERPRETATION CALL: §4 gives Greyharbor's "Produces" as the loose
    // phrase "random cheap lots" rather than an explicit list. §13 also
    // clarifies Greyharbor's smuggling angle is "just a normal city with
    // wider spreads" in v1 (no special mini-mechanic) — so we model it as a
    // normal producer of a small, low-value staple assortment: the cheapest
    // base-price goods not already tied to a specialized Tier 1 producer
    // town (Grain/Cotton = Farrow, Iron = Copperfell, Textiles = Millbrook),
    // i.e. Salt, which is otherwise only Saltmere's, fits the "cheap
    // odds-and-ends port" flavor alongside Grain as a secondary cheap lot.
    produces: ['grain', 'salt'],
    // INTERPRETATION CALL: §4 gives Greyharbor's "Wants" as "high spreads,
    // risky" rather than an explicit list. Read as demand concentrated in
    // the highest-volatility/highest-value goods (where wide buy/sell
    // spreads and price risk are most pronounced per §5's volatility
    // classes): Silk (High volatility) and Steel (Medium, high base price).
    wants: ['silk', 'steel'],
  },

  // ---------------------------------------------------------------------
  // Tier 3 — unlock at net worth $250,000 (CITY_UNLOCKS.tier3NetWorth)
  // ---------------------------------------------------------------------
  {
    id: 'auren-city',
    name: 'Auren City',
    tier: 3,
    character: 'Capital. Huge bank, best loans',
    bankSize: 'Huge',
    hotelPerNight: 120,
    // §4's "Produces" column is literally "—" for Auren City.
    produces: [],
    wants: ['electronics', 'silk', 'steel'],
  },
  {
    id: 'voltspire',
    name: 'Voltspire',
    tier: 3,
    character: 'Tech city',
    bankSize: 'Large',
    hotelPerNight: 90,
    produces: ['electronics'],
    wants: ['rare-metals', 'steel'],
  },
  {
    id: 'duskfield',
    name: 'Duskfield',
    tier: 3,
    character: 'Oil fields',
    bankSize: 'Medium',
    hotelPerNight: 50,
    produces: ['fuel'],
    wants: ['steel', 'electronics'],
  },
  {
    id: 'kessler-mines',
    name: 'Kessler Mines',
    tier: 3,
    character: 'Deep mining colony',
    bankSize: 'Small',
    hotelPerNight: 70,
    produces: ['rare-metals'],
    // §4: "Fuel, Grain (remote, pricey food)".
    wants: ['fuel', 'grain'],
  },

  // ---------------------------------------------------------------------
  // Tier 4 — unlock at net worth $2,000,000 (CITY_UNLOCKS.tier4NetWorth)
  // ---------------------------------------------------------------------
  {
    id: 'novara-heights',
    name: 'Novara Heights',
    tier: 4,
    character: 'Financial district',
    bankSize: 'Huge',
    hotelPerNight: 200,
    // INTERPRETATION CALL (see file header): §4's Special text — "Best
    // deposit rates; insider-info hub" — is purely a banking/Informant
    // mechanic with no commodity tie, so produces/wants are left empty
    // (neutral for every good) rather than inventing an unstated trade
    // role. Its Informant accuracy bonus is already wired generically —
    // see informant.ts's `NOVARA_HEIGHTS_CITY_ID`. Its "best deposit
    // rates" clause no longer applies mechanically: deposits became one
    // global pooled balance at a single flat rate in the 2026-08 bank
    // redesign (see bank/deposits.ts), which was a deliberate, separate
    // user-requested change — there is no longer a per-city rate for any
    // city, Novara included, to be "best" at.
    produces: [],
    wants: [],
  },
  {
    id: 'frosthelm',
    name: 'Frosthelm',
    tier: 4,
    character: 'Frozen far north',
    bankSize: 'Small',
    hotelPerNight: 150,
    // §4 Special: "Rare Metals at extreme discount" -> producer role (the
    // existing producer cityModifier range, ~0.72-0.835x base price per
    // config.ts, is already the steepest discount the price engine
    // expresses — see priceEngine.ts's generic role derivation). "Brutal
    // spreads" (no specific good named) and travel cost are handled
    // structurally, not via `wants` — see travel.ts's Frosthelm special
    // case.
    produces: ['rare-metals'],
    wants: [],
  },
  {
    id: 'the-freeport',
    name: 'The Freeport',
    tier: 4,
    character: 'Island tax haven',
    bankSize: 'Large',
    hotelPerNight: 180,
    // §4 Special is purely a tax/loan mechanic (flat 12% year-end tax while
    // based here, no loans) — no commodity tie stated.
    produces: [],
    wants: [],
    // §4: "no loans offered here" — see bank/loans.ts's takeLoan.
    loansOffered: false,
  },
]
