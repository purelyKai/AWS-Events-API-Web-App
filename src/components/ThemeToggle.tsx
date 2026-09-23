import { useCallback, useState } from 'react'

import { cx } from '../lib/styles'
import { applyTheme, readTheme, writeTheme } from '../lib/theme'
import type { Theme } from '../lib/theme'
import { Icon } from './ui'

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(readTheme)

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      writeTheme(next)
      applyTheme(next)
      return next
    })
  }, [])

  const dark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light' : 'Switch to dark'}
      onClick={toggle}
      className={cx(
        'grid place-items-center rounded-xl bg-surface-2/40 text-fg-subtle ring-1 ring-line/60',
        'transition hover:bg-surface-2/70 hover:text-fg',
        compact ? 'size-8' : 'size-9',
      )}
    >
      <Icon name={dark ? 'moon' : 'sun'} className="size-4" />
    </button>
  )
}
