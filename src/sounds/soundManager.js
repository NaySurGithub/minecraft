let audioCtx = null
let masterVolumeValue = 0.8
let effectsVolumeValue = 0.8
let musicVolumeValue = 0.6

export function setVolumeLevels(master, music, effects) {
  masterVolumeValue = master / 100
  musicVolumeValue = music / 100
  effectsVolumeValue = effects / 100
}

export function getVolume(category) {
  const master = masterVolumeValue
  if (category === 'music') return master * musicVolumeValue
  if (category === 'effects') return master * effectsVolumeValue
  return master
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function createNoiseBuffer(ctx, duration) {
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

export const sounds = {
  playBreak() {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const noise = ctx.createBufferSource()
    noise.buffer = createNoiseBuffer(ctx, 0.15)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(250, now)
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.15)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.25 * getVolume('effects'), now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    noise.start(now)
  },

  playPlace() {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Bass Thud
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, now)
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1)

    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(0.3 * getVolume('effects'), now)
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)

    osc.connect(oscGain)
    oscGain.connect(ctx.destination)

    // Noise Click
    const noise = ctx.createBufferSource()
    noise.buffer = createNoiseBuffer(ctx, 0.05)

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(1000, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.1 * getVolume('effects'), now)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05)

    noise.connect(filter)
    filter.connect(noiseGain)
    noiseGain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.1)
    noise.start(now)
  },

  playHurt() {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(180, now)
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.4 * getVolume('effects'), now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)

    osc.connect(gain)
    gain.connect(ctx.destination)

    // Quick friction noise
    const noise = ctx.createBufferSource()
    noise.buffer = createNoiseBuffer(ctx, 0.08)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.15 * getVolume('effects'), now)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08)

    noise.connect(noiseGain)
    noiseGain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.15)
    noise.start(now)
  },

  playFizz() {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const noise = ctx.createBufferSource()
    noise.buffer = createNoiseBuffer(ctx, 0.35)

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(900, now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22 * getVolume('effects'), now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    noise.start(now)
  },

  // Play chest creak open
  playChestOpen() {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.linearRampToValueAtTime(320, now + 0.25)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12 * getVolume('effects'), now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.25)
  },

  // Play chest creak close
  playChestClose() {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(280, now)
    osc.frequency.linearRampToValueAtTime(180, now + 0.2)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12 * getVolume('effects'), now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.2)
  }
}
