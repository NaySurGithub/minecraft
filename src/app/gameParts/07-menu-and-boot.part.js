window.addEventListener('beforeunload', () => saveActiveWorld())
window.addEventListener('pagehide', () => saveActiveWorld())
configureAutosave()

const menuCallbacks = {
  create: (meta) => startGame(meta, null),
  play: (id) => {
    const data = loadWorldData(id)
    if (data) startGame(data, data)
  },
  host: (id) => {
    const data = loadWorldData(id)
    if (data) startGame(data, data, { mode: 'host' })
  },
  join: (roomCode) => {
    const now = new Date().toISOString()
    startGame({
      id: 'remote_' + roomCode,
      name: t('multiplayer'),
      seed: roomCode,
      gameMode: GAME_MODE.SURVIVAL,
      createdAt: now,
      openedAt: now,
      savedAt: now
    }, null, { mode: 'client', roomCode })
  },
  getWorldMods: () => activeWorldMeta?.mods || [],
  addWorldMod: (manifest) => {
    if (!activeWorldMeta) return false
    activeWorldMeta.mods = [...(activeWorldMeta.mods || []), manifest]
    applyModManifest(manifest)
    rebuildAtlas()
    saveActiveWorld()
    return true
  },
  removeWorldMod: (name) => {
    if (!gameStarted || !activeWorldMeta) return false
    const before = activeWorldMeta.mods || []
    const after = before.filter((mod) => mod?.name !== name)
    if (after.length === before.length) return false
    activeWorldMeta.mods = after
    saveActiveWorld()
    window.alert('Mod removed from this world. Reload the world to fully unload it.')
    return true
  },
  canChangeGameMode: () => Boolean(gameStarted && activeWorldMeta?.defaultGameMode === GAME_MODE.CREATIVE && gamemode),
  getGameMode: () => gamemode ? gamemode.get() : null,
  setGameMode: (mode) => {
    if (!gameStarted || activeWorldMeta?.defaultGameMode !== GAME_MODE.CREATIVE || !gamemode) return false
    gamemode.set(mode)
    applyFlightForGameMode(mode)
    saveActiveWorld()
    return true
  },
  exportWorld: exportCurrentWorld,
  importWorld: importWorldFromFile,
  applySettings
}

prompts = createPrompts({ app, menu, menuCallbacks, settingsRef, applySettings })

async function boot() {
  await prompts.chooseLanguage()

  const params = new URLSearchParams(window.location.search)
  const importUrl = params.get('importUrl')
  if (importUrl) {
    try {
      const response = await fetch(importUrl)
      const data = await response.json()
      const imported = importNzLevel(data)
      if (imported) {
        saveWorld(imported, null, null, null, null, null, null, null)
        await startGame(imported, imported)
        loop()
        return
      }
    } catch (e) {
      console.error('Failed to import world from URL:', e)
    }
  }

  menu.showMain(menuCallbacks)
  loop()
}

boot()

