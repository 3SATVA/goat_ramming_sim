import { FENCE, WORLD } from './constants'
import type { Goat, Particle, World } from './types'
import { mixHex, mulberry32, roundRect, shade } from './util'

export interface Camera {
  x: number
  y: number
  s: number
}

let fieldCanvas: HTMLCanvasElement | null = null

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  time: number,
  pull: { origin: { x: number; y: number }; current: { x: number; y: number } } | null,
): void {
  const field = getField()
  ctx.drawImage(field, 0, 0)
  const living = world.goats.filter((g) => !g.dead)
  const down = world.goats.filter((g) => g.dead)
  for (const goat of down) drawGoat(ctx, goat, time, offsetFor(goat))
  for (const goat of living) {
    if (goat.team === 'player' && !goat.dead) drawPlayerRing(ctx, goat, time)
    drawGoat(ctx, goat, time, offsetFor(goat))
  }
  drawFence(ctx, time, world.overtime && (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'countdown'))
  for (const particle of world.particles) drawParticle(ctx, particle)
  for (const goat of world.goats) {
    if (goat.dead) continue
    if (goat.team === 'player' && goat.charging) {
      drawAim(ctx, goat.x, goat.y, goat.chargeAngle, goat.chargePower, mixHex('#b6f27a', '#ff4d3a', goat.chargePower))
      if (pull) drawPullTether(ctx, pull)
    } else if (goat.team === 'enemy' && goat.ai === 'windup') {
      const p = 1 - goat.aiTimer / Math.max(0.001, goat.aiWindup)
      const alpha = 0.4 + Math.min(1, p) * 0.6
      drawAim(ctx, goat.x, goat.y, goat.aimAngle, Math.max(0.18, p), `rgba(255, 78, 48, ${alpha})`)
    }
  }
}

function offsetFor(goat: Goat): { x: number; y: number } {
  let lean = 0
  let angle = goat.facing
  if (goat.charging) {
    lean = goat.chargePower * 16
    angle = goat.chargeAngle
  } else if (goat.ai === 'windup') {
    const p = 1 - goat.aiTimer / Math.max(0.001, goat.aiWindup)
    lean = Math.max(0, p) * 14
    angle = goat.aimAngle
  }
  return { x: -Math.cos(angle) * lean, y: -Math.sin(angle) * lean }
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  viewW: number,
  viewH: number,
): void {
  if (world.overtime && (world.mode === 'playing' || world.mode === 'paused')) {
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewW * 0.25, viewW / 2, viewH / 2, viewW * 0.72)
    g.addColorStop(0, 'rgba(255, 70, 0, 0)')
    g.addColorStop(1, 'rgba(160, 30, 0, 0.2)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, viewW, viewH)
  }

  for (const goat of world.goats) {
    const sx = cam.x + goat.x * cam.s
    const sy = cam.y + (goat.y - goat.radius) * cam.s
    drawHealthBar(ctx, sx, sy, goat)
    if (goat.team === 'enemy' && goat.ai === 'windup' && !goat.dead) {
      drawBang(ctx, sx, sy - 28, 1 - goat.aiTimer / Math.max(0.001, goat.aiWindup))
    }
  }

  for (const floater of world.floaters) {
    const sx = cam.x + floater.x * cam.s
    const sy = cam.y + floater.y * cam.s
    const alpha = Math.max(0, Math.min(1, floater.life / floater.max))
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = '800 18px Fredoka, "Trebuchet MS", sans-serif'
    ctx.textAlign = 'center'
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(32, 18, 8, 0.85)'
    ctx.strokeText(floater.text, sx, sy)
    ctx.fillStyle = floater.color
    ctx.fillText(floater.text, sx, sy)
    ctx.restore()
  }

  const centerBanner =
    world.otBanner > 0
      ? 'OVERTIME'
      : world.mode === 'countdown'
        ? String(Math.max(1, Math.ceil(world.countdown)))
        : world.goBanner > 0
          ? 'RAM!'
          : ''
  if (centerBanner) {
    const pop = world.otBanner > 2 ? 1 + (world.otBanner - 2) * 0.35 : 1
    ctx.save()
    ctx.translate(viewW / 2, viewH / 2)
    ctx.scale(pop, pop)
    ctx.font = '700 86px Fredoka, "Trebuchet MS", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 10
    ctx.strokeStyle = '#2a2118'
    ctx.fillStyle = centerBanner === 'OVERTIME' ? '#ffb15a' : '#fff6e8'
    ctx.strokeText(centerBanner, 0, 0)
    ctx.fillText(centerBanner, 0, 0)
    ctx.restore()
  }

  if (world.hint && world.mode === 'playing' && !world.goats.some((g) => g.team === 'player' && g.charging)) {
    ctx.save()
    ctx.font = '700 18px Fredoka, "Trebuchet MS", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const text = 'Pull anywhere to ram'
    const y = viewH - 18
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(20, 40, 16, 0.8)'
    ctx.strokeText(text, viewW / 2, y)
    ctx.fillStyle = '#fff6e8'
    ctx.fillText(text, viewW / 2, y)
    ctx.restore()
  }
}

export function paintPortrait(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  goat: Goat,
  time: number,
): void {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#3e9a48'
  ctx.fillRect(0, 0, w, h)
  const rand = mulberry32(4)
  ctx.strokeStyle = 'rgba(20, 80, 30, 0.35)'
  ctx.lineWidth = 2
  for (let i = 0; i < 18; i++) {
    const x = rand() * w
    const y = rand() * h
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 2, y - 8)
    ctx.stroke()
  }
  const fit = Math.min(w / 140, h / 118)
  ctx.save()
  ctx.translate(w / 2, h / 2 + 4 + Math.sin(time * 2) * 2)
  ctx.scale(fit, fit)
  drawGoat(ctx, { ...goat, x: 0, y: 0 }, time, { x: 0, y: 0 })
  ctx.restore()
}

function drawPlayerRing(ctx: CanvasRenderingContext2D, goat: Goat, time: number): void {
  ctx.save()
  ctx.translate(goat.x, goat.y)
  ctx.rotate(time * 0.7)
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.92)'
  ctx.lineWidth = 3
  ctx.setLineDash([8, 7])
  ctx.beginPath()
  ctx.arc(0, 0, goat.radius + 10, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

const OUTLINE = '#2a2118'

function drawGoat(
  ctx: CanvasRenderingContext2D,
  goat: Goat,
  time: number,
  offset: { x: number; y: number },
): void {
  const r = goat.radius
  const rival = goat.team === 'enemy'
  const coat = rival ? shade(goat.color, -24) : goat.color
  const belly = shade(coat, 38)
  const mark = goat.id % 3
  ctx.save()
  ctx.translate(goat.x + offset.x, goat.y + offset.y)
  ctx.save()
  ctx.scale(1, 0.38)
  ctx.fillStyle = 'rgba(16, 40, 18, 0.3)'
  ctx.beginPath()
  ctx.ellipse(2, r * 1.7, r * 1.05, r * 0.95, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (goat.dead) ctx.globalAlpha = 0.72
  ctx.rotate(goat.facing + (goat.dead ? Math.PI / 2 : 0))
  const squash = goat.dead ? 0 : goat.squash
  ctx.scale(1 + squash * 0.18, 1 - squash * 0.14)

  const phase = goat.legPhase
  drawLeg(ctx, r, 0.22, -0.46, Math.sin(phase) * r * 0.2, coat)
  drawLeg(ctx, r, 0.22, 0.46, Math.sin(phase + Math.PI) * r * 0.2, coat)
  drawLeg(ctx, r, -0.48, -0.4, Math.sin(phase + Math.PI) * r * 0.2, coat)
  drawLeg(ctx, r, -0.48, 0.4, Math.sin(phase) * r * 0.2, coat)

  const wag = Math.sin(time * 7.5 + goat.blinkOffset) * r * 0.16
  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.arc(-r * 0.98, wag, r * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = coat
  ctx.beginPath()
  ctx.arc(-r * 0.98, wag, r * 0.14, 0, Math.PI * 2)
  ctx.fill()

  traceWool(ctx, r)
  ctx.fillStyle = OUTLINE
  ctx.fill()
  traceWool(ctx, r, 0.9, 0.02)
  ctx.fillStyle = coat
  ctx.fill()
  ctx.fillStyle = belly
  ctx.beginPath()
  ctx.ellipse(r * 0.02, r * 0.08, r * 0.32, r * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.16, -r * 0.16, r * 0.28, r * 0.16, -0.45, 0, Math.PI * 2)
  ctx.fill()

  if (rival && mark === 0) {
    ctx.fillStyle = shade(goat.color, -62)
    ctx.beginPath()
    ctx.ellipse(-r * 0.04, 0, r * 0.42, r * 0.09, -0.08, 0, Math.PI * 2)
    ctx.fill()
  } else if (rival && mark === 1) {
    ctx.fillStyle = shade(goat.color, -58)
    for (const [x, y, rad] of [
      [-0.22, -0.1, 0.13],
      [0.08, 0.16, 0.1],
      [-0.36, 0.12, 0.09],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x * r, y * r, rad * r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const flop = Math.sin(time * 3.2 + goat.blinkOffset) * 0.12
  drawEar(ctx, r, -1, coat, flop)
  drawEar(ctx, r, 1, coat, flop)
  drawHorn(ctx, r, -1)
  drawHorn(ctx, r, 1)

  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.arc(r * 0.78, 0, r * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = coat
  ctx.beginPath()
  ctx.arc(r * 0.78, 0, r * 0.33, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.beginPath()
  ctx.ellipse(r * 0.66, -r * 0.12, r * 0.12, r * 0.08, -0.6, 0, Math.PI * 2)
  ctx.fill()

  if (rival && mark === 2) {
    ctx.fillStyle = shade(goat.color, -50)
    ctx.beginPath()
    ctx.ellipse(r * 0.9, 0, r * 0.22, r * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  drawBeard(ctx, r)
  drawFace(ctx, goat, time, r, coat)

  if (goat.team === 'player') {
    ctx.strokeStyle = '#e24b4b'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(r * 0.46, 0, r * 0.16, -1.15, 1.15)
    ctx.stroke()
    ctx.fillStyle = '#ffd15c'
    ctx.beginPath()
    ctx.arc(r * 0.52, r * 0.14, r * 0.075, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.6
    ctx.stroke()
  }

  if (goat.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.65, goat.flash * 2.2)})`
    traceWool(ctx, r)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(r * 0.78, 0, r * 0.36, 0, Math.PI * 2)
    ctx.fill()
  }
  if (goat.ignite > 0) {
    const flicker = 0.26 + Math.sin(time * 22 + goat.blinkOffset) * 0.08
    ctx.fillStyle = `rgba(255, 120, 30, ${flicker})`
    traceWool(ctx, r * 1.02)
    ctx.fill()
  }

  ctx.restore()
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  r: number,
  x: number,
  y: number,
  swing: number,
  coat: string,
): void {
  const side = y < 0 ? -1 : 1
  ctx.save()
  ctx.translate(x * r + swing, y * r)
  ctx.fillStyle = shade(coat, -36)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(0, side * r * 0.02, r * 0.11, r * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#2c211c'
  ctx.beginPath()
  ctx.ellipse(r * 0.08, side * r * 0.16, r * 0.09, r * 0.065, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#4a382e'
  ctx.beginPath()
  ctx.ellipse(r * 0.04, side * r * 0.14, r * 0.03, r * 0.02, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function traceWool(ctx: CanvasRenderingContext2D, r: number, scale = 1, shift = 0): void {
  const puffs: [number, number, number][] = [
    [-0.06, 0, 0.56],
    [-0.46, 0, 0.4],
    [0.26, 0, 0.34],
    [-0.16, -0.3, 0.32],
    [-0.16, 0.3, 0.32],
    [0.06, -0.18, 0.26],
    [0.06, 0.18, 0.26],
  ]
  ctx.beginPath()
  for (const [x, y, rad] of puffs) {
    const cx = (x * scale + shift) * r
    const cy = y * scale * r
    const cr = rad * scale * r
    ctx.moveTo(cx + cr, cy)
    ctx.arc(cx, cy, cr, 0, Math.PI * 2)
  }
}

function drawEar(ctx: CanvasRenderingContext2D, r: number, side: number, coat: string, flop: number): void {
  ctx.save()
  ctx.translate(r * 0.58, side * r * 0.4)
  ctx.rotate(side * (0.85 + flop))
  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.24, r * 0.15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = coat
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.18, r * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f3b7c4'
  ctx.beginPath()
  ctx.ellipse(r * 0.02, 0, r * 0.09, r * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHorn(ctx: CanvasRenderingContext2D, r: number, side: number): void {
  ctx.save()
  ctx.strokeStyle = '#e7d3a4'
  ctx.lineWidth = r * 0.13
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(r * 0.7, side * r * 0.16)
  ctx.bezierCurveTo(r * 0.42, side * r * 0.55, r * 0.28, side * r * 0.95, r * 0.62, side * r * 1.12)
  ctx.bezierCurveTo(r * 0.92, side * r * 1.26, r * 1.08, side * r * 0.92, r * 0.9, side * r * 0.78)
  ctx.stroke()
  ctx.strokeStyle = '#b08948'
  ctx.lineWidth = r * 0.045
  ctx.stroke()
  ctx.restore()
}

function drawBeard(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.fillStyle = OUTLINE
  const tufts: [number, number, number][] = [
    [1.02, 0.2, 0.13],
    [1.14, 0.08, 0.11],
    [1.0, 0.32, 0.1],
  ]
  for (const [x, y, rad] of tufts) {
    ctx.beginPath()
    ctx.arc(x * r, y * r, rad * r + 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f4ead8'
  for (const [x, y, rad] of tufts) {
    ctx.beginPath()
    ctx.arc(x * r, y * r, rad * r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  goat: Goat,
  time: number,
  r: number,
  coat: string,
): void {
  const blink = !goat.dead && Math.sin(time * 1.7 + goat.blinkOffset) > 0.97
  const ex = r * 0.96
  ctx.fillStyle = '#fffdf8'
  ctx.beginPath()
  ctx.ellipse(ex, -r * 0.11, r * 0.1, blink ? r * 0.018 : r * 0.11, 0, 0, Math.PI * 2)
  ctx.ellipse(ex, r * 0.11, r * 0.1, blink ? r * 0.018 : r * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.4
  ctx.stroke()
  if (!blink) {
    ctx.fillStyle = '#24180f'
    ctx.beginPath()
    ctx.arc(ex + r * 0.035, -r * 0.11, r * 0.05, 0, Math.PI * 2)
    ctx.arc(ex + r * 0.035, r * 0.11, r * 0.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex + r * 0.05, -r * 0.13, r * 0.02, 0, Math.PI * 2)
    ctx.arc(ex + r * 0.05, r * 0.09, r * 0.02, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(232, 120, 140, 0.45)'
  ctx.beginPath()
  ctx.ellipse(r * 0.9, -r * 0.2, r * 0.06, r * 0.035, 0, 0, Math.PI * 2)
  ctx.ellipse(r * 0.9, r * 0.2, r * 0.06, r * 0.035, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = shade(coat, 28)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.ellipse(r * 1.12, 0, r * 0.16, r * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#6a3040'
  ctx.beginPath()
  ctx.arc(r * 1.16, -r * 0.035, r * 0.025, 0, Math.PI * 2)
  ctx.arc(r * 1.16, r * 0.035, r * 0.025, 0, Math.PI * 2)
  ctx.fill()
}

function drawHealthBar(ctx: CanvasRenderingContext2D, sx: number, sy: number, goat: Goat): void {
  const w = 58
  const h = 8
  const x = sx - w / 2
  const y = sy - 20
  const pct = Math.max(0, goat.hp / goat.maxHp)
  ctx.fillStyle = 'rgba(20, 16, 12, 0.72)'
  roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 4)
  ctx.fill()
  ctx.fillStyle = pct > 0.55 ? '#7dde6a' : pct > 0.28 ? '#ffcf70' : '#ff5d5d'
  roundRect(ctx, x, y, Math.max(0, w * pct), h, 3)
  ctx.fill()
  ctx.font = '700 12px Fredoka, "Trebuchet MS", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(20, 16, 12, 0.8)'
  const label = goat.team === 'player' ? 'You' : goat.name
  ctx.strokeText(label, sx, y - 1)
  ctx.fillStyle = '#fffaf2'
  ctx.fillText(label, sx, y - 1)
}

function drawBang(ctx: CanvasRenderingContext2D, x: number, y: number, p: number): void {
  const s = 1 + Math.sin(p * 30) * 0.08
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.font = '800 22px Fredoka, "Trebuchet MS", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#2a2118'
  ctx.fillStyle = '#ffcf70'
  ctx.strokeText('!', 0, 0)
  ctx.fillText('!', 0, 0)
  ctx.restore()
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  power: number,
  color: string,
): void {
  const len = 28 + Math.max(0, Math.min(1, power)) * 168
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.lineTo(len, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(len + 16, 0)
  ctx.lineTo(len - 4, -12)
  ctx.lineTo(len - 4, 12)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawPullTether(
  ctx: CanvasRenderingContext2D,
  pull: { origin: { x: number; y: number }; current: { x: number; y: number } },
): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 246, 232, 0.85)'
  ctx.fillStyle = '#fff6e8'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.setLineDash([5, 6])
  ctx.beginPath()
  ctx.moveTo(pull.origin.x, pull.origin.y)
  ctx.lineTo(pull.current.x, pull.current.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(pull.origin.x, pull.origin.y, 5, 0, Math.PI * 2)
  ctx.arc(pull.current.x, pull.current.y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawFence(ctx: CanvasRenderingContext2D, time: number, overtime: boolean): void {
  const a = FENCE
  const b = WORLD - FENCE
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
  ctx.fillRect(a + 8, a + 10, b - a, b - a)

  if (overtime) {
    const flicker = 0.55 + Math.sin(time * 17) * 0.25
    ctx.shadowColor = `rgba(255, 110, 20, ${0.35 + flicker * 0.45})`
    ctx.shadowBlur = 18
  }

  const rail = overtime ? `hsl(${26 + Math.sin(time * 21) * 12}, 100%, ${50 + Math.sin(time * 15) * 8}%)` : '#f7f3ea'
  const railLine = (inset: number, width: number) => {
    ctx.strokeStyle = rail
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.strokeRect(a + inset, a + inset, b - a - inset * 2, b - a - inset * 2)
  }
  railLine(0, overtime ? 9 : 8)
  railLine(16, overtime ? 6 : 5)

  const post = (x: number, y: number) => {
    ctx.fillStyle = overtime ? '#ffe1a8' : '#fffdf8'
    ctx.strokeStyle = overtime ? '#c2410c' : '#d7d0c4'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  for (let i = 0; i <= 8; i++) {
    const t = a + ((b - a) * i) / 8
    post(t, a)
    post(t, b)
    if (i !== 0 && i !== 8) {
      post(a, t)
      post(b, t)
    }
  }
  ctx.restore()
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const alpha = Math.max(0, Math.min(1, p.life / p.max))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(p.x, p.y)
  ctx.rotate(p.angle)
  if (p.kind === 'flame') {
    const h = p.size * (0.8 + alpha)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.moveTo(0, -h)
    ctx.quadraticCurveTo(p.size * 0.7, -h * 0.2, 0, h * 0.35)
    ctx.quadraticCurveTo(-p.size * 0.7, -h * 0.2, 0, -h)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 244, 200, 0.9)'
    ctx.beginPath()
    ctx.moveTo(0, -h * 0.45)
    ctx.quadraticCurveTo(p.size * 0.28, 0, 0, h * 0.15)
    ctx.quadraticCurveTo(-p.size * 0.28, 0, 0, -h * 0.45)
    ctx.fill()
  } else if (p.kind === 'dust') {
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(0, 0, p.size * alpha, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function getField(): HTMLCanvasElement {
  if (fieldCanvas) return fieldCanvas
  const canvas = document.createElement('canvas')
  canvas.width = WORLD
  canvas.height = WORLD
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const rand = mulberry32(20260318)
  ctx.fillStyle = '#2c7e3a'
  ctx.fillRect(0, 0, WORLD, WORLD)
  for (let y = 0; y < WORLD; y += 26) {
    ctx.fillStyle = y % 52 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)'
    ctx.fillRect(0, y, WORLD, 26)
  }
  ctx.fillStyle = '#43a352'
  ctx.fillRect(FENCE - 6, FENCE - 6, WORLD - (FENCE - 6) * 2, WORLD - (FENCE - 6) * 2)

  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  for (let i = 0; i < 900; i++) {
    const x = rand() * WORLD
    const y = rand() * WORLD
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(18, 70, 28, 0.28)' : 'rgba(255,255,255,0.16)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rand() - 0.5) * 5, y - 5 - rand() * 9)
    ctx.stroke()
  }
  const flowers = ['#fff6d8', '#ffd0e0', '#ffe566', '#ffffff', '#ffb6c8']
  for (let i = 0; i < 70; i++) {
    const x = rand() * WORLD
    const y = rand() * WORLD
    ctx.fillStyle = flowers[(rand() * flowers.length) | 0] ?? '#fff'
    ctx.beginPath()
    ctx.arc(x, y, 1.8 + rand() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  const worn = ctx.createRadialGradient(WORLD / 2, WORLD / 2, 30, WORLD / 2, WORLD / 2, 260)
  worn.addColorStop(0, 'rgba(122, 92, 48, 0.2)')
  worn.addColorStop(1, 'rgba(122, 92, 48, 0)')
  ctx.fillStyle = worn
  ctx.beginPath()
  ctx.arc(WORLD / 2, WORLD / 2, 260, 0, Math.PI * 2)
  ctx.fill()

  fieldCanvas = canvas
  return canvas
}
