import { GRID } from './board.ts'
import {
  advanceToPuzzle,
  createGame,
  currentTarget,
  newRandomPuzzle,
  onTimerExpired,
  remainingForTarget,
  tapCell,
  timerBudget,
  type GameState,
} from './game.ts'

export function mount(root: HTMLElement): void {
  let state: GameState = createGame()
  let lastTs = performance.now()
  let raf = 0

  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">NumberFind</div>
        <div class="meta">
          <span class="pill" id="puzzle-label"></span>
          <span class="pill" id="score-label"></span>
          <span class="pill" id="hs-label"></span>
        </div>
      </header>

      <section class="target-panel">
        <div class="target-row">
          <span class="target-label">Find</span>
          <span class="target-digit" id="target-digit">0</span>
          <span class="target-left" id="target-left"></span>
        </div>
        <div class="timer-track" aria-hidden="true">
          <div class="timer-fill" id="timer-fill"></div>
        </div>
        <div class="timer-text" id="timer-text">45.0s</div>
      </section>

      <div class="board" id="board" role="grid" aria-label="Number board"></div>

      <footer class="actions">
        <button type="button" class="btn" id="new-puzzle">New Puzzle</button>
      </footer>
      <p class="hint" id="hint">Tap every matching digit before time runs out.</p>
    </div>
  `

  const boardEl = root.querySelector<HTMLElement>('#board')!
  const targetDigit = root.querySelector<HTMLElement>('#target-digit')!
  const targetLeft = root.querySelector<HTMLElement>('#target-left')!
  const timerFill = root.querySelector<HTMLElement>('#timer-fill')!
  const timerText = root.querySelector<HTMLElement>('#timer-text')!
  const puzzleLabel = root.querySelector<HTMLElement>('#puzzle-label')!
  const scoreLabel = root.querySelector<HTMLElement>('#score-label')!
  const hsLabel = root.querySelector<HTMLElement>('#hs-label')!
  const hint = root.querySelector<HTMLElement>('#hint')!
  const newBtn = root.querySelector<HTMLButtonElement>('#new-puzzle')!

  boardEl.style.setProperty('--grid', String(GRID))

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
    targetDigit.textContent = String(t)
    targetLeft.textContent = `${rem} left`
    puzzleLabel.textContent = `Puzzle ${state.puzzleId}`
    scoreLabel.textContent = `Score ${state.sessionScore}`
    hsLabel.textContent = `Best ${state.highScore}`
    const pct = Math.max(0, Math.min(1, state.timeLeft / budget))
    timerFill.style.transform = `scaleX(${pct})`
    timerFill.classList.toggle('urgent', state.timeLeft <= 8)
    timerText.textContent = `${state.timeLeft.toFixed(1)}s`
  }

  function flashMiss(): void {
    boardEl.classList.add('shake')
    window.setTimeout(() => boardEl.classList.remove('shake'), 280)
  }

  function onTap(index: number): void {
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
        hint.textContent = `+${result.points} — next digit!`
        renderBoard()
        renderHud()
        break
      case 'puzzle-done':
        hint.textContent = `Puzzle clear! +${result.points}. Loading next…`
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

  boardEl.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.cell')
    if (!el || el.classList.contains('cleared')) return
    const index = Number(el.dataset.index)
    if (!Number.isFinite(index)) return
    onTap(index)
  })

  newBtn.addEventListener('click', () => {
    newRandomPuzzle(state)
    hint.textContent = 'Fresh puzzle loaded.'
    renderBoard()
    renderHud()
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
    }
    raf = requestAnimationFrame(tick)
  }

  renderBoard()
  renderHud()
  raf = requestAnimationFrame(tick)

  // Keep raf id referenced for possible future teardown.
  void raf
}
