const COLORS = [
  ['white', [236, 236, 236]],
  ['orange', [240, 118, 19]],
  ['magenta', [189, 68, 179]],
  ['light_blue', [58, 175, 217]],
  ['yellow', [248, 198, 39]],
  ['lime', [112, 185, 25]],
  ['pink', [237, 141, 172]],
  ['gray', [62, 68, 71]],
  ['light_gray', [142, 142, 134]],
  ['cyan', [21, 137, 145]],
  ['purple', [121, 42, 172]],
  ['blue', [53, 57, 157]],
  ['brown', [114, 71, 40]],
  ['green', [85, 110, 27]],
  ['red', [161, 39, 34]],
  ['black', [20, 21, 25]]
]

export default COLORS.map(([name, color]) => ({
  name: name + '_wool',
  hardness: 0.8,
  tool: 'shears',
  label: name.replace('_', ' ') + ' wool',
  pattern: 'wool',
  color,
  drops: name + '_wool'
}))
