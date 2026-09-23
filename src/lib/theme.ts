export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'awsevents.theme'

export const DEFAULT_THEME: Theme = 'light'

export function readTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {}
  return DEFAULT_THEME
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {}
}

export function initTheme(): Theme {
  const theme = readTheme()
  applyTheme(theme)
  return theme
}
