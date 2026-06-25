import { t } from './translator.js'

// HUD/DOM builders extracted from main.js.
// These take explicit dependencies so main.js retains ownership of game state
// and the pause/quit callbacks, avoiding circular imports.

export function buildHud(app) {
  const cross = document.createElement('div')
  cross.id = 'crosshair'
  app.appendChild(cross)

  const info = document.createElement('div')
  info.id = 'info'
  app.appendChild(info)
  return info
}

export function buildPauseOverlay(app, { onResume, onSettings, onQuit, onTogglePause }) {
  const mobileBtn = document.createElement('button')
  mobileBtn.id = 'pausebtn'
  mobileBtn.type = 'button'
  mobileBtn.textContent = '-'
  mobileBtn.addEventListener('click', () => onTogglePause())
  app.appendChild(mobileBtn)

  const overlay = document.createElement('section')
  overlay.id = 'pauseoverlay'
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('role', 'dialog')
  overlay.hidden = true
  overlay.innerHTML = `
    <div class="pause-world-hud" aria-hidden="true">
      <div class="pause-cloud pause-cloud-a"></div>
      <div class="pause-cloud pause-cloud-b"></div>
      <div class="pause-crosshair"></div>
      <div class="pause-empty-hotbar">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="pause-hand"></div>
    </div>
    <div class="pause-panel">
      <h1 class="pause-logo">${t('gameTitle')}</h1>
      <nav class="pause-actions" aria-label="${t('pauseMenu')}">
        <button type="button" data-action="resume">${t('resumeGame')}</button>
        <button type="button" data-action="settings">${t('settings')}</button>
        <button type="button" data-action="quit">${t('saveAndQuit')}</button>
      </nav>
    </div>
  `
  overlay.addEventListener('click', (e) => {
    const action = e.target.dataset?.action
    if (action === 'resume') onResume()
    if (action === 'settings') onSettings()
    if (action === 'quit') onQuit()
  })
  app.appendChild(overlay)
  return { overlay, pauseButton: mobileBtn }
}
