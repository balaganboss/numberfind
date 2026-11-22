import { hashSeed, mulberry32 } from './prng.ts'

export const GRID = 8
export const CELL_COUNT = GRID * GRID
export const BOARD_COUNT = 500

export type Board = number[]

export interface PuzzleBoard {
  cells: Board
  /** Digits that appear on the board (unique), ascending. */
  targets: number[]
}

function buildBoard(seed: number): PuzzleBoard {
  const rand = mulberry32(hashSeed(seed ^ 0xa5a5a5a5))
  const cells: Board = new Array(CELL_COUNT)

  // Guarantee every digit 0–9 appears at least twice.
  const guaranteed: number[] = []
  for (let d = 0; d < 10; d++) {
    guaranteed.push(d, d)
  }
  // Fill remaining slots with random digits.
  while (guaranteed.length < CELL_COUNT) {
    guaranteed.push(Math.floor(rand() * 10))
  }
  // Fisher–Yates shuffle.
  for (let i = guaranteed.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[guaranteed[i], guaranteed[j]] = [guaranteed[j], guaranteed[i]]
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    cells[i] = guaranteed[i]!
  }

  const present = new Set(cells)
  const targets = [...present].sort((a, b) => a - b)
  return { cells, targets }
}

/** Pre-generated boards indexed by puzzle id 1..BOARD_COUNT (wraps). */
const CACHE: PuzzleBoard[] = []
for (let i = 0; i < BOARD_COUNT; i++) {
  CACHE.push(buildBoard(i + 1))
}

export function generateBoard(puzzleId: number): PuzzleBoard {
  const idx = ((puzzleId - 1) % BOARD_COUNT + BOARD_COUNT) % BOARD_COUNT
  const base = CACHE[idx]!
  // Return a shallow copy so mutations (scramble) don't poison the cache.
  return {
    cells: base.cells.slice(),
    targets: base.targets.slice(),
  }
}

export function puzzleSeed(puzzleId: number): number {
  return hashSeed(puzzleId)
}
