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
import type { Difficulty, EndResult, Goat, Particle, SimHooks, Stats, Team, World } from './types'
import { clamp, colorDist, lerpAngle } from './util'

const RIVALS: { name: string; color: string }[] = [
  { name: 'Nanny', color: '#d0693c' },
  { name: 'Buck', color: '#3c5d8a' },
  { name: 'Bleatrice', color: '#7a4b93' },
  { name: 'Ramsey', color: '#a33b3b' },
  { name: 'Goatzart', color: '#2c7468' },
  { name: 'Kiddo', color: '#c8962e' },
]

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
      x: WORLD / 2,
      y: WORLD * 0.72,
      facing: -Math.PI / 2,
      hp: PLAYER_HP,
      maxHp: PLAYER_HP,
    }),
  ]
  world.particles = []
  world.floaters = []
  world.overtime = false
}

export function setupMatch(world: World): void {
  world.diff = difficulty(world.round)
  world.mode = 'countdown'
  world.pausedFrom = 'countdown'
  world.countdown = 3
  world.timeLeft = world.minutes * 60
  world.overtime = false
  world.otBanner = 0
  world.goBanner = 0
  world.result = null
  world.stats = emptyStats()
  world.pairCd.clear()
  world.particles = []
  world.floaters = []
  world.shake = 0
  world.hitstop = 0
  world.crackleAcc = 0
  world.lastBlow = 'ram'
  if (world.round > 1) world.hint = false

  const goats: Goat[] = []
  const margin = FENCE + GOAT_RADIUS + 36
  goats.push(
    makeGoat({
      id: world.nextId++,
      name: 'You',
      team: 'player',
      color: world.color,
      x: WORLD / 2,
      y: WORLD - margin,
      facing: -Math.PI / 2,
      hp: PLAYER_HP,
      maxHp: PLAYER_HP,
    }),
  )

  const picks = pickRivals(world.color, world.diff.count)
  picks.forEach((look, index) => {
    const span = WORLD - margin * 2
    const x = picks.length === 1 ? WORLD / 2 : margin + (span * index) / (picks.length - 1)
    goats.push(
      makeGoat({
        id: world.nextId++,
        name: look.name,
        team: 'enemy',
        color: look.color,
        x,
        y: margin,
        facing: Math.PI / 2,
        hp: world.diff.hp,
        maxHp: world.diff.hp,
        cooldown: 0.45 + Math.random() * 0.7,
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
  speedMult: number,
  hooks: SimHooks,
): void {
  const p = clamp(power, 0, 1)
  const speed = (MIN_LAUNCH + p * (MAX_LAUNCH - MIN_LAUNCH)) * speedMult
  goat.vx = Math.cos(angle) * speed
  goat.vy = Math.sin(angle) * speed
  goat.facing = angle
  goat.charging = false
  goat.chargePower = 0
  goat.squash = 0.3 + p * 0.55
  goat.ramArmed = true
  goat.ramTime = 1.15
  goat.ai = goat.team === 'enemy' ? 'recover' : goat.ai
  if (goat.team === 'player') {
    world.stats.launches += 1
    world.hint = false
  }
  if (!world.reduce) world.shake = Math.max(world.shake, 1.2 + p * 2.4)
  burst(world, goat.x - Math.cos(angle) * 10, goat.y - Math.sin(angle) * 10, '#efe6c9', 8, 90, 'dust')
  hooks.whoosh(p)
  hooks.bleat(goat.team)
}

export function step(world: World, dt: number, hooks: SimHooks): void {
  if (world.mode === 'menu' || world.mode === 'customize') {
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
    goat.stun = Math.max(0, goat.stun - dt)
    goat.fx = Math.max(0, goat.fx - dt)
    if (goat.ramArmed) {
      goat.ramTime -= dt
      if (goat.ramTime <= 0) goat.ramArmed = false
    }
    if (goat.ignite > 0) {
      const burn = BURN_DPS * dt
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
      const damp = Math.exp(-DRAG * dt)
      goat.vx *= damp
      goat.vy *= damp
      const speed = Math.hypot(goat.vx, goat.vy)
      if (speed < 14) {
        goat.vx = 0
        goat.vy = 0
      } else {
        goat.facing = lerpAngle(goat.facing, Math.atan2(goat.vy, goat.vx), 1 - Math.exp(-10 * dt))
        goat.legPhase += speed * dt * 0.02
      }
    }

    goat.x += goat.vx * dt
    goat.y += goat.vy * dt
  }

  for (const goat of world.goats) {
    if (!goat.dead) collideFence(world, goat, hooks)
  }
  resolvePairs(world, hooks)
  const player = getPlayer(world)
  if (player && !player.dead) {
    for (const goat of world.goats) {
      if (goat.team === 'enemy' && !goat.dead) updateEnemy(world, goat, player, dt, hooks)
    }
  }
  checkEnd(world, hooks)
}

function updateEnemy(world: World, goat: Goat, target: Goat, dt: number, hooks: SimHooks): void {
  const diff = world.diff
  goat.cooldown = Math.max(0, goat.cooldown - dt)
  if (goat.stun > 0) {
    if (goat.ai === 'windup') goat.ai = 'idle'
    return
  }
  if (goat.ai === 'windup') {
    const threatened = aimThreat(target, goat)
    if (
      goat.plan !== 'dodge' &&
      !goat.sawAim &&
      goat.aiTimer > Math.max(0.22, goat.aiWindup * 0.6) &&
      threatened
    ) {
      goat.sawAim = true
      if (Math.random() < diff.dodge) {
        beginWindup(goat, 'dodge', dodgeAngle(goat, target), 0.5, Math.max(0.5, diff.windup * 0.82))
      }
    }
    if (goat.aiTimer > 0.2) {
      const desired = planAngle(world, goat, target)
      const track = goat.plan === 'dodge' ? diff.aimTrack * 1.25 : diff.aimTrack
      goat.aimAngle = lerpAngle(goat.aimAngle, desired, 1 - Math.exp(-track * dt))
    }
    goat.facing = goat.aimAngle
    goat.aiTimer -= dt
    if (goat.aiTimer <= 0) {
      const plan = goat.plan
      const power = plan === 'dodge' ? Math.min(goat.aimPower, 0.56) : goat.aimPower
      launchGoat(world, goat, goat.aimAngle, power, diff.speed, hooks)
      goat.ai = 'recover'
      goat.aiTimer = plan === 'dodge' ? diff.recover * 0.7 : diff.recover
      goat.cooldown = diff.cooldown * (plan === 'dodge' ? 0.62 : 1)
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
  goat.facing = lerpAngle(goat.facing, desiredFace, 1 - Math.exp(-3.4 * dt))
  const dist = Math.hypot(target.x - goat.x, target.y - goat.y)
  const threatened = aimThreat(target, goat)
  if (threatened) {
    if (!goat.sawAim) {
      goat.sawAim = true
      if (Math.random() < diff.dodge) {
        beginWindup(goat, 'dodge', dodgeAngle(goat, target), 0.52, Math.max(0.5, diff.windup * 0.85))
        return
      }
    }
    if (goat.cooldown <= 0 && dist <= diff.aggro) {
      beginAttack(world, goat, target, dist)
      return
    }
  } else {
    goat.sawAim = false
  }

  if (goat.cooldown > 0 || dist > diff.aggro) return
  if (dist < goat.radius * 2.7) {
    beginWindup(goat, 'dodge', dodgeAngle(goat, target), 0.46, Math.max(0.46, diff.windup * 0.72))
    return
  }
  beginAttack(world, goat, target, dist)
}

function beginAttack(world: World, goat: Goat, target: Goat, dist: number): void {
  const diff = world.diff
  const plan = pickAttack(world, goat, target)
  goat.plan = plan
  const angle = planAngle(world, goat, target)
  const close = dist < goat.radius * 3.2
  const power = close ? 0.5 : clamp(0.64 + dist / 1200, 0.64, 0.96)
  const windup = close ? Math.max(0.36, diff.windup * 0.78) : diff.windup
  beginWindup(goat, plan, angle, power, windup)
}

function beginWindup(goat: Goat, plan: Goat['plan'], angle: number, power: number, windup: number): void {
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
  if (goat.plan === 'dodge') return dodgeAngle(goat, target)
  const pred = predictPoint(world.diff, target)
  if (goat.plan === 'bounce') {
    const mirrored = bankMirror(pred)
    if (mirrored) return Math.atan2(mirrored.y - goat.y, mirrored.x - goat.x)
  }
  return Math.atan2(pred.y - goat.y, pred.x - goat.x) + flank(world, goat)
}

function predictPoint(diff: Difficulty, target: Goat): { x: number; y: number } {
  let vx = target.vx
  let vy = target.vy
  if (target.charging && target.chargePower > 0.15) {
    const speed = (MIN_LAUNCH + target.chargePower * (MAX_LAUNCH - MIN_LAUNCH)) * 0.65
    vx = Math.cos(target.chargeAngle) * speed
    vy = Math.sin(target.chargeAngle) * speed
  }
  const inset = FENCE + 78
  return {
    x: clamp(target.x + vx * diff.lead, inset, WORLD - inset),
    y: clamp(target.y + vy * diff.lead, inset, WORLD - inset),
  }
}

function bankMirror(point: { x: number; y: number }): { x: number; y: number } | null {
  const min = FENCE + GOAT_RADIUS
  const max = WORLD - min
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

function pickAttack(world: World, goat: Goat, target: Goat): 'attack' | 'bounce' {
  const pred = predictPoint(world.diff, target)
  const mirrored = bankMirror(pred)
  if (!mirrored) return 'attack'
  if (Math.random() > world.diff.bounce) return 'attack'
  const direct = Math.atan2(pred.y - goat.y, pred.x - goat.x)
  const bank = Math.atan2(mirrored.y - goat.y, mirrored.x - goat.x)
  const delta = Math.abs(Math.atan2(Math.sin(bank - direct), Math.cos(bank - direct)))
  if (delta < 0.12) return 'attack'
  return 'bounce'
}

function dodgeAngle(goat: Goat, player: Goat): number {
  const left = player.chargeAngle + Math.PI / 2
  const right = player.chargeAngle - Math.PI / 2
  const score = (angle: number) => {
    const nx = goat.x + Math.cos(angle) * 150
    const ny = goat.y + Math.sin(angle) * 150
    return -Math.hypot(nx - WORLD / 2, ny - WORLD / 2) - railPenalty(nx, ny)
  }
  return score(left) >= score(right) ? left : right
}

function railPenalty(x: number, y: number): number {
  const min = FENCE + 96
  const max = WORLD - min
  let penalty = 0
  if (x < min) penalty += (min - x) * 4
  if (x > max) penalty += (x - max) * 4
  if (y < min) penalty += (min - y) * 4
  if (y > max) penalty += (y - max) * 4
  return penalty
}

function flank(world: World, goat: Goat): number {
  const alive = world.goats.filter((g) => g.team === 'enemy' && !g.dead).length
  if (alive < 2) return 0
  return (goat.id % 2 === 0 ? 1 : -1) * 0.14
}

function collideFence(world: World, goat: Goat, hooks: SimHooks): void {
  const min = FENCE + goat.radius
  const max = WORLD - FENCE - goat.radius
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
  if (!againstFence(goat)) return
  goat.fenceCd = BURN_COOLDOWN
  goat.ignite = Math.max(goat.ignite, BURN_TIME)
  applyDamage(world, goat, BURN_BURST, null, hooks, false, 'fire')
  hooks.burn()
  burst(world, goat.x, goat.y, '#ff8a24', 6, 80, 'flame')
  if (goat.charging && goat.team === 'player') goat.charging = false
}

function againstFence(goat: Goat): boolean {
  const min = FENCE + goat.radius + 1.25
  const max = WORLD - FENCE - goat.radius - 1.25
  return goat.x <= min || goat.x >= max || goat.y <= min || goat.y >= max
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
  a.x -= nx * pen * 0.5
  a.y -= ny * pen * 0.5
  b.x += nx * pen * 0.5
  b.y += ny * pen * 0.5
  if (!withHit) return

  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (rel >= 0) return
  const impact = -rel
  const intoA = Math.max(0, a.vx * nx + a.vy * ny)
  const intoB = Math.max(0, -(b.vx * nx + b.vy * ny))
  const impulse = (-(1 + GOAT_RESTITUTION) * rel) / 2
  a.vx -= impulse * nx
  a.vy -= impulse * ny
  b.vx += impulse * nx
  b.vy += impulse * ny

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
  world.pairCd.set(key, HIT_COOLDOWN)

  const raw = Math.min(DAMAGE_CAP, (impact - DAMAGE_THRESHOLD) * DAMAGE_SCALE)
  const dmgA = raw * (intoB >= intoA ? 1 : 0.42)
  const dmgB = raw * (intoA >= intoB ? 1 : 0.42)
  if (dmgA > 0.75) applyDamage(world, a, dmgA, b, hooks, false, 'ram')
  if (dmgB > 0.75) applyDamage(world, b, dmgB, a, hooks, false, 'ram')
  if (dmgA > STAGGER_AT) stagger(a)
  if (dmgB > STAGGER_AT) stagger(b)
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
  kind: 'ram' | 'fire',
): void {
  if (goat.dead || amount <= 0 || world.mode !== 'playing') return
  goat.hp -= amount
  if (!silent) {
    goat.flash = 0.16
    const shown = Math.max(1, Math.round(amount))
    world.floaters.push({
      x: goat.x + (Math.random() - 0.5) * 10,
      y: goat.y - goat.radius - 8,
      vy: -42,
      life: 0.7,
      max: 0.7,
      text: `-${shown}`,
      color: kind === 'fire' ? '#ffb088' : '#fff6e4',
    })
    if (world.floaters.length > 24) world.floaters.splice(0, world.floaters.length - 24)
    if (attacker?.team === 'player' && goat.team === 'enemy') {
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
  world.lastBlow = kind
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
  const b = WORLD - FENCE
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
  cooldown?: number
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
    radius: GOAT_RADIUS,
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
  }
}

function pickRivals(playerColor: string, count: number): { name: string; color: string }[] {
  const ranked = [...RIVALS].sort((a, b) => colorDist(b.color, playerColor) - colorDist(a.color, playerColor))
  const picked: { name: string; color: string }[] = []
  for (const look of ranked) {
    if (picked.length >= count) break
    if (colorDist(look.color, playerColor) < 70 && ranked.length > count) continue
    picked.push(look)
  }
  while (picked.length < count) {
    const extra = RIVALS[picked.length % RIVALS.length]
    if (extra) picked.push({ ...extra, name: `${extra.name} ${picked.length + 1}` })
  }
  return picked.slice(0, count)
}
