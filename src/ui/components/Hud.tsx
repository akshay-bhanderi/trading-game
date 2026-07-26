/**
 * Persistent HUD overlay (T037) — floats in DOM on top of the PixiJS scene
 * canvas, never unmounts alongside it. Layout per trade-winds-design-doc.md
 * §12: top-left city name, top-right cash + owned commodities, bottom-left
 * bank icon, bottom-right market icon. Newspaper/Travel/Stay sit in the
 * bottom bar between bank and market (§12 leaves their exact placement TBD).
 *
 * ---------------------------------------------------------------------------
 * T058 additions (§15 Hotel Ownership / §12 screen 10)
 * ---------------------------------------------------------------------------
 * Two additions to the bottom bar, both driven by NEW required props (App.tsx
 * is the sole caller and already has `game.currentCity` + hotel-ownership
 * status available to compute them):
 *   - A 'realestate' `PopupKind` + its own icon button, exactly mirroring how
 *     'market'/'bank'/'travel'/'newspaper' are already wired (see App.tsx's
 *     popup switch).
 *   - A conditional "buy hotel here" chip, shown ONLY when
 *     `currentCityHotelOwned` is `false` (§12's explicit placement
 *     requirement: available "from the hub scene when not yet owned").
 *     Deliberately a distinct button from the Real Estate icon (rather than
 *     folding "buy" into opening the Real Estate popup) since the doc frames
 *     it as its own hub-scene affordance, not a step buried inside the
 *     portfolio screen — clicking it calls `onBuyHotelHere` directly (wired
 *     to the store's `buildOrUpgradeHotel(currentCity)` in App.tsx) rather
 *     than opening any popup at all, for a one-tap purchase.
 */

import {
  BedIcon,
  CargoIcon,
  CoinIcon,
  CompassIcon,
  LedgerIcon,
} from './PixelIcons'

export type PopupKind = 'market' | 'travel' | 'bank' | 'newspaper' | 'realestate' | null

interface HudProps {
  cityName: string
  day: number
  cash: number
  ownedGoodCount: number
  cargoUsed: number
  cargoCapacity: number
  onOpen: (popup: Exclude<PopupKind, null>) => void
  onStay: () => void
  onSave: () => void
  justSaved: boolean
  /** True when the CURRENT city's hotel is not yet owned by the player —
   * gates the "buy hotel here" chip below (§12/§15). */
  currentCityHotelUnowned: boolean
  /** Purchases the current city's hotel (Inn, tier 0) directly — see file
   * header for why this is a standalone one-tap action rather than a popup. */
  onBuyHotelHere: () => void
}

export default function Hud({
  cityName,
  day,
  cash,
  ownedGoodCount,
  cargoUsed,
  cargoCapacity,
  onOpen,
  onStay,
  onSave,
  justSaved,
  currentCityHotelUnowned,
  onBuyHotelHere,
}: HudProps) {
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-chip hud-city">
          <span className="hud-city-name">{cityName}</span>
          <span className="hud-day">Day {day}</span>
        </div>
        <div className="hud-chip hud-wallet">
          <span className="icon-label">
            <CoinIcon size={13} />${cash.toFixed(0)}
          </span>
          <span className="icon-label">
            <CargoIcon size={13} />
            {ownedGoodCount} goods · {cargoUsed}/{cargoCapacity}
          </span>
        </div>
      </div>

      {currentCityHotelUnowned && (
        <button className="hud-chip hud-buy-hotel" onClick={onBuyHotelHere}>
          🏨 Buy hotel here
        </button>
      )}

      <div className="hud-bottom">
        <button className="hud-icon-btn" onClick={() => onOpen('bank')} aria-label="Bank">
          <LedgerIcon size={20} />
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('newspaper')} aria-label="Newspaper">
          <span className="hud-icon-glyph">📰</span>
        </button>
        <button className="hud-icon-btn" onClick={onStay} aria-label="Stay">
          <BedIcon size={20} />
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('travel')} aria-label="Travel">
          <CompassIcon size={20} />
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('market')} aria-label="Market">
          <CoinIcon size={20} />
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('realestate')} aria-label="Real Estate">
          <span className="hud-icon-glyph">🏨</span>
        </button>
        <button className="hud-icon-btn" onClick={onSave} aria-label="Save game">
          <span className="hud-icon-glyph">💾</span>
        </button>
      </div>

      {justSaved && (
        <div className="hud-toast" role="status">
          Saved!
        </div>
      )}
    </div>
  )
}
