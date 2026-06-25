export class Block {
  constructor(props = {}) {
    this.name = props.name
    this.solid = props.solid !== false
    this.transparent = props.transparent === true
    this.liquid = props.liquid === true
    this.light = props.light || 0
    this.hardness = props.hardness == null ? 1 : props.hardness
    this.tool = props.tool || null
    this.drops = props.drops || null
    this.stackSize = props.stackSize || 64
    this.placeable = props.placeable !== false
    this.item = props.item === true
    this.category = props.category || 'block'
    this.label = props.label || props.name
    this.faces = props.faces || null
    this.color = props.color || [128, 128, 128]
    this.pattern = props.pattern || 'solid'
    this.palette = props.palette || null
    this.texture = props.texture || null
    this.renderType = props.renderType || 'cube'
    this.model = props.model || null
    this.gravity = props.gravity === true
  }
}

export class Opaque extends Block {
  constructor(props = {}) {
    super({ ...props, transparent: false, solid: props.solid !== false })
  }
}
