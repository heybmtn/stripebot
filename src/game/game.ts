import { AudioBus } from './audio'
import { buildLevels, rebuildEndless, type LevelDef } from './levels'
import { cameraFor, drawWorld } from './render'
import {
  emptyUpgrades,
  statsFrom,
  UPGRADE_DEFS,
  type UpgradeId,
  type UpgradeLevels,
} from './upgrades'
import { createWorld, lawnPct, stepWorld, type World } from './world'

type Screen = 'title' | 'play' | 'pause' | 'fail' | 'win' | 'shop'

interface Save {
  money: number
  upgrades: UpgradeLevels
  unlocked: number
}

const SAVE_KEY = 'stripebot-save-v1'

function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) throw new Error('none')
    const parsed = JSON.parse(raw) as Save
    return {
      money: parsed.money ?? 0,
      upgrades: { ...emptyUpgrades(), ...parsed.upgrades },
      unlocked: parsed.unlocked ?? 1,
    }
  } catch {
    return { money: 0, upgrades: emptyUpgrades(), unlocked: 1 }
  }
}

export class Game {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private overlay: HTMLElement
  private hud: {
    level: HTMLElement
    lawn: HTMLElement
    lawnBar: HTMLElement
    battery: HTMLElement
    batteryBar: HTMLElement
    time: HTMLElement
    alert: HTMLElement
    money: HTMLElement
  }
  private audio = new AudioBus()
  private keys = new Set<string>()
  private touch = { x: 0, y: 0, turbo: false }
  private levels = buildLevels()
  private save = loadSave()
  private screen: Screen = 'title'
  private index = 0
  private world: World | null = null
  private last = 0
  private payout = 0
  private endlessSeed = 1
  private lastBark = 0
  private emptySince = 0

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="shell">
        <div class="topbar">
          <div class="brand">
            <div>
              <h1>Stripebot</h1>
              <p>Robot lawn mower · cut every blade, dock before the battery dies</p>
            </div>
          </div>
          <div class="pill" id="money-pill">£0</div>
        </div>
        <div class="stage">
          <canvas id="game" width="1100" height="688"></canvas>
          <div class="hud">
            <div class="hud-row">
              <div class="pill" id="level-pill">LEVEL 1</div>
              <div class="pill">Lawn <span id="lawn-val">0%</span><span class="bar"><span id="lawn-bar"></span></span></div>
              <div class="pill">Battery <span id="bat-val">100%</span><span class="bar battery"><span id="bat-bar"></span></span></div>
              <div class="pill" id="time-pill">00:00</div>
            </div>
            <div></div>
            <div class="hud-row">
              <div class="pill warn" id="alert-pill"></div>
              <div class="touch">
                <div class="pad">
                  <span class="empty"></span>
                  <button data-dir="up">▲</button>
                  <span class="empty"></span>
                  <button data-dir="left">◀</button>
                  <span class="empty"></span>
                  <button data-dir="right">▶</button>
                  <span class="empty"></span>
                  <button data-dir="down">▼</button>
                  <span class="empty"></span>
                </div>
                <div class="boost">
                  <button data-boost="1">Boost</button>
                </div>
              </div>
            </div>
          </div>
          <div class="overlay" id="overlay"></div>
        </div>
      </div>
    `

    this.canvas = root.querySelector('#game')!
    this.canvas.tabIndex = 0
    this.ctx = this.canvas.getContext('2d')!
    this.overlay = root.querySelector('#overlay')!
    this.hud = {
      level: root.querySelector('#level-pill')!,
      lawn: root.querySelector('#lawn-val')!,
      lawnBar: root.querySelector('#lawn-bar')!,
      battery: root.querySelector('#bat-val')!,
      batteryBar: root.querySelector('#bat-bar')!,
      time: root.querySelector('#time-pill')!,
      alert: root.querySelector('#alert-pill')!,
      money: root.querySelector('#money-pill')!,
    }

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase())
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault()
      if (e.key === 'Escape' && this.screen === 'play') this.pause()
      else if (e.key === 'Escape' && this.screen === 'pause') this.resume()
      if (e.key === 'p' || e.key === 'P') {
        if (this.screen === 'play') this.pause()
        else if (this.screen === 'pause') this.resume()
      }
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))

    for (const btn of root.querySelectorAll<HTMLButtonElement>('[data-dir]')) {
      const apply = (v: boolean) => {
        const dir = btn.dataset.dir
        if (dir === 'up') this.touch.y = v ? -1 : this.touch.y < 0 ? 0 : this.touch.y
        if (dir === 'down') this.touch.y = v ? 1 : this.touch.y > 0 ? 0 : this.touch.y
        if (dir === 'left') this.touch.x = v ? -1 : this.touch.x < 0 ? 0 : this.touch.x
        if (dir === 'right') this.touch.x = v ? 1 : this.touch.x > 0 ? 0 : this.touch.x
      }
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        apply(true)
      })
      btn.addEventListener('pointerup', () => apply(false))
      btn.addEventListener('pointercancel', () => apply(false))
    }
    const boost = root.querySelector<HTMLButtonElement>('[data-boost]')
    boost?.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.touch.turbo = true
    })
    boost?.addEventListener('pointerup', () => {
      this.touch.turbo = false
    })

    this.showTitle()
    this.loop = this.loop.bind(this)
    requestAnimationFrame(this.loop)
  }

  private persist() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.save))
    this.hud.money.textContent = `£${this.save.money}`
  }

  private level(): LevelDef {
    const base = this.levels[this.index]!
    if (base.id === 13) return rebuildEndless(this.endlessSeed)
    return base
  }

  private showTitle() {
    this.screen = 'title'
    this.world = null
    this.overlay.classList.remove('hidden')
    this.overlay.innerHTML = `
      <div class="card">
        <h2>Stripebot</h2>
        <p>A cute robot mower, a messy lawn, and at least one dog with opinions. Cut the grass into satisfying stripes, keep an eye on the battery, and dock before you stall.</p>
        <p><strong>Drive</strong> WASD / arrows · <strong>Boost</strong> Shift or Space · <strong>Pause</strong> Esc</p>
        <div class="actions">
          <button id="start">Mow the lawn</button>
          <button class="ghost" id="howto">How it works</button>
        </div>
      </div>`
    this.overlay.querySelector('#start')?.addEventListener('click', () => {
      this.audio.resume()
      this.index = Math.min(this.save.unlocked - 1, this.levels.length - 1)
      this.startLevel()
    })
    this.overlay.querySelector('#howto')?.addEventListener('click', () => this.showHow())
  }

  private showHow() {
    this.overlay.innerHTML = `
      <div class="card">
        <h2>The loop</h2>
        <p>Uncut grass is dark green. Drive over it to leave a light stripe. Hit the required lawn percentage, then roll onto the glowing charger.</p>
        <p>Dogs bark, chase, and bump you off line — they are pests, not targets. Puddles slow the wheels. Sprinklers soak the battery. Toys stun the blades.</p>
        <p>Between gardens, spend your pay on a wider deck, a quieter motor, armour, and a patch map.</p>
        <div class="actions">
          <button id="back">Got it</button>
        </div>
      </div>`
    this.overlay.querySelector('#back')?.addEventListener('click', () => this.showTitle())
  }

  private startLevel() {
    const level = this.level()
    this.world = createWorld(level, statsFrom(this.save.upgrades))
    this.screen = 'play'
    this.emptySince = 0
    this.overlay.classList.add('hidden')
    this.audio.resume()
    this.canvas.focus()
  }

  private pause() {
    this.screen = 'pause'
    this.overlay.classList.remove('hidden')
    this.overlay.innerHTML = `
      <div class="card">
        <h2>Paused</h2>
        <p>The lawn can wait. The dog probably will not.</p>
        <div class="actions">
          <button id="resume">Keep mowing</button>
          <button class="ghost" id="retry">Restart garden</button>
          <button class="ghost" id="quit">Title</button>
        </div>
      </div>`
    this.overlay.querySelector('#resume')?.addEventListener('click', () => this.resume())
    this.overlay.querySelector('#retry')?.addEventListener('click', () => this.startLevel())
    this.overlay.querySelector('#quit')?.addEventListener('click', () => this.showTitle())
  }

  private resume() {
    this.screen = 'play'
    this.overlay.classList.add('hidden')
  }

  private fail(reason: string) {
    this.screen = 'fail'
    this.audio.fail()
    this.overlay.classList.remove('hidden')
    this.overlay.innerHTML = `
      <div class="card">
        <h2>Stalled</h2>
        <p>${reason}</p>
        <div class="actions">
          <button id="retry">Try again</button>
          <button class="ghost" id="quit">Title</button>
        </div>
      </div>`
    this.overlay.querySelector('#retry')?.addEventListener('click', () => this.startLevel())
    this.overlay.querySelector('#quit')?.addEventListener('click', () => this.showTitle())
  }

  private win() {
    if (!this.world) return
    this.screen = 'win'
    this.audio.win()
    const pct = lawnPct(this.world)
    const leftoverBat = this.world.battery / statsFrom(this.save.upgrades).batteryMax
    const timeBonus = Math.max(0, 80 - this.world.time)
    this.payout = Math.round(this.world.level.reward + leftoverBat * 40 + timeBonus + (pct - this.world.level.requiredPct) * 2)
    this.save.money += this.payout
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(this.levels.length, this.world.level.id + 1))
    this.persist()
    this.overlay.classList.remove('hidden')
    this.overlay.innerHTML = `
      <div class="card">
        <h2>${this.world.level.name} done</h2>
        <p>Lawn ${pct.toFixed(0)}% · Time ${this.fmt(this.world.time)} · Pay £${this.payout}</p>
        <div class="actions">
          <button id="shop">Visit the shed</button>
        </div>
      </div>`
    this.overlay.querySelector('#shop')?.addEventListener('click', () => this.showShop())
  }

  private showShop() {
    this.screen = 'shop'
    this.overlay.classList.remove('hidden')
    const cards = UPGRADE_DEFS.map((def) => {
      const lv = this.save.upgrades[def.id]
      const maxed = lv >= def.max
      const cost = def.cost(lv)
      const label = maxed ? 'Maxed' : `£${cost} · Lv ${lv}/${def.max}`
      return `<button class="upgrade" data-id="${def.id}" ${maxed || this.save.money < cost ? 'disabled' : ''}>
        <strong>${def.name}</strong>
        <small>${def.blurb}</small>
        <small>${label}</small>
      </button>`
    }).join('')
    const last = this.index >= this.levels.length - 1
    this.overlay.innerHTML = `
      <div class="card">
        <h2>The shed</h2>
        <p>Wallet: £${this.save.money}. Bolt on parts, then take the next garden.</p>
        <div class="shop-grid">${cards}</div>
        <div class="actions">
          <button id="next">${last ? 'Another generated garden' : 'Next garden'}</button>
          <button class="ghost" id="title">Title</button>
        </div>
      </div>`
    this.overlay.querySelectorAll<HTMLButtonElement>('.upgrade').forEach((btn) => {
      btn.addEventListener('click', () => this.buy(btn.dataset.id as UpgradeId))
    })
    this.overlay.querySelector('#next')?.addEventListener('click', () => {
      if (last) {
        this.endlessSeed = Date.now()
        this.index = this.levels.length - 1
      } else this.index += 1
      this.startLevel()
    })
    this.overlay.querySelector('#title')?.addEventListener('click', () => this.showTitle())
  }

  private buy(id: UpgradeId) {
    const def = UPGRADE_DEFS.find((u) => u.id === id)
    if (!def) return
    const lv = this.save.upgrades[id]
    if (lv >= def.max) return
    const cost = def.cost(lv)
    if (this.save.money < cost) return
    this.save.money -= cost
    this.save.upgrades[id] = lv + 1
    this.audio.buy()
    this.persist()
    this.showShop()
  }

  private fmt(t: number) {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  private input() {
    let x = this.touch.x
    let y = this.touch.y
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    const turbo = this.touch.turbo || this.keys.has('shift') || this.keys.has(' ')
    return { x, y, turbo }
  }

  private loop(now: number) {
    const dt = Math.min(0.033, (now - (this.last || now)) / 1000)
    this.last = now
    this.resize()
    if (this.screen === 'play' && this.world) {
      const stats = statsFrom(this.save.upgrades)
      stepWorld(this.world, stats, this.input(), dt, {
        bark: () => {
          if (now - this.lastBark > 420) {
            this.audio.bark()
            this.lastBark = now
          }
        },
        bump: () => this.audio.bump(),
        charge: () => this.audio.charge(),
      })
      this.audio.setMowing(true, Math.hypot(this.world.mower.vx, this.world.mower.vy) / 80)
      this.syncHud()
      const pct = lawnPct(this.world)
      if (pct >= this.world.level.requiredPct && this.world.charging) this.win()
      else if (this.world.battery <= 0 && !this.world.charging) {
        this.emptySince += dt
        if (this.emptySince > 1.8) {
          this.fail('Battery empty. The dock was too far, or the route was too chatty with dogs.')
        }
      } else {
        this.emptySince = 0
      }
    } else {
      this.audio.setMowing(false)
    }

    this.ctx.imageSmoothingEnabled = false
    if (this.world) {
      drawWorld(this.ctx, this.world, statsFrom(this.save.upgrades), cameraFor(this.world, this.canvas))
    } else {
      this.drawTitleBg()
    }
    requestAnimationFrame(this.loop)
  }

  private drawTitleBg() {
    const ctx = this.ctx
    const { width, height } = this.canvas
    ctx.fillStyle = '#165c2c'
    ctx.fillRect(0, 0, width, height)
    for (let y = 0; y < height; y += 10) {
      ctx.fillStyle = y % 20 === 0 ? '#7ed957' : '#8ee36a'
      ctx.fillRect(0, y, width, 10)
    }
    ctx.fillStyle = '#0e1c12aa'
    ctx.fillRect(0, 0, width, height)
  }

  private syncHud() {
    if (!this.world) return
    const stats = statsFrom(this.save.upgrades)
    const pct = lawnPct(this.world)
    const bat = (this.world.battery / stats.batteryMax) * 100
    this.hud.level.textContent = `LEVEL ${this.world.level.id}  ${this.world.level.name}`
    this.hud.lawn.textContent = `${pct.toFixed(0)}% / ${this.world.level.requiredPct}%`
    this.hud.lawnBar.style.width = `${Math.min(100, pct)}%`
    this.hud.battery.textContent = `${bat.toFixed(0)}%`
    this.hud.batteryBar.style.width = `${bat}%`
    this.hud.time.textContent = this.fmt(this.world.time)
    this.hud.alert.textContent = this.world.dogAlert
      ? '🐕 Dog nearby!'
      : this.world.charging
        ? 'Charging at the dock'
        : this.world.level.rain
          ? 'Rain · extra drain'
          : this.world.level.brief
    this.hud.money.textContent = `£${this.save.money}`
  }

  private resize() {
    const stage = this.canvas.parentElement!
    const w = stage.clientWidth
    const h = stage.clientHeight
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const tw = Math.max(640, Math.floor(w * dpr))
    const th = Math.max(400, Math.floor(h * dpr))
    if (this.canvas.width !== tw || this.canvas.height !== th) {
      this.canvas.width = tw
      this.canvas.height = th
    }
  }
}
