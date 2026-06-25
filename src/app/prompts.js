import { DEVICE } from '../config/constants.js'
import { setLanguage, t } from '../ui/translator.js'
import { saveSettings } from '../ui/menu.js'

export function createPrompts({ app, menu, menuCallbacks, settingsRef, applySettings }) {
  function showDevicePopup() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'overlay'
      const panel = document.createElement('div')
      panel.className = 'panel'
      const title = document.createElement('h1')
      title.textContent = t('deviceTitle')
      panel.appendChild(title)
      const hint = document.createElement('p')
      hint.className = 'panel-hint'
      hint.textContent = t('deviceHint')
      panel.appendChild(hint)
      const options = [
        [t('phone'), DEVICE.PHONE],
        [t('tablet'), DEVICE.TABLET],
        [t('desktop'), DEVICE.DESKTOP]
      ]
      for (const [label, value] of options) {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.onclick = () => {
          settingsRef.current.game.device = value
          menu.settings.game.device = value
          menu.commitSettings(menuCallbacks)
          app.removeChild(overlay)
          resolve(value)
        }
        panel.appendChild(btn)
      }
      overlay.appendChild(panel)
      app.appendChild(overlay)
    })
  }

  function showLanguagePopup() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'overlay'
      const panel = document.createElement('div')
      panel.className = 'panel'
      const title = document.createElement('h1')
      title.textContent = 'Choose your language / Choisissez votre langue'
      panel.appendChild(title)
      const hint = document.createElement('p')
      hint.className = 'panel-hint'
      hint.textContent = 'This is only asked once. You can change it later in Options > Language.'
      panel.appendChild(hint)
      const options = [
        ['English', 'en'],
        ['Francais', 'fr']
      ]
      for (const [label, value] of options) {
        const btn = document.createElement('button')
        btn.textContent = label
        btn.onclick = () => {
          settingsRef.current.language = value
          settingsRef.current.languageChosen = true
          menu.settings.language = value
          menu.settings.languageChosen = true
          setLanguage(value)
          saveSettings(settingsRef.current)
          app.removeChild(overlay)
          resolve(value)
        }
        panel.appendChild(btn)
      }
      overlay.appendChild(panel)
      app.appendChild(overlay)
    })
  }

  function chooseLanguage() {
    if (settingsRef.current.languageChosen) {
      setLanguage(settingsRef.current.language)
      return Promise.resolve(settingsRef.current.language)
    }
    return showLanguagePopup()
  }

  function chooseDevice() {
    if (settingsRef.current.game.device) return Promise.resolve(settingsRef.current.game.device)
    return showDevicePopup()
  }

  return { showDevicePopup, showLanguagePopup, chooseLanguage, chooseDevice }
}

