const blockDefs = require('./blocks.json')
const itemDefs = require('./items.json')
const recipes = require('./recipes.json')
const mobDefs = require('./mobs.json')
const mobDefsByType = Object.fromEntries(mobDefs.map((mob) => [mob.type, mob]))
module.exports = { blockDefs, itemDefs, recipes, mobDefs, mobDefsByType }
