export type TileKind =
  | 'grass'
  | 'dirt'
  | 'path'
  | 'tree'
  | 'flower'
  | 'fence'
  | 'furniture'
  | 'rock'
  | 'puddle'
  | 'water'
  | 'charger'
  | 'hedge'
  | 'doghouse'

export type DogKind = 'lazy' | 'curious' | 'angry' | 'fast' | 'puppy'

export interface DogSpawn {
  kind: DogKind
  x: number
  y: number
}

export interface LevelDef {
  id: number
  world: string
  name: string
  brief: string
  requiredPct: number
  drain: number
  rain: boolean
  w: number
  h: number
  tiles: TileKind[][]
  spawn: { x: number; y: number }
  charger: { x: number; y: number }
  dogs: DogSpawn[]
  toys: { x: number; y: number }[]
  sprinklers: { x: number; y: number }[]
  reward: number
}

const BLOCKED: TileKind[] = [
  'tree',
  'flower',
  'fence',
  'furniture',
  'rock',
  'water',
  'hedge',
  'doghouse',
]

export function isBlocked(kind: TileKind) {
  return BLOCKED.includes(kind)
}

export function isMowable(kind: TileKind) {
  return kind === 'grass' || kind === 'puddle'
}

class Yard {
  w: number
  h: number
  tiles: TileKind[][]
  dogs: DogSpawn[] = []
  toys: { x: number; y: number }[] = []
  sprinklers: { x: number; y: number }[] = []
  spawn = { x: 2, y: 2 }
  charger = { x: 2, y: 2 }

  constructor(w: number, h: number, fill: TileKind = 'grass') {
    this.w = w
    this.h = h
    this.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
  }

  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  set(x: number, y: number, kind: TileKind) {
    if (this.in(x, y)) this.tiles[y][x] = kind
  }

  fill(x: number, y: number, w: number, h: number, kind: TileKind) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, kind)
    }
  }

  fence() {
    this.fill(0, 0, this.w, 1, 'fence')
    this.fill(0, this.h - 1, this.w, 1, 'fence')
    this.fill(0, 0, 1, this.h, 'fence')
    this.fill(this.w - 1, 0, 1, this.h, 'fence')
  }

  dock(x: number, y: number) {
    this.fill(x, y, 3, 3, 'path')
    this.set(x + 1, y + 1, 'charger')
    this.charger = { x: x + 1, y: y + 1 }
    this.spawn = { x: x + 1, y: y + 2 }
  }

  scatter(kind: TileKind, n: number, pad = 2) {
    let placed = 0
    let guard = 0
    while (placed < n && guard++ < 400) {
      const x = pad + Math.floor(Math.random() * (this.w - pad * 2))
      const y = pad + Math.floor(Math.random() * (this.h - pad * 2))
      if (this.tiles[y][x] !== 'grass') continue
      if (Math.abs(x - this.charger.x) + Math.abs(y - this.charger.y) < 5) continue
      this.set(x, y, kind)
      placed++
    }
  }

  done(
    id: number,
    world: string,
    name: string,
    brief: string,
    extra: Partial<Pick<LevelDef, 'requiredPct' | 'drain' | 'rain' | 'reward'>> = {},
  ): LevelDef {
    return {
      id,
      world,
      name,
      brief,
      requiredPct: extra.requiredPct ?? 96,
      drain: extra.drain ?? 3.2,
      rain: extra.rain ?? false,
      w: this.w,
      h: this.h,
      tiles: this.tiles,
      spawn: this.spawn,
      charger: this.charger,
      dogs: this.dogs,
      toys: this.toys,
      sprinklers: this.sprinklers,
      reward: extra.reward ?? 40 + id * 8,
    }
  }
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

export function buildLevels(): LevelDef[] {
  const levels: LevelDef[] = []

  {
    const y = new Yard(28, 20)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(1, 1, 4, 3, 'path')
    levels.push(
      y.done(1, 'Suburban Gardens', 'First stripe', 'Mow the rectangle, then dock to charge. WASD or arrows to drive.', {
        requiredPct: 90,
        drain: 0.72,
        reward: 45,
      }),
    )
  }

  {
    const y = new Yard(30, 22)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(8, 5, 2, 2, 'tree')
    y.fill(18, 8, 2, 2, 'tree')
    y.fill(12, 14, 2, 2, 'tree')
    y.fill(6, 10, 3, 2, 'flower')
    y.fill(21, 4, 3, 2, 'flower')
    y.fill(20, 15, 3, 2, 'flower')
    levels.push(
      y.done(2, 'Suburban Gardens', 'Trees & beds', 'Steer around trees and bright flower beds. Do not mow the tulips.', {
        requiredPct: 92,
        drain: 0.85,
        reward: 55,
      }),
    )
  }

  {
    const y = new Yard(32, 24)
    y.fence()
    y.dock(1, y.h - 5)
    y.fill(10, 1, 1, 10, 'hedge')
    y.fill(10, 14, 1, 9, 'hedge')
    y.fill(18, 6, 8, 3, 'furniture')
    y.fill(20, 16, 4, 2, 'furniture')
    y.fill(4, 8, 4, 1, 'path')
    y.fill(14, 11, 12, 1, 'path')
    levels.push(
      y.done(3, 'Suburban Gardens', 'Patio maze', 'Fences and garden furniture squeeze you into skinny lanes.', {
        requiredPct: 92,
        drain: 0.95,
        reward: 65,
      }),
    )
  }

  {
    const y = new Yard(32, 24)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(24, 3, 3, 3, 'doghouse')
    y.fill(6, 6, 2, 2, 'tree')
    y.fill(16, 12, 2, 2, 'tree')
    y.fill(10, 4, 3, 2, 'flower')
    y.dogs.push({ kind: 'curious', x: 25, y: 7 })
    levels.push(
      y.done(4, 'The Dog Problem', 'Meet Biscuit', 'A curious dog notices the mower up close, then trots after it.', {
        requiredPct: 92,
        drain: 1.05,
        reward: 80,
      }),
    )
  }

  {
    const y = new Yard(34, 24)
    y.fence()
    y.dock(2, y.h - 5)
    y.scatter('rock', 9)
    y.scatter('tree', 4)
    y.fill(22, 3, 3, 3, 'doghouse')
    y.dogs.push({ kind: 'lazy', x: 23, y: 6 })
    levels.push(
      y.done(5, 'The Dog Problem', 'Rock garden', 'Ornaments and stones. The lazy dog mostly sunbathes.', {
        requiredPct: 92,
        drain: 1.15,
        reward: 88,
      }),
    )
  }

  {
    const y = new Yard(36, 26)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(3, 3, 3, 3, 'doghouse')
    y.fill(30, 3, 3, 3, 'doghouse')
    y.fill(16, 10, 2, 2, 'tree')
    y.fill(8, 16, 3, 2, 'flower')
    y.dogs.push({ kind: 'angry', x: 5, y: 6 })
    y.dogs.push({ kind: 'fast', x: 31, y: 6 })
    levels.push(
      y.done(6, 'The Dog Problem', 'Two personalities', 'An angry chaser and a fast sprinter share the yard.', {
        requiredPct: 90,
        drain: 1.25,
        reward: 100,
      }),
    )
  }

  {
    const y = new Yard(36, 26)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(8, 8, 6, 4, 'puddle')
    y.fill(22, 14, 7, 5, 'puddle')
    y.fill(14, 4, 4, 3, 'puddle')
    y.scatter('rock', 4)
    y.dogs.push({ kind: 'curious', x: 20, y: 8 })
    levels.push(
      y.done(7, 'Difficult Gardens', 'Soggy lawn', 'Puddles drag the wheels. Plan a dry route if you can.', {
        requiredPct: 90,
        drain: 1.35,
        reward: 110,
      }),
    )
  }

  {
    const y = new Yard(38, 28)
    y.fence()
    y.dock(1, y.h - 5)
    y.scatter('tree', 6)
    y.scatter('flower', 5)
    y.fill(18, 12, 5, 4, 'furniture')
    y.dogs.push({ kind: 'puppy', x: 18, y: 6 })
    levels.push(
      y.done(8, 'Difficult Gardens', 'Low battery Sunday', 'A bigger lawn and a thirstier pack. Dock before you stall.', {
        requiredPct: 90,
        drain: 2.15,
        reward: 125,
      }),
    )
  }

  {
    const y = new Yard(38, 28)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(30, 3, 3, 3, 'doghouse')
    y.dogs.push({ kind: 'angry', x: 31, y: 7 })
    y.toys.push({ x: 12, y: 10 }, { x: 20, y: 16 }, { x: 8, y: 18 }, { x: 26, y: 8 }, { x: 16, y: 22 })
    y.scatter('flower', 4)
    levels.push(
      y.done(9, 'The Dog Problem', 'Toys everywhere', 'Bones and balls stun the blades. The dog keeps adding more.', {
        requiredPct: 90,
        drain: 1.4,
        reward: 130,
      }),
    )
  }

  {
    const y = new Yard(40, 28)
    y.fence()
    y.dock(2, y.h - 5)
    y.sprinklers.push({ x: 12, y: 8 }, { x: 28, y: 12 }, { x: 18, y: 20 })
    y.fill(6, 6, 2, 2, 'tree')
    y.fill(24, 5, 2, 2, 'tree')
    y.dogs.push({ kind: 'lazy', x: 8, y: 18 })
    levels.push(
      y.done(10, 'Chaos', 'Sprinkler ballet', 'Moving spray cones soak the mower and waste battery.', {
        requiredPct: 90,
        drain: 1.5,
        reward: 145,
      }),
    )
  }

  {
    const y = new Yard(44, 30)
    y.fence()
    y.dock(2, y.h - 5)
    y.fill(14, 1, 2, y.h - 2, 'path')
    y.fill(28, 1, 2, y.h - 2, 'path')
    y.fill(1, 14, y.w - 2, 2, 'path')
    y.fill(6, 6, 5, 4, 'flower')
    y.fill(18, 6, 6, 4, 'water')
    y.fill(34, 18, 5, 4, 'water')
    y.scatter('tree', 5)
    y.dogs.push({ kind: 'curious', x: 8, y: 8 })
    y.dogs.push({ kind: 'puppy', x: 36, y: 8 })
    levels.push(
      y.done(11, 'Commercial', 'Riverside park', 'Paths, a pond, and two lawns split by walkways.', {
        requiredPct: 88,
        drain: 1.55,
        reward: 160,
      }),
    )
  }

  {
    const y = new Yard(46, 32)
    y.fence()
    y.dock(2, y.h - 5)
    y.scatter('rock', 6)
    y.scatter('tree', 5)
    y.fill(10, 10, 6, 4, 'puddle')
    y.fill(30, 18, 7, 5, 'puddle')
    y.sprinklers.push({ x: 16, y: 8 }, { x: 34, y: 10 }, { x: 22, y: 22 })
    y.dogs.push({ kind: 'angry', x: 8, y: 8 })
    y.dogs.push({ kind: 'fast', x: 40, y: 8 })
    y.dogs.push({ kind: 'puppy', x: 24, y: 16 })
    y.toys.push({ x: 12, y: 20 }, { x: 28, y: 8 })
    levels.push(
      y.done(12, 'Chaos', 'Bank holiday', 'Rain, dogs, sprinklers, toys. Finish enough lawn, then limp home.', {
        requiredPct: 86,
        drain: 1.7,
        rain: true,
        reward: 200,
      }),
    )
  }

  {
    const rng = seeded(42)
    const y = new Yard(40, 30)
    y.fence()
    y.dock(2, y.h - 5)
    const kinds: TileKind[] = ['tree', 'flower', 'rock', 'puddle', 'furniture']
    for (let i = 0; i < 18; i++) {
      const kind = kinds[Math.floor(rng() * kinds.length)]!
      const x = 3 + Math.floor(rng() * (y.w - 8))
      const yy = 3 + Math.floor(rng() * (y.h - 8))
      y.fill(x, yy, kind === 'puddle' ? 4 : 2, kind === 'puddle' ? 3 : 2, kind)
    }
    y.dogs.push({ kind: 'curious', x: 20, y: 8 })
    y.dogs.push({ kind: 'lazy', x: 30, y: 20 })
    if (rng() > 0.4) y.sprinklers.push({ x: 14, y: 14 })
    levels.push(
      y.done(13, 'Endless Gardens', 'Generated plot', 'A shuffled suburban yard. Replay this one for a fresh layout.', {
        requiredPct: 88,
        drain: 1.6,
        reward: 170,
      }),
    )
  }

  return levels
}

export function rebuildEndless(seed: number): LevelDef {
  const all = buildLevels()
  const rng = seeded(seed)
  const y = new Yard(38 + Math.floor(rng() * 10), 28 + Math.floor(rng() * 6))
  y.fence()
  y.dock(2, y.h - 5)
  const kinds: TileKind[] = ['tree', 'flower', 'rock', 'puddle', 'hedge', 'furniture']
  const count = 12 + Math.floor(rng() * 12)
  for (let i = 0; i < count; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!
    const x = 3 + Math.floor(rng() * (y.w - 9))
    const yy = 3 + Math.floor(rng() * (y.h - 9))
    const w = kind === 'hedge' ? 1 : 2 + Math.floor(rng() * 3)
    const h = kind === 'hedge' ? 4 + Math.floor(rng() * 6) : 2 + Math.floor(rng() * 2)
    y.fill(x, yy, w, h, kind)
  }
  const dogKinds: DogKind[] = ['lazy', 'curious', 'angry', 'fast', 'puppy']
  const dogs = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < dogs; i++) {
    y.dogs.push({
      kind: dogKinds[Math.floor(rng() * dogKinds.length)]!,
      x: 6 + Math.floor(rng() * (y.w - 12)),
      y: 6 + Math.floor(rng() * (y.h - 12)),
    })
  }
  if (rng() > 0.5) {
    y.sprinklers.push({ x: 10 + Math.floor(rng() * 16), y: 8 + Math.floor(rng() * 12) })
  }
  const def = y.done(13, 'Endless Gardens', 'Generated plot', 'A shuffled suburban yard.', {
    requiredPct: 88,
    drain: 1.45 + rng() * 0.5,
    rain: rng() > 0.72,
    reward: 170,
  })
  const last = all[all.length - 1]
  if (last) def.id = last.id
  return def
}
