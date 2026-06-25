// Pure power-propagation helpers for the redstone engine.
// No game-state dependencies: callers pass in lookups so this stays testable
// and free of circular imports.

export const MAX_POWER = 15

// Six axis-aligned neighbors. Redstone dust propagation in this simplified
// model spreads horizontally and to immediate vertical neighbors.
export const NEIGHBORS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
]

function key(x, y, z) {
  return x + ',' + y + ',' + z
}

export function parseKey(k) {
  const [x, y, z] = k.split(',').map(Number)
  return { x, y, z }
}

// BFS from every source. Each source emits MAX_POWER; power attenuates by 1 per
// conducting cell. Returns a Map of cellKey -> power level (1..MAX_POWER).
//
// - isSource(x,y,z)   -> true for constant emitters (redstone block, lever on, torch)
// - isConductor(x,y,z) -> true for cells signal can travel through (dust)
export function computePower({ sources, isConductor }) {
  const power = new Map()
  const queue = []

  for (const { x, y, z } of sources) {
    const k = key(x, y, z)
    power.set(k, MAX_POWER)
    queue.push({ x, y, z, level: MAX_POWER })
  }

  let head = 0
  while (head < queue.length) {
    const { x, y, z, level } = queue[head++]
    if (level <= 1) continue
    const next = level - 1
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (!isConductor(nx, ny, nz)) continue
      const nk = key(nx, ny, nz)
      const existing = power.get(nk) || 0
      if (next <= existing) continue
      power.set(nk, next)
      queue.push({ x: nx, y: ny, z: nz, level: next })
    }
  }

  return power
}

export { key }
