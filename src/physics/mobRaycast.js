import { REACH } from '../config/constants.js'

export function raycastMobs(origin, dir, mobs, maxDist) {
  const reach = maxDist || REACH
  let closest = null
  let closestT = reach

  for (const mob of mobs) {
    if (mob.dead || mob.dying) continue

    const halfW = mob.half != null ? mob.half : 0.4
    const height = mob.height != null ? mob.height : 1.0
    const minX = mob.position.x - halfW
    const maxX = mob.position.x + halfW
    const minY = mob.position.y
    const maxY = mob.position.y + height
    const minZ = mob.position.z - halfW
    const maxZ = mob.position.z + halfW

    let tmin = 0
    let tmax = closestT
    let hit = true

    const ox = [origin.x, origin.y, origin.z]
    const dx = [dir.x, dir.y, dir.z]
    const lo = [minX, minY, minZ]
    const hi = [maxX, maxY, maxZ]

    for (let a = 0; a < 3; a++) {
      if (Math.abs(dx[a]) < 1e-8) {
        if (ox[a] < lo[a] || ox[a] > hi[a]) { hit = false; break }
      } else {
        let t1 = (lo[a] - ox[a]) / dx[a]
        let t2 = (hi[a] - ox[a]) / dx[a]
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
        if (t1 > tmin) tmin = t1
        if (t2 < tmax) tmax = t2
        if (tmin > tmax) { hit = false; break }
      }
    }

    if (hit && tmin >= 0 && tmin < closestT) {
      closestT = tmin
      closest = { mob, dist: tmin }
    }
  }

  return closest
}
