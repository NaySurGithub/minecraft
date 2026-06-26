import * as THREE from 'three'
import { buildAtlas } from '../textures/atlas.js'
import { World } from '../world/world.js'
import { Player } from '../player/player.js'
import { InputController } from '../player/input.js'
import { raycastVoxel } from '../player/raycast.js'
import { TouchControls } from '../player/touch.js'
import { Inventory } from '../inventory/inventory.js'
import { CraftingTableUI } from '../inventory/craftingTableUI.js'
import { FurnaceUI } from '../inventory/furnaceUI.js'
import { ChestUI } from '../inventory/chestUI.js'
import { InventoryUI } from '../inventory/inventoryUI.js'
import { Gamemode } from '../player/gamemode.js'
import { canPlaceAt } from '../player/placement.js'
import { BreakTimer } from '../player/breakTimer.js'
import { Hotbar } from '../player/hotbar.js'
import { DropManager } from '../entities/dropManager.js'
import { MobManager } from '../entities/mobManager.js'
import { ArrowManager } from '../entities/arrowManager.js'
import { SpawnLoader } from '../ui/spawnLoader.js'
import { ChatUI } from '../ui/chat.js'
import { AchievementManager } from '../ui/achievementManager.js'
import { PacificMobGeneration } from '../entities/pacificMobGeneration.js'
import { VillageGeneration } from '../world/generation/villageGeneration.js'
import { BlockModels } from '../models/BlockModels.js'
import { raycastMobs } from '../physics/mobRaycast.js'
import { BreakOverlay } from '../player/breakOverlay.js'
import { Health } from '../player/health.js'
import { HealthUI } from '../ui/healthUI.js'
import { MinecraftMenu, loadSettings, saveSettings } from '../ui/menu.js'
import { setLanguage, t } from '../ui/translator.js'
import { buildHud, buildPauseOverlay } from '../ui/hud.js'
import { buildDeathOverlay } from '../ui/deathUI.js'
import { RedstoneEngine } from '../redstone/index.js'
import { createPrompts } from './prompts.js'
import { ClientSession } from '../net/clientSession.js'
import { DedicatedClientSession } from '../net/dedicatedClient.js'
import { HostSession } from '../net/hostSession.js'
import { RemoteRenderers } from '../net/remoteRenderers.js'
import { MSG } from '../net/protocol.js'
import { applyEditsToWorld, applyChestsToWorld, applyEnderChestsToWorld, applyTileEntitiesToWorld, collectEdits, loadWorldData, saveWorld, exportNzLevel, importNzLevel, toNzLevelFileName } from '../world/save.js'
import { DayNightCycle, daylightFactor } from '../world/dayNightCycle.js'
import { WeatherParticles } from '../world/weatherParticles.js'
import { normalizeWeather, resolveWeatherTimer, rollNextWeather } from '../world/weatherState.js'
import { Nether } from '../dimensions/Nether.js'
import { NetherTerrainGenerator } from '../world/netherTerrain.js'
import { HeldItem } from '../player/heldItem.js'
import { applyModManifest, applyModManifests, clearModUis } from '../mods/modLoader.js'
import { executeChatCommand } from '../mods/commandBus.js'
import { emitModEvent, emitModPacket } from '../mods/eventBus.js'
import { setModUiHost } from '../mods/uiManager.js'
import { getThing, BUCKET, WATER_BUCKET, LAVA_BUCKET, FLINT_AND_STEEL, BOW, ARROW } from '../items/itemRegistry.js'
import { PlayerJumpEvent } from '../mods/events/PlayerJumpEvent.js'
import { BlockBreakEvent } from '../mods/events/BlockBreakEvent.js'
import { BlockBreakStartEvent } from '../mods/events/BlockBreakStartEvent.js'
import { BlockBreakStopEvent } from '../mods/events/BlockBreakStopEvent.js'
import { BlockPlaceEvent } from '../mods/events/BlockPlaceEvent.js'
import { PlayerInteractEvent } from '../mods/events/PlayerInteractEvent.js'
import { PlayerRightClickBlockEvent } from '../mods/events/PlayerRightClickBlockEvent.js'
import { PlayerMoveEvent } from '../mods/events/PlayerMoveEvent.js'
import { DeathEvent } from '../mods/events/DeathEvent.js'
import { PlayerRespawnEvent } from '../mods/events/PlayerRespawnEvent.js'
import { JoinEvent } from '../mods/events/JoinEvent.js'
import { LeaveEvent } from '../mods/events/LeaveEvent.js'
import { WorldLoadEvent } from '../mods/events/WorldLoadEvent.js'
import { WorldSaveEvent } from '../mods/events/WorldSaveEvent.js'
import { PacketSendEvent } from '../mods/events/PacketSendEvent.js'
import { PacketReceiveEvent } from '../mods/events/PacketReceiveEvent.js'
import { RENDER_DISTANCE, MAX_FPS, DEVICE, SEA_LEVEL, GAME_MODE, CHUNK_SIZE, CHUNK_HEIGHT, ATTACK_REACH } from '../config/constants.js'
import { blocks, blocksByName, blockIds } from '../blocks/registry.js'
import { isReplaceable } from '../player/placement.js'
import { sounds, setVolumeLevels } from '../sounds/soundManager.js'
import { EffectsManager } from '../effects/effectsManager.js'
import { EffectsUI } from '../effects/effectsUI.js'
import { CloudSystem } from '../world/cloudSystem.js'

import setupAndInventory from './gameParts/01-setup-and-inventory.part.js?raw'
import worldWeatherDimensions from './gameParts/02-world-weather-dimensions.part.js?raw'
import travelAndItems from './gameParts/03-travel-and-items.part.js?raw'
import combatPlaceUiLoop from './gameParts/04-combat-place-ui-loop.part.js?raw'
import saveMultiplayerLoad from './gameParts/05-save-multiplayer-load.part.js?raw'
import startGamePart from './gameParts/06-start-game.part.js?raw'
import menuAndBoot from './gameParts/07-menu-and-boot.part.js?raw'

const runtimeParts = [
  setupAndInventory,
  worldWeatherDimensions,
  travelAndItems,
  combatPlaceUiLoop,
  saveMultiplayerLoad,
  startGamePart,
  menuAndBoot
]

const runtimeDeps = {
  THREE,
  buildAtlas,
  World,
  Player,
  InputController,
  raycastVoxel,
  TouchControls,
  Inventory,
  CraftingTableUI,
  FurnaceUI,
  ChestUI,
  InventoryUI,
  Gamemode,
  CloudSystem,
  canPlaceAt,
  BreakTimer,
  Hotbar,
  DropManager,
  MobManager,
  ArrowManager,
  SpawnLoader,
  ChatUI,
  AchievementManager,
  PacificMobGeneration,
  VillageGeneration,
  BlockModels,
  raycastMobs,
  BreakOverlay,
  Health,
  HealthUI,
  MinecraftMenu,
  loadSettings,
  saveSettings,
  setLanguage,
  t,
  buildHud,
  buildPauseOverlay,
  buildDeathOverlay,
  RedstoneEngine,
  createPrompts,
  ClientSession,
  DedicatedClientSession,
  HostSession,
  RemoteRenderers,
  MSG,
  applyEditsToWorld,
  applyChestsToWorld,
  applyEnderChestsToWorld,
  applyTileEntitiesToWorld,
  collectEdits,
  loadWorldData,
  saveWorld,
  exportNzLevel,
  importNzLevel,
  toNzLevelFileName,
  DayNightCycle,
  daylightFactor,
  WeatherParticles,
  normalizeWeather,
  resolveWeatherTimer,
  rollNextWeather,
  Nether,
  NetherTerrainGenerator,
  HeldItem,
  applyModManifest,
  applyModManifests,
  clearModUis,
  executeChatCommand,
  emitModEvent,
  emitModPacket,
  setModUiHost,
  getThing,
  BUCKET,
  WATER_BUCKET,
  LAVA_BUCKET,
  FLINT_AND_STEEL,
  BOW,
  ARROW,
  PlayerJumpEvent,
  BlockBreakEvent,
  BlockBreakStartEvent,
  BlockBreakStopEvent,
  BlockPlaceEvent,
  PlayerInteractEvent,
  PlayerRightClickBlockEvent,
  PlayerMoveEvent,
  DeathEvent,
  PlayerRespawnEvent,
  JoinEvent,
  LeaveEvent,
  WorldLoadEvent,
  WorldSaveEvent,
  PacketSendEvent,
  PacketReceiveEvent,
  RENDER_DISTANCE,
  MAX_FPS,
  DEVICE,
  SEA_LEVEL,
  GAME_MODE,
  CHUNK_SIZE,
  CHUNK_HEIGHT,
  ATTACK_REACH,
  blocks,
  blocksByName,
  blockIds,
  isReplaceable,
  sounds,
  setVolumeLevels,
  EffectsManager,
  EffectsUI
}

const runtimeSource = runtimeParts.join('\n') + '\n//# sourceURL=src/app/game.runtime.js'
Function(...Object.keys(runtimeDeps), runtimeSource)(...Object.values(runtimeDeps))
