import { Inventory } from '../inventory/inventory.js'
import { ensureIconLayer, paintIconSlot, createHoverInfo } from '../inventory/inventoryUI.js'

let host = null
let root = null
const uiNodes = new Map()
const inventoryNodes = new Map()
const uiDefs = []
const keybinds = new Map()
const styleNodes = new Map()
let keyListenerAttached = false

export function setModUiHost(nextHost) {
  host = nextHost || null
  if (host?.app) root = host.app
  if (host && !keyListenerAttached) {
    keyListenerAttached = true
    window.addEventListener('keydown', onKeyDown, true)
  }
  if (host && root) {
    for (const def of uiDefs) {
      if (uiNodes.has(def.name)) continue
      const panel = def.kind === 'inventory' ? createInventoryPanel(def) : createDraggablePanel(def)
      if (panel) {
        uiNodes.set(def.name, panel.panel || panel)
        if (def.kind === 'inventory' && panel) inventoryNodes.set(def.name, panel.panel)
      }
    }
  }
}

function isTypingTarget(target) {
  if (!target || !target.tagName) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

function onKeyDown(e) {
  if (!host || isTypingTarget(e.target)) return
  const defName = keybinds.get(e.code)
  if (!defName) return
  const node = uiNodes.get(defName)
  if (!node) return
  const hidden = node.style.display === 'none'
  node.style.display = hidden ? '' : 'none'
  e.preventDefault()
}

export function clearModUis() {
  for (const node of uiNodes.values()) node.remove()
  for (const node of inventoryNodes.values()) node.remove()
  for (const node of styleNodes.values()) node.remove()
  uiNodes.clear()
  inventoryNodes.clear()
  styleNodes.clear()
  uiDefs.length = 0
  keybinds.clear()
}

function injectStyle(name, cssText) {
  if (!root || !cssText) return
  const key = String(name)
  const existing = styleNodes.get(key)
  if (existing) existing.remove()
  const style = document.createElement('style')
  style.dataset.modUi = key
  style.textContent = String(cssText)
  document.head.appendChild(style)
  styleNodes.set(key, style)
}

function createDraggablePanel(def) {
  if (!root) return null
  const panel = document.createElement('div')
  panel.className = 'mc-mod-ui ' + (def.className || '')
  panel.style.position = 'absolute'
  panel.style.left = (def.x ?? 12) + 'px'
  panel.style.top = (def.y ?? 12) + 'px'
  panel.style.width = (def.width ?? 320) + 'px'
  panel.style.height = (def.height ?? 'auto')
  panel.style.minWidth = (def.minWidth ?? 240) + 'px'
  panel.style.minHeight = (def.minHeight ?? 160) + 'px'
  panel.style.background = def.background || 'rgba(18,18,18,.92)'
  panel.style.border = def.border || '1px solid rgba(255,255,255,.18)'
  panel.style.color = def.color || '#fff'
  panel.style.zIndex = '60'
  panel.style.padding = '8px'
  panel.style.userSelect = 'none'
  panel.style.boxShadow = '0 14px 40px rgba(0,0,0,.35)'
  panel.style.backdropFilter = 'blur(6px)'
  panel.style.overflow = 'auto'
  panel.style.resize = def.resizable ? 'both' : 'none'

  injectStyle(def.name, def.css)

  const title = document.createElement('div')
  title.textContent = def.title || def.name || 'Mod UI'
  title.style.fontWeight = '700'
  title.style.cursor = def.draggable === false ? 'default' : 'move'
  title.style.marginBottom = '8px'
  title.style.display = 'flex'
  title.style.alignItems = 'center'
  title.style.justifyContent = 'space-between'
  panel.appendChild(title)

  if (def.closable) {
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = 'x'
    close.style.marginLeft = '8px'
    close.onclick = () => { panel.style.display = 'none' }
    title.appendChild(close)
  }

  const body = document.createElement('div')
  body.className = 'mc-mod-ui-body'
  panel.appendChild(body)

  const controls = new Map()

  if (def.html) {
    const htmlHost = document.createElement('div')
    htmlHost.className = 'mc-mod-ui-html'
    htmlHost.innerHTML = String(def.html)
    body.appendChild(htmlHost)
  }

  if (Array.isArray(def.text)) {
    for (const line of def.text) {
      const p = document.createElement('div')
      p.textContent = String(line)
      body.appendChild(p)
    }
  }

  if (Array.isArray(def.buttons)) {
    for (const btnDef of def.buttons) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = btnDef.label || 'Button'
      btn.style.display = 'block'
      btn.style.width = btnDef.width || '100%'
      btn.style.marginTop = '6px'
      if (btnDef.className) btn.className = btnDef.className
      btn.onclick = () => {
        const payload = {
          action: btnDef.action || btnDef.id || btnDef.label,
          packetType: btnDef.packetType || def.packetType || '',
          itemId: controls.get('itemId')?.value || btnDef.itemId || '',
          count: Number(controls.get('count')?.value || btnDef.count || 1)
        }
        if (host?.sendPacket && payload.packetType) host.sendPacket(payload.packetType, payload)
        host?.onAction?.(payload, def)
      }
      body.appendChild(btn)
    }
  }

  if (def.fields?.includes('itemId')) {
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'item id'
    input.style.display = 'block'
    input.style.width = '100%'
    input.style.marginBottom = '6px'
    input.value = def.defaultItemId || ''
    controls.set('itemId', input)
    body.prepend(input)
  }

  if (def.fields?.includes('count')) {
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '1'
    input.step = '1'
    input.value = String(def.defaultCount || 1)
    input.style.display = 'block'
    input.style.width = '100%'
    input.style.marginBottom = '6px'
    controls.set('count', input)
    body.prepend(input)
  }

  if (def.draggable !== false) {
    let dragging = false
    let ox = 0
    let oy = 0
    const onMove = (e) => {
      if (!dragging) return
      panel.style.left = (e.clientX - ox) + 'px'
      panel.style.top = (e.clientY - oy) + 'px'
    }
    const onUp = () => {
      dragging = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    title.addEventListener('pointerdown', (e) => {
      dragging = true
      const r = panel.getBoundingClientRect()
      ox = e.clientX - r.left
      oy = e.clientY - r.top
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    })
  }

  root.appendChild(panel)
  return panel
}

function createInventoryPanel(def) {
  if (!root) return null
  const inv = new Inventory(def.size || 27)
  const panel = document.createElement('div')
  panel.className = 'mc-mod-inventory'
  panel.style.position = 'absolute'
  panel.style.left = (def.x ?? 40) + 'px'
  panel.style.top = (def.y ?? 40) + 'px'
  panel.style.background = 'rgba(22,22,22,.96)'
  panel.style.border = '1px solid rgba(255,255,255,.2)'
  panel.style.padding = '8px'
  panel.style.zIndex = '61'
  panel.style.color = '#fff'

  const title = document.createElement('div')
  title.textContent = def.title || def.name || 'Inventory'
  title.style.fontWeight = '700'
  title.style.marginBottom = '8px'
  panel.appendChild(title)

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(9, 36px)'
  grid.style.gap = '4px'
  panel.appendChild(grid)

  const hover = createHoverInfo(panel)
  const refresh = () => {
    grid.innerHTML = ''
    for (let i = 0; i < inv.size; i++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'mc-slot'
      cell.style.width = '36px'
      cell.style.height = '36px'
      cell.style.padding = '0'
      cell.style.position = 'relative'
      const getter = () => inv.slots[i]
      paintIconSlot(cell, inv.slots[i])
      hover.attach(cell, getter)
      cell.onclick = () => {
        const s = inv.slots[i]
        if (s) inv.removeAt(i, 1)
        else if (def.testItemId) inv.slots[i] = { id: def.testItemId, count: 1 }
        inv.emit()
      }
      grid.appendChild(cell)
    }
  }
  inv.onChange(refresh)
  refresh()
  root.appendChild(panel)
  return { panel, inventory: inv, refresh }
}

export function registerModUis(manifest) {
  for (const def of manifest.ui || []) {
    if (!def || !def.name) continue
    uiDefs.push(def)
    if (def.keybind) keybinds.set(String(def.keybind), def.name)
    const panel = def.kind === 'inventory' ? createInventoryPanel(def) : createDraggablePanel(def)
    if (panel) uiNodes.set(def.name, panel.panel || panel)
    if (def.kind === 'inventory' && panel) inventoryNodes.set(def.name, panel.panel)
  }
}

export function openModInventory(name) {
  return inventoryNodes.get(name) || null
}
