import { getBlockId } from '../blocks/registry.js'

// Resolves redstone-relevant block IDs by name once, then offers fast
// classification for the engine. Names match the definition files in
// src/blocks/definitions/.
//
// Categories:
//   sources   - constantly emit full power (redstone block, lever when on,
//               redstone torch)
//   conductors - carry/attenuate signal (redstone dust)
//   reactors  - change state in response to power (redstone lamp)
//
// Lever on/off state is tracked externally (engine holds the toggle set),
// since it depends on player interaction rather than the block id alone.

export function createComponents() {
  const ids = {
    redstoneBlock: getBlockId('redstone_block'),
    redstoneDust: getBlockId('redstone_dust'),
    redstoneLamp: getBlockId('redstone_lamp'),
    lever: getBlockId('lever'),
    redstoneTorch: getBlockId('redstone_torch'),
    redstoneLampLit: getBlockId('redstone_lamp_lit'),
    piston: getBlockId('piston')
  }

  return {
    ids,

    // Constant emitters that don't depend on external toggle state.
    isConstantSource(id) {
      return id === ids.redstoneBlock || id === ids.redstoneTorch
    },

    // A lever is a source only when toggled on (engine passes the state).
    isToggleSource(id) {
      return id === ids.lever
    },

    // Cells that carry and attenuate signal.
    isConductor(id) {
      return id === ids.redstoneDust
    },

    // Blocks that react to incoming power by changing state.
    isReactor(id) {
      return id === ids.redstoneLamp || id === ids.piston
    },

    isRedstoneComponent(id) {
      return (
        id === ids.redstoneBlock ||
        id === ids.redstoneDust ||
        id === ids.redstoneLamp ||
        id === ids.lever ||
        id === ids.redstoneTorch ||
        id === ids.redstoneLampLit ||
        id === ids.piston
      )
    }
  }
}
