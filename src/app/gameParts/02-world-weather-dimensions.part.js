function isNightTime() {
  return daylightFactor(timeOfDay) < 0.2
}

function setTimeOfDay(ticks) {
  timeOfDay = ((Math.floor(Number(ticks) || 0) % 24000) + 24000) % 24000
  for (const dimWorld of dimensionWorlds.values()) {
    dimWorld.timeOfDay = timeOfDay
    dimWorld.markAllLoadedDirty?.({ sky: true })
  }
  if (world) {
    world.timeOfDay = timeOfDay
    world.markAllLoadedDirty?.({ sky: true })
  }
  if (activeWorldMeta) activeWorldMeta.timeOfDay = timeOfDay
  dayNight.update(timeOfDay)
  return timeOfDay
}

function setWeather(value, durationSeconds = null) {
  const nextWeather = normalizeWeather(value)
  const changed = weather !== nextWeather
  weather = nextWeather
  if (durationSeconds != null || changed || weatherTimer <= 0) {
    weatherTimer = resolveWeatherTimer(weather, durationSeconds)
  }
  for (const dimWorld of dimensionWorlds.values()) {
    dimWorld.weather = weather
    dimWorld.weatherTimer = weatherTimer
    if (changed) dimWorld.markAllLoadedDirty?.({ sky: true })
  }
  if (world) {
    world.weather = weather
    world.weatherTimer = weatherTimer
    if (changed) world.markAllLoadedDirty?.({ sky: true })
  }
  if (activeWorldMeta) {
    activeWorldMeta.weather = weather
    activeWorldMeta.weatherTimer = weatherTimer
  }
  dayNight.setWeather(weather)
  dayNight.update(timeOfDay)
  weatherParticles?.setWeather(currentDimension === 'nether' ? 'clear' : weather)
  updateWeatherOverlay()
  return weather
}

function getWeatherState() {
  return { weather, weatherTimer }
}

function updateWeatherOverlay() {
  app.dataset.weather = currentDimension === 'nether' ? 'clear' : weather
}

function setDifficulty(value) {
  difficulty = String(value || 'normal')
  if (world) world.difficulty = difficulty
  if (activeWorldMeta) activeWorldMeta.difficulty = difficulty
  return difficulty
}

function updateWeatherSystem(dt) {
  weatherParticles?.update(dt, player, currentDimension)
  if (multiplayerMode === 'client') return
  weatherTimer = Math.max(0, weatherTimer - dt)
  if (activeWorldMeta) activeWorldMeta.weatherTimer = weatherTimer
  for (const dimWorld of dimensionWorlds.values()) dimWorld.weatherTimer = weatherTimer
  if (world) world.weatherTimer = weatherTimer
  if (weatherTimer > 0) return
  setWeather(rollNextWeather(weather))
}

function applyNightVisionLighting() {
  const enabled = !!effectsManager?.hasEffect?.('night_vision')
  if (enabled === nightVisionActive) return
  nightVisionActive = enabled
  dayNight.setNightVision(enabled)
  for (const dimWorld of dimensionWorlds.values()) {
    dimWorld.nightVisionActive = enabled
    dimWorld.markAllLoadedDirty?.({ light: true, sky: true })
  }
  if (world && !dimensionWorlds.has(currentDimension)) {
    world.nightVisionActive = enabled
    world.markAllLoadedDirty?.({ light: true, sky: true })
  }
  dayNight.update(timeOfDay)
}

function applyFlightForGameMode(mode) {
  if (!player) return
  if (mode === GAME_MODE.SPECTATOR) {
    player.flying = true
    return
  }
  if (mode === GAME_MODE.SURVIVAL) {
    player.flying = false
    player.fallStartY = player.position.y
  }
}

function serializeChestsForWorld(targetWorld) {
  if (!targetWorld?.chests) return {}
  return Object.fromEntries(Array.from(targetWorld.chests.entries()).map(([k, inv]) => [k, { slots: inv.serialize(), facing: inv.facing }]))
}

function serializeEnderChestsForWorld(targetWorld) {
  if (!targetWorld?.enderChests) return {}
  return Object.fromEntries(Array.from(targetWorld.enderChests.entries()).map(([k, inv]) => [k, inv.serialize()]))
}

function saveDimensionEntityState(name = currentDimension) {
  if (!name || !mobManager || !dropManager) return
  dimensionEntityStates.set(name, {
    mobs: mobManager.serialize ? mobManager.serialize() : [],
    drops: dropManager.serialize ? dropManager.serialize() : []
  })
}

function loadDimensionEntityState(name) {
  if (!mobManager || !dropManager) return
  mobManager.clear()
  dropManager.clear()
  arrowManager?.clear?.()
  const state = dimensionEntityStates.get(name) || dimensionSavedData.get(name) || {}
  if (state.drops) dropManager.restore(state.drops)
  if (state.mobs) mobManager.restore(state.mobs)
}

function applyDimensionWorldData(name, targetWorld) {
  const data = dimensionSavedData.get(name)
  if (!data || !targetWorld) return
  if (data.edits) applyEditsToWorld(targetWorld, data.edits)
  if (data.chests) applyChestsToWorld(targetWorld, data.chests)
  if (data.tileEntities) applyTileEntitiesToWorld(targetWorld, data.tileEntities)
  if (data.enderChests) applyEnderChestsToWorld(targetWorld, data.enderChests)
}

function collectDimensionSaveData() {
  saveDimensionEntityState(currentDimension)
  const out = { ...Object.fromEntries(dimensionSavedData.entries()) }
  for (const [name, dimWorld] of dimensionWorlds.entries()) {
    const entityState = dimensionEntityStates.get(name) || {}
    out[name] = {
      dimension: name,
      edits: collectEdits(dimWorld),
      tileEntities: dimWorld?.serializeTileEntities ? dimWorld.serializeTileEntities() : {},
      chests: serializeChestsForWorld(dimWorld),
      enderChests: serializeEnderChestsForWorld(dimWorld),
      drops: entityState.drops || [],
      mobs: entityState.mobs || []
    }
  }
  return out
}

function createWorldForDimension(name) {
  const options = { dimension: name }
  if (name === 'nether') {
    options.terrain = new NetherTerrainGenerator(activeWorldMeta.seed + ':nether')
  }
  const nextWorld = new World(scene, activeWorldMeta.seed + ':' + name, atlas, material, transparentMaterial, options)
  nextWorld.timeOfDay = timeOfDay
  nextWorld.weather = weather
  nextWorld.weatherTimer = weatherTimer
  nextWorld.difficulty = difficulty
  nextWorld.nightVisionActive = nightVisionActive
  return nextWorld
}

function setChunkMeshesVisible(targetWorld, visible) {
  if (!targetWorld) return
  for (const chunk of targetWorld.chunks.values()) {
    if (chunk.mesh) {
      if (visible) scene.add(chunk.mesh)
      else scene.remove(chunk.mesh)
    }
    if (chunk.transparentMesh) {
      if (visible) scene.add(chunk.transparentMesh)
      else scene.remove(chunk.transparentMesh)
    }
  }
}

function disposeWorldChunkMeshes(targetWorld) {
  if (!targetWorld?.chunks) return
  for (const chunk of targetWorld.chunks.values()) {
    if (chunk.mesh) {
      scene.remove(chunk.mesh)
      chunk.mesh.geometry?.dispose?.()
      chunk.mesh = null
    }
    if (chunk.transparentMesh) {
      scene.remove(chunk.transparentMesh)
      chunk.transparentMesh.geometry?.dispose?.()
      chunk.transparentMesh = null
    }
    chunk.dirty = true
  }
}

function disposeAllWorldChunkMeshes() {
  const worlds = new Set()
  if (world) worlds.add(world)
  for (const dimWorld of dimensionWorlds.values()) worlds.add(dimWorld)
  for (const targetWorld of worlds) disposeWorldChunkMeshes(targetWorld)
}

function rebindWorldReferences() {
  if (!world) return
  world.remote = multiplayerMode === 'client'
  world.timeOfDay = timeOfDay
  world.weather = weather
  world.weatherTimer = weatherTimer
  world.difficulty = difficulty
  world.renderDistance = settings.video.renderDistance || RENDER_DISTANCE[currentDevice]
  if (player) player.world = world
  if (breakTimer) breakTimer.world = world
  if (dropManager) dropManager.world = world
  if (mobManager) mobManager.world = world
  if (arrowManager) arrowManager.world = world
  if (pacificMobGen) {
    if (typeof pacificMobGen.setWorld === 'function') pacificMobGen.setWorld(world)
    else pacificMobGen.world = world
  }
  if (villageGen) {
    if (typeof villageGen.setWorld === 'function') villageGen.setWorld(world)
    else villageGen.world = world
  }
  if (redstone) redstone.world = world
  if (blockModels) {
    blockModels.clear()
    blockModels.world = world
  }
  if (activeWorldMeta) activeWorldMeta.dimension = currentDimension
  world.onBlockChanged = (x, y, z, id) => {
    if (multiplayerMode !== 'host' || !netSession || typeof netSession.broadcast !== 'function') return
    netSession.broadcast({ t: MSG.BLOCK_UPDATE, x, y, z, id })
  }
  dayNight.setDimension(currentDimension === 'nether' ? netherDimension : null)
  dayNight.setWeather(weather)
  dayNight.setNightVision(nightVisionActive)
  dayNight.update(timeOfDay)
  weatherParticles?.setWeather(currentDimension === 'nether' ? 'clear' : weather)
}

function findSafeStandY(targetWorld, x, z, fallback = 80) {
  const wx = Math.floor(x)
  const wz = Math.floor(z)
  targetWorld.ensureChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE))
  for (let y = CHUNK_HEIGHT - 4; y >= 3; y--) {
    if (!targetWorld.isPassable(wx, y - 1, wz) && targetWorld.isPassable(wx, y, wz) && targetWorld.isPassable(wx, y + 1, wz)) {
      return y
    }
  }
  return fallback
}

function buildPortalAt(targetWorld, centerX, baseY, centerZ) {
  const portalId = blocksByName.get('fire_portal')?.id
  const obsidianId = blockIds.OBSIDIAN
  if (!portalId || !obsidianId) return null
  const originX = Math.floor(centerX) - 1
  const originZ = Math.floor(centerZ)
  const originY = Math.max(1, Math.min(CHUNK_HEIGHT - 6, Math.floor(baseY) - 1))
  for (let x = originX - 1; x <= originX + 4; x++) {
    for (let y = originY; y <= originY + 5; y++) {
      for (let z = originZ - 1; z <= originZ + 1; z++) {
        if (y >= 0 && y < CHUNK_HEIGHT && targetWorld.getBlock(x, y, z) !== AIR) targetWorld.setBlock(x, y, z, AIR)
      }
    }
  }
  for (let fx = 0; fx <= 3; fx++) {
    for (let fy = 0; fy <= 4; fy++) {
      const isFrame = fx === 0 || fx === 3 || fy === 0 || fy === 4
      const id = isFrame ? obsidianId : portalId
      targetWorld.setBlock(originX + fx, originY + fy, originZ, id)
    }
  }
  return { x: originX + 1.5, y: originY + 1, z: originZ + 0.5 }
}

function findPortalDestination(targetWorld, centerX, centerZ, radius = 32) {
  const portalId = blocksByName.get('fire_portal')?.id
  if (!portalId) return null
  const cx = Math.floor(centerX)
  const cz = Math.floor(centerZ)
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = cx + dx
        const z = cz + dz
        targetWorld.ensureChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))
        for (let y = 1; y < CHUNK_HEIGHT - 2; y++) {
          if (targetWorld.getBlock(x, y, z) !== portalId) continue
          if (targetWorld.isPassable(x, y, z) && targetWorld.isPassable(x, y + 1, z)) {
            return { x: x + 0.5, y, z: z + 0.5 }
          }
        }
      }
    }
  }
  return null
}

