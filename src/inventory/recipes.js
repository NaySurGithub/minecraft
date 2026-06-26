import { blocksByName } from '../blocks/registry.js'
import { getThingByName } from '../items/itemRegistry.js'
import { recipes as RECIPE_DEFS } from '../../packages/game-core/src/content.js'

function resolve(name) {
  const b = blocksByName.get(name) || getThingByName(name)
  return b ? b.id : -1
}

const RECIPES = (Array.isArray(RECIPE_DEFS) ? RECIPE_DEFS : []).map((r) => {
  if (r.shaped) {
    const keyIds = {}
    for (const ch of Object.keys(r.key || {})) keyIds[ch] = resolve(r.key[ch])
    const counts = new Map()
    let w = 0
    for (const row of r.shape || []) {
      if (row.length > w) w = row.length
      for (const ch of row) {
        if (ch === ' ') continue
        const id = keyIds[ch]
        if (id == null || id < 0) continue
        counts.set(id, (counts.get(id) || 0) + 1)
      }
    }
    const ingredients = []
    for (const [id, count] of counts) ingredients.push({ id, count })
    return {
      shaped: true,
      shape: r.shape,
      keyIds,
      width: w,
      height: r.shape.length,
      ingredients,
      out: { id: resolve(r.out.name), count: r.out.count },
      gridSize: r.gridSize || Math.max(w, r.shape.length)
    }
  }
  return {
    shapeless: true,
    in: (r.in || []).map((i) => ({ id: resolve(i.name), count: i.count })).filter((i) => i.id >= 0),
    out: { id: resolve(r.out.name), count: r.out.count },
    gridSize: r.gridSize || 1
  }
}).filter((r) => r.out.id >= 0)

function tallyGrid(grid) {
  const counts = new Map()
  let used = 0
  for (const slot of grid) {
    if (!slot || slot.id == null) continue
    counts.set(slot.id, (counts.get(slot.id) || 0) + slot.count)
    used++
  }
  return { counts, used }
}

function matchShaped(recipe, grid, size) {
  if (recipe.width > size || recipe.height > size) return false
  for (let oy = 0; oy + recipe.height <= size; oy++) {
    for (let ox = 0; ox + recipe.width <= size; ox++) {
      let ok = true
      for (let y = 0; y < size && ok; y++) {
        for (let x = 0; x < size && ok; x++) {
          const slot = grid[y * size + x]
          const inside = x >= ox && x < ox + recipe.width && y >= oy && y < oy + recipe.height ? recipe.shape[y - oy][x - ox] : ' '
          if (inside === ' ') {
            if (slot && slot.id != null) ok = false
          } else {
            const wantId = recipe.keyIds[inside]
            if (!slot || slot.id !== wantId || slot.count < 1) ok = false
          }
        }
      }
      if (ok) return true
    }
  }
  return false
}

function matchShapeless(recipe, grid) {
  const { counts } = tallyGrid(grid)
  if (counts.size !== recipe.in.length) return false
  for (const ing of recipe.in) if ((counts.get(ing.id) || 0) < ing.count) return false
  return true
}

export function matchRecipe(grid, gridSize) {
  for (const recipe of RECIPES) {
    if (recipe.gridSize > gridSize) continue
    if (recipe.shaped ? matchShaped(recipe, grid, gridSize) : matchShapeless(recipe, grid)) return recipe
  }
  return null
}

export function recipeYield(grid, gridSize) {
  const r = matchRecipe(grid, gridSize)
  return r ? { id: r.out.id, count: r.out.count } : null
}

export function consumeOneCraft(grid, gridSize) {
  const recipe = matchRecipe(grid, gridSize)
  if (!recipe) return false
  if (recipe.shaped) {
    for (let oy = 0; oy + recipe.height <= gridSize; oy++) {
      for (let ox = 0; ox + recipe.width <= gridSize; ox++) {
        let ok = true
        for (let y = 0; y < gridSize && ok; y++) {
          for (let x = 0; x < gridSize && ok; x++) {
            const slot = grid[y * gridSize + x]
            const inside = x >= ox && x < ox + recipe.width && y >= oy && y < oy + recipe.height ? recipe.shape[y - oy][x - ox] : ' '
            if (inside === ' ') {
              if (slot && slot.id != null) ok = false
            } else {
              const wantId = recipe.keyIds[inside]
              if (!slot || slot.id !== wantId || slot.count < 1) ok = false
            }
          }
        }
        if (ok) {
          for (let y = 0; y < recipe.height; y++) {
            for (let x = 0; x < recipe.width; x++) {
              const ch = recipe.shape[y][x]
              if (ch === ' ') continue
              const idx = (oy + y) * gridSize + (ox + x)
              const slot = grid[idx]
              slot.count -= 1
              if (slot.count <= 0) grid[idx] = null
            }
          }
          return true
        }
      }
    }
    return false
  }
  for (const ing of recipe.in) {
    let need = ing.count
    for (let i = 0; i < grid.length && need > 0; i++) {
      const slot = grid[i]
      if (!slot || slot.id !== ing.id) continue
      const take = Math.min(slot.count, need)
      slot.count -= take
      need -= take
      if (slot.count <= 0) grid[i] = null
    }
  }
  return true
}

export function getAllRecipes() {
  return RECIPES
}

export function filterRecipesByGrid(grid, gridSize) {
  const { counts, used } = tallyGrid(grid)
  if (used === 0) return RECIPES.filter((r) => r.gridSize <= gridSize)
  const present = new Set(counts.keys())
  return RECIPES.filter((r) => {
    if (r.gridSize > gridSize) return false
    const ings = r.shaped ? r.ingredients : r.in
    for (const ing of ings) if (present.has(ing.id)) return true
    return false
  })
}

export function recipeIngredients(recipe) {
  return recipe.shaped ? recipe.ingredients : recipe.in
}
