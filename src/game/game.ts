import { AudioBus } from './audio'
import { HUD_BAND, MAX_DRAG_PX, MIN_POWER } from './constants'
import type { Camera } from './draw'
import { drawOverlay, drawWorld, paintPortrait } from './draw'
import {
  allLevels,
  buildQuick,
  buildStory,
  isUnlocked,
  loadoutFrom,
  STATS,
  upgradeCost,
  type FightPlan,
  type Progress,
  type StatId,
} from './progress'
import {
  applyPlan,
  createWorld,
  getPlayer,
  launchGoat,
  setupMatch,
  spawnMenuGoat,
  step,
} from './sim'
import type { EndResult, HudModel, Mode, SimHooks, Theme, World } from './types'
import { formatTime, isHexColor } from './util'

const STEP = 1 / 60

export interface GamePorts {
  canvas: HTMLCanvasElement
  logo: HTMLCanvasElement | null
  preview: HTMLCanvasElement | null
  audio: AudioBus
  isMuted: () => boolean
  /** Bottom edge of the DOM HUD in CSS px (includes the notch inset). 0 when unknown. */
  hudBottom?: () => number
  onMode: (mode: Mode, end: EndResult | null) => void
  onHud: (hud: HudModel) => void
  onProgress: (progress: Progress) => void
}

export interface Snapshot {
  mode: Mode
  round: number
  timeLeft: number
  overtime: boolean
  fight: 'story' | 'quick'
  levelName: string
  chapterName: string
  event: string
  theme: Theme
  size: number
  shape: string
  width: number
  height: number
  cam: { x: number; y: number; s: number }
  view: { w: number; h: number }
  coins: number
  cleared: number
  hazards: number
  spikes: { x: number; y: number; r: number }[]
  zones: { kind: string; x: number; y: number; r: number; life: number }[]
  goats: {
    name: string
    team: string
    role: string
    boss: string | null
    hp: number
    maxHp: number
    x: number
    y: number
    ignite: number
    ai: string
    plan: string
    tell: string | null
    chill: number
    damageMul: number
    mass: number
    speedMul: number
    cooldown: number
    dead: boolean
    charging: boolean
    chargePower: number
  }[]
}

export class Game {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly audio: AudioBus
  private readonly logo: HTMLCanvasElement | null
  private readonly preview: HTMLCanvasElement | null
  private readonly isMuted: () => boolean
  private readonly hudBottom: () => number
  private band = HUD_BAND
  private arenaTop = HUD_BAND
  private maxDrag = MAX_DRAG_PX
  private readonly onMode: GamePorts['onMode']
  private readonly onHud: GamePorts['onHud']
  private readonly onProgress: GamePorts['onProgress']
  private readonly hooks: SimHooks
  private readonly world: World
  private progress: Progress = { coins: 0, upgrades: { power: 0, hp: 0, weight: 0, speed: 0, recharge: 0, fire: 0 }, cleared: 0 }
  /** Theme of the fight you just played. Quick fights pick a different one. */
  private lastTheme: Theme | null = null
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
  private preferredMinutes: 2 | 3 = 3

  constructor(ports: GamePorts) {
    const ctx = ports.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    this.canvas = ports.canvas
    this.ctx = ctx
    this.audio = ports.audio
    this.logo = ports.logo
    this.preview = ports.preview
    this.isMuted = ports.isMuted
    this.hudBottom = ports.hudBottom ?? (() => 0)
    this.onMode = ports.onMode
    this.onHud = ports.onHud
    this.onProgress = ports.onProgress
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
      weather: (kind) => (kind === 'snow' ? this.audio.snow() : this.audio.sand()),
      finish: (result) => {
        if (result.result === 'win') {
          this.progress.coins += result.coins
          if (result.fight === 'story') this.progress.cleared = Math.max(this.progress.cleared, result.round)
          this.onProgress(this.progress)
          this.audio.win()
        } else if (result.result === 'lose') this.audio.lose()
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
    window.addEventListener('orientationchange', this.resize)
    window.visualViewport?.addEventListener('resize', this.resize)
    this.resize()
    requestAnimationFrame(this.frame)
  }

  applySettings(color: string, minutes: 2 | 3): void {
    this.setColor(color)
    this.setMinutes(minutes)
  }

  setProgress(progress: Progress): void {
    this.progress = progress
    this.applyLoadout()
  }

  currentProgress(): Progress {
    return this.progress
  }

  setColor(color: string): void {
    if (!isHexColor(color)) return
    this.world.color = color
    const player = getPlayer(this.world)
    const browsing = this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'story' || this.world.mode === 'upgrades'
    if (player && browsing) player.color = color
  }

  setMinutes(minutes: 2 | 3): void {
    this.preferredMinutes = minutes
    this.world.minutes = minutes
    if (this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'story' || this.world.mode === 'upgrades') {
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

  openStory(): void {
    if (this.world.mode !== 'menu') return
    this.world.mode = 'story'
  }

  closePanels(): void {
    if (this.world.mode !== 'story' && this.world.mode !== 'upgrades') return
    this.world.mode = 'menu'
  }

  openUpgrades(): void {
    if (this.world.mode !== 'menu') return
    this.world.mode = 'upgrades'
  }

  buy(id: StatId): boolean {
    if (this.world.mode !== 'upgrades') return false
    const stat = STATS.find((item) => item.id === id)
    const level = this.progress.upgrades[id]
    if (!stat || level >= stat.max) return false
    const cost = upgradeCost(id, level)
    if (this.progress.coins < cost) return false
    this.progress.coins -= cost
    this.progress.upgrades[id] = level + 1
    this.applyLoadout()
    this.onProgress(this.progress)
    return true
  }

  startStory(levelId: number): void {
    if (this.world.mode !== 'story' && this.world.mode !== 'end') return
    if (!isUnlocked(levelId, this.progress.cleared)) return
    this.arm(buildStory(levelId, this.progress))
  }

  startQuick(): void {
    if (this.world.mode !== 'menu' && this.world.mode !== 'end') return
    this.arm(this.rollQuick())
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
    if (this.world.mode !== 'paused' && this.world.mode !== 'end') return
    this.cancelDrag()
    if (this.world.fight === 'story') this.arm(buildStory(this.world.round, this.progress))
    else this.arm(this.rollQuick())
  }

  nextRound(): void {
    if (this.world.result?.result !== 'win') return
    this.cancelDrag()
    if (this.world.fight === 'quick') {
      this.arm(this.rollQuick())
      return
    }
    const next = allLevels()[this.world.round]
    if (!next) return
    this.arm(buildStory(next.id, this.progress))
  }

  nextLabel(): string | null {
    if (this.world.result?.result !== 'win') return null
    if (this.world.fight === 'quick') return 'Another fight'
    const next = allLevels()[this.world.round]
    if (!next) return null
    return `Next · ${next.id}. ${next.name}`
  }

  toMenu(): void {
    this.cancelDrag()
    this.world.mode = 'menu'
    this.world.result = null
    this.world.overtime = false
    this.world.round = 1
    this.world.shake = 0
    this.world.theme = 'yard'
    this.world.shape = 'square'
    this.world.width = 800
    this.world.height = 800
    this.world.size = 800
    this.world.event = 'clear'
    this.world.hazards = []
    this.world.zones = []
    this.world.chapterName = 'The Yard'
    this.world.levelName = 'Yard'
    this.world.minutes = this.preferredMinutes
    this.world.timeLeft = this.preferredMinutes * 60
    spawnMenuGoat(this.world)
    const player = getPlayer(this.world)
    if (player) player.color = this.world.color
  }

  debugRound(round: number): void {
    if (!this.debug) return
    this.cancelDrag()
    const level = allLevels()[Math.max(0, Math.round(round) - 1)]
    if (!level) return
    this.arm(buildStory(level.id, this.progress))
    this.world.countdown = 0.05
    this.acc = 0
  }

  debugKnockout(): void {
    if (!this.debug) return
    for (const goat of this.world.goats) {
      if (goat.team !== 'enemy') continue
      goat.hp = 0
      goat.dead = true
    }
  }

  skipToOvertime(): void {
    if (!this.debug) return
    if (this.world.mode === 'paused') this.resume()
    if (this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'story' || this.world.mode === 'upgrades' || this.world.mode === 'end') {
      this.startQuick()
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
      fight: this.world.fight,
      levelName: this.world.levelName,
      chapterName: this.world.chapterName,
      event: this.world.event,
      theme: this.world.theme,
      size: this.world.size,
      shape: this.world.shape,
      width: this.world.width,
      height: this.world.height,
      cam: {
        x: Math.round(this.cam.x),
        y: Math.round(this.cam.y),
        s: Math.round(this.cam.s * 1000) / 1000,
      },
      view: { w: Math.round(this.viewW), h: Math.round(this.viewH) },
      coins: this.progress.coins,
      cleared: this.progress.cleared,
      hazards: this.world.hazards.length,
      spikes: this.world.hazards
        .filter((hazard) => hazard.kind === 'spike')
        .map((hazard) => ({ x: Math.round(hazard.x), y: Math.round(hazard.y), r: hazard.r })),
      zones: this.world.zones.map((zone) => ({
        kind: zone.kind,
        x: Math.round(zone.x),
        y: Math.round(zone.y),
        r: zone.r,
        life: Math.round(zone.life * 10) / 10,
      })),
      goats: this.world.goats.map((g) => ({
        name: g.name,
        team: g.team,
        role: g.role,
        boss: g.boss,
        hp: Math.round(g.hp),
        maxHp: g.maxHp,
        x: Math.round(g.x),
        y: Math.round(g.y),
        ignite: Math.round(g.ignite * 10) / 10,
        ai: g.ai,
        plan: g.plan,
        tell: g.tell,
        chill: Math.round(g.chill * 10) / 10,
        damageMul: g.damageMul,
        mass: Math.round(g.mass * 100) / 100,
        speedMul: Math.round(g.speedMul * 100) / 100,
        cooldown: Math.round(g.cooldown * 100) / 100,
        dead: g.dead,
        charging: g.charging,
        chargePower: Math.round(g.chargePower * 100) / 100,
      })),
    }
  }

  get debugEnabled(): boolean {
    return this.debug
  }

  private applyLoadout(): void {
    const load = loadoutFrom(this.progress.upgrades)
    this.world.maxHp = load.maxHp
    this.world.mass = load.mass
    this.world.damage = load.damage
    this.world.speed = load.speed
    this.world.recharge = load.recharge
    this.world.fire = load.fire
    const player = getPlayer(this.world)
    const browsing = this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'story' || this.world.mode === 'upgrades'
    if (player && browsing) {
      player.maxHp = load.maxHp
      player.hp = load.maxHp
      player.mass = load.mass
      player.damageMul = load.damage
      player.speedMul = load.speed
      player.fireMul = load.fire
    }
  }

  private rollQuick(): FightPlan {
    return buildQuick(this.progress, this.world.color, this.preferredMinutes, Math.random, this.lastTheme)
  }

  private arm(plan: FightPlan): void {
    this.cancelDrag()
    this.lastTheme = plan.theme
    this.applyLoadout()
    applyPlan(this.world, plan)
    setupMatch(this.world)
    this.acc = 0
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
      if (this.world.mode === 'playing') this.world.eventBanner = Math.max(0, this.world.eventBanner - dt)
    }
    const player = getPlayer(this.world)
    if (this.dragId !== null && player && !player.charging) this.cancelDrag()
    this.layout(dt)
    this.render()
    this.syncUi()
    requestAnimationFrame(this.frame)
  }

  private render(): void {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = this.world.theme === 'ice' ? '#163044' : this.world.theme === 'desert' ? '#5c4630' : '#14341f'
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
    drawOverlay(ctx, this.world, this.cam, this.viewW, this.viewH, this.band, this.arenaTop)
    this.paintSides()
  }

  private paintSides(): void {
    const player = getPlayer(this.world)
    if (!player) return
    const showLogo = this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'story' || this.world.mode === 'upgrades'
    if (this.logo && showLogo) {
      paintFitted(this.logo, (ctx, w, h) => paintPortrait(ctx, w, h, player, this.anim))
    }
    if (this.preview && this.world.mode === 'customize') {
      paintFitted(this.preview, (ctx, w, h) => paintPortrait(ctx, w, h, player, this.anim))
    }
  }

  private syncUi(): void {
    const end = this.world.result
    const key = `${this.world.mode}|${end?.result ?? ''}|${end?.reason ?? ''}|${end?.round ?? ''}|${end?.playerHp ?? ''}|${end?.enemyHp ?? ''}|${end?.coins ?? ''}|${this.progress.coins}|${this.progress.cleared}`
    if (key !== this.modeKey) {
      this.modeKey = key
      this.onMode(this.world.mode, end)
    }
    const player = getPlayer(this.world)
    const rivals = this.world.lineup.length || this.world.goats.filter((g) => g.team === 'enemy').length
    const title = this.world.fight === 'quick' && (this.world.mode === 'playing' || this.world.mode === 'countdown' || this.world.mode === 'paused' || this.world.mode === 'end')
      ? `Quick · ${this.world.chapterName} · ${rivals === 1 ? '1 goat' : `${rivals} goats`}`
      : this.world.mode === 'menu' || this.world.mode === 'customize' || this.world.mode === 'story' || this.world.mode === 'upgrades'
        ? 'Billy Bash'
        : `${this.world.round}. ${this.world.levelName}`
    const hud: HudModel = {
      visible: this.world.mode === 'playing' || this.world.mode === 'countdown' || this.world.mode === 'paused',
      round: this.world.round,
      rivals,
      timeLeft: this.world.timeLeft,
      overtime: this.world.overtime,
      playerHp: Math.max(0, player?.hp ?? 0),
      playerMax: player?.maxHp ?? 100,
      muted: this.isMuted(),
      title,
      event: this.world.event,
    }
    const hudKey = `${hud.visible}|${hud.title}|${hud.event}|${formatTime(hud.timeLeft)}|${hud.overtime}|${Math.ceil(hud.playerHp)}|${hud.playerMax}|${hud.muted}`
    if (hudKey !== this.hudKey) {
      this.hudKey = hudKey
      this.onHud(hud)
    }
  }

  private resize(): void {
    this.layout(0)
  }

  private layout(dt: number): void {
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
    // The HUD can be shorter on phones but taller under a notch, so follow the real DOM edge.
    const measured = this.hudBottom()
    const roomy = w >= 720 && h >= 600
    const fromDom = measured > 0 ? Math.max(48, Math.round(measured + 6)) : HUD_BAND
    // Desktop keeps its original band unless a notch pushes the HUD down.
    this.band = roomy && fromDom <= HUD_BAND + 8 ? HUD_BAND : fromDom
    // Small screens get a shorter pull so a full-power ram still fits between finger and edge.
    this.maxDrag = Math.round(clamp(Math.min(w, h) * 0.36, 110, MAX_DRAG_PX))
    // On phones the boss bar sits under the HUD, so keep the arena edge clear of it too.
    const bossBar = !roomy && this.world.goats.some((g) => g.role === 'boss') ? (w < 560 || h < 460 ? 38 : 44) : 0
    const top = hud ? this.band + bossBar : 0
    this.arenaTop = this.band + bossBar
    const worldW = this.world.width
    const worldH = this.world.height
    const availW = w
    const availH = Math.max(1, h - top)
    const fit = Math.min(availW / worldW, availH / worldH)
    const portrait = availH > availW * 1.15
    // Phones in portrait get a closer camera so goats stay big enough to read.
    const followScale = portrait ? Math.min(availW / 620, availH / 900) : Math.min(availW / 900, availH / 760)
    const quickLarge = this.world.fight === 'quick' && (worldW > 1000 || worldH > 1000)
    // If the whole arena would shrink goats below ~17px, follow the player instead (only tiny screens).
    const tooSmall = fit < 0.4 && followScale > fit * 1.08
    const scrolling = (quickLarge || tooSmall) && (worldW * followScale > availW + 24 || worldH * followScale > availH + 24)
    const s = Math.max(0.01, scrolling ? followScale : fit)
    const player = getPlayer(this.world)
    const focusX = player ? w / 2 - player.x * s : (availW - worldW * s) / 2
    const focusY = player ? top + availH / 2 - player.y * s : top + (availH - worldH * s) / 2
    const worldPxW = worldW * s
    const worldPxH = worldH * s
    const x = worldPxW <= availW + 0.5 ? (availW - worldPxW) / 2 : clamp(focusX, availW - worldPxW, 0)
    const y = worldPxH <= availH + 0.5 ? top + (availH - worldPxH) / 2 : clamp(focusY, top + availH - worldPxH, top)
    const jump = Math.hypot(x - this.cam.x, y - this.cam.y)
    if (!scrolling || dt <= 0 || jump > 500) {
      this.cam.x = x
      this.cam.y = y
      this.cam.s = s
      return
    }
    const k = 1 - Math.exp(-7 * dt)
    this.cam.x += (x - this.cam.x) * k
    this.cam.y += (y - this.cam.y) * k
    this.cam.s += (s - this.cam.s) * k
  }

  private onDown(event: PointerEvent): void {
    if (event.button !== 0) return
    this.audio.unlock()
    if (this.world.mode !== 'playing') return
    // A second finger should not restart a pull that is already in progress.
    if (this.dragId !== null && this.dragId !== event.pointerId) {
      event.preventDefault()
      return
    }
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
    player.chargePower = Math.max(0, Math.min(1, dist / this.maxDrag))
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
    launchGoat(this.world, player, angle, power, this.hooks)
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
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
