export const UPGRADE_IDS = [
  'battery',
  'motor',
  'blades',
  'armour',
  'wheels',
  'quiet',
  'turbo',
  'charge',
  'mapping',
] as const

export type UpgradeId = (typeof UPGRADE_IDS)[number]

export interface UpgradeDef {
  id: UpgradeId
  name: string
  blurb: string
  max: number
  cost: (level: number) => number
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  { id: 'battery', name: 'Battery pack', blurb: 'Mow for longer between charges', max: 5, cost: (l) => 35 + l * 30 },
  { id: 'motor', name: 'Motor', blurb: 'Cruise faster across the lawn', max: 5, cost: (l) => 40 + l * 32 },
  { id: 'blades', name: 'Wide blades', blurb: 'Cut a broader stripe each pass', max: 5, cost: (l) => 45 + l * 35 },
  { id: 'armour', name: 'Armour', blurb: 'Dogs and bumps knock you less', max: 4, cost: (l) => 30 + l * 28 },
  { id: 'wheels', name: 'Knobby wheels', blurb: 'Puddles and mud slow you less', max: 4, cost: (l) => 28 + l * 26 },
  { id: 'quiet', name: 'Quiet motor', blurb: 'Dogs notice you later', max: 4, cost: (l) => 32 + l * 30 },
  { id: 'turbo', name: 'Turbo burst', blurb: 'Hold Shift / Boost for a sprint', max: 4, cost: (l) => 38 + l * 34 },
  { id: 'charge', name: 'Fast charging', blurb: 'The dock tops you up quicker', max: 4, cost: (l) => 30 + l * 28 },
  { id: 'mapping', name: 'Patch map', blurb: 'Highlights leftover uncut grass', max: 1, cost: () => 80 },
]

export type UpgradeLevels = Record<UpgradeId, number>

export function emptyUpgrades(): UpgradeLevels {
  return {
    battery: 0,
    motor: 0,
    blades: 0,
    armour: 0,
    wheels: 0,
    quiet: 0,
    turbo: 0,
    charge: 0,
    mapping: 0,
  }
}

export interface MowerStats {
  batteryMax: number
  speed: number
  blade: number
  armour: number
  wheels: number
  quiet: number
  turbo: number
  chargeRate: number
  mapping: boolean
}

export function statsFrom(u: UpgradeLevels): MowerStats {
  return {
    batteryMax: 100 + u.battery * 22,
    speed: 148 + u.motor * 18,
    blade: 22 + u.blades * 6,
    armour: u.armour * 0.16,
    wheels: u.wheels * 0.2,
    quiet: u.quiet * 18,
    turbo: 0.55 + u.turbo * 0.28,
    chargeRate: 26 + u.charge * 14,
    mapping: u.mapping > 0,
  }
}
