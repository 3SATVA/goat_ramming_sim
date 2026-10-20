import { AudioBus } from './game/audio'
import { Game } from './game/game'
import type { Snapshot } from './game/game'
import { CHAPTERS, eventCopy, isUnlocked, STATS, statEffect, upgradeCost, type Progress } from './game/progress'
import { loadProgress, loadSettings, saveProgress, saveSettings, type Settings } from './game/storage'
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
      debugKnockout: () => void
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
const screenStory = must<HTMLElement>('#screenStory')
const screenUpgrades = must<HTMLElement>('#screenUpgrades')
const screenPause = must<HTMLElement>('#screenPause')
const screenEnd = must<HTMLElement>('#screenEnd')
const storyList = must<HTMLElement>('#storyList')
const upgradeList = must<HTMLElement>('#upgradeList')
const menuCoins = must<HTMLElement>('#menuCoins')
const storyCoins = must<HTMLElement>('#storyCoins')
const upgradeCoins = must<HTMLElement>('#upgradeCoins')
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
  hudBottom: () => measureHud(),
  onMode: showMode,
  onHud: showHud,
  onProgress: (progress) => {
    saveProgress(progress)
    paintEconomy(progress)
  },
})
game.applySettings(settings.color, settings.minutes)
game.setProgress(loadProgress())
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
    debugKnockout: () => game.debugKnockout(),
  }
}

document.addEventListener('pointerdown', () => audio.unlock(), { passive: true })

// Touch guards: keep the page still while you play. Menus still scroll (see .screen in CSS).
const isFighting = () => {
  const mode = app.dataset.mode
  return mode === 'playing' || mode === 'countdown'
}
const insideScroller = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.screen:not([hidden])') !== null
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1 || isFighting() || !insideScroller(event.target)) event.preventDefault()
  },
  { passive: false },
)
document.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length > 1 && !insideScroller(event.target)) event.preventDefault()
  },
  { passive: false },
)
for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(name, (event) => event.preventDefault(), { passive: false })
}
document.addEventListener('contextmenu', (event) => {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
})
document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false })

let hudBottomCache = 0
function measureHud(): number {
  if (hud.hidden) return hudBottomCache
  const rect = hud.getBoundingClientRect()
  const appTop = app.getBoundingClientRect().top
  if (rect.height > 0) hudBottomCache = rect.bottom - appTop
  return hudBottomCache
}

must<HTMLButtonElement>('#btnStory').addEventListener('click', () => {
  tap()
  game.openStory()
})
must<HTMLButtonElement>('#btnQuick').addEventListener('click', () => {
  tap()
  game.startQuick()
})
must<HTMLButtonElement>('#btnUpgrades').addEventListener('click', () => {
  tap()
  game.openUpgrades()
})
must<HTMLButtonElement>('#btnStoryBack').addEventListener('click', () => {
  tap()
  game.closePanels()
})
must<HTMLButtonElement>('#btnUpgradeBack').addEventListener('click', () => {
  tap()
  game.closePanels()
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
  screenStory.hidden = mode !== 'story'
  screenUpgrades.hidden = mode !== 'upgrades'
  screenPause.hidden = mode !== 'paused'
  screenEnd.hidden = mode !== 'end'
  paintEconomy(game.currentProgress())
  if (mode === 'story') paintStory(game.currentProgress())
  if (mode === 'upgrades') paintUpgrades(game.currentProgress())
  if (mode === 'end' && end) fillEnd(end)
}

function showHud(model: HudModel): void {
  hud.hidden = !model.visible
  app.dataset.overtime = String(model.overtime)
  app.dataset.time = formatTime(model.timeLeft)
  app.dataset.hp = String(Math.ceil(model.playerHp))
  const eventName = model.event === 'clear' ? '' : ` · ${eventCopy(model.event).title}`
  roundLabel.textContent = `${model.title}${eventName}`
  timerLabel.textContent = model.overtime ? `${formatTime(model.timeLeft)} · FIRE` : formatTime(model.timeLeft)
  timerLabel.classList.toggle('overtime', model.overtime)
  const pct = model.playerMax > 0 ? Math.max(0, Math.min(1, model.playerHp / model.playerMax)) : 0
  hpFill.style.width = `${pct * 100}%`
  hpFill.style.background = pct > 0.55 ? '#7dde6a' : pct > 0.28 ? '#ffcf70' : '#ff5d5d'
  hpLabel.textContent = `You ${Math.ceil(model.playerHp)}`
  syncMuteLabels()
}

function fillEnd(end: EndResult): void {
  endRound.textContent = end.fight === 'quick' ? 'Quick Fight' : `${end.chapterName} · ${end.round}. ${end.levelName}`
  const copy = endCopy(end)
  endTitle.textContent = copy.title
  endBody.textContent = copy.body
  const rows: [string, string][] = [
    ['Coins earned', String(end.coins)],
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
  const next = game.nextLabel()
  btnNext.hidden = !won || !next
  if (next) btnNext.textContent = next
  btnRetry.textContent = won ? 'Replay' : 'Try again'
}

function endCopy(end: EndResult): { title: string; body: string } {
  if (end.result === 'win' && end.blow === 'fire') {
    return { title: "Yard's yours", body: 'The fire finished what you started.' }
  }
  if (end.result === 'win' && end.blow === 'hazard') {
    return { title: "Yard's yours", body: 'The spikes and the storm finished the fight.' }
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
  if (end.result === 'lose' && end.blow === 'hazard') {
    return { title: 'Caught out', body: 'Spikes, a sand vortex, or icy breath took you down.' }
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
  const ico = btnMute.querySelector('.ico')
  const txt = btnMute.querySelector('.txt')
  if (ico && txt) {
    ico.textContent = settings.muted ? '🔇' : '🔊'
    txt.textContent = label
  } else btnMute.textContent = label
  btnMute.setAttribute('aria-label', label)
  btnMuteMenu.textContent = label
  btnMute.setAttribute('aria-pressed', String(!settings.muted))
  btnMuteMenu.setAttribute('aria-pressed', String(!settings.muted))
}

function paintEconomy(progress: Progress): void {
  const label = progress.coins === 1 ? '1 coin' : `${progress.coins} coins`
  menuCoins.textContent = label
  storyCoins.textContent = label
  upgradeCoins.textContent = label
}

function paintStory(progress: Progress): void {
  storyList.replaceChildren()
  let id = 1
  for (const chapter of CHAPTERS) {
    const heading = document.createElement('h3')
    heading.className = 'chapter-label'
    const name = document.createElement('strong')
    name.textContent = `Chapter ${chapter.id} · ${chapter.name}`
    const blurb = document.createElement('span')
    blurb.textContent = chapter.blurb
    heading.append(name, blurb)
    storyList.append(heading)
    for (const level of chapter.levels) {
      const levelId = id++
      const button = document.createElement('button')
      button.type = 'button'
      button.className = level.slots.some((slot) => slot.role === 'boss') ? 'level-btn boss' : 'level-btn'
      const open = isUnlocked(levelId, progress.cleared)
      button.disabled = !open
      const title = document.createElement('strong')
      title.textContent = open ? `${levelId}. ${level.name}` : `${levelId}. Locked`
      const detail = document.createElement('span')
      const weather = eventCopy(level.event).title
      detail.textContent = open ? `${level.blurb} ${level.minutes}:00 · ${weather}.` : 'Clear the previous level.'
      button.append(title, detail)
      button.addEventListener('click', () => {
        if (!open) return
        tap()
        game.startStory(levelId)
      })
      storyList.append(button)
    }
  }
}

function paintUpgrades(progress: Progress): void {
  upgradeList.replaceChildren()
  for (const stat of STATS) {
    const level = progress.upgrades[stat.id]
    const maxed = level >= stat.max
    const cost = upgradeCost(stat.id, level)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'upgrade-row'
    button.disabled = maxed || progress.coins < cost
    const title = document.createElement('strong')
    title.textContent = maxed ? `${stat.name} · Max` : `${stat.name} · ${cost} coins`
    const detail = document.createElement('span')
    detail.textContent = `${stat.blurb} Now ${statEffect(stat.id, level)}. Next ${statEffect(stat.id, Math.min(stat.max, level + 1))}.`
    button.append(title, detail)
    button.addEventListener('click', () => {
      tap()
      if (game.buy(stat.id)) paintUpgrades(game.currentProgress())
    })
    upgradeList.append(button)
  }
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
