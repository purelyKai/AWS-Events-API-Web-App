import { useEffect, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cx } from '../lib/styles'

export type IconName =
  | 'search'
  | 'star'
  | 'starFilled'
  | 'ticket'
  | 'check'
  | 'close'
  | 'calendar'
  | 'list'
  | 'chevronDown'
  | 'chevronRight'
  | 'arrowRight'
  | 'clock'
  | 'pin'
  | 'user'
  | 'users'
  | 'refresh'
  | 'filter'
  | 'trash'
  | 'plus'
  | 'spark'
  | 'signOut'
  | 'warning'
  | 'info'
  | 'grip'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'globe'
  | 'building'
  | 'mic'
  | 'layers'

const FILLED = new Set<IconName>(['starFilled', 'spark'])

const PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4.5 4.5" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.5 5.9.8-4.3 4.2 1.1 5.9L12 17.2l-5.3 2.8 1.1-5.9L3.5 9.9l5.9-.8L12 3.6Z" />,
  starFilled: <path d="m12 3.6 2.6 5.5 5.9.8-4.3 4.2 1.1 5.9L12 17.2l-5.3 2.8 1.1-5.9L3.5 9.9l5.9-.8L12 3.6Z" />,
  ticket: (
    <>
      <path d="M4 9.2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6Z" />
      <path d="M10 8.5v1.8M10 13.7v1.8" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5L20 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10.5h17M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r="1.15" />
      <circle cx="4.75" cy="12" r="1.15" />
      <circle cx="4.75" cy="17.5" r="1.15" />
    </>
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  arrowRight: <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s7-6.6 7-11.5a7 7 0 1 0-14 0c0 4.9 7 11.5 7 11.5Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.25" r="3.4" />
      <path d="M3.25 19.75a6.25 6.25 0 0 1 12.5 0" />
      <path d="M16 5.4a3.4 3.4 0 0 1 0 5.9M17.5 14.4a6.3 6.3 0 0 1 3.25 5.35" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 0 1-13.6 5.7M4 12a8 8 0 0 1 13.6-5.7" />
      <path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.3v6.1l-3.6 1.8v-7.9L4 5.5Z" />,
  trash: (
    <>
      <path d="M4 7h16M10 4.5h4M6.5 7l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  plus: <path d="M12 5.25v13.5M5.25 12h13.5" />,
  spark: (
    <>
      <path d="M12 2.8l1.85 5.35L19.2 10l-5.35 1.85L12 17.2l-1.85-5.35L4.8 10l5.35-1.85L12 2.8Z" />
      <path d="M18.6 15.4l.85 2.35 2.35.85-2.35.85-.85 2.35-.85-2.35-2.35-.85 2.35-.85.85-2.35Z" />
    </>
  ),
  signOut: (
    <>
      <path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5" />
      <path d="M10 8.5 6.5 12l3.5 3.5M6.5 12H15" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.2 2.9 19.2a1.2 1.2 0 0 0 1.05 1.8h16.1a1.2 1.2 0 0 0 1.05-1.8L12 4.2Z" />
      <path d="M12 10v4.3" />
      <circle cx="12" cy="17.4" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.2v5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  grip: <path d="M4 9.5h16M4 14.5h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20.3 14.4A8.6 8.6 0 0 1 9.6 3.7a8.6 8.6 0 1 0 10.7 10.7Z" />,
  monitor: (
    <>
      <rect x="2.8" y="4.5" width="18.4" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5S14.4 18.7 12 20.5c-2.4-1.8-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5Z" />
    </>
  ),
  building: (
    <>
      <path d="M4.5 20.5V5.2a1 1 0 0 1 .7-.95l7-2.1a1 1 0 0 1 1.3.95V20.5" />
      <path d="M13.5 9.5h4.8a1 1 0 0 1 1 1v10M2.8 20.5h18.4" />
      <path d="M7.6 8h2.8M7.6 12h2.8M7.6 16h2.8" />
    </>
  ),
  mic: (
    <>
      <rect x="9.25" y="2.75" width="5.5" height="10.5" rx="2.75" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.25M9 21.25h6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.4L12 11.8 3.5 7.4 12 3Z" />
      <path d="m3.5 12.2 8.5 4.4 8.5-4.4M3.5 16.8l8.5 4.4 8.5-4.4" />
    </>
  ),
}

export function Icon({
  name,
  className = 'size-4',
}: {
  name: IconName
  className?: string
}) {
  const filled = FILLED.has(name)
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx('shrink-0', className)}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const VARIANTS: Record<string, string> = {
  primary:
    'bg-accent text-accent-ink font-semibold hover:bg-accent-hover shadow-lg shadow-accent/20',
  secondary:
    'bg-surface-2 text-fg ring-1 ring-line hover:bg-surface-3 hover:ring-line-strong',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg-strong',
  danger:
    'bg-danger-soft text-danger ring-1 ring-danger-line hover:bg-danger-soft',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg transition',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

export function Badge({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        className ?? 'bg-surface-2 text-fg-muted ring-line',
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cx(
          'panel animate-rise relative flex w-full flex-col overflow-hidden rounded-2xl shadow-2xl',

          'max-h-[calc(100vh-2rem)]',
          width,
        )}
      >

        <header className="lit-bar flex shrink-0 items-center justify-between px-5 py-3.5">
          <h2 className="font-display relative z-10 text-sm font-semibold tracking-tight text-fg-strong">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative z-10 rounded-md p-1 text-fg-muted transition hover:bg-surface-2 hover:text-fg-strong"
          >
            <Icon name="close" />
          </button>
          <span aria-hidden="true" className="hero-rail z-20" />
        </header>
        <div className="work-floor min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-1 px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span> : null}
    </label>
  )
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: IconName
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-2xl bg-surface-2 p-3 text-fg-muted ring-1 ring-line">
        <Icon name={icon} className="size-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        {detail ? (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">
            {detail}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
