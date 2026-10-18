export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function hexRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function shade(hex: string, amt: number): string {
  const c = hexRgb(hex)
  if (!c) return hex
  const ch = (v: number) => clamp(Math.round(v + amt), 0, 255).toString(16).padStart(2, '0')
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a)
  const cb = hexRgb(b)
  if (!ca || !cb) return a
  const m = (x: number, y: number) => Math.round(x + (y - x) * clamp(t, 0, 1))
    .toString(16)
    .padStart(2, '0')
  return `#${m(ca.r, cb.r)}${m(ca.g, cb.g)}${m(ca.b, cb.b)}`
}

export function colorDist(a: string, b: string): number {
  const ca = hexRgb(a)
  const cb = hexRgb(b)
  if (!ca || !cb) return 999
  return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b)
}

export function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

export function formatTime(seconds: number): string {
  const c = Math.max(0, Math.ceil(seconds - 1e-4))
  const m = Math.floor(c / 60)
  const sec = c % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
