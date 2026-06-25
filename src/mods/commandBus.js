import { getThingByName } from '../items/itemRegistry.js'
import { blocksByName } from '../blocks/registry.js'
import { runModActions, emitModPacket } from './eventBus.js'
import { makeRng } from '../world/noise.js'
import { EFFECT_IDS } from '../effects/effectsManager.js'

const commands = new Map()

export function clearModCommands() {
  commands.clear()
}

export function registerModCommands(manifest) {
  for (const cmd of manifest.commands || []) {
    if (!cmd || !cmd.name) continue
    commands.set(String(cmd.name).toLowerCase(), { mod: manifest.name, command: cmd })
    for (const alias of cmd.aliases || []) {
      commands.set(String(alias).toLowerCase(), { mod: manifest.name, command: cmd })
    }
  }
}

export function listRegisteredCommands() {
  const out = []
  for (const [name, entry] of commands.entries()) {
    const cmd = entry.command
    if (!cmd || out.some((x) => x.name === name)) continue
    out.push({
      name,
      description: cmd.description || '',
      mod: entry.mod || ''
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

function parseAmount(value, fallback = 1) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseCoord(val, current) {
  if (val.startsWith('~')) {
    const offset = val.slice(1) === '' ? 0 : Number(val.slice(1))
    return current + (isNaN(offset) ? 0 : offset)
  }
  return Number(val)
}

function resolveTargets(selector, context) {
  const players = typeof context.getPlayers === 'function' ? context.getPlayers() : []
  const selfName = context.playerName || 'Player1'
  if (!selector || selector === '@s') return [selfName]
  if (selector === '@a') return players.length ? players.map((p) => p.name).filter(Boolean) : [selfName]
  if (selector.startsWith('@')) {
    const matches = players.map((p) => p.name).filter(Boolean)
    return matches.length ? matches : [selfName]
  }
  const exact = players.find((p) => String(p.name || '').toLowerCase() === String(selector).toLowerCase())
  return exact ? [exact.name] : []
}

function executeRegisteredCommand(entry, args, context) {
  const cmd = entry.command
  if (cmd.type === 'help') {
    const list = listRegisteredCommands()
    const names = list.length ? list.map((c) => (c.description ? `/${c.name} - ${c.description}` : `/${c.name}`)).join(' | ') : 'No commands registered.'
    return { ok: true, message: cmd.success || names }
  }
  if (cmd.actions && cmd.actions.length) {
    const targets = resolveTargets(args[0], context)
    const targetContext = { ...context }
    if (targets.length) targetContext.targetNames = targets
    runModActions(cmd.actions, targetContext)
    return { ok: true, message: cmd.success || `${cmd.name} executed.` }
  }
  if (cmd.packet) {
    const targets = resolveTargets(args[0], context)
    const payload = {
      args,
      targets,
      target: targets[0] || null,
      reason: args.slice(1).join(' ') || cmd.packet.reason || ''
    }
    if (context.sendPacket) {
      context.sendPacket(cmd.packet.type, payload)
      return { ok: true, message: cmd.success || `${cmd.name} sent.` }
    }
    emitModPacket(cmd.packet.type, payload, context)
    return { ok: true, message: cmd.success || `${cmd.name} sent.` }
  }
  return { ok: false, message: 'Error: Command has no actions.' }
}

function parseTimeValue(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'day') return 1000
  if (v === 'noon') return 6000
  if (v === 'night') return 18000
  if (v === 'midnight') return 18000
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return ((Math.floor(n) % 24000) + 24000) % 24000
}

function normalizeResourceName(name) {
  return String(name || '').trim().toLowerCase().replace(/^minecraft:/, '').replace(/-/g, '_')
}

function opRequired(context) {
  return context.isOp === true ? null : { ok: false, message: 'Error: You do not have permission to use commands.' }
}

function getExecPosition(context) {
  const p = context.player?.position || context.player || {}
  return {
    x: Number.isFinite(p.x) ? p.x : 0,
    y: Number.isFinite(p.y) ? p.y : 80,
    z: Number.isFinite(p.z) ? p.z : 0
  }
}

function parseCommandCoords(args, context, start = 0) {
  const pos = getExecPosition(context)
  const x = parseCoord(args[start], pos.x)
  const y = parseCoord(args[start + 1], pos.y)
  const z = parseCoord(args[start + 2], pos.z)
  if (![x, y, z].every(Number.isFinite)) return null
  return { x, y, z }
}

function resolveThing(name) {
  return getThingByName(normalizeResourceName(name))
}

function resolveBlock(name) {
  return blocksByName.get(normalizeResourceName(name)) || null
}

function findVillage(context, maxRadius = 150) {
  const villageGen = context.villageGen
  const execPlayer = context.player
  if (!villageGen || !execPlayer) return null
  const pcx = Math.floor(getExecPosition(context).x / 16)
  const pcz = Math.floor(getExecPosition(context).z / 16)
  const VILLAGE_CHANCE = 0.007
  for (let r = 0; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const cx = pcx + dx
        const cz = pcz + dz
        const rng = makeRng(villageGen.seedHash + ':village:' + cx + ':' + cz)
        if (rng() < VILLAGE_CHANCE) {
          const x = cx * 16 + 8
          const z = cz * 16 + 8
          const surface = typeof villageGen.findSurface === 'function' ? villageGen.findSurface(x, z) : null
          return { cx, cz, x, y: surface ? surface.y + 2 : 80, z }
        }
      }
    }
  }
  return null
}

function generateVillageAt(context, found) {
  const world = context.world
  const villageGen = context.villageGen
  if (!world || !villageGen || !found) return false
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const chunk = world.ensureChunk(found.cx + dx, found.cz + dz)
      const key = `${found.cx + dx},${found.cz + dz}`
      if (!villageGen.processed.has(key)) {
        villageGen.processed.add(key)
        villageGen.populateChunk(chunk)
      }
    }
  }
  return true
}

const baseCommands = new Map()

function registerBaseCommand(name, description, handler, aliases = []) {
  const entry = { name, description, handler }
  baseCommands.set(name, entry)
  for (const alias of aliases) baseCommands.set(alias, entry)
}

function listBaseCommands() {
  const seen = new Set()
  const out = []
  for (const entry of baseCommands.values()) {
    if (seen.has(entry.name)) continue
    seen.add(entry.name)
    out.push(`/${entry.name}${entry.description ? ` - ${entry.description}` : ''}`)
  }
  return out.sort()
}

registerBaseCommand('op', 'grant operator', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const targetUser = parts[0]
  if (!targetUser) return { ok: false, message: 'Error: Usage: /op <player_name>' }
  if (typeof context.opPlayer !== 'function') return { ok: false, message: 'Error: Cannot op players in this mode.' }
  return context.opPlayer(targetUser)
    ? { ok: true, message: `Opped player: ${targetUser}` }
    : { ok: false, message: `Error: Player "${targetUser}" not found.` }
})

registerBaseCommand('deop', 'remove operator', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const targetUser = parts[0]
  if (!targetUser) return { ok: false, message: 'Error: Usage: /deop <player_name>' }
  if (typeof context.deopPlayer !== 'function') return { ok: false, message: 'Error: Cannot deop players in this mode.' }
  return context.deopPlayer(targetUser)
    ? { ok: true, message: `De-opped player: ${targetUser}` }
    : { ok: false, message: `Error: Player "${targetUser}" not found.` }
})

registerBaseCommand('gamemode', 'set game mode', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const modeStr = (parts[0] || '').toLowerCase()
  const mode = ({ creative: 'creative', c: 'creative', '1': 'creative', survival: 'survival', s: 'survival', '0': 'survival', spectator: 'spectator', sp: 'spectator', '3': 'spectator' })[modeStr]
  if (!mode) return { ok: false, message: 'Error: Usage: /gamemode <survival/creative/spectator>' }
  if (typeof context.setGamemode !== 'function') return { ok: false, message: 'Error: Cannot set game mode in this context.' }
  context.setGamemode(mode)
  return { ok: true, message: `Game mode set to ${mode[0].toUpperCase()}${mode.slice(1)}` }
}, ['gm'])

registerBaseCommand('time', 'set day/night time', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const sub = (parts[0] || '').toLowerCase()
  if (sub !== 'set') return { ok: false, message: 'Error: Usage: /time set <day|night|noon|midnight|ticks>' }
  const ticks = parseTimeValue(parts[1])
  if (ticks == null) return { ok: false, message: 'Error: Usage: /time set <day|night|noon|midnight|ticks>' }
  if (typeof context.setTimeOfDay !== 'function') return { ok: false, message: 'Error: Cannot set time in this context.' }
  context.setTimeOfDay(ticks)
  return { ok: true, message: `Time set to ${ticks}` }
})

registerBaseCommand('tp', 'teleport', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  if (parts.length < 3) return { ok: false, message: 'Usage: /tp <x> <y> <z> [player]' }
  const coords = parseCommandCoords(parts, context, 0)
  if (!coords) return { ok: false, message: 'Error: Invalid coordinates.' }
  const selector = parts[3] || '@s'
  const targets = resolveTargets(selector, context)
  if (!targets.length) return { ok: false, message: `Error: No target found for "${selector}"` }
  const execPlayer = context.player
  if (typeof context.teleportTargets === 'function') {
    context.teleportTargets(targets, coords.x, coords.y, coords.z)
  } else if (execPlayer?.position && (selector === '@s' || selector === '@a')) {
    execPlayer.position.set(coords.x, coords.y, coords.z)
    execPlayer.velocity?.set(0, 0, 0)
  }
  return { ok: true, message: `Teleported ${targets.join(', ')} to ${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}, ${coords.z.toFixed(1)}` }
})

registerBaseCommand('structure', 'generate structures', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const sub = (parts[0] || '').toLowerCase()
  if (sub !== 'village') return { ok: false, message: 'Usage: /structure village [player]' }
  if (!context.world || !context.villageGen || !context.player) return { ok: false, message: 'Error: World references unavailable.' }
  const found = findVillage(context)
  if (!found) return { ok: false, message: 'Error: No village found within 150 chunks.' }
  generateVillageAt(context, found)
  const selector = parts[1] || '@s'
  const targets = resolveTargets(selector, context)
  if (!targets.length) return { ok: false, message: `Error: No target found for "${selector}"` }
  if (typeof context.teleportTargets === 'function') context.teleportTargets(targets, found.x, found.y, found.z)
  else if (context.player?.position) {
    context.player.position.set(found.x, found.y, found.z)
    context.player.velocity?.set(0, 0, 0)
  }
  return { ok: true, message: `Found/Generated village at ${found.x}, ${found.y}, ${found.z}. Teleported ${targets.join(', ')}.` }
})

registerBaseCommand('locate', 'find nearest structure', (parts, context) => {
  const target = (parts[0] || '').toLowerCase()
  if (target !== 'village') return { ok: false, message: 'Usage: /locate village' }
  if (!context.villageGen || !context.player) return { ok: false, message: 'Error: World references unavailable.' }
  const found = findVillage(context)
  if (!found) return { ok: false, message: 'Error: No village found within 150 chunks.' }
  return { ok: true, message: `Nearest village is at ${found.x}, ${found.y}, ${found.z}` }
})

registerBaseCommand('stats', 'show world stats', (_parts, context) => {
  const stats = typeof context.getStats === 'function' ? context.getStats() : context.stats
  if (!stats) return { ok: false, message: 'Error: Stats unavailable.' }
  const parts = [
    `blocks broken: ${stats.blocksBroken || 0}`,
    `blocks placed: ${stats.blocksPlaced || 0}`,
    `items picked up: ${stats.itemsPickedUp || 0}`,
    `mobs killed: ${stats.mobsKilled || 0}`,
    `portals: ${stats.portalsCreated || 0}`,
    `travels: ${stats.dimensionTravels || 0}`,
    `achievements: ${stats.achievementsUnlocked || 0}`
  ]
  return { ok: true, message: `Stats - ${parts.join(', ')}` }
})

registerBaseCommand('give', 'give an item', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  if (!parts[0]) return { ok: false, message: 'Usage: /give [player] <item> [count]' }
  let selector = '@s'
  let itemName = parts[0]
  let countArg = parts[1]
  if (parts[1] && !resolveThing(parts[0])) {
    selector = parts[0]
    itemName = parts[1]
    countArg = parts[2]
  }
  const thing = resolveThing(itemName)
  if (!thing) return { ok: false, message: `Error: Unknown item "${itemName}".` }
  const count = Math.max(1, Math.min(6400, Math.floor(parseAmount(countArg, 1))))
  const targets = resolveTargets(selector, context)
  if (!targets.length) return { ok: false, message: `Error: No target found for "${selector}"` }
  let given = 0
  for (const target of targets) {
    if (typeof context.giveTargetItem === 'function') {
      if (context.giveTargetItem(target, thing.id, count)) given++
    } else if ((target === (context.playerName || 'Player1') || target === '@s') && context.inventory?.addItem) {
      context.inventory.addItem(thing.id, count)
      given++
    }
  }
  if (!given) return { ok: false, message: 'Error: Cannot give items in this context.' }
  return { ok: true, message: `Gave ${count} ${thing.name || itemName} to ${targets.join(', ')}.` }
})

registerBaseCommand('setblock', 'set a block', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  if (parts.length < 4) return { ok: false, message: 'Usage: /setblock <x> <y> <z> <block>' }
  const coords = parseCommandCoords(parts, context, 0)
  if (!coords) return { ok: false, message: 'Error: Invalid coordinates.' }
  const block = resolveBlock(parts[3])
  if (!block) return { ok: false, message: `Error: Unknown block "${parts[3]}".` }
  if (!context.world?.setBlock) return { ok: false, message: 'Error: World reference unavailable.' }
  context.world.setBlock(Math.floor(coords.x), Math.floor(coords.y), Math.floor(coords.z), block.id)
  if (typeof context.syncBlock === 'function') context.syncBlock(Math.floor(coords.x), Math.floor(coords.y), Math.floor(coords.z), block.id)
  return { ok: true, message: `Set block at ${Math.floor(coords.x)}, ${Math.floor(coords.y)}, ${Math.floor(coords.z)} to ${block.name}.` }
})

registerBaseCommand('summon', 'spawn a mob', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const mobType = normalizeResourceName(parts[0])
  if (!mobType) return { ok: false, message: 'Usage: /summon <mob> [x y z]' }
  if (!context.mobManager?.spawn) return { ok: false, message: 'Error: Mob system unavailable.' }
  const coords = parts.length >= 4 ? parseCommandCoords(parts, context, 1) : getExecPosition(context)
  if (!coords) return { ok: false, message: 'Error: Invalid coordinates.' }
  const mob = context.mobManager.spawn(mobType, coords.x, coords.y, coords.z)
  if (!mob) return { ok: false, message: `Error: Unknown mob "${mobType}".` }
  return { ok: true, message: `Summoned ${mobType} at ${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}, ${coords.z.toFixed(1)}.` }
})

registerBaseCommand('weather', 'set weather', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const weather = (parts[0] || '').toLowerCase()
  if (!['clear', 'rain', 'storm', 'thunder'].includes(weather)) return { ok: false, message: 'Usage: /weather <clear|rain|storm|thunder>' }
  if (typeof context.setWeather === 'function') context.setWeather(weather)
  else if (context.world) context.world.weather = weather
  else return { ok: false, message: 'Error: Weather unavailable.' }
  return { ok: true, message: `Weather set to ${weather}.` }
})

registerBaseCommand('difficulty', 'set difficulty', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const difficulty = (parts[0] || '').toLowerCase()
  if (!['peaceful', 'easy', 'normal', 'hard'].includes(difficulty)) return { ok: false, message: 'Usage: /difficulty <peaceful|easy|normal|hard>' }
  if (typeof context.setDifficulty === 'function') context.setDifficulty(difficulty)
  else if (context.world) context.world.difficulty = difficulty
  else return { ok: false, message: 'Error: Difficulty unavailable.' }
  return { ok: true, message: `Difficulty set to ${difficulty}.` }
})

registerBaseCommand('effect', 'manage effects', (parts, context) => {
  const denied = opRequired(context)
  if (denied) return denied
  const sub = (parts[0] || '').toLowerCase()
  const effectsMgr = context.effectsManager
  if (!effectsMgr) return { ok: false, message: 'Error: Effects system unavailable.' }
  if (sub === 'add') {
    const effectId = (parts[1] || '').toLowerCase()
    if (!effectId) return { ok: false, message: 'Usage: /effect add <effect_id> [duration_seconds] [magnitude]' }
    if (!EFFECT_IDS.includes(effectId)) return { ok: false, message: `Unknown effect: "${effectId}". Available: ${EFFECT_IDS.join(', ')}` }
    const duration = parseAmount(parts[2], 30)
    const magnitude = Math.max(1, Math.floor(parseAmount(parts[3], 1)))
    effectsMgr.addEffect(effectId, duration, magnitude)
    return { ok: true, message: `Applied effect "${effectId}" for ${duration}s (level ${magnitude}).` }
  }
  if (sub === 'remove') {
    const effectId = (parts[1] || '').toLowerCase()
    if (!effectId) return { ok: false, message: 'Usage: /effect remove <effect_id>' }
    const removed = effectsMgr.removeEffect(effectId)
    return removed ? { ok: true, message: `Removed effect "${effectId}".` } : { ok: false, message: `Effect "${effectId}" was not active.` }
  }
  if (sub === 'clear') {
    effectsMgr.clearAll()
    return { ok: true, message: 'All effects cleared.' }
  }
  if (sub === 'list') {
    if (!effectsMgr.effects.length) return { ok: true, message: 'No active effects.' }
    const list = effectsMgr.effects.map(e => `${e.id} (lvl ${e.magnitude}, ${Math.ceil(e.remaining)}s)`).join(', ')
    return { ok: true, message: `Active effects: ${list}` }
  }
  return { ok: false, message: 'Usage: /effect <add|remove|clear|list> [args]' }
})

registerBaseCommand('kill', 'kill entities', (parts, context) => {
  const targets = parts.length ? resolveTargets(parts[0], context) : [context.playerName || 'Player1']
  const hasTargetArg = parts.length > 0
  const needsOp = hasTargetArg && (parts[0].startsWith('@') || parts[0] !== (context.playerName || 'Player1'))
  if (needsOp) {
    const denied = opRequired(context)
    if (denied) return denied
  }
  if (typeof context.damageTargets === 'function') {
    context.damageTargets(targets, 9999)
    return { ok: true, message: `Killed ${targets.join(', ')}.` }
  }
  if (!hasTargetArg && context.health) {
    context.health.damage(context.health.maxHp)
    return { ok: true, message: 'Killed yourself.' }
  }
  return { ok: false, message: 'Error: Cannot kill targets in this context.' }
})

registerBaseCommand('help', 'list commands', (_parts, _context) => {
  const modCommands = listRegisteredCommands().map((c) => `/${c.name}${c.description ? ` - ${c.description}` : ''}`)
  return { ok: true, message: [...listBaseCommands(), ...modCommands].join(' | ') }
})

export function executeChatCommand(line, context = {}) {
  const raw = String(line || '').trim()
  if (!raw.startsWith('/')) return { ok: false, message: 'Not a command.' }
  const body = raw.slice(1).trim()
  if (!body) return { ok: false, message: 'Empty command.' }
  const parts = body.split(/\s+/)
  const name = parts.shift().toLowerCase()

  const base = baseCommands.get(name)
  if (base) return base.handler(parts, context)

  const entry = commands.get(name)
  if (!entry) return { ok: false, message: `Unknown command: ${name}` }
  return executeRegisteredCommand(entry, parts, context)
}
