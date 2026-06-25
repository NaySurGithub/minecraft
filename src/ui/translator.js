import { messages } from './messages.js'

let currentLanguage = 'fr'

export function setLanguage(language) {
  currentLanguage = messages[language] ? language : 'fr'
}

export function getLanguage() {
  return currentLanguage
}

export function t(key) {
  return messages[currentLanguage]?.[key] || messages.fr[key] || key
}

export function formatDate(value) {
  if (!value) return t('never')
  return new Date(value).toLocaleString(currentLanguage === 'en' ? 'en-US' : 'fr-FR')
}
