import { useEffect, useRef, useState } from 'react'

import { useApp } from '../store/appContext'
import { Icon } from './ui'

export function AccountMenu() {
  const {
    eventId,
    user,
    signedIn,
    signIn,
    signOutApp,
    loadedCount,
    catalogTotal,
    catalogStatus,
    refreshCatalog,
    events,
    refreshEvents,
  } = useApp()

  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (pointerEvent: MouseEvent) => {
      if (!root.current?.contains(pointerEvent.target as Node)) setOpen(false)
    }
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const who = user?.email ?? user?.username ?? 'Signed in'

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={signIn}
        title="Optional — only events that require an attendee force it"
        className="inline-flex items-center gap-1.5 rounded-xl bg-surface-1/50 px-2.5 py-2 text-xs text-fg-muted ring-1 ring-line/70 backdrop-blur-sm transition hover:bg-surface-1 hover:text-fg-strong"
      >
        <Icon name="user" className="size-3.5" />
        <span className="hidden sm:inline">Sign in</span>
      </button>
    )
  }

  const inEvent = Boolean(eventId)

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title={who}
        className="flex items-center gap-1 rounded-xl p-0.5 transition hover:bg-surface-1/70"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-plan-favorite to-plan-personal text-[11px] font-bold text-accent-ink">
          {who.charAt(0).toUpperCase()}
        </span>
        <Icon name="chevronDown" className="size-3 text-fg-faint" />
      </button>

      {open ? (
        <div
          role="menu"
          className="panel animate-rise absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl shadow-2xl"
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-xs font-semibold text-fg">{who}</p>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              {inEvent
                ? loadedCount > 0
                  ? catalogStatus === 'loading' && catalogTotal > 0
                    ? `${loadedCount.toLocaleString()} of ${catalogTotal.toLocaleString()} sessions loaded`
                    : `${loadedCount.toLocaleString()} sessions loaded`
                  : 'Catalog not loaded'
                : `${events.length.toLocaleString()} events`}
            </p>
          </div>

          <MenuItem
            icon="refresh"
            label={inEvent ? 'Refresh catalog' : 'Refresh events'}
            onClick={() => {
              if (inEvent) refreshCatalog()
              else refreshEvents()
              setOpen(false)
            }}
          />

          <MenuItem
            icon="signOut"
            label="Sign out"
            hint="Ends your AWS session too, so you'll be asked to sign in again"
            onClick={() => {
              setOpen(false)
              signOutApp()
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: 'refresh' | 'signOut'
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-surface-2"
    >
      <Icon name={icon} className="mt-0.5 size-3.5 text-fg-muted" />
      <span>
        <span className="block text-xs font-medium text-fg">{label}</span>
        {hint ? <span className="block text-[11px] text-fg-subtle">{hint}</span> : null}
      </span>
    </button>
  )
}
