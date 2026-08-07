import { describe, expect, it } from 'vitest'
import { TongueClickDetector, tongueGestureScore } from './gesture'

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

describe('tongueGestureScore', () => {
  it('derives a strong gesture from normalized inner-mouth opening', () => {
    const landmarks = Array.from({ length: 292 }, () => ({ x: 0, y: 0 }))
    landmarks[61] = { x: 0.4, y: 0.5 }
    landmarks[291] = { x: 0.6, y: 0.5 }
    landmarks[13] = { x: 0.5, y: 0.49 }
    landmarks[14] = { x: 0.5, y: 0.53 }
    expect(tongueGestureScore(landmarks, [])).toBeGreaterThan(0.8)
  })

  it('uses jawOpen as a cross-face fallback', () => {
    const landmarks = Array.from({ length: 292 }, () => ({ x: 0, y: 0 }))
    landmarks[61] = { x: 0.4, y: 0.5 }
    landmarks[291] = { x: 0.6, y: 0.5 }
    landmarks[13] = { x: 0.5, y: 0.5 }
    landmarks[14] = { x: 0.5, y: 0.5 }
    expect(tongueGestureScore(landmarks, [{ categoryName: 'jawOpen', score: 0.7 }])).toBe(0.7)
  })
})
