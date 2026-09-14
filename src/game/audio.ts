export class AudioBus {
  private ctx: AudioContext | null = null
  private hum: OscillatorNode | null = null
  private humGain: GainNode | null = null
  muted = false

  resume() {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.08) {
    if (this.muted || !this.ctx) return
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.value = gain
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur)
    o.connect(g).connect(this.ctx.destination)
    o.start()
    o.stop(this.ctx.currentTime + dur)
  }

  setMowing(on: boolean, speed = 0) {
    if (!this.ctx || this.muted) {
      if (this.hum) {
        this.hum.stop()
        this.hum = null
        this.humGain = null
      }
      return
    }
    if (on && !this.hum) {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = 'sawtooth'
      o.frequency.value = 70
      g.gain.value = 0.03
      o.connect(g).connect(this.ctx.destination)
      o.start()
      this.hum = o
      this.humGain = g
    }
    if (!on && this.hum) {
      this.hum.stop()
      this.hum = null
      this.humGain = null
    }
    if (this.hum && this.humGain) {
      this.hum.frequency.value = 64 + speed * 40
      this.humGain.gain.value = 0.02 + Math.min(0.04, speed * 0.03)
    }
  }

  bark() {
    this.tone(180, 0.12, 'square', 0.05)
    setTimeout(() => this.tone(140, 0.16, 'square', 0.04), 80)
  }

  bump() {
    this.tone(90, 0.08, 'triangle', 0.06)
  }

  charge() {
    this.tone(520, 0.08, 'sine', 0.04)
  }

  win() {
    this.tone(523, 0.12, 'sine', 0.06)
    setTimeout(() => this.tone(659, 0.12, 'sine', 0.06), 90)
    setTimeout(() => this.tone(784, 0.2, 'sine', 0.07), 180)
  }

  fail() {
    this.tone(220, 0.2, 'sawtooth', 0.05)
    setTimeout(() => this.tone(110, 0.3, 'sawtooth', 0.05), 120)
  }

  buy() {
    this.tone(880, 0.1, 'sine', 0.05)
  }
}
