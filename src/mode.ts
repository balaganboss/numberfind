export type GameMode = 'number' | 'color' | 'shape'

export function readModeFromUrl(): GameMode | null {
  const raw = new URLSearchParams(window.location.search).get('mode')
  if (raw === 'color' || raw === 'colour') return 'color'
  if (raw === 'shape' || raw === 'shapes') return 'shape'
  if (raw === 'number' || raw === 'digit') return 'number'
  return null
}

export function writeModeToUrl(mode: GameMode): void {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', mode)
  history.replaceState(null, '', url.toString())
}

export function modeBrand(mode: GameMode): string {
  switch (mode) {
    case 'color':
      return 'ColorFind'
    case 'shape':
      return 'ShapeFind'
    default:
      return 'NumberFind'
  }
}
