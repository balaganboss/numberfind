import { hashSeed, mulberry32 } from './prng.ts'

export const GRID = 8
export const CELL_COUNT = GRID * GRID
export const BOARD_COUNT = 500

export type Board = number[]

export interface PuzzleBoard {
  cells: Board
  /** Digits 0–9 exactly once, shuffled from the puzzle seed. */
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

  // Every digit 0–9 appears; target order is shuffled from the puzzle seed.
  const targets = shuffleTargets(seed)
  return { cells, targets }
}

/** Deterministic Fisher–Yates of digits 0–9 from the puzzle id / seed. */
export function shuffleTargets(puzzleId: number): number[] {
  const targets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const rand = mulberry32(hashSeed(puzzleId ^ 0x71eeb10c))
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[targets[i], targets[j]] = [targets[j]!, targets[i]!]
  }
  return targets
}

/** Pre-generated boards indexed by puzzle id 1..BOARD_COUNT (wraps). */
const CACHE: Board[] = []
for (let i = 0; i < BOARD_COUNT; i++) {
  CACHE.push(buildBoard(i + 1).cells)
}

export function generateBoard(puzzleId: number): PuzzleBoard {
  const idx = ((puzzleId - 1) % BOARD_COUNT + BOARD_COUNT) % BOARD_COUNT
  const cells = CACHE[idx]!.slice()
  // Target order is derived from the actual puzzle id so ?puzzle=N is stable.
  return {
    cells,
    targets: shuffleTargets(puzzleId),
  }
}

export function puzzleSeed(puzzleId: number): number {
  return hashSeed(puzzleId)
}
