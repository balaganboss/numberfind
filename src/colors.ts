import { TARGETS_PER_ROUND, cellCountForGrid, type GridSize } from './board.ts'
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
  grid: GridSize
  cells: number[]
  /** Color ids to clear, in order (always TARGETS_PER_ROUND). */
  targets: number[]
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
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
    shuffleInPlace(copy, rand)
    for (let i = 0; i < Math.min(n, copy.length); i++) {
      if (!pool.some((p) => p.id === copy[i]!.id)) pool.push(copy[i]!)
    }
  }

  take(distinct, puzzlesDone <= 1 ? 8 : 5)

  if (puzzlesDone >= 1) {
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

  // Exactly 10 targets per round for the 8→10→12 size tiers.
  while (pool.length > TARGETS_PER_ROUND) pool.pop()
  while (pool.length < TARGETS_PER_ROUND) {
    take(distinct, 1)
    if (pool.length < TARGETS_PER_ROUND) take(COLORS, 1)
  }
  return pool
}

export function generateColorBoard(
  puzzleId: number,
  puzzlesDone = 0,
  grid: GridSize = 8,
  targets?: number[],
): ColorBoard {
  const rand = mulberry32(hashSeed(puzzleId ^ 0xc01f1d00 ^ (puzzlesDone * 997) ^ (grid * 0x51)))
  const palette = pickPalette(puzzlesDone, rand)
  const count = cellCountForGrid(grid)

  const resolvedTargets =
    targets ??
    (() => {
      const tr = mulberry32(hashSeed(puzzleId ^ 0x7a51e ^ puzzlesDone))
      const t = palette.map((c) => c.id)
      shuffleInPlace(t, tr)
      return t
    })()

  // Fill from the round's target colors (plus any extras already in palette).
  const fillIds = Array.from(new Set([...resolvedTargets, ...palette.map((c) => c.id)]))

  const cells: number[] = new Array(count)
  const bag: number[] = []
  for (const id of resolvedTargets) bag.push(id, id)
  while (bag.length < count) {
    bag.push(fillIds[Math.floor(rand() * fillIds.length)]!)
  }
  shuffleInPlace(bag, rand)
  for (let i = 0; i < count; i++) cells[i] = bag[i]!

  return { grid, cells, targets: resolvedTargets }
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
