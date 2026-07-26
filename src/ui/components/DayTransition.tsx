/**
 * Full-frame transition overlay marking "something meaningful just
 * happened" — a day passing (Stay) or arriving in a new city (Travel).
 * Before this existed, both were communicated ONLY by the HUD's "Day N" /
 * city-name text silently ticking over — easy to miss entirely, giving
 * neither moment any weight. This renders briefly (~900ms, auto-dismissing)
 * over the whole scene: a colored sweep + an icon + a short message, tuned
 * per `variant` so a day passing reads differently from a journey ending.
 */

interface DayTransitionProps {
  message: string
  variant: 'day' | 'travel'
}

export default function DayTransition({ message, variant }: DayTransitionProps) {
  return (
    <div className={`day-transition day-transition--${variant}`} aria-hidden="true">
      <div className="day-transition-icon">{variant === 'day' ? '☀' : '🧭'}</div>
      <div className="day-transition-text">{message}</div>
    </div>
  )
}
