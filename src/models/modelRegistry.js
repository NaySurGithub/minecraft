import * as THREE from 'three'
import { parseOBJ } from './objLoader.js'

// Maps a model name -> THREE.BufferGeometry. Built-in procedural geometries
// cover lever, redstone_torch/torch, and redstone_dust so they render with no
// .obj files present. Custom OBJ models can be registered at runtime.
//
// Geometries are cached and SHARED across all mesh instances of the same model.
// Never dispose a registry geometry while any instance mesh still uses it.

const cache = new Map()
const objText = new Map()

// Bake a flat vertex color onto a geometry so the shared MeshBasicMaterial
// (vertexColors: true) renders the model with a recognizable tint even when
// the geometry carries no atlas UVs.
function applyColor(geometry, r, g, b) {
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

// A thin upright post (used for lever handle and torch stick). Centered on
// x/z, resting on the block floor (y from 0 up to height).
function buildPost(width, height, r, g, b) {
  const geo = new THREE.BoxGeometry(width, height, width)
  geo.translate(0.5, height / 2, 0.5)
  return applyColor(geo, r, g, b)
}

function buildLever() {
  // Layered base + pivot + angled handle to mimic the in-game lever silhouette.
  const plate = new THREE.BoxGeometry(0.48, 0.12, 0.32)
  plate.translate(0.5, 0.05, 0.5)
  applyColor(plate, 0.46, 0.46, 0.48)

  const mount = new THREE.BoxGeometry(0.24, 0.2, 0.24)
  mount.translate(0.56, 0.14, 0.5)
  applyColor(mount, 0.58, 0.54, 0.42)

  const pivot = new THREE.BoxGeometry(0.1, 0.12, 0.1)
  pivot.translate(0.56, 0.22, 0.5)
  applyColor(pivot, 0.32, 0.24, 0.14)

  const arm = new THREE.BoxGeometry(0.1, 0.52, 0.1)
  arm.translate(0.68, 0.34, 0.5)
  arm.rotateZ(-0.72)
  arm.translate(-0.16, 0.02, 0)
  applyColor(arm, 0.68, 0.58, 0.4)

  const tip = new THREE.BoxGeometry(0.09, 0.1, 0.09)
  tip.translate(0.86, 0.38, 0.5)
  applyColor(tip, 0.26, 0.2, 0.14)

  return mergeGeometries([plate, mount, pivot, arm, tip])
}

function buildTorch() {
  const stick = buildPost(0.12, 0.625, 0.47, 0.32, 0.16)
  const head = new THREE.BoxGeometry(0.18, 0.18, 0.18)
  head.translate(0.5, 0.7, 0.5)
  applyColor(head, 0.78, 0.16, 0.12)
  return mergeGeometries([stick, head])
}

function buildDust() {
  // Flat plate laid on the floor.
  const geo = new THREE.BoxGeometry(0.9, 0.04, 0.9)
  geo.translate(0.5, 0.02, 0.5)
  return applyColor(geo, 0.47, 0.0, 0.0)
}

function buildFurnace() {
  const body = new THREE.BoxGeometry(1, 1, 1)
  applyColor(body, 0.52, 0.52, 0.54)

  const inset = new THREE.BoxGeometry(0.72, 0.72, 0.12)
  inset.translate(0, 0, 0.44)
  applyColor(inset, 0.1, 0.1, 0.1)

  const opening = new THREE.BoxGeometry(0.42, 0.18, 0.08)
  opening.translate(0, 0.12, 0.47)
  applyColor(opening, 0.03, 0.03, 0.03)

  const lowerOpening = new THREE.BoxGeometry(0.42, 0.18, 0.08)
  lowerOpening.translate(0, -0.22, 0.47)
  applyColor(lowerOpening, 0.03, 0.03, 0.03)

  const sideBand = new THREE.BoxGeometry(0.14, 1, 0.14)
  sideBand.translate(-0.43, 0, 0.42)
  applyColor(sideBand, 0.18, 0.18, 0.18)

  const sideBand2 = sideBand.clone()
  sideBand2.translate(0.86, 0, 0)

  return mergeGeometries([body, inset, opening, lowerOpening, sideBand, sideBand2])
}

function buildLadder() {
  const rail1 = new THREE.BoxGeometry(0.08, 1, 0.08)
  rail1.translate(0.35, 0.5, 0.48)
  applyColor(rail1, 0.65, 0.48, 0.24)
  const rail2 = rail1.clone()
  rail2.translate(0.3, 0, 0)
  const rung1 = new THREE.BoxGeometry(0.6, 0.08, 0.08)
  rung1.translate(0.5, 0.2, 0.48)
  applyColor(rung1, 0.75, 0.56, 0.28)
  const rung2 = rung1.clone()
  rung2.translate(0, 0.3, 0)
  const rung3 = rung1.clone()
  rung3.translate(0, 0.6, 0)
  return mergeGeometries([rail1, rail2, rung1, rung2, rung3])
}

function buildPortal() {
  const frame = new THREE.BoxGeometry(1, 1, 0.1)
  frame.translate(0.5, 0.5, 0.5)
  applyColor(frame, 0.22, 0.06, 0.28)
  const core = new THREE.BoxGeometry(0.72, 0.9, 0.03)
  core.translate(0.5, 0.5, 0.54)
  applyColor(core, 0.55, 0.16, 0.72)
  return mergeGeometries([frame, core])
}

// Minimal geometry merge (positions/normals/uv/color) so we avoid pulling in
// three/examples. All inputs are non-indexed BoxGeometries with matching attrs.
function mergeGeometries(geoms) {
  const merged = new THREE.BufferGeometry()
  const arrays = { position: [], normal: [], uv: [], color: [] }
  for (const g of geoms) {
    const idx = g.getIndex()
    const pos = g.getAttribute('position')
    const norm = g.getAttribute('normal')
    const uv = g.getAttribute('uv')
    const col = g.getAttribute('color')
    const expand = (attr, size, target, order) => {
      if (order) {
        for (let i = 0; i < order.length; i++) {
          const v = order[i]
          for (let k = 0; k < size; k++) target.push(attr.array[v * size + k])
        }
      } else {
        for (let i = 0; i < attr.count * size; i++) target.push(attr.array[i])
      }
    }
    const order = idx ? Array.from(idx.array) : null
    expand(pos, 3, arrays.position, order)
    if (norm) expand(norm, 3, arrays.normal, order)
    if (uv) expand(uv, 2, arrays.uv, order)
    if (col) expand(col, 3, arrays.color, order)
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3))
  if (arrays.normal.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3))
  if (arrays.uv.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2))
  if (arrays.color.length) merged.setAttribute('color', new THREE.Float32BufferAttribute(arrays.color, 3))
  merged.computeBoundingSphere()
  return merged
}

const builders = {
  lever: buildLever,
  torch: buildTorch,
  redstone_torch: buildTorch,
  redstone_dust: buildDust,
  furnace: buildFurnace
  , ladder: buildLadder
  , portal: buildPortal
}

export function registerObjModel(name, text) {
  objText.set(name, text)
  cache.delete(name)
}

export function getModelGeometry(name) {
  if (!name) return null
  if (cache.has(name)) return cache.get(name)
  let geo = null
  if (objText.has(name)) {
    geo = parseOBJ(objText.get(name))
    if (!geo.getAttribute('color')) applyColor(geo, 0.8, 0.8, 0.8)
  } else if (builders[name]) {
    geo = builders[name]()
  }
  if (geo) cache.set(name, geo)
  return geo
}
