function saveActiveWorld() {
  if (multiplayerMode === 'client') return
  if (!activeWorldMeta || !world || !player || !inventory) return
  emitModEvent(new WorldSaveEvent({ worldId: activeWorldMeta.id, name: activeWorldMeta.name }), { player, inventory, health, world })
  activeWorldMeta.gameMode = gamemode.get()
  activeWorldMeta.timeOfDay = timeOfDay
  activeWorldMeta.weather = weather
  activeWorldMeta.weatherTimer = weatherTimer
  activeWorldMeta.difficulty = difficulty
  activeWorldMeta.dimension = currentDimension
  activeWorldMeta.dimensions = collectDimensionSaveData()
  activeWorldMeta.achievements = achievementManager?.serialize ? achievementManager.serialize() : (activeWorldMeta.achievements || { stats: {}, unlocked: [] })
  const saved = saveWorld(activeWorldMeta, world, player, inventory, health, dropManager, mobManager, effectsManager)
  activeWorldMeta = {
    id: saved.id,
    name: saved.name,
    seed: saved.seed,
    gameMode: saved.gameMode,
    defaultGameMode: saved.defaultGameMode || saved.gameMode,
    multiplayerRoomCode: saved.multiplayerRoomCode,
    mods: saved.mods || [],
    keepInventory: !!saved.keepInventory,
    createdAt: saved.createdAt,
    openedAt: saved.openedAt,
    savedAt: saved.savedAt,
    hunger: saved.hunger,
    timeOfDay: saved.timeOfDay,
    weather: saved.weather || 'clear',
    weatherTimer: saved.weatherTimer == null ? 0 : saved.weatherTimer,
    difficulty: saved.difficulty || 'normal',
    dimension: saved.dimension || 'overworld',
    dimensions: saved.dimensions || {},
    achievements: saved.achievements || { stats: {}, unlocked: [] }
  }
}

function configureAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = null
  if (!settings.game.autosave) return
  autosaveTimer = setInterval(saveActiveWorld, settings.game.autosaveSeconds * 1000)
}

function saveAndQuitToMenu() {
  saveActiveWorld()
  emitModEvent(new LeaveEvent({ worldId: activeWorldMeta?.id || null, mode: multiplayerMode }), { player, inventory, health, world })
  if (netSession) netSession.destroy()
  if (remoteRenderers) remoteRenderers.clear()
  netSession = null
  remoteRenderers = null
  multiplayerMode = 'solo'
  multiplayerStatus = ''
  pendingMultiplayerState = null
  setPaused(false)
  gameStarted = false
  heldItem.setBlock(null)
  disposeAllWorldChunkMeshes()
  if (blockModels) blockModels.clear()
  if (mobManager) mobManager.clear()
  if (dropManager) dropManager.clear()
  if (arrowManager) arrowManager.clear()
  dimensionWorlds = new Map()
  dimensionEntityStates = new Map()
  dimensionSavedData = new Map()
  currentDimension = 'overworld'
  dayNight.setDimension(null)
  dayNight.setWeather(weather)
  dayNight.setNightVision(false)
  dayNight.update(timeOfDay)
  blockModels = null
  mobManager = null
  arrowManager = null
  pacificMobGen = null
  villageGen = null
  cleanupGameUi()
  menu.showMain(menuCallbacks)
}

function cleanupGameUi() {
  suffocationOverlay = null
  if (achievementManager) achievementManager.dispose()
  achievementManager = null
  for (const selector of ['#hotbar', '#crosshair', '#info', '#armor-bar', '#hearts', '#bubbles', '#food', '#joyzone', '#touchbuttons', '#pausebtn', '#chatbtn', '#chatoverlay', '#pauseoverlay', '#furnaceoverlay', '#chestoverlay', '#tableoverlay', '#invoverlay', '#deathoverlay', '#effects-hud', '#suffocation-overlay', '#achievement-popups']) {
    document.querySelectorAll(selector).forEach((node) => node.remove())
  }
  pauseOverlay = null
  pauseButton = null
  deathOverlay = null
  infoEl = null
  touchControls = null
  chatUI = null
  effectsManager = null
  effectsUI = null
  setModUiHost(null)
  clearModUis()
  app.classList.remove('mobile-device', 'game-paused')
}

function multiplayerContext() {
  return {
    get world() { return world },
    get player() { return player },
    get input() { return input },
    get inventory() { return inventory },
    get dropManager() { return dropManager },
    get mobManager() { return mobManager },
    get health() { return health },
    get chatUI() { return chatUI },
    get activeWorldMeta() { return activeWorldMeta },
    get villageGen() { return villageGen },
    getTimeOfDay: () => timeOfDay,
    getWeatherState,
    setTimeOfDay: (ticks) => {
      setTimeOfDay(ticks)
      saveActiveWorld()
      return true
    },
    setWeather: (value) => {
      setWeather(value)
      saveActiveWorld()
      return true
    },
    setDifficulty: (value) => {
      setDifficulty(value)
      saveActiveWorld()
      return true
    },
    getStats: () => achievementManager?.serialize().stats || null,
    applyMods: (mods) => {
      if (!mods || !mods.length) return
      applyModManifests(mods)
      rebuildAtlas()
      if (activeWorldMeta) activeWorldMeta.mods = mods
    },
    sendPacket: (type, payload) => {
      if (multiplayerMode === 'client') netSession?.sendModPacket?.(type, payload)
      else emitModPacket(type, payload, { isOp: true, playerName: 'Player1', player, inventory, health, world, capabilities: {} })
    },
    capabilities: {},
    applyWelcomeState: applyMultiplayerState,
    applyRemoteSnapshot: (snapshot, localId) => {
      if (typeof snapshot.timeOfDay === 'number') setTimeOfDay(snapshot.timeOfDay)
      if (snapshot.weather) setWeather(snapshot.weather, snapshot.weatherTimer)
      if (snapshot.difficulty) setDifficulty(snapshot.difficulty)
      if (!remoteRenderers) return
      remoteRenderers.syncPlayers(snapshot.players, localId)
      remoteRenderers.syncDrops(snapshot.drops)
      remoteRenderers.syncMobs(snapshot.mobs)
    }
  }
}

function describeNetError(err) {
  return err?.type || err?.message || String(err || t('multiplayerError'))
}

function applyMultiplayerState(state) {
  if (!state) return
  pendingMultiplayerState = state
  if (!player || !inventory || !health) return
  if (state.inventory) inventory.load(state.inventory)
  if (state.health) health.load(state.health)
  if (state.enderChests && world) applyEnderChestsToWorld(world, state.enderChests)
  if (state.player) {
    player.position.set(state.player.x || 0, state.player.y || 0, state.player.z || 0)
    player.velocity.set(0, 0, 0)
    player.fallStartY = player.position.y
    if (typeof state.player.yaw === 'number') player.yaw = state.player.yaw
    if (typeof state.player.pitch === 'number') player.pitch = state.player.pitch
  }
}

function applyLoadedState(data) {
  if (!data) return
  if (data.inventory) inventory.load(data.inventory)
  if (data.health) health.load(data.health)
  if (data.playerPos) {
    player.position.set(data.playerPos.x, data.playerPos.y, data.playerPos.z)
    player.velocity.set(0, 0, 0)
    player.fallStartY = player.position.y
  }
  if (typeof data.yaw === 'number') player.yaw = data.yaw
  if (typeof data.pitch === 'number') player.pitch = data.pitch
  if (typeof data.timeOfDay === 'number') setTimeOfDay(data.timeOfDay)
  if (data.weather) setWeather(data.weather, data.weatherTimer)
  if (data.difficulty) setDifficulty(data.difficulty)
  if (data.dimension && activeWorldMeta) activeWorldMeta.dimension = data.dimension
  // Effects are restored after effectsManager is created — see startGame() above
}

function exportCurrentWorld(id) {
  const data = loadWorldData(id)
  if (!data) return
  const sourcePlayer = player || { position: data.playerPos || { x: 0, y: 80, z: 0 }, yaw: data.yaw || 0, pitch: data.pitch || 0 }
  const sourceInventory = inventory || { serialize: () => data.inventory || [] }
  const payload = exportNzLevel(data, world, sourcePlayer, sourceInventory, health, dropManager, mobManager)
  const text = JSON.stringify(payload)
  const blob = new Blob([text], { type: 'application/x-nzlevel+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = toNzLevelFileName(data)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function importWorldFromFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.nzlevel,application/json'
  input.onchange = async () => {
    const file = input.files && input.files[0]
    if (!file) return
    try {
      const data = importNzLevel(JSON.parse(await file.text()))
      if (!data) throw new Error('Not a nzlevel file')
      localStorage.setItem('nazzaandnaycraft_world_' + data.id, JSON.stringify(data))
      window.alert('Imported. Reload the world list to see it.')
    } catch (e) {
      window.alert('Import failed: ' + (e.message || e))
    }
  }
  input.click()
}

function syncModelBlocksInWorld() {
  if (!world || !blockModels) return
  for (const chunk of world.chunks.values()) {
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.get(x, y, z)
          if (!id) continue
          const def = blocks[id]
          if (!def || def.renderType !== 'model') continue
          const wx = chunk.cx * 16 + x
          const wz = chunk.cz * 16 + z
          blockModels.sync(wx, y, wz)
        }
      }
    }
  }
}

function updateBurnOverlay() {
  app.classList.toggle('player-burning', !!(player && player.burning))
}

let suffocationOverlay = null
function updateSuffocationOverlay() {
  if (!suffocationOverlay) return
  const inBlock = !!(player && player.headInBlock)
  suffocationOverlay.style.display = inBlock ? 'block' : 'none'
}

