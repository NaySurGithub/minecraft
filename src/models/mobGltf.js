import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// One-time cache so each mob model is fetched/parsed once and then cloned per
// spawned mob. Keys are URLs relative to the project root.
const cache = new Map()
const loader = new GLTFLoader()

export function loadMobModel(url) {
  if (cache.has(url)) return cache.get(url)
  const p = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => {
        // Surface failure to the caller; cached rejection means later spawns
        // won't retry endlessly.
        reject(err)
      }
    )
  })
  cache.set(url, p)
  return p
}

import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

// Clone the loaded scene safely. SkeletonUtils.clone handles skinned meshes
// correctly (re-binds bones to the cloned skeleton); falls back to plain
// scene.clone for static meshes.
export function cloneMobScene(gltf) {
  let cloned
  if (typeof SkeletonUtils.clone === 'function') {
    cloned = SkeletonUtils.clone(gltf.scene)
  } else {
    cloned = gltf.scene.clone(true)
  }

  cloned.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map(m => m.clone())
      } else {
        child.material = child.material.clone()
      }
    }
  })
  return cloned
}
