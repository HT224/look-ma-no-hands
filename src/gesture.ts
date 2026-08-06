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
