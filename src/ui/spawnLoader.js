import { t } from './translator.js'

const STAGE_COLORS = {
  empty: '#2b2b2b',
  generating: '#7a5a34',
  meshing: '#b9963f',
  done: '#5fa84a'
}

export class SpawnLoader {
  constructor(parent) {
    this.parent = parent || document.body
    this.overlay = null
    this.statusEl = null
    this.percentEl = null
    this.gridEl = null
    this.cells = []
    this.gridSize = 0
  }

  show(label = t('loadingWorld'), dimension = 'overworld') {
	this.dimension = dimension
    if (this.overlay) this.hide()
    const overlay = document.createElement('div')
    overlay.className = 'spawn-loader'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', t('loadingWorldAria'))
    const panel = document.createElement('div')
    panel.className = 'spawn-loader-panel'
    const grid = document.createElement('div')
    grid.className = 'spawn-loader-grid'
    panel.appendChild(grid)
    const status = document.createElement('p')
    status.className = 'spawn-loader-status'
    status.textContent = label
    panel.appendChild(status)
    const percent = document.createElement('p')
    percent.className = 'spawn-loader-percent'
    percent.textContent = '0%'
    panel.appendChild(percent)
    overlay.appendChild(panel)
    this.parent.appendChild(overlay)
    this.overlay = overlay
    this.statusEl = status
    this.percentEl = percent
    this.gridEl = grid
    this.cells = []
    this.gridSize = 0
  }

  buildGrid(size) {
  if (!this.gridEl) return

  this.gridEl.innerHTML = ''
  this.cells = []
  this.gridSize = size

  this.gridEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`

  const total = size * size

  const emptyColor =
    this.dimension === 'nether'
      ? '#5a1212' // rouge netherrack
      : '#2b5f1f' // vert herbe

  for (let i = 0; i < total; i++) {
    const cell = document.createElement('span')
    cell.className = 'spawn-loader-cell'
    cell.style.background = emptyColor
    this.gridEl.appendChild(cell)
    this.cells.push(cell)
  }
}

  setChunk(i, stage) {
  const cell = this.cells[i]
  if (!cell) return

  const colors = this.dimension === 'nether'
    ? {
        empty: '#2b0b0b',
        generating: '#5a1212',
        meshing: '#8a2020',
        done: '#b03030'
      }
    : STAGE_COLORS

  cell.style.background = colors[stage] || colors.empty
}

  setProgress(done, total, label) {
    if (label && this.statusEl) this.statusEl.textContent = label
    if (this.percentEl) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      this.percentEl.textContent = Math.min(100, pct) + '%'
    }
  }

  hide() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay)
    }
    this.overlay = null
    this.statusEl = null
    this.percentEl = null
    this.gridEl = null
    this.cells = []
    this.gridSize = 0
  }
}
