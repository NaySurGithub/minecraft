import JSZip from 'jszip'
import { defineBlock, editBlock } from '../blocks/registry.js'
import { defineItem, editItem } from '../items/itemRegistry.js'
import { defineMob } from '../entities/mobManager.js'
import { registerObjModel } from '../models/modelRegistry.js'
import { clearModEventHandlers, registerModEvents } from './eventBus.js'
import { clearModCommands, registerModCommands } from './commandBus.js'
import { registerModUis, clearModUis } from './uiManager.js'

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^.\//, '')
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('mod.json must be an object.')
  if (!manifest.name) throw new Error('mod.json needs a mod name.')
  if (!manifest.author) throw new Error('mod.json needs an author.')
  manifest.version = manifest.version || '1.0.0'
  manifest.description = manifest.description || ''
  return manifest
}

async function imageFileToPixels(file) {
  const blob = await file.async('blob')
  const bitmap = await createImageBitmap(blob)
  if (bitmap.width !== 16 || bitmap.height !== 16) {
    throw new Error('Texture ' + file.name + ' must be 16x16.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  return {
    width: 16,
    height: 16,
    data: Array.from(ctx.getImageData(0, 0, 16, 16).data)
  }
}

async function collectZipAssets(zip) {
  const assets = {}
  const files = {}
  for (const entry of Object.values(zip.files)) {
    if (!entry.dir) files[normalizePath(entry.name)] = true
  }
  const imageEntries = Object.values(zip.files).filter((entry) => !entry.dir && /\.(png|webp)$/i.test(entry.name))
  for (const entry of imageEntries) {
    assets[normalizePath(entry.name)] = await imageFileToPixels(entry)
  }
  assets.__files = files
  return assets
}

function applyBlockTextures(block, assets) {
  if (!assets) return block
  const out = { ...block }
  const all = out.texture ? assets[normalizePath(out.texture)] : null
  const faces = out.textures || null
  if (all) {
    out.texturePixels = { top: all, bottom: all, side: all }
  }
  if (faces) {
    out.texturePixels = {
      ...(out.texturePixels || {}),
      top: assets[normalizePath(faces.top || faces.side || faces.all)] || out.texturePixels?.top,
      bottom: assets[normalizePath(faces.bottom || faces.side || faces.all)] || out.texturePixels?.bottom,
      side: assets[normalizePath(faces.side || faces.all || faces.top)] || out.texturePixels?.side
    }
  }
  return out
}

function registerModModels(manifest) {
  for (const entry of manifest.models || []) {
    if (!entry || !entry.name) continue
    const text = entry.obj || entry.text || entry.source || ''
    if (text) registerObjModel(String(entry.name), String(text))
  }
}
export { registerModUis, clearModUis } from './uiManager.js'
export function applyModManifest(manifest) {
  validateManifest(manifest)
  if (!manifest || typeof manifest !== 'object') return false
  for (const block of manifest.blocks || []) {
    if (!block || !block.name) continue
    const normalized = applyBlockTextures(block, manifest.assets)
    if (normalized.edit) editBlock(String(normalized.name), normalized)
    else defineBlock(String(normalized.name), normalized)
  }
  for (const item of manifest.items || []) {
    if (!item || !item.name) continue
    if (item.edit) editItem(String(item.name), item)
    else defineItem(String(item.name), item)
  }
  for (const mob of manifest.mobs || []) {
    if (!mob || !mob.type) continue
    defineMob(String(mob.type), mob)
  }
  registerModModels(manifest)
  registerModCommands(manifest)
  registerModEvents(manifest)
  registerModUis(manifest)
  return true
}

export function applyModManifests(mods) {
  clearModEventHandlers()
  clearModCommands()
  clearModUis()
  for (const mod of mods || []) applyModManifest(mod)
}

export async function readModFile(file) {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const entry = zip.file('mod.json')
    if (!entry) throw new Error('ZIP mod must contain mod.json at the root.')
    const manifest = validateManifest(JSON.parse(await entry.async('text')))
    manifest.assets = await collectZipAssets(zip)
    if (!manifest.icon && manifest.assets['icon.png']) manifest.icon = 'icon.png'
    if (manifest.icon && manifest.assets[normalizePath(manifest.icon)]) {
      const iconFile = zip.file(normalizePath(manifest.icon))
      if (iconFile) manifest.iconDataUrl = URL.createObjectURL(await iconFile.async('blob'))
    }
    return manifest
  }
  const text = await file.text()
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return validateManifest(JSON.parse(trimmed))
  throw new Error('Mod upload expects a JSON manifest or a ZIP containing mod.json.')
}
