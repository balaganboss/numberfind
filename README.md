# NumberFind

Mobile-first digit-hunt puzzle. Clear every instance of the target digit before the timer runs out, then move to the next digit (0–9).

## Play

Open the site with an optional puzzle seed:

```
/?puzzle=1
```

Same `?puzzle=` value always loads the same board.

## Rules

- **Target digits** — every digit 0–9 exactly once per round, shuffled from the puzzle seed (same `?puzzle=` → same order).
- **Timer** — 45s base per digit; +2s every 5 puzzles completed.
- **Timeout** — only the current digit’s cleared cells are restored; find that digit again.
- **Wrong tap** — restores found cells of the current target and scrambles the remaining ones.
- **Score** — banking `ceil(seconds left)` when you finish a digit. High score is saved in `localStorage`.

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
