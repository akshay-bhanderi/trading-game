/**
 * Accountant (CA) hiring screen — its own HUD tab beside Aviation
 * (user-requested, 2026-08; previously a card embedded inside BankScreen).
 * Gated by `isCAHiringAvailable` (§10 "Medium+ bank cities") exactly as
 * before — just surfaced as a standalone popup now instead of a Bank
 * sub-section.
 */

import { useGameStore } from '../store/gameStore'
import { CONFIG } from '../../engine/config'
import { isCAHiringAvailable } from '../../engine/ca'

export default function CAScreen() {
  const game = useGameStore((s) => s.game)
  const hireCA = useGameStore((s) => s.hireCA)

  if (!game) return null

  if (!isCAHiringAvailable(game)) {
    return (
      <div className="ca-screen">
        <div className="card">
          <h2>Hire an Accountant</h2>
          <p className="muted">
            No accountant available here — this city's bank is too small. Try a Medium-or-larger bank city.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="ca-screen">
      <div className="card">
        <h2>Hire an Accountant</h2>
        <p className="muted">
          {game.hiredCATierThisFiscalYear && game.hiredCATierThisFiscalYear !== 'none'
            ? `Currently hired: ${game.hiredCATierThisFiscalYear} (effective this fiscal year only)`
            : 'No CA hired this fiscal year — profit taxed at the flat 30% no-CA rate.'}
        </p>
        <div className="nav-grid">
          {(['junior', 'senior', 'elite'] as const).map((tier) => {
            const cfg = CONFIG.tax.caTiers[tier]
            return (
              <button key={tier} className="secondary" disabled={game.cash < cfg.annualFee} onClick={() => hireCA(tier)}>
                {tier} (${cfg.annualFee.toLocaleString()}) — {(cfg.taxRate * 100).toFixed(0)}% tax up to $
                {cfg.profitCap?.toLocaleString()}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
