/**
 * DigitsFind generator + selection smoke tests.
 * Run: npx tsx scripts/test-digits.ts
 */
import {
  countOccurrences,
  digitLengthForGrid,
  dirsForDifficulty,
  formatDigitTarget,
  generateDigitBoard,
  lineIndices,
  selectionMatchesTarget,
  shuffleDigitTargets,
  validateUniqueTargets,
} from '../src/digits.ts'

let fails = 0
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    fails++
  } else {
    console.log('ok:', msg)
  }
}

for (const difficulty of ['easy', 'hard', 'expert'] as const) {
  for (let puzzle = 1; puzzle <= 40; puzzle++) {
    for (const grid of [8, 10, 12] as const) {
      const all = shuffleDigitTargets(puzzle)
      const stageStart = grid <= 8 ? 0 : grid <= 10 ? 3 : 6
      const stageEnd = grid <= 8 ? 2 : grid <= 10 ? 5 : 9
      const stage = all.slice(stageStart, stageEnd + 1)
      const board = generateDigitBoard(puzzle, 0, grid, difficulty, all, stage)
      const len = digitLengthForGrid(grid)
      const dirs = dirsForDifficulty(difficulty)
      const lengths = stage.map(() => len)
      if (!validateUniqueTargets(board.cells, grid, stage, lengths, dirs)) {
        fails++
        console.error('dup/missing', { puzzle, grid, difficulty, stage })
        for (const t of stage) {
          const digits = Array.from(formatDigitTarget(t, len), Number)
          console.error(
            '  target',
            formatDigitTarget(t, len),
            'count',
            countOccurrences(board.cells, grid, digits, dirs),
          )
        }
      }
    }
  }
}
assert(fails === 0, '40 puzzles × 3 grids × 3 diffs unique')

const easy = dirsForDifficulty('easy')
assert(lineIndices(8, 0, 9, easy) == null, 'easy rejects diagonal 0→9')
assert(JSON.stringify(lineIndices(8, 0, 3, easy)) === JSON.stringify([0, 1, 2, 3]), 'easy H line')
assert(
  JSON.stringify(lineIndices(8, 0, 24, easy)) === JSON.stringify([0, 8, 16, 24]),
  'easy V line',
)

const hard = dirsForDifficulty('hard')
assert(lineIndices(8, 0, 27, hard) != null, 'hard allows diagonal')
assert(lineIndices(8, 3, 0, hard) != null, 'hard allows backwards H')

const cells = [6, 5, 9, 8]
assert(selectionMatchesTarget(cells, [0, 1, 2, 3], 6598, 4), 'forward match')
assert(selectionMatchesTarget(cells, [3, 2, 1, 0], 6598, 4), 'reverse path match')

console.log(fails ? `DONE with ${fails} failures` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
