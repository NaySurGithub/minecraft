import { GAME_MODE } from '../config/constants.js'
import { deleteWorld, listWorlds, loadWorldData, renameWorld } from '../world/save.js'
import { MultiplayerMenu } from './multiplayerMenu.js'
import { ServerBrowser } from './serverBrowser.js'
import { readModFile } from '../mods/modLoader.js'
import { formatDate, setLanguage, t } from './translator.js'

const SETTINGS_KEY = 'nazzaandnaycraft_settings'

export const KEYBINDABLE_ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint', 'inventory', 'drop', 'pause']

export const DEFAULT_KEYBINDINGS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sneak: 'ShiftLeft',
  sprint: 'ControlLeft',
  inventory: 'KeyE',
  drop: 'KeyQ',
  pause: 'Escape'
}

export const DEFAULT_TOUCH_LAYOUT = {
  jump: { x: 82, y: 62, scale: 1 },
  place: { x: 90, y: 74, scale: 1 },
  break: { x: 74, y: 74, scale: 1 },
  sneak: { x: 14, y: 78, scale: 1 },
  joy: { x: 14, y: 60, scale: 1 }
}

const DEFAULT_SETTINGS = {
  video: { renderDistance: 6, pixelRatio: 1.5, maxFps: 60 },
  audio: { master: 80, music: 60, effects: 80 },
  controls: {
    mouseSensitivity: 0.0022,
    touchSensitivity: 0.005,
    invertY: false,
    keybindings: { ...DEFAULT_KEYBINDINGS },
    touchLayout: { ...DEFAULT_TOUCH_LAYOUT }
  },
  language: 'fr',
  languageChosen: false,
  accessibility: { highContrast: false, uiScale: 1, reduceMotion: false },
  resourcePack: 'classic',
  game: { autosave: true, autosaveSeconds: 30, showCoordinates: true, device: null }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return {
      ...clone(DEFAULT_SETTINGS),
      ...saved,
      video: { ...DEFAULT_SETTINGS.video, ...(saved.video || {}) },
      audio: { ...DEFAULT_SETTINGS.audio, ...(saved.audio || {}) },
      controls: {
        ...DEFAULT_SETTINGS.controls,
        ...(saved.controls || {}),
        keybindings: { ...DEFAULT_KEYBINDINGS, ...((saved.controls || {}).keybindings || {}) },
        touchLayout: { ...DEFAULT_TOUCH_LAYOUT, ...((saved.controls || {}).touchLayout || {}) }
      },
      accessibility: { ...DEFAULT_SETTINGS.accessibility, ...(saved.accessibility || {}) },
      game: { ...DEFAULT_SETTINGS.game, ...(saved.game || {}) }
    }
  } catch (e) {
    return clone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function modeLabel(mode) {
  return mode === GAME_MODE.CREATIVE ? t('creative') : t('survival')
}

export class MinecraftMenu {
  constructor(parent) {
    this.parent = parent
    this.root = el('div', 'mc-menu')
    this.selectedWorldId = null
    this.settings = loadSettings()
    setLanguage(this.settings.language)
    parent.appendChild(this.root)
  }

  isMobileMenu() {
    const device = this.settings.game.device
    return device === 'phone' || device === 'tablet' || window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900
  }

  hide() {
    this.root.style.display = 'none'
  }

  show() {
    this.root.style.display = 'block'
  }

  clear(className) {
    this.show()
    this.root.className = 'mc-menu ' + className
    this.root.innerHTML = ''
  }

  button(label, onClick, extraClass) {
    const btn = el('button', 'mc-menu-btn ' + (extraClass || ''), label)
    btn.type = 'button'
    btn.onclick = onClick
    return btn
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
      return
    }
    const target = document.documentElement
    if (target.requestFullscreen) target.requestFullscreen().catch(() => {})
  }

  commitSettings(callbacks) {
    setLanguage(this.settings.language)
    saveSettings(this.settings)
    callbacks.applySettings && callbacks.applySettings(this.settings)
  }

  showMain(callbacks) {
    this.clear('mc-main-menu')
    setLanguage(this.settings.language)
    const logo = el('div', 'mc-logo', t('gameTitle'))
    const splash = el('div', 'mc-splash', t('splash'))
    const logoWrap = el('div', 'mc-logo-wrap')
    logoWrap.appendChild(logo)
    logoWrap.appendChild(splash)

    const buttons = el('div', 'mc-main-buttons')
    const topControls = el('div', 'mc-main-top-controls')
    if (this.isMobileMenu()) {
      topControls.appendChild(this.button('⛶', () => this.toggleFullscreen(), 'mc-icon-btn'))
    }
    buttons.appendChild(this.button(t('newWorld'), () => this.showCreate(callbacks)))
	buttons.appendChild(this.button(t('loadWorld'), () => this.showWorldSelect(callbacks)))
    buttons.appendChild(this.button(t('multiplayer'), () => new MultiplayerMenu(this).show(callbacks)))
    buttons.appendChild(this.button(t('servers'), () => this.showServers(callbacks)))
    buttons.appendChild(this.button(t('options'), () => this.showOptions(callbacks)))
    buttons.appendChild(this.button(t('quitGame'), () => {
      window.location.href = 'https://snapcollege.42web.io/duel.html'
    }))

    this.root.appendChild(logoWrap)
    if (topControls.childElementCount) this.root.appendChild(topControls)
    this.root.appendChild(buttons)
  }

  showServers(callbacks) {
    new ServerBrowser(this).show(callbacks)
  }

  showWorldSelect(callbacks, mode) {
    this.clear('mc-dirt-menu')
    this.selectedWorldId = null
    this.root.appendChild(el('h1', 'mc-menu-title', t('selectWorld')))

    const list = el('div', 'mc-world-list')
    const worlds = listWorlds().slice().sort((a, b) => String(b.openedAt || b.savedAt || '').localeCompare(String(a.openedAt || a.savedAt || '')))
    if (!worlds.length) list.appendChild(el('div', 'mc-world-empty', t('noSavedWorlds')))
    for (const world of worlds) {
      const data = loadWorldData(world.id) || world
      const item = el('button', 'mc-world-entry')
      item.type = 'button'
      item.innerHTML = `
        <strong>${data.name || t('unnamedWorld')}</strong>
        <span>${t('gameMode')}: ${modeLabel(data.gameMode)}</span>
        <span>${t('seed')}: ${data.seed || ''}</span>
        <span>${t('createdAt')}: ${formatDate(data.createdAt)}</span>
        <span>${t('lastOpened')}: ${formatDate(data.openedAt || data.savedAt)}</span>
      `
      item.onclick = () => {
        this.selectedWorldId = world.id
        for (const child of list.children) child.classList.remove('selected')
        item.classList.add('selected')
        refreshActions()
      }
      item.ondblclick = () => callbacks.play(world.id)
      list.appendChild(item)
    }

    const bottom = el('div', 'mc-menu-bottom')
    const actions = el('div', 'mc-world-actions')
    
    const importBtn = callbacks.importWorld
  ? this.button('Import', () => callbacks.importWorld())
  : null

const refreshActions = () => {
  actions.innerHTML = ''

  actions.style.display = this.selectedWorldId ? 'flex' : 'none'

  if (importBtn) {
    importBtn.style.display = this.selectedWorldId ? 'none' : ''
  }

  if (!this.selectedWorldId) return

  actions.appendChild(this.button(
    t('playSelectedWorld'),
    () => callbacks.play(this.selectedWorldId)
  ))

  actions.appendChild(this.button(
    t('delete'),
    () => {
      deleteWorld(this.selectedWorldId)
      this.showWorldSelect(callbacks, mode)
    }
  ))

  actions.appendChild(this.button(
    t('rename'),
    () => {
      const data = loadWorldData(this.selectedWorldId)
      const name = window.prompt(
        t('renamePrompt'),
        data?.name || ''
      )
      if (!name?.trim()) return
      renameWorld(this.selectedWorldId, name.trim())
      this.showWorldSelect(callbacks, mode)
    }
  ))

  if (callbacks.exportWorld) {
    actions.appendChild(
      this.button('Export',
        () => callbacks.exportWorld(this.selectedWorldId)
      )
    )
  }
}

refreshActions()

bottom.appendChild(actions)

if (importBtn) {
  bottom.appendChild(importBtn)
}

bottom.appendChild(
  this.button(t('cancel'),
    () => this.showMain(callbacks)
  )
)

    this.root.appendChild(list)
    this.root.appendChild(bottom)
  }

  showCreate(callbacks) {
    this.clear('mc-dirt-menu')
    this.root.appendChild(el('h1', 'mc-menu-title', t('createWorld')))

    const form = el('div', 'mc-create-form')
    const nameInput = document.createElement('input')
    nameInput.value = t('newWorld')
    const seedInput = document.createElement('input')
    seedInput.placeholder = t('randomSeed')
    const modeRow = el('div', 'mc-mode-row')
    let gameMode = GAME_MODE.SURVIVAL
    let keepInventory = false
    const setMode = (mode) => {
      gameMode = mode
      survival.classList.toggle('selected', mode === GAME_MODE.SURVIVAL)
      creative.classList.toggle('selected', mode === GAME_MODE.CREATIVE)
    }
    const survival = this.button(t('survival'), () => setMode(GAME_MODE.SURVIVAL), 'selected')
    const creative = this.button(t('creative'), () => setMode(GAME_MODE.CREATIVE))
    modeRow.appendChild(survival)
    modeRow.appendChild(creative)
    const keepInvBtn = this.button('Keep Inventory: Off', () => {
      keepInventory = !keepInventory
      keepInvBtn.textContent = 'Keep Inventory: ' + (keepInventory ? 'On' : 'Off')
    })

    form.appendChild(el('label', '', t('worldName')))
    form.appendChild(nameInput)
    form.appendChild(el('label', '', t('seed')))
    form.appendChild(seedInput)
    form.appendChild(modeRow)
    form.appendChild(keepInvBtn)

    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.button(t('createWorldButton'), () => {
      const now = new Date().toISOString()
      callbacks.create({
        id: 'world_' + Date.now().toString(36),
        name: nameInput.value.trim() || t('newWorld'),
        seed: seedInput.value.trim() || String(Date.now()),
        gameMode,
        defaultGameMode: gameMode,
        keepInventory,
        createdAt: now,
        openedAt: now,
        savedAt: now
      })
    }))
    bottom.appendChild(this.button(t('cancel'), () => this.showMain(callbacks)))

    this.root.appendChild(form)
    this.root.appendChild(bottom)
  }

  showOptions(callbacks) {
    this.clear('mc-dirt-menu')
    this.root.appendChild(el('h1', 'mc-menu-title', t('options')))
    const grid = el('div', 'mc-options-grid')
    grid.appendChild(this.button(t('video'), () => this.showVideoOptions(callbacks)))
    grid.appendChild(this.button(t('audio'), () => this.showAudioOptions(callbacks)))
    grid.appendChild(this.button(t('controls'), () => this.showControlOptions(callbacks)))
    grid.appendChild(this.button(t('language'), () => this.showLanguageOptions(callbacks)))
    grid.appendChild(this.button(t('accessibility'), () => this.showAccessibilityOptions(callbacks)))
    grid.appendChild(this.button(t('resourcePacks'), () => this.showResourcePacks(callbacks)))
    if (callbacks.allowMods) {
      grid.appendChild(this.button(t('mods') || 'Mods', () => this.showMods(callbacks)))
    }
    grid.appendChild(this.button(t('gameSettings'), () => this.showGameOptions(callbacks)))
    this.root.appendChild(grid)
    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.button(t('done'), () => {
      if (callbacks.closeOptions) callbacks.closeOptions()
      else this.showMain(callbacks)
    }))
    this.root.appendChild(bottom)
  }

  showSettingScreen(callbacks, title, rows) {
    this.clear('mc-dirt-menu')
    this.root.appendChild(el('h1', 'mc-menu-title', title))
    const panel = el('div', 'mc-settings-panel')
    for (const row of rows) panel.appendChild(row)
    this.root.appendChild(panel)
    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.button(t('done'), () => this.showOptions(callbacks)))
    this.root.appendChild(bottom)
  }

  optionButton(label, getValue, onClick) {
    const btn = this.button('', () => {
      onClick()
      btn.textContent = label + ': ' + getValue()
    })
    btn.textContent = label + ': ' + getValue()
    return btn
  }

  selectRow(label, value, choices, onChange) {
    const row = el('label', 'mc-select-row')
    const text = el('span', '', label)
    const select = document.createElement('select')
    for (const choice of choices) {
      const option = document.createElement('option')
      option.value = choice.value
      option.textContent = choice.label
      select.appendChild(option)
    }
    select.value = value
    select.addEventListener('change', () => onChange(select.value))
    row.appendChild(text)
    row.appendChild(select)
    return row
  }

  showVideoOptions(callbacks) {
    this.showSettingScreen(callbacks, t('videoOptions'), [
      this.optionButton(t('renderDistance'), () => this.settings.video.renderDistance + ' chunks', () => {
        const values = [4, 6, 8, 10, 12]
        this.settings.video.renderDistance = values[(values.indexOf(this.settings.video.renderDistance) + 1) % values.length]
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('pixelQuality'), () => this.settings.video.pixelRatio + 'x', () => {
        const values = [1, 1.5, 2]
        this.settings.video.pixelRatio = values[(values.indexOf(this.settings.video.pixelRatio) + 1) % values.length]
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('maxFps'), () => this.settings.video.maxFps, () => {
        const values = [30, 45, 60, 90]
        this.settings.video.maxFps = values[(values.indexOf(this.settings.video.maxFps) + 1) % values.length]
        this.commitSettings(callbacks)
      })
    ])
  }

  showAudioOptions(callbacks) {
    const cycle = (key) => {
      const values = [0, 20, 40, 60, 80, 100]
      this.settings.audio[key] = values[(values.indexOf(this.settings.audio[key]) + 1) % values.length]
      this.commitSettings(callbacks)
    }
    this.showSettingScreen(callbacks, t('audioOptions'), [
      this.optionButton(t('masterVolume'), () => this.settings.audio.master + '%', () => cycle('master')),
      this.optionButton(t('music'), () => this.settings.audio.music + '%', () => cycle('music')),
      this.optionButton(t('effects'), () => this.settings.audio.effects + '%', () => cycle('effects'))
    ])
  }

  showMods(callbacks) {
    this.clear('mc-dirt-menu')
    this.root.appendChild(el('h1', 'mc-menu-title', t('mods') || 'Mods'))
    const panel = el('div', 'mc-settings-panel')
    const upload = document.createElement('input')
    upload.type = 'file'
    upload.accept = '.json,.zip,application/json,application/zip'
    upload.className = 'mc-menu-input'
    const info = el('div', 'mc-world-empty', (t('modsHint') || 'Upload a JSON mod or ZIP containing mod.json for the current world.'))
    const list = el('div', 'mc-mod-list')
    const renderList = () => {
      const mods = callbacks.getWorldMods ? callbacks.getWorldMods() : []
      list.innerHTML = ''
      if (!mods.length) {
        list.appendChild(el('div', 'mc-world-empty', (t('installedMods') || 'Installed mods') + ': 0'))
        return
      }
      for (const mod of mods) {
        const card = el('div', 'mc-mod-card')
        if (mod.iconDataUrl) {
          const img = document.createElement('img')
          img.src = mod.iconDataUrl
          img.alt = mod.name || 'Mod'
          card.appendChild(img)
        } else {
          card.appendChild(el('div', 'mc-mod-icon-fallback', '?'))
        }
        const body = el('div', 'mc-mod-body')
        body.appendChild(el('strong', '', mod.name || 'Unnamed Mod'))
        body.appendChild(el('span', '', (t('author') || 'Author') + ': ' + (mod.author || 'Unknown')))
        body.appendChild(el('span', '', 'v' + (mod.version || '1.0.0')))
        if (mod.description) body.appendChild(el('p', '', mod.description))
        card.appendChild(body)
        if (callbacks.removeWorldMod) {
          const remove = this.button(t('delete') || 'Delete', () => {
            callbacks.removeWorldMod(mod.name)
            renderList()
          }, 'mc-danger-btn')
          card.appendChild(remove)
        }
        list.appendChild(card)
      }
    }
    renderList()
    upload.addEventListener('change', async () => {
      const file = upload.files && upload.files[0]
      if (!file) return
      try {
        const manifest = await readModFile(file)
        if (!callbacks.addWorldMod || !callbacks.addWorldMod(manifest)) {
          window.alert(t('modsNeedWorld') || 'Open a world before installing mods.')
          return
        }
        renderList()
      } catch (e) {
        window.alert((t('modLoadError') || 'Could not load mod') + ': ' + (e.message || e))
      }
    })
    panel.appendChild(info)
    panel.appendChild(upload)
    panel.appendChild(list)
    this.root.appendChild(panel)
    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.button(t('done'), () => this.showOptions(callbacks)))
    this.root.appendChild(bottom)
  }

  showControlOptions(callbacks) {
    this.showSettingScreen(callbacks, t('controlOptions'), [
      this.optionButton(t('mouseSensitivity'), () => Math.round(this.settings.controls.mouseSensitivity * 10000), () => {
        const values = [0.0014, 0.0018, 0.0022, 0.0028, 0.0034]
        this.settings.controls.mouseSensitivity = values[(values.indexOf(this.settings.controls.mouseSensitivity) + 1) % values.length]
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('touchSensitivity'), () => Math.round(this.settings.controls.touchSensitivity * 1000), () => {
        const values = [0.003, 0.004, 0.005, 0.006, 0.007]
        this.settings.controls.touchSensitivity = values[(values.indexOf(this.settings.controls.touchSensitivity) + 1) % values.length]
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('invertY'), () => this.settings.controls.invertY ? t('yes') : t('no'), () => {
        this.settings.controls.invertY = !this.settings.controls.invertY
        this.commitSettings(callbacks)
      }),
      this.button(t('keyBindings') || 'Key Bindings', () => this.showKeyBindings(callbacks)),
      this.button(t('mobileLayout') || 'Mobile Layout', () => this.showMobileLayout(callbacks))
    ])
  }

  keyLabel(code) {
    if (!code) return '---'
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    if (code.startsWith('Arrow')) return code.slice(5)
    const map = {
      Space: 'Space',
      ShiftLeft: 'L-Shift',
      ShiftRight: 'R-Shift',
      ControlLeft: 'L-Ctrl',
      ControlRight: 'R-Ctrl',
      AltLeft: 'L-Alt',
      AltRight: 'R-Alt',
      Escape: 'Esc',
      Tab: 'Tab',
      Enter: 'Enter'
    }
    return map[code] || code
  }

  showKeyBindings(callbacks) {
    this.clear('mc-dirt-menu')
    this.root.appendChild(el('h1', 'mc-menu-title', t('keyBindings') || 'Key Bindings'))
    const panel = el('div', 'mc-settings-panel')
    let listening = null
    const rows = {}
    const conflictCheck = (code, action) => {
      for (const other of KEYBINDABLE_ACTIONS) {
        if (other !== action && this.settings.controls.keybindings[other] === code) return other
      }
      return null
    }
    const refreshRow = (action) => {
      const btn = rows[action]
      if (!btn) return
      const code = this.settings.controls.keybindings[action]
      btn.textContent = (t(action) || action) + ': ' + this.keyLabel(code)
      btn.classList.toggle('listening', listening === action)
    }
    const onKey = (e) => {
      if (!listening) return
      e.preventDefault()
      e.stopPropagation()
      const action = listening
      const code = e.code
      const conflict = conflictCheck(code, action)
      if (conflict) this.settings.controls.keybindings[conflict] = ''
      this.settings.controls.keybindings[action] = code
      listening = null
      window.removeEventListener('keydown', onKey, true)
      this.commitSettings(callbacks)
      for (const a of KEYBINDABLE_ACTIONS) refreshRow(a)
    }
    for (const action of KEYBINDABLE_ACTIONS) {
      const btn = this.button('', () => {
        if (listening) {
          window.removeEventListener('keydown', onKey, true)
          const prev = listening
          listening = null
          refreshRow(prev)
        }
        listening = action
        refreshRow(action)
        window.addEventListener('keydown', onKey, true)
      })
      rows[action] = btn
      refreshRow(action)
      panel.appendChild(btn)
    }
    this.root.appendChild(panel)
    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.button(t('resetDefaults') || 'Reset', () => {
      if (listening) {
        window.removeEventListener('keydown', onKey, true)
        listening = null
      }
      this.settings.controls.keybindings = { ...DEFAULT_KEYBINDINGS }
      this.commitSettings(callbacks)
      for (const a of KEYBINDABLE_ACTIONS) refreshRow(a)
    }))
    bottom.appendChild(this.button(t('done'), () => {
      if (listening) {
        window.removeEventListener('keydown', onKey, true)
        listening = null
      }
      this.showControlOptions(callbacks)
    }))
    this.root.appendChild(bottom)
  }

  showMobileLayout(callbacks) {
    this.clear('mc-dirt-menu')
    this.root.appendChild(el('h1', 'mc-menu-title', t('mobileLayout') || 'Mobile Layout'))
    const glyphs = { jump: '↑', place: '⌖', break: '⛏', sneak: '⇩', joy: '◎' }
    const stage = el('div', 'mc-layout-stage')
    const handles = {}
    let dragging = null
    let selected = null
    let moved = false
    const clamp = (v) => Math.max(4, Math.min(96, v))
    const baseSize = (key) => (key === 'joy' ? 72 : 56)
    const applyPos = (key) => {
      const h = handles[key]
      const pos = this.settings.controls.touchLayout[key]
      const scale = pos.scale || 1
      const size = baseSize(key) * scale
      h.style.left = pos.x + '%'
      h.style.top = pos.y + '%'
      h.style.width = size + 'px'
      h.style.height = size + 'px'
      h.style.fontSize = (size * 0.42) + 'px'
    }
    const setSelected = (key) => {
      selected = key
      for (const k in handles) handles[k].classList.toggle('selected', k === key)
      if (sizeRow) sizeRow.style.display = key ? 'flex' : 'none'
      if (key && sizeSlider) sizeSlider.value = String(this.settings.controls.touchLayout[key].scale || 1)
      if (key && sizeLabel) sizeLabel.textContent = (t('size') || 'Size') + ': ' + Math.round((this.settings.controls.touchLayout[key].scale || 1) * 100) + '%'
    }
    const pointerPos = (e) => {
      const rect = stage.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * 100
      const py = ((e.clientY - rect.top) / rect.height) * 100
      return { x: clamp(px), y: clamp(py) }
    }
    const onMove = (e) => {
      if (!dragging) return
      e.preventDefault()
      moved = true
      const pos = pointerPos(e)
      const cur = this.settings.controls.touchLayout[dragging]
      cur.x = pos.x
      cur.y = pos.y
      applyPos(dragging)
    }
    const onUp = () => {
      if (!dragging) return
      const wasDragging = dragging
      dragging = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) setSelected(wasDragging)
      this.commitSettings(callbacks)
    }
    for (const key of Object.keys(this.settings.controls.touchLayout)) {
      const h = el('button', 'mc-layout-handle', glyphs[key] || key)
      h.type = 'button'
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        dragging = key
        moved = false
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      })
      handles[key] = h
      stage.appendChild(h)
      applyPos(key)
    }
    this.root.appendChild(stage)

    const sizeRow = el('div', 'mc-select-row')
    sizeRow.style.display = 'none'
    const sizeLabel = el('span', '', (t('size') || 'Size') + ': 100%')
    const sizeSlider = document.createElement('input')
    sizeSlider.type = 'range'
    sizeSlider.min = '0.6'
    sizeSlider.max = '1.8'
    sizeSlider.step = '0.1'
    sizeSlider.value = '1'
    sizeSlider.addEventListener('input', () => {
      if (!selected) return
      const scale = parseFloat(sizeSlider.value)
      this.settings.controls.touchLayout[selected].scale = scale
      applyPos(selected)
      sizeLabel.textContent = (t('size') || 'Size') + ': ' + Math.round(scale * 100) + '%'
    })
    sizeSlider.addEventListener('change', () => this.commitSettings(callbacks))
    sizeRow.appendChild(sizeLabel)
    sizeRow.appendChild(sizeSlider)
    this.root.appendChild(sizeRow)

    const hint = el('p', 'panel-hint', t('mobileLayoutHint') || 'Drag to move. Tap a control to resize it.')
    this.root.appendChild(hint)

    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.button(t('resetDefaults') || 'Reset', () => {
      this.settings.controls.touchLayout = clone(DEFAULT_TOUCH_LAYOUT)
      this.commitSettings(callbacks)
      setSelected(null)
      for (const key of Object.keys(this.settings.controls.touchLayout)) applyPos(key)
    }))
    bottom.appendChild(this.button(t('done'), () => this.showControlOptions(callbacks)))
    this.root.appendChild(bottom)
  }

  showLanguageOptions(callbacks) {
    this.showSettingScreen(callbacks, t('languageOptions'), [
      this.optionButton(t('language'), () => this.settings.language === 'fr' ? t('french') : t('english'), () => {
        this.settings.language = this.settings.language === 'fr' ? 'en' : 'fr'
        this.settings.languageChosen = true
        this.commitSettings(callbacks)
        this.showLanguageOptions(callbacks)
      })
    ])
  }

  showAccessibilityOptions(callbacks) {
    this.showSettingScreen(callbacks, t('accessibilityOptions'), [
      this.optionButton(t('highContrast'), () => this.settings.accessibility.highContrast ? t('yes') : t('no'), () => {
        this.settings.accessibility.highContrast = !this.settings.accessibility.highContrast
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('uiScale'), () => Math.round(this.settings.accessibility.uiScale * 100) + '%', () => {
        const values = [0.9, 1, 1.15, 1.3]
        this.settings.accessibility.uiScale = values[(values.indexOf(this.settings.accessibility.uiScale) + 1) % values.length]
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('reduceMotion'), () => this.settings.accessibility.reduceMotion ? t('yes') : t('no'), () => {
        this.settings.accessibility.reduceMotion = !this.settings.accessibility.reduceMotion
        this.commitSettings(callbacks)
      })
    ])
  }

  showResourcePacks(callbacks) {
    const packs = [
      ['classic', t('resourcePackClassic')],
      ['bright', t('resourcePackBright')],
      ['contrast', t('resourcePackContrast')]
    ]
    this.showSettingScreen(callbacks, t('resourcePacks'), packs.map(([id, label]) => (
      this.optionButton(label, () => this.settings.resourcePack === id ? t('enabled') : t('disabled'), () => {
        this.settings.resourcePack = id
        this.commitSettings(callbacks)
        this.showResourcePacks(callbacks)
      })
    )))
  }

  showGameOptions(callbacks) {
    const rows = [
      this.selectRow(t('deviceType'), this.settings.game.device || 'desktop', [
        { value: 'phone', label: t('phone') },
        { value: 'tablet', label: t('tablet') },
        { value: 'desktop', label: t('desktop') }
      ], (value) => {
        this.settings.game.device = value
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('autosave'), () => this.settings.game.autosave ? t('yes') : t('no'), () => {
        this.settings.game.autosave = !this.settings.game.autosave
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('autosaveInterval'), () => this.settings.game.autosaveSeconds + 's', () => {
        const values = [15, 30, 60, 120]
        this.settings.game.autosaveSeconds = values[(values.indexOf(this.settings.game.autosaveSeconds) + 1) % values.length]
        this.commitSettings(callbacks)
      }),
      this.optionButton(t('coordinates'), () => this.settings.game.showCoordinates ? t('yes') : t('no'), () => {
        this.settings.game.showCoordinates = !this.settings.game.showCoordinates
        this.commitSettings(callbacks)
      })
    ]
    if (callbacks.canChangeGameMode && callbacks.canChangeGameMode()) {
      rows.unshift(this.optionButton(t('gameMode'), () => {
        const mode = callbacks.getGameMode ? callbacks.getGameMode() : GAME_MODE.SURVIVAL
        return modeLabel(mode)
      }, () => {
        const mode = callbacks.getGameMode && callbacks.getGameMode() === GAME_MODE.CREATIVE
          ? GAME_MODE.SURVIVAL
          : GAME_MODE.CREATIVE
        if (callbacks.setGameMode) callbacks.setGameMode(mode)
      }))
    }
    this.showSettingScreen(callbacks, t('gameSettings'), rows)
  }
}
