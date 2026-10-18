export type Team = 'player' | 'enemy'
export type Mode = 'menu' | 'customize' | 'countdown' | 'playing' | 'paused' | 'end'
export type EndKind = 'win' | 'lose' | 'draw'
export type EndReason = 'ko' | 'time'

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
}

export interface SimHooks {
  thud: (intensity: number) => void
  bleat: (team: Team) => void
  whoosh: (power: number) => void
  burn: () => void
  ko: () => void
  overtime: () => void
  crackle: () => void
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
