import { GRID } from './board.ts'
import {
  COLOR_BY_ID,
  patternSymbol,
  type ConfusionGroup,
} from './colors.ts'
import {
  advanceToPuzzle,
  createGame,
  currentTarget,
  MEDICAL_DISCLAIMER,
  newRandomPuzzle,
  onTimerExpired,
  pauseGame,
  remainingForTarget,
  restartCurrentPuzzle,
  resumeGame,
  summarizeGroupStats,
  tapCell,
  timerBudget,
  type GameState,
  type GroupStat,
} from './game.ts'
import { readModeFromUrl, writeModeToUrl, type GameMode } from './mode.ts'

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
      </div>
      <p class="hint">Puzzle seed stays in the URL. Scores are tracked per mode.</p>
    </div>
  `

  const brand = root.querySelector<HTMLElement>('#picker-brand')!
  root.querySelectorAll<HTMLButtonElement>('.mode-card').forEach((btn) => {
    btn.addEventListener('pointerenter', () => {
      const mode = btn.dataset.mode as GameMode
      brand.textContent = mode === 'color' ? 'ColorFind' : 'NumberFind'
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

  const brandName = mode === 'color' ? 'ColorFind' : 'NumberFind'
  const boardLabel = mode === 'color' ? 'Color board' : 'Number board'
  const findHint =
    mode === 'color'
      ? 'Tap every matching color before time runs out.'
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
          <span class="pill" id="score-label"></span>
          <span class="pill" id="hs-label"></span>
          <span class="pill" id="puzzle-best-label"></span>
        </div>
      </header>

      <section class="target-panel">
        <div class="target-row">
          <span class="target-label">Find</span>
          <span class="target-digit" id="target-digit">0</span>
          <span class="target-swatch-wrap" id="target-swatch-wrap" hidden>
            <span class="target-swatch" id="target-swatch" aria-hidden="true"></span>
            <span class="target-color-name" id="target-color-name"></span>
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
          <p class="results-title">Round results</p>
          <div class="results-body" id="results-body"></div>
          <p class="results-disclaimer">${MEDICAL_DISCLAIMER}</p>
          <div class="pause-actions">
            <button type="button" class="btn btn-primary" id="results-continue">Next puzzle</button>
          </div>
        </div>
      </div>

      <footer class="actions">
        <button type="button" class="btn" id="new-puzzle">New Puzzle</button>
        <label class="assist-toggle" id="assist-wrap" ${mode === 'color' ? '' : 'hidden'}>
          <input type="checkbox" id="pattern-assist" />
          <span>Pattern assist</span>
        </label>
      </footer>
      <p class="hint" id="hint">${findHint}</p>
    </div>
  `

  const boardWrap = root.querySelector<HTMLElement>('#board-wrap')!
  const boardEl = root.querySelector<HTMLElement>('#board')!
  const targetDigit = root.querySelector<HTMLElement>('#target-digit')!
  const targetSwatchWrap = root.querySelector<HTMLElement>('#target-swatch-wrap')!
  const targetSwatch = root.querySelector<HTMLElement>('#target-swatch')!
  const targetColorName = root.querySelector<HTMLElement>('#target-color-name')!
  const targetLeft = root.querySelector<HTMLElement>('#target-left')!
  const timerFill = root.querySelector<HTMLElement>('#timer-fill')!
  const timerText = root.querySelector<HTMLElement>('#timer-text')!
  const puzzleLabel = root.querySelector<HTMLElement>('#puzzle-label')!
  const scoreLabel = root.querySelector<HTMLElement>('#score-label')!
  const hsLabel = root.querySelector<HTMLElement>('#hs-label')!
  const puzzleBestLabel = root.querySelector<HTMLElement>('#puzzle-best-label')!
  const hint = root.querySelector<HTMLElement>('#hint')!
  const newBtn = root.querySelector<HTMLButtonElement>('#new-puzzle')!
  const pauseBtn = root.querySelector<HTMLButtonElement>('#pause-btn')!
  const pauseOverlay = root.querySelector<HTMLElement>('#pause-overlay')!
  const resumeBtn = root.querySelector<HTMLButtonElement>('#resume-btn')!
  const restartBtn = root.querySelector<HTMLButtonElement>('#restart-btn')!
  const resultsOverlay = root.querySelector<HTMLElement>('#results-overlay')!
  const resultsBody = root.querySelector<HTMLElement>('#results-body')!
  const resultsContinue = root.querySelector<HTMLButtonElement>('#results-continue')!
  const modeSwitch = root.querySelector<HTMLButtonElement>('#mode-switch')!
  const patternAssist = root.querySelector<HTMLInputElement>('#pattern-assist')!

  boardEl.style.setProperty('--grid', String(GRID))
  boardEl.classList.toggle('board-color', mode === 'color')
  targetDigit.hidden = mode === 'color'
  targetSwatchWrap.hidden = mode !== 'color'

  function setPausedUi(paused: boolean): void {
    boardWrap.classList.toggle('is-paused', paused)
    pauseOverlay.hidden = !paused || resultsOpen
    pauseBtn.textContent = paused ? 'Resume' : 'Pause'
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause')
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false')
  }

  function renderBoard(): void {
    boardEl.replaceChildren()
    for (let i = 0; i < state.board.cells.length; i++) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = mode === 'color' ? 'cell cell-color' : 'cell'
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
      } else {
        btn.textContent = String(value)
      }
      if (state.cleared.has(i)) {
        btn.classList.add('cleared')
        btn.disabled = true
      }
      boardEl.appendChild(btn)
    }
  }

  function renderHud(): void {
    const t = currentTarget(state)
    const rem = remainingForTarget(state)
    const budget = timerBudget(state.puzzlesDone)
    const showNewBest = performance.now() < newBestUntil
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
    } else {
      targetDigit.textContent = String(t)
    }
    targetLeft.textContent = `${rem} left`
    puzzleLabel.textContent = `Puzzle ${state.puzzleId}`
    scoreLabel.textContent = `Score ${state.sessionScore}`
    hsLabel.textContent = showNewBest ? 'New best!' : `Best: ${state.highScore}`
    hsLabel.classList.toggle('pill-accent', showNewBest)
    puzzleBestLabel.textContent = `Puzzle best: ${state.puzzleBest}`
    const pct = Math.max(0, Math.min(1, state.timeLeft / budget))
    timerFill.style.transform = `scaleX(${pct})`
    timerFill.classList.toggle('urgent', state.timeLeft <= 8)
    timerText.textContent = `${state.timeLeft.toFixed(1)}s`
    setPausedUi(state.status === 'paused')
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

  function showResults(stats: Record<ConfusionGroup, GroupStat>, nextPuzzle: number): void {
    resultsOpen = true
    const { insights, hardest } = summarizeGroupStats(stats)
    const lines: string[] = []
    if (hardest && hardest.accuracy < 0.92) {
      lines.push(
        `You found <strong>${hardest.label}</strong> shades harder than others.`,
      )
    } else if (hardest) {
      lines.push(`Solid work across the board — ${hardest.label} was your closest call.`)
    } else {
      lines.push('Nice clear — keep hunting those swatches.')
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
    resultsBody.innerHTML = lines.join('')
    resultsOverlay.hidden = false
    pauseOverlay.hidden = true
    boardWrap.classList.add('is-paused')
    resultsContinue.onclick = () => {
      resultsOpen = false
      resultsOverlay.hidden = true
      advanceToPuzzle(state, nextPuzzle)
      syncDeadlineFromState()
      renderBoard()
      renderHud()
      hint.textContent = 'New puzzle — find the target color.'
    }
  }

  function onTap(index: number): void {
    if (state.status !== 'playing' || resultsOpen) return
    const result = tapCell(state, index)
    switch (result.kind) {
      case 'miss':
        hint.textContent =
          mode === 'color'
            ? 'Wrong color — target cells restored & scrambled.'
            : 'Wrong digit — target cells restored & scrambled.'
        flashMiss()
        renderBoard()
        renderHud()
        break
      case 'hit':
        hint.textContent = `${result.remaining} left to find.`
        renderBoard()
        renderHud()
        break
      case 'digit-done':
        noteNewBest(result.newBest)
        if (!result.newBest) {
          hint.textContent =
            mode === 'color'
              ? `+${result.points} — next color!`
              : `+${result.points} — next digit!`
        }
        syncDeadlineFromState()
        renderBoard()
        renderHud()
        break
      case 'puzzle-done':
        noteNewBest(result.newBest)
        deadlineMs = null
        if (mode === 'color') {
          showResults(result.groupStats, result.nextPuzzle)
          renderHud()
        } else {
          if (!result.newBest) {
            hint.textContent = `Puzzle clear! +${result.points}. Loading next…`
          }
          renderHud()
          window.setTimeout(() => {
            advanceToPuzzle(state, result.nextPuzzle)
            syncDeadlineFromState()
            renderBoard()
            renderHud()
            hint.textContent = 'New puzzle — find the target digit.'
          }, 650)
        }
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
    resultsOpen = false
    resultsOverlay.hidden = true
    restartCurrentPuzzle(state)
    syncDeadlineFromState()
    newBestUntil = 0
    hint.textContent = 'Puzzle restarted.'
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
    resultsOpen = false
    resultsOverlay.hidden = true
    newRandomPuzzle(state)
    syncDeadlineFromState()
    newBestUntil = 0
    hint.textContent = 'Fresh puzzle loaded.'
    renderBoard()
    renderHud()
  })

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
