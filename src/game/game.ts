import { AudioBus } from './audio'
import { HUD_BAND, MAX_DRAG_PX, MIN_POWER, WORLD } from './constants'
import type { Camera } from './draw'
import { drawOverlay, drawWorld, paintPortrait } from './draw'
import {
  createWorld,
  difficulty,
  getPlayer,
  launchGoat,
  setupMatch,
  spawnMenuGoat,
  step,
} from './sim'
import type { EndResult, HudModel, Mode, SimHooks, World } from './types'
import { formatTime, isHexColor } from './util'

const STEP = 1 / 60

export interface GamePorts {
  canvas: HTMLCanvasElement
  logo: HTMLCanvasElement | null
  preview: HTMLCanvasElement | null
  audio: AudioBus
  isMuted: () => boolean
  onMode: (mode: Mode, end: EndResult | null) => void
  onHud: (hud: HudModel) => void
}

export interface Snapshot {
  mode: Mode
  round: number
  timeLeft: number
  overtime: boolean
  goats: { name: string; team: string; hp: number; x: number; y: number; ignite: number; ai: string; plan: string; dead: boolean }[]
}

export class Game {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly audio: AudioBus
  private readonly logo: HTMLCanvasElement | null
  private readonly preview: HTMLCanvasElement | null
  private readonly isMuted: () => boolean
  private readonly onMode: GamePorts['onMode']
  private readonly onHud: GamePorts['onHud']
  private readonly hooks: SimHooks
  private readonly world: World
  private cam: Camera = { x: 0, y: 0, s: 1 }
  private dpr = 1
  private viewW = 1
  private viewH = 1
  private acc = 0
  private anim = 0
  private last = 0
  private dragId: number | null = null
  private dragX = 0
  private dragY = 0
  private pull: { origin: { x: number; y: number }; current: { x: number; y: number } } | null = null
  private modeKey = ''
  private hudKey = ''
  private debug: boolean

  constructor(ports: GamePorts) {
    const ctx = ports.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    this.canvas = ports.canvas
    this.ctx = ctx
    this.audio = ports.audio
    this.logo = ports.logo
    this.preview = ports.preview
    this.isMuted = ports.isMuted
    this.onMode = ports.onMode
    this.onHud = ports.onHud
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const params = new URLSearchParams(location.search)
    this.debug = params.has('debug')
    this.world = createWorld('#f3ecdf', 3, reduce)
    this.hooks = {
      thud: (intensity) => this.audio.thud(intensity),
      bleat: (team) => this.audio.bleat(team),
      whoosh: (power) => this.audio.whoosh(power),
      burn: () => this.audio.burn(),
      ko: () => this.audio.ko(),
      overtime: () => this.audio.overtime(),
      crackle: () => this.audio.crackle(),
      finish: (result) => {
        if (result.result === 'win') this.audio.win()
        else if (result.result === 'lose') this.audio.lose()
        else this.audio.draw()
      },
    }
    this.onDown = this.onDown.bind(this)
    this.onMove = this.onMove.bind(this)
    this.onUp = this.onUp.bind(this)
    this.frame = this.frame.bind(this)
    this.resize = this.resize.bind(this)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault())
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' && event.key !== 'p' && event.key !== 'P') return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (this.world.mode === 'playing' || this.world.mode === 'countdown') this.pause()
      else if (this.world.mode === 'paused') this.resume()
    })
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return
      if (this.world.mode === 'playing' || this.world.mode === 'countdown') this.pause()
    })
    const observer = new ResizeObserver(() => this.resize())
    observer.observe(this.canvas)
    this.resize()
    requestAnimationFrame(this.frame)
  }

  applySettings(color: string, minutes: 2 | 3): void {
    this.setColor(color)
    this.setMinutes(minutes)
  }

  setColor(color: string): void {
    if (!isHexColor(color)) return
    this.world.color = color
    const player = getPlayer(this.world)
    if (player && (this.world.mode === 'menu' || this.world.mode === 'customize')) player.color = color
  }

  setMinutes(minutes: 2 | 3): void {
    this.world.minutes = minutes
    if (this.world.mode === 'menu' || this.world.mode === 'customize') {
      this.world.timeLeft = minutes * 60
    }
  }

  openCustomize(): void {
    if (this.world.mode !== 'menu' && this.world.mode !== 'customize') return
    this.world.mode = 'customize'
  }

  closeCustomize(): void {
    if (this.world.mode !== 'customize') return
    this.world.mode = 'menu'
  }

  playFromMenu(): void {
    this.cancelDrag()
    this.world.round = 1
    setupMatch(this.world)
    this.acc = 0
  }

  pause(): void {
    if (this.world.mode !== 'playing' && this.world.mode !== 'countdown') return
    this.cancelDrag()
    this.world.pausedFrom = this.world.mode
    this.world.mode = 'paused'
  }

  resume(): void {
    if (this.world.mode !== 'paused') return
    this.world.mode = this.world.pausedFrom
  }

  retry(): void {
    this.cancelDrag()
    setupMatch(this.world)
    this.acc = 0
  }

  nextRound(): void {
    this.cancelDrag()
    this.world.round += 1
    setupMatch(this.world)
    this.acc = 0
  }

  toMenu(): void {
    this.cancelDrag()
    this.world.mode = 'menu'
    this.world.result = null
    this.world.overtime = false
    this.world.round = 1
    this.world.shake = 0
    spawnMenuGoat(this.world)
    const player = getPlayer(this.world)
    if (player) player.color = this.world.color
  }

  debugRound(round: number): void {
    if (!this.debug) return
    this.cancelDrag()
    this.world.round = Math.max(1, Math.round(round))
    setupMatch(this.world)
    this.world.countdown = 0.05
    this.acc = 0
  }

  skipToOvertime(): void {
    if (!this.debug) return
    if (this.world.mode === 'paused') this.resume()
    if (this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'end') {
      this.playFromMenu()
    }
    this.world.timeLeft = 47
    this.world.overtime = false
    this.world.otBanner = 0
    if (this.world.mode === 'countdown') this.world.countdown = 0.05
  }

  screenGoats(): { name: string; team: string; hp: number; x: number; y: number; r: number }[] {
    const rect = this.canvas.getBoundingClientRect()
    return this.world.goats.map((goat) => ({
      name: goat.name,
      team: goat.team,
      hp: goat.hp,
      x: rect.left + this.cam.x + goat.x * this.cam.s,
      y: rect.top + this.cam.y + goat.y * this.cam.s,
      r: Math.max(24, goat.radius * this.cam.s),
    }))
  }

  snapshot(): Snapshot {
    return {
      mode: this.world.mode,
      round: this.world.round,
      timeLeft: this.world.timeLeft,
      overtime: this.world.overtime,
      goats: this.world.goats.map((g) => ({
        name: g.name,
        team: g.team,
        hp: Math.round(g.hp),
        x: Math.round(g.x),
        y: Math.round(g.y),
        ignite: Math.round(g.ignite * 10) / 10,
        ai: g.ai,
        plan: g.plan,
        dead: g.dead,
      })),
    }
  }

  get debugEnabled(): boolean {
    return this.debug
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, this.last === 0 ? STEP : (now - this.last) / 1000)
    this.last = now
    const frozen = this.world.mode === 'paused' || this.world.hitstop > 0
    if (!frozen) this.anim += dt
    if (this.world.hitstop > 0) {
      this.world.hitstop = Math.max(0, this.world.hitstop - dt)
    } else if (this.world.mode !== 'paused') {
      if (this.world.mode === 'countdown') {
        this.world.countdown -= dt
        if (this.world.countdown <= 0) {
          this.world.mode = 'playing'
          this.world.goBanner = 0.7
          this.audio.bleat('player')
        }
      }
      this.acc += dt
      let guard = 0
      while (this.acc >= STEP && guard++ < 5) {
        if (this.world.hitstop > 0) break
        step(this.world, STEP, this.hooks)
        this.acc -= STEP
      }
      this.world.otBanner = Math.max(0, this.world.otBanner - dt)
      this.world.goBanner = Math.max(0, this.world.goBanner - dt)
    }
    const player = getPlayer(this.world)
    if (this.dragId !== null && player && !player.charging) this.cancelDrag()
    this.layout()
    this.render()
    this.syncUi()
    requestAnimationFrame(this.frame)
  }

  private render(): void {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = '#14341f'
    ctx.fillRect(0, 0, this.viewW, this.viewH)
    let ox = 0
    let oy = 0
    if (this.world.shake > 0.35) {
      ox = (Math.random() * 2 - 1) * this.world.shake
      oy = (Math.random() * 2 - 1) * this.world.shake
    }
    ctx.save()
    ctx.translate(this.cam.x + ox, this.cam.y + oy)
    ctx.scale(this.cam.s, this.cam.s)
    drawWorld(ctx, this.world, this.anim, this.pull)
    ctx.restore()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    drawOverlay(ctx, this.world, this.cam, this.viewW, this.viewH)
    this.paintSides()
  }

  private paintSides(): void {
    const player = getPlayer(this.world)
    if (!player) return
    if (this.logo && (this.world.mode === 'menu' || this.world.mode === 'customize')) {
      paintFitted(this.logo, (ctx, w, h) => paintPortrait(ctx, w, h, player, this.anim))
    }
    if (this.preview && this.world.mode === 'customize') {
      paintFitted(this.preview, (ctx, w, h) => paintPortrait(ctx, w, h, player, this.anim))
    }
  }

  private syncUi(): void {
    const end = this.world.result
    const key = `${this.world.mode}|${end?.result ?? ''}|${end?.reason ?? ''}|${end?.round ?? ''}|${end?.playerHp ?? ''}|${end?.enemyHp ?? ''}`
    if (key !== this.modeKey) {
      this.modeKey = key
      this.onMode(this.world.mode, end)
    }
    const player = getPlayer(this.world)
    const hud: HudModel = {
      visible: this.world.mode === 'playing' || this.world.mode === 'countdown' || this.world.mode === 'paused',
      round: this.world.round,
      rivals: this.world.mode === 'menu' || this.world.mode === 'customize' ? difficulty(1).count : this.world.diff.count,
      timeLeft: this.world.timeLeft,
      overtime: this.world.overtime,
      playerHp: Math.max(0, player?.hp ?? 0),
      playerMax: player?.maxHp ?? 100,
      muted: this.isMuted(),
    }
    const hudKey = `${hud.visible}|${hud.round}|${hud.rivals}|${formatTime(hud.timeLeft)}|${hud.overtime}|${Math.ceil(hud.playerHp)}|${hud.muted}`
    if (hudKey !== this.hudKey) {
      this.hudKey = hudKey
      this.onHud(hud)
    }
  }

  private resize(): void {
    this.layout()
  }

  private layout(): void {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (w < 2 || h < 2) return
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.viewW = w
    this.viewH = h
    const pw = Math.round(w * this.dpr)
    const ph = Math.round(h * this.dpr)
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw
      this.canvas.height = ph
    }
    const hud = this.world.mode === 'playing' || this.world.mode === 'countdown' || this.world.mode === 'paused'
    const top = hud ? HUD_BAND : 0
    const scale = Math.min(w / WORLD, (h - top) / WORLD)
    this.cam.s = Math.max(0.01, scale)
    this.cam.x = (w - WORLD * this.cam.s) / 2
    this.cam.y = top + (h - top - WORLD * this.cam.s) / 2
  }

  private onDown(event: PointerEvent): void {
    if (event.button !== 0) return
    this.audio.unlock()
    if (this.world.mode !== 'playing') return
    const player = getPlayer(this.world)
    if (!player || player.dead) return
    const origin = this.toWorld(event.clientX, event.clientY)
    this.dragId = event.pointerId
    this.dragX = event.clientX
    this.dragY = event.clientY
    player.charging = true
    player.chargePower = 0
    player.chargeAngle = player.facing
    player.vx = 0
    player.vy = 0
    this.pull = { origin, current: origin }
    try {
      this.canvas.setPointerCapture(event.pointerId)
    } catch {
      // Some browsers reject capture during a cancelled gesture.
    }
    event.preventDefault()
  }

  private onMove(event: PointerEvent): void {
    if (event.pointerId !== this.dragId) return
    const player = getPlayer(this.world)
    if (!player || !player.charging) return
    const dx = event.clientX - this.dragX
    const dy = event.clientY - this.dragY
    const dist = Math.hypot(dx, dy)
    player.chargePower = Math.max(0, Math.min(1, dist / MAX_DRAG_PX))
    if (dist > 6) {
      player.chargeAngle = Math.atan2(-dy, -dx)
      player.facing = player.chargeAngle
    }
    if (this.pull) this.pull = { origin: this.pull.origin, current: this.toWorld(event.clientX, event.clientY) }
  }

  private onUp(event: PointerEvent): void {
    if (event.pointerId !== this.dragId) return
    const player = getPlayer(this.world)
    const power = player?.chargePower ?? 0
    const angle = player?.chargeAngle ?? 0
    const wasCharging = player?.charging ?? false
    this.cancelDrag()
    if (!player || !wasCharging) return
    if (this.world.mode !== 'playing' || player.dead || power < MIN_POWER) return
    launchGoat(this.world, player, angle, power, 1, this.hooks)
    try {
      navigator.vibrate?.(10 + Math.round(power * 18))
    } catch {
      // Vibration is optional juice.
    }
  }

  private cancelDrag(): void {
    this.dragId = null
    this.pull = null
    const player = getPlayer(this.world)
    if (player) player.charging = false
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - this.cam.x) / this.cam.s,
      y: (clientY - rect.top - this.cam.y) / this.cam.s,
    }
  }
}

function paintFitted(
  canvas: HTMLCanvasElement,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): void {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w < 2 || h < 2) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw(ctx, w, h)
}

export function nextRoundLabel(round: number): string {
  const next = difficulty(round + 1)
  const label = next.count === 1 ? '1 rival' : `${next.count} rivals`
  return `Next round · ${label}`
}
