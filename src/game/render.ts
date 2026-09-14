import type { DogKind, TileKind } from './levels'
import { dogProfile, leftoverPatches, TILE, type World } from './world'
import type { MowerStats } from './upgrades'

const COLORS: Record<TileKind, string> = {
  grass: '#4a5f3e',
  dirt: '#a88968',
  path: '#d4c4a8',
  tree: '#4a5f3e',
  flower: '#4a5f3e',
  fence: '#8b6a4a',
  furniture: '#7a634e',
  rock: '#4a5f3e',
  puddle: '#6a7e86',
  water: '#5d7380',
  charger: '#e8dfd0',
  hedge: '#3e5236',
  doghouse: '#a56a52',
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  stats: MowerStats,
  cam: { x: number; y: number; z: number },
) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = '#d9cbb4'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.scale(cam.z, cam.z)
  ctx.translate(-cam.x, -cam.y)

  const lw = world.level.w * TILE
  const lh = world.level.h * TILE
  ctx.fillStyle = '#c4b396'
  ctx.fillRect(-12, -12, lw + 24, lh + 24)

  for (let y = 0; y < world.level.h; y++) {
    for (let x = 0; x < world.level.w; x++) {
      const t = world.tiles[y]![x]!
      const px = x * TILE
      const py = y * TILE
      if (t.kind === 'grass' || t.kind === 'puddle') {
        if (t.cut) {
          const a = t.stripe === 0 ? 0.08 : -0.08
          const base = t.stripe === 0 ? '#a8b88a' : '#93a676'
          ctx.fillStyle = shade(base, t.shade * 0.08 + a)
        } else {
          ctx.fillStyle = shade('#3f5236', t.shade * 0.12)
        }
        ctx.fillRect(px, py, TILE, TILE)
        if (t.kind === 'puddle') {
          ctx.fillStyle = t.cut ? '#7a949888' : '#5e758088'
          ctx.fillRect(px, py, TILE, TILE)
        }
      } else {
        ctx.fillStyle = COLORS[t.kind]
        ctx.fillRect(px, py, TILE, TILE)
        if (t.kind === 'path' || t.kind === 'dirt' || t.kind === 'charger') {
          ctx.fillStyle = shade(COLORS[t.kind], t.shade * 0.08)
          ctx.fillRect(px, py, TILE, TILE)
        }
      }
    }
  }

  for (let y = 0; y < world.level.h; y++) {
    for (let x = 0; x < world.level.w; x++) {
      const t = world.tiles[y]![x]!
      const cx = (x + 0.5) * TILE
      const cy = (y + 0.5) * TILE
      if (t.kind === 'tree') drawTree(ctx, cx, cy)
      if (t.kind === 'flower') drawFlower(ctx, cx, cy, t.shade)
      if (t.kind === 'rock') drawRock(ctx, cx, cy)
      if (t.kind === 'furniture') drawChair(ctx, cx, cy)
      if (t.kind === 'fence' || t.kind === 'hedge') drawFence(ctx, cx, cy, t.kind)
      if (t.kind === 'doghouse') drawKennel(ctx, cx, cy)
      if (t.kind === 'charger') drawCharger(ctx, cx, cy, world.time)
      if (t.kind === 'water') {
        ctx.fillStyle = '#5d7380'
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE)
        ctx.fillStyle = '#c5d5d844'
        ctx.fillRect(x * TILE, y * TILE + ((world.time * 8 + x) % TILE), TILE, 2)
      }
    }
  }

  if (stats.mapping) {
    ctx.fillStyle = '#c47a4a55'
    for (const p of leftoverPatches(world).filter((_, i) => i % 3 === 0)) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (const toy of world.toys) drawToy(ctx, toy.x, toy.y, toy.kind)
  for (const s of world.sprinklers) drawSprinkler(ctx, s.x, s.y, s.angle)
  for (const p of world.particles) {
    ctx.globalAlpha = p.life / p.max
    ctx.fillStyle = p.color
    ctx.fillRect(p.x, p.y, p.size, p.size)
  }
  ctx.globalAlpha = 1

  for (const dog of world.dogs) drawDog(ctx, dog.x, dog.y, dog.facing, dog.kind, dog.wag, dog.bark, dog.state)
  drawMower(ctx, world)

  if (world.level.rain) {
    ctx.strokeStyle = '#cfe9ff66'
    ctx.lineWidth = 1
    for (let i = 0; i < 70; i++) {
      const rx = ((i * 47 + world.time * 140) % (lw + 40)) - 20
      const ry = ((i * 91 + world.time * 220) % (lh + 40)) - 20
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      ctx.lineTo(rx + 2, ry + 8)
      ctx.stroke()
    }
  }

  ctx.restore()
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * (1 + amt)))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * (1 + amt)))
  const b = Math.min(255, Math.max(0, (n & 255) * (1 + amt)))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#00000040'
  ctx.beginPath()
  ctx.ellipse(x, y + 4, w, h, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawMower(ctx: CanvasRenderingContext2D, world: World) {
  const m = world.mower
  ctx.save()
  ctx.translate(m.x, m.y)
  drawShadow(ctx, 0, 2, 12, 6)
  ctx.rotate(m.angle)
  ctx.fillStyle = '#2c2c36'
  ctx.beginPath()
  ctx.arc(-2, 0, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8d8d9a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(-2, 0, 6, m.blade, m.blade + Math.PI)
  ctx.stroke()
  roundRect(ctx, -11, -8, 22, 16, 5)
  ctx.fillStyle = m.wet > 0 ? '#d5ddd8' : '#f3ead8'
  ctx.fill()
  ctx.fillStyle = '#6d7d5c'
  roundRect(ctx, -6, -5, 12, 5, 2)
  ctx.fill()
  ctx.fillStyle = world.battery < 20 ? '#b45a3c' : '#7a8f6a'
  ctx.fillRect(8, -2, 3, 4)
  ctx.fillStyle = '#1a1a22'
  ctx.beginPath()
  ctx.arc(6, -5, 1.6, 0, Math.PI * 2)
  ctx.arc(6, 5, 1.6, 0, Math.PI * 2)
  ctx.fill()
  if (m.turbo > 0) {
    ctx.fillStyle = '#d4a574aa'
    ctx.fillRect(-16, -3, 6, 6)
  }
  ctx.restore()
}

function drawDog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  kind: DogKind,
  wag: number,
  bark: number,
  state: string,
) {
  const spec = dogProfile(kind)
  ctx.save()
  ctx.translate(x, y)
  drawShadow(ctx, 0, 2, spec.size * 0.8, spec.size * 0.35)
  ctx.rotate(facing)
  ctx.fillStyle = spec.color
  ctx.beginPath()
  ctx.ellipse(0, 0, spec.size, spec.size * 0.62, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(spec.size * 0.7, 0, spec.size * 0.45, spec.size * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = shade(spec.color, -0.2)
  ctx.beginPath()
  ctx.ellipse(spec.size * 0.55, -spec.size * 0.45, 3, 5, -0.4, 0, Math.PI * 2)
  ctx.ellipse(spec.size * 0.55, spec.size * 0.45, 3, 5, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(-spec.size * 0.85, 0)
  ctx.rotate(Math.sin(wag) * 0.7)
  ctx.fillStyle = spec.color
  ctx.fillRect(-6, -1.5, 8, 3)
  ctx.restore()
  ctx.fillStyle = '#1a1a22'
  ctx.beginPath()
  ctx.arc(spec.size * 0.9, -2.2, 1.2, 0, Math.PI * 2)
  ctx.arc(spec.size * 0.9, 2.2, 1.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  if (bark > 0 || state === 'chase') {
    ctx.fillStyle = '#c47a4a'
    ctx.font = '600 12px Fraunces, Georgia, serif'
    ctx.fillText('!', x + 8, y - spec.size - 2)
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawShadow(ctx, x, y + 4, 10, 5)
  ctx.fillStyle = '#5a3e28'
  ctx.fillRect(x - 2, y - 2, 4, 8)
  ctx.fillStyle = '#4a6a3e'
  ctx.beginPath()
  ctx.arc(x, y - 6, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5d7a4c'
  ctx.beginPath()
  ctx.arc(x - 4, y - 8, 6, 0, Math.PI * 2)
  ctx.fill()
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const colors = ['#c98990', '#d4b56a', '#c47a4a', '#a892b8']
  const c = colors[Math.floor(s * colors.length)]!
  ctx.fillStyle = '#6a8a58'
  ctx.fillRect(x - 1, y, 2, 5)
  ctx.fillStyle = c
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * 3, y - 2 + Math.sin(a) * 3, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#e8d9a8'
  ctx.beginPath()
  ctx.arc(x, y - 2, 1.6, 0, Math.PI * 2)
  ctx.fill()
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawShadow(ctx, x, y + 2, 7, 4)
  ctx.fillStyle = '#8b8f99'
  ctx.beginPath()
  ctx.ellipse(x, y, 7, 5, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#c5c8d0'
  ctx.beginPath()
  ctx.ellipse(x - 2, y - 1, 3, 2, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#d7c4a3'
  roundRect(ctx, x - 6, y - 5, 12, 10, 2)
  ctx.fill()
  ctx.fillStyle = '#b08968'
  ctx.fillRect(x - 6, y - 8, 3, 8)
}

function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, kind: TileKind) {
  if (kind === 'hedge') {
    ctx.fillStyle = '#3e5236'
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#54724a'
    ctx.beginPath()
    ctx.arc(x + 3, y - 2, 5, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.fillStyle = '#8d5a32'
  ctx.fillRect(x - 2, y - 7, 4, 14)
  ctx.fillRect(x - 7, y - 3, 14, 3)
}

function drawKennel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#c45c3e'
  ctx.fillRect(x - 8, y - 4, 16, 12)
  ctx.fillStyle = '#8a2f22'
  ctx.beginPath()
  ctx.moveTo(x - 10, y - 4)
  ctx.lineTo(x, y - 12)
  ctx.lineTo(x + 10, y - 4)
  ctx.fill()
  ctx.fillStyle = '#1a1a22'
  ctx.beginPath()
  ctx.arc(x, y + 4, 4, Math.PI, 0)
  ctx.fill()
}

function drawCharger(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.fillStyle = '#b7a07a'
  roundRect(ctx, x - 8, y - 8, 16, 16, 3)
  ctx.fill()
  ctx.fillStyle = `rgba(109,139,122,${0.55 + Math.sin(time * 6) * 0.25})`
  ctx.font = 'bold 12px Fraunces, Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('⚡', x, y + 4)
  ctx.textAlign = 'left'
}

function drawToy(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'bone' | 'ball') {
  if (kind === 'ball') {
    ctx.fillStyle = '#c47a4a'
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.fillStyle = '#f3e6c8'
  ctx.fillRect(x - 6, y - 2, 12, 4)
  ctx.beginPath()
  ctx.arc(x - 6, y - 3, 2.4, 0, Math.PI * 2)
  ctx.arc(x - 6, y + 3, 2.4, 0, Math.PI * 2)
  ctx.arc(x + 6, y - 3, 2.4, 0, Math.PI * 2)
  ctx.arc(x + 6, y + 3, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

function drawSprinkler(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.fillStyle = '#6d7480'
  ctx.beginPath()
  ctx.arc(x, y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#a8c0c488'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + Math.cos(angle) * 64, y + Math.sin(angle) * 64)
  ctx.stroke()
}

export function cameraFor(world: World, canvas: HTMLCanvasElement) {
  const z = Math.min(
    canvas.width / (world.level.w * TILE + 72),
    canvas.height / (world.level.h * TILE + 72),
    2.2,
  )
  const follow = z < 1.05
  return {
    x: follow ? world.mower.x : (world.level.w * TILE) / 2,
    y: follow ? world.mower.y : (world.level.h * TILE) / 2,
    z: follow ? 1.35 : z,
  }
}
