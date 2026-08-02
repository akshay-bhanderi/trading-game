/**
 * Shared money-formatting helper (user-requested, 2026-08) — abbreviates
 * "big total" dollar figures (cash, net worth, bank balances, loan
 * amounts, hotel/warehouse/aviation costs, tax figures, high scores) into
 * K/M/B/T notation instead of full digit strings: "10K, 100K, 1M, 10M,
 * 100M, 1B, 100B, 1T".
 *
 * Deliberately NOT used for the Market screen's per-unit buy/sell prices
 * or its trade-total line (explicit user choice) — those stay exact so a
 * trade's margin can still be calculated precisely.
 *
 * < $1,000 (absolute value): plain rounded whole-dollar integer, no
 * abbreviation. >= $1,000: one decimal place, dropped when it would just
 * be ".0" (847,000 -> "847K", 1,234,567 -> "1.2M", 10,000,000 -> "10M").
 * Rounding that would cross a unit boundary (e.g. 999,960 rounding to
 * "1000.0K") bumps up to the next larger unit instead, so "1000K" is never
 * shown.
 */
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)

  if (abs < 1000) return `${sign}${Math.round(abs)}`

  const scale = (value: number, threshold: number): number => Math.round((value / threshold) * 10) / 10
  const fmt = (value: number, suffix: string): string =>
    `${sign}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}${suffix}`

  if (abs >= 1e12) return fmt(scale(abs, 1e12), 'T')

  if (abs >= 1e9) {
    const b = scale(abs, 1e9)
    return b >= 1000 ? fmt(scale(abs, 1e12), 'T') : fmt(b, 'B')
  }

  if (abs >= 1e6) {
    const m = scale(abs, 1e6)
    return m >= 1000 ? fmt(scale(abs, 1e9), 'B') : fmt(m, 'M')
  }

  // abs is in [1000, 1e6) — the K tier.
  const k = scale(abs, 1e3)
  return k >= 1000 ? fmt(scale(abs, 1e6), 'M') : fmt(k, 'K')
}
