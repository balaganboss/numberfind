# NumberFind

Mobile-first hunt puzzles. Pick a mode from the home picker (or `?mode=`).

## Play

```
/?mode=number&puzzle=1
/?mode=color&puzzle=1
/?mode=shape&puzzle=1
/?mode=digits&puzzle=1
```

Same `?puzzle=` value always loads the same board for that mode. `?difficulty=easy|hard|expert` (or `shuffle`) sets difficulty.

## Modes

- **NumberFind** (`number`) — tap every instance of the target digit.
- **ColorFind** (`color`) — tap matching color swatches.
- **ShapeFind** (`shape`) — tap matching shapes (any color).
- **DigitsFind** (`digits`) — drag-select hidden 4–6 digit numbers (word-search style). Easy: across & down only. Hard/Expert: diagonals + backwards. Listed numbers cross off when found; board grows 8→10→12.

## Shared rules

- **Timer** — 45s base per target; +2s every 5 puzzles completed.
- **Easy timeout** — retry the current hunt; Hard/Expert timeout fails/resets the round.
- **Expert (Shuffle)** — every 10s the board regenerates; found cells/targets stay locked; pause freezes the reshuffle clock; countdown flash before each shuffle.
- **Score** — bank weighted time left when you clear a target. Bests are per mode + difficulty in `localStorage`.

## Develop

```bash
npm install
npm run dev
```

Vite serves on `0.0.0.0` (see `vite.config.ts`).

```bash
npm run build   # outputs to dist/
npm run preview
```

## Deploy (Netlify)

`netlify.toml` runs `npm run build` and publishes `dist/`.
