export class TongueClickDetector {
  private activeSince: number | null = null
  private armed = true

  constructor(private threshold = 0.42, private holdMs = 180) {}

  update(score: number, now: number) {
    if (score < this.threshold * 0.65) {
      this.activeSince = null
      this.armed = true
      return false
    }
    if (score < this.threshold || !this.armed) return false
    if (this.activeSince === null) {
      this.activeSince = now
      return false
    }
    if (now - this.activeSince < this.holdMs) return false
    this.armed = false
    this.activeSince = null
    return true
  }
}

type Landmark = { x: number; y: number }
type Blendshape = { categoryName: string; score: number }

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

// MediaPipe's standard Face Landmarker has no tongueOut blendshape. A tongue
// extension does, however, require a sustained inner-mouth opening. Combine
// that measured geometry with jawOpen so the gesture works across face sizes.
export const tongueGestureScore = (landmarks: Landmark[] | undefined, blendshapes: Blendshape[] | undefined) => {
  if (!landmarks?.[13] || !landmarks[14] || !landmarks[61] || !landmarks[291]) return 0
  const mouthWidth = Math.max(distance(landmarks[61], landmarks[291]), 0.001)
  const innerOpening = distance(landmarks[13], landmarks[14]) / mouthWidth
  const geometryScore = Math.min(1, Math.max(0, (innerOpening - 0.04) / 0.18))
  const jawOpen = blendshapes?.find((shape) => shape.categoryName === 'jawOpen')?.score ?? 0
  return Math.max(geometryScore, jawOpen)
}
