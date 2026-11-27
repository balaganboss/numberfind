import {
  TARGETS_PER_ROUND,
  cellCountForGrid,
  gridForTargetIndex,
  type GridSize,
  type PuzzleBoard,
} from './board.ts'
import type { Difficulty } from './difficulty.ts'
import { hashSeed, mulberry32 } from './prng.ts'

export type Dir = { dr: number; dc: number }

/** Easy: horizontal L→R and vertical top→bottom only. */
export const EASY_DIRS: Dir[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
]

/** Hard: all 8 directions (forwards + backwards + diagonals). */
export const HARD_DIRS: Dir[] = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: -1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: -1, dc: 1 },
  { dr: -1, dc: -1 },
]

export function dirsForDifficulty(difficulty: Difficulty): Dir[] {
  return difficulty === 'hard' ? HARD_DIRS : EASY_DIRS
}

/** Digit-string length for a board size tier. */
export function digitLengthForGrid(grid: GridSize): number {
  if (grid <= 8) return 4
  if (grid <= 10) return 5
  return 6
}

/** Inclusive target-index range that shares a board size with `targetIndex`. */
export function stageRangeForTargetIndex(targetIndex: number): { start: number; end: number } {
  const grid = gridForTargetIndex(targetIndex)
  let start = targetIndex
  while (start > 0 && gridForTargetIndex(start - 1) === grid) start--
  let end = targetIndex
  while (end + 1 < TARGETS_PER_ROUND && gridForTargetIndex(end + 1) === grid) end++
  return { start, end }
}

export function targetToDigits(target: number): number[] {
  const s = String(Math.floor(Math.abs(target)))
  return Array.from(s, (ch) => Number(ch))
}

export function digitsToTarget(digits: number[]): number {
  let n = 0
  for (const d of digits) n = n * 10 + (d % 10)
  return n
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

/**
 * Deterministic multi-digit targets for a puzzle.
 * Lengths follow board tiers: first 3 → 4-digit, next 3 → 5-digit, last 4 → 6-digit.
 * Stored as integers; display with {@link formatDigitTarget} to keep leading zeros.
 */
export function shuffleDigitTargets(puzzleId: number): number[] {
  const rand = mulberry32(hashSeed(puzzleId ^ 0xd19175))
  const used = new Set<string>()
  const targets: number[] = []
  for (let i = 0; i < TARGETS_PER_ROUND; i++) {
    const len = digitLengthForGrid(gridForTargetIndex(i))
    const digits: number[] = []
    for (let k = 0; k < len; k++) digits.push(Math.floor(rand() * 10))
    let key = digits.join('')
    let bump = 0
    while (used.has(key) && bump < 500) {
      digits[len - 1] = (digits[len - 1]! + 1 + Math.floor(rand() * 9)) % 10
      key = digits.join('')
      bump++
    }
    used.add(key)
    targets.push(digitsToTarget(digits))
  }
  // Light shuffle within each stage so list order ≠ placement order.
  for (const start of [0, 3, 6]) {
    const end = start === 6 ? 10 : start + 3
    const slice = targets.slice(start, end)
    shuffleInPlace(slice, rand)
    for (let i = 0; i < slice.length; i++) targets[start + i] = slice[i]!
  }
  return targets
}

/** Display string preserving leading zeros for the tier length. */
export function formatDigitTarget(target: number, length: number): string {
  return String(Math.floor(Math.abs(target))).padStart(length, '0').slice(-length)
}

function idx(r: number, c: number, grid: number): number {
  return r * grid + c
}

function inBounds(r: number, c: number, grid: number): boolean {
  return r >= 0 && c >= 0 && r < grid && c < grid
}

/** Collect all start cells where `digits` appear along `dir`. */
function findPlacements(
  cells: number[],
  grid: number,
  digits: number[],
  dir: Dir,
): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = []
  const len = digits.length
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      let ok = true
      for (let k = 0; k < len; k++) {
        const rr = r + dir.dr * k
        const cc = c + dir.dc * k
        if (!inBounds(rr, cc, grid) || cells[idx(rr, cc, grid)] !== digits[k]) {
          ok = false
          break
        }
      }
      if (ok) out.push({ r, c })
    }
  }
  return out
}

/**
 * Count occurrences of a digit sequence in allowed directions.
 * Each physical line is counted once (forward OR reverse), so a Hard
 * bidirectional scan does not double-count the same cells.
 */
export function countOccurrences(
  cells: number[],
  grid: number,
  digits: number[],
  dirs: Dir[],
): number {
  const forward = digits
  const reverse = [...digits].reverse()
  const seen = new Set<string>()

  const keyFor = (r: number, c: number, dir: Dir, len: number): string => {
    const cellsKeys: string[] = []
    for (let k = 0; k < len; k++) {
      cellsKeys.push(`${r + dir.dr * k},${c + dir.dc * k}`)
    }
    cellsKeys.sort()
    return cellsKeys.join('|')
  }

  for (const dir of dirs) {
    for (const start of findPlacements(cells, grid, forward, dir)) {
      seen.add(keyFor(start.r, start.c, dir, forward.length))
    }
    // Only scan reverse when it differs (palindromes are the same sequence).
    if (reverse.some((d, i) => d !== forward[i])) {
      for (const start of findPlacements(cells, grid, reverse, dir)) {
        seen.add(keyFor(start.r, start.c, dir, reverse.length))
      }
    }
  }
  return seen.size
}

function canPlace(
  cells: (number | null)[],
  grid: number,
  digits: number[],
  r: number,
  c: number,
  dir: Dir,
): boolean {
  for (let k = 0; k < digits.length; k++) {
    const rr = r + dir.dr * k
    const cc = c + dir.dc * k
    if (!inBounds(rr, cc, grid)) return false
    const cur = cells[idx(rr, cc, grid)]
    if (cur != null && cur !== digits[k]) return false
  }
  return true
}

function placeDigits(
  cells: (number | null)[],
  grid: number,
  digits: number[],
  r: number,
  c: number,
  dir: Dir,
): void {
  for (let k = 0; k < digits.length; k++) {
    cells[idx(rr(r, dir, k), cc(c, dir, k), grid)] = digits[k]!
  }
}

function rr(r: number, dir: Dir, k: number): number {
  return r + dir.dr * k
}
function cc(c: number, dir: Dir, k: number): number {
  return c + dir.dc * k
}

function clearUnfixed(cells: (number | null)[], fixed: boolean[]): void {
  for (let i = 0; i < cells.length; i++) {
    if (!fixed[i]) cells[i] = null
  }
}

/** Near-miss: bias filler toward digits that appear in targets. */
function nearMissDigit(targets: number[][], rand: () => number): number {
  if (targets.length === 0) return Math.floor(rand() * 10)
  if (rand() < 0.55) {
    const t = targets[Math.floor(rand() * targets.length)]!
    return t[Math.floor(rand() * t.length)]!
  }
  return Math.floor(rand() * 10)
}

function fillEmpty(
  cells: (number | null)[],
  fixed: boolean[],
  targetDigitLists: number[][],
  rand: () => number,
): void {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] == null) cells[i] = nearMissDigit(targetDigitLists, rand)
  }
  // Silence unused in signature contract when fixed is only for callers.
  void fixed
}

function finalizeCells(cells: (number | null)[]): number[] {
  return cells.map((v) => (v == null ? 0 : v))
}

/**
 * After placing targets + filler, ensure each target appears exactly once
 * under the allowed direction set. Returns false if any target has ≠1 hit.
 */
export function validateUniqueTargets(
  cells: number[],
  grid: number,
  targets: number[],
  lengths: number[],
  dirs: Dir[],
): boolean {
  for (let i = 0; i < targets.length; i++) {
    const digits = Array.from(formatDigitTarget(targets[i]!, lengths[i]!), (ch) => Number(ch))
    if (countOccurrences(cells, grid, digits, dirs) !== 1) return false
  }
  return true
}

/**
 * DigitsFind board for a grid tier. Places the stage's targets exactly once
 * in allowed directions, fills with near-miss noise, rejects accidental dupes.
 */
export function generateDigitBoard(
  puzzleId: number,
  _puzzlesDone: number,
  grid: GridSize,
  difficulty: Difficulty,
  allTargets?: number[],
  /** Subset of allTargets to place on this board (current stage). */
  stageTargets?: number[],
): PuzzleBoard {
  const targets = allTargets ?? shuffleDigitTargets(puzzleId)
  const len = digitLengthForGrid(grid)
  const { start, end } = (() => {
    // Infer stage from grid size.
    if (grid <= 8) return { start: 0, end: 2 }
    if (grid <= 10) return { start: 3, end: 5 }
    return { start: 6, end: 9 }
  })()
  const placeList = stageTargets ?? targets.slice(start, end + 1)
  const dirs = dirsForDifficulty(difficulty)
  // Placement uses Easy dirs only for intentional layout on Easy;
  // Hard may place in any Hard dir. Accidental-dupe scan always uses full allowed set.
  const placeDirs = dirs

  const count = cellCountForGrid(grid)
  const baseRand = mulberry32(hashSeed(puzzleId ^ 0x61a17 ^ (grid * 0x9e37) ^ (difficulty === 'hard' ? 0x11 : 0)))

  const lengths = placeList.map(() => len)
  const digitLists = placeList.map((t) =>
    Array.from(formatDigitTarget(t, len), (ch) => Number(ch)),
  )

  for (let attempt = 0; attempt < 80; attempt++) {
    const rand = mulberry32(hashSeed((puzzleId + attempt * 9973) ^ (grid << 8) ^ 0x61a17))
    const cells: (number | null)[] = new Array(count).fill(null)
    const fixed = new Array(count).fill(false)
    let placedOk = true

    for (let ti = 0; ti < digitLists.length; ti++) {
      const digits = digitLists[ti]!
      const candidates: { r: number; c: number; dir: Dir }[] = []
      for (const dir of placeDirs) {
        for (let r = 0; r < grid; r++) {
          for (let c = 0; c < grid; c++) {
            if (canPlace(cells, grid, digits, r, c, dir)) {
              candidates.push({ r, c, dir })
            }
          }
        }
      }
      if (candidates.length === 0) {
        placedOk = false
        break
      }
      shuffleInPlace(candidates, rand)
      let chosen: { r: number; c: number; dir: Dir } | null = null
      for (const cand of candidates) {
        // Tentatively place and ensure we don't create a second copy of earlier targets yet —
        // full validation runs after fill; here just place.
        placeDigits(cells, grid, digits, cand.r, cand.c, cand.dir)
        for (let k = 0; k < digits.length; k++) {
          fixed[idx(rr(cand.r, cand.dir, k), cc(cand.c, cand.dir, k), grid)] = true
        }
        chosen = cand
        break
      }
      if (!chosen) {
        placedOk = false
        break
      }
    }

    if (!placedOk) continue

    // Filler regeneration loop: keep fixed target cells, reshuffle empty ones.
    for (let fillTry = 0; fillTry < 40; fillTry++) {
      clearUnfixed(cells, fixed)
      const fillRand = mulberry32(
        hashSeed(puzzleId ^ (attempt * 131) ^ (fillTry * 9176) ^ (grid * 3) ^ 0xc0ffee),
      )
      fillEmpty(cells, fixed, digitLists, fillRand)
      // Prefer near-miss patterns: sprinkle target prefixes that dead-end.
      sprinkleNearMisses(cells, fixed, grid, digitLists, placeDirs, fillRand)

      const finalCells = finalizeCells(cells)
      if (validateUniqueTargets(finalCells, grid, placeList, lengths, dirs)) {
        // Consume baseRand so seed path stays tied to difficulty/grid.
        void baseRand()
        return {
          grid,
          cells: finalCells,
          targets,
        }
      }
    }
  }

  // Fallback: sparse placement with zeros elsewhere (should be rare).
  const cells = new Array(count).fill(0)
  let cursor = 0
  for (const digits of digitLists) {
    for (let k = 0; k < digits.length && cursor < count; k++) {
      cells[cursor++] = digits[k]!
    }
    cursor += 1
  }
  return { grid, cells, targets }
}

/**
 * Plant almost-matches: write a target prefix along an allowed line that
 * cannot complete to the full target (last cell forced different).
 */
function sprinkleNearMisses(
  cells: (number | null)[],
  fixed: boolean[],
  grid: number,
  digitLists: number[][],
  dirs: Dir[],
  rand: () => number,
): void {
  const tries = Math.min(12, digitLists.length * 3)
  for (let n = 0; n < tries; n++) {
    const digits = digitLists[Math.floor(rand() * digitLists.length)]!
    if (digits.length < 3) continue
    const prefixLen = 2 + Math.floor(rand() * (digits.length - 2))
    const dir = dirs[Math.floor(rand() * dirs.length)]!
    const r = Math.floor(rand() * grid)
    const c = Math.floor(rand() * grid)
    // Ensure room for prefixLen cells.
    const endR = r + dir.dr * (prefixLen - 1)
    const endC = c + dir.dc * (prefixLen - 1)
    if (!inBounds(endR, endC, grid)) continue
    let fits = true
    for (let k = 0; k < prefixLen; k++) {
      const i = idx(rr(r, dir, k), cc(c, dir, k), grid)
      if (fixed[i]) {
        fits = false
        break
      }
    }
    if (!fits) continue
    for (let k = 0; k < prefixLen - 1; k++) {
      cells[idx(rr(r, dir, k), cc(c, dir, k), grid)] = digits[k]!
    }
    // Last prefix cell: wrong digit so it is a near miss, not a full match.
    const wrong = (digits[prefixLen - 1]! + 1 + Math.floor(rand() * 9)) % 10
    cells[idx(rr(r, dir, prefixLen - 1), cc(c, dir, prefixLen - 1), grid)] = wrong
  }
}

/** Snap a drag from start→end to a straight line of cell indices, or null. */
export function lineIndices(
  grid: number,
  startIndex: number,
  endIndex: number,
  dirs: Dir[],
): number[] | null {
  const sr = Math.floor(startIndex / grid)
  const sc = startIndex % grid
  const er = Math.floor(endIndex / grid)
  const ec = endIndex % grid
  const dr = er - sr
  const dc = ec - sc
  if (dr === 0 && dc === 0) return [startIndex]

  const stepR = dr === 0 ? 0 : dr / Math.abs(dr)
  const stepC = dc === 0 ? 0 : dc / Math.abs(dc)
  // Must be straight: horizontal, vertical, or diagonal (|dr|===|dc|).
  if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return null

  const dir = { dr: stepR, dc: stepC }
  if (!dirs.some((d) => d.dr === dir.dr && d.dc === dir.dc)) return null

  const steps = Math.max(Math.abs(dr), Math.abs(dc))
  const out: number[] = []
  for (let k = 0; k <= steps; k++) {
    out.push(idx(sr + dir.dr * k, sc + dir.dc * k, grid))
  }
  return out
}

/** Read the number formed by cells along indices (forward). */
export function readSelection(cells: number[], indices: number[]): number {
  return digitsToTarget(indices.map((i) => cells[i]!))
}

/**
 * Whether a selection matches a target under allowed dirs.
 * Selection path already encodes direction; also accept reverse reading.
 */
export function selectionMatchesTarget(
  cells: number[],
  indices: number[],
  target: number,
  length: number,
): boolean {
  if (indices.length !== length) return false
  const want = formatDigitTarget(target, length)
  const forward = indices.map((i) => String(cells[i]!)).join('')
  if (forward === want) return true
  const backward = [...indices]
    .reverse()
    .map((i) => String(cells[i]!))
    .join('')
  return backward === want
}
