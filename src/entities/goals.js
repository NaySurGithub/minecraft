export class Goal {
  constructor(mob, priority = 100) {
    this.mob = mob
    this.priority = priority
    this.running = false
  }

  canUse(_context) { return false }
  canContinue(context) { return this.canUse(context) }
  start(_context) { this.running = true }
  stop(_context) { this.running = false }
  tick(_dt, _context) {}
}

export class GoalSelector {
  constructor(mob) {
    this.mob = mob
    this.goals = []
    this.active = null
  }

  addGoal(goal) {
    this.goals.push(goal)
    this.goals.sort((a, b) => a.priority - b.priority)
    return goal
  }

  tick(dt, context = {}) {
    if (this.active && !this.active.canContinue(context)) {
      this.active.stop(context)
      this.active = null
    }
    const next = this.goals.find((goal) => goal.canUse(context)) || null
    if (next && next !== this.active) {
      if (this.active) this.active.stop(context)
      this.active = next
      this.active.start(context)
    }
    if (this.active) this.active.tick(dt, context)
  }
}

export class WanderGoal extends Goal {
  constructor(mob, priority = 100) {
    super(mob, priority)
  }

  canUse() {
    return !this.mob.dead && !this.mob.dying
  }

  tick(dt) {
    this.mob.decisionTimer -= dt
    if (this.mob.decisionTimer <= 0) this.mob._pickNewGoal()
  }
}

export class AttackGoal extends Goal {
  constructor(mob, options = {}) {
    super(mob, options.priority ?? 10)
    this.radius = options.radius ?? 16
    this.attackRange = options.attackRange ?? 1.5
    this.speed = options.speed ?? mob.walkSpeed
    this.baseSpeed = options.baseSpeed ?? mob.walkSpeed
    this.canAttack = options.canAttack || (() => true)
    this.attack = options.attack || (() => {})
    this.onEngage = options.onEngage || (() => {})
  }

  canUse(context) {
    if (this.mob.dead || this.mob.dying) return false
    if (!context.playerPos || context.player?.health?.invincible) return false
    if (!this.canAttack(this.mob, context)) return false
    const dx = context.playerPos.x - this.mob.position.x
    const dz = context.playerPos.z - this.mob.position.z
    return dx * dx + dz * dz <= this.radius * this.radius
  }

  tick(_dt, context) {
    const playerPos = context.playerPos
    if (!playerPos) return
    const dx = playerPos.x - this.mob.position.x
    const dz = playerPos.z - this.mob.position.z
    const distSq = dx * dx + dz * dz
    if (distSq > 0.001) this.mob.yaw = Math.atan2(-dx, -dz)
    this.mob.moving = true
    this.mob.walkSpeed = this.speed
    this.mob.decisionTimer = 0.4
    this.onEngage(this.mob, context)
    if (distSq <= this.attackRange * this.attackRange && Math.abs(playerPos.y - this.mob.position.y) <= 3) {
      this.attack(this.mob, context.player, context)
    }
  }

  stop() {
    super.stop()
    this.mob.walkSpeed = this.baseSpeed
  }
}

export class AvoidPlayerGoal extends Goal {
  constructor(mob, options = {}) {
    super(mob, options.priority ?? 20)
    this.radius = options.radius ?? 8
    this.speed = options.speed ?? mob.walkSpeed * 1.2
  }

  canUse(context) {
    if (!context.playerPos || this.mob.dead || this.mob.dying) return false
    if (!this.mob.avoidPlayers) return false
    const dx = context.playerPos.x - this.mob.position.x
    const dz = context.playerPos.z - this.mob.position.z
    return dx * dx + dz * dz <= this.radius * this.radius
  }

  tick(_dt, context) {
    const dx = context.playerPos.x - this.mob.position.x
    const dz = context.playerPos.z - this.mob.position.z
    this.mob.yaw = Math.atan2(dx, dz)
    this.mob.walkSpeed = this.speed
    this.mob.moving = true
    this.mob.decisionTimer = 0.3
  }
}

export class MoveThroughVillageGoal extends Goal {
  constructor(mob, options = {}) {
    super(mob, options.priority ?? 60)
    this.speed = options.speed ?? mob.walkSpeed
  }

  canUse(context) {
    return !!context.villageCenter && !this.mob.dead && !this.mob.dying
  }

  tick(_dt, context) {
    const dx = context.villageCenter.x - this.mob.position.x
    const dz = context.villageCenter.z - this.mob.position.z
    if (dx * dx + dz * dz < 4) return
    this.mob.yaw = Math.atan2(-dx, -dz)
    this.mob.walkSpeed = this.speed
    this.mob.moving = true
  }
}

export class OpenDoorGoal extends Goal {
  canUse() {
    return false
  }
}

export class DefendVillageGoal extends AttackGoal {
  constructor(mob, options = {}) {
    super(mob, {
      priority: options.priority ?? 5,
      radius: options.radius ?? 16,
      attackRange: options.attackRange ?? 4.2,
      speed: options.speed ?? mob.walkSpeed,
      baseSpeed: options.baseSpeed ?? mob.walkSpeed,
      canAttack: options.canAttack || ((candidate) => !!candidate.angry),
      attack: options.attack
    })
  }
}
