import { FENCE } from './constants'
import type { ArenaEvent, BossKind, Difficulty, Hazard, Role, Theme } from './types'
import { clamp, colorDist } from './util'

export type StatId = 'power' | 'hp' | 'weight' | 'speed' | 'fire'
export type FightKind = 'story' | 'quick'

export interface Upgrades {
  power: number
  hp: number
  weight: number
  speed: number
  /** Older saves may still store this. It is kept on load and is not sold or applied. */
  recharge: number
  fire: number
}

export interface Progress {
  coins: number
  upgrades: Upgrades
  /** Highest story level cleared. Level 1 is always open. */
  cleared: number
}

export interface StatDef {
  id: StatId
  name: string
  blurb: string
  max: number
}

export const STATS: StatDef[] = [
  { id: 'power', name: 'Ram power', blurb: 'Your rams deal more damage.', max: 8 },
  { id: 'hp', name: 'Stamina', blurb: 'A bigger health bar.', max: 8 },
  { id: 'weight', name: 'Weight', blurb: 'Harder to shove, and you shove harder.', max: 8 },
  { id: 'speed', name: 'Launch', blurb: 'Faster rams.', max: 6 },
  { id: 'fire', name: 'Fire coat', blurb: 'The burning fence hurts less.', max: 6 },
]

export interface Loadout {
  maxHp: number
  mass: number
  damage: number
  speed: number
  recharge: number
  fire: number
}

export interface FightSlot {
  name: string
  color: string
  role: Exclude<Role, 'player'>
  boss: BossKind | null
}

/** One fight inside a chapter. Add fields here; do not special-case the level number. */
export interface ChapterLevel {
  name: string
  blurb: string
  minutes: 2 | 3
  event: ArenaEvent
  slots: { role: Exclude<Role, 'player'>; name: string; color: string; boss?: BossKind }[]
  /** Playfield width and height. Later levels use a bigger pen. */
  size: number
  rocks: number
  spikes: number
  dunes: number
  windup: number
  cooldown: number
  lead: number
  speed: number
}

/**
 * Story is a list of chapters. Append a chapter to grow the campaign.
 * Theme, storm, and levels all live on the chapter so nothing else needs a new switch.
 */
export interface ChapterDef {
  id: number
  name: string
  blurb: string
  theme: Theme
  levels: ChapterLevel[]
}

export interface StoryLevel extends ChapterLevel {
  id: number
  chapterId: number
  chapterName: string
  theme: Theme
}

export interface FightPlan {
  fight: FightKind
  round: number
  name: string
  chapterName: string
  minutes: 2 | 3
  event: ArenaEvent
  theme: Theme
  size: number
  windAngle: number
  slots: FightSlot[]
  hazards: Hazard[]
  diff: Difficulty
  coins: number
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1,
    name: 'The Yard',
    blurb: 'The grassy pen and the white fence.',
    theme: 'yard',
    levels: [
      {
        name: 'First Butt',
        blurb: 'One small kid on ordinary grass.',
        minutes: 2,
        event: 'clear',
        size: 800,
        rocks: 0,
        spikes: 0,
        dunes: 0,
        slots: [{ role: 'grunt', name: 'Kiddo', color: '#c8962e' }],
        windup: 0.9,
        cooldown: 2.7,
        lead: 0.24,
        speed: 0.82,
      },
      {
        name: 'Rock Garden',
        blurb: 'Two kids, a bigger pen, and boulders in the way.',
        minutes: 2,
        event: 'rain',
        size: 900,
        rocks: 2,
        spikes: 0,
        dunes: 0,
        slots: [
          { role: 'grunt', name: 'Pip', color: '#8d6a4a' },
          { role: 'grunt', name: 'Nib', color: '#6d8f4e' },
        ],
        windup: 0.78,
        cooldown: 2.5,
        lead: 0.28,
        speed: 0.84,
      },
      {
        name: 'Gnasher',
        blurb: 'The yard boss opens with three rapid charges, then a freight-train ram.',
        minutes: 3,
        event: 'wind',
        size: 980,
        rocks: 3,
        spikes: 2,
        dunes: 0,
        slots: [{ role: 'boss', name: 'Gnasher', color: '#6b4428', boss: 'yard' }],
        windup: 0.95,
        cooldown: 2.15,
        lead: 0.32,
        speed: 0.86,
      },
    ],
  },
  {
    id: 2,
    name: 'Icebound',
    blurb: 'Snow, slick ice, and a whiteout.',
    theme: 'ice',
    levels: [
      {
        name: 'Thin Ice',
        blurb: 'The pen is frozen. Rams slide.',
        minutes: 2,
        event: 'clear',
        size: 1040,
        rocks: 2,
        spikes: 0,
        dunes: 0,
        slots: [{ role: 'rival', name: 'Nanny', color: '#d7e4ef' }],
        windup: 0.8,
        cooldown: 2.4,
        lead: 0.28,
        speed: 0.86,
      },
      {
        name: 'Whiteout',
        blurb: 'A snowstorm. Gusts shift, and the ice does not grip.',
        minutes: 3,
        event: 'snowstorm',
        size: 1120,
        rocks: 2,
        spikes: 3,
        dunes: 0,
        slots: [
          { role: 'grunt', name: 'Flake', color: '#c5d8ea' },
          { role: 'grunt', name: 'Slush', color: '#9bb4c9' },
        ],
        windup: 0.72,
        cooldown: 2.35,
        lead: 0.3,
        speed: 0.88,
      },
      {
        name: 'Frostbite',
        blurb: 'The ice boss breathes a freezing cone, then charges across the ice.',
        minutes: 3,
        event: 'snowstorm',
        size: 1180,
        rocks: 3,
        spikes: 3,
        dunes: 0,
        slots: [{ role: 'boss', name: 'Frostbite', color: '#e7f3fb', boss: 'frost' }],
        windup: 1.05,
        cooldown: 2.05,
        lead: 0.34,
        speed: 0.84,
      },
    ],
  },
  {
    id: 3,
    name: 'The Dunes',
    blurb: 'Sand, spike clusters, and a grinding sandstorm.',
    theme: 'desert',
    levels: [
      {
        name: 'Hot Sand',
        blurb: 'Drifts drag at your hooves.',
        minutes: 3,
        event: 'clear',
        size: 1240,
        rocks: 2,
        spikes: 2,
        dunes: 2,
        slots: [
          { role: 'grunt', name: 'Pebble', color: '#c4a15a' },
          { role: 'grunt', name: 'Dusty', color: '#a67c45' },
        ],
        windup: 0.74,
        cooldown: 2.3,
        lead: 0.3,
        speed: 0.86,
      },
      {
        name: 'Sting',
        blurb: 'The sandstorm pushes, stings, and dulls a full pull.',
        minutes: 3,
        event: 'sandstorm',
        size: 1300,
        rocks: 3,
        spikes: 3,
        dunes: 3,
        slots: [
          { role: 'grunt', name: 'Skip', color: '#d2b48c' },
          { role: 'grunt', name: 'Barb', color: '#8f9a4a' },
          { role: 'rival', name: 'Bleatrice', color: '#a33b3b' },
        ],
        windup: 0.68,
        cooldown: 2.2,
        lead: 0.32,
        speed: 0.88,
      },
      {
        name: 'Duneking',
        blurb: 'The desert boss drops a sand vortex, jabs, then kicks up a gale.',
        minutes: 3,
        event: 'sandstorm',
        size: 1360,
        rocks: 3,
        spikes: 2,
        dunes: 3,
        slots: [{ role: 'boss', name: 'Duneking', color: '#e0c27a', boss: 'dune' }],
        windup: 0.86,
        cooldown: 1.9,
        lead: 0.34,
        speed: 0.86,
      },
    ],
  },
]

const QUICK_NAMES = ['Nanny', 'Buck', 'Bleatrice', 'Ramsey', 'Goatzart', 'Kiddo', 'Pip', 'Dot', 'Trot', 'Skip']
const COATS = ['#d0693c', '#3c5d8a', '#7a4b93', '#a33b3b', '#2c7468', '#c8962e', '#6d8f4e', '#8d6a4a']

export function allLevels(): StoryLevel[] {
  const levels: StoryLevel[] = []
  let id = 1
  for (const chapter of CHAPTERS) {
    for (const level of chapter.levels) {
      levels.push({
        ...level,
        id: id++,
        chapterId: chapter.id,
        chapterName: chapter.name,
        theme: chapter.theme,
      })
    }
  }
  return levels
}

export function defaultUpgrades(): Upgrades {
  return { power: 0, hp: 0, weight: 0, speed: 0, recharge: 0, fire: 0 }
}

export function defaultProgress(): Progress {
  return { coins: 0, upgrades: defaultUpgrades(), cleared: 0 }
}

export function upgradeSum(upgrades: Upgrades): number {
  return STATS.reduce((sum, stat) => sum + upgrades[stat.id], 0)
}

export function upgradeCost(id: StatId, level: number): number {
  const base = id === 'power' || id === 'hp' ? 18 : 14
  return Math.round(base * Math.pow(1.55, level))
}

export function loadoutFrom(upgrades: Upgrades): Loadout {
  return {
    maxHp: 100 + upgrades.hp * 14,
    mass: 1 + upgrades.weight * 0.16,
    damage: 1 + upgrades.power * 0.14,
    speed: 1 + upgrades.speed * 0.07,
    recharge: 0,
    fire: Math.max(0.32, 1 - upgrades.fire * 0.11),
  }
}

export function statEffect(id: StatId, level: number): string {
  const preview = loadoutFrom({ ...defaultUpgrades(), [id]: level })
  if (id === 'power') return `${Math.round(preview.damage * 100)}% ram damage`
  if (id === 'hp') return `${preview.maxHp} max HP`
  if (id === 'weight') return `${Math.round(preview.mass * 100)}% weight`
  if (id === 'speed') return `${Math.round(preview.speed * 100)}% launch speed`
  return `${Math.round(preview.fire * 100)}% fire damage`
}

export function roleProfile(role: Exclude<Role, 'player'>, boss: BossKind | null): {
  radius: number
  hp: number
  mass: number
  speed: number
  damage: number
} {
  if (boss === 'yard') return { radius: 58, hp: 150, mass: 1.7, speed: 0.84, damage: 2.2 }
  if (boss === 'frost') return { radius: 60, hp: 165, mass: 1.65, speed: 0.8, damage: 2.1 }
  if (boss === 'dune') return { radius: 60, hp: 175, mass: 1.75, speed: 0.82, damage: 2.35 }
  if (role === 'grunt') return { radius: 32, hp: 48, mass: 0.66, speed: 0.84, damage: 0.58 }
  if (role === 'boss') return { radius: 58, hp: 150, mass: 1.7, speed: 0.84, damage: 2.1 }
  return { radius: 40, hp: 72, mass: 1, speed: 0.92, damage: 0.82 }
}

export function eventCopy(event: ArenaEvent): { title: string; detail: string } {
  if (event === 'rain') return { title: 'Rain', detail: 'The grass is slick. Rams slide farther.' }
  if (event === 'wind') return { title: 'Wind', detail: 'A steady push shoves every goat.' }
  if (event === 'mud') return { title: 'Mud', detail: 'Thick mud. Rams die out fast.' }
  if (event === 'fog') return { title: 'Fog', detail: 'The far side of the yard fades out.' }
  if (event === 'snowstorm') return { title: 'Snowstorm', detail: 'Whiteout, shifting gusts, and ice that will not grip.' }
  if (event === 'sandstorm') return { title: 'Sandstorm', detail: 'A hard push, stinging sand, and a weaker pull.' }
  return { title: 'Clear', detail: 'Quiet weather.' }
}

export function isUnlocked(levelId: number, cleared: number): boolean {
  return levelId >= 1 && levelId <= allLevels().length && levelId <= cleared + 1
}

export function buildStory(levelId: number, progress: Progress): FightPlan {
  const levels = allLevels()
  const level = levels[clamp(levelId, 1, levels.length) - 1] ?? levels[0]
  if (!level) throw new Error('Story is empty')
  const first = level.id > progress.cleared
  const slots = level.slots.map((slot) => ({
    name: slot.name,
    color: slot.color,
    role: slot.role,
    boss: slot.boss ?? null,
  }))
  return {
    fight: 'story',
    round: level.id,
    name: level.name,
    chapterName: level.chapterName,
    minutes: level.minutes,
    event: level.event,
    theme: level.theme,
    size: level.size,
    windAngle: level.theme === 'desert' ? 0.15 : level.theme === 'ice' ? -0.8 : 0.4,
    slots,
    hazards: placeHazards(level),
    diff: curve(slots.length, level.windup, level.cooldown, level.lead, level.speed, 0.1, 0.14),
    coins: storyReward(level, first),
  }
}

export function buildQuick(
  progress: Progress,
  playerColor: string,
  minutes: 2 | 3 = 3,
  rng: () => number = Math.random,
): FightPlan {
  const sum = upgradeSum(progress.upgrades)
  const budget = 1.05 + sum * 0.16
  const slots: FightSlot[] = []
  let spent = 0
  const names = [...QUICK_NAMES].sort(() => rng() - 0.5)
  while (slots.length < 4) {
    const room = budget - spent
    const options: Exclude<Role, 'player'>[] = []
    if (room >= 1.05 && slots.filter((slot) => slot.role === 'rival').length < 2) options.push('rival')
    if (room >= 0.68) options.push('grunt')
    if (options.length === 0) break
    let role = options[Math.floor(rng() * options.length)] ?? 'grunt'
    if (slots.length >= 2 && options.includes('grunt') && rng() < 0.75) role = 'grunt'
    const cost = role === 'rival' ? 1.05 : 0.68
    const name = names.pop() ?? `Goat ${slots.length + 1}`
    slots.push({ name, color: coatFor(playerColor, slots.map((slot) => slot.color), rng), role, boss: null })
    spent += cost
  }
  if (slots.length === 0) slots.push({ name: 'Kiddo', color: coatFor(playerColor, [], rng), role: 'grunt', boss: null })
  const t = clamp(sum / 18, 0, 1)
  const events: ArenaEvent[] = ['clear', 'rain', 'wind', 'mud', 'fog']
  const event = events[Math.floor(rng() * events.length)] ?? 'clear'
  return {
    fight: 'quick',
    round: 1,
    name: 'Quick Fight',
    chapterName: 'The Yard',
    minutes,
    event,
    theme: 'yard',
    size: 800,
    windAngle: rng() * Math.PI * 2,
    slots,
    hazards: [],
    diff: curve(slots.length, 0.82 - t * 0.24, 2.5 - t * 0.4, 0.26 + t * 0.14, 0.84 + t * 0.1, 0.1, 0.14),
    coins: 8 + slots.length * 6 + Math.round(sum * 0.35),
  }
}

function storyReward(level: StoryLevel, firstClear: boolean): number {
  const bosses = level.slots.filter((slot) => slot.role === 'boss').length
  const base = 16 + level.id * 5 + level.slots.length * 4 + bosses * 14
  return firstClear ? base : Math.max(5, Math.round(base * 0.4))
}

function curve(
  count: number,
  windup: number,
  cooldown: number,
  lead: number,
  speed: number,
  dodge: number,
  bounce: number,
): Difficulty {
  const multi = count >= 4 ? 1.2 : count >= 3 ? 1.1 : 1
  return {
    count,
    windup,
    recover: 0.32,
    cooldown: cooldown * multi,
    speed,
    hp: 0,
    aggro: 1400,
    aimTrack: 4.4,
    lead,
    bounce,
    dodge,
  }
}

function placeHazards(level: ChapterLevel): Hazard[] {
  const size = level.size
  const spot = (nx: number, ny: number) => ({
    x: FENCE + 90 + nx * (size - FENCE * 2 - 180),
    y: FENCE + 130 + ny * (size - FENCE * 2 - 260),
  })
  const rocks = [
    [0.22, 0.42],
    [0.74, 0.48],
    [0.48, 0.62],
    [0.3, 0.28],
    [0.68, 0.72],
  ]
  const spikes = [
    [0.18, 0.58],
    [0.82, 0.36],
    [0.4, 0.5],
    [0.62, 0.4],
    [0.55, 0.7],
  ]
  const dunes = [
    [0.5, 0.46],
    [0.28, 0.6],
    [0.72, 0.58],
  ]
  const hazards: Hazard[] = []
  for (let i = 0; i < level.rocks; i++) {
    const at = rocks[i % rocks.length] ?? [0.5, 0.5]
    const p = spot(at[0], at[1])
    hazards.push({ kind: 'rock', x: p.x, y: p.y, r: 34 + (i % 2) * 6, life: -1 })
  }
  for (let i = 0; i < level.spikes; i++) {
    const at = spikes[i % spikes.length] ?? [0.5, 0.5]
    const p = spot(at[0], at[1])
    hazards.push({ kind: 'spike', x: p.x, y: p.y, r: 34, life: -1 })
  }
  for (let i = 0; i < level.dunes; i++) {
    const at = dunes[i % dunes.length] ?? [0.5, 0.5]
    const p = spot(at[0], at[1])
    hazards.push({ kind: 'dune', x: p.x, y: p.y, r: 72, life: -1 })
  }
  return hazards
}

function coatFor(playerColor: string, used: string[], rng: () => number): string {
  const ranked = [...COATS].sort((a, b) => colorDist(b, playerColor) - colorDist(a, playerColor))
  const free = ranked.filter((color) => !used.includes(color) && colorDist(color, playerColor) > 60)
  const pool = free.length > 0 ? free : ranked
  return pool[Math.floor(rng() * pool.length)] ?? '#3c5d8a'
}
