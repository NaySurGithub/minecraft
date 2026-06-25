import { t } from './translator.js'

export function buildDeathOverlay(app, { onRespawn, onQuit }) {
  const overlay = document.createElement('section')
  overlay.id = 'deathoverlay'
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('role', 'dialog')
  overlay.style.display = 'none' // hidden by default

  overlay.innerHTML = `
    <div class="death-panel">
      <h1 class="death-title">${t('youDied')}</h1>
      <nav class="death-actions">
        <button type="button" data-action="respawn">${t('respawn')}</button>
        <button type="button" data-action="quit">${t('titleScreen')}</button>
      </nav>
    </div>
  `

  overlay.addEventListener('click', (e) => {
    const action = e.target.dataset?.action
    if (action === 'respawn') onRespawn()
    if (action === 'quit') onQuit()
  })

  app.appendChild(overlay)
  return overlay
}
