import { GRID } from './board.ts'
import {
  advanceToPuzzle,
  createGame,
  currentTarget,
  newRandomPuzzle,
  onTimerExpired,
  pauseGame,
  remainingForTarget,
  restartCurrentPuzzle,
  resumeGame,
  tapCell,
  timerBudget,
  type GameState,
} from './game.ts'

export function mount(root: HTMLElement): void {
  let state: GameState = createGame()
  let lastTs = performance.now()
  let raf = 0
  let newBestUntil = 0

  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">NumberFind</div>
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
        <div class="board" id="board" role="grid" aria-label="Number board"></div>
        <div class="pause-overlay" id="pause-overlay" hidden>
          <p class="pause-title">Paused</p>
          <div class="pause-actions">
            <button type="button" class="btn btn-primary" id="resume-btn">Resume</button>
            <button type="button" class="btn" id="restart-btn">Restart</button>
          </div>
        </div>
      </div>

      <footer class="actions">
        <button type="button" class="btn" id="new-puzzle">New Puzzle</button>
      </footer>
      <p class="hint" id="hint">Tap every matching digit before time runs out.</p>
    </div>
  `

  const boardWrap = root.querySelector<HTMLElement>('#board-wrap')!
  const boardEl = root.querySelector<HTMLElement>('#board')!
  const targetDigit = root.querySelector<HTMLElement>('#target-digit')!
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

  boardEl.style.setProperty('--grid', String(GRID))

  function setPausedUi(paused: boolean): void {
    boardWrap.classList.toggle('is-paused', paused)
    pauseOverlay.hidden = !paused
    pauseBtn.textContent = paused ? 'Resume' : 'Pause'
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause')
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false')
  }

  function renderBoard(): void {
    boardEl.replaceChildren()
    for (let i = 0; i < state.board.cells.length; i++) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'cell'
      btn.dataset.index = String(i)
      btn.textContent = String(state.board.cells[i])
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
    targetDigit.textContent = String(t)
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

  function onTap(index: number): void {
    if (state.status !== 'playing') return
    const result = tapCell(state, index)
    switch (result.kind) {
      case 'miss':
        hint.textContent = 'Wrong digit — target cells restored & scrambled.'
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
        if (!result.newBest) hint.textContent = `+${result.points} — next digit!`
        renderBoard()
        renderHud()
        break
      case 'puzzle-done':
        noteNewBest(result.newBest)
        if (!result.newBest) {
          hint.textContent = `Puzzle clear! +${result.points}. Loading next…`
        }
        renderHud()
        window.setTimeout(() => {
          advanceToPuzzle(state, result.nextPuzzle)
          renderBoard()
          renderHud()
          hint.textContent = 'New puzzle — find the target digit.'
        }, 650)
        break
      default:
        break
    }
  }

  function enterPause(): void {
    if (!pauseGame(state)) return
    hint.textContent = 'Paused — board hidden.'
    renderHud()
  }

  function leavePause(): void {
    if (!resumeGame(state)) return
    lastTs = performance.now()
    hint.textContent = 'Resumed — keep finding.'
    renderHud()
  }

  function togglePause(): void {
    if (state.status === 'paused') leavePause()
    else if (state.status === 'playing') enterPause()
  }

  function doRestart(): void {
    restartCurrentPuzzle(state)
    lastTs = performance.now()
    newBestUntil = 0
    hint.textContent = 'Puzzle restarted.'
    renderBoard()
    renderHud()
  }

  boardEl.addEventListener('click', (e) => {
    if (state.status !== 'playing') return
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cell')
    if (!el || el.classList.contains('cleared')) return
    const index = Number(el.dataset.index)
    if (!Number.isFinite(index)) return
    onTap(index)
  })

  newBtn.addEventListener('click', () => {
    newRandomPuzzle(state)
    lastTs = performance.now()
    newBestUntil = 0
    hint.textContent = 'Fresh puzzle loaded.'
    renderBoard()
    renderHud()
  })

  pauseBtn.addEventListener('click', () => {
    togglePause()
  })

  resumeBtn.addEventListener('click', () => {
    leavePause()
  })

  restartBtn.addEventListener('click', () => {
    doRestart()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return
    if ((e.target as HTMLElement | null)?.isContentEditable) return
    e.preventDefault()
    togglePause()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      enterPause()
    }
  })

  function tick(ts: number): void {
    const dt = Math.min(0.1, (ts - lastTs) / 1000)
    lastTs = ts
    if (state.status === 'playing') {
      state.timeLeft -= dt
      if (state.timeLeft <= 0) {
        state.timeLeft = 0
        onTimerExpired(state)
        hint.textContent = 'Time up — find that digit again.'
        renderBoard()
      }
      renderHud()
    } else if (state.status === 'paused') {
      // Keep "New best!" pill in sync while frozen.
      if (newBestUntil > 0) renderHud()
    }
    raf = requestAnimationFrame(tick)
  }

  renderBoard()
  renderHud()
  raf = requestAnimationFrame(tick)

  // Keep raf id referenced for possible future teardown.
  void raf
}
