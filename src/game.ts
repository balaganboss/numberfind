import { CELL_COUNT, generateBoard, type PuzzleBoard } from './board.ts'
import {
  COLOR_BY_ID,
  CONFUSION_GROUPS,
  generateColorBoard,
  GROUP_LABEL,
  type ConfusionGroup,
} from './colors.ts'
import type { GameMode } from './mode.ts'
import { mulberry32, hashSeed } from './prng.ts'

const HS_KEYS: Record<GameMode, string> = {
  number: 'numberfind-highscore',
  color: 'colorfind-highscore',
}
const PUZZLE_BEST_KEYS: Record<GameMode, string> = {
  number: 'numberfind-puzzle-bests',
  color: 'colorfind-puzzle-bests',
}
const BASE_TIMER = 45
const TIMER_STEP = 2
const TIMER_EVERY = 5

export type GameStatus = 'playing' | 'paused' | 'won'

export interface GroupStat {
  hits: number
  misses: number
  /** Milliseconds spent while this group was the active target. */
  timeMs: number
}

export interface GameState {
  mode: GameMode
  puzzleId: number
  board: PuzzleBoard
  /** Indices cleared this round (any target). */
  cleared: Set<number>
  /** Indices cleared for the current target. */
  clearedCurrent: Set<number>
  targetIndex: number
  /** Seconds remaining for current target. */
  timeLeft: number
  /** Puzzles fully completed this session (drives timer bonus + color difficulty). */
  puzzlesDone: number
  /** Score for the current puzzle round. */
  roundScore: number
  /** Cumulative session score. */
  sessionScore: number
  /** All-time best session score for this mode. */
  highScore: number
  /** Best round score for the current puzzle seed in this mode. */
  puzzleBest: number
  /** True when the latest bank beat overall or puzzle best. */
  justBeatBest: boolean
  status: GameStatus
  /** Color-mode confusion tracking for the current puzzle. */
  groupStats: Record<ConfusionGroup, GroupStat>
  /** performance.now() when the current target became active. */
  targetStartedAt: number
  patternAssist: boolean
}

function emptyGroupStats(): Record<ConfusionGroup, GroupStat> {
  return {
    'red-green': { hits: 0, misses: 0, timeMs: 0 },
    'blue-purple': { hits: 0, misses: 0, timeMs: 0 },
    'green-brown': { hits: 0, misses: 0, timeMs: 0 },
    neutral: { hits: 0, misses: 0, timeMs: 0 },
  }
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

export function loadHighScore(mode: GameMode): number {
  try {
    return parseNonNegInt(localStorage.getItem(HS_KEYS[mode]))
  } catch {
    return 0
  }
}

function saveHighScore(mode: GameMode, score: number): void {
  try {
    localStorage.setItem(HS_KEYS[mode], String(Math.max(0, Math.floor(score))))
  } catch {
    /* ignore quota / private mode */
  }
}

function loadPuzzleBestMap(mode: GameMode): Record<string, number> {
  try {
    const raw = localStorage.getItem(PUZZLE_BEST_KEYS[mode])
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

function savePuzzleBestMap(mode: GameMode, map: Record<string, number>): void {
  try {
    localStorage.setItem(PUZZLE_BEST_KEYS[mode], JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function loadPuzzleBest(mode: GameMode, puzzleId: number): number {
  const map = loadPuzzleBestMap(mode)
  const v = map[String(puzzleId)]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

function savePuzzleBest(mode: GameMode, puzzleId: number, score: number): void {
  const map = loadPuzzleBestMap(mode)
  map[String(puzzleId)] = Math.max(0, Math.floor(score))
  savePuzzleBestMap(mode, map)
}

/** Update overall + per-puzzle bests after banking points. Returns whether either was beaten. */
export function recordScoreBests(state: GameState): boolean {
  let beat = false
  if (state.sessionScore > state.highScore) {
    state.highScore = state.sessionScore
    saveHighScore(state.mode, state.highScore)
    beat = true
  }
  if (state.roundScore > state.puzzleBest) {
    state.puzzleBest = state.roundScore
    savePuzzleBest(state.mode, state.puzzleId, state.puzzleBest)
    beat = true
  }
  state.justBeatBest = beat
  return beat
}

function buildBoard(mode: GameMode, puzzleId: number, puzzlesDone: number): PuzzleBoard {
  if (mode === 'color') {
    const b = generateColorBoard(puzzleId, puzzlesDone)
    return { cells: b.cells, targets: b.targets }
  }
  return generateBoard(puzzleId)
}

export function createGame(mode: GameMode, puzzleId = readPuzzleFromUrl()): GameState {
  const board = buildBoard(mode, puzzleId, 0)
  writePuzzleToUrl(puzzleId)
  return {
    mode,
    puzzleId,
    board,
    cleared: new Set(),
    clearedCurrent: new Set(),
    targetIndex: 0,
    timeLeft: timerBudget(0),
    puzzlesDone: 0,
    roundScore: 0,
    sessionScore: 0,
    highScore: loadHighScore(mode),
    puzzleBest: loadPuzzleBest(mode, puzzleId),
    justBeatBest: false,
    status: 'playing',
    groupStats: emptyGroupStats(),
    targetStartedAt: performance.now(),
    patternAssist: false,
  }
}

export function currentTarget(state: GameState): number {
  return state.board.targets[state.targetIndex]!
}

export function currentGroup(state: GameState): ConfusionGroup {
  if (state.mode !== 'color') return 'neutral'
  return COLOR_BY_ID[currentTarget(state)]?.group ?? 'neutral'
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
  state.targetStartedAt = performance.now()
}

function accrueTargetTime(state: GameState): void {
  if (state.mode !== 'color') return
  const g = currentGroup(state)
  const dt = Math.max(0, performance.now() - state.targetStartedAt)
  state.groupStats[g].timeMs += dt
  state.targetStartedAt = performance.now()
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
  | {
      kind: 'puzzle-done'
      points: number
      nextPuzzle: number
      newBest: boolean
      groupStats: Record<ConfusionGroup, GroupStat>
    }

export function tapCell(state: GameState, index: number): TapResult {
  if (state.status !== 'playing') return { kind: 'already' }
  if (state.cleared.has(index)) return { kind: 'already' }

  const t = currentTarget(state)
  if (state.board.cells[index] !== t) {
    if (state.mode === 'color') {
      state.groupStats[currentGroup(state)].misses++
    }
    penalizeWrongTap(state)
    return { kind: 'miss' }
  }

  state.cleared.add(index)
  state.clearedCurrent.add(index)
  if (state.mode === 'color') {
    state.groupStats[currentGroup(state)].hits++
  }
  const remaining = remainingForTarget(state)
  if (remaining > 0) {
    return { kind: 'hit', remaining }
  }

  accrueTargetTime(state)

  const points = Math.ceil(state.timeLeft)
  state.roundScore += points
  state.sessionScore += points
  const newBest = recordScoreBests(state)

  if (state.targetIndex + 1 < state.board.targets.length) {
    state.targetIndex++
    startTargetTimer(state)
    return { kind: 'digit-done', points, newBest }
  }

  state.puzzlesDone++
  state.status = 'won'
  const nextPuzzle = state.puzzleId + 1
  const groupStats = state.groupStats
  return { kind: 'puzzle-done', points, nextPuzzle, newBest, groupStats }
}

export function onTimerExpired(state: GameState): void {
  accrueTargetTime(state)
  restoreCurrentTarget(state)
  startTargetTimer(state)
}

export function pauseGame(state: GameState): boolean {
  if (state.status !== 'playing') return false
  accrueTargetTime(state)
  state.status = 'paused'
  return true
}

export function resumeGame(state: GameState): boolean {
  if (state.status !== 'paused') return false
  state.status = 'playing'
  state.targetStartedAt = performance.now()
  return true
}

/** Restart the current puzzle seed; keep session score / puzzlesDone. */
export function restartCurrentPuzzle(state: GameState): void {
  const board = buildBoard(state.mode, state.puzzleId, state.puzzlesDone)
  writePuzzleToUrl(state.puzzleId)
  state.board = board
  state.cleared = new Set()
  state.clearedCurrent = new Set()
  state.targetIndex = 0
  state.roundScore = 0
  state.justBeatBest = false
  state.puzzleBest = loadPuzzleBest(state.mode, state.puzzleId)
  state.status = 'playing'
  state.groupStats = emptyGroupStats()
  startTargetTimer(state)
}

export function advanceToPuzzle(state: GameState, puzzleId: number): void {
  const board = buildBoard(state.mode, puzzleId, state.puzzlesDone)
  writePuzzleToUrl(puzzleId)
  state.puzzleId = puzzleId
  state.board = board
  state.cleared = new Set()
  state.clearedCurrent = new Set()
  state.targetIndex = 0
  state.roundScore = 0
  state.justBeatBest = false
  state.puzzleBest = loadPuzzleBest(state.mode, puzzleId)
  state.status = 'playing'
  state.groupStats = emptyGroupStats()
  startTargetTimer(state)
}

export function newRandomPuzzle(state: GameState): void {
  const next = state.puzzleId + 1 + Math.floor(Math.random() * 50)
  advanceToPuzzle(state, next)
}

export interface GroupInsight {
  group: ConfusionGroup
  label: string
  accuracy: number
  timeSec: number
  attempts: number
}

export function summarizeGroupStats(
  stats: Record<ConfusionGroup, GroupStat>,
): { insights: GroupInsight[]; hardest: GroupInsight | null } {
  const insights: GroupInsight[] = []
  for (const g of CONFUSION_GROUPS) {
    if (g === 'neutral') continue
    const s = stats[g]
    const attempts = s.hits + s.misses
    if (attempts === 0 && s.timeMs < 50) continue
    const accuracy = attempts === 0 ? 1 : s.hits / attempts
    insights.push({
      group: g,
      label: GROUP_LABEL[g],
      accuracy,
      timeSec: s.timeMs / 1000,
      attempts,
    })
  }
  insights.sort((a, b) => a.accuracy - b.accuracy || b.timeSec - a.timeSec)
  const hardest = insights.length ? insights[0]! : null
  return { insights, hardest }
}

export const MEDICAL_DISCLAIMER =
  'This is a game, not a medical test. If you have concerns about your color vision, see an eye care professional.'
