export const DEBUG_TEXTURES = false
export const DEBUG_GENERATION = false

const seen = new Set()

export function debugLog(scope, message, data = null) {
  const label = `[DEBUG:${scope}] ${message}`
  if (data == null) console.log(label)
  else console.log(label, data)
}

export function debugOnce(key, scope, message, data = null) {
  if (seen.has(key)) return
  seen.add(key)
  debugLog(scope, message, data)
}

export function blockName(blocks, id) {
  return blocks[id]?.name || `unknown(${id})`
}
