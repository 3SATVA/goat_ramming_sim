import { FENCE } from './constants'
import type { ArenaShape } from './types'

export function roundShape(shape: ArenaShape): boolean {
  return shape === 'circle' || shape === 'oval'
}

export function clampToArena(
  shape: ArenaShape,
  width: number,
  height: number,
  x: number,
  y: number,
  pad: number,
): { x: number; y: number } {
  if (roundShape(shape)) {
    const rx = Math.max(12, width / 2 - pad)
    const ry = Math.max(12, height / 2 - pad)
    const px = x - width / 2
    const py = y - height / 2
    const n = (px * px) / (rx * rx) + (py * py) / (ry * ry)
    if (n <= 1) return { x, y }
    const s = 1 / Math.sqrt(n)
    return { x: width / 2 + px * s, y: height / 2 + py * s }
  }
  return {
    x: Math.min(width - pad, Math.max(pad, x)),
    y: Math.min(height - pad, Math.max(pad, y)),
  }
}

export function insideArena(
  shape: ArenaShape,
  width: number,
  height: number,
  x: number,
  y: number,
  pad: number,
): boolean {
  const spot = clampToArena(shape, width, height, x, y, pad)
  return Math.hypot(spot.x - x, spot.y - y) < 1
}

/** Spread goats across the chord that fits at this y. */
export function laneX(
  shape: ArenaShape,
  width: number,
  height: number,
  y: number,
  index: number,
  count: number,
  margin: number,
): number {
  let min = FENCE + margin
  let max = width - FENCE - margin
  if (roundShape(shape)) {
    const rx = Math.max(12, width / 2 - FENCE - margin)
    const ry = Math.max(12, height / 2 - FENCE - margin)
    const py = (y - height / 2) / ry
    const half = rx * Math.sqrt(Math.max(0, 1 - py * py)) * 0.82
    min = width / 2 - half
    max = width / 2 + half
  }
  if (count <= 1 || max - min < 8) return (min + max) / 2
  return min + ((max - min) * index) / (count - 1)
}
