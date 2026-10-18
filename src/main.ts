import { AudioBus } from './game/audio'
import { Game, nextRoundLabel } from './game/game'
import type { Snapshot } from './game/game'
import { loadSettings, saveSettings, type Settings } from './game/storage'
import type { EndResult, HudModel, Mode } from './game/types'
import { COAT_COLORS } from './game/types'
import { formatTime, isHexColor } from './game/util'
import './style.css'

declare global {
  interface Window {
    __billy?: {
      skipToOvertime: () => void
      snapshot: () => Snapshot
      screenGoats: () => { name: string; team: string; hp: number; x: number; y: number; r: number }[]
      debugRound: (round: number) => void
    }
  }
}

const appEl = document.querySelector<HTMLElement>('#app')
const canvas = document.querySelector<HTMLCanvasElement>('#view')
if (!appEl || !canvas) throw new Error('Billy Bash failed to start')
const app: HTMLElement = appEl

const audio = new AudioBus()
let settings: Settings = loadSettings()
audio.setMuted(settings.muted)

const screenMenu = must<HTMLElement>('#screenMenu')
const screenCustom = must<HTMLElement>('#screenCustom')
const screenPause = must<HTMLElement>('#screenPause')
const screenEnd = must<HTMLElement>('#screenEnd')
const hud = must<HTMLElement>('#hud')
const roundLabel = must<HTMLElement>('#roundLabel')
const timerLabel = must<HTMLElement>('#timerLabel')
const hpLabel = must<HTMLElement>('#hpLabel')
const hpFill = must<HTMLElement>('#hpFill')
const endRound = must<HTMLElement>('#endRound')
const endTitle = must<HTMLElement>('#endTitle')
const endBody = must<HTMLElement>('#endBody')
const endStats = must<HTMLElement>('#endStats')
const colorPicker = must<HTMLInputElement>('#colorPicker')
const swatches = must<HTMLElement>('#swatches')
const btnNext = must<HTMLButtonElement>('#btnNext')
const btnRetry = must<HTMLButtonElement>('#btnRetry')
const btnMute = must<HTMLButtonElement>('#btnMute')
const btnMuteMenu = must<HTMLButtonElement>('#btnMuteMenu')
const min2 = must<HTMLButtonElement>('#min2')
const min3 = must<HTMLButtonElement>('#min3')
const debugMenu = must<HTMLButtonElement>('#btnDebugMenu')
const debugOt = must<HTMLButtonElement>('#btnDebugOt')

const game = new Game({
  canvas,
  logo: document.querySelector<HTMLCanvasElement>('#logoGoat'),
  preview: document.querySelector<HTMLCanvasElement>('#previewGoat'),
  audio,
  isMuted: () => settings.muted,
  onMode: showMode,
  onHud: showHud,
})
game.applySettings(settings.color, settings.minutes)
colorPicker.value = settings.color
syncMinutes()
syncMuteLabels()

if (game.debugEnabled) {
  debugMenu.hidden = false
  debugOt.hidden = false
  window.__billy = {
    skipToOvertime: () => game.skipToOvertime(),
    snapshot: () => game.snapshot(),
    screenGoats: () => game.screenGoats(),
    debugRound: (round: number) => game.debugRound(round),
  }
}

document.addEventListener('pointerdown', () => audio.unlock(), { passive: true })

must<HTMLButtonElement>('#btnPlay').addEventListener('click', () => {
  tap()
  game.playFromMenu()
})
must<HTMLButtonElement>('#btnCustomize').addEventListener('click', () => {
  tap()
  game.openCustomize()
})
must<HTMLButtonElement>('#btnBack').addEventListener('click', () => {
  tap()
  game.closeCustomize()
})
must<HTMLButtonElement>('#btnPause').addEventListener('click', () => {
  tap()
  game.pause()
})
must<HTMLButtonElement>('#btnResume').addEventListener('click', () => {
  tap()
  game.resume()
})
must<HTMLButtonElement>('#btnRetryPause').addEventListener('click', () => {
  tap()
  game.retry()
})
must<HTMLButtonElement>('#btnMenuPause').addEventListener('click', () => {
  tap()
  game.toMenu()
})
btnNext.addEventListener('click', () => {
  tap()
  game.nextRound()
})
btnRetry.addEventListener('click', () => {
  tap()
  game.retry()
})
must<HTMLButtonElement>('#btnEndMenu').addEventListener('click', () => {
  tap()
  game.toMenu()
})
btnMute.addEventListener('click', () => toggleMute())
btnMuteMenu.addEventListener('click', () => toggleMute())
min2.addEventListener('click', () => setMinutes(2))
min3.addEventListener('click', () => setMinutes(3))
debugMenu.addEventListener('click', () => {
  tap()
  game.skipToOvertime()
})
debugOt.addEventListener('click', () => {
  tap()
  game.skipToOvertime()
})

for (const coat of COAT_COLORS) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'swatch'
  button.style.background = coat.hex
  button.dataset.color = coat.hex
  button.setAttribute('aria-label', coat.name)
  button.setAttribute('role', 'listitem')
  button.addEventListener('click', () => setColor(coat.hex))
  swatches.append(button)
}
syncSwatches()

colorPicker.addEventListener('input', () => {
  const value = colorPicker.value
  if (isHexColor(value)) setColor(value)
})

function showMode(mode: Mode, end: EndResult | null): void {
  app.dataset.mode = mode
  screenMenu.hidden = mode !== 'menu'
  screenCustom.hidden = mode !== 'customize'
  screenPause.hidden = mode !== 'paused'
  screenEnd.hidden = mode !== 'end'
  if (mode === 'end' && end) fillEnd(end)
}

function showHud(model: HudModel): void {
  hud.hidden = !model.visible
  app.dataset.overtime = String(model.overtime)
  app.dataset.time = formatTime(model.timeLeft)
  app.dataset.hp = String(Math.ceil(model.playerHp))
  const rivals = model.rivals === 1 ? '1 rival' : `${model.rivals} rivals`
  roundLabel.textContent = `Round ${model.round} · ${rivals}`
  timerLabel.textContent = model.overtime ? `${formatTime(model.timeLeft)} · FIRE` : formatTime(model.timeLeft)
  timerLabel.classList.toggle('overtime', model.overtime)
  const pct = model.playerMax > 0 ? Math.max(0, Math.min(1, model.playerHp / model.playerMax)) : 0
  hpFill.style.width = `${pct * 100}%`
  hpFill.style.background = pct > 0.55 ? '#7dde6a' : pct > 0.28 ? '#ffcf70' : '#ff5d5d'
  hpLabel.textContent = `You ${Math.ceil(model.playerHp)}`
  syncMuteLabels()
}

function fillEnd(end: EndResult): void {
  endRound.textContent = `Round ${end.round}`
  const copy = endCopy(end)
  endTitle.textContent = copy.title
  endBody.textContent = copy.body
  const rows: [string, string][] = [
    ['Rams launched', String(end.launches)],
    ['Rams landed', String(end.rams)],
    ['Damage dealt', String(end.damageDealt)],
    ['Heaviest hit', String(end.bestHit)],
    ['Your HP', String(end.playerHp)],
    ['Rival HP', String(end.enemyHp)],
  ]
  endStats.replaceChildren(
    ...rows.map(([name, value]) => {
      const li = document.createElement('li')
      const left = document.createElement('span')
      const right = document.createElement('strong')
      left.textContent = name
      right.textContent = value
      li.append(left, right)
      return li
    }),
  )
  const won = end.result === 'win'
  btnNext.hidden = !won
  btnNext.textContent = nextRoundLabel(end.round)
  btnRetry.textContent = won ? 'Replay round' : 'Try again'
}

function endCopy(end: EndResult): { title: string; body: string } {
  if (end.result === 'win' && end.blow === 'fire') {
    return { title: "Yard's yours", body: 'The fire finished what you started.' }
  }
  if (end.result === 'win' && end.reason === 'ko') {
    return { title: "Yard's yours", body: 'You flattened the other goats.' }
  }
  if (end.result === 'win') {
    return {
      title: 'Time!',
      body: `You finished with more HP (${end.playerHp} vs ${end.enemyHp}).`,
    }
  }
  if (end.result === 'lose' && end.blow === 'fire') {
    return { title: 'Burned out', body: 'The fence caught you and would not let go.' }
  }
  if (end.result === 'lose' && end.reason === 'ko') {
    return { title: 'Knocked out', body: 'The other goat got the last ram.' }
  }
  if (end.result === 'lose') {
    return {
      title: 'Time!',
      body: `The rivals had more HP left (${end.enemyHp} vs ${end.playerHp}).`,
    }
  }
  if (end.reason === 'ko') return { title: 'Double knockout', body: 'You went down together.' }
  return { title: 'Photo finish', body: 'Dead even when the clock hit zero.' }
}

function setColor(color: string): void {
  settings = { ...settings, color }
  colorPicker.value = color
  game.setColor(color)
  saveSettings(settings)
  syncSwatches()
}

function setMinutes(minutes: 2 | 3): void {
  tap()
  settings = { ...settings, minutes }
  game.setMinutes(minutes)
  saveSettings(settings)
  syncMinutes()
}

function toggleMute(): void {
  settings = { ...settings, muted: !settings.muted }
  audio.setMuted(settings.muted)
  saveSettings(settings)
  syncMuteLabels()
  if (!settings.muted) {
    audio.unlock()
    audio.click()
  }
}

function syncMinutes(): void {
  min2.setAttribute('aria-pressed', String(settings.minutes === 2))
  min3.setAttribute('aria-pressed', String(settings.minutes === 3))
}

function syncSwatches(): void {
  const current = settings.color.toLowerCase()
  for (const button of swatches.querySelectorAll<HTMLButtonElement>('.swatch')) {
    button.setAttribute('aria-pressed', String((button.dataset.color ?? '').toLowerCase() === current))
  }
}

function syncMuteLabels(): void {
  const label = settings.muted ? 'Sound off' : 'Sound on'
  btnMute.textContent = label
  btnMuteMenu.textContent = label
  btnMute.setAttribute('aria-pressed', String(!settings.muted))
  btnMuteMenu.setAttribute('aria-pressed', String(!settings.muted))
}

function tap(): void {
  audio.unlock()
  audio.click()
}

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}
