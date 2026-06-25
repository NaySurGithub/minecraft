const FURNACE_RECIPES = [
  { input: 'iron_ore', output: 'raw_iron', count: 1, xp: 0.7 },
  { input: 'gold_ore', output: 'raw_gold', count: 1, xp: 1.0 },
  { input: 'copper_ore', output: 'raw_copper', count: 1, xp: 0.7 },
  { input: 'cobblestone', output: 'stone', count: 1, xp: 0.1 },
  { input: 'mutton', output: 'cooked_mutton', count: 1, xp: 0.35 },
  { input: 'wet_sponge', output: 'sponge', count: 1, xp: 0.1 },
  { input: 'sand', output: 'glass', count: 1, xp: 0.1 }
]

export function getFurnaceRecipeByInput(name) {
  return FURNACE_RECIPES.find((r) => r.input === name) || null
}

export function getAllFurnaceRecipes() {
  return FURNACE_RECIPES.slice()
}
