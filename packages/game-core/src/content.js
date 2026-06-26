import blockDefs from '../content/blocks.json' with { type: 'json' }
import itemDefs from '../content/items.json' with { type: 'json' }
import recipes from '../content/recipes.json' with { type: 'json' }
import mobDefs from '../content/mobs.json' with { type: 'json' }

const mobDefsByType = Object.fromEntries(mobDefs.map((mob) => [mob.type, mob]))

export { blockDefs, itemDefs, recipes, mobDefs, mobDefsByType }
