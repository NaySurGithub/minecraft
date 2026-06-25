import { getThingByName } from '../items/itemRegistry.js'

const handlers = new Map()
const packetHandlers = new Map()

export function clearModEventHandlers() {
  handlers.clear()
  packetHandlers.clear()
}

export function registerModEvents(manifest) {
  for (const entry of manifest.events || []) {
    if (!entry || !entry.event) continue
    const list = handlers.get(entry.event) || []
    list.push({ mod: manifest.name, actions: entry.actions || [] })
    handlers.set(entry.event, list)
  }
  for (const entry of manifest.packets || []) {
    if (!entry || !entry.type) continue
    const list = packetHandlers.get(entry.type) || []
    list.push({ mod: manifest.name, handler: entry })
    packetHandlers.set(entry.type, list)
  }
}

export function runModActions(actions, context = {}) {
  for (const action of actions || []) runAction(action, { cancel() {} }, context)
}

function runAction(action, event, context) {
  if (!action || !action.type) return
  const detail = event?.detail || event?.data || null
  if (action.type === 'cancel') event.cancel()
  if (action.type === 'cancelIf' && detail && typeof detail === 'object') {
    const value = action.field ? action.field.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), detail) : undefined
    if (String(value) === String(action.equals)) event.cancel()
    if (Array.isArray(action.oneOf) && action.oneOf.some((v) => String(v) === String(value))) event.cancel()
  }
  if (action.type === 'setPacketPayload' && detail && typeof detail === 'object') {
    Object.assign(detail, action.payload || {})
  }
  if (action.type === 'replacePacket' && detail && typeof detail === 'object' && action.packetType) {
    detail.t = action.packetType
    if (action.payload && typeof action.payload === 'object') Object.assign(detail, action.payload)
  }
  if (action.type === 'setPlayerState' && event.player) {
    Object.assign(event.player, action.state || {})
  }
  if (action.type === 'setVelocity' && event.player?.velocity) {
    const v = action.velocity || {}
    if (typeof v.x === 'number') event.player.velocity.x = v.x
    if (typeof v.y === 'number') event.player.velocity.y = v.y
    if (typeof v.z === 'number') event.player.velocity.z = v.z
  }
  if (action.type === 'giveItem' && context.inventory) {
    const item = getThingByName(action.item)
    if (item) context.inventory.addItem(item.id, action.count || 1)
  }
  if (action.type === 'damage' && context.health) context.health.damage(action.amount || 1)
  if (action.type === 'heal' && context.health) context.health.heal(action.amount || 1)
  if (action.type === 'message') console.info('[Mod]', action.text || '')
  if (action.type === 'emitPacket' && context.sendPacket) {
    context.sendPacket(action.packetType, action.payload || {})
  }
  if (action.type === 'giveTargetItem' && context.giveTargetItem) {
    const target = action.target || action.player || action.name || context.targetNames?.[0] || context.playerName || '@s'
    const payload = detail || {}
    const itemId = action.itemId || action.item || action.id || payload.itemId || payload.item || payload.id || payload.args?.[1]
    const count = action.count || payload.count || Number(payload.args?.[2]) || 1
    if (itemId) context.giveTargetItem(target, itemId, count)
  }
  if (context.capabilities && typeof context.capabilities[action.type] === 'function') {
    context.capabilities[action.type](action, event, context)
  }
}

export function emitModEvent(event, context = {}) {
  const list = handlers.get(event.type) || []
  for (const handler of list) {
    for (const action of handler.actions) runAction(action, event, context)
  }
  const packetList = packetHandlers.get(event.type) || []
  for (const handler of packetList) {
    for (const action of handler.handler?.actions || []) runAction(action, event, context)
  }
  return event
}

export function emitModPacket(type, payload = {}, context = {}) {
  const list = [...(packetHandlers.get('*') || []), ...(packetHandlers.get(type) || [])]
  const packetEvent = { type, detail: payload, cancel: () => { packetEvent.cancelled = true }, cancelled: false }
  for (const handler of list) {
    const actions = handler.handler?.actions || []
    for (const action of actions) runAction(action, packetEvent, context)
  }
  if (packetEvent.cancelled) return packetEvent
  if (context.onPacket) context.onPacket(type, payload)
  return packetEvent
}

export function hasModPacketHandler(type) {
  return packetHandlers.has(type)
}
