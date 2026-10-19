export type Team = 'player' | 'enemy'
export type Mode = 'menu' | 'story' | 'upgrades' | 'customize' | 'countdown' | 'playing' | 'paused' | 'end'
export type EndKind = 'win' | 'lose' | 'draw'
export type EndReason = 'ko' | 'time'
export type Blow = 'ram' | 'fire' | 'time' | 'hazard'
export type Role = 'player' | 'grunt' | 'rival' | 'boss'
export type ArenaEvent = 'clear' | 'rain' | 'wind' | 'mud' | 'fog' | 'snowstorm' | 'sandstorm'
export type Theme = 'yard' | 'ice' | 'desert'
export type ArenaShape = 'square' | 'rectangle' | 'circle' | 'oval'
export type BossKind = 'yard' | 'frost' | 'dune'
export type BossTell = 'combo' | 'breath' | 'vortex'
export type HazardKind = 'rock' | 'spike' | 'dune'
export type ZoneKind = 'ice' | 'vortex'

export interface Hazard {
  kind: HazardKind
  x: number
  y: number
  r: number
  life: number
}

export interface Zone {
  kind: ZoneKind
  x: number
  y: number
  r: number
  life: number
  max: number
  tick: number
  /** Chip damage for a vortex pulse. Ice patches leave this at 0. */
  power: number
}

export interface SpawnStats {
  radius: number
  hp: number
  mass: number
  speed: number
  damage: number
}

export interface Goat {
  id: number
  name: string
  team: Team
  color: string
  x: number
  y: number
  vx: number
  vy: number
  facing: number
  radius: number
  hp: number
  maxHp: number
  legPhase: number
  squash: number
  flash: number
  ignite: number
  fenceCd: number
  dead: boolean
  blinkOffset: number
  charging: boolean
  chargePower: number
  chargeAngle: number
  ai: 'idle' | 'windup' | 'recover'
  aiTimer: number
  aiWindup: number
  aimAngle: number
  aimPower: number
  cooldown: number
  stun: number
  ramArmed: boolean
  ramTime: number
  fx: number
  /** What the current telegraph is committing to. */
  plan: 'attack' | 'bounce' | 'dodge'
  /** Already reacted to the player's current aim, so the roll happens once. */
  sawAim: boolean
  role: Role
  boss: BossKind | null
  mass: number
  damageMul: number
  speedMul: number
  fireMul: number
  cooldownMax: number
  /** Seconds of low-drag glide left after a heavy boss charge. */
  glide: number
  pendingGlide: number
  pendingGust: number
  /** Cooldown multiplier applied when this windup launches. 0 means the usual cooldown. */
  pendingCd: number
  hazardCd: number
  bossStep: number
  /** Special the current windup is showing. */
  tell: BossTell | null
  /** Locked aim point for a ground telegraph. */
  markX: number
  markY: number
  /** Seconds of icy slow left. */
  chill: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  kind: 'spark' | 'dust' | 'flame'
  spin: number
  angle: number
}

export interface Floater {
  x: number
  y: number
  vy: number
  life: number
  max: number
  text: string
  color: string
}

export interface Stats {
  damageDealt: number
  rams: number
  bestHit: number
  launches: number
}

export interface EndResult {
  result: EndKind
  reason: EndReason
  round: number
  playerHp: number
  enemyHp: number
  damageDealt: number
  rams: number
  bestHit: number
  launches: number
  blow: Blow
  coins: number
  fight: 'story' | 'quick'
  levelName: string
  chapterName: string
  event: ArenaEvent
}

export interface Difficulty {
  count: number
  windup: number
  recover: number
  cooldown: number
  speed: number
  hp: number
  aggro: number
  aimTrack: number
  /** Seconds of target motion to aim ahead of. */
  lead: number
  /** Chance to bank a shot off the fence instead of aiming straight. */
  bounce: number
  /** Chance to sidestep when the player is aiming at this goat. */
  dodge: number
}

export interface SimHooks {
  thud: (intensity: number) => void
  bleat: (team: Team) => void
  whoosh: (power: number) => void
  burn: () => void
  ko: () => void
  overtime: () => void
  crackle: () => void
  weather: (kind: 'snow' | 'sand') => void
  finish: (result: EndResult) => void
}

export interface World {
  mode: Mode
  pausedFrom: 'playing' | 'countdown'
  round: number
  minutes: 2 | 3
  color: string
  goats: Goat[]
  particles: Particle[]
  floaters: Floater[]
  shake: number
  timeLeft: number
  overtime: boolean
  otBanner: number
  goBanner: number
  countdown: number
  result: EndResult | null
  stats: Stats
  nextId: number
  hint: boolean
  pairCd: Map<string, number>
  diff: Difficulty
  reduce: boolean
  hitstop: number
  crackleAcc: number
  lastBlow: 'ram' | 'fire' | 'hazard'
  fight: 'story' | 'quick'
  levelName: string
  event: ArenaEvent
  windAngle: number
  eventBanner: number
  coinReward: number
  recharge: number
  maxHp: number
  mass: number
  damage: number
  speed: number
  fire: number
  theme: Theme
  shape: ArenaShape
  width: number
  height: number
  /** Longest side. Story pens stay square, so this matches width and height. */
  size: number
  chapterName: string
  hazards: Hazard[]
  zones: Zone[]
  /** Seconds left on a boss-kicked gust. */
  gust: number
  gustBoost: number
  gustAngle: number
  stormAcc: number
  stingAcc: number
  lineup: {
    name: string
    color: string
    role: Exclude<Role, 'player'>
    boss: BossKind | null
    stats: SpawnStats
  }[]
}

export interface HudModel {
  visible: boolean
  round: number
  rivals: number
  timeLeft: number
  overtime: boolean
  playerHp: number
  playerMax: number
  muted: boolean
  title: string
  event: ArenaEvent
}

export interface PullPoint {
  x: number
  y: number
}

export const COAT_COLORS: { name: string; hex: string }[] = [
  { name: 'Cream', hex: '#f3ecdf' },
  { name: 'White', hex: '#f7f7f5' },
  { name: 'Tan', hex: '#c9a36a' },
  { name: 'Brown', hex: '#8a5436' },
  { name: 'Charcoal', hex: '#3a3a3a' },
  { name: 'Slate', hex: '#8e97a3' },
  { name: 'Blush', hex: '#e7a8b8' },
  { name: 'Gold', hex: '#e6c15a' },
  { name: 'Sky', hex: '#7eb0d6' },
  { name: 'Sage', hex: '#7f9a6d' },
]
