import * as THREE from 'three'
import { blocksByName } from '../blocks/registry.js'
import { getThing, isItemId } from '../items/itemRegistry.js'
import { getModelGeometry } from '../models/modelRegistry.js'

function buildCubeGeometry(atlas, blockId) {
  const tiles = atlas.faceTiles(blockId)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const uvAttr = geometry.attributes.uv
  const top = atlas.tileUV(tiles ? tiles.top : 0)
  const bottom = atlas.tileUV(tiles ? tiles.bottom : 0)
  const side = atlas.tileUV(tiles ? tiles.side : 0)

  const faceUV = [side, side, top, bottom, side, side]
  for (let f = 0; f < 6; f++) {
    const uv = faceUV[f]
    const base = f * 4
    uvAttr.setXY(base + 0, uv.u0, uv.v1)
    uvAttr.setXY(base + 1, uv.u1, uv.v1)
    uvAttr.setXY(base + 2, uv.u0, uv.v0)
    uvAttr.setXY(base + 3, uv.u1, uv.v0)
  }
  uvAttr.needsUpdate = true
  return geometry
}

function itemColor(item, fallback = [220, 220, 220]) {
  return item?.color || fallback
}

function shadeColor(color, delta) {
  return [
    Math.max(0, Math.min(255, color[0] + delta)),
    Math.max(0, Math.min(255, color[1] + delta)),
    Math.max(0, Math.min(255, color[2] + delta))
  ]
}

function materialFromRgb(color, options = {}) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
    ...options
  })
}

function addBox(group, size, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat)
  mesh.position.set(pos[0], pos[1], pos[2])
  mesh.rotation.set(rot[0], rot[1], rot[2])
  group.add(mesh)
  return mesh
}

function addCylinder(group, radiusTop, radiusBottom, height, segments, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), mat)
  mesh.position.set(pos[0], pos[1], pos[2])
  mesh.rotation.set(rot[0], rot[1], rot[2])
  group.add(mesh)
  return mesh
}

function hashName(name) {
  let h = 2166136261
  const s = String(name || 'unknown')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function buildToolMesh(item) {
  const group = new THREE.Group()
  const c = itemColor(item)
  const material = materialFromRgb(c)
  const bright = materialFromRgb(shadeColor(c, 34))
  const dark = materialFromRgb(shadeColor(c, -46))
  const handleMat = materialFromRgb([122, 79, 42])
  const kind = item.toolKind

  if (kind === 'flint_and_steel') {
    addBox(group, [0.22, 0.48, 0.12], materialFromRgb([50, 52, 58]), [-0.1, -0.06, 0])
    addBox(group, [0.42, 0.12, 0.12], materialFromRgb([196, 196, 202]), [0.08, 0.16, 0])
    addBox(group, [0.16, 0.46, 0.1], materialFromRgb([220, 220, 226]), [0.18, -0.08, 0])
    addBox(group, [0.08, 0.12, 0.08], materialFromRgb([255, 186, 64]), [0.28, 0.3, 0])
    group.rotation.set(0.15, -0.25, -0.55)
    return group
  }

  if (kind === 'bow') {
    const wood = materialFromRgb([126, 76, 38])
    const string = materialFromRgb([232, 232, 218])
    addCylinder(group, 0.035, 0.035, 0.9, 8, wood, [0, 0, 0], [0, 0, -0.28])
    addCylinder(group, 0.035, 0.035, 0.9, 8, wood, [0.22, 0, 0], [0, 0, 0.28])
    addBox(group, [0.05, 0.9, 0.04], string, [0.1, 0, -0.12])
    addBox(group, [0.14, 0.12, 0.08], dark, [0.1, -0.04, 0])
    group.rotation.set(0.1, -0.35, -0.35)
    return group
  }

  const handleLength = kind === 'sword' ? 0.44 : 0.92
  addBox(group, [0.12, handleLength, 0.12], handleMat, [0, kind === 'sword' ? -0.36 : -0.24, 0])

  if (kind === 'pickaxe') {
    addBox(group, [0.86, 0.14, 0.14], material, [0, 0.3, 0])
    addBox(group, [0.18, 0.32, 0.14], material, [-0.33, 0.2, 0])
    addBox(group, [0.18, 0.32, 0.14], material, [0.33, 0.2, 0])
    addBox(group, [0.22, 0.08, 0.16], bright, [0, 0.4, 0])
  } else if (kind === 'hoe') {
    addBox(group, [0.58, 0.12, 0.14], material, [0.24, 0.34, 0])
    addBox(group, [0.14, 0.28, 0.14], material, [0.48, 0.2, 0])
    addBox(group, [0.34, 0.06, 0.15], bright, [0.32, 0.43, 0])
  } else if (kind === 'axe') {
    addBox(group, [0.44, 0.34, 0.14], material, [0.2, 0.28, 0])
    addBox(group, [0.16, 0.46, 0.14], material, [0.42, 0.18, 0])
    addBox(group, [0.14, 0.24, 0.14], dark, [-0.08, 0.24, 0])
  } else if (kind === 'shovel' || kind === 'spade') {
    addCylinder(group, 0.14, 0.2, 0.34, 8, material, [0, 0.32, 0])
    addBox(group, [0.14, 0.08, 0.12], bright, [0, 0.52, 0])
  } else {
    addBox(group, [0.14, 0.72, 0.08], material, [0, 0.16, 0])
    addBox(group, [0.08, 0.28, 0.08], bright, [0, 0.66, 0])
    addBox(group, [0.52, 0.1, 0.12], dark, [0, -0.14, 0])
    addBox(group, [0.12, 0.2, 0.12], handleMat, [0, -0.6, 0])
  }
  group.rotation.set(0, 0, -0.75)
  return group
}

function buildResourceMesh(item) {
  const group = new THREE.Group()
  const c = itemColor(item)
  const mat = materialFromRgb(c)
  const brightMat = materialFromRgb(shadeColor(c, 42))
  const darkMat = materialFromRgb(shadeColor(c, -46))

  if (item.name === 'stick') {
    addBox(group, [0.12, 0.78, 0.12], materialFromRgb([138, 90, 43]), [0, 0, 0], [0, 0, -0.55])
    addBox(group, [0.06, 0.72, 0.13], materialFromRgb([176, 114, 58]), [-0.03, 0.02, 0.01], [0, 0, -0.55])
  } else if (item.name === 'coal') {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), mat)
    group.add(mesh)
    addBox(group, [0.12, 0.06, 0.08], brightMat, [0.08, 0.1, 0.08], [0.2, 0.1, 0.3])
  } else if (item.name === 'diamond' || item.name === 'emerald' || item.name === 'lapis_lazuli') {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat)
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), brightMat)
    spark.position.set(0.12, 0.08, -0.06)
    group.add(mesh, spark)
  } else if (item.name === 'redstone' || item.name === 'redstone_dust') {
    addBox(group, [0.42, 0.08, 0.28], mat, [0, -0.02, 0], [0.1, 0.2, -0.12])
    addBox(group, [0.22, 0.08, 0.18], brightMat, [-0.1, 0.06, 0.04], [0.2, -0.1, 0.25])
    addBox(group, [0.12, 0.06, 0.12], darkMat, [0.18, 0.04, -0.05], [0.1, 0.3, 0.1])
  } else if (item.name === 'bone_meal') {
    const powder = materialFromRgb([235, 235, 226])
    const shade = materialFromRgb([184, 184, 168])
    addCylinder(group, 0.24, 0.3, 0.12, 8, powder, [0, -0.06, 0])
    addCylinder(group, 0.12, 0.16, 0.08, 8, powder, [-0.08, 0.03, 0.03])
    addBox(group, [0.12, 0.06, 0.08], shade, [0.12, 0.02, -0.04], [0.2, 0.1, -0.2])
  } else if (item.name === 'wheat_seeds') {
    const seedMat = materialFromRgb([178, 160, 96])
    const seedDark = materialFromRgb([114, 96, 52])
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), i % 2 ? seedMat : seedDark)
      mesh.scale.set(1.35, 0.55, 0.8)
      mesh.position.set((i - 2) * 0.08, (i % 2) * 0.04, (i % 3 - 1) * 0.06)
      group.add(mesh)
    }
  } else if (item.name === 'wheat') {
    const stem = materialFromRgb([150, 100, 35])
    const grain = materialFromRgb([222, 188, 82])
    for (let i = -1; i <= 1; i++) {
      addBox(group, [0.04, 0.72, 0.04], stem, [i * 0.08, -0.08, 0], [0, 0, i * -0.16])
      addBox(group, [0.12, 0.18, 0.06], grain, [i * 0.1, 0.28, 0], [0.1, 0, i * 0.4])
    }
  } else if (item.name === 'raw_iron' || item.name === 'raw_gold' || item.name === 'raw_copper') {
    const nugget = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), mat)
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), brightMat)
    cap.position.set(0.1, 0.08, -0.04)
    group.add(nugget, cap)
  } else if (item.name === 'iron_ingot' || item.name === 'gold_ingot' || item.name === 'copper_ingot') {
    addBox(group, [0.46, 0.16, 0.24], mat)
    addBox(group, [0.32, 0.05, 0.15], brightMat, [0, 0.11, 0])
    addBox(group, [0.12, 0.08, 0.12], darkMat, [-0.14, -0.04, 0.04])
  } else {
    return buildGeneratedItemMesh(item)
  }

  group.rotation.set(0.4, -0.7, 0.2)
  return group
}

function buildCustomModelMesh(name, atlasMaterial) {
  const geo = getModelGeometry(name)
  if (!geo) return null
  const mesh = new THREE.Mesh(geo.clone(), atlasMaterial)
  mesh.scale.setScalar(0.5)
  mesh.rotation.set(0.4, -0.8, 0.15)
  return mesh
}

function buildArmorMesh(item) {
  const group = new THREE.Group()
  const c = itemColor(item)
  const mat = materialFromRgb(c)
  const dark = materialFromRgb(shadeColor(c, -50))
  const bright = materialFromRgb(shadeColor(c, 32))

  if (item.armorType === 'helmet') {
    addBox(group, [0.5, 0.34, 0.36], mat, [0, 0.05, 0])
    addBox(group, [0.62, 0.1, 0.42], dark, [0, -0.16, 0])
    addBox(group, [0.16, 0.14, 0.12], bright, [0, 0.27, 0.02])
  } else if (item.armorType === 'chestplate') {
    addBox(group, [0.48, 0.56, 0.24], mat, [0, 0, 0])
    addBox(group, [0.22, 0.18, 0.24], mat, [-0.34, 0.16, 0])
    addBox(group, [0.22, 0.18, 0.24], mat, [0.34, 0.16, 0])
    addBox(group, [0.18, 0.22, 0.25], dark, [-0.12, -0.38, 0])
    addBox(group, [0.18, 0.22, 0.25], dark, [0.12, -0.38, 0])
    addBox(group, [0.34, 0.08, 0.26], bright, [0, 0.24, 0.02])
  } else if (item.armorType === 'leggings') {
    addBox(group, [0.52, 0.16, 0.24], dark, [0, 0.24, 0])
    addBox(group, [0.18, 0.58, 0.22], mat, [-0.13, -0.1, 0])
    addBox(group, [0.18, 0.58, 0.22], mat, [0.13, -0.1, 0])
    addBox(group, [0.14, 0.2, 0.23], bright, [-0.13, 0.08, 0.02])
    addBox(group, [0.14, 0.2, 0.23], bright, [0.13, 0.08, 0.02])
  } else if (item.armorType === 'boots') {
    addBox(group, [0.18, 0.34, 0.2], mat, [-0.15, 0.05, 0])
    addBox(group, [0.18, 0.34, 0.2], mat, [0.15, 0.05, 0])
    addBox(group, [0.28, 0.12, 0.34], dark, [-0.15, -0.16, 0.06])
    addBox(group, [0.28, 0.12, 0.34], dark, [0.15, -0.16, 0.06])
    addBox(group, [0.12, 0.05, 0.2], bright, [-0.15, 0.24, 0.02])
    addBox(group, [0.12, 0.05, 0.2], bright, [0.15, 0.24, 0.02])
  } else {
    return buildGeneratedItemMesh(item)
  }

  group.rotation.set(0.25, -0.55, 0.15)
  return group
}

function buildFoodMesh(item) {
  const group = new THREE.Group()
  const c = itemColor(item)
  const mat = materialFromRgb(c)
  const highlight = materialFromRgb(shadeColor(c, 36))
  const dark = materialFromRgb(shadeColor(c, -48))

  if (item.name === 'carrot_item') {
    addCylinder(group, 0.06, 0.16, 0.48, 8, mat, [0, -0.05, 0], [0.15, 0.1, -0.18])
    addBox(group, [0.08, 0.18, 0.04], materialFromRgb([66, 150, 48]), [-0.05, 0.26, 0], [0, 0, -0.4])
    addBox(group, [0.08, 0.2, 0.04], materialFromRgb([80, 178, 62]), [0.04, 0.27, 0], [0, 0, 0.35])
    addBox(group, [0.08, 0.05, 0.04], highlight, [0.03, 0.04, 0.08], [0.2, 0, 0])
  } else if (item.name === 'potato_item') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mat)
    body.scale.set(1.15, 0.85, 0.75)
    group.add(body)
    addBox(group, [0.06, 0.04, 0.03], dark, [0.08, 0.06, 0.16], [0.1, 0.2, 0.4])
    addBox(group, [0.05, 0.04, 0.03], dark, [-0.1, -0.05, 0.13], [0.1, -0.2, -0.3])
    addBox(group, [0.11, 0.05, 0.04], highlight, [-0.04, 0.1, 0.13])
  } else if (item.name === 'mutton' || item.name === 'cooked_mutton') {
    const meat = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat)
    meat.scale.set(1.25, 0.85, 0.7)
    group.add(meat)
    addCylinder(group, 0.045, 0.045, 0.46, 8, materialFromRgb([236, 224, 196]), [0.24, 0.02, 0], [0, 0, Math.PI / 2])
    addBox(group, [0.08, 0.08, 0.08], materialFromRgb([246, 238, 216]), [0.45, 0.02, 0])
    addBox(group, [0.16, 0.06, 0.04], highlight, [-0.08, 0.1, 0.14], [0.1, 0.2, -0.2])
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat)
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), highlight)
    top.position.set(0.08, 0.12, 0.02)
    group.add(body, top)
  }

  group.rotation.set(0.25, -0.35, 0.12)
  return group
}

function buildSpawnEggMesh(item) {
  const group = new THREE.Group()
  const c = item.color || [220, 220, 220]
  const color = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
  const shell = new THREE.MeshBasicMaterial({ color })
  const accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(Math.min(1, color.r + 0.22), Math.min(1, color.g + 0.22), Math.min(1, color.b + 0.22)) })
  const dark = new THREE.MeshBasicMaterial({ color: new THREE.Color(Math.max(0, color.r - 0.18), Math.max(0, color.g - 0.18), Math.max(0, color.b - 0.18)) })
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8, 0, Math.PI * 2, 0, Math.PI), shell)
  egg.scale.set(1, 1.35, 0.95)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), accent)
  cap.position.y = 0.1
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), dark)
  base.position.y = -0.16
  group.add(egg, cap, base)
  group.rotation.set(0.2, -0.5, -0.2)
  return group
}

function buildBucketMesh(item) {
  const group = new THREE.Group()
  const c = item.color || [176, 176, 176]
  const color = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)
  const metal = new THREE.MeshBasicMaterial({ color })
  const inner = new THREE.MeshBasicMaterial({ color: 0x666666 })
  const shadow = new THREE.MeshBasicMaterial({ color: 0x3a3a3a })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.34, 8, 1, true), metal)
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8), shadow)
  lip.position.y = 0.17
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 8), inner)
  bottom.position.y = -0.16
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 8), metal)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.18
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 4, 10, Math.PI), metal)
  handle.rotation.z = Math.PI / 2
  handle.rotation.y = Math.PI / 2
  handle.position.y = 0.18
  handle.position.z = -0.02
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), shadow)
  clasp.position.set(0.14, 0.06, 0)
  group.add(body, lip, bottom, rim, handle, clasp)
  group.rotation.set(0.28, -0.35, 0.12)
  return group
}

function buildFilledBucketMesh(item) {
  const group = buildBucketMesh(item)
  const fillColor = item.name === 'lava_bucket' ? 0xff6b1a : 0x3f8ee6
  const fillMat = new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: 0.95 })
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 6), fillMat)
  fill.position.y = 0.02
  group.add(fill)
  return group
}

const RESOURCE_MODEL_ITEMS = new Set([
  'stick',
  'coal',
  'raw_copper',
  'raw_iron',
  'raw_gold',
  'redstone',
  'redstone_dust',
  'lapis_lazuli',
  'diamond',
  'emerald',
  'iron_ingot',
  'gold_ingot',
  'copper_ingot',
  'wheat_seeds',
  'bone_meal',
  'wheat'
])

function hasResourceMesh(item) {
  return RESOURCE_MODEL_ITEMS.has(item?.name)
}

function buildGeneratedItemMesh(item) {
  const group = new THREE.Group()
  const c = itemColor(item)
  const mat = materialFromRgb(c)
  const bright = materialFromRgb(shadeColor(c, 42))
  const dark = materialFromRgb(shadeColor(c, -52))
  const h = hashName(item?.name)
  const variant = h % 6
  let body

  if (variant === 0) {
    body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), mat)
  } else if (variant === 1) {
    body = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat)
    body.scale.set(1, 0.8, 0.65)
  } else if (variant === 2) {
    body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.36, 7), mat)
  } else if (variant === 3) {
    body = new THREE.Mesh(new THREE.TetrahedronGeometry(0.34, 0), mat)
  } else if (variant === 4) {
    body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mat)
    body.scale.set(1.25, 0.85, 0.55)
  } else {
    body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.22), mat)
  }

  group.add(body)
  const offset = ((h >>> 4) & 3) * 0.04 - 0.06
  addBox(group, [0.22, 0.06, 0.08], bright, [-0.04, 0.16, 0.12], [0.15, 0.25, -0.2])
  addBox(group, [0.1, 0.08, 0.08], dark, [0.14 + offset, -0.1, -0.1], [0.1, -0.2, 0.35])
  if ((h & 1) === 0) {
    addCylinder(group, 0.04, 0.04, 0.28, 6, dark, [-0.18, 0.02, 0], [0, 0, Math.PI / 2])
  } else {
    addBox(group, [0.08, 0.24, 0.08], dark, [-0.18, 0.02, 0], [0.2, 0.2, -0.4])
  }
  group.rotation.set(0.35, -0.6, 0.2)
  return group
}

function buildArrowMesh() {
  const group = new THREE.Group()
  const shaft = materialFromRgb([216, 210, 185])
  const head = materialFromRgb([150, 150, 150])
  const feather = materialFromRgb([245, 245, 238])
  addBox(group, [0.05, 0.78, 0.05], shaft, [0, 0, 0], [0, 0, -0.55])
  addCylinder(group, 0.08, 0.02, 0.16, 6, head, [-0.24, 0.34, 0], [0, 0, Math.PI / 2])
  addBox(group, [0.18, 0.04, 0.1], feather, [0.22, -0.31, 0.03], [0, 0, -0.55])
  group.rotation.set(0.35, -0.55, 0.2)
  return group
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material && child.material !== object.material) child.material.dispose()
  })
  if (object.geometry) object.geometry.dispose()
}

export class HeldItem {
  constructor(renderer, atlas, material) {
    this.renderer = renderer
    this.atlas = atlas
    this.material = new THREE.MeshBasicMaterial({ map: atlas.texture })
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    this.camera.position.set(0, 0, 3)
    this.camera.lookAt(0, 0, 0)
    const amb = new THREE.AmbientLight(0xffffff, 0.9)
    const dir = new THREE.DirectionalLight(0xffffff, 0.6)
    dir.position.set(0.5, 1, 1)
    this.scene.add(amb)
    this.scene.add(dir)
    this.mesh = null
    this.currentBlockId = null
    this.swing = 0
    this.swinging = false
    this.basePos = new THREE.Vector3(0.55, -0.55, 0)
    this.baseScale = 0.42
  }

  setBlock(blockId) {
    if (blockId === this.currentBlockId) return
    this.currentBlockId = blockId
    if (this.mesh) {
      this.scene.remove(this.mesh)
      disposeObject(this.mesh)
      this.mesh = null
    }
    if (blockId == null) return
    const thing = getThing(blockId)
    const customModelName = thing?.model || thing?.heldModel || thing?.renderModel || thing?.name
    const customModel = isItemId(blockId) ? buildCustomModelMesh(customModelName, this.material) : null
    const itemBlockForm = isItemId(blockId) ? blocksByName.get(thing?.name) : null
    if (customModel) {
      this.mesh = customModel
    } else if (itemBlockForm && itemBlockForm.name !== 'air') {
      const geometry = buildCubeGeometry(this.atlas, itemBlockForm.id)
      this.mesh = new THREE.Mesh(geometry, this.material)
    } else if (isItemId(blockId) && thing?.toolKind === 'bucket') {
      this.mesh = (thing.name === 'water_bucket' || thing.name === 'lava_bucket') ? buildFilledBucketMesh(thing) : buildBucketMesh(thing)
    } else if (isItemId(blockId) && thing?.category === 'tool') {
      this.mesh = buildToolMesh(thing)
    } else if (isItemId(blockId) && thing?.name === 'arrow') {
      this.mesh = buildArrowMesh()
    } else if (isItemId(blockId) && thing?.category === 'armor') {
      this.mesh = buildArmorMesh(thing)
    } else if (isItemId(blockId) && thing?.category === 'spawn_egg') {
      this.mesh = buildSpawnEggMesh(thing)
    } else if (isItemId(blockId) && thing?.food) {
      this.mesh = buildFoodMesh(thing)
    } else if (isItemId(blockId) && hasResourceMesh(thing)) {
      this.mesh = buildResourceMesh(thing)
    } else if (isItemId(blockId)) {
      this.mesh = buildGeneratedItemMesh(thing || { name: 'item_' + blockId })
    } else {
      const geometry = buildCubeGeometry(this.atlas, blockId)
      this.mesh = new THREE.Mesh(geometry, this.material)
    }
    this.mesh.scale.setScalar(this.baseScale)
    this.mesh.position.copy(this.basePos)
    this.mesh.rotation.set(0.5, -0.7, 0)
    this.scene.add(this.mesh)
  }

  triggerSwing() {
    this.swing = 0
    this.swinging = true
  }

  update(dt) {
    if (this.swinging) {
      this.swing += dt * 6
      if (this.swing >= Math.PI) {
        this.swing = 0
        this.swinging = false
      }
    }
    if (this.mesh) {
      const s = Math.sin(this.swinging ? this.swing : 0)
      this.mesh.position.set(
        this.basePos.x - s * 0.18,
        this.basePos.y - s * 0.22,
        this.basePos.z
      )
      this.mesh.rotation.set(0.5 + s * 0.6, -0.7 + s * 0.4, 0)
    }
  }

  resize(width, height) {
    const aspect = width / height
    this.camera.left = -aspect
    this.camera.right = aspect
    this.camera.top = 1
    this.camera.bottom = -1
    this.camera.updateProjectionMatrix()
  }

  render() {
    if (!this.mesh) return
    const autoClear = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.clearDepth()
    this.renderer.render(this.scene, this.camera)
    this.renderer.autoClear = autoClear
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      disposeObject(this.mesh)
      this.mesh = null
    }
  }
}
