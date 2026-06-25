export function normalizeWeather(value) {
  return String(value || 'clear')
}

export function defaultWeatherDuration(value) {
  const weather = normalizeWeather(value)
  if (weather === 'clear') return 240 + Math.random() * 420
  if (weather === 'storm' || weather === 'thunder') return 90 + Math.random() * 150
  return 120 + Math.random() * 240
}

export function resolveWeatherTimer(weather, durationSeconds = null) {
  if (durationSeconds == null) return defaultWeatherDuration(weather)
  return Math.max(0, Number(durationSeconds) || 0)
}

export function rollNextWeather(currentWeather = 'clear') {
  const r = Math.random()
  if (normalizeWeather(currentWeather) !== 'clear') return 'clear'
  if (r < 0.68) return 'clear'
  if (r < 0.9) return 'rain'
  return 'storm'
}
