import { t } from './translator.js'

export class ChatUI {
  constructor(app) {
    this.app = app
    this.open = false
    this.messages = []
    this.onSend = null
    this._build()
  }

  _build() {
    const btn = document.createElement('button')
    btn.id = 'chatbtn'
    btn.type = 'button'
    btn.textContent = 'T'
    btn.title = 'Chat'
    btn.addEventListener('click', () => this.toggle())
    this.app.appendChild(btn)
    this.button = btn

    const overlay = document.createElement('section')
    overlay.id = 'chatoverlay'
    overlay.hidden = true
    overlay.innerHTML = `
      <div class="chat-panel" role="dialog" aria-label="${t('chat') || 'Chat'}">
        <div class="chat-header">
          <button type="button" class="chat-exit">${t('exit') || 'Exit'}</button>
          <div class="chat-title">${t('chat') || 'Chat and Commands'}</div>
        </div>
        <div class="chat-body">
          <div class="chat-log" aria-live="polite">
            <div class="chat-hint">${t('chatHint1') || 'Press T or RETURN to open chat.'}<br>${t('chatHint2') || 'Press or Hold B to Emote'}</div>
          </div>
        </div>
        <form class="chat-form">
          <button type="button" class="chat-emoji">☻</button>
          <button type="button" class="chat-slash">/</button>
          <button type="button" class="chat-opt">⚙</button>
          <input class="chat-input" type="text" maxlength="180" placeholder="" />
          <button type="submit" class="chat-send">➤</button>
        </form>
      </div>
    `
    const form = overlay.querySelector('.chat-form')
    const input = overlay.querySelector('.chat-input')
    overlay.querySelector('.chat-exit').addEventListener('click', () => this.close())
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault()
       // this.close()
      } else if (e.code === 'Enter') {
        e.preventDefault()
        form.requestSubmit()
      }
      e.stopPropagation()
    })
    overlay.querySelector('.chat-slash').addEventListener('click', () => {
      input.value += '/'
      input.focus()
    })
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const text = input.value.trim()
      if (text && this.onSend) this.onSend(text)
      input.value = ''
    })
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close()
    })
    this.app.appendChild(overlay)
    this.overlay = overlay
    this.logEl = overlay.querySelector('.chat-log')
    this.inputEl = input
  }

  addMessage(author, text) {
    this.messages.push({ author, text })
    if (this.messages.length > 64) this.messages.shift()
    this._render()
  }

  _render() {
    const hintHtml = `<div class="chat-hint">${t('chatHint1') || 'Press T or RETURN to open chat.'}<br>${t('chatHint2') || 'Press or Hold B to Emote'}</div>`
    const msgsHtml = this.messages.map((m) => `<div class="chat-line"><b>${m.author}:</b> ${escapeHtml(m.text)}</div>`).join('')
    this.logEl.innerHTML = hintHtml + msgsHtml
    this.logEl.scrollTop = this.logEl.scrollHeight
  }

  openChat() {
    this.open = true
    this.overlay.hidden = false
    if (document.pointerLockElement) document.exitPointerLock()
    this.inputEl.focus()
  }

  close() {
    this.open = false
    this.overlay.hidden = true
  }

  toggle() {
    if (this.open) this.close()
    else this.openChat()
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
