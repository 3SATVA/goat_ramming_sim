import {
  BURN_BURST,
  BURN_COOLDOWN,
  BURN_DPS,
  BURN_TIME,
  DAMAGE_CAP,
  DAMAGE_SCALE,
  DAMAGE_THRESHOLD,
  STAGGER_AT,
  DRAG,
  FENCE,
  FENCE_RESTITUTION,
  FENCE_RESTITUTION_OT,
  GOAT_RADIUS,
  GOAT_RESTITUTION,
  HIT_COOLDOWN,
  MAX_LAUNCH,
  MIN_LAUNCH,
  OT_AT,
  PLAYER_HP,
  WORLD,
} from './constants'
import { roleProfile, type FightPlan } from './progress'
import type { BossKind, BossTell, Difficulty, EndResult, Goat, Hazard, Particle, SimHooks, Stats, Team, World } from './types'
import { clamp, lerpAngle } from './util'

export function emptyStats(): Stats {
  return { damageDealt: 0, rams: 0, bestHit: 0, launches: 0 }
}

export function difficulty(round: number): Difficulty {
  const r = Math.max(1, round)
  const multi = r >= 5 ? 1.28 : r >= 3 ? 1.12 : 1
  return {
    count: r >= 5 ? 3 : r >= 3 ? 2 : 1,
    windup: clamp(0.74 - (r - 1) * 0.045, 0.4, 0.74),
    recover: clamp(0.42 - (r - 1) * 0.02, 0.24, 0.42),
    cooldown: clamp((2.7 - (r - 1) * 0.12) * multi, 1.15 * multi, 3.2),
    speed: clamp(0.88 + (r - 1) * 0.035, 0.88, 1.12),
    hp: Math.round(96 + (r - 1) * 6),
    aggro: 780,
    aimTrack: clamp(2.6 + (r - 1) * 0.6, 2.6, 6.8),
    lead: clamp(0.24 + (r - 1) * 0.035, 0.24, 0.48),
    bounce: clamp(0.36 + (r - 1) * 0.07, 0.36, 0.82),
    dodge: clamp(0.5 + (r - 1) * 0.06, 0.5, 0.92),
  }
}

export function createWorld(color: string, minutes: 2 | 3, reduce: boolean): World {
  const world: World = {
    mode: 'menu',
    pausedFrom: 'playing',
    round: 1,
    minutes,
    color,
    goats: [],
    particles: [],
    floaters: [],
    shake: 0,
    timeLeft: minutes * 60,
    overtime: false,
    otBanner: 0,
    goBanner: 0,
    countdown: 0,
    result: null,
    stats: emptyStats(),
    nextId: 1,
    hint: true,
    pairCd: new Map(),
    diff: difficulty(1),
    reduce,
    hitstop: 0,
    crackleAcc: 0,
    lastBlow: 'ram',
    fight: 'story',
    levelName: 'Yard',
    chapterName: 'The Yard',
    event: 'clear',
    windAngle: 0,
    eventBanner: 0,
    coinReward: 0,
    recharge: 0.42,
    maxHp: PLAYER_HP,
    mass: 1,
    damage: 1,
    speed: 1,
    fire: 1,
    theme: 'yard',
    size: WORLD,
    hazards: [],
    zones: [],
    gust: 0,
    gustBoost: 0,
    gustAngle: 0,
    stormAcc: 0,
    stingAcc: 0,
    lineup: [],
  }
  spawnMenuGoat(world)
  return world
}

export function getPlayer(world: World): Goat | undefined {
  return world.goats.find((g) => g.team === 'player')
}

export function spawnMenuGoat(world: World): void {
  world.goats = [
    makeGoat({
      id: world.nextId++,
      name: 'You',
      team: 'player',
      color: world.color,
      x: world.size / 2,
      y: world.size * 0.72,
      facing: -Math.PI / 2,
      hp: world.maxHp,
      maxHp: world.maxHp,
      mass: world.mass,
      damageMul: world.damage,
      speedMul: world.speed,
      fireMul: world.fire,
      role: 'player',
    }),
  ]
  world.particles = []
  world.floaters = []
  world.overtime = false
}

export function applyPlan(world: World, plan: FightPlan): void {
  world.fight = plan.fight
  world.round = plan.round
  world.levelName = plan.name
  world.chapterName = plan.chapterName
  world.minutes = plan.minutes
  world.event = plan.event
  world.theme = plan.theme
  world.size = plan.size
  world.windAngle = plan.windAngle
  world.diff = plan.diff
  world.hazards = plan.hazards.map((hazard) => ({ ...hazard }))
  world.zones = []
  world.lineup = plan.slots.map((slot) => ({ ...slot }))
  world.coinReward = plan.coins
  world.timeLeft = plan.minutes * 60
  world.gust = 0
  world.gustBoost = 0
  world.stormAcc = 0
  world.stingAcc = 0
}

export function setupMatch(world: World): void {
  if (world.lineup.length === 0) world.diff = difficulty(world.round)
  world.mode = 'countdown'
  world.pausedFrom = 'countdown'
  world.countdown = 3
  world.timeLeft = world.minutes * 60
  world.overtime = false
  world.otBanner = 0
  world.goBanner = 0
  world.eventBanner = world.event === 'clear' ? 0 : 3.4
  world.result = null
  world.stats = emptyStats()
  world.pairCd.clear()
  world.particles = []
  world.floaters = []
  world.shake = 0
  world.hitstop = 0
  world.crackleAcc = 0
  world.lastBlow = 'ram'
  world.gust = 0
  world.gustBoost = 0
  world.zones = []
  if (world.round > 1 || world.fight === 'quick') world.hint = false

  const size = world.size
  const goats: Goat[] = []
  const playerRadius = GOAT_RADIUS
  goats.push(
    makeGoat({
      id: world.nextId++,
      name: 'You',
      team: 'player',
      color: world.color,
      x: size / 2,
      y: size - FENCE - playerRadius - 28,
      facing: -Math.PI / 2,
      hp: world.maxHp,
      maxHp: world.maxHp,
      mass: world.mass,
      damageMul: world.damage,
      speedMul: world.speed,
      fireMul: world.fire,
      role: 'player',
      cooldownMax: world.recharge,
    }),
  )

  const slots = world.lineup
  const profiles = slots.map((slot) => roleProfile(slot.role, slot.boss))
  const maxR = Math.max(playerRadius, ...profiles.map((profile) => profile.radius))
  const y = FENCE + maxR + 36
  const margin = FENCE + maxR + 24
  slots.forEach((slot, index) => {
    const profile = profiles[index] ?? roleProfile('rival', null)
    const span = size - margin * 2
    const x = slots.length === 1 ? size / 2 : margin + (span * index) / (slots.length - 1)
    goats.push(
      makeGoat({
        id: world.nextId++,
        name: slot.name,
        team: 'enemy',
        color: slot.color,
        x,
        y,
        facing: Math.PI / 2,
        hp: profile.hp,
        maxHp: profile.hp,
        radius: profile.radius,
        mass: profile.mass,
        damageMul: profile.damage,
        speedMul: profile.speed * world.diff.speed,
        fireMul: 1,
        role: slot.role,
        boss: slot.boss,
        cooldown: 0.55 + index * 1.15 + Math.random() * 0.35,
        cooldownMax: world.diff.cooldown,
      }),
    )
  })
  world.goats = goats
}

export function launchGoat(
  world: World,
  goat: Goat,
  angle: number,
  power: number,
  hooks: SimHooks,
): void {
  const p = clamp(power, 0, 1)
  const storm = world.event === 'sandstorm' ? 0.78 : 1
  const chill = goat.chill > 0 ? 0.58 : 1
  let speed = (MIN_LAUNCH + p * (MAX_LAUNCH - MIN_LAUNCH)) * goat.speedMul * storm * chill
  const drag = Math.max(0.25, eventDrag(world))
  const need = (world.size - FENCE * 2) * (p > 0.7 ? 0.82 : 0.46)
  const coast = speed / drag
  if (coast < need) speed *= Math.min(1.7, need / coast)
  goat.vx = Math.cos(angle) * speed
  goat.vy = Math.sin(angle) * speed
  goat.facing = angle
  goat.charging = false
  goat.chargePower = 0
  goat.squash = 0.3 + p * 0.55
  goat.ramArmed = true
  goat.ramTime = 1.15
  goat.ai = goat.team === 'enemy' ? 'recover' : goat.ai
  if (goat.pendingGlide > 0) {
    goat.glide = goat.pendingGlide
    goat.pendingGlide = 0
  }
  if (goat.pendingGust > 0) {
    world.gustBoost = goat.pendingGust
    world.gustAngle = angle
    world.gust = 1.5
    goat.pendingGust = 0
  }
  if (goat.team === 'player') {
    world.stats.launches += 1
    world.hint = false
    goat.cooldown = 0
    goat.cooldownMax = 0
  }
  if (!world.reduce) world.shake = Math.max(world.shake, 1.2 + p * 2.4)
  burst(world, goat.x - Math.cos(angle) * 10, goat.y - Math.sin(angle) * 10, '#efe6c9', 8, 90, 'dust')
  hooks.whoosh(p)
  hooks.bleat(goat.team)
}

export function step(world: World, dt: number, hooks: SimHooks): void {
  if (world.mode === 'menu' || world.mode === 'customize' || world.mode === 'story' || world.mode === 'upgrades') {
    const player = getPlayer(world)
    if (player) {
      player.facing += dt * 0.65
      player.legPhase += dt * 3
    }
  } else if (world.mode === 'playing') {
    simulate(world, dt, hooks)
  }
  decayFx(world, dt)
}

function simulate(world: World, dt: number, hooks: SimHooks): void {
  world.timeLeft = Math.max(0, world.timeLeft - dt)
  const stormBefore = world.stormAcc
  world.stormAcc += dt
  if (world.event === 'snowstorm') world.windAngle += Math.sin(world.stormAcc) * dt
  if (world.gust > 0) {
    world.gust = Math.max(0, world.gust - dt)
    if (world.gust <= 0) world.gustBoost = 0
  }
  if (world.event === 'snowstorm' || world.event === 'sandstorm') {
    if (Math.floor(world.stormAcc / 0.4) !== Math.floor(stormBefore / 0.4)) {
      hooks.weather(world.event === 'snowstorm' ? 'snow' : 'sand')
    }
  }
  if (world.timeLeft <= OT_AT && world.timeLeft > 0 && !world.overtime) {
    world.overtime = true
    world.otBanner = 2.5
    hooks.overtime()
  }
  if (world.overtime && world.timeLeft > 0) {
    const flames = world.reduce ? 1 : 2
    for (let i = 0; i < flames; i++) spawnFlame(world)
    world.crackleAcc += dt
    if (world.crackleAcc >= 0.09) {
      world.crackleAcc = 0
      hooks.crackle()
    }
  }

  for (const [key, value] of [...world.pairCd]) {
    if (value <= dt) world.pairCd.delete(key)
    else world.pairCd.set(key, value - dt)
  }

  for (const goat of world.goats) {
    goat.flash = Math.max(0, goat.flash - dt)
    goat.squash = Math.max(0, goat.squash - dt * 2.6)
    goat.fenceCd = Math.max(0, goat.fenceCd - dt)
    goat.hazardCd = Math.max(0, goat.hazardCd - dt)
    goat.chill = Math.max(0, goat.chill - dt)
    goat.stun = Math.max(0, goat.stun - dt)
    goat.fx = Math.max(0, goat.fx - dt)
    if (goat.glide > 0) goat.glide = Math.max(0, goat.glide - dt)
    if (goat.ramArmed) {
      goat.ramTime -= dt
      if (goat.ramTime <= 0) goat.ramArmed = false
    }
    if (goat.team === 'player') goat.cooldown = Math.max(0, goat.cooldown - dt)
    if (goat.ignite > 0) {
      const burn = BURN_DPS * dt * goat.fireMul
      goat.ignite -= dt
      applyDamage(world, goat, burn, null, hooks, true, 'fire')
    }
    if (goat.ignite > 0 && goat.fx <= 0) {
      goat.fx = 0.06
      burst(world, goat.x, goat.y - 8, Math.random() > 0.4 ? '#ff9a2a' : '#ffe566', 1, 30, 'flame')
    }

    if (goat.dead) {
      goat.vx *= Math.exp(-6 * dt)
      goat.vy *= Math.exp(-6 * dt)
      goat.x += goat.vx * dt
      goat.y += goat.vy * dt
      continue
    }

    const winding = goat.team === 'enemy' && goat.ai === 'windup'
    if ((goat.team === 'player' && goat.charging) || winding) {
      goat.vx *= Math.exp(-14 * dt)
      goat.vy *= Math.exp(-14 * dt)
      goat.legPhase += dt * 9
    } else {
      const drag = goat.glide > 0 ? DRAG * 0.2 : eventDrag(world)
      const damp = Math.exp(-drag * dt)
      goat.vx *= damp
      goat.vy *= damp
      if (goat.chill > 0 && goat.glide <= 0) {
        const icy = Math.exp(-3.1 * dt)
        goat.vx *= icy
        goat.vy *= icy
      }
      if (goat.glide <= 0) slowInDunes(world, goat, dt)
      pushWeather(world, goat, dt)
      const speed = Math.hypot(goat.vx, goat.vy)
      const drifting = goat.glide > 0 || weatherPush(world) > 0 || world.gustBoost > 0
      if (speed < 14 && !drifting) {
        goat.vx = 0
        goat.vy = 0
      } else if (speed >= 14) {
        goat.facing = lerpAngle(goat.facing, Math.atan2(goat.vy, goat.vx), 1 - Math.exp(-10 * dt))
        goat.legPhase += speed * dt * 0.02
      }
    }

    goat.x += goat.vx * dt
    goat.y += goat.vy * dt
  }

  updateZones(world, dt, hooks)

  for (const goat of world.goats) {
    if (goat.dead) continue
    collideFence(world, goat, hooks)
    collideHazards(world, goat, hooks)
  }
  resolvePairs(world, hooks)
  const player = getPlayer(world)
  if (player && !player.dead) {
    for (const goat of world.goats) {
      if (goat.team === 'enemy' && !goat.dead) updateEnemy(world, goat, player, dt, hooks)
    }
  }
  sting(world, dt, hooks)
  checkEnd(world, hooks)
}

function eventDrag(world: World): number {
  let drag = DRAG
  if (world.theme === 'ice') drag *= 0.58
  if (world.event === 'snowstorm') drag *= 0.7
  if (world.event === 'rain') drag *= 0.45
  if (world.event === 'mud') drag *= 2.4
  if (world.theme === 'desert') drag *= 1.12
  return drag
}

function slowInDunes(world: World, goat: Goat, dt: number): void {
  for (const hazard of world.hazards) {
    if (hazard.kind !== 'dune') continue
    if (Math.hypot(goat.x - hazard.x, goat.y - hazard.y) >= hazard.r) continue
    const damp = Math.exp(-3.2 * dt)
    goat.vx *= damp
    goat.vy *= damp
  }
}

function weatherPush(world: World): number {
  if (world.event === 'wind') return 118
  if (world.event === 'snowstorm') return 80 + Math.sin(world.stormAcc * 1.4) * 70
  if (world.event === 'sandstorm') return 150
  return 0
}

function pushWeather(world: World, goat: Goat, dt: number): void {
  const push = weatherPush(world)
  if (push > 0) {
    goat.vx += Math.cos(world.windAngle) * push * dt
    goat.vy += Math.sin(world.windAngle) * push * dt
  }
  if (world.gust > 0 && world.gustBoost > 0) {
    goat.vx += Math.cos(world.gustAngle) * world.gustBoost * dt
    goat.vy += Math.sin(world.gustAngle) * world.gustBoost * dt
  }
}

function sting(world: World, dt: number, hooks: SimHooks): void {
  if (world.event !== 'sandstorm') {
    world.stingAcc = 0
    return
  }
  world.stingAcc += dt
  if (world.stingAcc < 2.7) return
  world.stingAcc = 0
  for (const goat of world.goats) {
    if (goat.dead || sheltered(world, goat)) continue
    applyDamage(world, goat, 1, null, hooks, false, 'hazard')
  }
}

function sheltered(world: World, goat: Goat): boolean {
  return world.hazards.some(
    (hazard) => hazard.kind === 'rock' && Math.hypot(goat.x - hazard.x, goat.y - hazard.y) < hazard.r + goat.radius + 18,
  )
}

function updateEnemy(world: World, goat: Goat, target: Goat, dt: number, hooks: SimHooks): void {
  const diff = world.diff
  goat.cooldown = Math.max(0, goat.cooldown - dt)
  if (goat.stun > 0) {
    if (goat.ai === 'windup') {
      goat.ai = 'idle'
      goat.tell = null
    }
    return
  }
  if (goat.ai === 'windup') {
    if (goat.tell === 'vortex' && goat.aiTimer > 0.22) {
      goat.markX = target.x
      goat.markY = target.y
      goat.aimAngle = Math.atan2(target.y - goat.y, target.x - goat.x)
    } else if (goat.aiTimer > 0.18) {
      const desired = planAngle(world, goat, target)
      goat.aimAngle = lerpAngle(goat.aimAngle, desired, 1 - Math.exp(-diff.aimTrack * dt))
    }
    goat.facing = goat.aimAngle
    goat.aiTimer -= dt
    if (goat.aiTimer <= 0) {
      const plan = goat.plan
      const tell = goat.tell
      goat.tell = null
      if (tell === 'breath') castBreath(world, goat, hooks)
      else if (tell === 'vortex') castVortex(world, goat, hooks)
      else launchGoat(world, goat, goat.aimAngle, goat.aimPower, hooks)
      const cdMul = goat.pendingCd > 0 ? goat.pendingCd : 1
      goat.pendingCd = 0
      if (goat.boss && plan !== 'dodge') goat.bossStep += 1
      const snow = world.event === 'snowstorm' ? 1.35 : 1
      const rapid = tell === 'combo'
      goat.ai = 'recover'
      goat.aiTimer = (plan === 'dodge' ? diff.recover * 0.6 : rapid ? 0.08 : diff.recover) * snow
      goat.cooldown = (rapid ? 0.1 : diff.cooldown * (plan === 'dodge' ? 0.4 : 1) * cdMul) * snow
      goat.plan = 'attack'
      goat.sawAim = false
    }
    return
  }
  if (goat.ai === 'recover') {
    goat.aiTimer -= dt
    if (goat.aiTimer <= 0) goat.ai = 'idle'
    return
  }

  const desiredFace = Math.atan2(target.y - goat.y, target.x - goat.x)
  goat.facing = lerpAngle(goat.facing, desiredFace, 1 - Math.exp(-4 * dt))
  const dist = Math.hypot(target.x - goat.x, target.y - goat.y)
  if (aimThreat(target, goat)) {
    if (!goat.sawAim) {
      goat.sawAim = true
      if (Math.random() < diff.dodge && windupSlotFree(world)) {
        beginWindup(goat, 'dodge', dodgeAngle(world, goat, target), 0.4, Math.max(0.48, diff.windup * 0.7))
        return
      }
    }
  } else {
    goat.sawAim = false
  }

  if (goat.cooldown > 0 || dist > diff.aggro || !windupSlotFree(world)) return
  beginAttack(world, goat, target, dist)
}

function windupSlotFree(world: World): boolean {
  const alive = world.goats.filter((g) => g.team === 'enemy' && !g.dead)
  const cap = alive.length >= 4 ? 2 : 1
  return alive.filter((g) => g.ai === 'windup').length < cap
}

function beginAttack(world: World, goat: Goat, target: Goat, dist: number): void {
  const diff = world.diff
  const move = bossMove(goat, diff)
  if (move) {
    goat.pendingGlide = move.glide
    goat.pendingGust = move.gust
    goat.pendingCd = move.cooldownMul
    goat.tell = move.tell
    goat.markX = target.x
    goat.markY = target.y
    const angle =
      move.cast === 'ram' ? attackAngle(world, goat, target, move.power) : Math.atan2(target.y - goat.y, target.x - goat.x)
    beginWindup(goat, 'attack', angle, move.power, move.windup)
    return
  }
  const power = ramPower(dist, goat.radius)
  const plan = pickAttack(world, goat, target, power)
  const angle = plan === 'bounce' ? bankAngle(world, goat, target, power) : attackAngle(world, goat, target, power)
  const windup = power < 0.42 ? Math.max(0.44, diff.windup * 0.62) : diff.windup
  goat.pendingGlide = 0
  goat.pendingGust = 0
  goat.pendingCd = 0
  goat.tell = null
  beginWindup(goat, plan, angle, power, windup)
}

interface BossMove {
  cast: 'ram' | 'breath' | 'vortex'
  power: number
  windup: number
  glide: number
  gust: number
  cooldownMul: number
  tell: BossTell | null
}

function bossMove(goat: Goat, diff: Difficulty): BossMove | null {
  if (!goat.boss) return null
  const step = goat.bossStep
  const wind = (mul: number, floor = 0.44) => Math.max(floor, diff.windup * mul)
  if (goat.boss === 'yard') {
    if (step % 4 < 3) {
      return { cast: 'ram', power: 0.96, windup: wind(0.48, 0.34), glide: 0.45, gust: 0, cooldownMul: 0.16, tell: 'combo' }
    }
    return { cast: 'ram', power: 1, windup: wind(1.55), glide: 1.05, gust: 0, cooldownMul: 1, tell: null }
  }
  if (goat.boss === 'frost') {
    if (step % 3 === 0) {
      return { cast: 'breath', power: 0, windup: Math.max(1.05, diff.windup * 1.12), glide: 0, gust: 0, cooldownMul: 0.7, tell: 'breath' }
    }
    if (step % 3 === 1) {
      return { cast: 'ram', power: 1, windup: wind(1.75), glide: 1.65, gust: 0, cooldownMul: 1, tell: null }
    }
    return { cast: 'ram', power: 0.46, windup: wind(0.62), glide: 0.25, gust: 0, cooldownMul: 1, tell: null }
  }
  if (step % 4 === 0) {
    return { cast: 'vortex', power: 0, windup: 1.05, glide: 0, gust: 0, cooldownMul: 0.55, tell: 'vortex' }
  }
  if (step % 4 === 3) {
    return { cast: 'ram', power: 1, windup: wind(1.2), glide: 0.4, gust: 120, cooldownMul: 1, tell: null }
  }
  return { cast: 'ram', power: 0.34, windup: wind(0.5), glide: 0, gust: 0, cooldownMul: 0.32, tell: null }
}

function castBreath(world: World, goat: Goat, hooks: SimHooks): void {
  goat.pendingGlide = 0
  goat.pendingGust = 0
  const reach = 380
  const half = 0.62
  for (const other of world.goats) {
    if (other.dead || other.id === goat.id) continue
    const dx = other.x - goat.x
    const dy = other.y - goat.y
    const dist = Math.hypot(dx, dy)
    if (dist > reach || dist < 1) continue
    const ang = Math.atan2(dy, dx)
    const delta = Math.atan2(Math.sin(ang - goat.aimAngle), Math.cos(ang - goat.aimAngle))
    if (Math.abs(delta) > half) continue
    other.chill = Math.max(other.chill, 2.6)
    applyDamage(world, other, 8 + goat.damageMul * 4, goat, hooks, false, 'ice')
  }
  const ahead = 160
  world.zones.push({
    kind: 'ice',
    x: clamp(goat.x + Math.cos(goat.aimAngle) * ahead, FENCE + 48, world.size - FENCE - 48),
    y: clamp(goat.y + Math.sin(goat.aimAngle) * ahead, FENCE + 48, world.size - FENCE - 48),
    r: 96,
    life: 5,
    max: 5,
    tick: 0,
  })
  if (world.zones.length > 6) world.zones.splice(0, world.zones.length - 6)
  goat.squash = 0.45
  burst(world, goat.x + Math.cos(goat.aimAngle) * 70, goat.y + Math.sin(goat.aimAngle) * 70, '#d7f4ff', 16, 180, 'spark')
  hooks.whoosh(0.85)
  hooks.bleat(goat.team)
}

function castVortex(world: World, goat: Goat, hooks: SimHooks): void {
  goat.pendingGlide = 0
  goat.pendingGust = 0
  world.zones.push({
    kind: 'vortex',
    x: clamp(goat.markX, FENCE + 48, world.size - FENCE - 48),
    y: clamp(goat.markY, FENCE + 48, world.size - FENCE - 48),
    r: 120,
    life: 2.8,
    max: 2.8,
    tick: 0.08,
  })
  if (world.zones.length > 6) world.zones.splice(0, world.zones.length - 6)
  goat.squash = 0.4
  burst(world, goat.markX, goat.markY, '#ffcf70', 18, 150, 'dust')
  hooks.whoosh(0.7)
  hooks.bleat(goat.team)
}

function updateZones(world: World, dt: number, hooks: SimHooks): void {
  for (const zone of world.zones) {
    zone.life -= dt
    const pulse = zone.kind === 'vortex' && zone.tick <= 0
    if (zone.kind === 'vortex') zone.tick -= dt
    for (const goat of world.goats) {
      if (goat.dead || goat.role === 'boss') continue
      const dx = zone.x - goat.x
      const dy = zone.y - goat.y
      const dist = Math.hypot(dx, dy)
      if (dist > zone.r) continue
      if (zone.kind === 'ice') {
        goat.chill = Math.max(goat.chill, 0.55)
        continue
      }
      if (dist > 8) {
        const pull = 480 * (1 - dist / zone.r)
        goat.vx += (dx / dist) * pull * dt
        goat.vy += (dy / dist) * pull * dt
      }
      if (pulse && dist < zone.r * 0.6) applyDamage(world, goat, 5, null, hooks, false, 'vortex')
    }
    if (pulse) zone.tick = 0.48
  }
  world.zones = world.zones.filter((zone) => zone.life > 0)
}

function ramPower(dist: number, radius: number): number {
  if (dist < radius * 3.4) return 0.24 + Math.random() * 0.16
  if (dist < radius * 7.2) return 0.5 + Math.random() * 0.22
  return 0.84 + Math.random() * 0.16
}

function beginWindup(goat: Goat, plan: Goat['plan'], angle: number, power: number, windup: number): void {
  if (plan === 'dodge') {
    goat.pendingGlide = 0
    goat.pendingGust = 0
    goat.pendingCd = 0
    goat.tell = null
  }
  goat.plan = plan
  goat.ai = 'windup'
  goat.aiWindup = windup
  goat.aiTimer = windup
  goat.aimAngle = angle
  goat.aimPower = power
  goat.facing = angle
}

function aimThreat(player: Goat, goat: Goat): boolean {
  if (!player.charging || player.chargePower < 0.22 || player.dead) return false
  const dist = Math.hypot(goat.x - player.x, goat.y - player.y)
  if (dist > 480 || dist < 1) return false
  const toGoat = Math.atan2(goat.y - player.y, goat.x - player.x)
  const delta = Math.atan2(Math.sin(toGoat - player.chargeAngle), Math.cos(toGoat - player.chargeAngle))
  return Math.abs(delta) < 0.62
}

function planAngle(world: World, goat: Goat, target: Goat): number {
  if (goat.plan === 'dodge') return dodgeAngle(world, goat, target)
  const power = goat.aimPower > 0 ? goat.aimPower : 0.7
  if (goat.plan === 'bounce') return bankAngle(world, goat, target, power)
  return attackAngle(world, goat, target, power)
}

function attackAngle(world: World, goat: Goat, target: Goat, power: number): number {
  const point = aimedPoint(world, goat, target, power)
  const rock = blockingRock(world, goat.x, goat.y, point.x, point.y, goat.radius)
  const base = Math.atan2(point.y - goat.y, point.x - goat.x)
  if (!rock) return base
  const cross = (point.x - goat.x) * (rock.y - goat.y) - (point.y - goat.y) * (rock.x - goat.x)
  return base + (cross >= 0 ? -0.6 : 0.6)
}

function bankAngle(world: World, goat: Goat, target: Goat, power: number): number {
  const point = aimedPoint(world, goat, target, power)
  const mirrored = bankMirror(world, point)
  if (!mirrored) return attackAngle(world, goat, target, power)
  return Math.atan2(mirrored.y - goat.y, mirrored.x - goat.x)
}

function aimedPoint(world: World, goat: Goat, target: Goat, power: number): { x: number; y: number } {
  const speed = (MIN_LAUNCH + clamp(power, 0, 1) * (MAX_LAUNCH - MIN_LAUNCH)) * Math.max(0.4, goat.speedMul)
  const dist = Math.hypot(target.x - goat.x, target.y - goat.y)
  const flight = clamp(dist / Math.max(200, speed * 0.62), 0.1, 0.48)
  let vx = target.vx
  let vy = target.vy
  if (target.charging && target.chargePower > 0.18) {
    const launch = (MIN_LAUNCH + target.chargePower * (MAX_LAUNCH - MIN_LAUNCH)) * target.speedMul * 0.7
    vx = Math.cos(target.chargeAngle) * launch
    vy = Math.sin(target.chargeAngle) * launch
  }
  const inset = FENCE + 72
  return {
    x: clamp(target.x + vx * flight, inset, world.size - inset),
    y: clamp(target.y + vy * flight, inset, world.size - inset),
  }
}

function bankMirror(world: World, point: { x: number; y: number }): { x: number; y: number } | null {
  const min = FENCE + GOAT_RADIUS
  const max = world.size - min
  const walls = [
    { gap: point.x - min, x: 2 * min - point.x, y: point.y },
    { gap: max - point.x, x: 2 * max - point.x, y: point.y },
    { gap: point.y - min, x: point.x, y: 2 * min - point.y },
    { gap: max - point.y, x: point.x, y: 2 * max - point.y },
  ]
  walls.sort((a, b) => a.gap - b.gap)
  const best = walls[0]
  if (!best || best.gap > 170) return null
  return { x: best.x, y: best.y }
}

function blockingRock(world: World, x0: number, y0: number, x1: number, y1: number, radius: number): Hazard | null {
  for (const hazard of world.hazards) {
    if (hazard.kind !== 'rock') continue
    if (distToSegment(hazard.x, hazard.y, x0, y0, x1, y1) < hazard.r + radius * 0.75) return hazard
  }
  return null
}

function distToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = dx * dx + dy * dy
  if (len < 0.001) return Math.hypot(px - x0, py - y0)
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / len, 0, 1)
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t))
}

function pickAttack(world: World, goat: Goat, target: Goat, power: number): 'attack' | 'bounce' {
  const pred = aimedPoint(world, goat, target, power)
  const mirrored = bankMirror(world, pred)
  if (!mirrored) return 'attack'
  if (Math.random() > world.diff.bounce) return 'attack'
  const direct = Math.atan2(pred.y - goat.y, pred.x - goat.x)
  const bank = Math.atan2(mirrored.y - goat.y, mirrored.x - goat.x)
  const delta = Math.abs(Math.atan2(Math.sin(bank - direct), Math.cos(bank - direct)))
  if (delta < 0.18 || delta > 2.4) return 'attack'
  return 'bounce'
}

function dodgeAngle(world: World, goat: Goat, player: Goat): number {
  const left = player.chargeAngle + Math.PI / 2
  const right = player.chargeAngle - Math.PI / 2
  const score = (angle: number) => {
    const nx = goat.x + Math.cos(angle) * 150
    const ny = goat.y + Math.sin(angle) * 150
    return -Math.hypot(nx - world.size / 2, ny - world.size / 2) - railPenalty(world, nx, ny)
  }
  return score(left) >= score(right) ? left : right
}

function railPenalty(world: World, x: number, y: number): number {
  const min = FENCE + 96
  const max = world.size - min
  let penalty = 0
  if (x < min) penalty += (min - x) * 4
  if (x > max) penalty += (x - max) * 4
  if (y < min) penalty += (min - y) * 4
  if (y > max) penalty += (y - max) * 4
  return penalty
}

function collideFence(world: World, goat: Goat, hooks: SimHooks): void {
  const min = FENCE + goat.radius
  const max = world.size - FENCE - goat.radius
  let hitX = false
  let hitY = false
  let impact = 0
  if (goat.x < min) {
    impact = Math.max(impact, Math.abs(goat.vx))
    goat.x = min
    goat.vx = Math.abs(goat.vx)
    hitX = true
  } else if (goat.x > max) {
    impact = Math.max(impact, Math.abs(goat.vx))
    goat.x = max
    goat.vx = -Math.abs(goat.vx)
    hitX = true
  }
  if (goat.y < min) {
    impact = Math.max(impact, Math.abs(goat.vy))
    goat.y = min
    goat.vy = Math.abs(goat.vy)
    hitY = true
  } else if (goat.y > max) {
    impact = Math.max(impact, Math.abs(goat.vy))
    goat.y = max
    goat.vy = -Math.abs(goat.vy)
    hitY = true
  }

  if (hitX || hitY) {
    const soft = !world.overtime && impact < 70
    const rest = soft ? 0 : world.overtime ? FENCE_RESTITUTION_OT : FENCE_RESTITUTION
    if (hitX) goat.vx *= rest
    if (hitY) goat.vy *= rest
    if (impact > 90) {
      const mag = Math.min(16, impact / 90)
      if (!world.reduce) world.shake = Math.max(world.shake, mag)
      else world.shake = Math.max(world.shake, mag * 0.2)
      goat.squash = Math.min(1, impact / 700)
      hooks.thud(clamp(impact / MAX_LAUNCH, 0.25, 1))
      burst(world, goat.x, goat.y, '#f3ead7', 7, 70 + impact * 0.05, 'dust')
      if (!world.reduce) world.hitstop = Math.max(world.hitstop, impact > 420 ? 0.04 : 0)
    }
  }

  if (!world.overtime || goat.fenceCd > 0) return
  if (!againstFence(world, goat)) return
  goat.fenceCd = BURN_COOLDOWN
  goat.ignite = Math.max(goat.ignite, BURN_TIME * (0.65 + 0.35 * goat.fireMul))
  applyDamage(world, goat, BURN_BURST * goat.fireMul, null, hooks, false, 'fire')
  hooks.burn()
  burst(world, goat.x, goat.y, '#ff8a24', 6, 80, 'flame')
  if (goat.charging && goat.team === 'player') goat.charging = false
}

function againstFence(world: World, goat: Goat): boolean {
  const min = FENCE + goat.radius + 1.25
  const max = world.size - FENCE - goat.radius - 1.25
  return goat.x <= min || goat.x >= max || goat.y <= min || goat.y >= max
}

function collideHazards(world: World, goat: Goat, hooks: SimHooks): void {
  for (const hazard of world.hazards) {
    const dx = goat.x - hazard.x
    const dy = goat.y - hazard.y
    const dist = Math.hypot(dx, dy)
    if (hazard.kind === 'rock') {
      const minDist = hazard.r + goat.radius
      if (dist >= minDist || dist < 0.001) continue
      const nx = dx / dist
      const ny = dy / dist
      goat.x = hazard.x + nx * minDist
      goat.y = hazard.y + ny * minDist
      const into = goat.vx * nx + goat.vy * ny
      if (into < 0) {
        goat.vx -= (1 + 0.72) * into * nx
        goat.vy -= (1 + 0.72) * into * ny
        if (-into > 160) hooks.thud(clamp(-into / MAX_LAUNCH, 0.2, 0.8))
      }
    } else if (hazard.kind === 'spike' && dist < hazard.r + goat.radius * 0.55 && goat.hazardCd <= 0) {
      goat.hazardCd = 0.62
      applyDamage(world, goat, 4 + Math.random() * 2, null, hooks, false, 'hazard')
      hooks.thud(0.45)
    }
  }
}

function resolvePairs(world: World, hooks: SimHooks): void {
  const list = world.goats.filter((g) => !g.dead)
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (!a || !b || a.dead || b.dead) continue
        solvePair(world, a, b, iter === 0, hooks)
      }
    }
  }
}

function solvePair(world: World, a: Goat, b: Goat, withHit: boolean, hooks: SimHooks): void {
  let dx = b.x - a.x
  let dy = b.y - a.y
  let dist = Math.hypot(dx, dy)
  const minDist = a.radius + b.radius
  if (dist >= minDist) return
  if (dist < 0.0001) {
    dx = 1
    dy = 0
    dist = 0.0001
  }
  const nx = dx / dist
  const ny = dy / dist
  const pen = minDist - dist
  const invA = 1 / Math.max(0.2, a.mass)
  const invB = 1 / Math.max(0.2, b.mass)
  const share = invA + invB
  a.x -= nx * pen * (invA / share)
  a.y -= ny * pen * (invA / share)
  b.x += nx * pen * (invB / share)
  b.y += ny * pen * (invB / share)
  if (!withHit) return

  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (rel >= 0) return
  const impact = -rel
  const intoA = Math.max(0, a.vx * nx + a.vy * ny)
  const intoB = Math.max(0, -(b.vx * nx + b.vy * ny))
  const impulse = (-(1 + GOAT_RESTITUTION) * rel) / share
  a.vx -= (impulse * nx) * invA
  a.vy -= (impulse * ny) * invA
  b.vx += (impulse * nx) * invB
  b.vy += (impulse * ny) * invB

  if (impact > 120) {
    const mag = Math.min(18, impact / 80)
    if (!world.reduce) world.shake = Math.max(world.shake, mag)
    hooks.thud(clamp(impact / (MAX_LAUNCH * 1.4), 0.3, 1))
    burst(world, (a.x + b.x) / 2, (a.y + b.y) / 2, '#fff4d2', 12, 140, 'spark')
    a.squash = Math.min(1, impact / 800)
    b.squash = Math.min(1, impact / 800)
    if (impact > 380 && !world.reduce) world.hitstop = Math.max(world.hitstop, 0.045)
  }

  if (impact <= DAMAGE_THRESHOLD) return
  const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`
  if ((world.pairCd.get(key) ?? 0) > 0) return
  const clearA = intoA > intoB * 1.12 && intoA > 40
  const clearB = intoB > intoA * 1.12 && intoB > 40
  let attacker: Goat | null = null
  let victim: Goat | null = null
  if (clearA) {
    attacker = a
    victim = b
  } else if (clearB) {
    attacker = b
    victim = a
  } else if (a.ramArmed !== b.ramArmed) {
    attacker = a.ramArmed ? a : b
    victim = a.ramArmed ? b : a
  }
  if (!attacker || !victim) return
  world.pairCd.set(key, HIT_COOLDOWN)
  const base = Math.min(DAMAGE_CAP, (impact - DAMAGE_THRESHOLD) * DAMAGE_SCALE)
  const dmg = base * attacker.damageMul
  if (dmg <= 0.75) return
  applyDamage(world, victim, dmg, attacker, hooks, false, 'ram')
  if (dmg > STAGGER_AT) stagger(victim)
}

function stagger(goat: Goat): void {
  goat.charging = false
  goat.stun = 0.34
  goat.sawAim = false
  if (goat.team === 'enemy' && goat.ai === 'windup') goat.ai = 'idle'
}

function applyDamage(
  world: World,
  goat: Goat,
  amount: number,
  attacker: Goat | null,
  hooks: SimHooks,
  silent: boolean,
  kind: 'ram' | 'fire' | 'hazard' | 'ice' | 'vortex',
): void {
  if (goat.dead || amount <= 0 || world.mode !== 'playing') return
  goat.hp -= amount
  if (!silent) {
    goat.flash = 0.16
    const shown = Math.max(1, Math.round(amount))
    const color =
      kind === 'fire' ? '#ffb088' : kind === 'ice' ? '#d7f4ff' : kind === 'vortex' ? '#ffcf70' : kind === 'hazard' ? '#e6c98a' : '#fff6e4'
    world.floaters.push({
      x: goat.x + (Math.random() - 0.5) * 10,
      y: goat.y - goat.radius - 8,
      vy: -42,
      life: 0.7,
      max: 0.7,
      text: `-${shown}`,
      color,
    })
    if (world.floaters.length > 24) world.floaters.splice(0, world.floaters.length - 24)
    if (attacker?.team === 'player' && goat.team === 'enemy' && kind === 'ram') {
      world.stats.damageDealt += amount
      world.stats.bestHit = Math.max(world.stats.bestHit, amount)
      if (attacker.ramArmed) {
        world.stats.rams += 1
        attacker.ramArmed = false
      }
    }
  }
  if (goat.hp > 0) return
  goat.hp = 0
  goat.dead = true
  world.lastBlow = kind === 'ram' || kind === 'fire' ? kind : 'hazard'
  goat.charging = false
  goat.vx *= 0.25
  goat.vy *= 0.25
  burst(world, goat.x, goat.y, '#fff6e8', 16, 160, 'spark')
  hooks.ko()
}

function checkEnd(world: World, hooks: SimHooks): void {
  if (world.mode !== 'playing') return
  const player = getPlayer(world)
  if (!player) return
  const enemies = world.goats.filter((g) => g.team === 'enemy')
  const playerDead = player.hp <= 0
  const enemiesDead = enemies.length > 0 && enemies.every((g) => g.hp <= 0)
  if (playerDead && enemiesDead) return finish(world, 'draw', 'ko', hooks)
  if (playerDead) return finish(world, 'lose', 'ko', hooks)
  if (enemiesDead) return finish(world, 'win', 'ko', hooks)
  if (world.timeLeft <= 0) {
    const enemyHp = enemies.reduce((sum, g) => sum + Math.max(0, g.hp), 0)
    const result = player.hp > enemyHp ? 'win' : player.hp < enemyHp ? 'lose' : 'draw'
    finish(world, result, 'time', hooks)
  }
}

function finish(world: World, result: EndResult['result'], reason: EndResult['reason'], hooks: SimHooks): void {
  const player = getPlayer(world)
  const enemyHp = world.goats.filter((g) => g.team === 'enemy').reduce((sum, g) => sum + Math.max(0, g.hp), 0)
  const end: EndResult = {
    result,
    reason,
    round: world.round,
    playerHp: Math.max(0, Math.round(player?.hp ?? 0)),
    enemyHp: Math.round(enemyHp),
    damageDealt: Math.round(world.stats.damageDealt),
    rams: world.stats.rams,
    bestHit: Math.round(world.stats.bestHit),
    launches: world.stats.launches,
    blow: reason === 'time' ? 'time' : world.lastBlow,
    coins: result === 'win' ? world.coinReward : 0,
    fight: world.fight,
    levelName: world.levelName,
    chapterName: world.chapterName,
    event: world.event,
  }
  world.result = end
  world.mode = 'end'
  world.hitstop = 0
  hooks.finish(end)
}

function decayFx(world: World, dt: number): void {
  for (const particle of world.particles) {
    particle.life -= dt
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.angle += particle.spin * dt
    if (particle.kind === 'flame') {
      particle.vx *= Math.exp(-1.4 * dt)
      particle.vy *= Math.exp(-1.4 * dt)
    } else {
      particle.vy += 70 * dt
    }
  }
  world.particles = world.particles.filter((p) => p.life > 0)
  if (world.particles.length > 360) world.particles.splice(0, world.particles.length - 360)
  for (const floater of world.floaters) {
    floater.life -= dt
    floater.y += floater.vy * dt
  }
  world.floaters = world.floaters.filter((f) => f.life > 0)
  world.shake *= Math.exp(-3.4 * dt)
}

function burst(
  world: World,
  x: number,
  y: number,
  color: string,
  count: number,
  speed: number,
  kind: Particle['kind'],
): void {
  const n = world.reduce ? Math.max(1, Math.ceil(count * 0.35)) : count
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2
    const vel = speed * (0.35 + Math.random() * 0.75)
    const life = 0.28 + Math.random() * 0.4
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel,
      life,
      max: life,
      size: kind === 'flame' ? 5 + Math.random() * 4 : 2.5 + Math.random() * 3.5,
      color,
      kind,
      spin: (Math.random() - 0.5) * 8,
      angle,
    })
  }
}

function spawnFlame(world: World): void {
  const a = FENCE
  const b = world.size - FENCE
  const edge = (Math.random() * 4) | 0
  const t = a + Math.random() * (b - a)
  let x = t
  let y = a
  let vx = (Math.random() - 0.5) * 16
  let vy = (Math.random() - 0.5) * 16
  if (edge === 0) {
    x = t
    y = a
    vy -= 36 + Math.random() * 46
  } else if (edge === 1) {
    x = t
    y = b
    vy += 36 + Math.random() * 46
  } else if (edge === 2) {
    x = a
    y = t
    vx -= 36 + Math.random() * 46
  } else {
    x = b
    y = t
    vx += 36 + Math.random() * 46
  }
  const life = 0.32 + Math.random() * 0.45
  world.particles.push({
    x: x + (Math.random() - 0.5) * 8,
    y: y + (Math.random() - 0.5) * 8,
    vx,
    vy,
    life,
    max: life,
    size: 7 + Math.random() * 8,
    color: Math.random() > 0.4 ? '#ff9a2a' : '#ffe566',
    kind: 'flame',
    spin: (Math.random() - 0.5) * 2,
    angle: 0,
  })
}

function makeGoat(partial: {
  id: number
  name: string
  team: Team
  color: string
  x: number
  y: number
  facing: number
  hp: number
  maxHp: number
  radius?: number
  cooldown?: number
  cooldownMax?: number
  mass?: number
  damageMul?: number
  speedMul?: number
  fireMul?: number
  role?: Goat['role']
  boss?: BossKind | null
}): Goat {
  return {
    id: partial.id,
    name: partial.name,
    team: partial.team,
    color: partial.color,
    x: partial.x,
    y: partial.y,
    vx: 0,
    vy: 0,
    facing: partial.facing,
    radius: partial.radius ?? GOAT_RADIUS,
    hp: partial.hp,
    maxHp: partial.maxHp,
    legPhase: Math.random() * Math.PI * 2,
    squash: 0,
    flash: 0,
    ignite: 0,
    fenceCd: 0,
    dead: false,
    blinkOffset: Math.random() * 10,
    charging: false,
    chargePower: 0,
    chargeAngle: partial.facing,
    ai: 'idle',
    aiTimer: 0,
    aiWindup: 1,
    aimAngle: partial.facing,
    aimPower: 0,
    cooldown: partial.cooldown ?? 0,
    stun: 0,
    ramArmed: false,
    ramTime: 0,
    fx: 0,
    plan: 'attack',
    sawAim: false,
    role: partial.role ?? (partial.team === 'player' ? 'player' : 'rival'),
    boss: partial.boss ?? null,
    mass: partial.mass ?? 1,
    damageMul: partial.damageMul ?? 1,
    speedMul: partial.speedMul ?? 1,
    fireMul: partial.fireMul ?? 1,
    cooldownMax: partial.cooldownMax ?? 0.42,
    glide: 0,
    pendingGlide: 0,
    pendingGust: 0,
    pendingCd: 0,
    hazardCd: 0,
    bossStep: 0,
    tell: null,
    markX: 0,
    markY: 0,
    chill: 0,
  }
}
