import { hashSeed, mulberry32 } from './prng.ts'

/** Fixed round length so size tiers land on targets 1–3 / 4–6 / 7–10. */
export const TARGETS_PER_ROUND = 10

export type GridSize = 8 | 10 | 12

/** Legacy default; prefer board.grid / gridForTargetIndex. */
export const GRID: GridSize = 8
export const CELL_COUNT = GRID * GRID

export function gridForTargetIndex(targetIndex: number): GridSize {
  if (targetIndex < 3) return 8
  if (targetIndex < 6) return 10
  return 12
}

export function scoreWeightForGrid(grid: number): number {
  if (grid >= 12) return 1.5
  if (grid >= 10) return 1.25
  return 1
}

export function cellCountForGrid(grid: number): number {
  return grid * grid
}

export type Board = number[]

export interface PuzzleBoard {
  grid: GridSize
  cells: Board
  /** Exactly TARGETS_PER_ROUND ids, shuffled from the puzzle seed. */
  targets: number[]
  /** ShapeFind only: ColorFind palette id per cell (distractor). */
  cellColors?: number[]
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

/** Deterministic Fisher–Yates of digits 0–9 from the puzzle id / seed. */
export function shuffleTargets(puzzleId: number): number[] {
  const targets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const rand = mulberry32(hashSeed(puzzleId ^ 0x71eeb10c))
  shuffleInPlace(targets, rand)
  return targets
}

/**
 * NumberFind board for a given grid. Same `?puzzle=` + grid → same cells.
 * Pass `targets` to keep round order when the board grows mid-round.
 */
export function generateBoard(
  puzzleId: number,
  grid: GridSize = 8,
  targets?: number[],
): PuzzleBoard {
  const count = cellCountForGrid(grid)
  const rand = mulberry32(hashSeed(puzzleId ^ 0xa5a5a5a5 ^ (grid * 0x9e37)))
  const cells: Board = new Array(count)

  // Guarantee every digit 0–9 appears at least twice.
  const bag: number[] = []
  for (let d = 0; d < 10; d++) bag.push(d, d)
  while (bag.length < count) {
    bag.push(Math.floor(rand() * 10))
  }
  shuffleInPlace(bag, rand)
  for (let i = 0; i < count; i++) cells[i] = bag[i]!

  return {
    grid,
    cells,
    targets: targets ?? shuffleTargets(puzzleId),
  }
}

export function puzzleSeed(puzzleId: number): number {
  return hashSeed(puzzleId)
}
