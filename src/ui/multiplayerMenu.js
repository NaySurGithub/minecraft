import { t } from './translator.js'

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export class MultiplayerMenu {
  constructor(menu) {
    this.menu = menu
  }

  show(callbacks) {
    this.menu.clear('mc-dirt-menu')
    this.menu.root.appendChild(el('h1', 'mc-menu-title', t('multiplayer')))
    const panel = el('div', 'mc-settings-panel')
    panel.appendChild(this.menu.button(t('hostGame'), () => this.showHost(callbacks)))
    panel.appendChild(this.menu.button(t('joinGame'), () => this.showJoin(callbacks)))
    this.menu.root.appendChild(panel)
    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.menu.button(t('cancel'), () => this.menu.showMain(callbacks)))
    this.menu.root.appendChild(bottom)
  }

  showHost(callbacks) {
    this.menu.showWorldSelect({
      ...callbacks,
      play: (id) => callbacks.host(id)
    }, 'load')
  }

  showJoin(callbacks) {
    this.menu.clear('mc-dirt-menu')
    this.menu.root.appendChild(el('h1', 'mc-menu-title', t('joinGame')))
    const panel = el('div', 'mc-settings-panel')
    const input = document.createElement('input')
    input.className = 'mc-menu-input'
    input.placeholder = t('roomCode')
    input.autocomplete = 'off'
    input.maxLength = 12
    panel.appendChild(el('label', '', t('roomCode')))
    panel.appendChild(input)
    this.menu.root.appendChild(panel)
    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.menu.button(t('joinGame'), () => {
      const code = input.value.trim().toUpperCase()
      if (code) callbacks.join(code)
    }))
    bottom.appendChild(this.menu.button(t('cancel'), () => this.show(callbacks)))
    this.menu.root.appendChild(bottom)
    input.focus()
  }
}
