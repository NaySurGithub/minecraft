async function switchDimension(targetDimension) {
  if (!world || !player || targetDimension === currentDimension || portalTransitioning) return false
  portalTransitioning = true
  const loader = new SpawnLoader(app)
  const transitionLabel = targetDimension === 'nether' ? 'Entering the Nether...' : 'Returning to the Overworld...'
  const startedAt = performance.now()
  loader.show(transitionLabel)
  await new Promise((resolve) => requestAnimationFrame(resolve))

  try {
    saveDimensionEntityState(currentDimension)
    dimensionWorlds.set(currentDimension, world)
    setChunkMeshesVisible(world, false)

    const fromDimension = currentDimension
    currentDimension = targetDimension
    let nextWorld = dimensionWorlds.get(targetDimension)
    let createdWorld = false
    if (!nextWorld) {
      nextWorld = createWorldForDimension(targetDimension)
      applyDimensionWorldData(targetDimension, nextWorld)
      dimensionWorlds.set(targetDimension, nextWorld)
      createdWorld = true
    }
    world = nextWorld
    setChunkMeshesVisible(world, true)
    rebindWorldReferences()
    loadDimensionEntityState(targetDimension)

    const scale = fromDimension === 'overworld' && targetDimension === 'nether' ? 1 / 8 : 8
    const tx = player.position.x * scale
    const tz = player.position.z * scale
    let destination = findPortalDestination(world, tx, tz)
    if (!destination) {
      const ty = findSafeStandY(world, tx, tz, targetDimension === 'nether' ? 64 : 80)
      destination = buildPortalAt(world, tx, ty, tz) || { x: Math.floor(tx) + 0.5, y: ty, z: Math.floor(tz) + 0.5 }
    }
    const spawnChunk = {
      cx: Math.floor(destination.x / CHUNK_SIZE),
      cz: Math.floor(destination.z / CHUNK_SIZE)
    }
    const radius = Math.min(world.renderDistance || 2, createdWorld ? 3 : 2)
    loader.buildGrid(radius * 2 + 1)
    await world.prepareSpawnArea(spawnChunk.cx, spawnChunk.cz, radius, (done, total, index, stage) => {
      loader.setChunk(index, stage)
      const label = stage === 'generating'
        ? (targetDimension === 'nether' ? 'Loading Nether...' : 'Loading Overworld...')
        : 'Preparing portal...'
      loader.setProgress(done, total, label)
    })
    player.position.set(destination.x, destination.y, destination.z)
    player.velocity?.set(0, 0, 0)
    player.fallStartY = player.position.y
    portalCooldown = 3
    portalHold = 0
    portalStillPosition = null
    if (activeWorldMeta) activeWorldMeta.dimension = currentDimension
    achievementManager?.recordDimensionTravel()
    return true
  } finally {
    const remaining = 650 - (performance.now() - startedAt)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    loader.hide()
    portalTransitioning = false
  }
}

function getPlayerPortalInfo() {
  if (!world || !player) return null
  const px = Math.floor(player.position.x)
  const py = Math.floor(player.position.y + 0.2)
  const pz = Math.floor(player.position.z)
  const headY = Math.floor(player.position.y + 1.4)
  const inPortal = world.getBlock(px, py, pz) === blockIds.FIRE_PORTAL || world.getBlock(px, headY, pz) === blockIds.FIRE_PORTAL
  return inPortal ? { x: px, y: py, z: pz } : null
}

function isPortalActionBlocked() {
  if (portalTransitioning) return true
  return !!getPlayerPortalInfo() && !gamemode?.isCreative?.()
}

function handlePortalTravel(dt) {
  if (!world || !player) return
  if (portalTransitioning || portalCooldown > 0) {
    portalCooldown = Math.max(0, portalCooldown - dt)
    return
  }
  const portalInfo = getPlayerPortalInfo()
  if (!portalInfo) {
    portalHold = 0
    portalStillPosition = null
    return
  }
  if (gamemode?.isCreative?.()) {
    void switchDimension(currentDimension === 'nether' ? 'overworld' : 'nether')
    return
  }
  if (chatUI?.open) chatUI.close()
  if (!portalStillPosition) {
    portalStillPosition = player.position.clone()
    portalHold = 0
    return
  }
  const movingInput = !!(input?.state?.forward || input?.state?.back || input?.state?.left || input?.state?.right || input?.state?.jump || input?.state?.sneak)
  const moved = portalStillPosition.distanceToSquared(player.position) > 0.0025
  if (movingInput || moved) {
    portalStillPosition = player.position.clone()
    portalHold = 0
    return
  }
  portalHold += dt
  if (portalHold >= 2.5) {
    void switchDimension(currentDimension === 'nether' ? 'overworld' : 'nether')
  }
}

function chunkCoordsForPosition(pos) {
  return {
    cx: Math.floor(pos.x / CHUNK_SIZE),
    cz: Math.floor(pos.z / CHUNK_SIZE)
  }
}

function ensurePlayerChunksReady(radius = 1) {
  if (!world || !player) return false
  const { cx, cz } = chunkCoordsForPosition(player.position)
  let ready = true
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx
      const tz = cz + dz
      const chunk = world.getChunk(tx, tz)
      if (!chunk || !chunk.generated) ready = false
    }
  }
  if (ready) return true
  player.velocity?.set(0, 0, 0)
  player.fallStartY = player.position.y
  player.wasOnGround = true
  if (multiplayerMode === 'client' && netSession?.requestNearbyChunks) netSession.requestNearbyChunks(player)
  return false
}

function trySleepAtBedPlacement(x, y, z, blockId) {
  if (blockId !== BED) return false
  if (!isNightTime()) return false
  setTimeOfDay(0)
  health.reset()
  return true
}

function trySummonIronGolem(x, y, z) {
  if (world.getBlock(x, y, z) !== PUMPKIN) return false
  const iron = [
    [x, y - 1, z],
    [x, y - 2, z],
    [x - 1, y - 2, z],
    [x + 1, y - 2, z]
  ]
  for (const [sx, sy, sz] of iron) {
    if (world.getBlock(sx, sy, sz) !== IRON_BLOCK) return false
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (world.getBlock(x + dx, y + dy, z + dz) !== 0) return false
      }
    }
  }
  for (const [sx, sy, sz] of iron) world.setBlock(sx, sy, sz, AIR)
  world.setBlock(x, y, z, AIR)
  mobManager.spawn('golem', x + 0.5, y - 2, z + 0.5)
  return true
}

function giveOrDropItem(id, count = 1) {
  if (!inventory || !player || !dropManager) return false
  const leftover = inventory.addItem(id, count)
  if (leftover <= 0) return true
  const eye = player.getEye()
  const fwd = player.getForward()
  dropManager.spawn(eye.x + fwd.x * 0.6, eye.y - 0.2 + fwd.y * 0.6, eye.z + fwd.z * 0.6, id, leftover)
  return false
}

function absorbWaterAround(world, x, y, z) {
  let absorbed = 0
  for (let dy = -7; dy <= 7; dy++) {
    for (let dz = -7; dz <= 7; dz++) {
      for (let dx = -7; dx <= 7; dx++) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 7) continue
        const wx = x + dx
        const wy = y + dy
        const wz = z + dz
        const id = world.getBlock(wx, wy, wz)
        if (id === blockIds.WATER) {
          world.setBlock(wx, wy, wz, AIR)
          absorbed++
          if (absorbed >= 65) return absorbed
        }
      }
    }
  }
  return absorbed
}

function tryUseBucket() {
  const stack = hotbar.selectedStack()
  if (!stack) return false
  const thing = getThing(stack.id)
  const isBucket = stack.id === BUCKET || stack.id === WATER_BUCKET || stack.id === LAVA_BUCKET || thing?.toolKind === 'bucket'
  if (!isBucket) return false
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit) return false
  const targetId = world.getBlock(hit.block.x, hit.block.y, hit.block.z)
  const target = blocks[targetId]
  const emptyBucketId = BUCKET
  const waterBucketId = WATER_BUCKET
  const lavaBucketId = LAVA_BUCKET
  const held = hotbar?.selectedStack ? hotbar.selectedStack() : null
  const rightEv = emitModEvent(new PlayerRightClickBlockEvent(player, { x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: targetId, face: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null, heldItem: held ? { ...held } : null, action: 'bucket' }), { player, inventory, health, world })
  if (rightEv.cancelled) return false
  const ev = emitModEvent(new PlayerInteractEvent(player, { type: 'bucket', x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: targetId }), { player, inventory, health, world })
  if (ev.cancelled) return false

  if (stack.id === emptyBucketId) {
    if (!target) return false
    if (targetId === blockIds.WATER && world.getLevel(hit.block.x, hit.block.y, hit.block.z) === 0) {
      world.setBlock(hit.block.x, hit.block.y, hit.block.z, AIR)
      inventory.removeAt(hotbar.selected, 1)
      giveOrDropItem(waterBucketId, 1)
      return true
    }
    if (targetId === blockIds.LAVA && world.getLevel(hit.block.x, hit.block.y, hit.block.z) === 0) {
      world.setBlock(hit.block.x, hit.block.y, hit.block.z, AIR)
      inventory.removeAt(hotbar.selected, 1)
      giveOrDropItem(lavaBucketId, 1)
      return true
    }
    return false
  }

  if (stack.id !== waterBucketId && stack.id !== lavaBucketId) return false
  const placeId = stack.id === waterBucketId ? blockIds.WATER : blockIds.LAVA
  const px = hit.block.x + hit.normal.x
  const py = hit.block.y + hit.normal.y
  const pz = hit.block.z + hit.normal.z
  if (py < 0 || py >= CHUNK_HEIGHT) return false
  if (!isReplaceable(world, px, py, pz)) return false
  if (placeId === blockIds.WATER && currentDimension === 'nether') {
    sounds.playFizz?.()
    inventory.removeAt(hotbar.selected, 1)
    giveOrDropItem(emptyBucketId, 1)
    return true
  }
  world.setBlock(px, py, pz, placeId)
  if (placeId === blockIds.WATER) world.setLevel(px, py, pz, 0)
  if (placeId === blockIds.LAVA) world.setLevel(px, py, pz, 0)
  if (blockModels) blockModels.sync(px, py, pz)
  inventory.removeAt(hotbar.selected, 1)
  giveOrDropItem(emptyBucketId, 1)
  return true
}

function triggerAdjacentPistons(x, y, z) {
  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ]
  for (const [dx, dy, dz] of neighbors) {
    const px = x + dx
    const py = y + dy
    const pz = z + dz
    if (world.getBlock(px, py, pz) !== PISTON) continue
    const fx = px + dz === px ? px + dx : px + dx
    const fz = pz + dz
    const fy = py
    const targetX = px + dx
    const targetY = py
    const targetZ = pz + dz
    if (world.getBlock(targetX, targetY, targetZ) !== AIR) continue
    const moved = world.getBlock(x, y, z)
    if (moved === AIR) continue
    world.setBlock(targetX, targetY, targetZ, moved)
    world.setBlock(x, y, z, AIR)
  }
}

function trySleepAtBed() {
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit || hit.id !== BED) return false
  if (!isNightTime()) return false
  setTimeOfDay(0)
  health.reset()
  return true
}

