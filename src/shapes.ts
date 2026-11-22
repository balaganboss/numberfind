import { TARGETS_PER_ROUND, cellCountForGrid, type GridSize } from './board.ts'
import { COLORS } from './colors.ts'
import { hashSeed, mulberry32 } from './prng.ts'

/** Shape families used for difficulty ramping (similar silhouettes). */
export type ShapeFamily = 'round' | 'box' | 'point' | 'special'

export interface ShapeDef {
  id: number
  name: string
  /** Compact label glyph for HUD / summary (Unicode). */
  glyph: string
  family: ShapeFamily
  /** 0 = very distinct, 1 = easy to confuse with siblings. */
  difficulty: number
  /** SVG path(s) in a 0–100 viewBox, filled by CSS. */
  path: string
}

/**
 * ShapeFind set — Pattern-assist-inspired silhouettes plus similar
 * distractors (circle/octagon, square/diamond) for the late ramp.
 * Pool is larger than 10 so later puzzles can swap in lookalikes.
 */
export const SHAPES: ShapeDef[] = [
  {
    id: 0,
    name: 'Circle',
    glyph: '●',
    family: 'round',
    difficulty: 0,
    path: 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84z',
  },
  {
    id: 1,
    name: 'Square',
    glyph: '■',
    family: 'box',
    difficulty: 0,
    path: 'M16 16h68v68H16z',
  },
  {
    id: 2,
    name: 'Triangle',
    glyph: '▲',
    family: 'point',
    difficulty: 0,
    path: 'M50 12L88 84H12z',
  },
  {
    id: 3,
    name: 'Star',
    glyph: '★',
    family: 'point',
    difficulty: 0.05,
    path: 'M50 8l10.5 28.5H90l-23 18.5 8.5 29L50 66l-25.5 18 8.5-29L10 36.5h29.5z',
  },
  {
    id: 4,
    name: 'Diamond',
    glyph: '◆',
    family: 'box',
    difficulty: 0.55,
    path: 'M50 8L90 50 50 92 10 50z',
  },
  {
    id: 5,
    name: 'Heart',
    glyph: '♥',
    family: 'special',
    difficulty: 0.1,
    path: 'M50 86C28 68 12 54 12 36c0-12 10-22 22-22 8 0 14 4 16 10 2-6 8-10 16-10 12 0 22 10 22 22 0 18-16 32-38 50z',
  },
  {
    id: 6,
    name: 'Octagon',
    glyph: '⬡',
    family: 'round',
    difficulty: 0.75,
    path: 'M35 10h30l20 20v30L65 90H35L15 70V40z',
  },
  {
    id: 7,
    name: 'Hexagon',
    glyph: '⬢',
    family: 'round',
    difficulty: 0.6,
    path: 'M50 8L86 28v44L50 92 14 72V28z',
  },
  {
    id: 8,
    name: 'Cross',
    glyph: '＋',
    family: 'special',
    difficulty: 0.15,
    path: 'M38 12h24v26h26v24H62v26H38V62H12V38h26z',
  },
  {
    id: 9,
    name: 'Oval',
    glyph: '⬭',
    family: 'round',
    difficulty: 0.7,
    path: 'M50 18c22 0 36 14 36 32s-14 32-36 32S14 68 14 50 28 18 50 18z',
  },
  {
    id: 10,
    name: 'Pentagon',
    glyph: '⬠',
    family: 'point',
    difficulty: 0.65,
    path: 'M50 10L88 38 74 86H26L12 38z',
  },
  {
    id: 11,
    name: 'Ring',
    glyph: '◎',
    family: 'round',
    difficulty: 0.45,
    path: 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 16a26 26 0 1 0 0 52a26 26 0 1 0 0-52z',
  },
]

export const SHAPE_BY_ID: Record<number, ShapeDef> = Object.fromEntries(
  SHAPES.map((s) => [s.id, s]),
)

export interface ShapeBoard {
  grid: GridSize
  /** Shape ids per cell (match target). */
  cells: number[]
  /** ColorFind palette color id per cell (distractor only). */
  cellColors: number[]
  /** Shape ids to clear, in order (always TARGETS_PER_ROUND). */
  targets: number[]
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

function pickShapePool(puzzlesDone: number, rand: () => number): ShapeDef[] {
  const maxDiff =
    puzzlesDone <= 0 ? 0.2 : puzzlesDone <= 2 ? 0.55 : puzzlesDone <= 4 ? 0.75 : 1

  const distinct = SHAPES.filter((s) => s.difficulty <= 0.2)
  const medium = SHAPES.filter((s) => s.difficulty > 0.2 && s.difficulty <= maxDiff)
  const hard = SHAPES.filter((s) => s.difficulty > 0.55 && s.difficulty <= maxDiff)

  const pool: ShapeDef[] = []
  const take = (arr: ShapeDef[], n: number) => {
    const copy = arr.slice()
    shuffleInPlace(copy, rand)
    for (let i = 0; i < Math.min(n, copy.length); i++) {
      if (!pool.some((p) => p.id === copy[i]!.id)) pool.push(copy[i]!)
    }
  }

  take(distinct, puzzlesDone <= 1 ? 8 : 6)

  if (puzzlesDone >= 1) {
    const families: ShapeFamily[] = ['round', 'box', 'point']
    const focus =
      puzzlesDone < 3
        ? [families[Math.floor(rand() * families.length)]!]
        : families
    for (const f of focus) {
      take(
        medium.filter((s) => s.family === f),
        2,
      )
      if (puzzlesDone >= 3) {
        take(
          hard.filter((s) => s.family === f),
          2,
        )
      }
    }
  }

  while (pool.length > TARGETS_PER_ROUND) pool.pop()
  while (pool.length < TARGETS_PER_ROUND) {
    take(distinct, 1)
    if (pool.length < TARGETS_PER_ROUND) take(SHAPES, 1)
  }
  return pool
}

/** Prefer distinct hues early; lean into ColorFind confusion shades later. */
function pickColorIds(puzzlesDone: number, rand: () => number, count: number): number[] {
  const maxDiff =
    puzzlesDone <= 1 ? 0.25 : puzzlesDone <= 3 ? 0.6 : puzzlesDone <= 5 ? 0.85 : 1
  let palette = COLORS.filter((c) => c.difficulty <= maxDiff)
  if (palette.length < 6) palette = COLORS.slice()
  const ids = palette.map((c) => c.id)
  shuffleInPlace(ids, rand)
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    out.push(ids[i % ids.length]!)
  }
  if (puzzlesDone >= 3) {
    const hard = COLORS.filter((c) => c.difficulty >= 0.55 && c.difficulty <= maxDiff)
    if (hard.length) {
      for (let i = 0; i < out.length; i++) {
        if (rand() < 0.35) {
          out[i] = hard[Math.floor(rand() * hard.length)]!.id
        }
      }
    }
  }
  return out
}

export function generateShapeBoard(
  puzzleId: number,
  puzzlesDone = 0,
  grid: GridSize = 8,
  targets?: number[],
): ShapeBoard {
  const rand = mulberry32(hashSeed(puzzleId ^ 0x5a1e500d ^ (puzzlesDone * 991) ^ (grid * 0x44)))
  const pool = pickShapePool(puzzlesDone, rand)
  const count = cellCountForGrid(grid)

  const resolvedTargets =
    targets ??
    (() => {
      const tr = mulberry32(hashSeed(puzzleId ^ 0x5144e ^ puzzlesDone))
      const t = pool.map((s) => s.id)
      shuffleInPlace(t, tr)
      return t
    })()

  const fillIds = Array.from(new Set([...resolvedTargets, ...pool.map((s) => s.id)]))

  const cells: number[] = new Array(count)
  const bag: number[] = []
  for (const id of resolvedTargets) bag.push(id, id)
  while (bag.length < count) {
    bag.push(fillIds[Math.floor(rand() * fillIds.length)]!)
  }
  shuffleInPlace(bag, rand)
  for (let i = 0; i < count; i++) cells[i] = bag[i]!

  const colorPool = pickColorIds(puzzlesDone, rand, Math.max(8, resolvedTargets.length + 2))
  const cellColors: number[] = new Array(count)
  for (let i = 0; i < count; i++) {
    cellColors[i] = colorPool[Math.floor(rand() * colorPool.length)]!
  }

  return { grid, cells, cellColors, targets: resolvedTargets }
}

/** Inline SVG markup for a filled (or stroked) shape icon. */
export function shapeSvgMarkup(
  shape: ShapeDef,
  opts: { fill?: string; stroke?: string; strokeWidth?: number; className?: string } = {},
): string {
  const fill = opts.fill ?? 'currentColor'
  const stroke = opts.stroke
  const sw = opts.strokeWidth ?? (stroke ? 6 : 0)
  const cls = opts.className ? ` class="${opts.className}"` : ''
  const strokeAttr = stroke
    ? ` fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"`
    : ` fill="${fill}"`
  const fillRule = shape.id === 11 ? ' fill-rule="evenodd"' : ''
  return `<svg${cls} viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="${shape.path}"${strokeAttr}${fillRule}/></svg>`
}
