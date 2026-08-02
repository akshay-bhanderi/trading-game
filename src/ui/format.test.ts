import { describe, expect, it } from 'vitest'
import { formatMoney } from './format'

describe('formatMoney', () => {
  it('shows plain rounded integers below $1,000', () => {
    expect(formatMoney(0)).toBe('0')
    expect(formatMoney(47)).toBe('47')
    expect(formatMoney(847.6)).toBe('848')
    expect(formatMoney(999)).toBe('999')
  })

  it('abbreviates thousands as K, dropping a trailing .0', () => {
    expect(formatMoney(1000)).toBe('1K')
    expect(formatMoney(12_345)).toBe('12.3K')
    expect(formatMoney(847_000)).toBe('847K')
    expect(formatMoney(999_000)).toBe('999K')
  })

  it('abbreviates millions/billions/trillions as M/B/T', () => {
    expect(formatMoney(1_234_567)).toBe('1.2M')
    expect(formatMoney(10_000_000)).toBe('10M')
    expect(formatMoney(1_000_000_000)).toBe('1B')
    expect(formatMoney(100_000_000_000)).toBe('100B')
    expect(formatMoney(1_000_000_000_000)).toBe('1T')
  })

  it('bumps up to the next unit instead of ever showing e.g. "1000K"', () => {
    expect(formatMoney(999_960)).toBe('1M')
    expect(formatMoney(999_960_000)).toBe('1B')
  })

  it('preserves sign for negative amounts (debt, tax debt, etc.)', () => {
    expect(formatMoney(-500)).toBe('-500')
    expect(formatMoney(-1_500_000)).toBe('-1.5M')
  })
})
