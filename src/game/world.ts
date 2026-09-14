import { isBlocked, isMowable, type DogKind, type LevelDef, type TileKind } from './levels'
import type { MowerStats } from './upgrades'

export const TILE = 16

export interface GrassTile {
  kind: TileKind
  cut: boolean
  stripe: 0 | 1
  shade: number
}

export type DogState = 'wander' | 'sniff' | 'notice' | 'chase' | 'return'

export interface Dog {
  kind: DogKind
  x: number
  y: number
  vx: number
  vy: number
  homeX: number
  homeY: number
  facing: number
  state: DogState
  timer: number
  bark: number
  wag: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
}

export interface Toy {
  x: number
  y: number
  kind: 'bone' | 'ball'
}

export interface Sprinkler {
  x: number
  y: number
  angle: number
  speed: number
}

export interface Mower {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  blade: number
  stun: number
  turbo: number
  turboCd: number
  wet: number
  bumpCd: number
}

export interface World {
  level: LevelDef
  tiles: GrassTile[][]
  mower: Mower
  dogs: Dog[]
  toys: Toy[]
  sprinklers: Sprinkler[]
  particles: Particle[]
  battery: number
  time: number
  cut: number
  total: number
  charging: boolean
  dogAlert: boolean
}

const DOG_AI: Record<
  DogKind,
  { notice: number; chase: number; burst: number; wander: number; color: string; size: number }
> = {
  lazy: { notice: 48, chase: 38, burst: 1.3, wander: 18, color: '#e2b34a', size: 11 },
  curious: { notice: 78, chase: 58, burst: 3.4, wander: 28, color: '#8a5a32', size: 11 },
  angry: { notice: 96, chase: 82, burst: 5.2, wander: 26, color: '#4a3328', size: 12 },
  fast: { notice: 84, chase: 118, burst: 1.5, wander: 36, color: '#efe6d8', size: 10 },
  puppy: { notice: 70, chase: 72, burst: 2.2, wander: 50, color: '#f0c98a', size: 8 },
}

export function dogProfile(kind: DogKind) {
  return DOG_AI[kind]
}

function hash(x: number, y: number) {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
}

export function createWorld(level: LevelDef, stats: MowerStats): World {
  let total = 0
  const tiles = level.tiles.map((row, y) =>
    row.map((kind, x) => {
      const mow = isMowable(kind)
      if (mow) total++
      return {
        kind,
        cut: false,
        stripe: 0 as 0 | 1,
        shade: hash(x, y),
      }
    }),
  )

  const spawnX = (level.spawn.x + 0.5) * TILE
  const spawnY = (level.spawn.y + 0.5) * TILE

  return {
    level,
    tiles,
    mower: {
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      blade: 0,
      stun: 0,
      turbo: 0,
      turboCd: 0,
      wet: 0,
      bumpCd: 0,
    },
    dogs: level.dogs.map((d) => ({
      kind: d.kind,
      x: (d.x + 0.5) * TILE,
      y: (d.y + 0.5) * TILE,
      vx: 0,
      vy: 0,
      homeX: (d.x + 0.5) * TILE,
      homeY: (d.y + 0.5) * TILE,
      facing: 0,
      state: 'wander',
      timer: 1 + Math.random() * 2,
      bark: 0,
      wag: 0,
    })),
    toys: level.toys.map((t) => ({
      x: (t.x + 0.5) * TILE,
      y: (t.y + 0.5) * TILE,
      kind: Math.random() > 0.5 ? 'bone' : 'ball',
    })),
    sprinklers: level.sprinklers.map((s) => ({
      x: (s.x + 0.5) * TILE,
      y: (s.y + 0.5) * TILE,
      angle: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.6,
    })),
    particles: [],
    battery: stats.batteryMax,
    time: 0,
    cut: 0,
    total,
    charging: false,
    dogAlert: false,
  }
}

export function lawnPct(world: World) {
  if (world.total <= 0) return 100
  return (world.cut / world.total) * 100
}

function tileAt(world: World, px: number, py: number) {
  const x = Math.floor(px / TILE)
  const y = Math.floor(py / TILE)
  if (y < 0 || x < 0 || y >= world.level.h || x >= world.level.w) return null
  return { x, y, tile: world.tiles[y]![x]! }
}

function blockedAt(world: World, px: number, py: number, radius: number) {
  for (let oy = -radius; oy <= radius; oy += radius) {
    for (let ox = -radius; ox <= radius; ox += radius) {
      const hit = tileAt(world, px + ox, py + oy)
      if (!hit) return true
      if (isBlocked(hit.tile.kind)) return true
    }
  }
  return false
}

function tryMove(world: World, x: number, y: number, nx: number, ny: number, radius: number) {
  let rx = nx
  let ry = ny
  if (blockedAt(world, nx, y, radius)) rx = x
  if (blockedAt(world, rx, ny, radius)) ry = y
  return { x: rx, y: ry, bumped: rx === x && ry === y && (nx !== x || ny !== y) }
}

export function mowAt(world: World, stats: MowerStats) {
  const m = world.mower
  const r = stats.blade
  const stripe: 0 | 1 = Math.abs(Math.cos(m.angle)) > 0.65 ? 0 : 1
  const x0 = Math.floor((m.x - r) / TILE)
  const y0 = Math.floor((m.y - r) / TILE)
  const x1 = Math.floor((m.x + r) / TILE)
  const y1 = Math.floor((m.y + r) / TILE)
  let cutNow = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (y < 0 || x < 0 || y >= world.level.h || x >= world.level.w) continue
      const tile = world.tiles[y]![x]!
      if (!isMowable(tile.kind) || tile.cut) continue
      const cx = (x + 0.5) * TILE
      const cy = (y + 0.5) * TILE
      const dx = cx - m.x
      const dy = cy - m.y
      if (dx * dx + dy * dy > r * r) continue
      tile.cut = true
      tile.stripe = stripe
      world.cut++
      cutNow++
      if (cutNow < 8) {
        world.particles.push({
          x: cx,
          y: cy,
          vx: (Math.random() - 0.5) * 40,
          vy: -20 - Math.random() * 30,
          life: 0.35 + Math.random() * 0.2,
          max: 0.5,
          color: '#b6f06a',
          size: 2 + Math.random() * 2,
        })
      }
    }
  }
  if (world.particles.length > 180) world.particles.splice(0, world.particles.length - 180)
}

function dogStep(world: World, dog: Dog, dt: number, stats: MowerStats, onBark: () => void) {
  const spec = DOG_AI[dog.kind]
  const m = world.mower
  const dx = m.x - dog.x
  const dy = m.y - dog.y
  const dist = Math.hypot(dx, dy)
  const notice = Math.max(28, spec.notice - stats.quiet)
  dog.wag += dt * (dog.state === 'chase' ? 22 : 10)
  dog.bark = Math.max(0, dog.bark - dt)
  dog.timer -= dt

  if (dog.state === 'wander' || dog.state === 'sniff' || dog.state === 'return') {
    if (dist < notice && dog.kind !== 'lazy') {
      dog.state = 'notice'
      dog.timer = 0.45
      dog.bark = 0.4
      onBark()
    } else if (dog.kind === 'lazy' && dist < notice * 0.45) {
      dog.state = 'notice'
      dog.timer = 0.6
    }
  }

  if (dog.state === 'notice' && dog.timer <= 0) {
    dog.state = 'chase'
    dog.timer = spec.burst
    dog.bark = 0.5
    onBark()
  }

  if (dog.state === 'chase' && dog.timer <= 0) {
    dog.state = 'return'
    dog.timer = 2 + Math.random() * 2
  }

  if ((dog.state === 'wander' || dog.state === 'sniff') && dog.timer <= 0) {
    if (Math.random() < 0.3) {
      dog.state = 'sniff'
      dog.timer = 0.8 + Math.random() * 1.2
      dog.vx = 0
      dog.vy = 0
    } else {
      dog.state = 'wander'
      dog.timer = 1.2 + Math.random() * 2
      const a = Math.random() * Math.PI * 2
      const spd = spec.wander * (dog.kind === 'puppy' ? 0.6 + Math.random() : 1)
      dog.vx = Math.cos(a) * spd
      dog.vy = Math.sin(a) * spd
    }
  }

  let tx = dog.vx
  let ty = dog.vy
  if (dog.state === 'chase') {
    const a = Math.atan2(dy, dx)
    const spd = spec.chase
    tx = Math.cos(a) * spd
    ty = Math.sin(a) * spd
    if (dog.kind === 'curious') {
      tx *= 0.72
      ty *= 0.72
    }
  } else if (dog.state === 'return') {
    const a = Math.atan2(dog.homeY - dog.y, dog.homeX - dog.x)
    tx = Math.cos(a) * spec.wander
    ty = Math.sin(a) * spec.wander
    if (Math.hypot(dog.homeX - dog.x, dog.homeY - dog.y) < 18) {
      dog.state = 'wander'
      dog.timer = 1
    }
  } else if (dog.state === 'sniff') {
    tx = 0
    ty = 0
  }

  dog.vx = tx
  dog.vy = ty
  const next = tryMove(world, dog.x, dog.y, dog.x + tx * dt, dog.y + ty * dt, spec.size * 0.6)
  dog.x = next.x
  dog.y = next.y
  if (Math.hypot(tx, ty) > 4) dog.facing = Math.atan2(ty, tx)

  const hitR = spec.size + 9
  if (dist < hitR && dog.state === 'chase') {
    const nx = dx / (dist || 1)
    const ny = dy / (dist || 1)
    const force = (1 - stats.armour) * 220
    m.vx += nx * force * 0.35
    m.vy += ny * force * 0.35
    m.stun = Math.max(m.stun, 0.45 * (1 - stats.armour))
    dog.x -= nx * 10
    dog.y -= ny * 10
    dog.state = dog.kind === 'angry' ? 'chase' : 'return'
    dog.timer = dog.kind === 'angry' ? 1.2 : 1.8
    dog.bark = 0.4
    onBark()
    for (let i = 0; i < 8; i++) {
      world.particles.push({
        x: m.x,
        y: m.y,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        life: 0.3,
        max: 0.3,
        color: '#fff4c4',
        size: 3,
      })
    }
  }
}

export function stepWorld(
  world: World,
  stats: MowerStats,
  input: { x: number; y: number; turbo: boolean },
  dt: number,
  hooks: { bark: () => void; bump: () => void; charge: () => void },
) {
  const m = world.mower
  world.time += dt
  m.stun = Math.max(0, m.stun - dt)
  m.wet = Math.max(0, m.wet - dt)
  m.turbo = Math.max(0, m.turbo - dt)
  m.turboCd = Math.max(0, m.turboCd - dt)
  m.bumpCd = Math.max(0, m.bumpCd - dt)
  m.blade += dt * (18 + Math.hypot(m.vx, m.vy) * 0.08)

  const under = tileAt(world, m.x, m.y)
  const puddle = under?.tile.kind === 'puddle'
  const slow = puddle ? Math.max(0.38, 0.72 - stats.wheels) : 1
  const rainSlow = world.level.rain ? 0.92 : 1

  if (input.turbo && m.turboCd <= 0 && m.stun <= 0 && world.battery > 4) {
    m.turbo = stats.turbo
    m.turboCd = 3.2
    world.battery -= 4
  }

  const boost = m.turbo > 0 ? 1.55 : 1
  const maxSpd = stats.speed * slow * rainSlow * boost
  const canDrive = m.stun <= 0 && world.battery > 0
  const tx = canDrive ? input.x * maxSpd : 0
  const ty = canDrive ? input.y * maxSpd : 0
  const snap = 1 - Math.exp(-dt * 16)
  m.vx += (tx - m.vx) * snap
  m.vy += (ty - m.vy) * snap
  const spd = Math.hypot(m.vx, m.vy)
  if (spd > 8) m.angle = Math.atan2(m.vy, m.vx)

  const moved = tryMove(world, m.x, m.y, m.x + m.vx * dt, m.y + m.vy * dt, 7)
  if (moved.bumped) {
    m.vx *= 0.15
    m.vy *= 0.15
    if (spd > 55 && m.bumpCd <= 0) {
      m.stun = Math.max(m.stun, 0.08 * (1 - stats.armour))
      m.bumpCd = 0.28
      hooks.bump()
    }
  }
  m.x = moved.x
  m.y = moved.y

  if (spd > 6 && world.battery > 0) mowAt(world, stats)

  const moving = spd > 12
  const drain = world.level.drain * (moving ? 1 : 0.06) * (m.turbo > 0 ? 1.8 : 1) * (world.level.rain ? 1.12 : 1)
  if (!world.charging) world.battery = Math.max(0, world.battery - drain * dt)
  if (world.battery <= 0) {
    m.vx *= 0.4
    m.vy *= 0.4
  }

  const charger = world.level.charger
  const cx = (charger.x + 0.5) * TILE
  const cy = (charger.y + 0.5) * TILE
  world.charging = Math.hypot(m.x - cx, m.y - cy) < 22
  if (world.charging) {
    const before = world.battery
    world.battery = Math.min(stats.batteryMax, world.battery + stats.chargeRate * dt)
    if (world.battery > before + 0.8) hooks.charge()
  }

  world.dogAlert = false
  for (const dog of world.dogs) {
    dogStep(world, dog, dt, stats, hooks.bark)
    if (dog.state === 'notice' || dog.state === 'chase') world.dogAlert = true
  }

  for (const toy of world.toys) {
    if (Math.hypot(toy.x - m.x, toy.y - m.y) < 12) {
      m.stun = Math.max(m.stun, 0.55 * (1 - stats.armour * 0.5))
      m.vx *= 0.2
      m.vy *= 0.2
      toy.x += (Math.random() - 0.5) * 28
      toy.y += (Math.random() - 0.5) * 28
      hooks.bump()
    }
  }

  for (const s of world.sprinklers) {
    s.angle += s.speed * dt
    const ax = Math.cos(s.angle)
    const ay = Math.sin(s.angle)
    const mx = m.x - s.x
    const my = m.y - s.y
    const along = mx * ax + my * ay
    const side = Math.abs(mx * -ay + my * ax)
    if (along > 0 && along < 70 && side < 10) {
      m.wet = 0.8
      m.vx *= 0.85
      m.vy *= 0.85
      world.battery = Math.max(0, world.battery - 6 * dt)
    }
  }

  for (const p of world.particles) {
    p.life -= dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 90 * dt
  }
  world.particles = world.particles.filter((p) => p.life > 0)
}

export function leftoverPatches(world: World) {
  const pts: { x: number; y: number }[] = []
  for (let y = 0; y < world.level.h; y++) {
    for (let x = 0; x < world.level.w; x++) {
      const t = world.tiles[y]![x]!
      if (isMowable(t.kind) && !t.cut) pts.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })
    }
  }
  return pts
}
