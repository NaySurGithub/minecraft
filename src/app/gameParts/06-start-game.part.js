async function startGame(meta, savedData, netOptions = null) {
  cleanupGameUi()
  menu.hide()
  paused = false
  if (pauseOverlay) pauseOverlay.hidden = true
  app.classList.remove('game-paused')
  multiplayerMode = netOptions?.mode || 'solo'
  multiplayerStatus = ''
  pendingMultiplayerState = null
  const worldMods = savedData?.mods || meta.mods || []
  applyModManifests(worldMods)
  rebuildAtlas()
  activeWorldMeta = {
    id: meta.id,
    name: meta.name,
    seed: meta.seed,
    gameMode: meta.gameMode || GAME_MODE.SURVIVAL,
    defaultGameMode: meta.defaultGameMode || meta.gameMode || GAME_MODE.SURVIVAL,
    multiplayerRoomCode: meta.multiplayerRoomCode || null,
    mods: worldMods,
    keepInventory: !!meta.keepInventory,
    createdAt: meta.createdAt || new Date().toISOString(),
    openedAt: new Date().toISOString(),
    savedAt: meta.savedAt,
    hunger: savedData?.hunger == null ? 20 : savedData.hunger,
    timeOfDay: savedData?.timeOfDay == null ? (meta.timeOfDay == null ? 1000 : meta.timeOfDay) : savedData.timeOfDay,
    weather: savedData?.weather || meta.weather || 'clear',
    weatherTimer: savedData?.weatherTimer ?? meta.weatherTimer ?? null,
    difficulty: savedData?.difficulty || meta.difficulty || 'normal',
    dimension: savedData?.dimension || meta.dimension || 'overworld',
    dimensions: savedData?.dimensions || meta.dimensions || {},
    achievements: savedData?.achievements || meta.achievements || { stats: {}, unlocked: [] }
  }

  weather = activeWorldMeta.weather
  weatherTimer = resolveWeatherTimer(weather, activeWorldMeta.weatherTimer)
  difficulty = activeWorldMeta.difficulty
  currentDimension = activeWorldMeta.dimension
  if (currentDimension !== 'nether') currentDimension = 'overworld'
  activeWorldMeta.dimension = currentDimension
  portalCooldown = 0
  portalHold = 0
  portalStillPosition = null
  portalTransitioning = false
  dimensionWorlds = new Map()
  dimensionEntityStates = new Map()
  dimensionSavedData = new Map(Object.entries(activeWorldMeta.dimensions || {}))
  world = createWorldForDimension(currentDimension)
  dimensionWorlds.set(currentDimension, world)
  setTimeOfDay(activeWorldMeta.timeOfDay)
  setWeather(weather, weatherTimer)
  setDifficulty(difficulty)
  dayNight.setDimension(currentDimension === 'nether' ? netherDimension : null)
  dayNight.setWeather(weather)
  dayNight.update(timeOfDay)
  updateWeatherOverlay()
  world.remote = multiplayerMode === 'client'
  blockModels = new BlockModels(scene, world, material)
  globalThis.blockModels = blockModels
  redstone = new RedstoneEngine(world)
  if (weatherParticles) weatherParticles.dispose()
  weatherParticles = new WeatherParticles(scene)
  weatherParticles.setWeather(currentDimension === 'nether' ? 'clear' : weather)
  player = new Player(world, camera)
  input = new InputController(renderer.domElement, player, settings.controls.keybindings)
  input.sensitivity = settings.controls.mouseSensitivity
  inventory = new Inventory(41)
  inventoryUI = new InventoryUI(app, inventory)
  inventoryUI.setCreativeMode(activeWorldMeta.gameMode === GAME_MODE.CREATIVE)
  craftingTableUI = new CraftingTableUI(app, inventory)
  furnaceUI = new FurnaceUI(app, inventory)
  chestUI = new ChestUI(app, inventory)
  gamemode = new Gamemode(activeWorldMeta.gameMode)
  player.gamemode = gamemode
  hotbar = new Hotbar(app, inventory)
  player.hotbar = hotbar
  player.inventory = inventory
  dropManager = new DropManager(scene, world, atlas, material, inventory)
  dropManager.onPickup = recordItemPickupAchievement
  mobManager = new MobManager(scene, world, dropManager)
  arrowManager = new ArrowManager(scene, world)
  pacificMobGen = new PacificMobGeneration(mobManager, world)
  villageGen = new VillageGeneration(mobManager, world)
  health = new Health()
  health.inventory = inventory
  player.health = health
  health.hunger = activeWorldMeta.hunger == null ? health.maxHunger : activeWorldMeta.hunger
  healthUI = new HealthUI(app, health, inventory)
  chatUI = new ChatUI(app)
  achievementManager = new AchievementManager(app)
  achievementManager.load(activeWorldMeta.achievements)
  chatUI.onSend = (text) => {
    const cleaned = String(text || '').trim()
    if (!cleaned) return
    if (cleaned.startsWith('/')) {
      if (multiplayerMode === 'client') netSession?.sendCommand?.(cleaned)
      else {
        const res = executeChatCommand(cleaned, {
          isOp: true,
          playerName: 'Player1',
          getPlayers: () => [{ id: 'host', name: 'Player1', player, health }],
          health,
          player,
          inventory,
          world,
          mobManager,
          villageGen,
         setGamemode: (mode) => {
            if (!gameStarted || !gamemode) return false
            gamemode.set(mode)
            activeWorldMeta.gameMode = mode
            applyFlightForGameMode(mode)
            saveActiveWorld()
            return true
          },
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
          giveTargetItem: (name, itemId, count = 1) => {
            if (!inventory?.addItem) return false
            if (name !== 'Player1' && name !== '@s' && name !== '@a' && name !== 'host') return false
            inventory.addItem(itemId, count)
            return true
          },
          syncBlock: (x, y, z) => {
            if (blockModels) blockModels.sync(x, y, z)
            if (redstone) redstone.onBlockChanged(x, y, z)
          },
          getStats: () => achievementManager?.serialize().stats || null,
          effectsManager,
          sendPacket: (type, payload) => {
            emitModPacket(type, payload, { isOp: true, playerName: 'Player1', player, inventory, health, world, capabilities: {} })
          },
          capabilities: {},
          damageTargets: (names, amount) => {
            if (names.includes('Player1') || names.includes('@s') || names.includes('@a')) health?.damage(amount)
          }
        })
        if (res && res.message) {
          chatUI.addMessage('System', res.message)
        }
      }
      return
    }
    if (multiplayerMode === 'client') netSession?.sendChat?.(cleaned)
    else if (multiplayerMode === 'host' && netSession?.broadcast) netSession.broadcast({ t: MSG.CHAT, name: 'Player1', text: cleaned.slice(0, 180) })
  }
  health.invincible = activeWorldMeta.gameMode === GAME_MODE.CREATIVE || activeWorldMeta.gameMode === GAME_MODE.SPECTATOR
  health.reset()
  remoteRenderers = new RemoteRenderers(scene)
  world.onBlockChanged = (x, y, z, id) => {
    if (multiplayerMode !== 'host' || !netSession || typeof netSession.broadcast !== 'function') return
    netSession.broadcast({ t: MSG.BLOCK_UPDATE, x, y, z, id })
  }

  gamemode.onChange((mode) => {
    activeWorldMeta.gameMode = mode
    if (inventoryUI) inventoryUI.setCreativeMode(mode === GAME_MODE.CREATIVE)
    if (health) {
      health.invincible = mode === GAME_MODE.CREATIVE || mode === GAME_MODE.SPECTATOR
      health.reset()
    }
    applyFlightForGameMode(mode)
    if (mode === GAME_MODE.CREATIVE && !savedData) applyGamemodeInventory(mode)
  })
  player.onLand = (d) => {
    if (!gamemode.takesFallDamage()) return
    if (d > 3) health.damage(Math.floor(d - 3))
  }
health.onChange((h) => {
  if (h.dead) {
	  if (dropManager) {
		  dropManager.canPickup = false
		}
	  
    const deathEv = emitModEvent(
      new DeathEvent(player, { reason: 'health' }),
      { player, inventory, health, world }
    )
	

    if (deathEv.cancelled) return

    if (gamemode.isSurvival() && !activeWorldMeta.keepInventory) {
      dropInventoryContents()
    }

    if (deathOverlay) {
      deathOverlay.style.display = 'flex'

      if (document.pointerLockElement) {
        document.exitPointerLock()
      }

      if (breakTimer) {
        breakTimer.stop()
      }
    } else {
      player.spawnAtSurface()
      health.reset()
    }
  }
})
  craftingTableUI.onClose = handleCraftingTableClose
  furnaceUI.onClose = handleCraftingTableClose
  configureBreakTimer()
  input.onBreak = () => {
    if (paused) return
    if (gamemode.isSpectator()) return
    if (isPortalActionBlocked()) return
    const hit = raycastVoxel(world, player.getEye(), player.getForward())
    if (hit) {
      const blockId = world.getBlock(hit.block.x, hit.block.y, hit.block.z)
      const held = hotbar?.selectedStack ? hotbar.selectedStack() : null
      currentBreakTarget = { x: hit.block.x, y: hit.block.y, z: hit.block.z, face: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null }
      const startEv = emitModEvent(new BlockBreakStartEvent({ x: hit.block.x, y: hit.block.y, z: hit.block.z, blockId, face: currentBreakTarget.face, heldItem: held ? { ...held } : null }), { player, inventory, health, world })
      if (startEv.cancelled) return
    }
    if (tryAttack()) { heldItem.triggerSwing(); return }
    if (!requestRemoteBreak()) breakTimer.start()
    heldItem.triggerSwing()
  }
  input.onBreakRelease = () => {
    const stopEv = emitModEvent(new BlockBreakStopEvent(currentBreakTarget || {}), { player, inventory, health, world })
    currentBreakTarget = null
    if (stopEv.cancelled) return
    breakTimer.stop()
  }
  input.onPlace = () => { if (!paused && !gamemode.isSpectator()) tryPlace() }
  input.onPickBlock = () => { if (!paused) tryPickBlock() }
  input.onJumpPressed = () => {
    const jumpEv = emitModEvent(new PlayerJumpEvent(player), { player, inventory, health, world })
    if (jumpEv.cancelled) return
  }
  input.canFly = () => gamemode.canFly()

  if (savedData?.edits) applyEditsToWorld(world, savedData.edits)
  if (savedData?.chests) applyChestsToWorld(world, savedData.chests)
  if (savedData?.tileEntities) applyTileEntitiesToWorld(world, savedData.tileEntities)
  if (savedData?.drops) dropManager.restore(savedData.drops)
  if (savedData?.mobs) mobManager.restore(savedData.mobs)
  if (savedData?.enderChests) applyEnderChestsToWorld(world, savedData.enderChests)
  applyLoadedState(savedData)
  if (netOptions?.mode === 'host') {
    if (!activeWorldMeta.multiplayerRoomCode) {
      activeWorldMeta.multiplayerRoomCode = 'W' + Math.random().toString(36).slice(2, 8).toUpperCase()
      saveActiveWorld()
    }
    netSession = new HostSession(multiplayerContext(), {
      roomCode: activeWorldMeta.multiplayerRoomCode,
      lockRoomCode: true,
      onStatus: (type, value) => {
        if (type === 'ready') multiplayerStatus = t('hostingRoom') + value
        if (type === 'retry') multiplayerStatus = t('hostingRoom') + value
        if (type === 'error') multiplayerStatus = t('multiplayerError') + ': ' + describeNetError(value)
      }
    })
    multiplayerStatus = t('hostingRoom') + netSession.roomCode
  } else if (netOptions?.mode === 'client') {
    netSession = new ClientSession(multiplayerContext(), netOptions.roomCode, {
      onStatus: (type) => {
        if (type === 'connected' || type === 'welcome') multiplayerStatus = t('connectedToHost')
        if (type === 'error') multiplayerStatus = t('multiplayerError') + ': connection failed'
      }
    })
    multiplayerStatus = t('joiningRoom') + netOptions.roomCode
  }
  const device = await prompts.chooseDevice()
  currentDevice = device
  app.classList.toggle('mobile-device', device === DEVICE.PHONE || device === DEVICE.TABLET)
  world.renderDistance = settings.video.renderDistance || RENDER_DISTANCE[device]
  if (device === DEVICE.PHONE || device === DEVICE.TABLET) {
    inventoryUI.setTouchMode(true)
    touchControls = new TouchControls(app, input, player, {
      onBreak: input.onBreak,
      onBreakRelease: input.onBreakRelease,
      onPlace: input.onPlace,
      onInventory: () => { if (!isPortalActionBlocked()) inventoryUI.toggle() }
    }, settings.controls.touchLayout, (layout) => {
      settings.controls.touchLayout = layout
      menu.settings.controls.touchLayout = layout
      saveSettings(settings)
    })
    touchControls.sensitivity = settings.controls.touchSensitivity
    touchControls.invertY = settings.controls.invertY
  }
  emitModEvent(new JoinEvent({ worldId: activeWorldMeta.id, mode: multiplayerMode }), { player, inventory, health, world })
  const spawnRadius = Math.min(world.renderDistance, 4)
  const loader = new SpawnLoader(app)
  loader.show('Loading world...')
  if (multiplayerMode === 'client' && netSession) {
    const remoteRadius = Math.min(spawnRadius, 2)
    loader.buildGrid(remoteRadius * 2 + 1)
    multiplayerStatus = t('joiningRoom') + netOptions.roomCode
    if (netSession.welcome) await netSession.welcome
    await netSession.waitForChunksAround(player, remoteRadius, (done, total) => {
      loader.setProgress(done, total, 'Loading host world...')
    })
  } else {
    loader.buildGrid(spawnRadius * 2 + 1)
    const spawnChunk = chunkCoordsForPosition(player.position)
    await world.prepareSpawnArea(spawnChunk.cx, spawnChunk.cz, spawnRadius, (done, total, index, stage) => {
      loader.setChunk(index, stage)
      loader.setProgress(done, total, stage === 'generating' ? 'Loading world...' : 'Preparing spawn area...')
    })
  }
  if (multiplayerMode !== 'client' && !savedData?.playerPos) player.spawnAtSurface()
  health.setSpawnProtection(5)
  syncModelBlocksInWorld()
  if (pendingMultiplayerState) applyMultiplayerState(pendingMultiplayerState)
  loader.hide()
  emitModEvent(new WorldLoadEvent({ worldId: activeWorldMeta.id, name: activeWorldMeta.name }), { player, inventory, health, world })
  gameStarted = true
  setModUiHost({
    app,
    player,
    inventory,
    world,
    sendPacket: (type, payload) => emitModPacket(type, payload, { player, inventory, health, world, playerName: 'Player1' }),
    onAction: (payload, def) => {
      if (!payload) return
      const packetType = payload.packetType || def?.packetType
      if (!packetType) return
      emitModPacket(packetType, {
        itemId: payload.itemId || payload.item || def?.defaultItemId || '',
        count: payload.count || def?.defaultCount || 1,
        target: payload.target || def?.defaultTarget || '@s',
        action: payload.action || ''
      }, { player, inventory, health, world, playerName: 'Player1' })
    }
  })
  infoEl = buildHud(app)
  infoEl.style.display = settings.game.showCoordinates ? 'block' : 'none'
  effectsManager = new EffectsManager()
  effectsUI = new EffectsUI(app)
  effectsManager.onChanged = (effects) => {
    effectsUI.refresh(effects)
    applyNightVisionLighting()
  }
  // Inject effectsManager into player and breakTimer for real gameplay effects
  if (player) player.effectsManager = effectsManager
  if (breakTimer) breakTimer.effectsManager = effectsManager
  // Restore saved effects if any
  if (savedData?.effects && Array.isArray(savedData.effects)) {
    for (const e of savedData.effects) {
      if (e && e.id && e.remaining > 0) effectsManager.addEffect(e.id, e.remaining, e.magnitude)
    }
    if (effectsManager.effects.length > 0) effectsUI.refresh(effectsManager.effects)
  }
  applyNightVisionLighting()
  // Suffocation overlay: fullscreen black div shown when head is inside a block
  if (!suffocationOverlay) {
    suffocationOverlay = document.createElement('div')
    suffocationOverlay.id = 'suffocation-overlay'
    suffocationOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:none;pointer-events:none;z-index:50;'
    app.appendChild(suffocationOverlay)
  }
  if (!pauseOverlay) buildPauseOverlayUi()
  if (!deathOverlay) {
    deathOverlay = buildDeathOverlay(app, {
      onRespawn: () => {
        deathOverlay.style.display = 'none'
        player.spawnAtSurface()
       
        health.reset()
		if (dropManager) {
			dropManager.canPickup = true
		}
        health.setSpawnProtection(5)
        const respawnEv = emitModEvent(new PlayerRespawnEvent(player, { worldId: activeWorldMeta.id }), { player, inventory, health, world })
        if (respawnEv.cancelled) return
        renderer.domElement.requestPointerLock?.()
      },
      onQuit: () => {
        deathOverlay.style.display = 'none'
        saveAndQuitToMenu()
      }
    })
  }
  saveActiveWorld()
}

