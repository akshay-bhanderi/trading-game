/**
 * Lease-expiry alert (2026-08, user-requested) — shown automatically whenever
 * `accruePlaneIncome` (aviation.ts) appends a new `LeaseExpiryNotice` to
 * `state.leaseExpiryNotices`, i.e. a Leased Annual plane's firm 90-day term
 * just completed naturally and auto-reverted to Idle. Follows the exact same
 * "acknowledged-count index" pattern App.tsx already uses for `taxHistory` /
 * `YearEndScreen` — see that screen's own doc comment.
 *
 * Offers the two things a player would actually want the moment they learn a
 * plane just went idle: renew it right back into another Leased Annual term,
 * or dismiss and leave it idle (they can pick a different status themselves
 * from the Aviation screen).
 */

import type { PlaneClass } from '../../engine/types'

const CLASS_LABELS: Record<PlaneClass, string> = {
  propFeeder: 'Prop Feeder',
  regionalJet: 'Regional Jet',
  freighter: 'Freighter',
  widebody: 'Widebody',
}

interface LeaseExpiryScreenProps {
  planeClass: PlaneClass
  onRenew: () => void
  onDismiss: () => void
}

export default function LeaseExpiryScreen({ planeClass, onRenew, onDismiss }: LeaseExpiryScreenProps) {
  return (
    <div className="year-end-screen">
      <h2>Lease expired</h2>
      <p>
        Your {CLASS_LABELS[planeClass]}'s Leased Annual term has run its course and the plane is now sitting Idle,
        earning nothing.
      </p>
      <p className="muted">Renew it for another firm 90-day Annual term, or leave it Idle for now.</p>

      <button onClick={onRenew}>Renew Annual lease</button>
      <button className="secondary" onClick={onDismiss}>
        Leave Idle
      </button>
    </div>
  )
}
