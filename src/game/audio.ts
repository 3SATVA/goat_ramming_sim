import type { Team } from './types'

type ThrottleKey = 'thud' | 'bleat' | 'burn' | 'crackle' | 'ko'

/**
 * Tiny synthesized kit: bleats, body thuds, launch whooshes, and fire crackle.
 * No sample files — everything is oscillators and a reused noise buffer.
 */
export class AudioBus {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private last: Record<ThrottleKey, number> = { thud: 0, bleat: 0, burn: 0, crackle: 0, ko: 0 }

  unlock(): void {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') void ctx.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 0.42
  }

  click(): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    this.tone(ctx, t, 720, 0.05, 'sine', 0.12)
  }

  bleat(team: Team): void {
    if (!this.can('bleat', 0.07)) return
    const ctx = this.ensure()
    const t = ctx.currentTime
    const base = team === 'player' ? 460 : 340
    const o = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o2.type = 'sine'
    o.frequency.setValueAtTime(base, t)
    o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.14)
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.26)
    o2.frequency.setValueAtTime(base * 1.5, t)
    o2.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.22)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(team === 'player' ? 0.28 : 0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    o.connect(g)
    o2.connect(g)
    g.connect(this.mustMaster())
    o.start(t)
    o2.start(t)
    o.stop(t + 0.34)
    o2.stop(t + 0.34)
  }

  thud(intensity: number): void {
    if (!this.can('thud', 0.045)) return
    const ctx = this.ensure()
    const t = ctx.currentTime
    const amount = clamp01(intensity)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(90 + amount * 70, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.34 + amount * 0.4, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(g)
    g.connect(this.mustMaster())
    o.start(t)
    o.stop(t + 0.2)
    this.burstNoise(0.09, 220, 0.7, 0.12 + amount * 0.12)
  }

  whoosh(power: number): void {
    const amount = clamp01(power)
    this.burstNoise(0.16 + amount * 0.1, 700 + amount * 500, 0.55, 0.12 + amount * 0.16)
    const ctx = this.ensure()
    this.tone(ctx, ctx.currentTime, 280 + amount * 80, 0.12, 'sine', 0.06 + amount * 0.05)
  }

  burn(): void {
    if (!this.can('burn', 0.08)) return
    this.burstNoise(0.11, 1600, 1.1, 0.16)
  }

  crackle(): void {
    if (!this.can('crackle', 0.07)) return
    this.burstNoise(0.05 + Math.random() * 0.04, 900 + Math.random() * 1200, 0.8, 0.07 + Math.random() * 0.05)
  }

  overtime(): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    this.tone(ctx, t, 520, 0.12, 'square', 0.08)
    this.tone(ctx, t + 0.12, 390, 0.16, 'square', 0.08)
    this.burn()
  }

  ko(): void {
    if (!this.can('ko', 0.12)) return
    const ctx = this.ensure()
    this.tone(ctx, ctx.currentTime, 180, 0.18, 'triangle', 0.2)
  }

  win(): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    const notes = [523, 659, 784, 1046]
    notes.forEach((freq, i) => this.tone(ctx, t + i * 0.09, freq, 0.16, 'triangle', 0.14))
  }

  lose(): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    ;[392, 330, 247].forEach((freq, i) => this.tone(ctx, t + i * 0.12, freq, 0.2, 'sine', 0.14))
  }

  draw(): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    this.tone(ctx, t, 440, 0.14, 'triangle', 0.12)
    this.tone(ctx, t + 0.12, 554, 0.18, 'triangle', 0.1)
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 0.42
    master.connect(ctx.destination)
    this.ctx = ctx
    this.master = master
    return ctx
  }

  private mustMaster(): GainNode {
    this.ensure()
    return this.master as GainNode
  }

  private can(key: ThrottleKey, gap: number): boolean {
    const now = this.ctx?.currentTime ?? 0
    if (now - this.last[key] < gap) return false
    this.last[key] = now
    return true
  }

  private tone(
    ctx: AudioContext,
    time: number,
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(Math.max(40, freq), time)
    g.gain.setValueAtTime(0.0001, time)
    g.gain.exponentialRampToValueAtTime(gain, time + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    o.connect(g)
    g.connect(this.mustMaster())
    o.start(time)
    o.stop(time + duration + 0.02)
  }

  private burstNoise(duration: number, freq: number, q: number, gain: number): void {
    const ctx = this.ensure()
    const t = ctx.currentTime
    const buffer = this.getNoise(ctx)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.mustMaster())
    src.start(t)
    src.stop(t + duration + 0.02)
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const frames = Math.floor(ctx.sampleRate * 0.4)
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buffer
    return buffer
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
