import { FENCE } from './constants'
import { insideArena } from './arena'
import type { ArenaEvent, ArenaShape, BossKind, Difficulty, Hazard, Role, SpawnStats, Theme } from './types'
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
  stats: SpawnStats
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
  shape: ArenaShape
  width: number
  height: number
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
  if (boss === 'yard') return { radius: 58, hp: 200, mass: 2.05, speed: 0.9, damage: 3.5 }
  if (boss === 'frost') return { radius: 60, hp: 230, mass: 2.1, speed: 0.88, damage: 3.4 }
  if (boss === 'dune') return { radius: 60, hp: 250, mass: 2.2, speed: 0.9, damage: 3.7 }
  if (role === 'grunt') return { radius: 32, hp: 48, mass: 0.72, speed: 0.96, damage: 2 }
  if (role === 'boss') return { radius: 58, hp: 200, mass: 2.05, speed: 0.9, damage: 3.4 }
  return { radius: 40, hp: 76, mass: 1.05, speed: 1, damage: 2.25 }
}

/**
 * Campaign growth per full trip from the first level to the last.
 * Appending a chapter stretches this ramp; nothing else has to change.
 */
const STORY_GROWTH: Record<'mob' | 'boss', Growth> = {
  mob: { hp: 0.9, damage: 0.5, mass: 0.42, speed: 0.16 },
  boss: { hp: 0.35, damage: 0.38, mass: 0.32, speed: 0.28 },
}

/** How hard a maxed build is answered. Early levels use only a slice of this. */
const UPGRADE_GROWTH: Record<'mob' | 'boss', Growth> = {
  mob: { hp: 0.8, damage: 0.6, mass: 0.5, speed: 0.14 },
  boss: { hp: 0.55, damage: 0.85, mass: 0.55, speed: 0.22 },
}

const QUICK_PAR: Record<'grunt' | 'rival', Growth> = {
  grunt: { hp: 78, damage: 2.05, mass: 0.84, speed: 0.98 },
  rival: { hp: 106, damage: 2.35, mass: 1.06, speed: 1.04 },
}

/** A maxed player is about this much tougher than a fresh one. Quick fights grow to match. */
const QUICK_ANSWER: Growth = { hp: 0.95, damage: 0.72, mass: 0.68, speed: 0.2 }

const QUICK_ARENAS: { shape: ArenaShape; width: number; height: number }[] = [
  { shape: 'square', width: 860, height: 860 },
  { shape: 'square', width: 1120, height: 1120 },
  { shape: 'rectangle', width: 1480, height: 960 },
  { shape: 'rectangle', width: 2100, height: 1320 },
  { shape: 'circle', width: 1080, height: 1080 },
  { shape: 'circle', width: 1880, height: 1880 },
  { shape: 'oval', width: 1760, height: 1120 },
  { shape: 'oval', width: 2200, height: 1360 },
]

interface Growth {
  hp: number
  damage: number
  mass: number
  speed: number
}

/** 0 with a fresh goat, 1 when every upgrade is maxed. Combat ranks count more than fire. */
export function playerRating(upgrades: Upgrades): number {
  const part = (id: StatId, weight: number) => {
    const stat = STATS.find((entry) => entry.id === id)
    return clamp(upgrades[id] / (stat?.max ?? 1), 0, 1) * weight
  }
  return clamp(part('power', 0.36) + part('hp', 0.28) + part('weight', 0.2) + part('speed', 0.12) + part('fire', 0.04), 0, 1)
}

/** 0 on the first story level, 1 on the last. New chapters extend the scale automatically. */
export function campaignProgress(levelId: number): number {
  const total = allLevels().length
  if (total <= 1) return 0
  return clamp((levelId - 1) / (total - 1), 0, 1)
}

function scaleStats(base: SpawnStats, kind: 'mob' | 'boss', progress: number, rating: number, answer: number): SpawnStats {
  const level = STORY_GROWTH[kind]
  const built = UPGRADE_GROWTH[kind]
  const grow = (value: number, byLevel: number, byBuild: number) => value * (1 + progress * byLevel) * (1 + rating * answer * byBuild)
  return {
    radius: base.radius,
    hp: Math.max(1, Math.round(grow(base.hp, level.hp, built.hp))),
    damage: round2(grow(base.damage, level.damage, built.damage)),
    mass: round2(grow(base.mass, level.mass, built.mass)),
    speed: round2(grow(base.speed, level.speed, built.speed)),
  }
}

function quickStats(role: 'grunt' | 'rival', rating: number, rng: () => number): SpawnStats {
  const par = QUICK_PAR[role]
  const spread = 0.92 + rng() * 0.16
  const pace = 0.96 + rng() * 0.08
  const grow = (value: number, byBuild: number) => value * (1 + rating * byBuild)
  return {
    radius: roleProfile(role, null).radius,
    hp: Math.max(1, Math.round(grow(par.hp, QUICK_ANSWER.hp) * spread)),
    damage: round2(grow(par.damage, QUICK_ANSWER.damage) * spread),
    mass: round2(grow(par.mass, QUICK_ANSWER.mass) * spread),
    speed: round2(grow(par.speed, QUICK_ANSWER.speed) * pace),
  }
}

/** More goats share one budget, so four bodies are not four full-strength goats. */
function applyPack(slots: FightSlot[]): void {
  const count = Math.max(1, slots.length)
  const hp = 1 / Math.pow(count, 0.55)
  const damage = 1 / Math.pow(count, 0.95)
  const mass = 1 / Math.pow(count, 0.28)
  for (const slot of slots) {
    slot.stats.hp = Math.max(30, Math.round(slot.stats.hp * hp))
    slot.stats.damage = round2(slot.stats.damage * damage)
    slot.stats.mass = round2(Math.max(0.55, slot.stats.mass * mass))
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function eventCopy(event: ArenaEvent): { title: string; detail: string } {
  if (event === 'rain') return { title: 'Rain', detail: 'The grass is slick. Rams slide farther.' }
  if (event === 'wind') return { title: 'Wind', detail: 'A steady push shoves every goat.' }
  if (event === 'mud') return { title: 'Mud', detail: 'Thick mud. Rams die out fast.' }
  if (event === 'fog') return { title: 'Fog', detail: 'The far side of the pen fades out.' }
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
  const progressT = campaignProgress(level.id)
  const rating = playerRating(progress.upgrades)
  const answer = 0.08 + 0.92 * progressT
  const slots = level.slots.map((slot) => {
    const boss = slot.boss ?? null
    const role = slot.role
    return {
      name: slot.name,
      color: slot.color,
      role,
      boss,
      stats: scaleStats(roleProfile(role, boss), role === 'boss' || boss ? 'boss' : 'mob', progressT, rating, answer),
    }
  })
  const bossFight = slots.some((slot) => slot.role === 'boss')
  return {
    fight: 'story',
    round: level.id,
    name: level.name,
    chapterName: level.chapterName,
    minutes: level.minutes,
    event: level.event,
    theme: level.theme,
    shape: 'square',
    width: level.size,
    height: level.size,
    size: level.size,
    windAngle: level.theme === 'desert' ? 0.15 : level.theme === 'ice' ? -0.8 : 0.4,
    slots,
    hazards: placeHazards(level),
    diff: storyDiff(level, slots.length, progressT, rating, answer, bossFight),
    coins: storyReward(level, first),
  }
}

export function buildQuick(
  progress: Progress,
  playerColor: string,
  minutes: 2 | 3 = 3,
  rng: () => number = Math.random,
  avoid: Theme | null = null,
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
    slots.push({
      name,
      color: coatFor(playerColor, slots.map((slot) => slot.color), rng),
      role,
      boss: null,
      stats: quickStats(role === 'rival' ? 'rival' : 'grunt', playerRating(progress.upgrades), rng),
    })
    spent += cost
  }
  if (slots.length === 0) {
    slots.push({
      name: 'Kiddo',
      color: coatFor(playerColor, [], rng),
      role: 'grunt',
      boss: null,
      stats: quickStats('grunt', playerRating(progress.upgrades), rng),
    })
  }
  applyPack(slots)
  const rating = playerRating(progress.upgrades)
  const arena = QUICK_ARENAS[Math.floor(rng() * QUICK_ARENAS.length)] ?? QUICK_ARENAS[0]
  if (!arena) throw new Error('Quick arenas are empty')
  const ground = pickQuickGround(rng, avoid)
  return {
    fight: 'quick',
    round: 1,
    name: 'Quick Fight',
    chapterName: ground.name,
    minutes,
    event: ground.event,
    theme: ground.theme,
    shape: arena.shape,
    width: arena.width,
    height: arena.height,
    size: Math.max(arena.width, arena.height),
    windAngle: rng() * Math.PI * 2,
    slots,
    hazards: quickHazards(arena.shape, arena.width, arena.height, ground.theme, rng),
    diff: curve(
      slots.length,
      Math.max(0.4, 0.58 - rating * 0.16),
      Math.max(0.5, 1.05 - rating * 0.4),
      0.26 + rating * 0.12,
      0.92 + rating * 0.1,
      0.1 + rating * 0.16,
      0.08,
      0.22,
      4.6 + rating * 2,
    ),
    coins: 8 + slots.length * 6 + Math.round(sum * 0.35),
  }
}

const QUICK_GROUNDS: { theme: Theme; name: string; events: [ArenaEvent, number][] }[] = [
  { theme: 'yard', name: 'The Yard', events: [['clear', 1], ['rain', 1], ['wind', 1], ['mud', 1], ['fog', 1]] },
  { theme: 'ice', name: 'Icebound', events: [['snowstorm', 3], ['clear', 1], ['fog', 1]] },
  { theme: 'desert', name: 'The Dunes', events: [['sandstorm', 3], ['clear', 1], ['wind', 1]] },
]

/**
 * Every quick fight rolls its own ground: theme, matching weather, and the physics that come with it.
 * `avoid` is the theme of the fight you just left, so a quick fight always takes you somewhere new.
 */
export function pickQuickGround(rng: () => number, avoid: Theme | null = null): { theme: Theme; event: ArenaEvent; name: string } {
  const pool = QUICK_GROUNDS.filter((ground) => ground.theme !== avoid)
  const ground = pool[Math.floor(rng() * pool.length)] ?? QUICK_GROUNDS[0]
  if (!ground) throw new Error('Quick grounds are empty')
  const total = ground.events.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng() * total
  let event: ArenaEvent = ground.events[0]?.[0] ?? 'clear'
  for (const [name, weight] of ground.events) {
    roll -= weight
    if (roll <= 0) {
      event = name
      break
    }
  }
  return { theme: ground.theme, event, name: ground.name }
}

function storyReward(level: StoryLevel, firstClear: boolean): number {
  const bosses = level.slots.filter((slot) => slot.role === 'boss').length
  const base = 16 + level.id * 5 + level.slots.length * 4 + bosses * 14
  return firstClear ? base : Math.max(5, Math.round(base * 0.4))
}

function storyDiff(
  level: StoryLevel,
  count: number,
  progressT: number,
  rating: number,
  answer: number,
  boss: boolean,
): Difficulty {
  const answered = rating * answer
  const windup = boss
    ? Math.max(0.5, level.windup * (1 - progressT * 0.1 - answered * 0.05))
    : Math.max(0.4, level.windup * (1 - progressT * 0.08 - rating * 0.34))
  const cool = boss
    ? Math.max(0.7, level.cooldown * 0.5 * (1 - progressT * 0.14 - answered * 0.08) * 0.64)
    : Math.max(0.5, level.cooldown * 0.46 * (1 - progressT * 0.1 - rating * 0.32))
  const lead = level.lead + progressT * 0.08 + answered * 0.05
  const speed = level.speed * (1 + progressT * 0.08 + answered * 0.06)
  const dodge = clamp(0.1 + progressT * 0.22 + answered * 0.16 + (boss ? 0.32 : 0), 0.08, 0.84)
  const recover = boss ? Math.max(0.16, 0.3 - progressT * 0.08 - answered * 0.04) : 0.32
  const aimTrack = 4.2 + progressT * 2.4 + answered * 1.6 + (boss ? 1.4 : 0)
  return curve(count, windup, cool, lead, speed, dodge, 0.16 + progressT * 0.08, recover, aimTrack)
}

function curve(
  count: number,
  windup: number,
  cooldown: number,
  lead: number,
  speed: number,
  dodge: number,
  bounce: number,
  recover = 0.32,
  aimTrack = 4.4,
): Difficulty {
  const multi = count >= 4 ? 1.55 : count >= 3 ? 1.25 : 1
  return {
    count,
    windup,
    recover,
    cooldown: cooldown * multi,
    speed,
    hp: 0,
    aggro: 4600,
    aimTrack,
    lead,
    bounce,
    dodge,
  }
}

function quickHazards(shape: ArenaShape, width: number, height: number, theme: Theme, rng: () => number): Hazard[] {
  const area = width * height
  const rocks = clamp(Math.round(area / 420000), 1, 8)
  const spikes = clamp(Math.round(area / 540000), 1, 7)
  const dunes = theme === 'desert' ? clamp(Math.round(area / 720000), 1, 5) : 0
  const hazards: Hazard[] = []
  const drop = (kind: Hazard['kind'], r: number, count: number) => {
    for (let i = 0; i < count; i++) {
      let placed = false
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = FENCE + 70 + rng() * (width - FENCE * 2 - 140)
        const y = FENCE + 90 + rng() * (height - FENCE * 2 - 180)
        if (!insideArena(shape, width, height, x, y, FENCE + r + 24)) continue
        const crowded = hazards.some((hazard) => Math.hypot(hazard.x - x, hazard.y - y) < hazard.r + r + 36)
        if (crowded) continue
        hazards.push({ kind, x, y, r, life: -1 })
        placed = true
        break
      }
      if (!placed) hazards.push({ kind, x: width / 2, y: height / 2, r, life: -1 })
    }
  }
  drop('rock', 36, rocks)
  drop('spike', 42, spikes)
  drop('dune', 72, dunes)
  return hazards
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
    hazards.push({ kind: 'spike', x: p.x, y: p.y, r: 42, life: -1 })
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
