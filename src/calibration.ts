export type Point = { x: number; y: number }
export type GazeSample = { features: number[]; target: Point }
export type CalibrationModel = { xWeights: number[]; yWeights: number[] }

const solve = (matrix: number[][], vector: number[]) => {
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < matrix.length; column += 1) {
    let pivot = column
    for (let row = column + 1; row < matrix.length; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column] || 1e-9
    for (let cell = column; cell <= matrix.length; cell += 1) augmented[column][cell] /= divisor
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let cell = column; cell <= matrix.length; cell += 1) {
        augmented[row][cell] -= factor * augmented[column][cell]
      }
    }
  }
  return augmented.map((row) => row[matrix.length])
}

const fitAxis = (samples: GazeSample[], axis: 'x' | 'y') => {
  const dimensions = samples[0].features.length + 1
  const matrix = Array.from({ length: dimensions }, () => Array(dimensions).fill(0))
  const vector = Array(dimensions).fill(0)
  for (const sample of samples) {
    const row = [1, ...sample.features]
    for (let i = 0; i < dimensions; i += 1) {
      vector[i] += row[i] * sample.target[axis]
      for (let j = 0; j < dimensions; j += 1) matrix[i][j] += row[i] * row[j]
    }
  }
  for (let i = 1; i < dimensions; i += 1) matrix[i][i] += 1e-4
  return solve(matrix, vector)
}

export const fitCalibration = (samples: GazeSample[]): CalibrationModel => {
  if (samples.length < 5) throw new Error('At least five calibration samples are required')
  return { xWeights: fitAxis(samples, 'x'), yWeights: fitAxis(samples, 'y') }
}

const projectAxis = (weights: number[], features: number[]) =>
  weights[0] + features.reduce((sum, feature, index) => sum + feature * weights[index + 1], 0)

export const projectGaze = (model: CalibrationModel, features: number[]): Point => ({
  x: Math.min(1, Math.max(0, projectAxis(model.xWeights, features))),
  y: Math.min(1, Math.max(0, projectAxis(model.yWeights, features))),
})

export const CALIBRATION_POINTS: Point[] = [
  { x: 0.12, y: 0.14 }, { x: 0.5, y: 0.14 }, { x: 0.88, y: 0.14 },
  { x: 0.12, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.88, y: 0.5 },
  { x: 0.12, y: 0.86 }, { x: 0.5, y: 0.86 }, { x: 0.88, y: 0.86 },
]
