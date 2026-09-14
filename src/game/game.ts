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
  private shell: HTMLElement
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
      <div class="shell is-title">
        <div class="topbar">
          <div class="brand">
            <div>
              <h1>Stripebot</h1>
              <p>Unhurried mowing · stripes, birdsong, and the occasional dog</p>
            </div>
          </div>
          <div class="pill" id="money-pill">£0</div>
        </div>
        <div class="status">
          <div class="pill" id="level-pill">Garden 1</div>
          <div class="pill">Lawn <span id="lawn-val">0%</span><span class="bar"><span id="lawn-bar"></span></span></div>
          <div class="pill">Battery <span id="bat-val">100%</span><span class="bar battery"><span id="bat-bar"></span></span></div>
          <div class="pill" id="time-pill">00:00</div>
        </div>
        <div class="stage">
          <canvas id="game" width="1100" height="688"></canvas>
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
              <button data-boost="1">Go</button>
            </div>
          </div>
          <div class="overlay" id="overlay"></div>
        </div>
        <div class="footer-status">
          <div class="pill" id="alert-pill">Take your time</div>
        </div>
      </div>
    `

    this.canvas = root.querySelector('#game')!
    this.canvas.tabIndex = 0
    this.ctx = this.canvas.getContext('2d')!
    this.overlay = root.querySelector('#overlay')!
    this.shell = root.querySelector('.shell')!
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
    this.shell.classList.add('is-title')
    this.overlay.classList.remove('hidden')
    this.overlay.innerHTML = `
      <div class="card">
        <h2>Stripebot</h2>
        <p>A quiet morning, an uncut lawn, and a little robot that likes stripes. Mow at your own pace, pause for the charger, and let the dog have its moment.</p>
        <p><strong>Drive</strong> WASD / arrows · <strong>Go</strong> Shift or Space · <strong>Pause</strong> Esc</p>
        <div class="actions">
          <button id="start">Wander out</button>
          <button class="ghost" id="howto">A few notes</button>
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
        <h2>How the morning goes</h2>
        <p>Uncut grass is sage. Drive over it to leave a pale stripe. When enough of the lawn is done, roll onto the charger and rest.</p>
        <p>Dogs may notice you, follow, and bump the deck — they are company, not combat. Puddles drag the wheels. Sprinklers are a nuisance. Toys stop the blades for a beat.</p>
        <p>Between gardens, visit the potting shed for a wider deck, a quieter motor, or a map of leftover patches.</p>
        <div class="actions">
          <button id="back">Understood</button>
        </div>
      </div>`
    this.overlay.querySelector('#back')?.addEventListener('click', () => this.showTitle())
  }

  private startLevel() {
    const level = this.level()
    this.world = createWorld(level, statsFrom(this.save.upgrades))
    this.screen = 'play'
    this.emptySince = 0
    this.shell.classList.remove('is-title')
    this.overlay.classList.add('hidden')
    this.audio.resume()
    this.canvas.focus()
  }

  private pause() {
    this.screen = 'pause'
    this.overlay.classList.remove('hidden')
    this.overlay.innerHTML = `
      <div class="card">
        <h2>A cup of tea</h2>
        <p>The lawn can wait. The dog may not.</p>
        <div class="actions">
          <button id="resume">Back to the grass</button>
          <button class="ghost" id="retry">Start this garden again</button>
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
        <h2>Battery gone quiet</h2>
        <p>${reason}</p>
        <div class="actions">
          <button id="retry">Try this garden again</button>
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
        <h2>${this.world.level.name}</h2>
        <p>Lawn ${pct.toFixed(0)}% · ${this.fmt(this.world.time)} · £${this.payout} for the jar</p>
        <div class="actions">
          <button id="shop">Potting shed</button>
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
        <h2>Potting shed</h2>
        <p>Jar: £${this.save.money}. Fit a part if you like, then wander to the next garden.</p>
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
          this.fail('The pack ran dry. Amble back to the dock next time, or take a shorter path around the dogs.')
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
    ctx.fillStyle = '#cfc3aa'
    ctx.fillRect(0, 0, width, height)
    for (let y = 0; y < height; y += 12) {
      ctx.fillStyle = y % 24 === 0 ? '#8fa07c' : '#9aab86'
      ctx.fillRect(0, y, width, 12)
    }
    ctx.fillStyle = '#3d342822'
    ctx.fillRect(0, 0, width, height)
  }

  private syncHud() {
    if (!this.world) return
    const stats = statsFrom(this.save.upgrades)
    const pct = lawnPct(this.world)
    const bat = (this.world.battery / stats.batteryMax) * 100
    this.hud.level.textContent = `Garden ${this.world.level.id}  ${this.world.level.name}`
    this.hud.lawn.textContent = `${pct.toFixed(0)}% / ${this.world.level.requiredPct}%`
    this.hud.lawnBar.style.width = `${Math.min(100, pct)}%`
    this.hud.battery.textContent = `${bat.toFixed(0)}%`
    this.hud.batteryBar.style.width = `${bat}%`
    this.hud.time.textContent = this.fmt(this.world.time)
    this.hud.alert.classList.toggle('warn', this.world.dogAlert)
    this.hud.alert.textContent = this.world.dogAlert
      ? 'A dog has noticed you'
      : this.world.charging
        ? 'Resting at the charger'
        : this.world.level.rain
          ? 'Soft rain · the pack drinks a little faster'
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
