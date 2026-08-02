/**
 * Real Estate / Hotels screen (T058, §12 screen 10) — lists every hotel the
 * player owns across all cities (tier, current daily revenue, an upgrade
 * button), plus a build/upgrade/sell panel for whichever city the player is
 * CURRENTLY standing in (mirrors BankScreen's "acts on `game.currentCity`"
 * shape, since /src/engine/hotel.ts's `buildOrUpgradeHotel`/`sellHotel` both
 * require `state.currentCity === cityId` — see that file's own "location
 * gating" doc comment for the rationale). Primary target: mobile-portrait
 * 360x740 (single scrollable column of cards, same as BankScreen/MarketScreen).
 */

import { useGameStore } from '../store/gameStore'
import { CITIES } from '../../engine/data/cities'
import { CONFIG } from '../../engine/config'
import {
  cumulativeInvested,
  getDailyRevenue,
  getNextTierIndex,
  getNextUpgradeCost,
  getOwnedTier,
  getTierName,
  isEpidemicActiveInCity,
  listOwnedHotels,
} from '../../engine/hotel'

export default function RealEstateScreen() {
  const game = useGameStore((s) => s.game)
  const buildOrUpgradeHotel = useGameStore((s) => s.buildOrUpgradeHotel)
  const sellHotel = useGameStore((s) => s.sellHotel)

  if (!game) return null

  const currentCity = CITIES.find((c) => c.id === game.currentCity)
  const ownedHotels = listOwnedHotels(game)

  return (
    <div className="realestate-screen">
      {currentCity && (
        <div className="card">
          <h2>{currentCity.name}</h2>
          {(() => {
            const tier = getOwnedTier(game, currentCity.id)
            const nextTierIndex = getNextTierIndex(game, currentCity.id)
            const nextCost = getNextUpgradeCost(game, currentCity)
            const revenue = getDailyRevenue(game, currentCity)
            const paused = isEpidemicActiveInCity(currentCity.id, game.day, game.activeEvents)

            return (
              <>
                {tier === null ? (
                  <p className="muted">No hotel owned here yet. Nightly guest rate: ${currentCity.hotelPerNight}.</p>
                ) : (
                  <>
                    <div className="row">
                      <span>Tier</span>
                      <strong>{getTierName(tier)}</strong>
                    </div>
                    <div className="row">
                      <span>Daily revenue</span>
                      <strong>{paused ? 'Paused (epidemic)' : `$${(revenue ?? 0).toFixed(2)}`}</strong>
                    </div>
                  </>
                )}

                <div className="nav-grid">
                  {tier === null ? (
                    nextTierIndex !== null &&
                    nextCost !== null && (
                      <button onClick={() => buildOrUpgradeHotel(currentCity.id)}>
                        Build {getTierName(nextTierIndex)} (${nextCost.toLocaleString()})
                      </button>
                    )
                  ) : (
                    <>
                      {/* Upgrade always occupies this first slot — a disabled placeholder at max
                          tier, never removed — so Sell (second slot, below) never slides into
                          this position and gets mis-tapped as if it were Upgrade. */}
                      {nextTierIndex !== null && nextCost !== null ? (
                        <button onClick={() => buildOrUpgradeHotel(currentCity.id)}>
                          Upgrade to {getTierName(nextTierIndex)} (${nextCost.toLocaleString()})
                        </button>
                      ) : (
                        <button className="secondary" disabled>
                          Max tier reached
                        </button>
                      )}
                      <button className="secondary" onClick={() => sellHotel(currentCity.id)}>
                        Sell (${(cumulativeInvested(currentCity, tier) * CONFIG.hotel.sellBackFraction).toLocaleString()})
                      </button>
                    </>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

      <div className="card">
        <h2>Your Portfolio</h2>
        {ownedHotels.length === 0 && <p className="muted">You don't own any hotels yet.</p>}

        {ownedHotels.map(({ city, tier }) => {
          const isHere = city.id === game.currentCity
          const paused = isEpidemicActiveInCity(city.id, game.day, game.activeEvents)
          const revenue = getDailyRevenue(game, city) ?? 0

          return (
            <div className="row" key={city.id}>
              <span>
                {city.name} · {getTierName(tier)}
                {!isHere && <span className="muted"> (visit to manage)</span>}
              </span>
              <strong>{paused ? 'Paused' : `$${revenue.toFixed(2)}/day`}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}
