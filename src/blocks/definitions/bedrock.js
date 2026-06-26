import { Opaque } from '../Block.js'

export default class BedrockBlock extends Opaque {
  constructor() {
    super({ name: 'bedrock', hardness: -1, tool: null, label: 'Bedrock', pattern: 'cobble', color: [60, 60, 64], drops: null })
  }
}

