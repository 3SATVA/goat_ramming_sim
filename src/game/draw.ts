import { roundShape } from './arena'
import { FENCE, HUD_BAND } from './constants'
import { eventCopy } from './progress'
import type { Goat, Hazard, Particle, Theme, World } from './types'
import { mixHex, mulberry32, roundRect, shade } from './util'

export interface Camera {
  x: number
  y: number
  s: number
}

const fieldCache = new Map<string, HTMLCanvasElement>()

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  time: number,
  pull: { origin: { x: number; y: number }; current: { x: number; y: number } } | null,
): void {
  const field = getField(world.theme, world.width, world.height)
  ctx.drawImage(field, 0, 0)
  for (const hazard of world.hazards) {
    if (hazard.kind === 'dune') drawDune(ctx, hazard)
  }
  for (const hazard of world.hazards) {
    if (hazard.kind === 'rock') drawRock(ctx, hazard)
  }
  const living = world.goats.filter((g) => !g.dead)
  const down = world.goats.filter((g) => g.dead)
  for (const goat of down) drawGoat(ctx, goat, time, offsetFor(goat))
  for (const goat of living) {
    if (goat.team === 'player' && !goat.dead) drawPlayerRing(ctx, goat, time)
    drawGoat(ctx, goat, time, offsetFor(goat))
  }
  drawWeather(ctx, world, time)
  for (const hazard of world.hazards) {
    if (hazard.kind === 'spike') drawSpike(ctx, hazard, time)
  }
  drawZones(ctx, world, time)
  for (const goat of living) {
    if (goat.chill > 0) drawChill(ctx, goat)
  }
  drawFence(
    ctx,
    world,
    time,
    world.overtime && (world.mode === 'playing' || world.mode === 'paused' || world.mode === 'countdown'),
  )
  for (const particle of world.particles) drawParticle(ctx, particle)
  for (const goat of world.goats) {
    if (goat.dead) continue
    if (goat.team === 'player' && goat.charging) {
      drawAim(ctx, goat.x, goat.y, goat.chargeAngle, goat.chargePower, mixHex('#b6f27a', '#ff4d3a', goat.chargePower))
      if (pull) drawPullTether(ctx, pull)
    } else if (goat.team === 'enemy' && goat.ai === 'windup') {
      const p = 1 - goat.aiTimer / Math.max(0.001, goat.aiWindup)
      const alpha = 0.55 + Math.min(1, p) * 0.45
      if (goat.tell === 'breath') drawBreathTell(ctx, goat, p)
      else if (goat.tell === 'vortex') drawVortexTell(ctx, goat, time, p)
      else if (goat.tell === 'combo') {
        const color = telegraphColor(goat, alpha)
        drawAim(ctx, goat.x, goat.y, goat.aimAngle - 0.34, Math.max(0.22, p * 0.82), color)
        drawAim(ctx, goat.x, goat.y, goat.aimAngle, Math.max(0.28, p), color)
        drawAim(ctx, goat.x, goat.y, goat.aimAngle + 0.34, Math.max(0.22, p * 0.82), color)
      } else {
        drawAim(ctx, goat.x, goat.y, goat.aimAngle, Math.max(0.18, p), telegraphColor(goat, alpha))
      }
    }
    if (goat.team === 'player' && goat.cooldown > 0 && goat.cooldownMax > 0) drawCooldown(ctx, goat)
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
      const label = goat.tell === 'combo' ? 'x3' : goat.tell === 'breath' ? 'ICE' : goat.tell === 'vortex' ? 'VORTEX' : '!'
      drawBang(ctx, sx, sy - 28, 1 - goat.aiTimer / Math.max(0.001, goat.aiWindup), label)
    }
  }

  drawOffscreen(ctx, world, cam, viewW, viewH)

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

  const boss = world.goats.find((g) => g.role === 'boss')
  const fighting = world.mode === 'playing' || world.mode === 'countdown' || world.mode === 'paused'
  if (boss && fighting) {
    const w = Math.min(460, viewW - 48)
    const h = 16
    const x = (viewW - w) / 2
    const y = 78
    const pct = Math.max(0, boss.hp / boss.maxHp)
    ctx.fillStyle = 'rgba(20, 16, 12, 0.82)'
    roundRect(ctx, x - 4, y - 22, w + 8, h + 28, 10)
    ctx.fill()
    ctx.font = '700 14px Fredoka, "Trebuchet MS", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = '#ffcf70'
    ctx.fillText(boss.name, x, y - 2)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#fff6e8'
    ctx.fillText(String(Math.max(0, Math.ceil(boss.hp))), x + w, y - 2)
    ctx.fillStyle = '#2a2118'
    roundRect(ctx, x, y, w, h, 6)
    ctx.fill()
    ctx.fillStyle = pct > 0.55 ? '#ffb15a' : pct > 0.28 ? '#ffcf70' : '#ff5d5d'
    roundRect(ctx, x, y, Math.max(0, w * pct), h, 6)
    ctx.fill()
  }

  if (world.eventBanner > 0 && world.event !== 'clear' && fighting) {
    const copy = eventCopy(world.event)
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, world.eventBanner))
    ctx.font = '700 28px Fredoka, "Trebuchet MS", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineWidth = 6
    ctx.strokeStyle = '#2a2118'
    ctx.fillStyle = world.event === 'snowstorm' ? '#e7f6ff' : world.event === 'sandstorm' ? '#ffcf70' : '#fff6e8'
    const y = boss ? 132 : 86
    ctx.strokeText(copy.title, viewW / 2, y)
    ctx.fillText(copy.title, viewW / 2, y)
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
  if (goat.role === 'boss' && !goat.dead) {
    ctx.strokeStyle = goat.boss === 'frost' ? '#b9e6ff' : goat.boss === 'dune' ? '#ffcf70' : '#ffb15a'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2)
    ctx.stroke()
  }
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

function drawBang(ctx: CanvasRenderingContext2D, x: number, y: number, p: number, label = '!'): void {
  const s = 1 + Math.sin(p * 30) * 0.08
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.font = label.length > 2 ? '800 15px Fredoka, "Trebuchet MS", sans-serif' : '800 22px Fredoka, "Trebuchet MS", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#1a120c'
  ctx.fillStyle = label === 'ICE' ? '#d7f4ff' : '#ffe14a'
  ctx.strokeText(label, 0, 0)
  ctx.fillText(label, 0, 0)
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

function drawOffscreen(ctx: CanvasRenderingContext2D, world: World, cam: Camera, viewW: number, viewH: number): void {
  if (world.mode !== 'playing' && world.mode !== 'countdown' && world.mode !== 'paused') return
  const margin = 26
  const top = HUD_BAND + 8
  for (const goat of world.goats) {
    if (goat.team !== 'enemy' || goat.dead) continue
    const sx = cam.x + goat.x * cam.s
    const sy = cam.y + goat.y * cam.s
    if (sx > margin && sx < viewW - margin && sy > top && sy < viewH - margin) continue
    const x = Math.min(viewW - margin, Math.max(margin, sx))
    const y = Math.min(viewH - margin, Math.max(top, sy))
    const ang = Math.atan2(sy - viewH / 2, sx - viewW / 2)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    ctx.fillStyle = goat.color
    ctx.strokeStyle = '#1a120c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(16, 0)
    ctx.lineTo(-9, -9)
    ctx.lineTo(-9, 9)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
}

function drawFence(ctx: CanvasRenderingContext2D, world: World, time: number, overtime: boolean): void {
  const theme = world.theme
  const calmRail = theme === 'ice' ? '#e7f6ff' : theme === 'desert' ? '#d7b07a' : '#f7f3ea'
  const calmPost = theme === 'ice' ? '#f4fbff' : theme === 'desert' ? '#f0ddb0' : '#fffdf8'
  const calmStroke = theme === 'ice' ? '#9ec4d8' : theme === 'desert' ? '#8a6238' : '#d7d0c4'
  const rail = overtime ? `hsl(${26 + Math.sin(time * 21) * 12}, 100%, ${50 + Math.sin(time * 15) * 8}%)` : calmRail
  ctx.save()
  if (overtime) {
    const flicker = 0.55 + Math.sin(time * 17) * 0.25
    ctx.shadowColor = `rgba(255, 110, 20, ${0.35 + flicker * 0.45})`
    ctx.shadowBlur = 18
  }
  const post = (x: number, y: number) => {
    ctx.fillStyle = overtime ? '#ffe1a8' : calmPost
    ctx.strokeStyle = overtime ? '#c2410c' : calmStroke
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (roundShape(world.shape)) {
    const cx = world.width / 2
    const cy = world.height / 2
    const rx = world.width / 2 - FENCE
    const ry = world.height / 2 - FENCE
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.beginPath()
    ctx.ellipse(cx + 6, cy + 8, Math.max(8, rx - 10), Math.max(8, ry - 10), 0, 0, Math.PI * 2)
    ctx.fill()
    const ring = (inset: number, width: number) => {
      ctx.strokeStyle = rail
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(8, rx - inset), Math.max(8, ry - inset), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ring(0, overtime ? 9 : 8)
    ring(16, overtime ? 6 : 5)
    const steps = Math.max(12, Math.round((rx + ry) / 70))
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2
      post(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry)
    }
  } else {
    const a = FENCE
    const right = world.width - FENCE
    const bottom = world.height - FENCE
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.fillRect(a + 8, a + 10, right - a, bottom - a)
    const railLine = (inset: number, width: number) => {
      ctx.strokeStyle = rail
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.strokeRect(a + inset, a + inset, right - a - inset * 2, bottom - a - inset * 2)
    }
    railLine(0, overtime ? 9 : 8)
    railLine(16, overtime ? 6 : 5)
    const xSteps = Math.max(4, Math.round(world.width / 140))
    const ySteps = Math.max(4, Math.round(world.height / 140))
    for (let i = 0; i <= xSteps; i++) {
      const t = a + ((right - a) * i) / xSteps
      post(t, a)
      post(t, bottom)
    }
    for (let i = 1; i < ySteps; i++) {
      const t = a + ((bottom - a) * i) / ySteps
      post(a, t)
      post(right, t)
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

function getField(theme: Theme, w: number, h: number): HTMLCanvasElement {
  const key = `${theme}:${w}x${h}`
  const cached = fieldCache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  if (theme === 'ice') paintIce(ctx, w, h)
  else if (theme === 'desert') paintDesert(ctx, w, h)
  else paintYard(ctx, w, h)
  fieldCache.set(key, canvas)
  return canvas
}

function paintYard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = mulberry32(20260318)
  ctx.fillStyle = '#2c7e3a'
  ctx.fillRect(0, 0, w, h)
  for (let y = 0; y < h; y += 26) {
    ctx.fillStyle = y % 52 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)'
    ctx.fillRect(0, y, w, 26)
  }
  ctx.fillStyle = '#43a352'
  ctx.fillRect(FENCE - 6, FENCE - 6, w - (FENCE - 6) * 2, h - (FENCE - 6) * 2)

  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  const blades = Math.round(900 * (w / 800) * (h / 800))
  for (let i = 0; i < blades; i++) {
    const x = rand() * w
    const y = rand() * h
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(18, 70, 28, 0.28)' : 'rgba(255,255,255,0.16)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rand() - 0.5) * 5, y - 5 - rand() * 9)
    ctx.stroke()
  }
  const flowers = ['#fff6d8', '#ffd0e0', '#ffe566', '#ffffff', '#ffb6c8']
  const blooms = Math.round(70 * Math.sqrt((w * h) / (800 * 800)))
  for (let i = 0; i < blooms; i++) {
    const x = rand() * w
    const y = rand() * h
    ctx.fillStyle = flowers[(rand() * flowers.length) | 0] ?? '#fff'
    ctx.beginPath()
    ctx.arc(x, y, 1.8 + rand() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  const worn = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, 260)
  worn.addColorStop(0, 'rgba(122, 92, 48, 0.2)')
  worn.addColorStop(1, 'rgba(122, 92, 48, 0)')
  ctx.fillStyle = worn
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, 260, 0, Math.PI * 2)
  ctx.fill()
}

function paintIce(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = mulberry32(71)
  ctx.fillStyle = '#c5dcea'
  ctx.fillRect(0, 0, w, h)
  for (let y = 0; y < h; y += 28) {
    ctx.fillStyle = y % 56 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(90, 130, 160, 0.08)'
    ctx.fillRect(0, y, w, 28)
  }
  ctx.fillStyle = '#e7f3fb'
  ctx.fillRect(FENCE - 6, FENCE - 6, w - (FENCE - 6) * 2, h - (FENCE - 6) * 2)
  const cracks = Math.round(240 * Math.sqrt((w * h) / (800 * 800)))
  for (let i = 0; i < cracks; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1.2
    const x = rand() * w
    const y = rand() * h
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 18 + rand() * 30, y + (rand() - 0.5) * 6)
    ctx.stroke()
  }
  for (let i = 0; i < Math.round(cracks * 0.66); i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(170, 206, 226, 0.7)'
    ctx.beginPath()
    ctx.arc(rand() * w, rand() * h, 1.2 + rand() * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintDesert(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = mulberry32(19)
  ctx.fillStyle = '#c4954e'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#e0b56a'
  ctx.fillRect(FENCE - 6, FENCE - 6, w - (FENCE - 6) * 2, h - (FENCE - 6) * 2)
  ctx.fillStyle = 'rgba(168, 112, 52, 0.35)'
  for (let i = 0; i < 7; i++) {
    const y = FENCE + 80 + ((h - FENCE * 2 - 120) * i) / 6
    ctx.beginPath()
    ctx.ellipse(w / 2, y, w * 0.42, 28, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const specks = Math.round(90 * Math.sqrt((w * h) / (800 * 800)))
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = rand() > 0.6 ? 'rgba(120, 72, 32, 0.35)' : 'rgba(255, 236, 190, 0.35)'
    ctx.beginPath()
    ctx.arc(rand() * w, rand() * h, 1.4 + rand() * 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawDune(ctx: CanvasRenderingContext2D, hazard: Hazard): void {
  ctx.save()
  ctx.fillStyle = 'rgba(196, 146, 72, 0.55)'
  ctx.beginPath()
  ctx.ellipse(hazard.x, hazard.y, hazard.r, hazard.r * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(120, 78, 36, 0.35)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()
}

function drawRock(ctx: CanvasRenderingContext2D, hazard: Hazard): void {
  ctx.save()
  ctx.translate(hazard.x, hazard.y)
  ctx.fillStyle = '#8d8a84'
  ctx.strokeStyle = '#3e3c38'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-hazard.r * 0.2, -hazard.r * 0.85)
  ctx.lineTo(hazard.r * 0.85, -hazard.r * 0.15)
  ctx.lineTo(hazard.r * 0.55, hazard.r * 0.75)
  ctx.lineTo(-hazard.r * 0.7, hazard.r * 0.55)
  ctx.lineTo(-hazard.r * 0.9, -hazard.r * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath()
  ctx.ellipse(-hazard.r * 0.1, -hazard.r * 0.2, hazard.r * 0.28, hazard.r * 0.16, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSpike(ctx: CanvasRenderingContext2D, hazard: Hazard, time: number): void {
  ctx.save()
  ctx.translate(hazard.x, hazard.y)
  ctx.fillStyle = 'rgba(26, 18, 12, 0.38)'
  ctx.beginPath()
  ctx.ellipse(4, 16, 42, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  const warn = 0.22 + Math.sin(time * 4 + hazard.x * 0.01) * 0.06
  ctx.fillStyle = `rgba(255, 54, 42, ${warn})`
  ctx.strokeStyle = 'rgba(255, 70, 48, 0.9)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.ellipse(0, 10, 40, 16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  const blades = [
    { x: -24, h: 50, w: 13 },
    { x: 24, h: 46, w: 12 },
    { x: 0, h: 72, w: 16 },
  ]
  const glint = 0.45 + Math.sin(time * 5 + hazard.y * 0.02) * 0.35
  for (const blade of blades) {
    ctx.fillStyle = 'rgba(26, 18, 12, 0.4)'
    ctx.beginPath()
    ctx.moveTo(blade.x + 3, 10 - blade.h)
    ctx.lineTo(blade.x + blade.w + 3, 12)
    ctx.lineTo(blade.x - blade.w + 3, 12)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(blade.x, 6 - blade.h)
    ctx.lineTo(blade.x + blade.w, 8)
    ctx.lineTo(blade.x - blade.w, 8)
    ctx.closePath()
    ctx.fillStyle = '#ffe14a'
    ctx.fill()
    ctx.lineWidth = 3.5
    ctx.strokeStyle = '#1a120c'
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 255, 255, ${glint})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(blade.x - 2, 2 - blade.h * 0.78)
    ctx.lineTo(blade.x - 1, -blade.h * 0.42)
    ctx.stroke()
  }
  ctx.restore()
}

function drawZones(ctx: CanvasRenderingContext2D, world: World, time: number): void {
  for (const zone of world.zones) {
    const fade = Math.max(0.15, Math.min(1, zone.life / Math.max(0.001, zone.max)))
    ctx.save()
    if (zone.kind === 'ice') {
      ctx.fillStyle = `rgba(186, 232, 255, ${0.34 * fade})`
      ctx.strokeStyle = `rgba(236, 252, 255, ${0.9 * fade})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(zone.x, zone.y, zone.r, zone.r * 0.72, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * fade})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(zone.x - zone.r * 0.45, zone.y)
      ctx.lineTo(zone.x + zone.r * 0.1, zone.y - zone.r * 0.18)
      ctx.lineTo(zone.x + zone.r * 0.42, zone.y + zone.r * 0.08)
      ctx.stroke()
    } else {
      ctx.translate(zone.x, zone.y)
      ctx.rotate(time * 2.4)
      ctx.fillStyle = `rgba(214, 146, 48, ${0.22 * fade})`
      ctx.beginPath()
      ctx.arc(0, 0, zone.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(255, 207, 70, ${0.9 * fade})`
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, zone.r * 0.86, 0.3, Math.PI * 1.45)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, zone.r * 0.48, 1.1, Math.PI * 2.1)
      ctx.stroke()
      ctx.fillStyle = `rgba(255, 225, 74, ${0.85 * fade})`
      ctx.beginPath()
      ctx.arc(0, 0, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawChill(ctx: CanvasRenderingContext2D, goat: Goat): void {
  ctx.save()
  ctx.translate(goat.x, goat.y)
  ctx.strokeStyle = 'rgba(210, 244, 255, 0.95)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(0, 0, goat.radius + 14, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawBreathTell(ctx: CanvasRenderingContext2D, goat: Goat, p: number): void {
  const reach = 90 + Math.max(0, Math.min(1, p)) * 290
  const half = 0.62
  ctx.save()
  ctx.translate(goat.x, goat.y)
  ctx.rotate(goat.aimAngle)
  ctx.beginPath()
  ctx.moveTo(18, 0)
  ctx.arc(0, 0, reach, -half, half)
  ctx.closePath()
  ctx.fillStyle = `rgba(170, 230, 255, ${0.16 + p * 0.28})`
  ctx.fill()
  ctx.strokeStyle = `rgba(236, 252, 255, ${0.75 + p * 0.25})`
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.restore()
}

function drawVortexTell(ctx: CanvasRenderingContext2D, goat: Goat, time: number, p: number): void {
  const pulse = 1 + Math.sin(time * 12) * 0.05
  const r = (48 + Math.max(0, Math.min(1, p)) * 72) * pulse
  ctx.save()
  ctx.translate(goat.markX, goat.markY)
  ctx.rotate(time * 3)
  ctx.fillStyle = `rgba(255, 186, 48, ${0.16 + p * 0.22})`
  ctx.strokeStyle = `rgba(255, 225, 74, ${0.85})`
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.62, 0.4, Math.PI * 1.5)
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.font = '800 16px Fredoka, "Trebuchet MS", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#1a120c'
  ctx.fillStyle = '#ffe14a'
  ctx.strokeText('VORTEX', goat.markX, goat.markY - r - 6)
  ctx.fillText('VORTEX', goat.markX, goat.markY - r - 6)
  ctx.restore()
}

function drawWeather(ctx: CanvasRenderingContext2D, world: World, time: number): void {
  const w = world.width
  const h = world.height
  if (world.event === 'rain' || world.event === 'fog' || world.event === 'snowstorm' || world.event === 'sandstorm' || world.event === 'wind') {
    ctx.save()
    if (world.event === 'fog') {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.12, w / 2, h / 2, Math.min(w, h) * 0.62)
      g.addColorStop(0, 'rgba(232, 236, 238, 0)')
      g.addColorStop(1, 'rgba(214, 220, 224, 0.72)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    } else if (world.event === 'snowstorm') {
      ctx.fillStyle = `rgba(245, 250, 255, ${0.34 + Math.sin(time * 1.4) * 0.06})`
      ctx.fillRect(0, 0, w, h)
    } else if (world.event === 'sandstorm') {
      ctx.fillStyle = 'rgba(168, 112, 48, 0.28)'
      ctx.fillRect(0, 0, w, h)
    }
    const streaks = world.event === 'snowstorm' ? 80 : world.event === 'sandstorm' ? 70 : world.event === 'rain' ? 60 : world.event === 'wind' ? 36 : 0
    const angle = world.event === 'snowstorm' || world.event === 'sandstorm' || world.event === 'wind' ? world.windAngle : Math.PI / 2 + 0.25
    ctx.strokeStyle =
      world.event === 'snowstorm'
        ? 'rgba(255,255,255,0.85)'
        : world.event === 'sandstorm'
          ? 'rgba(92, 58, 24, 0.45)'
          : world.event === 'rain'
            ? 'rgba(190, 220, 255, 0.55)'
            : 'rgba(255,255,255,0.28)'
    ctx.lineWidth = world.event === 'sandstorm' ? 3 : 2
    for (let i = 0; i < streaks; i++) {
      const x = ((i * 97 + time * (world.event === 'snowstorm' ? 40 : 180)) % w)
      const y = ((i * 53 + time * (world.event === 'rain' ? 320 : 90)) % h)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(angle) * (world.event === 'snowstorm' ? 10 : 22), y + Math.sin(angle) * (world.event === 'snowstorm' ? 10 : 22))
      ctx.stroke()
    }
    ctx.restore()
  }
  if (world.event === 'mud') {
    ctx.save()
    ctx.fillStyle = 'rgba(92, 64, 32, 0.18)'
    ctx.fillRect(FENCE, FENCE, w - FENCE * 2, h - FENCE * 2)
    ctx.restore()
  }
}

function drawCooldown(ctx: CanvasRenderingContext2D, goat: Goat): void {
  const p = Math.max(0, Math.min(1, 1 - goat.cooldown / goat.cooldownMax))
  ctx.save()
  ctx.translate(goat.x, goat.y)
  ctx.strokeStyle = 'rgba(255, 246, 232, 0.95)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, goat.radius + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p)
  ctx.stroke()
  ctx.restore()
}

function telegraphColor(goat: Goat, alpha: number): string {
  if (goat.boss === 'frost') return `rgba(150, 220, 255, ${alpha})`
  if (goat.boss === 'dune') return `rgba(255, 196, 70, ${alpha})`
  if (goat.boss === 'yard') return `rgba(255, 120, 48, ${alpha})`
  return `rgba(255, 78, 48, ${alpha})`
}
