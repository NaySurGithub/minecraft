function tossSelected(all) {
  if (!hotbar || !dropManager || !player) return
  const stack = hotbar.selectedStack()
  if (!stack || !stack.count) return
  const count = all ? stack.count : 1
  const eye = player.getEye()
  const fwd = player.getForward()
  if (multiplayerMode === 'client' && netSession && typeof netSession.tossItem === 'function') {
    netSession.tossItem({
      x: eye.x + fwd.x * 0.6,
      y: eye.y - 0.2 + fwd.y * 0.6,
      z: eye.z + fwd.z * 0.6,
      id: stack.id,
      count,
      velocity: { x: fwd.x * 4, y: 2, z: fwd.z * 4 }
    })
    if (all) {
      if (typeof hotbar.consumeStack === 'function') hotbar.consumeStack()
      else for (let i = 0; i < count; i++) hotbar.consumeOne()
    } else {
      hotbar.consumeOne()
    }
    return
  }
  const drop = dropManager.spawn(
    eye.x + fwd.x * 0.6,
    eye.y - 0.2 + fwd.y * 0.6,
    eye.z + fwd.z * 0.6,
    stack.id,
    count
  )
  if (drop) {
    if (drop.velocity) drop.velocity.set(fwd.x * 4, 2, fwd.z * 4)
    drop.pickupDelay = 0.8
  }
  if (all) {
    if (typeof hotbar.consumeStack === 'function') hotbar.consumeStack()
    else for (let i = 0; i < count; i++) hotbar.consumeOne()
  } else {
    hotbar.consumeOne()
  }
}

function damageSelectedDurability(stack, thing) {
  if (!stack || !thing?.maxDurability) return
  if (stack.durability === undefined) stack.durability = thing.maxDurability
  stack.durability--
  if (stack.durability <= 0) {
    inventory.slots[hotbar.selected] = null
    inventory.emit()
  } else {
    inventory.emit()
  }
}

function tryShootBow() {
  const stack = hotbar?.selectedStack?.()
  if (!stack || stack.id !== BOW) return false
  const thing = getThing(stack.id)
  if (!gamemode?.isCreative?.()) {
    if (!inventory.consume(ARROW, 1)) return false
  }
  const eye = player.getEye()
  const dir = player.getForward()
  arrowManager?.spawn(eye.x + dir.x * 0.65, eye.y + dir.y * 0.65, eye.z + dir.z * 0.65, dir)
  damageSelectedDurability(stack, thing)
  heldItem.triggerSwing()
  return true
}

const ATTACK_DAMAGE = 3
const ATTACK_COOLDOWN = 0.45

function tryAttack() {
  if (attackCooldown > 0) return false
  if (!mobManager || !player) return false
  if (multiplayerMode === 'client' && netSession && typeof netSession.attackMob === 'function') {
    netSession.attackMob(player)
    if (typeof netSession.attackPlayer === 'function') netSession.attackPlayer(player)
    attackCooldown = ATTACK_COOLDOWN
    return true
  }

  const hit = raycastMobs(player.getEye(), player.getForward(), mobManager.mobs, ATTACK_REACH)
  let didHit = false
  if (hit) {
    didHit = true
    let baseDamage = 2
    const held = hotbar ? hotbar.selectedStack() : null
    if (held && held.id) {
      const thing = getThing(held.id)
      if (thing && thing.toolKind === 'sword') {
        const name = thing.name || ''
        if (name.includes('wooden')) baseDamage = 5
        else if (name.includes('golden')) baseDamage = 5
        else if (name.includes('stone')) baseDamage = 6
        else if (name.includes('iron')) baseDamage = 7
        else if (name.includes('diamond')) baseDamage = 8
        else baseDamage = 5
      }
    }

    const eye = player.getEye()
    const strengthBonus = effectsManager ? effectsManager.getStrengthBonus() : 0
    const finalDamage = baseDamage + strengthBonus
    const killed = hit.mob.damage(finalDamage, eye.x, eye.z)
    if (killed) achievementManager?.recordMobKill()
    if (hit.mob.type === 'villager' && mobManager.angerGolemsNear) {
      mobManager.angerGolemsNear(hit.mob.position.x, hit.mob.position.y, hit.mob.position.z)
    }
    if (hit.mob.type === 'zombie_piglin' && mobManager.angerMobsNear) {
      mobManager.angerMobsNear('zombie_piglin', hit.mob.position.x, hit.mob.position.y, hit.mob.position.z)
    }
  } else {
    didHit = tryAttackPlayer()
  }

  if (didHit) {
    const held = hotbar ? hotbar.selectedStack() : null
    if (held && held.id) {
      const thing = getThing(held.id)
      if (thing && thing.maxDurability) {
        if (held.durability === undefined) {
          held.durability = thing.maxDurability
        }
        held.durability--
        if (held.durability <= 0) {
          hotbar.setSlot(hotbar.selectedIndex, null)
        } else {
          hotbar.onChange?.()
        }
      }
    }
    attackCooldown = ATTACK_COOLDOWN
    return true
  }
  return false
}

function isPortalInteriorBlock(x, y, z) {
  const id = world.getBlock(x, y, z)
  return id === AIR || id === blockIds.FIRE || id === blockIds.FIRE_PORTAL || isReplaceable(world, x, y, z)
}

function tryFillPortalFrame(originX, originY, originZ, axis, width, height) {
  const portalId = blocksByName.get('fire_portal')?.id
  if (!portalId) return false
  let createdNew = false
  for (let fx = 0; fx < width; fx++) {
    for (let fy = 0; fy < height; fy++) {
      const frame = fx === 0 || fx === width - 1 || fy === 0 || fy === height - 1
      const wx = axis === 'x' ? originX + fx : originX
      const wy = originY + fy
      const wz = axis === 'x' ? originZ : originZ + fx
      const id = world.getBlock(wx, wy, wz)
      if (frame) {
        if (id !== blockIds.OBSIDIAN) return false
      } else if (!isPortalInteriorBlock(wx, wy, wz)) {
        return false
      }
    }
  }
  for (let fx = 1; fx < width - 1; fx++) {
    for (let fy = 1; fy < height - 1; fy++) {
      const wx = axis === 'x' ? originX + fx : originX
      const wy = originY + fy
      const wz = axis === 'x' ? originZ : originZ + fx
      if (world.getBlock(wx, wy, wz) !== portalId) createdNew = true
      world.setBlock(wx, wy, wz, portalId)
      if (blockModels) blockModels.sync(wx, wy, wz)
    }
  }
  if (createdNew) achievementManager?.recordPortalCreated()
  return true
}

function ignitePortalFrame(x, y, z) {
  const sizes = [
    { width: 4, height: 5 },
    { width: 4, height: 4 }
  ]
  for (const { width, height } of sizes) {
    for (let iy = 1; iy <= height - 2; iy++) {
      const originY = y - iy
      for (let ix = 1; ix <= width - 2; ix++) {
        if (tryFillPortalFrame(x - ix, originY, z, 'x', width, height)) return true
        if (tryFillPortalFrame(x, originY, z - ix, 'z', width, height)) return true
      }
    }
  }
  return false
}

function tryUseFlintAndSteel() {
  const stack = hotbar.selectedStack()
  if (!stack || stack.id !== FLINT_AND_STEEL) return false
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit || !hit.normal) return false
  const x = hit.block.x + hit.normal.x
  const y = hit.block.y + hit.normal.y
  const z = hit.block.z + hit.normal.z
  const target = world.getBlock(x, y, z)
  if (target === AIR) {
    world.setBlock(x, y, z, blocksByName.get('fire').id)
    if (blockModels) blockModels.sync(x, y, z)
    ignitePortalFrame(x, y, z)
  } else {
    if (!ignitePortalFrame(x, y, z) && !ignitePortalFrame(hit.block.x, hit.block.y, hit.block.z)) return false
  }
  if (stack.durability === undefined) stack.durability = getThing(stack.id)?.maxDurability || 64
  stack.durability--
  if (stack.durability <= 0) hotbar.setSlot(hotbar.selectedIndex, null)
  else hotbar.onChange?.()
  heldItem.triggerSwing()
  return true
}

function tryAttackPlayer() {
  if (!netSession || multiplayerMode === 'solo') return false
  if (multiplayerMode === 'host' && typeof netSession.attackPlayer === 'function') {
    const didHit = netSession.attackPlayer('host', {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch
    })
    if (!didHit) return false
  } else if (typeof netSession.attackPlayer === 'function') {
    netSession.attackPlayer(player)
  }
  attackCooldown = ATTACK_COOLDOWN
  return true
}


function tryUseHoe() {
  const stack = hotbar.selectedStack()
  if (!stack) return false
  const thing = getThing(stack.id)
  if (!thing || thing.toolKind !== 'hoe') return false

  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit || !hit.normal) return false

  const x = hit.block.x
  const y = hit.block.y
  const z = hit.block.z
  const targetId = world.getBlock(x, y, z)

  // Check if target is Grass or Dirt
  if (targetId === GRASS || targetId === DIRT) {
    // Check if block above is air (so we can place farmland)
    if (world.getBlock(x, y + 1, z) === AIR) {
      world.setBlock(x, y, z, FARMLAND)
      sounds.playPlace()
      
      // Durability
      if (thing.maxDurability) {
        if (stack.durability === undefined) stack.durability = thing.maxDurability
        stack.durability--
        if (stack.durability <= 0) {
          hotbar.setSlot(hotbar.selectedIndex, null)
        } else {
          hotbar.onChange?.()
        }
      }
      heldItem.triggerSwing()
      return true
    }
  }
  return false
}

function tryPlace() {
function tryUseBoneMeal() {
  const stack = hotbar.selectedStack();
  if (!stack || stack.id !== getThingByName('bone_meal')?.id) return false;
  const hit = raycastVoxel(world, player.getEye(), player.getForward());
  if (!hit) return false;
  const { x, y, z } = hit.block;
  const blockId = world.getBlock(x, y, z);
  const nextStageId = world.getCropNextStage(blockId);
  if (nextStageId) {
    world.setBlock(x, y, z, nextStageId);
    hotbar.consumeOne();
    return true;
  }
  return false;
}


  if (isPortalActionBlocked()) {
    heldItem.triggerSwing()
    return
  }
  if (tryShootBow()) return
  if (tryUseFlintAndSteel()) return
  if (tryUseBucket()) return
  if (trySleepAtBed()) return
  if (tryOpenChest()) return
  if (tryOpenFurnace()) return
  if (tryOpenCraftingTable()) return
  const stack = hotbar.selectedStack()
  if (!stack) return
  const thing = getThing(stack.id)
  const hit = raycastVoxel(world, player.getEye(), player.getForward())
  if (!hit || !hit.normal) return
  const x = hit.block.x + hit.normal.x
  const y = hit.block.y + hit.normal.y
  const z = hit.block.z + hit.normal.z
  const heldClick = hotbar?.selectedStack ? hotbar.selectedStack() : null
  const rightClickEv = emitModEvent(new PlayerRightClickBlockEvent(player, { x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId: world.getBlock(hit.block.x, hit.block.y, hit.block.z), face: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, heldItem: heldClick ? { ...heldClick } : null, action: 'place' }), { player, inventory, health, world })
  if (rightClickEv.cancelled) return
  if (thing?.spawnMob && mobManager) {
    // Spawn slightly above the placement face so the mob's feet land cleanly
    // on top of the targeted block instead of clipping into it.
    const mob = mobManager.spawn(thing.spawnMob, x + 0.5, y + 0.1, z + 0.5)
    if (!mob) {
      console.warn('spawn egg: unknown mob type', thing.spawnMob)
      return
    }
    if (gamemode.consumesPlaced()) hotbar.consumeOne()
    heldItem.triggerSwing()
    return
  }
  const otherPlayers = remoteRenderers ? remoteRenderers.getPlayerColliders() : []
  if (!canPlaceAt(world, player, x, y, z, stack.id, otherPlayers, thing)) return
  const event = emitModEvent(new BlockPlaceEvent({ x, y, z, blockId: stack.id, face: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }, heldItem: { ...stack } }), { player, inventory, health, world })
  if (event.cancelled) return

let blockToPlace = stack.id

// Torche murale
if (blocks[stack.id]?.name === 'torch') {
  if (hit.normal.x !== 0) {
    blockToPlace = blocksByName.get('wall_torch_east')?.id || stack.id
  }
  else if (hit.normal.z !== 0) {
    blockToPlace = blocksByName.get('wall_torch_north')?.id || stack.id
  }
}

world.setBlock(x, y, z, blockToPlace)

recordBlockPlaceAchievement(blockToPlace)
sounds.playPlace()

  const placedDef = blocks[stack.id]
  if (placedDef?.name === 'chest' || placedDef?.name === 'ender_chest') {
    const inv = placedDef?.name === 'ender_chest'
      ? world.getEnderChestInventory(getPlayerStorageKey())
      : world.getChestInventory(x, y, z)
    const angle = player.yaw
    const deg = (angle * 180 / Math.PI) % 360
    const normalized = (deg + 360) % 360
    let facing = 'north'
    if (normalized >= 45 && normalized < 135) facing = 'west'
    else if (normalized >= 135 && normalized < 225) facing = 'south'
    else if (normalized >= 225 && normalized < 315) facing = 'east'
    if (placedDef?.name !== 'ender_chest') inv.facing = facing

    if (placedDef?.name === 'chest') {
      if (multiplayerMode === 'client' && netSession) {
        netSession.updateChestFacing(x, y, z, facing)
      } else if (multiplayerMode === 'host' && netSession) {
        netSession.broadcast({ t: MSG.CHEST_FACING, x, y, z, facing })
      }
    }
  }

  if (blockModels) blockModels.sync(x, y, z)
  if (netSession) {
    if (multiplayerMode === 'host' && typeof netSession.placeBlock === 'function') netSession.placeBlock(x, y, z, stack.id)
    if (multiplayerMode === 'client' && typeof netSession.placeBlock === 'function') netSession.placeBlock(x, y, z, stack.id)
  }
  world.settleBlock(x, y, z)
  if (redstone) redstone.onBlockChanged(x, y, z)
  if (stack.id === PUMPKIN) trySummonIronGolem(x, y, z)
  if (placedDef?.name === 'sponge') {
    const absorbed = absorbWaterAround(world, x, y, z)
    if (absorbed > 0) {
      world.setBlock(x, y, z, blocksByName.get('wet_sponge').id)
      if (blockModels) blockModels.sync(x, y, z)
    }
  }
  heldItem.triggerSwing()
  if (gamemode.consumesPlaced()) hotbar.consumeOne()
}

window.addEventListener('keydown', (e) => {
  if (!gameStarted) return
  if (chatUI?.open) {
    if (e.code !== 'Escape' && e.code !== 'Enter') {
      e.stopPropagation()
      return
    }
  }
  const kb = settings.controls.keybindings
  if (e.code === kb.pause) {
    e.preventDefault()
    setPaused(!paused)
    return
  }
  if (paused) return
  if (isPortalActionBlocked() && (e.code === 'KeyT' || e.code === kb.inventory || e.code === kb.drop)) {
    e.preventDefault()
    if (chatUI?.open) chatUI.close()
    return
  }
  if (e.code === 'KeyT') {
    e.preventDefault()
    if (chatUI) chatUI.toggle()
    return
  }
  if (chatUI?.open && e.code === 'Escape') { chatUI.close(); return }
  if (chatUI?.open && e.code === 'Enter') { e.preventDefault(); chatUI.inputEl?.form?.requestSubmit(); return }
  if (e.code === kb.inventory) {
    if (craftingTableUI.open) craftingTableUI.close()
    else if (furnaceUI.open) furnaceUI.close()
    else if (chestUI.open) chestUI.close()
    else if (inventoryUI.open) inventoryUI.toggle()
    else if (isAnyInventoryOpen()) return
    else inventoryUI.toggle()
  }
  if (e.code === kb.drop) {
    if (isAnyInventoryOpen()) return
    e.preventDefault()
    tossSelected(e.ctrlKey)
  }
})

function buildPauseOverlayUi() {
  const { overlay, pauseButton: btn } = buildPauseOverlay(app, {
    onResume: () => setPaused(false),
    onSettings: () => openSettingsFromPause(),
    onQuit: () => saveAndQuitToMenu(),
    onTogglePause: () => setPaused(!paused)
  })
  pauseOverlay = overlay
  pauseButton = btn
}

function setPaused(value) {
  if (!gameStarted || !pauseOverlay) return
  paused = value
  pauseOverlay.hidden = !paused
  app.classList.toggle('game-paused', paused)
  if (paused && document.pointerLockElement) document.exitPointerLock()
  if (paused && breakTimer) breakTimer.stop()
}

function openSettingsFromPause() {
  paused = true
  pauseOverlay.hidden = true
  app.classList.add('game-paused')
  menu.showOptions({
    ...menuCallbacks,
    allowMods: true,
    closeOptions: () => {
      menu.hide()
      if (gameStarted && pauseOverlay) {
        paused = true
        pauseOverlay.hidden = false
        app.classList.add('game-paused')
      }
    }
  })
}

function applySettings(nextSettings) {
  settings = nextSettings
  setLanguage(settings.language)
  frameTime = 1 / settings.video.maxFps
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.video.pixelRatio))
  renderer.setSize(window.innerWidth, window.innerHeight)
  app.classList.toggle('pack-bright', settings.resourcePack === 'bright')
  app.classList.toggle('pack-contrast', settings.resourcePack === 'contrast')
  app.classList.toggle('a11y-contrast', settings.accessibility.highContrast)
  app.classList.toggle('reduce-motion', settings.accessibility.reduceMotion)
  app.style.setProperty('--mc-ui-scale', settings.accessibility.uiScale)
  if (world) world.renderDistance = settings.video.renderDistance
  if (input) input.sensitivity = settings.controls.mouseSensitivity
  if (input) input.invertY = settings.controls.invertY
  if (input) input.setKeybindings(settings.controls.keybindings)
  if (touchControls) touchControls.sensitivity = settings.controls.touchSensitivity
  if (touchControls) touchControls.invertY = settings.controls.invertY
  if (touchControls) touchControls.applyLayout(settings.controls.touchLayout)
  if (infoEl) infoEl.style.display = settings.game.showCoordinates ? 'block' : 'none'
  setVolumeLevels(settings.audio.master, settings.audio.music, settings.audio.effects)
  configureAutosave()
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  skyCamera.aspect = window.innerWidth / window.innerHeight 
  skyCamera.updateProjectionMatrix()                         
  renderer.setSize(window.innerWidth, window.innerHeight)
  heldItem.resize(window.innerWidth, window.innerHeight)
})

const clock = new THREE.Clock()
let acc = 0

function loop() {
  requestAnimationFrame(loop)
  if (!gameStarted) return
  const dt = Math.min(clock.getDelta(), 0.1)
  acc += dt
  if (acc < frameTime) return
  const step = acc
  acc = 0

  if (!paused) {
    if (health && !health.dead) {
      if (ensurePlayerChunksReady(1)) {
        const prevPos = player.position.clone()
        player.update(step, input.state)
        if (prevPos.distanceToSquared(player.position) > 0.0001) {
          const moveEv = emitModEvent(new PlayerMoveEvent(player, {
            from: { x: prevPos.x, y: prevPos.y, z: prevPos.z },
            to: { x: player.position.x, y: player.position.y, z: player.position.z }
          }), { player, inventory, health, world })
          if (moveEv.cancelled) {
            player.position.copy(prevPos)
          }
        }
        handlePortalTravel(step)
      }
    }
    world.update(player.position.x, player.position.z, 1)
    if (world.tickTileEntities) world.tickTileEntities(step, { player, inventory, mobManager, dropManager })
    breakTimer.update(step)
    dropManager.update(step, player.position)
    mobManager.update(step, player.position, player)
    if (arrowManager) arrowManager.update(step, mobManager.mobs)
    if (redstone) redstone.update(step)
    world.timeOfDay = timeOfDay
    world.weather = weather
    world.difficulty = difficulty
    pacificMobGen.update(step, player.position)
    if (villageGen && currentDimension === 'overworld') villageGen.update(step, player.position)
    if (furnaceUI) furnaceUI.update(step)
    if (netSession) netSession.update(step)
    if (blockModels) blockModels.update(step)
    if (multiplayerMode === 'host' && netSession && remoteRenderers) {
      remoteRenderers.syncPlayers(netSession.playerSnapshots(), 'host')
    }
    if (attackCooldown > 0) attackCooldown = Math.max(0, attackCooldown - step)

    if (player.headInWater) health.consumeAir(step)
    else health.refillAir(step)
    if (health) health.updateSuffocation(step, !!(player && player.headInBlock))
    updateSuffocationOverlay()
    if (player.position.y < -30) {
      health.damage(health.maxHp)
    }
    health.update(step)
    if (healthUI) healthUI.updateArmor()
    if (effectsManager) {
      effectsManager.update(step, { health })
      if (effectsUI) effectsUI.tick(effectsManager.effects)
    }
    timeOfDay = (timeOfDay + step * 20) % 24000
    if (hotbar) heldItem.setBlock(hotbar.selectedBlockId())
    heldItem.update(step)
    updateBurnOverlay()
  }

  dayNight.update(timeOfDay)

dayNight.update(timeOfDay)
clouds.update(dt, daylightFactor(timeOfDay))  // ← add this

renderer.autoClear = false
renderer.clear()
skyCamera.quaternion.copy(camera.quaternion)
renderer.clearDepth()
renderer.render(skyScene, skyCamera)
renderer.render(scene, camera)
renderer.autoClear = true
heldItem.render()

  if (infoEl) {
    const status = multiplayerStatus ? '  |  ' + multiplayerStatus : ''
    infoEl.textContent = t('gameTitle') + status + '  |  x:' + player.position.x.toFixed(1) + ' y:' + player.position.y.toFixed(1) + ' z:' + player.position.z.toFixed(1)
  }
}

