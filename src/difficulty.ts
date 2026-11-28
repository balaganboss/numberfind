export type Difficulty = 'easy' | 'hard' | 'expert'

const STORAGE_KEY = 'numberfind-difficulty'

export function parseDifficultyParam(raw: string | null): Difficulty | null {
  if (raw === 'hard') return 'hard'
  if (raw === 'easy') return 'easy'
  if (raw === 'expert' || raw === 'shuffle') return 'expert'
  return null
}

export function readDifficultyFromUrl(): Difficulty | null {
  const raw = new URLSearchParams(window.location.search).get('difficulty')
  return parseDifficultyParam(raw)
}

export function writeDifficultyToUrl(difficulty: Difficulty): void {
  const url = new URL(window.location.href)
  url.searchParams.set('difficulty', difficulty)
  history.replaceState(null, '', url.toString())
}

export function loadStoredDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = parseDifficultyParam(raw)
    if (parsed) return parsed
  } catch {
    /* ignore */
  }
  return 'easy'
}

export function saveStoredDifficulty(difficulty: Difficulty): void {
  try {
    localStorage.setItem(STORAGE_KEY, difficulty)
  } catch {
    /* ignore */
  }
}

/** URL wins when present; otherwise localStorage; default Easy. */
export function resolveDifficulty(): Difficulty {
  return readDifficultyFromUrl() ?? loadStoredDifficulty()
}

export function applyDifficulty(difficulty: Difficulty): void {
  saveStoredDifficulty(difficulty)
  writeDifficultyToUrl(difficulty)
}

export function difficultyLabel(difficulty: Difficulty): string {
  if (difficulty === 'hard') return 'Hard'
  if (difficulty === 'expert') return 'Expert'
  return 'Easy'
}

/** Hard + Expert fail the round on per-target timeout. */
export function isFailOnTimeout(difficulty: Difficulty): boolean {
  return difficulty === 'hard' || difficulty === 'expert'
}

/** Expert/Shuffle regenerates the board on a fixed interval. */
export function isReshuffleDifficulty(difficulty: Difficulty): boolean {
  return difficulty === 'expert'
}

/** Default seconds between Expert board regenerations. */
export const RESHUFFLE_INTERVAL_SEC = 10

/** Visible warning window before a reshuffle. */
export const RESHUFFLE_WARN_SEC = 3

/**
 * Expert interval. Optional `?reshuffleSec=` (2–30) overrides for local tests;
 * production play uses {@link RESHUFFLE_INTERVAL_SEC}.
 */
export function reshuffleIntervalSec(): number {
  try {
    const raw = new URLSearchParams(window.location.search).get('reshuffleSec')
    if (raw == null || raw === '') return RESHUFFLE_INTERVAL_SEC
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return RESHUFFLE_INTERVAL_SEC
    return Math.min(30, Math.max(2, Math.floor(n)))
  } catch {
    return RESHUFFLE_INTERVAL_SEC
  }
}
