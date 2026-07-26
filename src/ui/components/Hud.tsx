/**
 * Persistent HUD overlay (T037) — floats in DOM on top of the PixiJS scene
 * canvas, never unmounts alongside it. Layout per trade-winds-design-doc.md
 * §12: top-left city name, top-right cash + owned commodities, bottom-left
 * bank icon, bottom-right market icon. Newspaper/Travel/Stay sit in the
 * bottom bar between bank and market (§12 leaves their exact placement TBD).
 */

import {
  BedIcon,
  CargoIcon,
  CoinIcon,
  CompassIcon,
  LedgerIcon,
} from './PixelIcons'

export type PopupKind = 'market' | 'travel' | 'bank' | 'newspaper' | 'aviation' | null

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
        <button className="hud-icon-btn" onClick={() => onOpen('aviation')} aria-label="Aviation">
          <span className="hud-icon-glyph">✈️</span>
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
