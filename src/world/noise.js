import { createNoise2D, createNoise3D } from 'simplex-noise'

function xfnv1a(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return function () {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seed) {
  return xfnv1a(String(seed))
}

export function hashSeed(seed) {
  const rng = makeRng(seed)
  return Math.floor(rng() * 2147483647)
}

function fbm2(noise, x, y, octaves, lacunarity, gain) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

function fbm3(noise, x, y, z, octaves, lacunarity, gain) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq, z * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

export class NoiseField {
  constructor(seed) {
    const base = hashSeed(seed)
    this.height = createNoise2D(makeRng(base + 1))
    this.temperature = createNoise2D(makeRng(base + 2))
    this.humidity = createNoise2D(makeRng(base + 3))
    this.detail = createNoise2D(makeRng(base + 4))
    this.cave = createNoise3D(makeRng(base + 5))
    this.ore = createNoise3D(makeRng(base + 6))
  }

  heightAt(x, z) {
    return fbm2(this.height, x * 0.006, z * 0.006, 5, 2, 0.5)
  }

  detailAt(x, z) {
    return fbm2(this.detail, x * 0.04, z * 0.04, 3, 2, 0.5)
  }

  temperatureAt(x, z) {
    return (fbm2(this.temperature, x * 0.0018, z * 0.0018, 3, 2, 0.5) + 1) * 0.5
  }

  humidityAt(x, z) {
    return (fbm2(this.humidity, x * 0.0022, z * 0.0022, 3, 2, 0.5) + 1) * 0.5
  }

  caveAt(x, y, z) {
    return fbm3(this.cave, x * 0.05, y * 0.05, z * 0.05, 3, 2, 0.5)
  }

  oreAt(x, y, z) {
    return this.ore(x * 0.1, y * 0.1, z * 0.1)
  }
}
