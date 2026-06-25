const {
AIR, GRASS, DIRT, STONE, COBBLESTONE, SAND,
OAK_LOG, OAK_PLANKS, OAK_LEAVES, COAL_ORE, CRAFTING_TABLE, BED, LADDER, IRON_BLOCK, PUMPKIN, REDSTONE_DUST, REDSTONE_BLOCK, PISTON,
GLASS, CHEST, TORCH, FARMLAND
} = blockIds

const app = document.getElementById('app')

let settings = loadSettings()
const settingsRef = { current: settings }
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.video.pixelRatio))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x87ceeb)
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x87ceeb, 40, 120)

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000)

let atlas = buildAtlas()
const material = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true })
const transparentMaterial = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide})

const dayNight = new DayNightCycle(scene, renderer)
const heldItem = new HeldItem(renderer, atlas, material)
heldItem.resize(window.innerWidth, window.innerHeight)

function rebuildAtlas() {
  atlas = buildAtlas()
  material.map = atlas.texture
  material.needsUpdate = true
  transparentMaterial.map = atlas.texture
  transparentMaterial.needsUpdate = true
  heldItem.atlas = atlas
  heldItem.material.map = atlas.texture
  heldItem.material.needsUpdate = true
}

let world = null
let player = null
let input = null
let inventory = null
let inventoryUI = null
let craftingTableUI = null
let furnaceUI = null
let chestUI = null
let gamemode = null
let hotbar = null
let dropManager = null
let mobManager = null
let arrowManager = null
let pacificMobGen = null
let villageGen = null
let redstone = null
let blockModels = null
let attackCooldown = 0
let health = null
let healthUI = null
let chatUI = null
let activeWorldMeta = null
let gameStarted = false
let paused = false
let timeOfDay = 0
let weather = 'clear'
let weatherTimer = 0
let difficulty = 'normal'
let currentDimension = 'overworld'
let portalCooldown = 0
let portalHold = 0
let portalStillPosition = null
let portalTransitioning = false
let dimensionWorlds = new Map()
let dimensionEntityStates = new Map()
let dimensionSavedData = new Map()
const netherDimension = new Nether()
let frameTime = 1 / settings.video.maxFps
let autosaveTimer = null
let lastPlayerPos = null
let touchControls = null
let infoEl = null
let pauseOverlay = null
let deathOverlay = null
let weatherParticles = null
let nightVisionActive = false
let pauseButton = null
let currentDevice = DEVICE.DESKTOP
let multiplayerMode = 'solo'
let netSession = null
let remoteRenderers = null
let multiplayerStatus = ''
let pendingMultiplayerState = null
const menu = new MinecraftMenu(app)
applySettings(settings)

let prompts = null
let effectsManager = null
let effectsUI = null
let achievementManager = null

const CREATIVE_BLOCKS = [STONE, COBBLESTONE, DIRT, GRASS, SAND, OAK_LOG, OAK_PLANKS, OAK_LEAVES, COAL_ORE, CRAFTING_TABLE, BED, GLASS, CHEST, TORCH, BOW, ARROW]
function fillCreativeInventory() {
  inventory.clear()
  for (const id of CREATIVE_BLOCKS) {
    const def = getThing(id)
    inventory.addItem(id, def ? def.stackSize : 64)
  }
}
function applyGamemodeInventory(mode) {
  if (mode !== GAME_MODE.CREATIVE) inventory.clear()
}
const breakOverlay = new BreakOverlay(scene)

function dropInventoryContents() {
  if (!inventory || !dropManager || !player) return
  const p = player.position
  for (let i = 0; i < inventory.slots.length; i++) {
    const slot = inventory.slots[i]
    if (!slot || !slot.id || !slot.count) continue
    dropManager.spawn(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.5, p.z + (Math.random() - 0.5) * 0.4, slot.id, slot.count)
    inventory.slots[i] = null
  }
  inventory.emit()
}

function recordItemPickupAchievement(id, count = 1) {
  if (!achievementManager) return
  const thing = getThing(id)
  if (thing?.name) achievementManager.recordItemPickup(thing.name, count)
}

function recordBlockBreakAchievement(id) {
  if (!achievementManager) return
  const name = blocks[id]?.name
  if (name) achievementManager.recordBlockBreak(name)
}

function recordBlockPlaceAchievement(id) {
  if (!achievementManager) return
  const name = blocks[id]?.name
  if (name) achievementManager.recordBlockPlace(name)
}

let breakTimer = null
let currentBreakTarget = null
function configureBreakTimer() {
  breakTimer = new BreakTimer(world, player, raycastVoxel)
  breakTimer.setGamemode(gamemode)
  breakTimer.onProgress = (ratio, target) => {
    breakOverlay.update(ratio, target)
  }
  breakTimer.onBroken = (x, y, z, id) => {
    sounds.playBreak()
    const breakHeld = hotbar?.selectedStack ? hotbar.selectedStack() : null
    const ev = emitModEvent(new BlockBreakEvent({ x, y, z, blockId: id, face: currentBreakTarget?.face || null, heldItem: breakHeld ? { ...breakHeld } : null }), { player, inventory, health, world })
    if (ev.cancelled) return
    recordBlockBreakAchievement(id)
    breakOverlay.hide()
    world.settleAbove(x, y, z)
    if (blockModels) blockModels.sync(x, y, z)
    if (redstone) redstone.onBlockChanged(x, y, z)
    if (blocks[id]?.name === 'chest') {
      if (chestUI?.open && globalThis.__currentChestLocation) {
        const [cx, cy, cz] = globalThis.__currentChestLocation
        const isSelf = cx === x && cy === y && cz === z
        let isPaired = false
        if (world && typeof world.getPairedChest === 'function') {
          const paired = world.getPairedChest(cx, cy, cz)
          if (paired && paired.x === x && paired.y === y && paired.z === z) {
            isPaired = true
          }
        }
        if (isSelf || isPaired) {
          chestUI.close()
        }
      }

      const key = `${x},${y},${z}`
      const removedTile = typeof world.consumeRemovedTileEntity === 'function' ? world.consumeRemovedTileEntity(x, y, z) : null
      const inv = world.chests.get(key) || removedTile?.inventory
      if (inv) {
        for (const slot of inv.slots) {
          if (slot && slot.id && slot.count > 0) {
            dropManager.spawn(x + 0.5, y + 0.5, z + 0.5, slot.id, slot.count)
          }
        }
        world.chests.delete(key)
      }
    }
    if (netSession) {
      if (multiplayerMode === 'host' && typeof netSession.breakBlock === 'function') netSession.breakBlock(x, y, z)
      if (multiplayerMode === 'client' && typeof netSession.breakBlock === 'function') netSession.breakBlock(x, y, z)
    }
    if (!gamemode.dropsOnBreak()) return
    const def = blocks[id]
    const held = hotbar?.selectedStack ? hotbar.selectedStack() : null
    const heldThing = held ? getThing(held.id) : null
    const hasCorrectTool = def && (!def.tool || (heldThing?.category === 'tool' && heldThing.toolKind === def.tool))
    // Only pickaxe-required blocks need the exact tool to drop (ores, stone, etc.)
    if (def?.tool === 'pickaxe' && !hasCorrectTool) return
    let dropId = id
    if (def && def.drops) {
      const drop = blocksByName.get(def.drops)
      if (drop) dropId = drop.id
    } else if (def && def.drops === null) {
      return
    }
    dropManager.spawnFromBreak(x, y, z, dropId)
  }
}

function requestRemoteBreak() {
  if (multiplayerMode !== 'client' || !netSession || typeof netSession.breakRay !== 'function') return false
  netSession.breakRay(player)
  return true
}

function handleCraftingTableClose(leftovers) {
  if (!leftovers || !leftovers.length) return
  for (const item of leftovers) {
    if (!item || !item.count) continue
    const remaining = inventory.addItem(item.id, item.count)
    if (remaining > 0) {
      const p = player.position
      dropManager.spawn(p.x, p.y + 0.5, p.z, item.id, remaining)
    }
  }
}

function isAnyInventoryOpen() {
  return !!(inventoryUI?.open || craftingTableUI?.open || furnaceUI?.open || chestUI?.open)
}

function getPlayerStorageKey() {
  if (multiplayerMode === 'client') return netSession?.id || netSession?.clientId || 'client'
  if (multiplayerMode === 'host') return 'host'
  return 'singleplayer'
}

function tryOpenCraftingTable() {
  if (isAnyInventoryOpen()) return false
  if (player.sneaking) return false
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit) return false
  const id = world.getBlock(hit.block.x, hit.block.y, hit.block.z)
  if (id !== CRAFTING_TABLE) return false
  const held = hotbar?.selectedStack ? hotbar.selectedStack() : null
  const rightEv = emitModEvent(new PlayerRightClickBlockEvent(player, { x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: id, face: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null, heldItem: held ? { ...held } : null, action: 'crafting_table' }), { player, inventory, health, world })
  if (rightEv.cancelled) return false
  const ev = emitModEvent(new PlayerInteractEvent(player, { type: 'crafting_table', x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: id }), { player, inventory, health, world })
  if (ev.cancelled) return false
  if (inventoryUI.open) inventoryUI.toggle()
  achievementManager?.recordCraftingTableUse()
  craftingTableUI.show()
  return true
}

function tryOpenFurnace() {
  if (isAnyInventoryOpen()) return false
  if (player.sneaking) return false
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit) return false
  const id = world.getBlock(hit.block.x, hit.block.y, hit.block.z)
  if (blocks[id]?.name !== 'furnace') return false
  const held = hotbar?.selectedStack ? hotbar.selectedStack() : null
  const rightEv = emitModEvent(new PlayerRightClickBlockEvent(player, { x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: id, face: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null, heldItem: held ? { ...held } : null, action: 'furnace' }), { player, inventory, health, world })
  if (rightEv.cancelled) return false
  const ev = emitModEvent(new PlayerInteractEvent(player, { type: 'furnace', x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: id }), { player, inventory, health, world })
  if (ev.cancelled) return false
  if (inventoryUI.open) inventoryUI.toggle()
  furnaceUI.show()
  return true
}

function tryOpenChest() {
  if (isAnyInventoryOpen()) return false
  if (player.sneaking) return false
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit) return false
  const { x, y, z } = hit.block
  const id = world.getBlock(x, y, z)
  const blockName = blocks[id]?.name
  if (blockName !== 'chest' && blockName !== 'ender_chest') return false
  const held = hotbar?.selectedStack ? hotbar.selectedStack() : null
  const rightEv = emitModEvent(new PlayerRightClickBlockEvent(player, { x, y, z, blockId: id, face: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null, heldItem: held ? { ...held } : null, action: blockName }), { player, inventory, health, world })
  if (rightEv.cancelled) return false
  const ev = emitModEvent(new PlayerInteractEvent(player, { type: 'chest', x, y, z, blockId: id }), { player, inventory, health, world })
  if (ev.cancelled) return false
  mobManager?.angerMobsNear?.('piglin', x, y, z, 16)
  if (inventoryUI.open) inventoryUI.toggle()
  const isEnderChest = blockName === 'ender_chest'

  if (isEnderChest) {
    const inv = world.getEnderChestInventory(getPlayerStorageKey())
    inv.isOpen = true
    chestUI.show(inv)
    chestUI.onSlotChange = null
    chestUI.onClose = (leftovers) => {
      inv.isOpen = false
      handleCraftingTableClose(leftovers)
    }
    return true
  }

  if (multiplayerMode === 'client' && netSession) {
    globalThis.__currentChestLocation = [x, y, z]
    globalThis.__openChestUI = (inv) => {
      inv.isOpen = true
      chestUI.show(inv)
      chestUI.onSlotChange = (index, slot) => {
        netSession.updateChestSlot(x, y, z, index, slot)
      }
      chestUI.onClose = (leftovers) => {
        netSession.closeChest(x, y, z)
        globalThis.__currentChestLocation = null
        globalThis.__openChestUI = null
        inv.isOpen = false
        handleCraftingTableClose(leftovers)
      }
    }
    netSession.openChest(x, y, z)
  } else {
    const inv = world.getChestInventory(x, y, z)
    inv.isOpen = true
    globalThis.__currentChestLocation = [x, y, z]
    if (multiplayerMode === 'host' && netSession) {
      netSession.broadcast({ t: MSG.CHEST_OPEN, x, y, z })
    }
    chestUI.show(inv)
    chestUI.onSlotChange = (index, slot) => {
      if (multiplayerMode === 'host' && netSession) {
        netSession.broadcast({ t: MSG.CHEST_UPDATE, x, y, z, index, slot })
      }
    }
    chestUI.onClose = (leftovers) => {
      globalThis.__currentChestLocation = null
      let hasViewers = false
      if (multiplayerMode === 'host' && netSession) {
        const viewers = netSession.chestViewers?.get(`${x},${y},${z}`)
        if (viewers && viewers.size > 0) hasViewers = true
      }
      if (!hasViewers) {
        inv.isOpen = false
        if (multiplayerMode === 'host' && netSession) {
          netSession.broadcast({ t: MSG.CHEST_CLOSE, x, y, z })
        }
      }
      handleCraftingTableClose(leftovers)
    }
  }
  return true
}

function tryPickBlock() {
  if (!gamemode.isCreative()) return
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit) return
  const blockId = world.getBlock(hit.block.x, hit.block.y, hit.block.z)
  if (blockId === AIR || blockId === 0) return

  for (let i = 0; i < 9; i++) {
    const stack = inventory.slots[i]
    if (stack && stack.id === blockId) {
      hotbar.select(i)
      return
    }
  }

  for (let i = 9; i < inventory.size; i++) {
    const stack = inventory.slots[i]
    if (stack && stack.id === blockId) {
      const selectedIndex = hotbar.selected
      const temp = inventory.slots[selectedIndex]
      inventory.slots[selectedIndex] = stack
      inventory.slots[i] = temp
      inventory.emit()
      return
    }
  }

  const selectedIndex = hotbar.selected
  inventory.slots[selectedIndex] = { id: blockId, count: 64 }
  inventory.emit()
}

