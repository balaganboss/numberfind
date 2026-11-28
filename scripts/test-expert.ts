/**
 * Expert/Shuffle difficulty + reshuffle smoke tests.
 * Run: npx tsx scripts/test-expert.ts
 */

// Minimal browser globals for game.ts URL + timer helpers under Node.
const root = globalThis as typeof globalThis & Record<string, unknown>
const loc = { href: 'http://localhost/?puzzle=1', search: '?puzzle=1' }
const hist = {
  replaceState: (_s: unknown, _t: string, url?: string) => {
    if (typeof url === 'string') {
      loc.href = url
      const q = url.indexOf('?')
      loc.search = q >= 0 ? url.slice(q) : ''
    }
  },
}
const store = new Map<string, string>()
const ls = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, String(v))
  },
  removeItem: (k: string) => {
    store.delete(k)
  },
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size
  },
}
root.window = { location: loc, history: hist }
root.history = hist
root.localStorage = ls
root.performance = { now: () => Date.now() }

import {
  parseDifficultyParam,
  difficultyLabel,
  isFailOnTimeout,
  isReshuffleDifficulty,
  RESHUFFLE_INTERVAL_SEC,
} from '../src/difficulty.ts'
import {
  countOccurrences,
  digitLengthForGrid,
  dirsForDifficulty,
  formatDigitTarget,
  generateDigitBoard,
  reshuffleDigitBoard,
  shuffleDigitTargets,
  validateUniqueTargets,
} from '../src/digits.ts'
import {
  createGame,
  onTimerExpired,
  pauseGame,
  reshuffleBoard,
  resumeGame,
  submitSelection,
  tapCell,
} from '../src/game.ts'

let fails = 0
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    fails++
  } else {
    console.log('ok:', msg)
  }
}

// —— difficulty parsing ——
assert(parseDifficultyParam('expert') === 'expert', 'parse expert')
assert(parseDifficultyParam('shuffle') === 'expert', 'parse shuffle→expert')
assert(parseDifficultyParam('hard') === 'hard', 'parse hard')
assert(parseDifficultyParam('easy') === 'easy', 'parse easy')
assert(parseDifficultyParam('nope') === null, 'parse junk')
assert(difficultyLabel('expert') === 'Expert', 'label Expert')
assert(isFailOnTimeout('expert'), 'expert fails on timeout')
assert(isFailOnTimeout('hard'), 'hard fails on timeout')
assert(!isFailOnTimeout('easy'), 'easy does not fail on timeout')
assert(isReshuffleDifficulty('expert'), 'expert reshuffles')
assert(!isReshuffleDifficulty('hard'), 'hard does not reshuffle')
assert(dirsForDifficulty('expert').length === 8, 'expert 8 dirs')

// —— digit boards unique on expert ——
{
  let dupes = 0
  for (let puzzle = 1; puzzle <= 30; puzzle++) {
    for (const grid of [8, 10, 12] as const) {
      const all = shuffleDigitTargets(puzzle)
      const stageStart = grid <= 8 ? 0 : grid <= 10 ? 3 : 6
      const stageEnd = grid <= 8 ? 2 : grid <= 10 ? 5 : 9
      const stage = all.slice(stageStart, stageEnd + 1)
      const board = generateDigitBoard(puzzle, 0, grid, 'expert', all, stage)
      const len = digitLengthForGrid(grid)
      const dirs = dirsForDifficulty('expert')
      const lengths = stage.map(() => len)
      if (!validateUniqueTargets(board.cells, grid, stage, lengths, dirs)) {
        dupes++
        console.error('expert dup/missing', { puzzle, grid, stage })
      }
    }
  }
  assert(dupes === 0, '30 puzzles × 3 grids expert unique')
}

// —— reshuffle keeps locked found cells, remaining unique ——
{
  let bad = 0
  for (let puzzle = 1; puzzle <= 20; puzzle++) {
    const grid = 8 as const
    const all = shuffleDigitTargets(puzzle)
    const stage = all.slice(0, 3)
    const board = generateDigitBoard(puzzle, 0, grid, 'expert', all, stage)
    const len = digitLengthForGrid(grid)
    const dirs = dirsForDifficulty('expert')

    const digits = Array.from(formatDigitTarget(stage[0]!, len), Number)
    let lockedStart: { r: number; c: number; dir: { dr: number; dc: number } } | null = null
    outer: for (const dir of dirs) {
      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          let ok = true
          for (let k = 0; k < len; k++) {
            const rr = r + dir.dr * k
            const cc = c + dir.dc * k
            if (rr < 0 || cc < 0 || rr >= grid || cc >= grid) {
              ok = false
              break
            }
            if (board.cells[rr * grid + cc] !== digits[k]) {
              ok = false
              break
            }
          }
          if (ok) {
            lockedStart = { r, c, dir }
            break outer
          }
        }
      }
    }
    if (!lockedStart) {
      bad++
      console.error('could not locate target 0', puzzle)
      continue
    }

    const foundCells = new Set<number>()
    const lockedVals = new Map<number, number>()
    for (let k = 0; k < len; k++) {
      const i =
        (lockedStart.r + lockedStart.dir.dr * k) * grid +
        (lockedStart.c + lockedStart.dir.dc * k)
      foundCells.add(i)
      lockedVals.set(i, board.cells[i]!)
    }
    const foundTargets = new Set<number>([0])

    const next = reshuffleDigitBoard(puzzle, board, 'expert', foundCells, foundTargets, 1)
    for (const [i, v] of lockedVals) {
      if (next.cells[i] !== v) {
        bad++
        console.error('locked cell moved', { puzzle, i, was: v, now: next.cells[i] })
        break
      }
    }
    const lengths = stage.map(() => len)
    if (!validateUniqueTargets(next.cells, grid, stage, lengths, dirs)) {
      bad++
      console.error('reshuffle not unique', puzzle)
      for (const t of stage) {
        const d = Array.from(formatDigitTarget(t, len), Number)
        console.error('  ', formatDigitTarget(t, len), countOccurrences(next.cells, grid, d, dirs))
      }
    }

    const next2 = reshuffleDigitBoard(puzzle, next, 'expert', foundCells, foundTargets, 2)
    for (const [i, v] of lockedVals) {
      if (next2.cells[i] !== v) {
        bad++
        console.error('locked cell moved on 2nd reshuffle', puzzle)
        break
      }
    }
  }
  assert(bad === 0, 'reshuffle keeps locks + uniqueness (20 puzzles)')
}

// —— game: timeout fail, pause freezes clock, tap reshuffle ——
{
  const g = createGame('number', 7, 'expert')
  assert(g.reshuffleLeft === RESHUFFLE_INTERVAL_SEC, 'reshuffle starts at 10s')
  assert(g.reshuffleCount === 0, 'reshuffle count 0')

  const t = g.board.targets[0]!
  let hit = -1
  for (let i = 0; i < g.board.cells.length; i++) {
    if (g.board.cells[i] === t) {
      hit = i
      break
    }
  }
  assert(hit >= 0, 'found a target cell to clear')
  const tap = tapCell(g, hit)
  assert(tap.kind === 'hit' || tap.kind === 'digit-done', `tap hit (${tap.kind})`)
  assert(g.cleared.has(hit), 'cell cleared')

  const lockedVal = g.board.cells[hit]!
  const pre = g.board.cells.slice()
  const did = reshuffleBoard(g)
  assert(did, 'reshuffleBoard ran')
  assert(g.reshuffleCount === 1, 'count increments')
  assert(g.reshuffleLeft === RESHUFFLE_INTERVAL_SEC, 'clock resets')
  assert(g.board.cells[hit] === lockedVal, 'cleared cell locked after reshuffle')
  assert(g.cleared.has(hit), 'cleared set preserved')

  let moved = false
  for (let i = 0; i < pre.length; i++) {
    if (g.cleared.has(i)) continue
    if (g.board.cells[i] !== pre[i]) {
      moved = true
      break
    }
  }
  assert(moved, 'unlocked cells moved on reshuffle')

  g.reshuffleLeft = 4.5
  assert(pauseGame(g), 'pause')
  assert(g.status === 'paused', 'paused status')
  assert(!reshuffleBoard(g), 'no reshuffle while paused')
  assert(resumeGame(g), 'resume')
  assert(g.status === 'playing', 'playing again')
  assert(g.reshuffleLeft === 4.5, 'reshuffleLeft preserved across pause')

  g.timeLeft = 0
  const expired = onTimerExpired(g)
  assert(expired.kind === 'failed', 'expert timeout fails')
  assert(g.status === 'failed', 'failed status')
  assert(g.roundScore === 0, 'score reset')
  assert(g.reshuffleCount === 0, 'reshuffle reset on fail')
}

// —— DigitsFind: submit then reshuffle keeps found cells ——
{
  const g = createGame('digits', 3, 'expert')
  const grid = g.board.grid
  const len = digitLengthForGrid(grid)
  const dirs = dirsForDifficulty('expert')
  const target = g.board.targets[0]!
  const digits = Array.from(formatDigitTarget(target, len), Number)

  let path: number[] | null = null
  outer: for (const dir of dirs) {
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        let ok = true
        const idxs: number[] = []
        for (let k = 0; k < len; k++) {
          const rr = r + dir.dr * k
          const cc = c + dir.dc * k
          if (rr < 0 || cc < 0 || rr >= grid || cc >= grid) {
            ok = false
            break
          }
          idxs.push(rr * grid + cc)
          if (g.board.cells[rr * grid + cc] !== digits[k]) {
            ok = false
            break
          }
        }
        if (ok) {
          path = idxs
          break outer
        }
      }
    }
  }
  assert(path != null, 'digits path found')
  const lockedSnap = new Map(path!.map((i) => [i, g.board.cells[i]!] as const))
  const result = submitSelection(g, path!)
  assert(result.kind === 'hit' || result.kind === 'puzzle-done', `digits select (${result.kind})`)
  assert(g.foundTargets.has(0), 'target 0 found')
  for (const i of path!) assert(g.foundCells.has(i), `found cell ${i}`)

  assert(reshuffleBoard(g), 'digits reshuffle')
  for (const [i, v] of lockedSnap) {
    assert(g.board.cells[i] === v, `digits locked ${i} stays ${v}`)
  }
  assert(g.foundCells.size === path!.length, 'foundCells size unchanged')
}

console.log(fails ? `DONE with ${fails} failures` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
