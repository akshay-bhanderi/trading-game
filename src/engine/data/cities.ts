/**
 * City data — Trade Winds of Selvara.
 *
 * Source of truth: trade-winds-design-doc.md §4 (World — cities), §13 (v1
 * scope fence). Reuses the existing `City`/`CityId`/`CityTier`/`BankSize`
 * types from ./../types.ts — no redefinition here.
 *
 * Good ids referenced in `produces`/`wants` below use the lowercase ids of
 * the 9 v1 goods (§5, all but Electronics/Rare Metals — see /src/engine/data/goods.ts,
 * T006, built concurrently): 'grain', 'cotton', 'iron', 'salt', 'textiles',
 * 'spices', 'fuel', 'steel', 'silk'.
 *
 * §13 SCOPE FENCE — Tier 3/4 cities intentionally NOT defined here:
 * Auren City, Voltspire, Duskfield, Kessler Mines (Tier 3) and Novara
 * Heights, Frosthelm, The Freeport (Tier 4) are OUT of v1 scope per §13.
 * City count is config-driven (§4): adding them back later is just adding
 * more `City` records to this array — no structural change required. They
 * are deliberately omitted entirely (not even as commented-out stubs) per
 * the T005 task spec.
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
]
