/**
 * Persistent HUD overlay (T037) — floats in DOM on top of the PixiJS scene
 * canvas, never unmounts alongside it. Layout per trade-winds-design-doc.md
 * §12: top-left city name, top-right cash + owned commodities, bottom-left
 * bank icon, bottom-right market icon. Newspaper/Travel/Stay sit in the
 * bottom bar between bank and market (§12 leaves their exact placement TBD).
 *
 * T052 addition (§14 Warehouse Storage): a `'warehouse'` `PopupKind` +
 * bottom-bar icon button, added following the exact same pattern as the
 * pre-existing bank/newspaper/travel/market buttons — `onOpen('warehouse')`
 * is handled by App.tsx exactly like every other popup case. Uses
 * `SkylineIcon` (already built for a future building-elevation visual, see
 * PixelIcons.tsx) since it's the closest existing pixel icon to a warehouse
 * building silhouette — no new icon asset needed.
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
 *
 * ---------------------------------------------------------------------------
 * Later UI-polish pass: Menu button, city name moved to the scene, bigger
 * Day text, real Bank/Hotel icons
 * ---------------------------------------------------------------------------
 *   - City name no longer renders here — it moved to the persistent scene
 *     itself, below the "TRADE WINDS OF SELVARA" signage (see HubScene.tsx),
 *     so the top-left chip now shows only "Day N" (at a larger font size —
 *     it was easy to miss at the old 12px).
 *   - A `'menu'` `PopupKind` + a small hamburger button (`hud-menu-btn`,
 *     absolutely centered at the very top, independent of the two corner
 *     chips) opens the pause/settings menu (`MenuScreen.tsx`: Backup Save,
 *     Sound/Music toggles, New Game, Exit). The standalone Save button
 *     (`💾`) that used to live in the bottom bar was removed — "Backup Save"
 *     in the new Menu screen replaces it (same underlying `save()` store
 *     action); the `justSaved` toast below is unchanged and still fires
 *     regardless of which entry point triggered `save()`.
 *   - `BankIcon`/`HotelIcon` (PixelIcons.tsx) replace the old `LedgerIcon`/
 *     🏨 emoji — a building with columns/pediment and a building with an
 *     awning/door read more clearly as "bank" and "hotel" than a ledger book
 *     or a generic emoji.
 *
 * ---------------------------------------------------------------------------
 * 2026-08 addition: days-until-year-end, below the Day counter
 * ---------------------------------------------------------------------------
 * User-requested — a small second line under "Day N" showing how many days
 * remain until the current 90-day fiscal year ends (§10). Computed directly
 * from the `day` prop (`YEAR_LENGTH_DAYS - (day % YEAR_LENGTH_DAYS)`) rather
 * than needing a new prop — `runYearEnd` (tax.ts) already fires exactly on
 * multiples of `YEAR_LENGTH_DAYS`, so this stays in sync with no extra
 * wiring.
 *
 * ---------------------------------------------------------------------------
 * 2026-08: Stay button removed entirely (user-requested)
 * ---------------------------------------------------------------------------
 * Stay used to let the player advance a day without traveling anywhere
 * (App.tsx owned a confirm dialog in front of the actual `stay()` store
 * call). Removed completely, by explicit request — traveling is now the
 * only way to advance a day. `onStayRequest`/`showStayConfirm` are gone
 * from both this component and App.tsx; the store's own `stay()` action
 * (gameStore.ts) is left as-is (unused by the UI, but not deleted — a
 * separate, later call if the store's action surface itself needs pruning).
 *
 * ---------------------------------------------------------------------------
 * T074 (Phase 17): bottom-bar + menu-button icons → text labels
 * ---------------------------------------------------------------------------
 *   - The `.hud-bottom` buttons (Bank/Newspaper/Travel/Market/
 *     Warehouse/Real Estate/Aviation/Accountant — a 9th, Accountant, added
 *     2026-08 per user request to give CA hiring its own tab beside
 *     Aviation instead of living inside Bank; Stay removed 2026-08, see
 *     above) and `.hud-menu-btn` now render their
 *     `aria-label` string as visible text instead of an icon glyph/emoji —
 *     user-directed change, see tasks/phase-17-hud-text-buttons.md. This
 *     orphaned `BankIcon`/`CompassIcon`/`SkylineIcon`/`BedIcon`/`MenuIcon`
 *     (no other call site referenced them), so they were removed from
 *     PixelIcons.tsx; `CoinIcon`/`CargoIcon`/`HotelIcon` stay imported here
 *     since the top-right wallet chip and the "Buy hotel here" chip (both
 *     explicitly out of scope for T074) still use them.
 */

import { CargoIcon, CoinIcon, HotelIcon } from './PixelIcons'
import { formatMoney } from '../format'
import { YEAR_LENGTH_DAYS } from '../../engine/config'

export type PopupKind =
  | 'market'
  | 'travel'
  | 'bank'
  | 'newspaper'
  | 'warehouse'
  | 'realestate'
  | 'aviation'
  | 'ca'
  | 'menu'
  | null

interface HudProps {
  day: number
  cash: number
  ownedGoodCount: number
  cargoUsed: number
  cargoCapacity: number
  onOpen: (popup: Exclude<PopupKind, null>) => void
  justSaved: boolean
  /** True when the CURRENT city's hotel is not yet owned by the player —
   * gates the "buy hotel here" chip below (§12/§15). */
  currentCityHotelUnowned: boolean
  /** Purchases the current city's hotel (Inn, tier 0) directly — see file
   * header for why this is a standalone one-tap action rather than a popup. */
  onBuyHotelHere: () => void
}

export default function Hud({
  day,
  cash,
  ownedGoodCount,
  cargoUsed,
  cargoCapacity,
  onOpen,
  justSaved,
  currentCityHotelUnowned,
  onBuyHotelHere,
}: HudProps) {
  return (
    <div className="hud">
      <button className="hud-menu-btn" onClick={() => onOpen('menu')} aria-label="Menu">
        Menu
      </button>

      {/* `.hud-top-group` wraps the top chips + the conditional buy-hotel
          chip so `.hud`'s own `justify-content: space-between` still only
          ever sees two children (this group + `.hud-bottom`) — otherwise a
          3rd space-between participant gets spread toward the vertical
          center instead of hugging the top, right where the canvas-drawn
          sign board sits. */}
      <div className="hud-top-group">
        <div className="hud-top">
          <div className="hud-chip hud-city">
            <span className="hud-day">Day {day}</span>
            <span className="hud-year-end">Year ends in {YEAR_LENGTH_DAYS - (day % YEAR_LENGTH_DAYS)}d</span>
          </div>
          <div className="hud-chip hud-wallet">
            <span className="icon-label">
              <CoinIcon size={13} />${formatMoney(cash)}
            </span>
            <span className="icon-label">
              <CargoIcon size={13} />
              {ownedGoodCount} goods · {cargoUsed}/{cargoCapacity}
            </span>
          </div>
        </div>

        {currentCityHotelUnowned && (
          <button className="hud-chip hud-buy-hotel" onClick={onBuyHotelHere}>
            <span className="icon-label">
              <HotelIcon size={14} /> Buy hotel here
            </span>
          </button>
        )}
      </div>

      <div className="hud-bottom">
        <button className="hud-icon-btn" onClick={() => onOpen('bank')} aria-label="Bank">
          Bank
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('newspaper')} aria-label="Newspaper">
          Newspaper
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('travel')} aria-label="Travel">
          Travel
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('market')} aria-label="Market">
          Market
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('warehouse')} aria-label="Warehouse">
          Warehouse
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('realestate')} aria-label="Real Estate">
          Real Estate
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('aviation')} aria-label="Aviation">
          Aviation
        </button>
        <button className="hud-icon-btn" onClick={() => onOpen('ca')} aria-label="Accountant">
          Accountant
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
