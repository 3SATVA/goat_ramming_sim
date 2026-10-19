import { defaultProgress, STATS, type Progress, type Upgrades } from './progress'
import { isHexColor } from './util'

export interface Settings {
  color: string
  minutes: 2 | 3
  muted: boolean
}

const KEY = 'billy-bash-settings'
const DEFAULT_COLOR = '#f3ecdf'

export function defaultSettings(): Settings {
  return { color: DEFAULT_COLOR, minutes: 3, muted: false }
}

export function loadSettings(): Settings {
  const fallback = defaultSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Settings>
    const color = typeof parsed.color === 'string' && isHexColor(parsed.color) ? parsed.color : fallback.color
    const minutes = parsed.minutes === 2 || parsed.minutes === 3 ? parsed.minutes : fallback.minutes
    const muted = parsed.muted === true
    return { color, minutes, muted }
  } catch {
    return fallback
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private mode and full storage should not break a round.
  }
}

const PROGRESS_KEY = 'billy-bash-progress'

export function loadProgress(): Progress {
  const fallback = defaultProgress()
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Progress> & { upgrades?: Partial<Upgrades> }
    const upgrades = { ...fallback.upgrades }
    for (const key of Object.keys(upgrades) as (keyof Upgrades)[]) {
      const value = parsed.upgrades?.[key]
      const max = STATS.find((stat) => stat.id === key)?.max ?? 8
      if (typeof value === 'number' && Number.isFinite(value)) upgrades[key] = Math.min(max, Math.max(0, Math.floor(value)))
    }
    const coins = typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) ? Math.max(0, Math.floor(parsed.coins)) : 0
    const cleared = typeof parsed.cleared === 'number' && Number.isFinite(parsed.cleared) ? Math.max(0, Math.floor(parsed.cleared)) : 0
    return { coins, upgrades, cleared }
  } catch {
    return fallback
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // Private mode and full storage should not break a round.
  }
}
