import { describe, expect, it } from 'vitest'
import { fitCalibration, projectGaze, type GazeSample } from './calibration'

describe('gaze calibration', () => {
  it('learns a linear mapping and clamps output', () => {
    const samples: GazeSample[] = [
      [0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.25, 0.75],
    ].map(([x, y]) => ({ features: [x, y], target: { x: 0.1 + x * 0.8, y: 0.05 + y * 0.9 } }))
    const model = fitCalibration(samples)
    expect(projectGaze(model, [0.75, 0.25]).x).toBeCloseTo(0.7, 2)
    expect(projectGaze(model, [0.75, 0.25]).y).toBeCloseTo(0.275, 2)
    expect(projectGaze(model, [4, -2])).toEqual({ x: 1, y: 0 })
  })
})
