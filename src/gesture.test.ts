import { describe, expect, it } from 'vitest'
import { TongueClickDetector } from './gesture'

describe('TongueClickDetector', () => {
  it('requires a hold and rearms only after release', () => {
    const detector = new TongueClickDetector(0.4, 150)
    expect(detector.update(0.8, 0)).toBe(false)
    expect(detector.update(0.8, 100)).toBe(false)
    expect(detector.update(0.8, 151)).toBe(true)
    expect(detector.update(0.8, 400)).toBe(false)
    expect(detector.update(0.1, 450)).toBe(false)
    expect(detector.update(0.8, 500)).toBe(false)
    expect(detector.update(0.8, 651)).toBe(true)
  })
})
