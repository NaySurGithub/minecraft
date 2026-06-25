import * as THREE from 'three'
import { MobIA } from './MobIA.js'
import { loadMobModel, cloneMobScene } from '../models/mobGltf.js'
import { AIR, blocks } from '../blocks/registry.js'
import creeperGlbUrl from '../models/mobs/creeper.glb?url'
import creeperExplosionMp3Url from '../sounds/creeper-explosion.mp3?url'
import { getVolume } from '../sounds/soundManager.js'

const CREEPER_GLB_URL = creeperGlbUrl
loadMobModel(CREEPER_GLB_URL).catch((err) => console.warn('creeper.glb load failed', err))

export class Creeper extends MobIA {
  constructor(x, y, z) {
    super(x, y, z)
    this.type = 'creeper'
    this.half = 0.15
    this.height = 0.85
    this.walkSpeed = 1.1
    this.maxHealth = 20
    this.health = this.maxHealth
    this.turnIntervalMin = 1.5
    this.turnIntervalMax = 4.0
    this.idleChance = 0.3
    this.drops = [{ item: 'gunpowder', min: 1, max: 2 }]
    
    // Creeper specific explosion properties
    this.fuseTime = 1.8 // Slightly longer to match creeper-explosion.mp3 hiss sound
    this.fuseTimer = 0
    this.exploding = false
    this.explosionRadius = 3.0
    
    this.playedFuseSound = false
    this.buildMesh()
  }

  buildMesh() {
    const group = new THREE.Group()
    const placeholder = this.buildPlaceholderMesh()
    group.add(placeholder)
    this.mesh = group
    this.placeholderMesh = placeholder
    this.gltfMesh = null

    loadMobModel(CREEPER_GLB_URL).then((gltf) => {
      if (!this.mesh) return
      const scene = cloneMobScene(gltf)
      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3(); box.getSize(size)
      const sourceHeight = size.y || 1
      const s = (this.height / sourceHeight) * 0.5
      scene.scale.setScalar(s)
      
      // Face forward correction if needed
      scene.rotation.y = Math.PI
      
      box.setFromObject(scene)
      scene.position.y -= box.min.y
      this.gltfMesh = scene
      group.remove(placeholder)
      placeholder.traverse((c) => {
        if (c.geometry) c.geometry.dispose()
        if (c.material) c.material.dispose()
      })
      this.placeholderMesh = null
      group.add(scene)
    }).catch(() => {})

    this.syncMesh()
    return group
  }

  buildPlaceholderMesh() {
    const group = new THREE.Group()
    const skin = new THREE.MeshLambertMaterial({ color: 0x4caf50 })
    
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin)
    head.position.y = 0.7
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.15), skin)
    body.position.y = 0.375
    
    const legGeo = new THREE.BoxGeometry(0.12, 0.2, 0.12)
    const legFL = new THREE.Mesh(legGeo, skin)
    const legFR = new THREE.Mesh(legGeo, skin)
    const legBL = new THREE.Mesh(legGeo, skin)
    const legBR = new THREE.Mesh(legGeo, skin)
    
    legFL.position.set(-0.1, 0.1, -0.1)
    legFR.position.set(0.1, 0.1, -0.1)
    legBL.position.set(-0.1, 0.1, 0.1)
    legBR.position.set(0.1, 0.1, 0.1)
    
    group.add(head, body, legFL, legFR, legBL, legBR)
    return group
  }

  update(dt, world, playerPos, scene, player = null) {
    const isCreative = player?.health?.invincible
    
    if (playerPos && !isCreative && !this.dead && !this.dying) {
      const dx = playerPos.x - this.position.x
      const dz = playerPos.z - this.position.z
      const distSq = dx * dx + dz * dz
      const dist = Math.sqrt(distSq)

      if (dist < 16) {
        if (dist > 0.001) this.yaw = Math.atan2(-dx, -dz)
        this.moving = true
        
        // Explosion logic (MC Creeper starts fuse at <= 3 blocks distance)
        if (dist <= 3.0 && Math.abs(playerPos.y - this.position.y) <= 2) {
          this.exploding = true
          this.moving = false // Stop moving when starting to explode
          
          // Flash animation - flash white/green or upscale slightly
          this.fuseTimer += dt
          
          // Play fuse sound (hiss)
          this.playFuseSound(dist)
          
          // Flash / inflate mesh
          this.animateFuse()
          
          if (this.fuseTimer >= this.fuseTime) {
            this.explode(world, scene, player)
          }
        } else {
          // Player backed away, reset fuse gradually
          this.exploding = false
          this.playedFuseSound = false
          this.fuseTimer = Math.max(0, this.fuseTimer - dt * 2)
          this.resetFuseAnimation()
        }
      }
    } else {
      this.exploding = false
      this.playedFuseSound = false
      this.fuseTimer = 0
      this.resetFuseAnimation()
    }

    // Default movement/gravity if not exploding
    if (!this.exploding) {
      super.update(dt, world, playerPos, scene, player)
    } else {
      // Just apply gravity if airborne, but don't walk
      this.velocity.x = 0
      this.velocity.z = 0
      this.velocity.y -= 18 * dt // GRAVITY * dt
      this.moveAxis(world, 'y', this.velocity.y * dt)
      // Call MobIA update logic without movement to handle burning, air etc.
      this.age += dt
      if (world) this._updateMobAir(dt, world)
      if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt)
      this._setHurtTint(this.hurtTimer > 0)
      this.syncMesh()
    }
  }

  playFuseSound(dist) {
    if (this.playedFuseSound) return
    this.playedFuseSound = true
    try {
      // Hiss sound using Web Audio API via soundManager or directly
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const now = ctx.currentTime
      const bufferSize = ctx.sampleRate * this.fuseTime
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
      const noise = ctx.createBufferSource()
      noise.buffer = buffer
      
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(2000, now)
      
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(Math.max(0.05, 0.4 * (1 - dist / 10)), now)
      
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      
      noise.start(now)
      this.fuseAudioSource = noise
    } catch (e) {}
  }

  animateFuse() {
    if (!this.mesh) return
    const ratio = this.fuseTimer / this.fuseTime
    // Flashing white effect + slight scaling (inflation)
    const scale = 1.0 + ratio * 0.25
    if (this.gltfMesh) {
      // Base height is 0.17 (scaled down from typical source model size ~1.8)
      // Normalize source scaling relative to the scaled size * current inflate factor
      this.gltfMesh.scale.setScalar((this.height / 1.7) * 0.1 * scale)
    } else if (this.placeholderMesh) {
      this.placeholderMesh.scale.setScalar(scale)
    }
    
    // Flashing emissive/white color
    const flashColor = Math.floor(ratio * 5) % 2 === 0 ? 0xffffff : 0x000000
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (mat.emissive) {
            mat.emissive.setHex(flashColor === 0xffffff ? 0xaaaaaa : 0x000000)
            mat.emissiveIntensity = flashColor === 0xffffff ? 0.8 : 0
          }
        }
      }
    })
  }

  resetFuseAnimation() {
    if (!this.mesh) return
    if (this.gltfMesh) {
      this.gltfMesh.scale.setScalar((this.height / 1.7) * 0.1)
    } else if (this.placeholderMesh) {
      this.placeholderMesh.scale.setScalar(1)
    }
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (mat.emissive && !this._hurtTintActive) {
            mat.emissive.setHex(0x000000)
            mat.emissiveIntensity = 0
          }
        }
      }
    })
  }

  explode(world, scene, player) {
    this.dead = true
    this.dying = true
    
    // Stop fuse audio if running
    if (this.fuseAudioSource) {
      try { this.fuseAudioSource.stop() } catch (e) {}
    }

    const ex = this.position.x
    const ey = this.position.y + 0.5
    const ez = this.position.z

    // 1. Play Explosion Sound
    try {
      // Calculate spatial distance to player to scale volume
      let dist = 0
      if (player) {
        const dx = player.position.x - ex
        const dy = player.position.y - ey
        const dz = player.position.z - ez
        dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
      }
      
      const audio = new Audio(creeperExplosionMp3Url)
      // Volume falls off with distance, max volume configured by game settings
      const falloff = dist > 15 ? 0 : (1 - dist / 15)
      audio.volume = Math.max(0.05, 0.95 * falloff) * getVolume('effects')
      audio.play().catch(() => {})
    } catch (e) {}

    // 2. Break blocks in a sphere radius
    const r = Math.ceil(this.explosionRadius)
    const blocksToDestroy = []
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const distSq = dx*dx + dy*dy + dz*dz
          if (distSq <= this.explosionRadius * this.explosionRadius) {
            const bx = Math.floor(ex + dx)
            const by = Math.floor(ey + dy)
            const bz = Math.floor(ez + dz)
            const id = world.getBlock(bx, by, bz)
            if (id !== 0 && blocks[id] && blocks[id].name !== 'bedrock') {
              blocksToDestroy.push({ x: bx, y: by, z: bz, id })
            }
          }
        }
      }
    }

    // Break the blocks and drop items or particles
    for (const b of blocksToDestroy) {
      world.setBlock(b.x, b.y, b.z, 0)
      // Optional: Drop items with a 30% chance for exploded blocks, just like MC
      if (Math.random() < 0.3) {
        let dropId = b.id
        if (blocks[b.id]?.drops) {
          const dropDef = blocks[b.id].drops
          // Translate name to ID if needed or spawn the block itself
        }
        // Spawn drop entity if dropManager is available
      }
    }

    // 3. Apply damage & knockback to player
    if (player && player.health && !player.health.invincible) {
      const px = player.position.x
      const py = player.position.y + 1
      const pz = player.position.z
      const pdx = px - ex
      const pdy = py - ey
      const pdz = pz - ez
      const pdist = Math.sqrt(pdx*pdx + pdy*pdy + pdz*pdz)
      
      if (pdist < this.explosionRadius * 2) {
        // Damage falls off with distance
        const damageMult = 1.0 - (pdist / (this.explosionRadius * 2))
        const rawDamage = Math.floor(20 * damageMult) // Max 10 hearts point blank
        if (rawDamage > 0) {
          player.health.damage(rawDamage)
          // Blow player away
          const kbStrength = damageMult * 4.5
          const len = Math.hypot(pdx, pdz) || 1
          player.velocity.x += (pdx / len) * kbStrength
          player.velocity.y = Math.max(player.velocity.y, kbStrength * 0.4)
          player.velocity.z += (pdz / len) * kbStrength
        }
      }
    }

    // 4. Explosion visual particles
    for (let i = 0; i < 30; i++) {
      const size = 0.2 + Math.random() * 0.3
      const geo = new THREE.BoxGeometry(size, size, size)
      const mat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.8 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        ex + (Math.random() - 0.5) * this.explosionRadius,
        ey + (Math.random() - 0.5) * this.explosionRadius,
        ez + (Math.random() - 0.5) * this.explosionRadius
      )
      scene.add(mesh)
      
      const vel = {
        x: (Math.random() - 0.5) * 4,
        y: 1 + Math.random() * 4,
        z: (Math.random() - 0.5) * 4
      }
      
      const particle = {
        mesh,
        vel,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5
      }

      const pTick = () => {
        particle.life += 0.05
        mesh.position.x += vel.x * 0.05
        mesh.position.y += vel.y * 0.05
        mesh.position.z += vel.z * 0.05
        vel.y -= 9.8 * 0.05
        mat.opacity = 1 - (particle.life / particle.maxLife)
        if (particle.life >= particle.maxLife) {
          scene.remove(mesh)
          geo.dispose()
          mat.dispose()
        } else {
          setTimeout(pTick, 50)
        }
      }
      pTick()
    }
  }
}
