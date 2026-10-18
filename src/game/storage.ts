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
