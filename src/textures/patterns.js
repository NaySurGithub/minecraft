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
  const TILE_W = 4
  const TILE_H = 2

  const data = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / TILE_H)
      const offset = (row % 2) * Math.floor(TILE_W / 2)
      const lx = (x + offset) % size
      const col = Math.floor(lx / TILE_W)

      const isGroutX = (lx % TILE_W) === 0
      const isGroutY = (y % TILE_H) === 0

      // deterministic per-tile shade variation (no RNG dependency)
      const hash = (row * 73856093) ^ (col * 19349663) ^ (seed * 83492791)
      const tileShade = ((hash >> 3) & 0x3f) - 32  // -32 to +31

      let brightness
      if (isGroutX || isGroutY) {
        brightness = -38  // dark grout lines
      } else {
        const innerX = (lx % TILE_W) - 1
        const innerY = (y % TILE_H)
        // top-left highlight, bottom-right shadow per tile
        const highlight = (innerX === 0 && innerY === 0) ? 18
                        : (innerX === TILE_W - 2 && innerY === TILE_H - 1) ? -12
                        : 0
        brightness = tileShade * 0.7 + highlight
      }

      const c = shade(color, brightness)
      const i = (y * size + x) * 4
      data[i]   = c[0]
      data[i+1] = c[1]
      data[i+2] = c[2]
      data[i+3] = 255
    }
  }
  return data
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
  fire(size, color, seed) {
  const rng = makeRng(seed)

  // 16x16 pixel art fire template (0=transparent, 1=dark red, 2=orange, 3=bright orange, 4=yellow, 5=white-yellow)
  const T = [
    [0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,2,1,1,1,2,1,1,0,0,0,0],
    [0,0,1,1,2,2,2,2,2,2,2,1,1,0,0,0],
    [0,1,1,2,2,3,2,2,2,3,2,2,1,0,0,0],
    [0,1,2,2,3,3,3,2,3,3,3,2,2,1,0,0],
    [1,1,2,3,3,3,3,3,3,3,3,3,2,1,0,0],
    [1,2,2,3,3,4,3,3,3,4,3,3,2,2,1,0],
    [1,2,3,3,4,4,4,3,4,4,4,3,3,2,1,0],
    [0,2,3,4,4,4,4,4,4,4,4,4,3,2,1,0],
    [0,2,3,4,4,5,4,4,4,5,4,4,3,2,0,0],
    [0,1,3,4,5,5,5,4,5,5,5,4,3,1,0,0],
    [0,1,2,4,5,5,5,5,5,5,5,4,2,1,0,0],
    [0,0,2,3,4,5,5,5,5,5,4,3,2,0,0,0],
    [0,0,1,2,3,4,4,5,4,4,3,2,1,0,0,0],
    [0,0,0,1,2,3,3,4,3,3,2,1,0,0,0,0],
  ]

  const palette = [
    [0,   0,   0,   0  ], // 0 transparent
    [139, 30,  0,   255], // 1 dark red
    [200, 70,  0,   255], // 2 orange-red
    [230, 110, 10,  255], // 3 orange
    [245, 160, 20,  255], // 4 bright orange
    [255, 220, 80,  255], // 5 yellow
  ]

  // scale from 16 to `size`
  const scale = size / 16

  return fill(size, (x, y) => {
    const tx = Math.floor(x / scale)
    const ty = Math.floor(y / scale)
    const row = T[Math.min(ty, 15)]
    const v = row ? (row[Math.min(tx, 15)] ?? 0) : 0

    if (v === 0) return [0, 0, 0, 0]

    const base = palette[v]
    const n = (rng() - 0.5) * 18
    return [
      clamp8(base[0] + n),
      clamp8(base[1] + n * 0.5),
      clamp8(base[2]),
      base[3]
    ]
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
  torch(size, color, seed) {
  const stickColor  = [102, 76, 51]
  const stickDark   = [76,  56, 36]
  const flameYellow = [255, 214, 60]
  const flameOrange = [240, 120, 20]
  const flameDark   = [180, 60,  0]
  const flameWhite  = [255, 240, 180]

  // normalized stick center
  const cx = Math.floor(size / 2)

  return fill(size, (x, y) => {
    const ny = y / size  // 0=top, 1=bottom

    // flame zone: top 30% of texture
    const flameY = size * 0.30
    // stick zone: 30%–85%
    const stickTop    = size * 0.30
    const stickBottom = size * 0.85
    const stickW = Math.max(2, Math.floor(size * 0.18))
    const halfW  = Math.floor(stickW / 2)

    // flame: full width at top, narrowing
    if (y < flameY) {
      const progress = y / flameY   // 0 at top, 1 at flame base
      const halfFlame = Math.floor((size * 0.44) * (1 - progress * 0.55))
      if (Math.abs(x - cx) > halfFlame) return [0, 0, 0, 0]
      // core white center
      if (Math.abs(x - cx) < halfFlame * 0.22 && progress < 0.35) return flameWhite
      // inner yellow
      if (Math.abs(x - cx) < halfFlame * 0.50) return shade(flameYellow, (0.5 - progress) * 30)
      // outer orange
      if (Math.abs(x - cx) < halfFlame * 0.80) return shade(flameOrange, (0.5 - progress) * 20)
      return shade(flameDark, progress * 10)
    }

    // stick
    if (y >= stickTop && y <= stickBottom) {
      if (Math.abs(x - cx) > halfW) return [0, 0, 0, 0]
      // left edge darker, right edge lighter (bevel)
      const edge = (x === cx - halfW) ? -22 : (x === cx + halfW) ? 14 : 0
      const stripe = Math.sin(y * 0.9) * 5
      return shade(stickColor, edge + stripe)
    }

    // knob at stick bottom
    const knobW = halfW + 1
    if (y > stickBottom && y < stickBottom + size * 0.08) {
      if (Math.abs(x - cx) <= knobW) return stickDark
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

  