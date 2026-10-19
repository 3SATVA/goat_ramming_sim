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
  coins: number
  cleared: number
  hazards: number
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
  private readonly onMode: GamePorts['onMode']
  private readonly onHud: GamePorts['onHud']
  private readonly onProgress: GamePorts['onProgress']
  private readonly hooks: SimHooks
  private readonly world: World
  private progress: Progress = { coins: 0, upgrades: { power: 0, hp: 0, weight: 0, speed: 0, recharge: 0, fire: 0 }, cleared: 0 }
  private lastPlan: FightPlan | null = null
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
    this.arm(buildQuick(this.progress, this.world.color, this.preferredMinutes))
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
    else if (this.lastPlan) this.arm(this.lastPlan)
    else this.arm(buildQuick(this.progress, this.world.color, this.preferredMinutes))
  }

  nextRound(): void {
    if (this.world.result?.result !== 'win') return
    this.cancelDrag()
    if (this.world.fight === 'quick') {
      this.arm(buildQuick(this.progress, this.world.color, this.preferredMinutes))
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
    this.world.size = 800
    this.world.event = 'clear'
    this.world.hazards = []
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
      coins: this.progress.coins,
      cleared: this.progress.cleared,
      hazards: this.world.hazards.length,
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

  private arm(plan: FightPlan): void {
    this.cancelDrag()
    this.lastPlan = plan
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
    this.layout()
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
    drawOverlay(ctx, this.world, this.cam, this.viewW, this.viewH)
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
      ? `Quick · ${rivals === 1 ? '1 goat' : `${rivals} goats`}`
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
    const size = this.world.size
    const scale = Math.min(w / size, (h - top) / size)
    this.cam.s = Math.max(0.01, scale)
    this.cam.x = (w - size * this.cam.s) / 2
    this.cam.y = top + (h - top - size * this.cam.s) / 2
  }

  private onDown(event: PointerEvent): void {
    if (event.button !== 0) return
    this.audio.unlock()
    if (this.world.mode !== 'playing') return
    const player = getPlayer(this.world)
    if (!player || player.dead || player.cooldown > 0) return
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
