export type Difficulty = 'easy' | 'hard'

const STORAGE_KEY = 'numberfind-difficulty'

export function readDifficultyFromUrl(): Difficulty | null {
  const raw = new URLSearchParams(window.location.search).get('difficulty')
  if (raw === 'hard') return 'hard'
  if (raw === 'easy') return 'easy'
  return null
}

export function writeDifficultyToUrl(difficulty: Difficulty): void {
  const url = new URL(window.location.href)
  url.searchParams.set('difficulty', difficulty)
  history.replaceState(null, '', url.toString())
}

export function loadStoredDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'hard') return 'hard'
    if (raw === 'easy') return 'easy'
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
  return difficulty === 'hard' ? 'Hard' : 'Easy'
}
