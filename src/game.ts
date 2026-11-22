import { CELL_COUNT, generateBoard, type PuzzleBoard } from './board.ts'
import { mulberry32, hashSeed } from './prng.ts'

const HS_KEY = 'numberfind-highscore'
const PUZZLE_BEST_KEY = 'numberfind-puzzle-bests'
const BASE_TIMER = 45
const TIMER_STEP = 2
const TIMER_EVERY = 5

export type GameStatus = 'playing' | 'paused' | 'won'

export interface GameState {
  puzzleId: number
  board: PuzzleBoard
  /** Indices cleared this round (any digit). */
  cleared: Set<number>
  /** Indices cleared for the current target digit. */
  clearedCurrent: Set<number>
  targetIndex: number
  /** Seconds remaining for current target. */
  timeLeft: number
  /** Puzzles fully completed this session (drives timer bonus). */
  puzzlesDone: number
  /** Score for the current puzzle round. */
  roundScore: number
  /** Cumulative session score. */
  sessionScore: number
  /** All-time best session score. */
  highScore: number
  /** Best round score for the current puzzle seed. */
  puzzleBest: number
  /** True when the latest bank beat overall or puzzle best. */
  justBeatBest: boolean
  status: GameStatus
}

export function timerBudget(puzzlesDone: number): number {
  return BASE_TIMER + Math.floor(puzzlesDone / TIMER_EVERY) * TIMER_STEP
}

export function readPuzzleFromUrl(): number {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('puzzle')
  const n = raw ? parseInt(raw, 10) : 1
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function writePuzzleToUrl(puzzleId: number): void {
  const url = new URL(window.location.href)
  url.searchParams.set('puzzle', String(puzzleId))
  history.replaceState(null, '', url.toString())
}

function parseNonNegInt(raw: string | null): number {
  if (raw == null || raw === '') return 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

export function loadHighScore(): number {
  try {
    return parseNonNegInt(localStorage.getItem(HS_KEY))
  } catch {
    return 0
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HS_KEY, String(Math.max(0, Math.floor(score))))
  } catch {
    /* ignore quota / private mode */
  }
}

function loadPuzzleBestMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PUZZLE_BEST_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number.parseInt(k, 10)
      if (!Number.isFinite(id) || id < 1) continue
      const score =
        typeof v === 'number'
          ? v
          : typeof v === 'string'
            ? Number.parseInt(v, 10)
            : NaN
      if (!Number.isFinite(score) || score < 0) continue
      out[String(Math.floor(id))] = Math.floor(score)
    }
    return out
  } catch {
    return {}
  }
}

function savePuzzleBestMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(PUZZLE_BEST_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function loadPuzzleBest(puzzleId: number): number {
  const map = loadPuzzleBestMap()
  const v = map[String(puzzleId)]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

function savePuzzleBest(puzzleId: number, score: number): void {
  const map = loadPuzzleBestMap()
  map[String(puzzleId)] = Math.max(0, Math.floor(score))
  savePuzzleBestMap(map)
}

/** Update overall + per-puzzle bests after banking points. Returns whether either was beaten. */
export function recordScoreBests(state: GameState): boolean {
  let beat = false
  if (state.sessionScore > state.highScore) {
    state.highScore = state.sessionScore
    saveHighScore(state.highScore)
    beat = true
  }
  if (state.roundScore > state.puzzleBest) {
    state.puzzleBest = state.roundScore
    savePuzzleBest(state.puzzleId, state.puzzleBest)
    beat = true
  }
  state.justBeatBest = beat
  return beat
}

export function createGame(puzzleId = readPuzzleFromUrl()): GameState {
  const board = generateBoard(puzzleId)
  writePuzzleToUrl(puzzleId)
  return {
    puzzleId,
    board,
    cleared: new Set(),
    clearedCurrent: new Set(),
    targetIndex: 0,
    timeLeft: timerBudget(0),
    puzzlesDone: 0,
    roundScore: 0,
    sessionScore: 0,
    highScore: loadHighScore(),
    puzzleBest: loadPuzzleBest(puzzleId),
    justBeatBest: false,
    status: 'playing',
  }
}

export function currentTarget(state: GameState): number {
  return state.board.targets[state.targetIndex]!
}

export function remainingForTarget(state: GameState): number {
  const t = currentTarget(state)
  let n = 0
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.board.cells[i] === t && !state.cleared.has(i)) n++
  }
  return n
}

export function startTargetTimer(state: GameState): void {
  state.timeLeft = timerBudget(state.puzzlesDone)
  state.clearedCurrent = new Set()
}

/** Restore only cells of the current target that were cleared. */
export function restoreCurrentTarget(state: GameState): void {
  for (const i of state.clearedCurrent) {
    state.cleared.delete(i)
  }
  state.clearedCurrent = new Set()
}

/**
 * Wrong tap: restore found cells of current target, then scramble
 * positions of instances that were still unfound.
 */
export function penalizeWrongTap(state: GameState): void {
  const t = currentTarget(state)
  restoreCurrentTarget(state)

  const unfound: number[] = []
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.board.cells[i] === t && !state.cleared.has(i)) {
      unfound.push(i)
    }
  }

  const visible: number[] = []
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!state.cleared.has(i) && state.board.cells[i] !== t) {
      visible.push(i)
    }
  }

  const rand = mulberry32(hashSeed(state.puzzleId * 10007 + unfound.length * 13 + Date.now()))
  for (const from of unfound) {
    if (visible.length === 0) break
    const vi = Math.floor(rand() * visible.length)
    const to = visible[vi]!
    // Swap board values so the target digit moves.
    const tmp = state.board.cells[from]!
    state.board.cells[from] = state.board.cells[to]!
    state.board.cells[to] = tmp
    visible[vi] = visible[visible.length - 1]!
    visible.pop()
  }
}

export type TapResult =
  | { kind: 'miss' }
  | { kind: 'already' }
  | { kind: 'hit'; remaining: number }
  | { kind: 'digit-done'; points: number; newBest: boolean }
  | { kind: 'puzzle-done'; points: number; nextPuzzle: number; newBest: boolean }

export function tapCell(state: GameState, index: number): TapResult {
  if (state.status !== 'playing') return { kind: 'already' }
  if (state.cleared.has(index)) return { kind: 'already' }

  const t = currentTarget(state)
  if (state.board.cells[index] !== t) {
    penalizeWrongTap(state)
    return { kind: 'miss' }
  }

  state.cleared.add(index)
  state.clearedCurrent.add(index)
  const remaining = remainingForTarget(state)
  if (remaining > 0) {
    return { kind: 'hit', remaining }
  }

  // Finished this digit — bank ceil(seconds left).
  const points = Math.ceil(state.timeLeft)
  state.roundScore += points
  state.sessionScore += points
  const newBest = recordScoreBests(state)

  if (state.targetIndex + 1 < state.board.targets.length) {
    state.targetIndex++
    startTargetTimer(state)
    return { kind: 'digit-done', points, newBest }
  }

  // Puzzle complete → next unused puzzle id.
  state.puzzlesDone++
  state.status = 'won'
  const nextPuzzle = state.puzzleId + 1
  return { kind: 'puzzle-done', points, nextPuzzle, newBest }
}

export function onTimerExpired(state: GameState): void {
  restoreCurrentTarget(state)
  startTargetTimer(state)
}

export function pauseGame(state: GameState): boolean {
  if (state.status !== 'playing') return false
  state.status = 'paused'
  return true
}

export function resumeGame(state: GameState): boolean {
  if (state.status !== 'paused') return false
  state.status = 'playing'
  return true
}

/** Restart the current puzzle seed; keep session score / puzzlesDone. */
export function restartCurrentPuzzle(state: GameState): void {
  const board = generateBoard(state.puzzleId)
  writePuzzleToUrl(state.puzzleId)
  state.board = board
  state.cleared = new Set()
  state.clearedCurrent = new Set()
  state.targetIndex = 0
  state.roundScore = 0
  state.justBeatBest = false
  state.puzzleBest = loadPuzzleBest(state.puzzleId)
  state.status = 'playing'
  startTargetTimer(state)
}

export function advanceToPuzzle(state: GameState, puzzleId: number): void {
  const board = generateBoard(puzzleId)
  writePuzzleToUrl(puzzleId)
  state.puzzleId = puzzleId
  state.board = board
  state.cleared = new Set()
  state.clearedCurrent = new Set()
  state.targetIndex = 0
  state.roundScore = 0
  state.justBeatBest = false
  state.puzzleBest = loadPuzzleBest(puzzleId)
  state.status = 'playing'
  startTargetTimer(state)
}

export function newRandomPuzzle(state: GameState): void {
  const next = state.puzzleId + 1 + Math.floor(Math.random() * 50)
  advanceToPuzzle(state, next)
}
