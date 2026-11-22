/** Number-robot mascot — inline SVG + lightweight mood API. */

export type MascotMood =
  | 'idle'
  | 'happy'
  | 'oops'
  | 'cheer'
  | 'search'
  | 'celebrate'

export type CelebrateLine =
  | 'New best!'
  | 'Nice finding!'
  | 'Keep practicing!'
  | "Time's up!"

const THEME = '#0b1020'

/** Friendly all-ages number robot (viewBox 0 0 120 140). */
export const MASCOT_SVG = `
<svg class="mascot-svg" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <filter id="mascot-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- legs -->
  <g class="mascot-leg mascot-leg-l">
    <rect x="42" y="108" width="10" height="16" rx="3" fill="#4a5568"/>
    <rect x="39" y="122" width="16" height="8" rx="3" fill="#f4f7fb"/>
    <rect x="39" y="126" width="6" height="4" rx="1" fill="#f5a623"/>
  </g>
  <g class="mascot-leg mascot-leg-r">
    <rect x="68" y="108" width="10" height="16" rx="3" fill="#4a5568"/>
    <rect x="65" y="122" width="16" height="8" rx="3" fill="#f4f7fb"/>
    <rect x="75" y="126" width="6" height="4" rx="1" fill="#f5a623"/>
  </g>

  <!-- body -->
  <g class="mascot-body">
    <rect x="34" y="62" width="52" height="48" rx="10" fill="#f4f7fb" stroke="#d7e0ef" stroke-width="1.5"/>
    <!-- chest digit grid: 1–9 + 0 -->
    <rect x="42" y="70" width="36" height="36" rx="4" fill="${THEME}"/>
    <g class="mascot-digits" fill="#f5a623" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="5.8" font-weight="700" text-anchor="middle">
      <text x="48" y="78.5">1</text><text x="60" y="78.5">2</text><text x="72" y="78.5">3</text>
      <text x="48" y="86.5">4</text><text x="60" y="86.5">5</text><text x="72" y="86.5">6</text>
      <text x="48" y="94.5">7</text><text x="60" y="94.5">8</text><text x="72" y="94.5">9</text>
      <text x="60" y="102.5">0</text>
    </g>
  </g>

  <!-- left arm (idle) -->
  <g class="mascot-arm mascot-arm-l">
    <rect x="22" y="70" width="14" height="8" rx="4" fill="#3dd6c6"/>
    <rect x="16" y="76" width="10" height="22" rx="4" fill="#4a5568"/>
    <circle cx="21" cy="100" r="5" fill="#f4f7fb" stroke="#d7e0ef" stroke-width="1"/>
  </g>

  <!-- right arm + magnifying glass -->
  <g class="mascot-arm mascot-arm-glass">
    <rect x="84" y="70" width="14" height="8" rx="4" fill="#3dd6c6"/>
    <g class="mascot-glass-pivot">
      <rect class="mascot-forearm" x="-4" y="0" width="8" height="20" rx="4" fill="#4a5568"/>
      <g class="mascot-glass">
        <line class="mascot-glass-handle" x1="6" y1="28" x2="16" y2="40" stroke="#f5a623" stroke-width="3.5" stroke-linecap="round"/>
        <g class="mascot-lens">
          <circle cx="0" cy="22" r="11" fill="rgba(155,231,255,0.18)" stroke="#f5a623" stroke-width="3"/>
          <circle cx="-3" cy="19" r="3" fill="rgba(255,255,255,0.35)"/>
        </g>
      </g>
    </g>
  </g>

  <!-- head -->
  <g class="mascot-head">
    <!-- antenna -->
    <line x1="60" y1="22" x2="60" y2="8" stroke="#4a5568" stroke-width="2.5" stroke-linecap="round"/>
    <circle class="mascot-antenna-bulb" cx="60" cy="5" r="4.5" fill="#f5a623" filter="url(#mascot-glow)"/>
    <!-- ears -->
    <rect x="26" y="32" width="10" height="16" rx="4" fill="#3dd6c6"/>
    <rect x="84" y="32" width="10" height="16" rx="4" fill="#3dd6c6"/>
    <!-- skull -->
    <rect x="34" y="20" width="52" height="44" rx="10" fill="#f4f7fb" stroke="#d7e0ef" stroke-width="1.5"/>
    <!-- screen face -->
    <rect class="mascot-screen" x="40" y="28" width="40" height="28" rx="6" fill="${THEME}"/>
    <!-- eyes: happy/idle -->
    <g class="mascot-eyes mascot-eyes-happy">
      <circle class="mascot-eye mascot-eye-l" cx="52" cy="40" r="4.2" fill="#9be7ff"/>
      <circle class="mascot-eye mascot-eye-r" cx="68" cy="40" r="4.2" fill="#9be7ff"/>
      <circle cx="53.2" cy="38.8" r="1.3" fill="#fff"/>
      <circle cx="69.2" cy="38.8" r="1.3" fill="#fff"/>
    </g>
    <!-- eyes: sad -->
    <g class="mascot-eyes mascot-eyes-sad">
      <path d="M47 38 q5 5 10 0" fill="none" stroke="#9be7ff" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M63 38 q5 5 10 0" fill="none" stroke="#9be7ff" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    <!-- eyes: curious (look around) -->
    <g class="mascot-eyes mascot-eyes-curious">
      <circle cx="52" cy="40" r="4.2" fill="#9be7ff"/>
      <circle cx="68" cy="40" r="4.2" fill="#9be7ff"/>
      <circle class="mascot-pupil mascot-pupil-l" cx="53.5" cy="40" r="1.5" fill="${THEME}"/>
      <circle class="mascot-pupil mascot-pupil-r" cx="69.5" cy="40" r="1.5" fill="${THEME}"/>
    </g>
    <!-- smile -->
    <path class="mascot-smile mascot-smile-happy" d="M50 48 q10 8 20 0" fill="none" stroke="#3dd6c6" stroke-width="2.4" stroke-linecap="round"/>
    <path class="mascot-smile mascot-smile-sad" d="M50 52 q10 -6 20 0" fill="none" stroke="#3dd6c6" stroke-width="2.4" stroke-linecap="round"/>
    <path class="mascot-smile mascot-smile-curious" d="M54 50 q6 3 12 0" fill="none" stroke="#3dd6c6" stroke-width="2.2" stroke-linecap="round"/>
  </g>

  <!-- thought bubble -->
  <g class="mascot-bubble">
    <circle cx="96" cy="18" r="2.2" fill="#9be7ff"/>
    <circle cx="102" cy="12" r="3.2" fill="#9be7ff"/>
    <rect x="96" y="0" width="22" height="14" rx="6" fill="#9be7ff"/>
    <text class="mascot-bubble-text" x="107" y="10" text-anchor="middle" fill="${THEME}" font-size="9" font-weight="800" font-family="ui-sans-serif, system-ui, sans-serif">?</text>
  </g>
</svg>
`.trim()

export function celebrateLineForRound(opts: {
  newBest: boolean
  roundScore: number
  totalMisses: number
  targetCount: number
}): CelebrateLine {
  if (opts.newBest) return 'New best!'
  const missRate = opts.targetCount > 0 ? opts.totalMisses / opts.targetCount : 0
  if (opts.roundScore >= 280 || missRate <= 0.4) return 'Nice finding!'
  return 'Keep practicing!'
}

export function mountMascot(host: HTMLElement): {
  root: HTMLElement
  setMood: (mood: MascotMood, opts?: { line?: string; holdMs?: number }) => void
  setPaused: (paused: boolean) => void
  setUrgentSearch: (on: boolean) => void
  setCelebrate: (on: boolean, line?: CelebrateLine) => void
  reset: () => void
} {
  host.innerHTML = `
    <div class="mascot" id="mascot" data-mood="idle" aria-hidden="true">
      <div class="mascot-figure">${MASCOT_SVG}</div>
      <p class="mascot-line" id="mascot-line" hidden></p>
    </div>
  `
  const root = host.querySelector<HTMLElement>('#mascot')!
  const lineEl = host.querySelector<HTMLElement>('#mascot-line')!
  const glassPivot = host.querySelector<SVGGElement>('.mascot-glass-pivot')
  let clearTimer = 0
  let reactionUntil = 0
  let urgentWanted = false
  let celebrateOn = false
  let paused = false

  function syncGlassPose(mood: MascotMood): void {
    if (!glassPivot) return
    // Set via attribute — more reliable on SVG <g> than CSS transform in Chromium.
    if (mood === 'search') {
      // Raise glass to the face screen so the robot peers through the lens.
      glassPivot.setAttribute('transform', 'translate(78 30) rotate(-72)')
    } else {
      glassPivot.setAttribute('transform', 'translate(98 84)')
    }
  }

  function applyMood(mood: MascotMood): void {
    root.dataset.mood = mood
    syncGlassPose(mood)
  }

  function refreshBaseMood(): void {
    if (paused) {
      root.classList.add('is-frozen')
      // Keep current pose frozen (including search); do not drop to idle.
      return
    }
    root.classList.remove('is-frozen')
    if (celebrateOn) {
      applyMood('celebrate')
      return
    }
    if (performance.now() < reactionUntil) return
    applyMood(urgentWanted ? 'search' : 'idle')
  }

  function setMood(mood: MascotMood, opts?: { line?: string; holdMs?: number }): void {
    if (celebrateOn && mood !== 'celebrate') return
    window.clearTimeout(clearTimer)
    applyMood(mood)
    const hold = opts?.holdMs ?? (mood === 'oops' ? 500 : mood === 'cheer' ? 700 : mood === 'happy' ? 420 : 0)
    if (opts?.line) {
      lineEl.hidden = false
      lineEl.textContent = opts.line
    } else if (mood !== 'celebrate') {
      lineEl.hidden = true
      lineEl.textContent = ''
    }
    if (hold > 0) {
      reactionUntil = performance.now() + hold
      clearTimer = window.setTimeout(() => {
        reactionUntil = 0
        refreshBaseMood()
      }, hold)
    } else {
      reactionUntil = 0
    }
  }

  function setPaused(next: boolean): void {
    paused = next
    refreshBaseMood()
  }

  function setUrgentSearch(on: boolean): void {
    urgentWanted = on
    if (celebrateOn || performance.now() < reactionUntil) return
    if (paused) {
      // Still update the pose while frozen so pause-in-search keeps the glass up.
      applyMood(on ? 'search' : 'idle')
      root.classList.add('is-frozen')
      return
    }
    refreshBaseMood()
  }

  function setCelebrate(on: boolean, line?: CelebrateLine): void {
    celebrateOn = on
    window.clearTimeout(clearTimer)
    reactionUntil = 0
    if (on) {
      applyMood('celebrate')
      lineEl.hidden = false
      lineEl.textContent = line ?? 'Nice finding!'
      root.classList.add('is-celebrate')
    } else {
      root.classList.remove('is-celebrate')
      lineEl.hidden = true
      lineEl.textContent = ''
      refreshBaseMood()
    }
  }

  function reset(): void {
    window.clearTimeout(clearTimer)
    reactionUntil = 0
    urgentWanted = false
    celebrateOn = false
    paused = false
    root.classList.remove('is-celebrate', 'is-frozen')
    lineEl.hidden = true
    lineEl.textContent = ''
    applyMood('idle')
  }

  // Initial idle glass pose.
  syncGlassPose('idle')

  return { root, setMood, setPaused, setUrgentSearch, setCelebrate, reset }
}
