import { scoreWeightForGrid } from './board.ts'
import { COLOR_BY_ID, patternSymbol } from './colors.ts'
import {
  createGame,
  currentTarget,
  isNewPuzzleBest,
  MEDICAL_DISCLAIMER,
  newRandomPuzzle,
  onTimerExpired,
  pauseGame,
  remainingForTarget,
  restartCurrentPuzzle,
  resumeGame,
  roundTotalTimeSec,
  SCORE_SCALE_NOTE,
  summarizeGroupStats,
  tapCell,
  timerBudget,
  type GameState,
  type TargetStat,
} from './game.ts'
import { celebrateLineForRound, mountMascot } from './mascot.ts'
import { modeBrand, readModeFromUrl, writeModeToUrl, type GameMode } from './mode.ts'
import { SHAPE_BY_ID, shapeSvgMarkup } from './shapes.ts'

export function mount(root: HTMLElement): void {
  const initialMode = readModeFromUrl()
  if (!initialMode) {
    showModePicker(root)
    return
  }
  mountGame(root, initialMode)
}

function showModePicker(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell picker-shell">
      <header class="top">
        <div class="brand" id="picker-brand">NumberFind</div>
        <p class="picker-tagline">Pick a hunt. Same timer, new eyes.</p>
      </header>
      <div class="mode-picker" role="group" aria-label="Game mode">
        <button type="button" class="mode-card" data-mode="number" id="mode-number">
          <span class="mode-card-title">NumberFind</span>
          <span class="mode-card-desc">Hunt digits on a seeded board before the clock runs out.</span>
        </button>
        <button type="button" class="mode-card" data-mode="color" id="mode-color">
          <span class="mode-card-title">ColorFind</span>
          <span class="mode-card-desc">Hunt matching color swatches — shades get trickier as you go.</span>
        </button>
        <button type="button" class="mode-card" data-mode="shape" id="mode-shape">
          <span class="mode-card-title">ShapeFind</span>
          <span class="mode-card-desc">Hunt matching shapes in any color — lookalikes sneak in later.</span>
        </button>
      </div>
      <p class="hint">Puzzle seed stays in the URL. Scores are tracked per mode.</p>
    </div>
  `

  const brand = root.querySelector<HTMLElement>('#picker-brand')!
  root.querySelectorAll<HTMLButtonElement>('.mode-card').forEach((btn) => {
    btn.addEventListener('pointerenter', () => {
      const mode = btn.dataset.mode as GameMode
      brand.textContent = modeBrand(mode)
    })
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as GameMode
      writeModeToUrl(mode)
      mountGame(root, mode)
    })
  })
}

function mountGame(root: HTMLElement, mode: GameMode): void {
  writeModeToUrl(mode)
  let state: GameState = createGame(mode)
  let deadlineMs: number | null = performance.now() + state.timeLeft * 1000
  let raf = 0
  let newBestUntil = 0
  let pauseLatchUntil = 0
  let resultsOpen = false

  function syncDeadlineFromState(): void {
    if (state.status === 'playing') {
      deadlineMs = performance.now() + Math.max(0, state.timeLeft) * 1000
    } else {
      deadlineMs = null
    }
  }

  function freezeTimeLeftFromDeadline(): void {
    if (deadlineMs == null) return
    state.timeLeft = Math.max(0, (deadlineMs - performance.now()) / 1000)
    deadlineMs = null
  }

  const brandName = modeBrand(mode)
  const boardLabel =
    mode === 'color' ? 'Color board' : mode === 'shape' ? 'Shape board' : 'Number board'
  const findHint =
    mode === 'color'
      ? 'Tap every matching color before time runs out.'
      : mode === 'shape'
        ? 'Tap every matching shape — any color counts.'
        : 'Tap every matching digit before time runs out.'

  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand-row">
          <div class="brand">${brandName}</div>
          <button type="button" class="mode-switch" id="mode-switch" aria-label="Switch mode">Modes</button>
        </div>
        <div class="meta">
          <span class="pill" id="puzzle-label"></span>
          <span class="pill" id="grid-label"></span>
          <span class="pill" id="score-label"></span>
          <span class="pill" id="hs-label"></span>
          <span class="pill" id="puzzle-best-label"></span>
        </div>
      </header>

      <section class="target-panel">
        <div class="target-play" id="target-play">
          <div class="target-row">
            <span class="target-label">Find</span>
            <span class="target-digit" id="target-digit">0</span>
            <span class="target-swatch-wrap" id="target-swatch-wrap" hidden>
              <span class="target-swatch" id="target-swatch" aria-hidden="true"></span>
              <span class="target-color-name" id="target-color-name"></span>
            </span>
            <span class="target-shape-wrap" id="target-shape-wrap" hidden>
              <span class="target-shape-icon" id="target-shape-icon" aria-hidden="true"></span>
              <span class="target-shape-copy">
                <span class="target-shape-name" id="target-shape-name"></span>
                <span class="target-shape-hint">any color</span>
              </span>
            </span>
            <span class="target-left" id="target-left"></span>
          </div>
          <div class="timer-row">
            <div class="timer-track" aria-hidden="true">
              <div class="timer-fill" id="timer-fill"></div>
            </div>
            <button type="button" class="pause-btn" id="pause-btn" aria-label="Pause">Pause</button>
          </div>
          <div class="timer-text" id="timer-text">45.0s</div>
        </div>
        <div class="target-done" id="target-done" hidden>
          <p class="target-done-title">Round complete</p>
          <p class="target-done-sub" id="target-done-sub">Nice hunting.</p>
        </div>
        <div class="mascot-slot" id="mascot-slot"></div>
      </section>

      <div class="board-wrap" id="board-wrap">
        <div class="board" id="board" role="grid" aria-label="${boardLabel}"></div>
        <div class="pause-overlay" id="pause-overlay" hidden>
          <p class="pause-title">Paused</p>
          <div class="pause-actions">
            <button type="button" class="btn btn-primary" id="resume-btn">Resume</button>
            <button type="button" class="btn" id="restart-btn">Restart</button>
          </div>
        </div>
        <div class="results-overlay" id="results-overlay" hidden>
          <p class="results-title">Round summary</p>
          <div class="results-body" id="results-body"></div>
          <p class="results-disclaimer" id="results-disclaimer" hidden>${MEDICAL_DISCLAIMER}</p>
        </div>
      </div>

      <footer class="actions play-actions" id="play-actions">
        <button type="button" class="btn" id="new-puzzle">New Puzzle</button>
        <label class="assist-toggle" id="assist-wrap" ${mode === 'color' ? '' : 'hidden'}>
          <input type="checkbox" id="pattern-assist" />
          <span>Pattern assist</span>
        </label>
      </footer>
      <footer class="actions results-actions" id="results-actions" hidden>
        <button type="button" class="btn btn-primary" id="results-play-again">Play again</button>
        <button type="button" class="btn" id="results-replay">Replay this puzzle</button>
      </footer>
      <p class="hint" id="hint">${findHint}</p>
    </div>
  `

  const shellEl = root.querySelector<HTMLElement>('.shell')!
  const boardWrap = root.querySelector<HTMLElement>('#board-wrap')!
  const boardEl = root.querySelector<HTMLElement>('#board')!
  const targetPlay = root.querySelector<HTMLElement>('#target-play')!
  const targetDone = root.querySelector<HTMLElement>('#target-done')!
  const targetDoneSub = root.querySelector<HTMLElement>('#target-done-sub')!
  const targetDigit = root.querySelector<HTMLElement>('#target-digit')!
  const targetSwatchWrap = root.querySelector<HTMLElement>('#target-swatch-wrap')!
  const targetSwatch = root.querySelector<HTMLElement>('#target-swatch')!
  const targetColorName = root.querySelector<HTMLElement>('#target-color-name')!
  const targetShapeWrap = root.querySelector<HTMLElement>('#target-shape-wrap')!
  const targetShapeIcon = root.querySelector<HTMLElement>('#target-shape-icon')!
  const targetShapeName = root.querySelector<HTMLElement>('#target-shape-name')!
  const targetLeft = root.querySelector<HTMLElement>('#target-left')!
  const timerFill = root.querySelector<HTMLElement>('#timer-fill')!
  const timerText = root.querySelector<HTMLElement>('#timer-text')!
  const puzzleLabel = root.querySelector<HTMLElement>('#puzzle-label')!
  const gridLabel = root.querySelector<HTMLElement>('#grid-label')!
  const scoreLabel = root.querySelector<HTMLElement>('#score-label')!
  const hsLabel = root.querySelector<HTMLElement>('#hs-label')!
  const puzzleBestLabel = root.querySelector<HTMLElement>('#puzzle-best-label')!
  const hint = root.querySelector<HTMLElement>('#hint')!
  const playActions = root.querySelector<HTMLElement>('#play-actions')!
  const resultsActions = root.querySelector<HTMLElement>('#results-actions')!
  const newBtn = root.querySelector<HTMLButtonElement>('#new-puzzle')!
  const pauseBtn = root.querySelector<HTMLButtonElement>('#pause-btn')!
  const pauseOverlay = root.querySelector<HTMLElement>('#pause-overlay')!
  const resumeBtn = root.querySelector<HTMLButtonElement>('#resume-btn')!
  const restartBtn = root.querySelector<HTMLButtonElement>('#restart-btn')!
  const resultsOverlay = root.querySelector<HTMLElement>('#results-overlay')!
  const resultsBody = root.querySelector<HTMLElement>('#results-body')!
  const resultsDisclaimer = root.querySelector<HTMLElement>('#results-disclaimer')!
  const resultsPlayAgain = root.querySelector<HTMLButtonElement>('#results-play-again')!
  const resultsReplay = root.querySelector<HTMLButtonElement>('#results-replay')!
  const modeSwitch = root.querySelector<HTMLButtonElement>('#mode-switch')!
  const patternAssist = root.querySelector<HTMLInputElement>('#pattern-assist')!
  const mascotSlot = root.querySelector<HTMLElement>('#mascot-slot')!
  const mascot = mountMascot(mascotSlot)

  targetDigit.hidden = mode !== 'number'
  targetSwatchWrap.hidden = mode !== 'color'
  targetShapeWrap.hidden = mode !== 'shape'

  function applyBoardChrome(): void {
    const g = state.board.grid
    boardEl.style.setProperty('--grid', String(g))
    boardEl.dataset.grid = String(g)
    boardEl.classList.toggle('board-color', mode === 'color')
    boardEl.classList.toggle('board-shape', mode === 'shape')
  }

  function setPausedUi(paused: boolean): void {
    boardWrap.classList.toggle('is-paused', paused || resultsOpen)
    pauseOverlay.hidden = !paused || resultsOpen
    pauseBtn.textContent = paused ? 'Resume' : 'Pause'
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause')
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false')
  }

  function setResultsUi(open: boolean, celebrateMsg?: string): void {
    resultsOpen = open
    shellEl.classList.toggle('is-results', open)
    targetPlay.hidden = open
    targetDone.hidden = !open
    playActions.hidden = open
    resultsActions.hidden = !open
    resultsOverlay.hidden = !open
    pauseOverlay.hidden = true
    boardWrap.classList.toggle('is-paused', open || state.status === 'paused')
    pauseBtn.disabled = open
    if (open) {
      targetDoneSub.textContent = celebrateMsg ?? 'Nice hunting.'
      hint.textContent = 'Pick Play again or Replay this puzzle.'
    } else {
      resultsDisclaimer.hidden = true
      resultsBody.innerHTML = ''
    }
  }

  function renderBoard(opts?: { grow?: boolean }): void {
    applyBoardChrome()
    boardEl.replaceChildren()
    for (let i = 0; i < state.board.cells.length; i++) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className =
        mode === 'color' ? 'cell cell-color' : mode === 'shape' ? 'cell cell-shape' : 'cell'
      btn.dataset.index = String(i)
      const value = state.board.cells[i]!
      if (mode === 'color') {
        const def = COLOR_BY_ID[value]
        btn.style.setProperty('--cell-color', def?.hex ?? '#888')
        btn.setAttribute('aria-label', def?.name ?? 'color')
        if (state.patternAssist && def) {
          const mark = document.createElement('span')
          mark.className = 'cell-pattern'
          mark.textContent = patternSymbol(def.pattern)
          mark.setAttribute('aria-hidden', 'true')
          btn.appendChild(mark)
        }
      } else if (mode === 'shape') {
        const def = SHAPE_BY_ID[value]
        const colorId = state.board.cellColors?.[i]
        const color = colorId != null ? COLOR_BY_ID[colorId] : undefined
        const hex = color?.hex ?? '#9be7ff'
        btn.style.setProperty('--shape-color', hex)
        btn.setAttribute('aria-label', `${def?.name ?? 'shape'}, ${color?.name ?? 'color'}`)
        if (def) {
          const mark = document.createElement('span')
          mark.className = 'cell-shape-icon'
          mark.innerHTML = shapeSvgMarkup(def, { fill: hex })
          mark.setAttribute('aria-hidden', 'true')
          btn.appendChild(mark)
        }
      } else {
        btn.textContent = String(value)
      }
      if (state.cleared.has(i)) {
        btn.classList.add('cleared')
        btn.disabled = true
      }
      boardEl.appendChild(btn)
    }
    if (opts?.grow) {
      boardEl.classList.remove('is-growing')
      // Force reflow so the grow animation restarts.
      void boardEl.offsetWidth
      boardEl.classList.add('is-growing')
      window.setTimeout(() => boardEl.classList.remove('is-growing'), 520)
    }
  }

  function renderHud(): void {
    const t = currentTarget(state)
    const rem = remainingForTarget(state)
    const budget = timerBudget(state.puzzlesDone)
    const showNewBest = performance.now() < newBestUntil
    const weight = scoreWeightForGrid(state.board.grid)
    if (mode === 'color') {
      const def = COLOR_BY_ID[t]
      targetSwatch.style.background = def?.hex ?? '#888'
      targetColorName.textContent = def?.name ?? 'Color'
      if (state.patternAssist && def) {
        targetSwatch.dataset.pattern = def.pattern
        targetSwatch.textContent = patternSymbol(def.pattern)
      } else {
        delete targetSwatch.dataset.pattern
        targetSwatch.textContent = ''
      }
    } else if (mode === 'shape') {
      const def = SHAPE_BY_ID[t]
      targetShapeName.textContent = def ? `${def.glyph} ${def.name}` : 'Shape'
      targetShapeIcon.innerHTML = def
        ? shapeSvgMarkup(def, {
            stroke: 'var(--accent)',
            strokeWidth: 7,
            className: 'target-shape-svg',
          })
        : ''
    } else {
      targetDigit.textContent = String(t)
    }
    targetLeft.textContent = `${rem} left`
    puzzleLabel.textContent = `Puzzle ${state.puzzleId}`
    gridLabel.textContent =
      weight === 1
        ? `${state.board.grid}×${state.board.grid}`
        : `${state.board.grid}×${state.board.grid} · ×${weight}`
    scoreLabel.textContent = `Score ${state.sessionScore}`
    hsLabel.textContent = showNewBest ? 'New best!' : `Best: ${state.highScore}`
    hsLabel.classList.toggle('pill-accent', showNewBest)
    puzzleBestLabel.textContent = `Puzzle best: ${state.puzzleBest}`
    const pct = Math.max(0, Math.min(1, state.timeLeft / budget))
    timerFill.style.transform = `scaleX(${pct})`
    timerFill.classList.toggle('urgent', state.timeLeft <= 8)
    timerText.textContent = `${state.timeLeft.toFixed(1)}s`
    setPausedUi(state.status === 'paused')
    const searching =
      !resultsOpen &&
      state.timeLeft > 0 &&
      state.timeLeft <= 10 &&
      (state.status === 'playing' || state.status === 'paused')
    mascot.setUrgentSearch(searching)
    mascot.setPaused(state.status === 'paused')
  }

  function flashMiss(): void {
    boardEl.classList.add('shake')
    window.setTimeout(() => boardEl.classList.remove('shake'), 280)
  }

  function noteNewBest(flag: boolean): void {
    if (!flag) return
    newBestUntil = performance.now() + 2200
    hint.textContent = 'New best!'
  }

  function targetLabel(targetId: number): string {
    if (mode === 'color') return COLOR_BY_ID[targetId]?.name ?? `Color ${targetId}`
    if (mode === 'shape') {
      const def = SHAPE_BY_ID[targetId]
      return def ? `${def.glyph} ${def.name}` : `Shape ${targetId}`
    }
    return String(targetId)
  }

  function wrongLabel(n: number): string {
    return n === 1 ? '1 wrong' : `${n} wrong`
  }

  function showRoundSummary(targetStats: TargetStat[]): void {
    deadlineMs = null
    const newBest = isNewPuzzleBest(state)
    const totalSec = roundTotalTimeSec(state)
    const totalMisses = targetStats.reduce((n, t) => n + t.misses, 0)
    const line = celebrateLineForRound({
      newBest,
      roundScore: state.roundScore,
      totalMisses,
      targetCount: targetStats.length,
    })
    const lines: string[] = []

    lines.push('<div class="results-scoreboard">')
    lines.push(
      `<div class="results-score-main"><span class="results-score-label">Round score</span><span class="results-score-value">${state.roundScore}</span></div>`,
    )
    lines.push(
      `<div class="results-score-best${newBest ? ' is-new' : ''}"><span class="results-score-label">Best</span><span class="results-score-value">${state.puzzleBest}${newBest ? ' <em>New best!</em>' : ''}</span></div>`,
    )
    lines.push(
      `<div class="results-score-total"><span class="results-score-label">Total time</span><span class="results-score-value">${totalSec.toFixed(1)}s</span></div>`,
    )
    lines.push('</div>')

    lines.push('<p class="results-section-title">Per target</p>')
    lines.push('<ul class="results-list results-targets">')
    for (const t of targetStats) {
      const sec = (t.timeMs / 1000).toFixed(1)
      lines.push(
        `<li><span>${t.order}. ${targetLabel(t.targetId)}</span><span>${t.grid}×${t.grid} · ${sec}s · ${wrongLabel(t.misses)}</span></li>`,
      )
    }
    lines.push('</ul>')
    lines.push(`<p class="results-scale-note">${SCORE_SCALE_NOTE}</p>`)

    if (mode === 'color') {
      const { insights, hardest } = summarizeGroupStats(state.groupStats)
      lines.push('<p class="results-section-title">Shade groups</p>')
      if (hardest && hardest.accuracy < 0.92) {
        lines.push(
          `<p class="results-insight">You found <strong>${hardest.label}</strong> shades harder than others.</p>`,
        )
      } else if (hardest) {
        lines.push(
          `<p class="results-insight">Solid work across the board — ${hardest.label} was your closest call.</p>`,
        )
      } else {
        lines.push('<p class="results-insight">Nice clear — keep hunting those swatches.</p>')
      }
      if (insights.length) {
        lines.push('<ul class="results-list">')
        for (const g of insights) {
          const pct = Math.round(g.accuracy * 100)
          lines.push(
            `<li><span>${g.label}</span><span>${pct}% accuracy · ${g.timeSec.toFixed(1)}s</span></li>`,
          )
        }
        lines.push('</ul>')
      }
      resultsDisclaimer.hidden = false
    } else {
      resultsDisclaimer.hidden = true
    }

    resultsBody.innerHTML = lines.join('')
    setResultsUi(true, line)
    mascot.setCelebrate(true, line)
  }

  function closeResults(): void {
    setResultsUi(false)
    pauseBtn.disabled = false
    mascot.setCelebrate(false)
    mascot.reset()
  }

  function onTap(index: number): void {
    if (state.status !== 'playing' || resultsOpen) return
    const result = tapCell(state, index)
    switch (result.kind) {
      case 'miss':
        hint.textContent =
          mode === 'color'
            ? 'Wrong color — target cells restored & scrambled.'
            : mode === 'shape'
              ? 'Wrong shape — target cells restored & scrambled.'
              : 'Wrong digit — target cells restored & scrambled.'
        flashMiss()
        mascot.setMood('oops', { holdMs: 500 })
        renderBoard()
        renderHud()
        break
      case 'hit':
        hint.textContent = `${result.remaining} left to find.`
        mascot.setMood('happy', { holdMs: 420 })
        renderBoard()
        renderHud()
        break
      case 'digit-done':
        noteNewBest(result.newBest)
        if (result.leveledUp) {
          hint.textContent = `Board grows to ${result.grid}×${result.grid}!`
          mascot.setMood('cheer', { line: 'Level up!', holdMs: 900 })
          syncDeadlineFromState()
          renderBoard({ grow: true })
          renderHud()
        } else {
          if (!result.newBest) {
            hint.textContent =
              mode === 'color'
                ? `+${result.points} — next color!`
                : mode === 'shape'
                  ? `+${result.points} — next shape!`
                  : `+${result.points} — next digit!`
          }
          mascot.setMood('cheer', { holdMs: 700 })
          syncDeadlineFromState()
          renderBoard()
          renderHud()
        }
        break
      case 'puzzle-done':
        noteNewBest(result.newBest)
        deadlineMs = null
        showRoundSummary(result.targetStats)
        renderHud()
        break
      default:
        break
    }
  }

  function enterPause(): boolean {
    if (resultsOpen || state.status !== 'playing') return false
    freezeTimeLeftFromDeadline()
    if (!pauseGame(state)) return false
    hint.textContent = 'Paused — board hidden.'
    renderHud()
    return true
  }

  function leavePause(): boolean {
    if (resultsOpen) return false
    if (!resumeGame(state)) return false
    syncDeadlineFromState()
    hint.textContent = 'Resumed — keep finding.'
    renderHud()
    return true
  }

  function togglePause(): void {
    if (resultsOpen) return
    const now = performance.now()
    if (now < pauseLatchUntil) return
    pauseLatchUntil = now + 320
    if (state.status === 'paused') leavePause()
    else if (state.status === 'playing') enterPause()
  }

  function doRestart(): void {
    closeResults()
    restartCurrentPuzzle(state)
    syncDeadlineFromState()
    newBestUntil = 0
    mascot.reset()
    hint.textContent = 'Puzzle restarted.'
    renderBoard()
    renderHud()
  }

  function doPlayAgain(): void {
    closeResults()
    newRandomPuzzle(state)
    syncDeadlineFromState()
    newBestUntil = 0
    mascot.reset()
    hint.textContent =
      mode === 'color'
        ? 'New puzzle — find the target color.'
        : mode === 'shape'
          ? 'New puzzle — find the target shape.'
          : 'New puzzle — find the target digit.'
    renderBoard()
    renderHud()
  }

  function doReplayPuzzle(): void {
    closeResults()
    restartCurrentPuzzle(state)
    syncDeadlineFromState()
    newBestUntil = 0
    mascot.reset()
    hint.textContent = 'Same puzzle — go again.'
    renderBoard()
    renderHud()
  }

  boardEl.addEventListener('pointerup', (e) => {
    if (state.status !== 'playing' || resultsOpen) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cell')
    if (!el || el.classList.contains('cleared')) return
    const index = Number(el.dataset.index)
    if (!Number.isFinite(index)) return
    e.preventDefault()
    onTap(index)
  })

  newBtn.addEventListener('click', () => {
    closeResults()
    newRandomPuzzle(state)
    syncDeadlineFromState()
    newBestUntil = 0
    hint.textContent = 'Fresh puzzle loaded.'
    renderBoard()
    renderHud()
  })

  resultsPlayAgain.addEventListener('click', () => doPlayAgain())
  resultsReplay.addEventListener('click', () => doReplayPuzzle())

  pauseBtn.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    togglePause()
  })
  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault()
    togglePause()
  })

  resumeBtn.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const now = performance.now()
    if (now < pauseLatchUntil) return
    pauseLatchUntil = now + 320
    leavePause()
  })
  resumeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    const now = performance.now()
    if (now < pauseLatchUntil) return
    pauseLatchUntil = now + 320
    leavePause()
  })

  restartBtn.addEventListener('click', () => doRestart())

  modeSwitch.addEventListener('click', () => {
    cancelAnimationFrame(raf)
    const url = new URL(window.location.href)
    url.searchParams.delete('mode')
    history.replaceState(null, '', url.toString())
    showModePicker(root)
  })

  patternAssist?.addEventListener('change', () => {
    state.patternAssist = !!patternAssist.checked
    renderBoard()
    renderHud()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return
    const el = e.target as HTMLElement | null
    const tag = el?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (el?.isContentEditable) return
    e.preventDefault()
    togglePause()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') enterPause()
  })

  function tick(ts: number): void {
    if (state.status === 'playing' && !resultsOpen) {
      if (deadlineMs == null) syncDeadlineFromState()
      state.timeLeft = Math.max(0, ((deadlineMs ?? ts) - ts) / 1000)
      if (state.timeLeft <= 0) {
        state.timeLeft = 0
        onTimerExpired(state)
        syncDeadlineFromState()
        hint.textContent =
          mode === 'color'
            ? 'Time up — find that color again.'
            : mode === 'shape'
              ? 'Time up — find that shape again.'
              : 'Time up — find that digit again.'
        renderBoard()
      }
      renderHud()
    } else if (state.status === 'paused') {
      if (newBestUntil > 0) renderHud()
    }
    raf = requestAnimationFrame(tick)
  }

  renderBoard()
  renderHud()
  raf = requestAnimationFrame(tick)
  void raf
}
