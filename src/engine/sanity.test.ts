import { describe, expect, it } from 'vitest'

describe('engine sanity', () => {
  it('runs headless in Node', () => {
    expect(1 + 1).toBe(2)
  })
})
