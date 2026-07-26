/**
 * Reusable used/free capacity meter (T038). Built for the Market screen's
 * cargo fill display, but deliberately generic (`used`/`capacity`/`label`
 * props only, no cargo-specific knowledge) so the Warehouse screen (T052,
 * §14) can reuse the exact same bar-fill visual language for its per-floor
 * storage meters, per that task's explicit "same bar-fill visual language as
 * the Market screen's cargo bar, for consistency" requirement.
 */

interface CapacityBarProps {
  used: number
  capacity: number
  label?: string
}

export default function CapacityBar({ used, capacity, label }: CapacityBarProps) {
  const pct = capacity > 0 ? Math.min(100, Math.max(0, (used / capacity) * 100)) : 0

  return (
    <div className="capacity-bar">
      {label && <span className="capacity-bar-label">{label}</span>}
      <div className="capacity-bar-track">
        <div className="capacity-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="capacity-bar-text">
        {used}/{capacity}
      </span>
    </div>
  )
}
