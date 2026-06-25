import { makeRng } from '../world/noise.js'

function clamp8(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

function shade(color, amount) {
  return [clamp8(color[0] + amount), clamp8(color[1] + amount), clamp8(color[2] + amount)]
}

function mix(a, b, t) {
  return [clamp8(a[0] + (b[0] - a[0]) * t), clamp8(a[1] + (b[1] - a[1]) * t), clamp8(a[2] + (b[2] - a[2]) * t)]
}

function highlight(color, amount) {
  return mix(color, [255, 255, 255], amount)
}

function fill(size, fn) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const c = fn(x, y)
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = c.length > 3 ? c[3] : 255
    }
  }
  return data
}

export const generators = {
  solid(size, color) {
    return fill(size, (x, y) => {
      const shadeAmt = Math.sin((x + y) * 0.6) * 6 + ((x ^ y) & 1 ? -2 : 2)
      return shade(color, shadeAmt)
    })
  },
  noise(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, () => {
      const n = (rng() - 0.5) * 36
      return shade(color, n)
    })
  },
  grass(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const n = (rng() - 0.5) * 30
      const base = shade(color, n)
      return base
    })
  },
  wool(size, color, seed) {
    const rng = makeRng(seed)
    const darker = shade(color, -18)
    const lighter = shade(color, 18)
    const fiber = (x, y) => Math.sin((x * 1.7 + y * 1.3) * 0.55 + seed * 0.01)
    return fill(size, (x, y) => {
      const n = (rng() - 0.5) * 28
      const strand = fiber(x, y) * 10
      const speck = rng() > 0.9 ? 10 : 0
      const p = ((x + y * 3 + seed) % 5 === 0) ? -6 : 0
      const edge = (x === 0 || y === 0 || x === size - 1 || y === size - 1) ? -10 : 0
      const base = shade(color, n + strand + speck + p + edge)
      if ((x + y) % 7 === 0) return mix(base, lighter, 0.22)
      if ((x * y) % 11 === 0) return mix(base, darker, 0.12)
      return base
    })
  },
  shiny(size, color, seed) {
    const rng = makeRng(seed)
    const dark = shade(color, -20)
    const bright = highlight(color, 0.34)
    return fill(size, (x, y) => {
      const nx = x / (size - 1)
      const ny = y / (size - 1)
      const ridge = Math.max(0, 1 - Math.abs((nx * 1.15 + ny * 0.85) - 0.9) * 2.2)
      const shimmer = Math.max(0, 1 - Math.abs((nx - ny) - 0.08) * 4.5)
      const rim = (x === 0 || y === 0 || x === size - 1 || y === size - 1) ? -14 : 0
      const n = (rng() - 0.5) * 18
      const base = shade(color, n + rim)
      const withRidge = mix(base, bright, Math.min(0.9, ridge * 0.48))
      return mix(withRidge, dark, Math.max(0, 0.18 - shimmer * 0.08))
    })
  },
  cobble(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const cell = (Math.floor(x / 4) * 7 + Math.floor(y / 4) * 13)
      const r = makeRng(seed + cell)()
      const n = (r - 0.5) * 50
      const edge = (x % 4 === 0 || y % 4 === 0) ? -28 : 0
      return shade(color, n + edge)
    })
  },
  log(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x) => {
      const stripe = Math.sin(x * 1.3) * 14
      const n = (rng() - 0.5) * 14
      return shade(color, stripe + n)
    })
  },
  planks(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const plank = Math.floor(y / 4)
      const line = (y % 4 === 0) ? -24 : 0
      const r = makeRng(seed + plank * 31)()
      const n = (r - 0.5) * 18 + (rng() - 0.5) * 8
      return shade(color, n + line)
    })
  },
  pumpkin(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const stripe = Math.sin((x / size) * Math.PI * 6) * 12
      const n = (rng() - 0.5) * 20
      return shade(color, stripe + n)
    })
  },
  piston(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const top = y < size / 3 ? 16 : 0
      const band = (x === 4 || x === size - 5 || y === 7) ? -18 : 0
      const n = (rng() - 0.5) * 10
      return shade(color, n + top + band)
    })
  },
  leaves(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, () => {
      const r = rng()
      const n = (r - 0.5) * 44
      const a = r > 0.86 ? 0 : 255
      const c = shade(color, n)
      return [c[0], c[1], c[2], a]
    })
  },
  ore(size, color, seed) {
    const rng = makeRng(seed)
    const stone = [122, 122, 128]
    const vein = mix(color, [255, 255, 255], 0.18)
    const shadow = shade(stone, -18)
    return fill(size, (x, y) => {
      const n = (rng() - 0.5) * 34
      const cx = x - size / 2
      const cy = y - size / 2
      const blobs = Math.sin(cx * 0.82 + seed * 0.01) * Math.cos(cy * 0.84 - seed * 0.01)
      const cluster = Math.sin((x + y + seed) * 0.85) + Math.cos((x - y) * 0.65)
      if (blobs > 0.44 || cluster > 1.15 || rng() > 0.94) {
        const glow = (rng() - 0.5) * 24
        return shade(vein, glow)
      }
      if ((x + y) % 5 === 0) return shade(shadow, n * 0.6)
      return shade(stone, n)
    })
  },
  shiny_ore(size, color, seed) {
    const rng = makeRng(seed)
    const stone = [122, 122, 128]
    const vein = highlight(color, 0.28)
    const veinBright = highlight(color, 0.55)
    const brightStone = highlight(stone, 0.14)
    return fill(size, (x, y) => {
      const nx = x / (size - 1)
      const ny = y / (size - 1)
      const blob = Math.sin((nx * 6.4 + ny * 5.1 + seed * 0.01) * Math.PI)
      const blob2 = Math.cos((nx * 4.2 - ny * 6.1 + seed * 0.013) * Math.PI)
      const streak = Math.cos((nx - ny) * Math.PI * 3.2)
      const sparkle = rng() > 0.93 ? 24 : 0
      const shadeNoise = (rng() - 0.5) * 22
      const score = blob + blob2 + streak
      if (score > 1.45) return shade(veinBright, sparkle + 12)
      if (score > 0.65) return shade(vein, sparkle + 6)
      if (score > -0.1) return shade(brightStone, shadeNoise + 6)
      return shade(stone, shadeNoise - 4)
    })
  },
  lever(size, color, seed) {
    const rng = makeRng(seed)
    const base = [84, 68, 44]
    const metal = [126, 126, 130]
    const darkMetal = [72, 72, 76]
    return fill(size, (x, y) => {
      const nx = x / (size - 1)
      const ny = y / (size - 1)
      const board = (x >= 5 && x <= 10 && y >= 4 && y <= 11)
      const pivot = (x >= 7 && x <= 10 && y >= 4 && y <= 8)
      const handle = (x >= 2 && x <= 11 && y >= 1 && y <= 6)
      const knob = (x >= 1 && x <= 4 && y >= 0 && y <= 3)
      const grain = Math.sin((nx * 8 + ny * 5 + seed * 0.01) * Math.PI) * 10
      const shadeNoise = (rng() - 0.5) * 12
      if (knob) return shade(darkMetal, grain + shadeNoise - 8)
      if (handle) return shade(metal, grain + shadeNoise + (ny < 0.35 ? 10 : -6))
      if (pivot) return shade(base, grain + shadeNoise + 6)
      if (board) return shade(base, grain + shadeNoise + (nx < 0.3 ? -8 : 6))
      return [0, 0, 0, 0]
    })
  },
  water(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const wave = Math.sin((x + y) * 0.6) * 16
      const n = (rng() - 0.5) * 10
      return [color[0], color[1], color[2], 190].map((v, idx) => idx < 3 ? clamp8(v + wave + n) : v)
    })
  },
  lava(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const wave = Math.sin((x * 0.7 + y * 0.55) + seed * 0.01) * 18
      const pulse = Math.cos((x - y) * 0.85) * 14
      const n = (rng() - 0.5) * 18
      return shade(color, wave + pulse + n)
    })
  },
  crafting_top(size, color, seed) {
    const rng = makeRng(seed)
    const dark = shade(color, -42)
    const mid = shade(color, -18)
    return fill(size, (x, y) => {
      const edge = (x === 0 || y === 0 || x === size - 1 || y === size - 1) ? -32 : 0
      // 4x4 grid of dimples representing a tool-board surface
      const gx = x % 4
      const gy = y % 4
      const dimple = (gx === 1 || gx === 2) && (gy === 1 || gy === 2) ? -16 : 0
      const cross = (x === Math.floor(size / 2) || y === Math.floor(size / 2)) ? -10 : 0
      const n = (rng() - 0.5) * 16
      const base = shade(color, n + edge + dimple + cross)
      // sprinkle tool-spot accents
      if ((x === 3 && y === 3) || (x === size - 4 && y === 3) || (x === 3 && y === size - 4) || (x === size - 4 && y === size - 4)) {
        return mix(dark, mid, 0.5)
      }
      return base
    })
  },
  crafting_side(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const plank = Math.floor(y / 4)
      const line = (y % 4 === 0) ? -24 : 0
      const r = makeRng(seed + plank * 31)()
      const n = (r - 0.5) * 18 + (rng() - 0.5) * 8
      // vertical tool-rack stripe on the side
      const stripeX = Math.floor(size / 2)
      const stripe = (x === stripeX - 1 || x === stripeX) ? -22 : 0
      // small dark notch (representing a saw / tool head)
      const notch = (y >= 2 && y <= 4 && x >= stripeX - 2 && x <= stripeX + 1) ? -30 : 0
      return shade(color, n + line + stripe + notch)
    })
  },
  glass(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const edge = (x === 0 || y === 0 || x === size - 1 || y === size - 1)
      const glare = (x + y === 6 || x + y === 7 || x + y === 12 || x + y === 13)
      if (edge) {
        return [color[0], color[1], color[2], 180]
      }
      if (glare) {
        return [255, 255, 255, 140]
      }
      return [0, 0, 0, 0]
    })
  },
  chest(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const border = (x === 0 || y === 0 || x === size - 1 || y === size - 1)
      const latch = (x >= 7 && x <= 8 && y >= 5 && y <= 7)
      const rim = (x === 1 || x === size - 2 || y === 1 || y === size - 2)
      const n = (rng() - 0.5) * 16
      if (latch) {
        return [220, 200, 80]
      }
      if (border) {
        return shade(color, -25 + n)
      }
      if (rim) {
        return shade(color, -10 + n)
      }
      return shade(color, n)
    })
  },
  chest_side(size, color, seed) {
    const rng = makeRng(seed)
    return fill(size, (x, y) => {
      const border = (x === 0 || y === 0 || x === size - 1 || y === size - 1)
      const rim = (x === 1 || x === size - 2 || y === 1 || y === size - 2)
      const n = (rng() - 0.5) * 16
      if (border) {
        return shade(color, -25 + n)
      }
      if (rim) {
        return shade(color, -10 + n)
      }
      return shade(color, n)
    })
  },
}
