import { mobDefsByType } from '../../packages/game-core/src/content.js'

export function getMobDefaults(type) {
  return mobDefsByType?.[type] || null
}

export function applyMobDefaults(mob, type) {
  const def = getMobDefaults(type)
  if (!mob || !def) return def || null
  if (typeof def.health === 'number') {
    mob.maxHealth = def.health
    mob.health = Math.min(mob.health ?? def.health, def.health)
  }
  if (typeof def.walkSpeed === 'number') mob.walkSpeed = def.walkSpeed
  if (typeof def.half === 'number') mob.half = def.half
  if (typeof def.height === 'number') mob.height = def.height
  if (Array.isArray(def.drops)) mob.drops = def.drops
  mob.sharedMobDef = def
  return def
}
