import { CELL_COUNT, GRID } from './board.ts'
import { hashSeed, mulberry32 } from './prng.ts'

export type ConfusionGroup = 'red-green' | 'blue-purple' | 'green-brown' | 'neutral'

export type PatternId = 'dots' | 'stripes' | 'cross' | 'rings' | 'diag' | 'grid' | 'tri' | 'waves'

export interface ColorDef {
  id: number
  name: string
  hex: string
  group: ConfusionGroup
  pattern: PatternId
  /** 0 = very distinct, 1 = close shade (harder). */
  difficulty: number
}

/** Full palette — ids are stable across puzzles. */
export const COLORS: ColorDef[] = [
  { id: 0, name: 'Red', hex: '#e23b3b', group: 'red-green', pattern: 'dots', difficulty: 0 },
  { id: 1, name: 'Green', hex: '#2faf5a', group: 'red-green', pattern: 'stripes', difficulty: 0 },
  { id: 2, name: 'Crimson', hex: '#c43a3a', group: 'red-green', pattern: 'cross', difficulty: 0.55 },
  { id: 3, name: 'Leaf', hex: '#3a9e4f', group: 'red-green', pattern: 'rings', difficulty: 0.55 },
  { id: 4, name: 'Scarlet', hex: '#d94840', group: 'red-green', pattern: 'diag', difficulty: 0.8 },
  { id: 5, name: 'Moss', hex: '#4a9a48', group: 'red-green', pattern: 'grid', difficulty: 0.8 },

  { id: 6, name: 'Blue', hex: '#3b6fe2', group: 'blue-purple', pattern: 'dots', difficulty: 0 },
  { id: 7, name: 'Purple', hex: '#8b3fd4', group: 'blue-purple', pattern: 'stripes', difficulty: 0 },
  { id: 8, name: 'Azure', hex: '#4a6fd0', group: 'blue-purple', pattern: 'cross', difficulty: 0.55 },
  { id: 9, name: 'Violet', hex: '#7a48c8', group: 'blue-purple', pattern: 'rings', difficulty: 0.55 },
  { id: 10, name: 'Indigo', hex: '#5560c4', group: 'blue-purple', pattern: 'diag', difficulty: 0.85 },
  { id: 11, name: 'Orchid', hex: '#6e52b8', group: 'blue-purple', pattern: 'grid', difficulty: 0.85 },

  { id: 12, name: 'Forest', hex: '#3d7a45', group: 'green-brown', pattern: 'tri', difficulty: 0.15 },
  { id: 13, name: 'Brown', hex: '#8a5a32', group: 'green-brown', pattern: 'waves', difficulty: 0.15 },
  { id: 14, name: 'Olive', hex: '#6b7a3a', group: 'green-brown', pattern: 'dots', difficulty: 0.6 },
  { id: 15, name: 'Umber', hex: '#7a6238', group: 'green-brown', pattern: 'stripes', difficulty: 0.6 },
  { id: 16, name: 'Khaki', hex: '#7d8a4a', group: 'green-brown', pattern: 'cross', difficulty: 0.9 },
  { id: 17, name: 'Cocoa', hex: '#6e5a3c', group: 'green-brown', pattern: 'rings', difficulty: 0.9 },

  { id: 18, name: 'Orange', hex: '#e28a2e', group: 'neutral', pattern: 'tri', difficulty: 0 },
  { id: 19, name: 'Teal', hex: '#2aa8a0', group: 'neutral', pattern: 'waves', difficulty: 0 },
  { id: 20, name: 'Pink', hex: '#e25a9a', group: 'neutral', pattern: 'diag', difficulty: 0.1 },
  { id: 21, name: 'Yellow', hex: '#e2c22e', group: 'neutral', pattern: 'grid', difficulty: 0 },
  { id: 22, name: 'Cyan', hex: '#2ec4e2', group: 'neutral', pattern: 'dots', difficulty: 0.1 },
  { id: 23, name: 'Gray', hex: '#8a93a8', group: 'neutral', pattern: 'stripes', difficulty: 0.2 },
]

export const COLOR_BY_ID: Record<number, ColorDef> = Object.fromEntries(
  COLORS.map((c) => [c.id, c]),
)

export const CONFUSION_GROUPS: ConfusionGroup[] = [
  'red-green',
  'blue-purple',
  'green-brown',
  'neutral',
]

export const GROUP_LABEL: Record<ConfusionGroup, string> = {
  'red-green': 'red/green',
  'blue-purple': 'blue/purple',
  'green-brown': 'green/brown-olive',
  neutral: 'other colors',
}

export interface ColorBoard {
  cells: number[]
  /** Color ids to clear, in order. */
  targets: number[]
}

function pickPalette(puzzlesDone: number, rand: () => number): ColorDef[] {
  const maxDiff =
    puzzlesDone <= 0 ? 0.2 : puzzlesDone <= 2 ? 0.55 : puzzlesDone <= 5 ? 0.8 : 1

  const distinct = COLORS.filter((c) => c.difficulty <= 0.2)
  const medium = COLORS.filter((c) => c.difficulty > 0.2 && c.difficulty <= maxDiff)
  const hard = COLORS.filter((c) => c.difficulty > 0.55 && c.difficulty <= maxDiff)

  const pool: ColorDef[] = []
  const take = (arr: ColorDef[], n: number) => {
    const copy = arr.slice()
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    }
    for (let i = 0; i < Math.min(n, copy.length); i++) {
      if (!pool.some((p) => p.id === copy[i]!.id)) pool.push(copy[i]!)
    }
  }

  // Always start with clearly distinct hues.
  take(distinct, puzzlesDone <= 1 ? 8 : 5)

  if (puzzlesDone >= 1) {
    // Bias toward one confusion family early, then mix.
    const families: ConfusionGroup[] = ['red-green', 'blue-purple', 'green-brown']
    const groups: ConfusionGroup[] =
      puzzlesDone < 3 ? [families[Math.floor(rand() * families.length)]!] : families
    for (const g of groups) {
      take(
        medium.filter((c) => c.group === g),
        puzzlesDone < 3 ? 3 : 2,
      )
      if (puzzlesDone >= 4) {
        take(
          hard.filter((c) => c.group === g),
          2,
        )
      }
    }
  }

  // Cap palette size for the board.
  const targetSize = Math.min(10, Math.max(6, 6 + Math.floor(puzzlesDone / 2)))
  while (pool.length > targetSize) pool.pop()
  while (pool.length < 6) {
    take(distinct, 1)
    if (pool.length < 6) take(COLORS, 1)
  }
  return pool
}

export function generateColorBoard(puzzleId: number, puzzlesDone = 0): ColorBoard {
  const rand = mulberry32(hashSeed(puzzleId ^ 0xc01f1d00 ^ (puzzlesDone * 997)))
  const palette = pickPalette(puzzlesDone, rand)

  const cells: number[] = new Array(CELL_COUNT)
  // Guarantee each palette color appears at least twice.
  const bag: number[] = []
  for (const c of palette) bag.push(c.id, c.id)
  while (bag.length < CELL_COUNT) {
    bag.push(palette[Math.floor(rand() * palette.length)]!.id)
  }
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j]!, bag[i]!]
  }
  for (let i = 0; i < CELL_COUNT; i++) cells[i] = bag[i]!

  // Target order: shuffle palette ids from a separate stream.
  const tr = mulberry32(hashSeed(puzzleId ^ 0x7a51e ^ puzzlesDone))
  const targets = palette.map((c) => c.id)
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(tr() * (i + 1))
    ;[targets[i], targets[j]] = [targets[j]!, targets[i]!]
  }

  return { cells, targets }
}

export function patternSymbol(pattern: PatternId): string {
  switch (pattern) {
    case 'dots':
      return '•'
    case 'stripes':
      return '‖'
    case 'cross':
      return '＋'
    case 'rings':
      return '◎'
    case 'diag':
      return '╱'
    case 'grid':
      return '＃'
    case 'tri':
      return '▲'
    case 'waves':
      return '≈'
  }
}

export { GRID, CELL_COUNT }
